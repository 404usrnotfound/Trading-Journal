import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  calculateAccounting,
  decimalValue,
  FinancialArithmeticError,
  INVENTORY_CALCULATION_MANIFEST,
  prepareHoldingTransfer,
  replayInventory,
  type AccountingBook,
  type AccountingCashPosting,
  type AccountingInput,
  type AccountingMetric,
  type FxObservation,
  type InventoryFill,
  type InventoryOpening,
  type InventoryReplayResult,
  type InventorySource,
} from '../../packages/domain/src/index.js';

const at = (second: number) => `2026-01-01T12:00:${String(second).padStart(2, '0')}Z`;
const from = at(0);
const to = at(59);
const fxPolicy = {
  id: 'independent-manual/1',
  maxAgeMilliseconds: 86_400_000,
  sourcePriority: ['manual'],
};
const pricePolicy = { maxAgeMilliseconds: 86_400_000, sourcePriority: ['manual'] };
function base(overrides: Partial<AccountingInput> = {}): AccountingInput {
  return {
    accountIds: ['A'],
    reportingCurrencyId: 'EUR',
    sourceRevision: '999',
    from,
    to,
    fxPolicy,
    pricePolicy,
    fxObservations: [],
    sourceInstants: {},
    openingCash: [],
    closingCash: [],
    cashPostings: [],
    books: [],
    cashTransfers: [],
    holdingTransfers: [],
    holdingOpenings: [],
    conversions: [],
    ...overrides,
  };
}
function amount(metric: AccountingMetric): string {
  expect(metric.state).toBe('available');
  expect(metric.reasons).toEqual([]);
  expect(metric.value).toBe(metric.knownSubtotal);
  return metric.value!;
}
function balance(accountId: string, currencyId: string, value: string) {
  return {
    accountId,
    currencyId,
    cashBucketId: `${accountId}:${currencyId}`,
    amount: value,
    kind: 'settled',
  };
}
function posting(
  id: string,
  economicAt: string,
  value: string,
  classification: AccountingCashPosting['classification'],
  currencyId = 'EUR',
  accountId = 'A',
): AccountingCashPosting {
  return {
    id,
    eventId: `event:${id}`,
    economicAt,
    amount: value,
    classification,
    currencyId,
    accountId,
    cashBucketId: `${accountId}:${currencyId}`,
  };
}
function observation(
  id: string,
  economicAt: string,
  rate: string,
  baseCurrencyId = 'USD',
  quoteCurrencyId = 'EUR',
): FxObservation {
  return { id, observedAt: economicAt, rate, baseCurrencyId, quoteCurrencyId, source: 'manual' };
}
function fill(
  id: string,
  economicAt: string,
  side: 'buy' | 'sell',
  quantity: string,
  price: string,
  bookedPrincipal: string,
  currencyId = 'EUR',
  rate?: string,
): InventoryFill {
  return {
    id,
    kind: 'fill',
    effectId: `effect:${id}`,
    sourceRevision: '1',
    economicOrder: { instant: economicAt, sequence: '1' },
    side,
    quantity,
    price,
    multiplier: '1',
    bookedPrincipal,
    costs: [],
    costsComplete: true,
    ...(rate
      ? {
          basisReportingFx: {
            observationId: `pinned:${id}`,
            rate,
            baseCurrencyId: currencyId,
            quoteCurrencyId: 'EUR',
          },
        }
      : {}),
  };
}
function inventory(
  sources: readonly InventorySource[],
  accountId = 'A',
  currencyId = 'EUR',
): InventoryReplayResult {
  return replayInventory({
    scope: {
      workspaceId: 'workspace',
      accountId,
      instrumentId: 'share',
      instrumentVersionId: 'share/v1',
      unitVersionId: 'share/unit1',
      settlementCurrencyId: currencyId,
    },
    manifest: INVENTORY_CALCULATION_MANIFEST,
    policy: 'fifo',
    capability: {
      subtype: 'ordinary-share',
      nativeInventory: true,
      shortSupported: true,
      averageCostSupported: true,
    },
    sources,
    sourceRevision: '999',
  });
}
function book(
  opening: readonly InventorySource[],
  closing: readonly InventorySource[],
  openingPrice: string | null,
  closingPrice: string | null,
  accountId = 'A',
  currencyId = 'EUR',
  start = from,
  end = to,
): AccountingBook {
  return {
    id: `book:${accountId}`,
    accountId,
    instrumentId: 'share',
    instrumentVersionId: 'share/v1',
    currencyId,
    multiplier: '1',
    openingInventory: inventory(opening, accountId, currencyId),
    closingInventory: inventory(closing, accountId, currencyId),
    openingMark:
      openingPrice === null
        ? null
        : { id: `mark:${accountId}:opening`, price: openingPrice, observedAt: start },
    closingMark:
      closingPrice === null
        ? null
        : { id: `mark:${accountId}:closing`, price: closingPrice, observedAt: end },
  };
}

