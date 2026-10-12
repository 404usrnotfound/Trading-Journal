import { describe, expect, it } from 'vitest';
import {
  availableJournalMetric,
  INVENTORY_CALCULATION_MANIFEST,
  journalWeightedPrice,
  originalRiskR,
  replayInventory,
  unavailableJournalMetric,
  type InventoryFill,
  type OriginalRiskRInput,
} from '../../packages/domain/src/index.js';
import { journalRiskCurrencyResult } from '../../packages/server/src/journal/financial.js';

function rInput(overrides: Partial<OriginalRiskRInput> = {}): OriginalRiskRInput {
  return {
    originalRisk: { originalPlanId: 'original-plan', amount: '20', currencyId: 'USD' },
    commitment: { timing: 'pre-trade', committedAtMicros: '1767268800000001' },
    earliestExecutionMicros: '1767268800000002',
    completed: true,
    closureReviewRequired: false,
    legResults: [availableJournalMetric('39', 'money', 'USD')],
    coverageReasons: [],
    financialSourceRevision: '42',
    ...overrides,
  };
}

describe('journal actual fill prices use precise lifetime quantities and distinct units', () => {
  it('weights fractional scale-ins and keeps fully closed entry prices available', () => {
    expect(
      journalWeightedPrice(
        [
          { quantity: '1.25', price: '80', compatible: true },
          { quantity: '0.75', price: '120', compatible: true },
        ],
        'price/share',
        'USD',
      ),
    ).toEqual(availableJournalMetric('95', 'price/share', 'USD'));
  });
  it('quantizes once at the named derived boundary, never through binary floating point', () => {
    expect(
      journalWeightedPrice(
        [
          { quantity: '0.1', price: '0.2', compatible: true },
          { quantity: '0.2', price: '0.3', compatible: true },
        ],
        'price/token',
        'USD',
      ).value,
    ).toBe('0.266666666666666666666666666666666667');
    expect(
      journalWeightedPrice(
        [
          { quantity: '1', price: '9007199254740993.01', compatible: true },
          { quantity: '1', price: '9007199254740993.03', compatible: true },
        ],
        'price/share',
        'USD',
      ).value,
    ).toBe('9007199254740993.02');
  });
  it.each([
    [[], 'no_effective_fills'],
    [[{ quantity: '1', price: null, compatible: true }], 'missing_execution_price'],
    [[{ quantity: '1', price: '10', compatible: false }], 'incompatible_price_units'],
    [[{ quantity: '0', price: '10', compatible: true }], 'invalid_allocated_quantity'],
    [[{ quantity: '-1', price: '10', compatible: true }], 'invalid_allocated_quantity'],
  ] as const)('preserves explained absence for %s', (fills, reason) => {
    expect(journalWeightedPrice(fills, 'price/share', 'USD')).toMatchObject({
      status: 'unavailable',
      value: null,
      reasons: [reason],
      currencyId: 'USD',
      source: 'calculated-ledger',
    });
  });
});

