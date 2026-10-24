import { describe, expect, it } from 'vitest';
import {
  assessRiskLimit,
  riskAssessmentState,
  riskCrossesBoundary,
  riskPeriodStart,
  sizeLinearRisk,
} from '../../packages/domain/src/risk.js';
import type { RiskFact, RiskLimit } from '../../packages/domain/src/risk-types.js';
import {
  riskPolicyWriteSchema,
  riskSizingRequestSchema,
} from '../../packages/contracts/src/risk.js';
const id = '11111111-1111-4111-8111-111111111111';
const fact = (
  value: string | null,
  unit: RiskFact['unit'] = 'money',
  currencyId: string | null = id,
): RiskFact => ({ value, unit, currencyId, reasons: [], references: ['independent-fixture'] });
const sizing = {
  nativeLinear: true,
  side: 'long' as const,
  entry: '102',
  stop: '99',
  multiplier: '2',
  quantityIncrement: '0.25',
  quoteToRiskRate: '0.9',
  budget: '100',
  fixedCosts: '3',
  perUnitCosts: '0.1',
  currencyId: id,
};

describe('versioned risk restrictions and exact planning scenarios', () => {
  it('preserves both account and strategy restrictions: a looser strategy cannot erase a breach', () => {
    const limit: RiskLimit = {
      id,
      kind: 'trade-risk',
      maximum: '100',
      currencyId: id,
      measure: 'amount',
    };
    const account = assessRiskLimit('account-version', limit, fact('150'));
    const strategy = assessRiskLimit('strategy-version', { ...limit, maximum: '200' }, fact('150'));
    expect(account.state).toBe('breached');
    expect(strategy.state).toBe('passed');
    expect(riskAssessmentState([account, strategy])).toBe('breached');
    expect(riskAssessmentState([])).toBe('unconfigured');
  });
  it('assesses every required restriction with strict threshold equality and union semantics', () => {
    const limits: RiskLimit[] = [
      { id, kind: 'trade-risk', maximum: '0.02', currencyId: id, measure: 'equity-ratio' },
      {
        id,
        kind: 'daily-loss',
        maximum: '10',
        currencyId: id,
        basis: 'realized-activity',
        includeIncome: true,
        timezone: 'UTC',
      },
      {
        id,
        kind: 'weekly-loss',
        maximum: '30',
        currencyId: id,
        basis: 'account-change',
        includeIncome: false,
        timezone: 'Europe/Madrid',
      },
      { id, kind: 'positions', maximum: 3 },
      { id, kind: 'concentration', maximum: '0.25', currencyId: id, instrumentId: null },
      {
        id,
        kind: 'exposure',
        maximum: '2',
        currencyId: id,
        measure: 'gross',
        denominator: 'equity',
      },
      { id, kind: 'overnight', timezone: 'UTC', boundaryHour: 22 },
      { id, kind: 'prohibited', instrumentIds: [id], families: [], subtypes: [] },
    ];
    const atLimit = [
      fact('0.02', 'ratio', null),
      fact('10'),
      fact('30'),
      fact('3', 'count', null),
      fact('0.25', 'ratio', null),
      fact('2', 'ratio', null),
      fact('0', 'boolean', null),
      fact('0', 'boolean', null),
    ];
    for (const [index, limit] of limits.entries()) {
      expect(assessRiskLimit('v1', limit, atLimit[index]!).state).toBe('passed');
      expect(assessRiskLimit('v1', limit, { ...atLimit[index]!, value: null }).state).toBe(
        'unknown',
      );
    }
    expect(assessRiskLimit('v2', limits[7]!, fact('1', 'boolean', null)).state).toBe('breached');
    expect(
      riskAssessmentState([
        assessRiskLimit('v1', limits[0]!, fact('0.01', 'ratio', null)),
        assessRiskLimit('v2', limits[6]!, {
          ...fact(null, 'boolean', null),
          reasons: ['missing_exit_time'],
        }),
      ]),
    ).toBe('unknown');
  });
  it('never passes incompatible currencies, wrong units or stale/incomplete evidence', () => {
    const limit: RiskLimit = {
      id,
      kind: 'trade-risk',
      maximum: '100',
      currencyId: id,
      measure: 'amount',
    };
    for (const evidence of [
      fact('1', 'money', 'different-currency'),
      fact('1', 'ratio', null),
      { ...fact('1'), reasons: ['stale_price'] },
    ])
      expect(assessRiskLimit('v1', limit, evidence).state).toBe('unknown');
  });
  it('hand-calculates fractional, multiplier and cross-currency sizing and maximizes the valid increment', () => {
    // Risk per unit = (102-99)*2*.9+.1=5.5. Budget after fixed fees=97.
    // 17.5 units fit: 17.5*5.5+3=99.25. Next .25 costs 100.625 and fails.
    const result = sizeLinearRisk(sizing);
    expect(result).toMatchObject({
      state: 'available',
      quantity: '17.5',
      riskPerUnit: '5.5',
      plannedRisk: '99.25',
    });
    expect(sizeLinearRisk({ ...sizing, side: 'short', entry: '99', stop: '102' })).toEqual(result);
    expect(sizeLinearRisk({ ...sizing, budget: '3' })).toMatchObject({
      quantity: '0',
      plannedRisk: '0',
    });
    expect(sizeLinearRisk({ ...sizing, nativeLinear: false }).state).toBe('unknown');
    expect(sizeLinearRisk({ ...sizing, stop: '103' }).reasons).toContain(
      'stop_must_be_on_adverse_side_of_entry',
    );
  });
  it('does not turn binary floating-point or wrong-side stops into an oversized order', () => {
    expect(
      sizeLinearRisk({
        ...sizing,
        entry: '0.3',
        stop: '0.2',
        multiplier: '1',
        quoteToRiskRate: '1',
        budget: '0.3',
        fixedCosts: '0',
        perUnitCosts: '0',
        quantityIncrement: '1',
      }),
    ).toMatchObject({ quantity: '3', plannedRisk: '0.3' });
    expect(
      sizeLinearRisk({
        ...sizing,
        entry: '0.000000000000000000000000000000000002',
        stop: '0.000000000000000000000000000000000001',
        multiplier: '0.1',
        quoteToRiskRate: '0.1',
        perUnitCosts: '0',
      }).state,
    ).toBe('unknown');
  });
  it('uses pinned IANA daily/week calendars through daylight saving and handles folds as unknown', () => {
    expect(riskPeriodStart('2026-03-29T12:00:00Z', 'Europe/Madrid', false)).toBe(
      '2026-03-28T23:00:00.000Z',
    );
    expect(riskPeriodStart('2026-03-29T12:00:00Z', 'Europe/Madrid', true)).toBe(
      '2026-03-22T23:00:00.000Z',
    );
    expect(
      riskCrossesBoundary('2026-10-22T19:00:00Z', '2026-10-22T20:00:00Z', 'Europe/Madrid', 22),
    ).toBe(true);
    expect(
      riskCrossesBoundary('2026-10-22T19:00:00Z', '2026-10-22T19:59:59Z', 'Europe/Madrid', 22),
    ).toBe(false);
    expect(
      riskCrossesBoundary('2026-10-25T00:00:00Z', '2026-10-25T03:00:00Z', 'Europe/Madrid', 2),
    ).toBeNull();
  });
  it('rejects ambiguous scopes, duplicate limits, executable or unknown configuration, and incomplete sizing contracts', () => {
    const body = {
      expectedVersion: 0,
      accountId: id,
      strategyId: null,
      effectiveAt: '2026-01-01T00:00:00Z',
      reason: 'Reviewed explicit limit',
      definition: {
        name: 'Risk',
        limits: [{ id, kind: 'positions', maximum: 1 }],
        maxAgeMilliseconds: 0,
        priceSources: ['manual'],
        fxSources: ['manual'],
      },
    };
    expect(riskPolicyWriteSchema.safeParse(body).success).toBe(true);
    expect(riskPolicyWriteSchema.safeParse({ ...body, strategyId: id }).success).toBe(false);
    expect(
      riskPolicyWriteSchema.safeParse({
        ...body,
        definition: {
          ...body.definition,
          limits: [...body.definition.limits, ...body.definition.limits],
        },
      }).success,
    ).toBe(false);
    expect(
      riskPolicyWriteSchema.safeParse({
        ...body,
        definition: { ...body.definition, formula: 'eval(user)' },
      }).success,
    ).toBe(false);
    expect(riskSizingRequestSchema.safeParse({ budget: '100' }).success).toBe(false);
  });
});