describe('accounting capital, income and actual cost separation', () => {
  it('returns complete zero only for a genuinely empty complete population', () => {
    const report = calculateAccounting(base());
    expect(amount(report.closing.equity)).toBe('0');
    expect(amount(report.reconciliation.performance)).toBe('0');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('keeps deposits and withdrawals outside trading performance', () => {
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'EUR', '100')],
        closingCash: [balance('A', 'EUR', '130')],
        cashPostings: [
          posting('deposit', at(1), '50', 'deposit'),
          posting('withdrawal', at(2), '-20', 'withdrawal'),
        ],
      }),
    );
    expect(amount(report.breakdown.externalCashFlows)).toBe('30');
    expect(amount(report.reconciliation.navChange)).toBe('30');
    expect(amount(report.breakdown.tradingPnl)).toBe('0');
    expect(amount(report.reconciliation.performance)).toBe('0');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('separates dividend and interest income, withholding, fees and financing expenses', () => {
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'EUR', '100')],
        closingCash: [balance('A', 'EUR', '107')],
        cashPostings: [
          posting('dividend', at(1), '10', 'income'),
          posting('interest', at(2), '2', 'income'),
          posting('withholding', at(3), '-1', 'tax'),
          posting('commission', at(4), '-3', 'fee'),
          posting('borrowing', at(5), '-1', 'expense'),
        ],
      }),
    );
    expect(amount(report.breakdown.income)).toBe('12');
    expect(amount(report.breakdown.taxes)).toBe('1');
    expect(amount(report.breakdown.fees)).toBe('3');
    expect(amount(report.breakdown.expenses)).toBe('1');
    expect(amount(report.reconciliation.performance)).toBe('7');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('recognizes refunds as dated negative charges', () => {
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'EUR', '100')],
        closingCash: [balance('A', 'EUR', '103')],
        cashPostings: [
          posting('fee-refund', at(1), '1', 'fee'),
          posting('tax-refund', at(2), '2', 'tax'),
        ],
      }),
    );
    expect(amount(report.breakdown.fees)).toBe('-1');
    expect(amount(report.breakdown.taxes)).toBe('-2');
    expect(amount(report.reconciliation.performance)).toBe('3');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('keeps reviewed opening cash outside profit', () => {
    const report = calculateAccounting(
      base({
        closingCash: [balance('A', 'EUR', '100')],
        cashPostings: [posting('opening', at(1), '100', 'opening')],
      }),
    );
    expect(amount(report.breakdown.openingAdjustments)).toBe('100');
    expect(amount(report.breakdown.externalCashFlows)).toBe('0');
    expect(amount(report.reconciliation.performance)).toBe('0');
  });
  it('keeps unmatched cash classification explicitly unavailable while retaining known income', () => {
    const report = calculateAccounting(
      base({
        closingCash: [balance('A', 'EUR', '13')],
        cashPostings: [
          posting('income', at(1), '3', 'income'),
          posting('unknown', at(2), '10', 'unresolved'),
        ],
      }),
    );
    expect(amount(report.closing.equity)).toBe('13');
    expect(report.reconciliation.performance).toMatchObject({
      state: 'partial',
      value: null,
      knownSubtotal: '13',
      reasons: ['unresolved_cash_classification'],
    });
    expect(report.reconciliation.explainedChange).toMatchObject({
      state: 'partial',
      value: null,
      knownSubtotal: '3',
      reasons: ['unresolved_cash_classification'],
    });
    expect(report.reconciliation.variance.value).toBeNull();
  });
  it('does not rename a compatible but unexplained difference as FX or profit', () => {
    const report = calculateAccounting(
      base({
        closingCash: [balance('A', 'EUR', '5')],
        cashPostings: [posting('manual-principal', at(1), '5', 'trade-principal')],
      }),
    );
    expect(amount(report.breakdown.tradingPnl)).toBe('0');
    expect(amount(report.breakdown.cashFx)).toBe('0');
    expect(amount(report.reconciliation.variance)).toBe('5');
  });
});