describe('historical R uses only original genuinely pre-execution committed risk', () => {
  it('keeps the immutable denominator and aggregates only compatible fee-net results', () => {
    expect(
      originalRiskR(
        rInput({
          legResults: [
            availableJournalMetric('39', 'money', 'USD'),
            availableJournalMetric('-9', 'money', 'USD'),
          ],
        }),
      ),
    ).toMatchObject({
      status: 'available',
      value: '1.5',
      unit: 'R',
      currencyId: 'USD',
      originalPlanId: 'original-plan',
      definitionVersion: 'original-risk-r/1',
      financialSourceRevision: '42',
      reasons: [],
    });
  });
  it.each([
    ['0', '0'],
    ['-10', '-0.5'],
    ['20', '1'],
  ])('calculates a genuine %s result as %sR', (pnl, expected) => {
    expect(
      originalRiskR(rInput({ legResults: [availableJournalMetric(pnl, 'money', 'USD')] })).value,
    ).toBe(expected);
  });
  it.each([
    [{ originalRisk: null }, 'missing_original_risk'],
    [{ commitment: null }, 'missing_original_commitment'],
    [
      { commitment: { timing: 'retrospective', committedAtMicros: '1767268800000001' } },
      'retrospective_original_plan',
    ],
    [{ earliestExecutionMicros: null }, 'no_effective_fills'],
    [{ earliestExecutionMicros: '1767268800000001' }, 'execution_not_after_original_commitment'],
    [{ earliestExecutionMicros: '1767268800000000' }, 'execution_not_after_original_commitment'],
    [{ earliestExecutionMicros: 'unknown' }, 'ambiguous_commitment_chronology'],
    [{ completed: false }, 'campaign_not_completed'],
    [{ closureReviewRequired: true }, 'closure_review_required'],
    [{ legResults: [] }, 'missing_campaign_population'],
    [{ legResults: [availableJournalMetric('39', 'money', 'EUR')] }, 'incompatible_risk_currency'],
    [{ legResults: [unavailableJournalMetric(['missing_fees'], 'money', 'USD')] }, 'missing_fees'],
    [{ coverageReasons: ['unassigned_campaign_costs'] }, 'unassigned_campaign_costs'],
    [
      { originalRisk: { originalPlanId: 'plan', amount: '0', currencyId: 'USD' } },
      'invalid_original_risk',
    ],
    [
      { originalRisk: { originalPlanId: 'plan', amount: '-1', currencyId: 'USD' } },
      'invalid_original_risk',
    ],
    [
      { originalRisk: { originalPlanId: 'plan', amount: 'NaN', currencyId: 'USD' } },
      'invalid_original_risk',
    ],
  ] satisfies [Partial<OriginalRiskRInput>, string][])(
    'never invents R when %s',
    (override, reason) => {
      const result = originalRiskR(rInput(override));
      expect(result.status).toBe('unavailable');
      expect(result.value).toBeNull();
      expect(result.reasons).toContain(reason);
    },
  );
  it('rechecks later backdated allocations at microsecond precision without editing historical commitment', () => {
    const original = rInput();
    const preservedCommitment = JSON.stringify(original.commitment);
    expect(originalRiskR(original).status).toBe('available');
    expect(
      originalRiskR({
        ...original,
        earliestExecutionMicros: '1767268800000000',
        financialSourceRevision: '99',
      }),
    ).toMatchObject({
      status: 'unavailable',
      value: null,
      financialSourceRevision: '99',
      reasons: ['execution_not_after_original_commitment'],
    });
    expect(JSON.stringify(original.commitment)).toBe(preservedCommitment);
  });
  it('reports numeric overflow rather than a rounded or infinite R', () => {
    expect(
      originalRiskR(
        rInput({
          originalRisk: {
            originalPlanId: 'plan',
            amount: '0.000000000000000000000000000000000001',
            currencyId: 'USD',
          },
        }),
      ),
    ).toMatchObject({ status: 'available', value: '39000000000000000000000000000000000000' });
    expect(
      originalRiskR(
        rInput({
          originalRisk: {
            originalPlanId: 'plan',
            amount: '0.000000000000000000000000000000000001',
            currencyId: 'USD',
          },
          legResults: [
            availableJournalMetric('999999999999999999999999999999999999999999', 'money', 'USD'),
          ],
        }),
      ),
    ).toMatchObject({ status: 'unavailable', value: null, reasons: ['numeric_overflow'] });
  });
});

