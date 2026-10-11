import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  strategyArchiveSchema,
  strategyCreateSchema,
  strategyDecimalParameterSchema,
  strategyDefinitionSchema,
  strategyListQuerySchema,
  strategyParameterSchema,
  strategyTradeLinkCreateSchema,
  strategyUpdateSchema,
  strategyVersionResponseSchema,
  tradeCreateSchema,
  tradeResponseSchema,
} from '@journal/contracts';

const effectiveAt = '2026-10-11T12:00:00.123456+02:00';
const decimalParameter = {
  id: randomUUID(),
  name: 'RSI threshold',
  type: 'decimal',
  value: '30.000000000000000000000000000000000001',
  minimum: '30',
  maximum: '31',
};

describe('immutable strategy source contracts', () => {
  it('creates a complete first-class playbook without inventing financial rules', () => {
    const parsed = strategyCreateSchema.parse({
      definition: { name: 'RSI reversal' },
      effectiveAt,
    });
    expect(parsed.definition).toMatchObject({
      name: 'RSI reversal',
      status: 'draft',
      direction: 'both',
      riskRules: '',
      positionSizingRules: '',
      attachmentIds: [],
      checklist: [],
      setups: [],
      parameters: [],
    });
    expect(parsed.changeReason).toBe('Initial version');
    expect(parsed.effectiveAt).toBe(effectiveAt);
  });

  it('preserves all configured rules and typed values across JSON round trips', () => {
    const checklistId = randomUUID();
    const definition = strategyDefinitionSchema.parse({
      name: 'RSI reversal',
      status: 'active',
      description: 'A broker-independent playbook.',
      assetClasses: ['stock', 'crypto'],
      markets: ['US equities'],
      timeframes: ['15m', '1d'],
      direction: 'long',
      setupConditions: 'Price returns to support.',
      entryRules: 'Enter after a completed signal candle.',
      confirmationRules: 'Confirm volume.',
      invalidationRules: 'Support breaks.',
      stopLossMethodology: 'Below the signal low.',
      takeProfitMethodology: 'Next resistance.',
      riskRules: 'Use the separately configured account budget.',
      positionSizingRules: 'Use validated stop distance.',
      exitRules: 'Close on invalidation.',
      indicators: ['RSI'],
      attachmentIds: [randomUUID()],
      notes: 'レビュー: preserve narrative text.',
      tags: ['mean-reversion'],
      checklist: [{ id: checklistId, label: 'Signal candle completed', required: true }],
      setups: [
        {
          id: randomUUID(),
          name: 'Support bounce',
          conditions: 'At support',
          checklistItemIds: [checklistId],
        },
      ],
      parameters: [
        decimalParameter,
        { id: randomUUID(), name: 'Volume confirmation', type: 'boolean', value: true },
        { id: randomUUID(), name: 'Session note', type: 'text', value: 'Wait for open.' },
        {
          id: randomUUID(),
          name: 'Entry mode',
          type: 'enum',
          value: 'close',
          options: ['close', 'break'],
        },
      ],
      hypothesis: 'Exhaustion followed by mean reversion.',
      style: 'intraday',
      sessions: ['New York'],
      marketRegimeFilters: 'No strong downtrend.',
      scalingRules: 'No unplanned additions.',
      managementRules: 'Review on bar close.',
      reviewSchedule: 'Weekly',
      eligibleInstruments: [randomUUID()],
    });
    expect(strategyDefinitionSchema.parse(JSON.parse(JSON.stringify(definition)))).toEqual(
      definition,
    );
    expect(definition.parameters[0]).toMatchObject({
      value: decimalParameter.value,
      unit: null,
    });
  });

  it.each(['', ' ', 'x'.repeat(161)])('rejects invalid names %j', (name) => {
    expect(strategyDefinitionSchema.safeParse({ name }).success).toBe(false);
  });

  it('requires full snapshots, concurrency revision and a meaningful update reason', () => {
    const update = {
      definition: { name: 'RSI reversal v2', entryRules: 'Use RSI below 25.' },
      effectiveAt,
      expectedRevision: 1,
      changeReason: 'Tighten RSI entry threshold.',
    };
    expect(strategyUpdateSchema.parse(update).definition.entryRules).toBe('Use RSI below 25.');
    for (const altered of [
      { ...update, definition: { entryRules: 'Patch only' } },
      { ...update, expectedRevision: undefined },
      { ...update, expectedRevision: 0 },
      { ...update, changeReason: undefined },
      { ...update, changeReason: '   ' },
      { ...update, versionId: randomUUID() },
    ])
      expect(strategyUpdateSchema.safeParse(altered).success).toBe(false);
  });

  it.each(['actorId', 'workspaceId', 'definitionHash', 'version', 'currentVersionId'])(
    'rejects client ownership/history field %s',
    (field) => {
      expect(
        strategyCreateSchema.safeParse({
          definition: { name: 'RSI reversal' },
          effectiveAt,
          [field]: 'client-supplied',
        }).success,
      ).toBe(false);
    },
  );

  it('rejects unsupported enums, excessive narratives/collections and unknown nested rules', () => {
    for (const definition of [
      { name: 'A', status: 'deleted' },
      { name: 'A', direction: 'buy-only' },
      { name: 'A', description: 'x'.repeat(20_001) },
      { name: 'A', tags: Array.from({ length: 101 }, (_, index) => `tag-${index}`) },
      { name: 'A', stopLossPercent: 2 },
      { name: 'A', parameters: [{ ...decimalParameter, actorId: 'private' }] },
    ])
      expect(strategyDefinitionSchema.safeParse(definition).success).toBe(false);
  });

  it('keeps named setups distinct and references only checklist items in the same version', () => {
    const id = randomUUID();
    const definition = {
      name: 'A',
      checklist: [{ id, label: 'Confirmed' }],
      setups: [{ id: randomUUID(), name: 'Bounce', checklistItemIds: [id] }],
    };
    expect(strategyDefinitionSchema.parse(definition).checklist[0]?.required).toBe(false);
    expect(
      strategyDefinitionSchema.safeParse({
        ...definition,
        setups: [{ ...definition.setups[0], checklistItemIds: [randomUUID()] }],
      }).success,
    ).toBe(false);
    expect(
      strategyDefinitionSchema.safeParse({
        ...definition,
        setups: [{ ...definition.setups[0], checklistItemIds: [id, id] }],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate stable identities and duplicate reference collections', () => {
    const id = randomUUID();
    for (const fields of [
      {
        checklist: [
          { id, label: 'A' },
          { id, label: 'B' },
        ],
      },
      {
        setups: [
          { id, name: 'A' },
          { id, name: 'B' },
        ],
      },
      { parameters: [decimalParameter, decimalParameter] },
      { attachmentIds: [id, id] },
      { eligibleInstruments: [id, id] },
      { tags: ['same', 'same'] },
    ])
      expect(strategyDefinitionSchema.safeParse({ name: 'A', ...fields }).success).toBe(false);
  });

  it('canonicalizes snapshot UUID identities before duplicate checks and checklist references', () => {
    const id = 'c929f512-cb55-47ab-a52b-017862d976ba';
    const parsed = strategyDefinitionSchema.parse({
      name: 'A',
      attachmentIds: [id.toUpperCase()],
      checklist: [{ id: id.toUpperCase(), label: 'Confirmed' }],
      setups: [{ id: randomUUID(), name: 'Setup', checklistItemIds: [id] }],
    });
    expect(parsed.attachmentIds).toEqual([id]);
    expect(parsed.checklist[0]?.id).toBe(id);
    expect(
      strategyDefinitionSchema.safeParse({ name: 'A', attachmentIds: [id, id.toUpperCase()] })
        .success,
    ).toBe(false);
  });

  it('compares decimal parameter bounds exactly beyond binary floating-point precision', () => {
    expect(strategyDecimalParameterSchema.parse(decimalParameter).value).toBe(
      decimalParameter.value,
    );
    expect(
      strategyDecimalParameterSchema.safeParse({
        ...decimalParameter,
        maximum: '30.000000000000000000000000000000000000',
      }).success,
    ).toBe(false);
    expect(
      strategyDecimalParameterSchema.safeParse({ ...decimalParameter, minimum: '32' }).success,
    ).toBe(false);
    expect(
      strategyDecimalParameterSchema.parse({
        ...decimalParameter,
        value: '-0.000000000000000000000000000000000001',
        minimum: '-1',
        maximum: '0',
      }).value,
    ).toBe('-0.000000000000000000000000000000000001');
  });

  it.each([0.1, '1e-3', 'Infinity', 'not-a-number', '9'.repeat(43)])(
    'rejects ambiguous or overflowing numeric parameter %j without throwing validation internals',
    (value) => {
      expect(() =>
        strategyDecimalParameterSchema.safeParse({ ...decimalParameter, value }),
      ).not.toThrow();
      expect(strategyDecimalParameterSchema.safeParse({ ...decimalParameter, value }).success).toBe(
        false,
      );
    },
  );

  it('validates parameter types and requires enumerated values to belong to unique options', () => {
    const identity = { id: randomUUID(), name: 'Parameter' };
    for (const parameter of [
      { ...identity, type: 'boolean', value: 'true' },
      { ...identity, type: 'enum', value: 'absent', options: ['present'] },
      { ...identity, type: 'enum', value: 'same', options: ['same', 'same'] },
      { ...identity, type: 'text', value: 123 },
      { ...identity, type: 'computed', value: 'unknown' },
    ])
      expect(strategyParameterSchema.safeParse(parameter).success).toBe(false);
  });

  it('keeps trade selection optional but makes response classification explicit', () => {
    const base = { title: 'RSI bounce', classification: 'active-trading' };
    expect(tradeCreateSchema.parse(base)).toEqual(base);
    const versionId = randomUUID();
    expect(
      tradeCreateSchema.parse({ ...base, strategyVersionId: versionId }).strategyVersionId,
    ).toBe(versionId);
    const response = {
      ...base,
      id: randomUUID(),
      revision: 1,
      archivedAt: null,
      status: 'planned',
      closureReviewRequired: false,
      strategyVersionId: null,
      strategyId: null,
      strategyLinkTiming: null,
    };
    expect(tradeResponseSchema.parse(response).strategyVersionId).toBeNull();
    expect(
      tradeResponseSchema.safeParse({ ...response, strategyLinkTiming: 'original-risk' }).success,
    ).toBe(false);
  });

  it('requires an explicit version, existing trade revision and reason for retrospective links', () => {
    const link = {
      tradeId: randomUUID(),
      versionId: randomUUID(),
      expectedTradeRevision: 2,
      reason: 'Recorded after entry.',
    };
    expect(strategyTradeLinkCreateSchema.parse(link)).toEqual(link);
    expect(
      strategyTradeLinkCreateSchema.safeParse({ ...link, strategyId: randomUUID() }).success,
    ).toBe(false);
    expect(strategyTradeLinkCreateSchema.safeParse({ ...link, reason: '' }).success).toBe(false);
    expect(
      strategyArchiveSchema.safeParse({ expectedRevision: 1, reason: 'Retire playbook.' }).success,
    ).toBe(true);
    expect(strategyArchiveSchema.safeParse({ expectedRevision: 1 }).success).toBe(false);
  });

  it('requires workspace, author, effective time and hash on immutable history responses', () => {
    const version = {
      id: randomUUID(),
      workspaceId: randomUUID(),
      strategyId: randomUUID(),
      version: 1,
      definition: { name: 'RSI reversal v1', entryRules: 'RSI below 30.' },
      effectiveAt,
      definitionHash: 'a'.repeat(64),
      changeReason: 'Initial version',
      actorId: 'user-identity',
      createdAt: effectiveAt,
    };
    expect(strategyVersionResponseSchema.parse(version).definition.entryRules).toBe(
      'RSI below 30.',
    );
    expect(
      strategyVersionResponseSchema.safeParse({ ...version, definitionHash: 'a'.repeat(63) })
        .success,
    ).toBe(false);
    expect(
      strategyVersionResponseSchema.safeParse({ ...version, token: 'private-session' }).success,
    ).toBe(false);
  });

  it('parses bounded query strings without coercing booleans or accepting unknown ownership filters', () => {
    expect(strategyListQuerySchema.parse({})).toEqual({ limit: 25, includeArchived: false });
    expect(
      strategyListQuerySchema.parse({
        limit: '100',
        includeArchived: 'true',
        status: 'active',
        search: ' RSI ',
      }),
    ).toEqual({ limit: 100, includeArchived: true, status: 'active', search: 'RSI' });
    for (const query of [
      { limit: true },
      { limit: '101' },
      { limit: '-1' },
      { limit: '1e2' },
      { limit: '01' },
      { includeArchived: '1' },
      { includeArchived: true },
      { workspaceId: randomUUID() },
      { cursor: 'untrusted-cursor' },
    ])
      expect(strategyListQuerySchema.safeParse(query).success).toBe(false);
  });

  it('rejects offset-free or overprecision effective timestamps before persistence', () => {
    for (const invalid of ['2026-10-11T12:00:00', '2026-10-11T12:00:00.1234567Z'])
      expect(
        strategyCreateSchema.safeParse({ definition: { name: 'A' }, effectiveAt: invalid }).success,
      ).toBe(false);
  });

  it('bounds the complete normalized snapshot by UTF-8 bytes as well as individual fields', () => {
    const definition = strategyDefinitionSchema.parse({ name: 'A' });
    let remaining = 196_608 - new TextEncoder().encode(JSON.stringify(definition)).byteLength;
    for (const field of [
      'description',
      'setupConditions',
      'entryRules',
      'confirmationRules',
      'invalidationRules',
      'stopLossMethodology',
      'takeProfitMethodology',
      'riskRules',
      'positionSizingRules',
      'exitRules',
    ] as const) {
      const length = Math.min(20_000, remaining);
      definition[field] = 'x'.repeat(length);
      remaining -= length;
    }
    expect(remaining).toBe(0);
    expect(new TextEncoder().encode(JSON.stringify(definition)).byteLength).toBe(196_608);
    expect(strategyDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(strategyDefinitionSchema.safeParse({ ...definition, notes: 'é' }).success).toBe(false);
  });
});