describe('documented EUR/USD reconciliation and chronological source contexts', () => {
  function fixture() {
    const buy = fill('buy', at(30), 'buy', '10', '100', '1000', 'USD', '0.9');
    const sell = fill('sell', at(40), 'sell', '4', '120', '480', 'USD', '0.92');
    return base({
      closingCash: [balance('A', 'EUR', '497'), balance('A', 'USD', '1177')],
      cashPostings: [
        posting('funding', at(1), '2000', 'deposit'),
        posting('exchange1EUR', at(10), '-1000', 'fx-conversion'),
        posting('exchange1USD', at(10), '1100', 'fx-conversion', 'USD'),
        posting('conversion-fee1', at(10), '-2', 'fee'),
        posting('exchange2EUR', at(20), '-500', 'fx-conversion'),
        posting('exchange2USD', at(20), '600', 'fx-conversion', 'USD'),
        posting('conversion-fee2', at(20), '-1', 'fee'),
        {
          ...posting('buy-principal', at(30), '-1000', 'trade-principal', 'USD'),
          reportingFx: buy.basisReportingFx!,
        },
        posting('entry-fee', at(30), '-2', 'fee', 'USD'),
        {
          ...posting('sell-principal', at(40), '480', 'trade-principal', 'USD'),
          reportingFx: sell.basisReportingFx!,
        },
        posting('exit-fee', at(40), '-1', 'fee', 'USD'),
      ],
      sourceInstants: { buy: at(30), sell: at(40) },
      books: [book([], [buy, sell], null, '110', 'A', 'USD')],
      fxObservations: [
        observation('conv1', at(10), '0.9'),
        observation('conv2', at(20), '0.85'),
        observation('purchase', at(30), '0.9'),
        observation('sale', at(40), '0.92'),
        observation('end', to, '0.95'),
      ],
      conversions: [
        {
          id: 'conversion1',
          sourceCurrencyId: 'EUR',
          destinationCurrencyId: 'USD',
          sourceAmount: '1000',
          destinationAmount: '1100',
          economicAt: at(10),
        },
        {
          id: 'conversion2',
          sourceCurrencyId: 'EUR',
          destinationCurrencyId: 'USD',
          sourceAmount: '500',
          destinationAmount: '600',
          economicAt: at(20),
        },
      ],
    });
  }
  it('reconciles independently calculated conversion, gross trading, cash/holding FX and actual costs', () => {
    const report = calculateAccounting(fixture());
    expect(report.closing.cashByCurrency).toEqual([
      { currencyId: 'EUR', amount: '497', reasons: [] },
      { currencyId: 'USD', amount: '1177', reasons: [] },
    ]);
    expect(amount(report.closing.cash)).toBe('1615.15');
    expect(amount(report.closing.holdings)).toBe('627');
    expect(amount(report.closing.equity)).toBe('2242.15');
    expect(amount(report.closing.netLiquidationValue)).toBe('2242.15');
    expect(amount(report.breakdown.realizedTradingPnl)).toBe('73.6');
    expect(amount(report.breakdown.unrealizedTradingPnlChange)).toBe('57');
    expect(amount(report.breakdown.holdingFx)).toBe('38');
    expect(amount(report.breakdown.cashFx)).toBe('79.27');
    expect(amount(report.breakdown.conversionEffects)).toBe('0');
    expect(amount(report.breakdown.fees)).toBe('5.72');
    expect(amount(report.reconciliation.performance)).toBe('242.15');
    expect(amount(report.reconciliation.explainedChange)).toBe('242.15');
    expect(amount(report.reconciliation.variance)).toBe('0');
    expect(amount(report.reconciliation.roundingResidual)).toBe('0');
    expect(report.native.realizedGross[0]!.metric.value).toBe('80');
    expect(report.native.unrealizedGross[0]!.metric.value).toBe('60');
  });
  it('leaves historical realization unchanged when a future current quote is added', () => {
    const source = fixture();
    const old = calculateAccounting(source);
    const future = calculateAccounting({
      ...source,
      fxObservations: [
        ...source.fxObservations,
        observation('future', '2026-01-02T12:00:00Z', '9'),
      ],
    });
    expect(future.breakdown).toEqual(old.breakdown);
    expect(future.closing.equity).toEqual(old.closing.equity);
  });
  it('uses the same immutable source-pinned context for principal, charge and matching', () => {
    const source = fixture();
    const chargePin = {
      observationId: 'entry-cost-pinned',
      rate: '0.9',
      baseCurrencyId: 'USD',
      quoteCurrencyId: 'EUR',
    };
    const report = calculateAccounting({
      ...source,
      cashPostings: source.cashPostings.map((item) =>
        item.id === 'entry-fee' ? { ...item, reportingFx: chargePin } : item,
      ),
      fxObservations: source.fxObservations.map((item) =>
        item.id === 'purchase' ? { ...item, id: 'corrected-reference', rate: '0.7' } : item,
      ),
    });
    expect(amount(report.breakdown.realizedTradingPnl)).toBe('73.6');
    expect(amount(report.breakdown.fees)).toBe('5.72');
    expect(amount(report.reconciliation.variance)).toBe('0');
    expect(
      report.dependencies.fx.some(
        (item) =>
          item.selection.state === 'available' &&
          item.selection.value.observationIds.includes('pinned:buy'),
      ),
    ).toBe(true);
  });
  it('creates a different reporting view without rewriting source pins', () => {
    const source = fixture();
    const report = calculateAccounting({
      ...source,
      reportingCurrencyId: 'USD',
      fxObservations: [
        ...source.fxObservations,
        observation('eur-view', from, '1.1', 'EUR', 'USD'),
      ],
    });
    expect(amount(report.breakdown.realizedTradingPnl)).toBe('80');
    expect(amount(report.reconciliation.variance)).toBe('0');
    expect(source.books[0]!.closingInventory.matches[0]!.basisReportingFx!.quoteCurrencyId).toBe(
      'EUR',
    );
  });
  it('retains an explained known subtotal when an income currency lacks any eligible rate', () => {
    const report = calculateAccounting(
      base({
        closingCash: [balance('A', 'EUR', '3'), balance('A', 'GBP', '4')],
        cashPostings: [
          posting('EUR-income', at(1), '3', 'income'),
          posting('GBP-income', at(2), '4', 'income', 'GBP'),
        ],
      }),
    );
    expect(report.closing.equity).toMatchObject({
      state: 'partial',
      value: null,
      knownSubtotal: '3',
    });
    expect(report.breakdown.income).toMatchObject({
      state: 'partial',
      value: null,
      knownSubtotal: '3',
      reasons: ['missing_fx'],
    });
    expect(report.reconciliation.performance.value).toBeNull();
    expect(report.reconciliation.variance.value).toBeNull();
  });
  it('rejects stale rates and does not replace missing rate coverage with a residual', () => {
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'USD', '100')],
        closingCash: [balance('A', 'USD', '100')],
        fxPolicy: { ...fxPolicy, maxAgeMilliseconds: 1000 },
        fxObservations: [observation('stale', from, '0.8')],
      }),
    );
    expect(report.closing.equity.value).toBeNull();
    expect(report.closing.equity.reasons).toContain('stale_fx');
    expect(report.breakdown.cashFx.value).toBeNull();
    expect(report.reconciliation.variance.value).toBeNull();
  });
  it('preserves original, reversal and replacement cash effects in a source restatement', () => {
    const replacement = fill('replacement', at(10), 'buy', '2', '15', '30');
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'EUR', '100')],
        closingCash: [balance('A', 'EUR', '70')],
        cashPostings: [
          posting('old-principal', at(10), '-20', 'trade-principal'),
          posting('reversal', at(10), '20', 'trade-principal'),
          posting('replacement-principal', at(10), '-30', 'trade-principal'),
        ],
        sourceInstants: { replacement: at(10) },
        books: [book([], [replacement], null, '16')],
      }),
    );
    expect(amount(report.closing.equity)).toBe('102');
    expect(amount(report.breakdown.tradingPnl)).toBe('2');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
});

