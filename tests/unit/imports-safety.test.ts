import { describe, expect, it } from 'vitest';
import { validateDraft, importIdentity } from '../../packages/server/src/imports/normalize.js';
import type { CanonicalImportDraft } from '@journal/contracts';
import { importMappingSchema } from '@journal/contracts';
import {
  createImportServices,
  createImportTemplates,
  ImportAdapterRegistry,
  type AuthorizationContext,
} from '@journal/server';
import { assertImportJsonNesting, parseImportJson } from '../../packages/server/src/imports/csv.js';
import {
  canonicalCsvAdapter,
  genericCsvAdapter,
} from '../../packages/server/src/imports/adapters/registry.js';

const accountId = '00000000-0000-4000-8000-000000000001';
const instrumentVersionId = '00000000-0000-4000-8000-000000000002';
const base = {
  sourceKey: 'execution:BUY',
  groupKey: 'fill',
  sourceId: 'BUY',
  warnings: [],
  kind: 'execution' as const,
  payload: {
    instrumentVersionId,
    side: 'buy',
    quantity: '0.5',
    price: '10',
    economicAt: '2030-01-01T12:00:00Z',
    orderingKey: '1',
  },
};

describe('import financial completeness normalization', () => {
  it('defaults unspecified execution and opening-lot costs to unknown without overwriting explicit completeness', () => {
    const unknown = validateDraft(base, accountId);
    expect(unknown.payload.costsComplete).toBe(false);
    const explicit = validateDraft(
      { ...base, payload: { ...base.payload, costsComplete: true } },
      accountId,
    );
    expect(explicit.payload.costsComplete).toBe(true);
    expect(importIdentity(unknown)).not.toEqual(importIdentity(explicit));
    const opening: CanonicalImportDraft = {
      ...base,
      kind: 'opening_lot',
      payload: {
        instrumentVersionId,
        direction: 'long',
        quantity: '0.5',
        economicAt: '2030-01-01T12:00:00Z',
        orderingKey: '1',
        reason: 'Unknown acquisition costs',
      },
    };
    expect(validateDraft(opening, accountId).payload.costsComplete).toBe(false);
  });

  it('normalizes omitted and explicit unknown costs to the same duplicate fingerprint', () => {
    expect(importIdentity(validateDraft(base, accountId))).toEqual(
      importIdentity(
        validateDraft(
          {
            ...base,
            payload: { ...base.payload, costsComplete: false },
          },
          accountId,
        ),
      ),
    );
  });

  it('normalizes catalog precision and order prices/ratios before duplicate comparison', () => {
    const draft: CanonicalImportDraft = {
      ...base,
      kind: 'order',
      payload: {
        kind: 'single',
        economicAt: '2030-01-01T12:00:00Z',
        legs: [{ instrumentVersionId, side: 'buy', ratio: '01.000' }],
        instruction: {
          status: 'recorded',
          quantity: '0.500',
          orderType: 'stop_limit',
          limitPrice: '001.100',
          stopPrice: '0.900',
          timeInForce: 'day',
        },
      },
    };
    const normalized = validateDraft(draft, accountId);
    expect(normalized.payload).toMatchObject({
      legs: [{ ratio: '1' }],
      instruction: { quantity: '0.5', limitPrice: '1.1', stopPrice: '0.9' },
    });
    expect(importIdentity(normalized)).toEqual(
      importIdentity(
        validateDraft(
          {
            ...draft,
            payload: {
              ...draft.payload,
              legs: [{ instrumentVersionId, side: 'buy', ratio: '1' }],
              instruction: {
                status: 'recorded',
                quantity: '0.5',
                orderType: 'stop_limit',
                limitPrice: '1.1',
                stopPrice: '0.9',
                timeInForce: 'day',
              },
            },
          },
          accountId,
        ),
      ),
    );
    const instrument: CanonicalImportDraft = {
      ...base,
      kind: 'instrument',
      payload: {
        name: 'Precision instrument',
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: 'precision-instrument',
        quantityUnit: 'share',
        quoteCurrencyId: instrumentVersionId,
        settlementCurrencyId: instrumentVersionId,
        multiplier: '01.00',
        quantityIncrement: '0.00100',
        priceIncrement: '0.0100',
        capability: 'native-linear',
        metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
        effectiveAt: '2030-01-01T00:00:00Z',
      },
    };
    expect(validateDraft(instrument, accountId).payload).toMatchObject({
      multiplier: '1',
      quantityIncrement: '0.001',
      priceIncrement: '0.01',
    });
  });

  it('memoizes repeated dependency DAGs instead of expanding a financial intent tree exponentially', () => {
    class CountedDependencies extends Map<string, CanonicalImportDraft> {
      reads = 0;
      override get(key: string) {
        this.reads++;
        return super.get(key);
      }
    }
    const dependencies = new CountedDependencies();
    const fanout = 32;
    const layers = 6;
    for (let index = 0; index < layers; index++) {
      const key = `dependency-${index}`;
      dependencies.set(key, {
        ...base,
        sourceKey: key,
        sourceId: `stable-${index}`,
        kind: 'instrument',
        payload:
          index === 0
            ? { name: 'Leaf economic intent' }
            : {
                references: Array.from({ length: fanout }, () => ({
                  $row: `dependency-${index - 1}`,
                  path: 'versionId',
                })),
              },
      });
    }
    const draft: CanonicalImportDraft = {
      ...base,
      payload: {
        references: Array.from({ length: fanout }, () => ({
          $row: `dependency-${layers - 1}`,
          path: 'versionId',
        })),
      },
    };
    const memo = new Map<string, string>();
    const result = importIdentity(draft, dependencies, memo);
    expect(result.payloadHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(memo.size).toBe(layers);
    expect(dependencies.reads).toBeLessThanOrEqual(fanout * layers);
    const readsBeforeRetry = dependencies.reads;
    expect(importIdentity(draft, dependencies, memo)).toEqual(result);
    expect(dependencies.reads - readsBeforeRetry).toBe(fanout);
  });

  it('rejects oversized UTF-8 mapping snapshots before opening a database transaction', async () => {
    let databaseCalls = 0;
    const platform = {
      withWorkspaceContext: async () => {
        databaseCalls++;
        throw new Error('Unexpected database access');
      },
    };
    const context = {
      actorId: 'unit-owner',
      workspaceId: accountId,
      role: 'owner',
      requiredRole: 'editor',
      requestId: 'unit-import-boundary',
    } as AuthorizationContext;
    const mapping = importMappingSchema.parse({
      kind: 'cash_movement',
      fields: [{ target: 'amount', constant: 'é'.repeat(32768) }],
    });
    await expect(
      createImportServices(platform).stage(
        context,
        {
          accountId,
          namespace: 'example',
          filename: 'statement.csv',
          content: 'ID\nA',
          mapping,
        },
        instrumentVersionId,
      ),
    ).rejects.toMatchObject({ status: 422, detail: 'Mapping exceeds 64 KiB.' });
    expect(databaseCalls).toBe(0);
  });

  it('reports unavailable template adapters as a safe validation failure before persistence', async () => {
    let databaseCalls = 0;
    const platform = {
      withWorkspaceContext: async () => {
        databaseCalls++;
        throw new Error('Unexpected database access');
      },
    };
    const context = {
      actorId: 'unit-owner',
      workspaceId: accountId,
      role: 'owner',
      requiredRole: 'editor',
      requestId: 'unit-import-boundary',
    } as AuthorizationContext;
    const mapping = importMappingSchema.parse({
      adapterId: 'unknown-broker-adapter',
      kind: 'cash_movement',
      fields: [],
    });
    await expect(
      createImportTemplates(platform, new ImportAdapterRegistry()).save(
        context,
        {
          name: 'Unknown broker template',
          mapping,
        },
        instrumentVersionId,
      ),
    ).rejects.toMatchObject({ status: 422, code: 'INVALID_FINANCIAL_INPUT' });
    expect(databaseCalls).toBe(0);
  });
});

describe('untrusted CSV embedded JSON', () => {
  const quoted = (text: string) => `"${text.replaceAll('"', '""')}"`;
  const nested = (levels: number) => '{"x":'.repeat(levels) + '0' + '}'.repeat(levels);

  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects raw own %s keys before schema cloning, including objects inside arrays',
    (key) => {
      const marker = 'phase13_import_polluted';
      expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
      const raw = `{"${key}":{"${marker}":true}}`;
      expect(Object.hasOwn(JSON.parse(raw), key)).toBe(true);
      const genericMapping = importMappingSchema.parse({
        kind: 'instrument',
        fields: [{ target: 'metadata', column: 'Metadata', transform: 'json' }],
      });
      const canonicalMapping = importMappingSchema.parse({
        adapterId: 'canonical-csv',
        kind: 'instrument',
        fields: [],
      });
      for (const hostile of [raw, `{"evidence":[${raw}]}`]) {
        const [generic] = genericCsvAdapter.parse(`Metadata\n${quoted(hostile)}`, genericMapping);
        expect(generic?.errors).toContainEqual({
          code: 'INVALID_FIELD',
          field: 'metadata',
          message: 'Reserved field in import payload.',
        });
        expect(generic?.raw.Metadata).toBe(hostile);
        const [canonical] = canonicalCsvAdapter.parse(
          `Kind,Payload\ninstrument,${quoted(hostile)}`,
          canonicalMapping,
        );
        expect(canonical?.draft).toBeNull();
        expect(canonical?.errors[0]?.code).toBe('INVALID_CANONICAL_CSV');
        expect(canonical?.raw.Payload).toBe(hostile);
        expect(Object.hasOwn(Object.prototype, marker)).toBe(false);
      }
    },
  );

  it('retains reserved-looking text values and ordinary metadata without executing or rewriting them', () => {
    const payload = '{"name":"constructor","evidence":["__proto__","prototype"]}';
    expect(parseImportJson(payload)).toEqual({
      name: 'constructor',
      evidence: ['__proto__', 'prototype'],
    });
  });

  it('rejects deeply nested generic JSON as a row error before recursive schema validation', () => {
    // Fits inside the field-byte bound, but previously exhausted Zod's call stack.
    const hostile = nested(2_000);
    const mapping = importMappingSchema.parse({
      kind: 'instrument',
      fields: [{ target: 'metadata', column: 'Metadata', transform: 'json' }],
    });
    const rows = genericCsvAdapter.parse(
      `Metadata\n${quoted(hostile)}\n${quoted('{"priceConvention":"unit-price"}')}`,
      mapping,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.errors).toContainEqual({
      code: 'INVALID_FIELD',
      field: 'metadata',
      message: 'Import payload nesting exceeds twelve levels.',
    });
    expect(rows[0]?.raw.Metadata).toBe(hostile);
    expect(rows[1]?.errors).toEqual([]);
    expect(rows[1]?.draft?.payload).toEqual({ metadata: { priceConvention: 'unit-price' } });
  });

  it('rejects deeply nested canonical JSON without throwing or discarding accepted source text', () => {
    const hostile = nested(2_000);
    const mapping = importMappingSchema.parse({
      adapterId: 'canonical-csv',
      kind: 'instrument',
      fields: [],
    });
    const rows = canonicalCsvAdapter.parse(
      `Kind,Payload\ninstrument,${quoted(hostile)}\ninstrument,${quoted('{"name":"Safe"}')}`,
      mapping,
    );
    expect(rows[0]?.draft).toBeNull();
    expect(rows[0]?.errors[0]?.code).toBe('INVALID_CANONICAL_CSV');
    expect(rows[0]?.raw.Payload).toBe(hostile);
    expect(rows[1]?.errors).toEqual([]);
    expect(rows[1]?.draft?.payload).toEqual({ name: 'Safe' });
  });

  it('enforces the existing twelve-level limit for objects, arrays and assembled mapping targets', () => {
    expect(parseImportJson(nested(12))).toEqual(JSON.parse(nested(12)));
    expect(() => parseImportJson(nested(13))).toThrow(/twelve levels/u);
    expect(() =>
      assertImportJsonNesting(JSON.parse('['.repeat(13) + '0' + ']'.repeat(13))),
    ).toThrow(/twelve levels/u);
    const mapping = importMappingSchema.parse({
      kind: 'instrument',
      fields: [{ target: Array.from({ length: 13 }, () => 'x').join('.'), column: 'Value' }],
    });
    const [row] = genericCsvAdapter.parse('Value\nsafe scalar', mapping);
    expect(row?.draft).toBeNull();
    expect(row?.errors).toContainEqual({
      code: 'INVALID_CANONICAL_ROW',
      message: 'Import payload nesting exceeds twelve levels.',
    });
  });
});

