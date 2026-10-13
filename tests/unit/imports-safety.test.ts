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