describe('scope-specific cash transfers and evidenced in-transit ownership', () => {
  const endpoints = { sourceAccountId: 'A', destinationAccountId: 'B' };
  const departure = { ...posting('departure', at(10), '-40', 'transfer', 'USD'), ...endpoints };
  const receipt = { ...posting('receipt', at(40), '40', 'transfer', 'USD', 'B'), ...endpoints };
  function transferred(overrides: Partial<AccountingInput> = {}): AccountingInput {
    return base({
      accountIds: ['A', 'B'],
      openingCash: [balance('A', 'USD', '100'), balance('B', 'USD', '0')],
      closingCash: [balance('A', 'USD', '60'), balance('B', 'USD', '40')],
      cashPostings: [departure, receipt],
      cashTransfers: [
        {
          id: 'transfer',
          ...endpoints,
          currencyId: 'USD',
          amount: '40',
          departedAt: at(10),
          receivedAt: at(40),
        },
      ],
      fxObservations: [
        observation('opening', from, '0.8'),
        observation('departure', at(10), '0.8'),
        observation('intermediate', at(20), '0.9'),
        observation('receipt', at(40), '1'),
        observation('ending', to, '1'),
      ],
      ...overrides,
    });
  }
  it('reconciles F-18 cashFX12 plus transitFX8 to total currency effect20', () => {
    const report = calculateAccounting(transferred());
    expect(amount(report.opening.equity)).toBe('80');
    expect(amount(report.closing.equity)).toBe('100');
    expect(amount(report.breakdown.cashFx)).toBe('12');
    expect(amount(report.breakdown.transitFx)).toBe('8');
    expect(amount(report.breakdown.boundaryTransfers)).toBe('0');
    expect(amount(report.reconciliation.performance)).toBe('20');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('counts the owned monetary claim once while the transfer is pending', () => {
    const report = calculateAccounting(
      transferred({
        to: at(20),
        closingCash: [balance('A', 'USD', '60'), balance('B', 'USD', '0')],
        cashPostings: [departure],
      }),
    );
    expect(amount(report.closing.cash)).toBe('54');
    expect(amount(report.closing.transit)).toBe('36');
    expect(amount(report.closing.equity)).toBe('90');
    expect(amount(report.breakdown.cashFx)).toBe('6');
    expect(amount(report.breakdown.transitFx)).toBe('4');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('retains the claim without assuming an expected receipt occurred', () => {
    const report = calculateAccounting(
      transferred({
        closingCash: [balance('A', 'USD', '60'), balance('B', 'USD', '0')],
        cashPostings: [departure],
        cashTransfers: [
          {
            id: 'transfer',
            ...endpoints,
            currencyId: 'USD',
            amount: '40',
            departedAt: at(10),
            receivedAt: null,
          },
        ],
      }),
    );
    expect(amount(report.closing.transit)).toBe('40');
    expect(amount(report.closing.equity)).toBe('100');
    expect(amount(report.breakdown.cashFx)).toBe('12');
    expect(amount(report.breakdown.transitFx)).toBe('8');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('classifies source-only departure as a scope outflow, never a trading loss', () => {
    const report = calculateAccounting(
      transferred({
        accountIds: ['A'],
        openingCash: [balance('A', 'USD', '100')],
        closingCash: [balance('A', 'USD', '60')],
        cashPostings: [departure],
      }),
    );
    expect(amount(report.closing.transit)).toBe('0');
    expect(amount(report.breakdown.boundaryTransfers)).toBe('-32');
    expect(amount(report.breakdown.externalCashFlows)).toBe('0');
    expect(amount(report.breakdown.tradingPnl)).toBe('0');
    expect(amount(report.reconciliation.performance)).toBe('12');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('classifies destination-only receipt as scope capital, never a gain', () => {
    const report = calculateAccounting(
      transferred({
        accountIds: ['B'],
        openingCash: [balance('B', 'USD', '0')],
        closingCash: [balance('B', 'USD', '40')],
        cashPostings: [receipt],
      }),
    );
    expect(amount(report.breakdown.boundaryTransfers)).toBe('40');
    expect(amount(report.breakdown.transitFx)).toBe('0');
    expect(amount(report.reconciliation.performance)).toBe('0');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('includes an already-pending claim at the opening boundary and extinguishes it on receipt', () => {
    const report = calculateAccounting(
      transferred({
        from: at(20),
        openingCash: [balance('A', 'USD', '60'), balance('B', 'USD', '0')],
        cashPostings: [receipt],
      }),
    );
    expect(amount(report.opening.transit)).toBe('36');
    expect(amount(report.opening.equity)).toBe('90');
    expect(amount(report.closing.transit)).toBe('0');
    expect(amount(report.breakdown.cashFx)).toBe('6');
    expect(amount(report.breakdown.transitFx)).toBe('4');
    expect(amount(report.reconciliation.performance)).toBe('10');
  });
  it('cancels immediate transfer and cash-bucket settlement without income or duplication', () => {
    const report = calculateAccounting(
      base({
        accountIds: ['A', 'B'],
        openingCash: [balance('A', 'EUR', '100'), balance('B', 'EUR', '0')],
        closingCash: [balance('A', 'EUR', '60'), balance('B', 'EUR', '40')],
        cashPostings: [
          { ...posting('sent', at(10), '-40', 'transfer'), ...endpoints },
          { ...posting('received', at(10), '40', 'transfer', 'EUR', 'B'), ...endpoints },
          posting('settlement-debit', at(20), '-20', 'settlement'),
          posting('settlement-credit', at(20), '20', 'settlement'),
        ],
      }),
    );
    expect(amount(report.breakdown.boundaryTransfers)).toBe('0');
    expect(amount(report.breakdown.income)).toBe('0');
    expect(amount(report.reconciliation.performance)).toBe('0');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
});

describe('ordinary inventory, interval attribution and capital opening', () => {
  it('measures the interval change instead of lifetime pre-existing profit', () => {
    const bought = fill('old-buy', '2025-12-31T12:00:00Z', 'buy', '10', '10', '100', 'USD', '0.8');
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'USD', '100')],
        closingCash: [balance('A', 'USD', '100')],
        sourceInstants: { 'old-buy': bought.economicOrder.instant! },
        books: [book([bought], [bought], '12', '13', 'A', 'USD')],
        fxObservations: [observation('start', from, '0.9'), observation('end', to, '1')],
      }),
    );
    expect(amount(report.breakdown.realizedTradingPnl)).toBe('0');
    expect(amount(report.breakdown.tradingPnl)).toBe('12');
    expect(amount(report.breakdown.holdingFx)).toBe('10');
    expect(amount(report.breakdown.cashFx)).toBe('10');
    expect(amount(report.reconciliation.performance)).toBe('32');
    expect(amount(report.reconciliation.variance)).toBe('0');
    expect(report.native.unrealizedGross[0]!.metric.value).toBe('30');
  });
  it('handles a partial close of pre-existing inventory without recharging the old entry cost', () => {
    const bought = {
      ...fill('old-buy', '2025-12-31T12:00:00Z', 'buy', '10', '10', '100'),
      costs: [
        { id: 'entry-fee', amount: '2', currencyId: 'EUR', chargedAt: '2025-12-31T12:00:00Z' },
      ],
    };
    const sold = {
      ...fill('sold', at(20), 'sell', '4', '15', '60'),
      costs: [{ id: 'exit-fee', amount: '1', currencyId: 'EUR', chargedAt: at(20) }],
    };
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'EUR', '898')],
        closingCash: [balance('A', 'EUR', '957')],
        cashPostings: [
          posting('sale', at(20), '60', 'trade-principal'),
          posting('fee', at(20), '-1', 'fee'),
        ],
        sourceInstants: { 'old-buy': bought.economicOrder.instant!, sold: at(20) },
        books: [book([bought], [bought, sold], '12', '16')],
      }),
    );
    expect(amount(report.breakdown.realizedTradingPnl)).toBe('20');
    expect(amount(report.breakdown.unrealizedTradingPnlChange)).toBe('16');
    expect(amount(report.breakdown.fees)).toBe('1');
    expect(amount(report.reconciliation.performance)).toBe('35');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('accounts for fractional shares and actual entry fees once', () => {
    const bought = fill('fraction', at(20), 'buy', '0.3333', '10', '3.33');
    const report = calculateAccounting(
      base({
        closingCash: [balance('A', 'EUR', '-3.34')],
        cashPostings: [
          posting('principal', at(20), '-3.33', 'trade-principal'),
          posting('fee', at(20), '-0.01', 'fee'),
        ],
        sourceInstants: { fraction: at(20) },
        books: [book([], [bought], null, '12')],
      }),
    );
    expect(amount(report.closing.holdings)).toBe('3.9996');
    expect(amount(report.breakdown.tradingPnl)).toBe('0.6696');
    expect(amount(report.reconciliation.performance)).toBe('0.6596');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('recognizes short proceeds, signed holdings and opposite FX effects exactly once', () => {
    const short = fill('short', at(20), 'sell', '10', '100', '1000', 'USD', '0.8');
    const report = calculateAccounting(
      base({
        closingCash: [balance('A', 'USD', '1000')],
        cashPostings: [
          {
            ...posting('short-proceeds', at(20), '1000', 'trade-principal', 'USD'),
            reportingFx: short.basisReportingFx!,
          },
        ],
        sourceInstants: { short: at(20) },
        books: [book([], [short], null, '90', 'A', 'USD')],
        fxObservations: [observation('short-entry', at(20), '0.8'), observation('end', to, '0.9')],
      }),
    );
    expect(amount(report.closing.cash)).toBe('900');
    expect(amount(report.closing.holdings)).toBe('-810');
    expect(amount(report.breakdown.tradingPnl)).toBe('90');
    expect(amount(report.breakdown.holdingFx)).toBe('-100');
    expect(amount(report.breakdown.cashFx)).toBe('100');
    expect(amount(report.closing.equity)).toBe('90');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('retains the signed negative cash FX result from F-16', () => {
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'USD', '-100')],
        closingCash: [balance('A', 'USD', '-60')],
        cashPostings: [posting('funding', at(20), '40', 'deposit', 'USD')],
        fxObservations: [
          observation('start', from, '0.8'),
          observation('flow', at(20), '0.9'),
          observation('end', to, '1'),
        ],
      }),
    );
    expect(amount(report.breakdown.cashFx)).toBe('-16');
    expect(amount(report.breakdown.externalCashFlows)).toBe('36');
    expect(amount(report.reconciliation.performance)).toBe('-16');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('does not count the mark-to-basis value of opening holdings as profit', () => {
    const opened: InventoryOpening = {
      kind: 'opening',
      id: 'opening-lot',
      effectId: 'opening-effect',
      sourceRevision: '1',
      economicOrder: { instant: at(20), sequence: '1' },
      direction: 'long',
      quantity: '5',
      multiplier: '1',
      entryPrice: '10',
      bookedPrincipal: '50',
      costs: [],
      costsComplete: true,
    };
    const report = calculateAccounting(
      base({
        sourceInstants: { 'opening-lot': at(20) },
        books: [book([], [opened], null, '14')],
        holdingOpenings: [
          {
            id: 'opening-lot',
            accountId: 'A',
            instrumentId: 'share',
            currencyId: 'EUR',
            economicAt: at(20),
            direction: 'long',
            quantity: '5',
            multiplier: '1',
            nativeValuation: true,
            bookedPrincipal: '50',
            mark: { id: 'opening-capital-mark', price: '12', observedAt: at(20) },
          },
        ],
      }),
    );
    expect(amount(report.closing.equity)).toBe('70');
    expect(amount(report.breakdown.openingAdjustments)).toBe('60');
    expect(amount(report.breakdown.tradingPnl)).toBe('10');
    expect(amount(report.reconciliation.performance)).toBe('10');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('keeps a manual future opening out of capital instead of manufacturing full notional', () => {
    const scope = {
      workspaceId: 'workspace',
      accountId: 'A',
      instrumentId: 'future',
      instrumentVersionId: 'future/v1',
      unitVersionId: 'contract',
      settlementCurrencyId: 'EUR',
    };
    const opening: InventoryOpening = {
      kind: 'opening',
      id: 'future-opening',
      effectId: 'future-opening',
      sourceRevision: '1',
      economicOrder: { instant: at(20), sequence: '1' },
      direction: 'long',
      quantity: '2',
      multiplier: '50',
      entryPrice: '5000',
      bookedPrincipal: null,
      costs: [],
      costsComplete: true,
    };
    const replay = (sources: readonly InventorySource[]) =>
      replayInventory({
        scope,
        manifest: INVENTORY_CALCULATION_MANIFEST,
        sourceRevision: '999',
        policy: 'fifo',
        capability: {
          subtype: 'linear-future',
          nativeInventory: false,
          shortSupported: false,
          averageCostSupported: false,
        },
        sources,
      });
    const mark = { id: 'future-points', price: '5000', observedAt: at(20) };
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'EUR', '10000')],
        closingCash: [balance('A', 'EUR', '10000')],
        books: [
          {
            id: 'future-book',
            accountId: 'A',
            instrumentId: 'future',
            instrumentVersionId: 'future/v1',
            currencyId: 'EUR',
            multiplier: '50',
            openingInventory: replay([]),
            closingInventory: replay([opening]),
            openingMark: null,
            closingMark: mark,
          },
        ],
        holdingOpenings: [
          {
            id: opening.id,
            accountId: 'A',
            instrumentId: 'future',
            currencyId: 'EUR',
            economicAt: at(20),
            direction: 'long',
            quantity: '2',
            multiplier: '50',
            nativeValuation: false,
            bookedPrincipal: null,
            mark,
          },
        ],
      }),
    );
    // 2 × 5,000 points × EUR 50/point is EUR 500,000 of exposure.
    // It cannot be used as the derivative's contributed capital or asset value.
    expect(report.breakdown.openingAdjustments).toMatchObject({
      state: 'unavailable',
      value: null,
      knownSubtotal: '0',
      reasons: ['unsupported_inventory_module'],
      missingReferences: [opening.id],
    });
    expect(amount(report.closing.cash)).toBe('10000');
    expect(report.closing.equity).toMatchObject({
      state: 'partial',
      value: null,
      knownSubtotal: '10000',
      reasons: ['unsupported_inventory_module'],
    });
    expect(report.reconciliation.netCapitalFlows.value).toBeNull();
    expect(report.reconciliation.netCapitalFlows.knownSubtotal).toBe('0');
    expect(report.reconciliation.performance.value).toBeNull();
    expect(report.breakdown.tradingPnl.knownSubtotal).toBe('0');
  });
  it('keeps observed marked account change available while unknown basis blocks attribution', () => {
    const opening: InventoryOpening = {
      kind: 'opening',
      id: 'unknown',
      effectId: 'unknown-effect',
      sourceRevision: '1',
      economicOrder: { instant: '2025-12-31T12:00:00Z', sequence: '1' },
      direction: 'long',
      quantity: '5',
      multiplier: '1',
      entryPrice: null,
      bookedPrincipal: null,
      costs: [],
      costsComplete: true,
    };
    const sold = fill('sold', at(20), 'sell', '2', '15', '30');
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'EUR', '100')],
        closingCash: [balance('A', 'EUR', '129')],
        cashPostings: [
          posting('sale', at(20), '30', 'trade-principal'),
          posting('fee', at(20), '-1', 'fee'),
        ],
        sourceInstants: { unknown: opening.economicOrder.instant!, sold: at(20) },
        books: [book([opening], [opening, sold], '12', '12')],
      }),
    );
    expect(amount(report.opening.equity)).toBe('160');
    expect(amount(report.closing.equity)).toBe('165');
    expect(amount(report.reconciliation.performance)).toBe('5');
    expect(report.breakdown.tradingPnl.value).toBeNull();
    expect(report.breakdown.tradingPnl.reasons).toContain('unknown_basis');
    expect(report.reconciliation.variance.value).toBeNull();
  });
  it('preserves known cash when an open holding has no eligible mark', () => {
    const bought = fill('buy', at(20), 'buy', '1', '10', '10');
    const report = calculateAccounting(
      base({
        closingCash: [balance('A', 'EUR', '90')],
        cashPostings: [posting('purchase', at(20), '-10', 'trade-principal')],
        openingCash: [balance('A', 'EUR', '100')],
        sourceInstants: { buy: at(20) },
        books: [book([], [bought], null, null)],
      }),
    );
    expect(report.closing.equity).toMatchObject({
      state: 'partial',
      value: null,
      knownSubtotal: '90',
    });
    expect(report.closing.equity.reasons).toContain('missing_mark');
    expect(report.reconciliation.performance.value).toBeNull();
  });
  it('does not advertise zero fees as complete when source cost coverage is incomplete', () => {
    const bought = { ...fill('buy', at(20), 'buy', '1', '10', '10'), costsComplete: false };
    const report = calculateAccounting(
      base({
        closingCash: [balance('A', 'EUR', '-10')],
        cashPostings: [posting('purchase', at(20), '-10', 'trade-principal')],
        sourceInstants: { buy: at(20) },
        books: [book([], [bought], null, '12')],
      }),
    );
    expect(report.breakdown.fees.value).toBeNull();
    expect(report.breakdown.fees.reasons).toContain('missing_fees');
    expect(report.reconciliation.performance.value).toBeNull();
    expect(report.reconciliation.performance.reasons).toContain('missing_fees');
    expect(amount(report.breakdown.tradingPnl)).toBe('2');
    expect(report.reconciliation.variance.value).toBeNull();
  });
});

