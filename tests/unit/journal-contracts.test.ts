import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { INVENTORY_CALCULATION_MANIFEST } from '@journal/domain';
import {
  JOURNAL_DOCUMENT_MAXIMUM_BYTES,
  journalCalculatedMetricSchema,
  journalCommitmentResponseSchema,
  journalCreateSchema,
  journalDocumentSchema,
  journalEntryResponseSchema,
  journalFinancialSnapshotSchema,
  journalInitialRiskSchema,
  journalListQuerySchema,
  journalPlanDefinitionSchema,
  journalPlansQuerySchema,
  journalPlanVersionResponseSchema,
  journalPublishPlanSchema,
  journalReviewDefinitionSchema,
  journalRevisionsQuerySchema,
  journalRevisionResponseSchema,
  journalRiskAdditionSchema,
  journalRiskAdditionsQuerySchema,
  journalRMultipleSchema,
  journalSaveSchema,
} from '@journal/contracts';

const instant = '2026-10-12T10:00:00.123456+02:00';
const stableId = 'c929f512-cb55-47ab-a52b-017862d976ba';
const risk = {
  amount: '25.000000000000000000000000000000000001',
  currencyId: randomUUID(),
  method: 'Stop distance × quantity',
};
const unavailableMetric = {
  status: 'unavailable',
  value: null,
  reasons: ['no_effective_fills'],
  unit: 'shares',
  currencyId: null,
  source: 'calculated-ledger',
};
const unavailableR = {
  ...unavailableMetric,
  unit: 'R',
  originalPlanId: null,
  definitionVersion: 'original-risk-r/1',
  financialSourceRevision: '0',
};