function closedInventory(
  options: { pins?: 'correct' | 'wrong-target'; missingFees?: boolean } = {},
) {
  const fill = (
    id: string,
    side: 'buy' | 'sell',
    price: string,
    principal: string,
    rate: string,
  ): InventoryFill => ({
    kind: 'fill',
    id,
    effectId: id,
    sourceRevision: side === 'buy' ? '1' : '2',
    economicOrder: {
      instant: side === 'buy' ? '2026-01-01T00:00:00.000001Z' : '2026-01-02T00:00:00.000001Z',
      sequence: '1',
    },
    side,
    quantity: '10',
    price,
    multiplier: '1',
    bookedPrincipal: principal,
    costsComplete: !options.missingFees,
    costs: [
      {
        id: `fee:${id}`,
        currencyId: 'USD',
        amount: '1',
        chargedAt: '2026-01-01T00:00:00.000001Z',
        ...(options.pins
          ? {
              reportingFx: {
                observationId: `cost:${id}`,
                rate,
                baseCurrencyId: 'USD',
                quoteCurrencyId: options.pins === 'correct' ? 'EUR' : 'GBP',
              },
            }
          : {}),
      },
    ],
    ...(options.pins
      ? {
          basisReportingFx: {
            observationId: `basis:${id}`,
            rate,
            baseCurrencyId: 'USD',
            quoteCurrencyId: options.pins === 'correct' ? 'EUR' : 'GBP',
          },
        }
      : {}),
  });
  return replayInventory({
    scope: {
      workspaceId: 'workspace',
      accountId: 'account',
      instrumentId: 'instrument',
      instrumentVersionId: 'version',
      unitVersionId: 'unit',
      settlementCurrencyId: 'USD',
    },
    manifest: INVENTORY_CALCULATION_MANIFEST,
    policy: 'fifo',
    capability: {
      subtype: 'ordinary-share',
      nativeInventory: true,
      shortSupported: true,
      averageCostSupported: true,
    },
    sourceRevision: '2',
    sources: [fill('entry', 'buy', '10', '100', '0.9'), fill('exit', 'sell', '12', '120', '0.95')],
  });
}

describe('journal original-risk currency uses existing immutable historical pins only', () => {
  it('uses native fee-net cash-paid economics without needing current FX', () => {
    expect(journalRiskCurrencyResult(closedInventory(), 'USD')).toMatchObject({
      status: 'available',
      value: '18',
      currencyId: 'USD',
    });
  });
  it('translates historical entry, exit and costs separately, including holding FX', () => {
    // 120*.95 - 100*.9 - 1*.9 - 1*.95 = 22.15 EUR, not 18*.95.
    expect(journalRiskCurrencyResult(closedInventory({ pins: 'correct' }), 'EUR')).toMatchObject({
      status: 'available',
      value: '22.15',
      currencyId: 'EUR',
    });
  });
  it('keeps missing historical FX unavailable instead of selecting today or rate one', () => {
    const result = journalRiskCurrencyResult(closedInventory(), 'EUR');
    expect(result).toMatchObject({ status: 'unavailable', value: null, currencyId: 'EUR' });
    expect(result.reasons).toContain('missing_exit_fx');
  });
  it('turns a valid pin to another reporting currency into explained absence rather than a server error', () => {
    expect(
      journalRiskCurrencyResult(closedInventory({ pins: 'wrong-target' }), 'EUR'),
    ).toMatchObject({
      status: 'unavailable',
      value: null,
      reasons: ['incompatible_pinned_historical_fx'],
    });
  });
  it('requires complete fees and explicit campaign attribution even for apparently profitable closed legs', () => {
    expect(journalRiskCurrencyResult(closedInventory({ missingFees: true }), 'USD')).toMatchObject({
      status: 'unavailable',
      value: null,
      reasons: ['incomplete_costs'],
    });
    expect(
      journalRiskCurrencyResult(closedInventory(), 'USD', [
        'standalone_costs_require_campaign_attribution',
      ]),
    ).toMatchObject({
      status: 'unavailable',
      value: null,
      reasons: ['standalone_costs_require_campaign_attribution'],
    });
    expect(journalRiskCurrencyResult(undefined, 'USD')).toMatchObject({
      status: 'unavailable',
      value: null,
      reasons: ['missing_campaign_population'],
    });
  });
});