describe('profitable holding transfers across a selected accounting boundary', () => {
  const acquired = fill('acquired', '2025-12-31T12:00:00Z', 'buy', '10', '20', '200');
  const pair = prepareHoldingTransfer(inventory([acquired]), {
    transferId: 'holding-transfer',
    departureId: 'departure',
    receiptId: 'receipt',
    destinationScope: inventory([], 'B').scope,
    sourceRevision: '2',
    destinationSourceRevision: '2',
    economicOrder: { instant: at(20), sequence: '2' },
    selections: [{ lotId: 'acquired', quantity: '4', destinationLotId: 'B-slice' }],
  });
  const sold = fill('sold', at(40), 'sell', '2', '35', '70');
  function fixture() {
    return base({
      accountIds: ['A', 'B'],
      openingCash: [balance('A', 'EUR', '800'), balance('B', 'EUR', '0')],
      closingCash: [balance('A', 'EUR', '800'), balance('B', 'EUR', '70')],
      cashPostings: [posting('sale', at(40), '70', 'trade-principal', 'EUR', 'B')],
      sourceInstants: { acquired: acquired.economicOrder.instant!, sold: at(40) },
      books: [
        book([acquired], [acquired, pair.departure], '25', '30'),
        book([], [pair.receipt, sold], null, '35', 'B'),
      ],
      holdingTransfers: [
        {
          id: 'holding-transfer',
          sourceAccountId: 'A',
          destinationAccountId: 'B',
          instrumentId: 'share',
          currencyId: 'EUR',
          economicAt: at(20),
          slices: pair.departure.slices,
          mark: { id: 'transfer-mark', price: '30', observedAt: at(20) },
        },
      ],
    });
  }
  it('does not turn an inherited gain into receiving-account performance', () => {
    const source = fixture();
    const report = calculateAccounting({
      ...source,
      accountIds: ['B'],
      openingCash: source.openingCash.filter((item) => item.accountId === 'B'),
      closingCash: source.closingCash.filter((item) => item.accountId === 'B'),
      books: source.books.filter((item) => item.accountId === 'B'),
    });
    expect(amount(report.closing.equity)).toBe('140');
    expect(amount(report.breakdown.boundaryTransfers)).toBe('120');
    expect(amount(report.breakdown.realizedTradingPnl)).toBe('30');
    expect(amount(report.breakdown.unrealizedTradingPnlChange)).toBe('-10');
    expect(amount(report.breakdown.tradingPnl)).toBe('20');
    expect(amount(report.reconciliation.performance)).toBe('20');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('does not erase accrued gain when a source account transfers the profitable slice', () => {
    const source = fixture();
    const report = calculateAccounting({
      ...source,
      accountIds: ['A'],
      openingCash: source.openingCash.filter((item) => item.accountId === 'A'),
      closingCash: source.closingCash.filter((item) => item.accountId === 'A'),
      cashPostings: [],
      books: source.books.filter((item) => item.accountId === 'A'),
    });
    expect(amount(report.opening.equity)).toBe('1050');
    expect(amount(report.closing.equity)).toBe('980');
    expect(amount(report.breakdown.boundaryTransfers)).toBe('-120');
    expect(amount(report.breakdown.tradingPnl)).toBe('50');
    expect(amount(report.reconciliation.performance)).toBe('50');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('cancels both directions without requiring an irrelevant transfer-time mark in consolidation', () => {
    const source = fixture();
    const report = calculateAccounting({
      ...source,
      holdingTransfers: source.holdingTransfers.map((item) => ({ ...item, mark: null })),
    });
    expect(amount(report.breakdown.boundaryTransfers)).toBe('0');
    expect(amount(report.breakdown.tradingPnl)).toBe('70');
    expect(amount(report.reconciliation.performance)).toBe('70');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('makes scope-capital and complete reconciliation unavailable if the transfer mark is missing', () => {
    const source = fixture();
    const report = calculateAccounting({
      ...source,
      accountIds: ['B'],
      openingCash: [balance('B', 'EUR', '0')],
      closingCash: [balance('B', 'EUR', '70')],
      books: source.books.filter((item) => item.accountId === 'B'),
      holdingTransfers: source.holdingTransfers.map((item) => ({ ...item, mark: null })),
    });
    expect(amount(report.closing.equity)).toBe('140');
    expect(report.breakdown.boundaryTransfers.value).toBeNull();
    expect(report.reconciliation.performance.value).toBeNull();
    expect(report.reconciliation.variance.value).toBeNull();
  });
});

describe('accounting ownership, evidence and exact decimal invariants', () => {
  it('rejects duplicate selected accounts, cash effects and out-of-interval activity', () => {
    expect(() => calculateAccounting(base({ accountIds: ['A', 'A'] }))).toThrow(
      FinancialArithmeticError,
    );
    const paid = posting('same', at(1), '1', 'income');
    expect(() => calculateAccounting(base({ cashPostings: [paid, paid] }))).toThrow(
      FinancialArithmeticError,
    );
    expect(() =>
      calculateAccounting(base({ cashPostings: [posting('boundary', from, '1', 'income')] })),
    ).toThrow(FinancialArithmeticError);
    expect(() =>
      calculateAccounting(
        base({ cashPostings: [posting('future', '2026-01-02T12:00:00Z', '1', 'income')] }),
      ),
    ).toThrow(FinancialArithmeticError);
  });
  it('rejects campaign inventory, conflicting revisions, future marks and invalid receipt chronology', () => {
    const empty = book([], [], null, null);
    expect(() =>
      calculateAccounting(
        base({
          books: [
            {
              ...empty,
              closingInventory: { ...empty.closingInventory, population: 'campaign-attribution' },
            },
          ],
        }),
      ),
    ).toThrow(FinancialArithmeticError);
    expect(() =>
      calculateAccounting(
        base({
          books: [
            { ...empty, closingInventory: { ...empty.closingInventory, sourceRevision: '998' } },
          ],
        }),
      ),
    ).toThrow(FinancialArithmeticError);
    expect(() =>
      calculateAccounting(
        base({
          books: [
            {
              ...empty,
              closingMark: { id: 'future', price: '1', observedAt: '2026-01-02T12:00:00Z' },
            },
          ],
        }),
      ),
    ).toThrow(FinancialArithmeticError);
    expect(() =>
      calculateAccounting(
        base({
          cashTransfers: [
            {
              id: 'invalid',
              sourceAccountId: 'A',
              destinationAccountId: 'B',
              currencyId: 'EUR',
              amount: '1',
              departedAt: at(20),
              receivedAt: at(10),
            },
          ],
        }),
      ),
    ).toThrow(FinancialArithmeticError);
  });
  it('retains missing source coverage instead of reporting a clean reconciliation', () => {
    const report = calculateAccounting(
      base({
        coverage: {
          reasons: ['incomplete_source_population'],
          missingReferences: ['statement-gap'],
        },
      }),
    );
    expect(report.reconciliation.variance.value).toBeNull();
    expect(report.reconciliation.variance.reasons).toContain('incomplete_source_population');
  });
  it('detects incomplete cash movement evidence rather than using the discrepancy as FX', () => {
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'EUR', '100')],
        closingCash: [balance('A', 'EUR', '105')],
      }),
    );
    expect(report.breakdown.cashFx.value).toBeNull();
    expect(report.breakdown.cashFx.reasons).toContain('incomplete_cash');
    expect(report.reconciliation.variance.value).toBeNull();
  });
  it('does not mutate frozen source inventory or any historical observation', () => {
    const input = base({
      closingCash: [balance('A', 'EUR', '1')],
      cashPostings: [posting('income', at(1), '1', 'income')],
    });
    const freeze = (value: unknown): void => {
      if (value && typeof value === 'object') {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
      }
    };
    freeze(input);
    expect(amount(calculateAccounting(input).closing.equity)).toBe('1');
  });
  it('reconciles arbitrary whole-unit cash histories using an independent BigInt oracle', () => {
    const activity = fc.array(
      fc.record({
        kind: fc.constantFrom('deposit', 'withdrawal', 'income', 'fee', 'tax', 'expense'),
        amount: fc.integer({ min: 1, max: 100_000 }),
      }),
      { maxLength: 30 },
    );
    fc.assert(
      fc.property(activity, (events) => {
        let ending = 1000n;
        let capital = 0n;
        let result = 0n;
        const postings = events.map((event, index) => {
          const sign = ['withdrawal', 'fee', 'tax', 'expense'].includes(event.kind) ? -1n : 1n;
          const effect = BigInt(event.amount) * sign;
          ending += effect;
          if (['deposit', 'withdrawal'].includes(event.kind)) capital += effect;
          else result += effect;
          return posting(
            `event${index}`,
            at(index + 1),
            effect.toString(),
            event.kind as AccountingCashPosting['classification'],
          );
        });
        const report = calculateAccounting(
          base({
            openingCash: [balance('A', 'EUR', '1000')],
            closingCash: [balance('A', 'EUR', ending.toString())],
            cashPostings: postings,
          }),
        );
        expect(amount(report.breakdown.externalCashFlows)).toBe(capital.toString());
        expect(amount(report.reconciliation.performance)).toBe(result.toString());
        expect(amount(report.reconciliation.variance)).toBe('0');
      }),
      { seed: 73001, numRuns: 250 },
    );
  });
  it('conserves capital and excludes arbitrary owned-account transfers from consolidated performance', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (moved) => {
        const amountText = BigInt(moved).toString();
        const remaining = (1_000_000n - BigInt(moved)).toString();
        const endpoints = { sourceAccountId: 'A', destinationAccountId: 'B' };
        const report = calculateAccounting(
          base({
            accountIds: ['A', 'B'],
            openingCash: [balance('A', 'EUR', '1000000'), balance('B', 'EUR', '0')],
            closingCash: [balance('A', 'EUR', remaining), balance('B', 'EUR', amountText)],
            cashPostings: [
              { ...posting('source', at(1), `-${amountText}`, 'transfer'), ...endpoints },
              {
                ...posting('destination', at(1), amountText, 'transfer', 'EUR', 'B'),
                ...endpoints,
              },
            ],
          }),
        );
        expect(amount(report.closing.equity)).toBe('1000000');
        expect(amount(report.breakdown.boundaryTransfers)).toBe('0');
        expect(amount(report.reconciliation.performance)).toBe('0');
        expect(amount(report.reconciliation.variance)).toBe('0');
      }),
      { seed: 73002, numRuns: 200 },
    );
  });
  it('makes output rounding explicit while exact Decimal parts remain internally reconciled', () => {
    const native = '0.123456789012345678901234567890123456';
    const rate = '0.987654321098765432109876543210987654';
    const report = calculateAccounting(
      base({
        closingCash: [balance('A', 'USD', native)],
        cashPostings: [posting('income', at(1), native, 'income', 'USD')],
        fxObservations: [observation('rate', at(1), rate)],
      }),
    );
    expect(amount(report.reconciliation.variance)).toBe('0');
    const exact = decimalValue(native).times(decimalValue(rate)).toFixed(36);
    expect(decimalValue(amount(report.reconciliation.performance)).eq(exact)).toBe(true);
    expect(report.reconciliation.roundingResidual.value).not.toBeNull();
  });
});