describe('raw import mapping constants', () => {
  it.each(['__proto__', 'constructor', 'prototype'])(
    'rejects own %s keys before constant-schema cloning in contracts, staging and saved templates',
    async (key) => {
      const withWorkspaceContext = async () => {
        throw new Error('Unvalidated mapping must not open a database transaction');
      };
      const platform = { withWorkspaceContext };
      const context = {
        actorId: 'unit-owner',
        workspaceId: accountId,
        role: 'owner',
        requiredRole: 'editor',
        requestId: 'raw-constant-boundary',
      } as AuthorizationContext;
      for (const raw of [
        JSON.parse(`{"${key}":{"phase13_import_polluted":true}}`),
        JSON.parse(`{"evidence":[{"${key}":{"phase13_import_polluted":true}}]}`),
      ]) {
        const mapping = {
          kind: 'instrument',
          fields: [{ target: 'metadata', constant: raw }],
        };
        const parsed = importMappingSchema.safeParse(mapping);
        expect(parsed.success).toBe(false);
        if (!parsed.success)
          expect(parsed.error.issues).toContainEqual(
            expect.objectContaining({
              path: ['fields', 0, 'constant'],
              message: 'Reserved field in import payload.',
            }),
          );
        await expect(
          createImportServices(platform).stage(
            context,
            {
              accountId,
              namespace: 'example',
              filename: 'statement.csv',
              content: 'ID\nA',
              mapping,
            },
            instrumentVersionId,
          ),
        ).rejects.toMatchObject({ name: 'ZodError' });
        await expect(
          createImportTemplates(platform, new ImportAdapterRegistry()).save(
            context,
            { name: 'Hostile constant', mapping },
            instrumentVersionId,
          ),
        ).rejects.toMatchObject({ name: 'ZodError' });
        expect(Object.hasOwn(Object.prototype, 'phase13_import_polluted')).toBe(false);
      }
    },
  );

  it('inspects constants rather than imposing the payload-depth limit on the whole mapping wrapper', () => {
    const constant = JSON.parse('{"x":'.repeat(11) + '"__proto__"' + '}'.repeat(11));
    const mapping = importMappingSchema.parse({
      kind: 'instrument',
      fields: [{ target: 'metadata', constant }],
    });
    expect(mapping.fields[0]?.constant).toEqual(constant);
    const [row] = genericCsvAdapter.parse('ID\nA', mapping);
    expect(row?.errors).toEqual([]);
    expect(row?.draft?.payload.metadata).toEqual(constant);
    expect(
      importMappingSchema.safeParse({
        kind: 'instrument',
        fields: [
          { target: 'metadata', constant: JSON.parse('{"x":'.repeat(13) + '0' + '}'.repeat(13)) },
        ],
      }).success,
    ).toBe(false);
  });
});