describe('trade journal source contracts', () => {
  it('creates a bare trading idea without inventing prices, risk or subjective judgments', () => {
    expect(
      journalCreateSchema.parse({ title: ' Support bounce ', classification: 'active-trading' }),
    ).toEqual({ title: 'Support bounce', classification: 'active-trading', legs: [] });
    expect(journalDocumentSchema.parse({})).toMatchObject({
      plan: {
        strategyVersionId: null,
        setupId: null,
        thesis: '',
        legs: [],
        initialRisk: null,
        attachmentIds: [],
      },
      review: {
        confidence: null,
        executionQuality: null,
        mistakes: [],
        emotions: [],
        ruleAssessments: [],
        attachments: [],
      },
    });
  });

  it('keeps every required objective plan and subjective review field in complete snapshots', () => {
    const strategyVersionId = randomUUID();
    const legId = randomUUID();
    const document = journalDocumentSchema.parse({
      plan: {
        strategyVersionId,
        setupId: randomUUID(),
        thesis: 'Exhaustion near support.',
        marketConditions: 'Range-bound',
        timeframe: '15m',
        legs: [
          {
            legId,
            plannedEntry: '100.123',
            plannedStop: '98',
            plannedTargets: ['105', '110'],
            plannedQuantity: '0.125',
            estimatedCosts: '0.50',
          },
        ],
        initialRisk: risk,
        attachmentIds: [randomUUID()],
      },
      review: {
        marketConditions: 'Volume expanded',
        mistakes: ['Late entry'],
        emotions: ['Calm'],
        confidence: 4,
        executionQuality: 'good',
        lessonsLearned: 'Wait for confirmation.',
        postTradeReview: 'Reviewed all fills.',
        customNotes: 'Keep this as literal <script>text</script>.',
        exitReason: 'Target reached.',
        customTags: ['breakout'],
        actualObservations: [
          {
            legId,
            actualStop: '98.25',
            reportedEntry: '100.125',
            reportedExit: '105.5',
            notes: 'Broker display rounded the price.',
          },
        ],
        ruleAssessments: [
          {
            checklistItemId: randomUUID(),
            outcome: 'unknown',
            evidence: 'No timestamped evidence.',
            source: 'manual',
          },
        ],
        attachments: ['before', 'during', 'after'].map((phase) => ({
          attachmentId: randomUUID(),
          phase,
        })),
      },
    });
    expect(journalDocumentSchema.parse(JSON.parse(JSON.stringify(document)))).toEqual(document);
    expect(document.plan.initialRisk?.amount).toBe(risk.amount);
    expect(document.review.customNotes).toContain('<script>text</script>');
    expect(document.review.ruleAssessments[0]?.outcome).toBe('unknown');
  });

  it('preserves raw decimal text and validates exact positive/nonnegative source values', () => {
    const parsed = journalPlanDefinitionSchema.parse({
      legs: [
        {
          legId: randomUUID(),
          plannedEntry: '0.000000000000000000000000000000000001',
          plannedStop: '1.0000',
          plannedTargets: ['9'.repeat(42)],
          plannedQuantity: '0.12500',
          estimatedCosts: '-0.0000',
        },
      ],
      initialRisk: risk,
    });
    expect(parsed.legs[0]).toMatchObject({
      plannedStop: '1.0000',
      plannedQuantity: '0.12500',
      estimatedCosts: '-0.0000',
    });
    expect(parsed.initialRisk?.amount).toBe(risk.amount);
    const longTrailingZero = `1.${'0'.repeat(500)}`;
    expect(journalInitialRiskSchema.parse({ ...risk, amount: longTrailingZero }).amount).toBe(
      longTrailingZero,
    );
  });

  it.each([
    0.125,
    '0',
    '-0',
    '-1',
    '1e-3',
    'NaN',
    'Infinity',
    '01',
    '.5',
    '9'.repeat(43),
    `0.${'0'.repeat(36)}1`,
    `1.${'0'.repeat(511)}`,
  ])('rejects invalid authoritative risk or price %j without number coercion', (value) => {
    expect(journalInitialRiskSchema.safeParse({ ...risk, amount: value }).success).toBe(false);
    expect(
      journalPlanDefinitionSchema.safeParse({ legs: [{ legId: stableId, plannedEntry: value }] })
        .success,
    ).toBe(false);
  });

  it('distinguishes missing planned prices from invalid zero prices and negative estimates', () => {
    expect(
      journalPlanDefinitionSchema.parse({ legs: [{ legId: stableId }] }).legs[0],
    ).toMatchObject({
      plannedEntry: null,
      plannedStop: null,
      plannedQuantity: null,
      estimatedCosts: null,
    });
    for (const field of ['plannedEntry', 'plannedStop', 'plannedQuantity'] as const)
      expect(
        journalPlanDefinitionSchema.safeParse({ legs: [{ legId: stableId, [field]: '0' }] })
          .success,
      ).toBe(false);
    expect(
      journalPlanDefinitionSchema.safeParse({
        legs: [{ legId: stableId, estimatedCosts: '-0.000000000000000000000000000000000001' }],
      }).success,
    ).toBe(false);
    expect(
      journalPlanDefinitionSchema.safeParse({ legs: [{ legId: stableId, estimatedCosts: '0' }] })
        .success,
    ).toBe(true);
  });

  it('normalizes stable UUID identities before duplicate and reference checks', () => {
    const upper = stableId.toUpperCase();
    const document = journalDocumentSchema.parse({
      plan: { strategyVersionId: upper, attachmentIds: [upper], legs: [{ legId: upper }] },
    });
    expect(document.plan.strategyVersionId).toBe(stableId);
    expect(document.plan.attachmentIds).toEqual([stableId]);
    expect(document.plan.legs[0]?.legId).toBe(stableId);
    for (const plan of [
      { attachmentIds: [stableId, upper] },
      { legs: [{ legId: stableId }, { legId: upper }] },
    ])
      expect(journalPlanDefinitionSchema.safeParse(plan).success).toBe(false);
    for (const review of [
      { actualObservations: [{ legId: stableId }, { legId: upper }] },
      {
        ruleAssessments: [stableId, upper].map((checklistItemId) => ({
          checklistItemId,
          outcome: 'unknown',
          source: 'manual',
        })),
      },
      {
        attachments: [stableId, upper].map((attachmentId, index) => ({
          attachmentId,
          phase: index ? 'after' : 'before',
        })),
      },
    ])
      expect(journalReviewDefinitionSchema.safeParse(review).success).toBe(false);
  });

  it('requires an explicit version for named setup references', () => {
    expect(journalPlanDefinitionSchema.safeParse({ setupId: stableId }).success).toBe(false);
    expect(
      journalPlanDefinitionSchema.safeParse({ strategyVersionId: randomUUID(), setupId: stableId })
        .success,
    ).toBe(true);
  });

  it.each(['workspaceId', 'actorId', 'revision', 'commitment', 'financial', 'rMultiple'])(
    'rejects client-supplied identity or calculated field %s',
    (field) => {
      expect(
        journalSaveSchema.safeParse({ expectedRevision: 0, document: {}, [field]: 'forged' })
          .success,
      ).toBe(false);
      expect(journalDocumentSchema.safeParse({ [field]: 'forged' }).success).toBe(false);
    },
  );

  it('rejects unknown nested fields and automatic claims about manually assessed rules', () => {
    for (const document of [
      { plan: { initialRisk: { ...risk, automatic: true } } },
      { plan: { legs: [{ legId: stableId, actualEntry: '123' }] } },
      { review: { actualEntry: '123', realizedPnl: '200' } },
      { review: { actualObservations: [{ legId: stableId, source: 'ledger' }] } },
      {
        review: {
          ruleAssessments: [{ checklistItemId: stableId, outcome: 'passed', source: 'automatic' }],
        },
      },
      {
        review: {
          attachments: [{ attachmentId: stableId, phase: 'before', verifiedCapturedAt: instant }],
        },
      },
    ])
      expect(journalDocumentSchema.safeParse(document).success).toBe(false);
  });

  it.each([0, 6, 1.5, '4', true])(
    'rejects confidence outside the explicit integer 1–5 scale: %j',
    (confidence) => {
      expect(journalReviewDefinitionSchema.safeParse({ confidence }).success).toBe(false);
    },
  );

  it('bounds labels, narratives, enumerations and collections independently', () => {
    for (const review of [
      { confidence: Number.NaN },
      { executionQuality: 'perfect' },
      { customNotes: 'x'.repeat(20_001) },
      { emotions: ['x'.repeat(161)] },
      { mistakes: [' '] },
      { customTags: ['same', ' same '] },
      { attachments: [{ attachmentId: stableId, phase: 'trade' }] },
      { emotions: Array.from({ length: 101 }, (_, index) => `emotion ${index}`) },
    ])
      expect(journalReviewDefinitionSchema.safeParse(review).success).toBe(false);
    expect(
      journalCreateSchema.safeParse({
        title: 'A',
        classification: 'investing',
        legs: Array.from({ length: 21 }, () => ({
          accountId: randomUUID(),
          instrumentVersionId: randomUUID(),
          direction: 'long',
          label: 'Leg',
        })),
      }).success,
    ).toBe(false);
  });

  it('bounds the complete normalized document by compact UTF-8 bytes including defaults', () => {
    const document = journalDocumentSchema.parse({});
    let remaining =
      JOURNAL_DOCUMENT_MAXIMUM_BYTES -
      new TextEncoder().encode(JSON.stringify(document)).byteLength;
    for (const field of ['thesis', 'marketConditions'] as const) {
      const length = Math.min(20_000, remaining);
      document.plan[field] = 'x'.repeat(length);
      remaining -= length;
    }
    for (const field of [
      'marketConditions',
      'lessonsLearned',
      'postTradeReview',
      'exitReason',
      'customNotes',
    ] as const) {
      const length = Math.min(20_000, remaining);
      document.review[field] = 'x'.repeat(length);
      remaining -= length;
    }
    expect(remaining).toBe(0);
    expect(new TextEncoder().encode(JSON.stringify(document)).byteLength).toBe(
      JOURNAL_DOCUMENT_MAXIMUM_BYTES,
    );
    expect(journalDocumentSchema.safeParse(document).success).toBe(true);
    document.review.customNotes += 'é';
    expect(journalDocumentSchema.safeParse(document).success).toBe(false);
    expect(
      journalDocumentSchema.safeParse({
        review: {
          marketConditions: 'é'.repeat(20_000),
          lessonsLearned: 'é'.repeat(20_000),
          postTradeReview: 'é'.repeat(20_000),
          customNotes: 'é'.repeat(20_000),
        },
      }).success,
    ).toBe(false);
  });

  it('requires optimistic revisions while permitting the first old-trade journal save at revision zero', () => {
    expect(journalSaveSchema.parse({ expectedRevision: 0, document: {} }).expectedRevision).toBe(0);
    for (const expectedRevision of [undefined, -1, 0.5, '0', 2_147_483_647])
      expect(journalSaveSchema.safeParse({ expectedRevision, document: {} }).success).toBe(false);
    expect(
      journalSaveSchema.safeParse({ expectedRevision: 2_147_483_646, document: {} }).success,
    ).toBe(true);
    expect(
      journalPublishPlanSchema.parse({
        expectedRevision: 0,
        expectedTradeRevision: 1,
        reason: ' Freeze original plan ',
      }).reason,
    ).toBe('Freeze original plan');
    expect(
      journalPublishPlanSchema.safeParse({ expectedRevision: 0, reason: 'Missing trade revision.' })
        .success,
    ).toBe(false);
  });

  it.each(['committedAt', 'financialSourceRevision', 'originalPlanId', 'timing', 'definition'])(
    'rejects caller backdating or replacing publication fact %s',
    (field) => {
      expect(
        journalPublishPlanSchema.safeParse({
          expectedRevision: 1,
          expectedTradeRevision: 1,
          reason: 'Freeze',
          [field]: instant,
        }).success,
      ).toBe(false);
    },
  );

  it('accepts risk supplements only as explicit positive, currency-qualified, explained commands', () => {
    expect(
      journalRiskAdditionSchema.parse({
        expectedRevision: 2,
        ...risk,
        reason: 'Separate scaling risk',
      }),
    ).toMatchObject({ methodNotes: '', reason: 'Separate scaling risk' });
    for (const fields of [
      { amount: '0' },
      { amount: '-1' },
      { currencyId: undefined },
      { method: ' ' },
      { reason: '' },
      { replaceOriginalRisk: true },
    ])
      expect(
        journalRiskAdditionSchema.safeParse({
          expectedRevision: 2,
          ...risk,
          reason: 'Separate risk',
          ...fields,
        }).success,
      ).toBe(false);
  });

  it('requires provenance and coherent available/unavailable metric states', () => {
    expect(journalCalculatedMetricSchema.parse(unavailableMetric).value).toBeNull();
    expect(
      journalCalculatedMetricSchema.parse({
        ...unavailableMetric,
        status: 'available',
        value: '0',
        reasons: [],
      }).value,
    ).toBe('0');
    for (const alteration of [
      { status: 'available', value: null },
      { status: 'unavailable', value: '0' },
      { status: 'unavailable', reasons: [] },
      { source: 'manual' },
      { value: 0 },
    ])
      expect(
        journalCalculatedMetricSchema.safeParse({ ...unavailableMetric, ...alteration }).success,
      ).toBe(false);
  });

  it('retains a price convention for the longest supported instrument quantity unit', () => {
    const unit = `price/${'x'.repeat(160)}`;
    expect(journalCalculatedMetricSchema.parse({ ...unavailableMetric, unit }).unit).toBe(unit);
    expect(
      journalCalculatedMetricSchema.safeParse({ ...unavailableMetric, unit: 'x'.repeat(201) })
        .success,
    ).toBe(false);
  });

  it('requires original risk provenance for an available R and versions every financial definition', () => {
    expect(journalRMultipleSchema.parse(unavailableR).value).toBeNull();
    const available = {
      ...unavailableR,
      status: 'available',
      value: '-0.5',
      reasons: [],
      originalPlanId: randomUUID(),
      currencyId: randomUUID(),
    };
    expect(journalRMultipleSchema.parse(available).value).toBe('-0.5');
    for (const alteration of [
      { originalPlanId: null },
      { currencyId: null },
      { definitionVersion: 'latest' },
      { financialSourceRevision: '01' },
    ])
      expect(journalRMultipleSchema.safeParse({ ...available, ...alteration }).success).toBe(false);
    expect(
      journalFinancialSnapshotSchema.parse({
        sourceRevision: '0',
        definitionVersion: 'trade-journal-financial/1',
        manifest: INVENTORY_CALCULATION_MANIFEST,
        legs: [],
        timeline: [],
        rMultiple: unavailableR,
      }).legs,
    ).toEqual([]);
    expect(
      journalFinancialSnapshotSchema.safeParse({
        sourceRevision: '0',
        definitionVersion: 'trade-journal-financial/2',
        manifest: INVENTORY_CALCULATION_MANIFEST,
        legs: [],
        timeline: [],
        rMultiple: unavailableR,
      }).success,
    ).toBe(false);
  });

  it('requires a complete calculation manifest on the journal financial snapshot', () => {
    const snapshot = {
      sourceRevision: '0',
      definitionVersion: 'trade-journal-financial/1',
      manifest: INVENTORY_CALCULATION_MANIFEST,
      legs: [],
      timeline: [],
      rMultiple: unavailableR,
    };
    expect(journalFinancialSnapshotSchema.parse(snapshot).manifest).toEqual(
      INVENTORY_CALCULATION_MANIFEST,
    );
    expect(
      journalFinancialSnapshotSchema.safeParse({ ...snapshot, manifest: undefined }).success,
    ).toBe(false);
    expect(
      journalFinancialSnapshotSchema.safeParse({
        ...snapshot,
        manifest: { kernelVersion: 'kernel-only' },
      }).success,
    ).toBe(false);
  });

  it('keeps immutable plan, commitment and journal revision responses server-authored and hashed', () => {
    const plan = {
      id: randomUUID(),
      tradeId: randomUUID(),
      version: 1,
      definition: {},
      definitionHash: 'a'.repeat(64),
      createdAt: instant,
      createdBy: 'user-1',
      changeReason: 'Original commitment',
    };
    expect(journalPlanVersionResponseSchema.parse(plan).definition.initialRisk).toBeNull();
    expect(
      journalPlanVersionResponseSchema.safeParse({ ...plan, definitionHash: 'z'.repeat(64) })
        .success,
    ).toBe(false);
    expect(
      journalCommitmentResponseSchema.parse({
        originalPlanId: plan.id,
        committedAt: instant,
        financialSourceRevision: '3',
        timing: 'retrospective',
        createdBy: 'user-1',
      }).timing,
    ).toBe('retrospective');
    const revision = {
      id: randomUUID(),
      tradeId: plan.tradeId,
      revision: 1,
      createdAt: instant,
      createdBy: 'user-1',
      changeReason: 'Journal save',
      document: {},
      documentHash: 'b'.repeat(64),
    };
    expect(journalRevisionResponseSchema.parse(revision).document.review.confidence).toBeNull();
    expect(journalRevisionResponseSchema.safeParse({ ...revision, revision: 0 }).success).toBe(
      false,
    );
    expect(
      journalEntryResponseSchema.parse({
        tradeId: plan.tradeId,
        revision: 0,
        document: {},
        updatedAt: null,
        updatedBy: null,
      }).revision,
    ).toBe(0);
  });

  it('requires offset-aware PostgreSQL-compatible timestamps on historical facts', () => {
    for (const committedAt of ['2026-10-12T10:00:00', '2026-10-12T10:00:00.1234567Z'])
      expect(
        journalCommitmentResponseSchema.safeParse({
          originalPlanId: stableId,
          committedAt,
          financialSourceRevision: '0',
          timing: 'pre-trade',
          createdBy: 'user-1',
        }).success,
      ).toBe(false);
  });

  it('validates bounded query strings without accepting ambiguous boolean/numeric coercions', () => {
    expect(journalListQuerySchema.parse({})).toEqual({ limit: 25, includeArchived: false });
    expect(
      journalListQuerySchema.parse({
        cursor: stableId.toUpperCase(),
        limit: '100',
        includeArchived: 'true',
        status: 'partially_closed',
        search: ' Support ',
      }),
    ).toEqual({
      cursor: stableId,
      limit: 100,
      includeArchived: true,
      status: 'partially_closed',
      search: 'Support',
    });
    for (const query of [
      { limit: 25 },
      { limit: '0' },
      { limit: '101' },
      { limit: '01' },
      { limit: '1e2' },
      { includeArchived: true },
      { includeArchived: '1' },
      { cursor: 'bad' },
      { search: ' ' },
      { workspaceId: stableId },
      { status: 'partially-closed' },
    ])
      expect(journalListQuerySchema.safeParse(query).success).toBe(false);
    for (const schema of [
      journalPlansQuerySchema,
      journalRevisionsQuerySchema,
      journalRiskAdditionsQuerySchema,
    ]) {
      expect(schema.parse({})).toEqual({ limit: 25 });
      expect(schema.parse({ limit: '1', cursor: stableId }).limit).toBe(1);
      expect(schema.safeParse({ includeArchived: 'true' }).success).toBe(false);
    }
  });
});