describe('accounting aggregate output boundaries', () => {
  it('returns explained overflow when multiple valid source amounts exceed the output envelope', () => {
    const maximum = '900000000000000000000000000000000000000000';
    const report = calculateAccounting(
      base({
        closingCash: [
          { ...balance('A', 'EUR', maximum), cashBucketId: 'first' },
          { ...balance('A', 'EUR', maximum), cashBucketId: 'second' },
        ],
        cashPostings: [
          posting('first-deposit', at(1), maximum, 'deposit'),
          posting('second-deposit', at(2), maximum, 'deposit'),
        ],
      }),
    );
    expect(report.closing.cash).toMatchObject({
      state: 'unavailable',
      value: null,
      reasons: ['numeric_overflow'],
    });
    expect(report.closing.equity.value).toBeNull();
    expect(report.closing.cashByCurrency).toEqual([
      { currencyId: 'EUR', amount: null, reasons: ['numeric_overflow'] },
    ]);
    expect(amount(report.breakdown.cashFx)).toBe('0');
    expect(amount(report.reconciliation.performance)).toBe('0');
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
  it('accepts a derived per-bucket SQL aggregate without weakening source-amount validation', () => {
    const total = '1800000000000000000000000000000000000000000';
    const report = calculateAccounting(
      base({
        openingCash: [balance('A', 'EUR', total)],
        closingCash: [balance('A', 'EUR', total)],
      }),
    );
    expect(report.opening.cash.value).toBeNull();
    expect(report.opening.cash.reasons).toContain('numeric_overflow');
    expect(amount(report.reconciliation.navChange)).toBe('0');
    expect(amount(report.breakdown.cashFx)).toBe('0');
  });
  it('keeps sub-quantum monetary FX exact until the named output boundary', () => {
    const tiny = '0.000000000000000000000000000000000001';
    const report = calculateAccounting(
      base({
        closingCash: [balance('A', 'USD', tiny)],
        cashPostings: [posting('tiny-deposit', at(1), tiny, 'deposit', 'USD')],
        fxObservations: [
          observation('event-rate', at(1), '1.5'),
          observation('end-rate', to, '2.5'),
        ],
      }),
    );
    expect(amount(report.breakdown.cashFx)).toBe(tiny);
    expect(amount(report.reconciliation.roundingResidual)).toBe('-' + tiny);
    expect(amount(report.reconciliation.performance)).toBe(tiny);
    expect(amount(report.reconciliation.variance)).toBe('0');
  });
});
