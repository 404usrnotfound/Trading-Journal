import {
  decimal,
  decimalValue,
  FinancialArithmeticError,
  FINANCIAL_CALCULATION_MANIFEST,
  quantizeDecimal,
} from './decimal.js';
import { valueInventory } from './inventory.js';
import { positiveDecimal } from './money.js';
import { cashFx, conversionDifference, instantNanoseconds, selectFxRate } from './valuation.js';
import type { FxRateSelection } from './valuation.js';
import type {
  AccountingBook,
  AccountingCashBalance,
  AccountingCurrencyMetric,
  AccountingInput,
  AccountingMark,
  AccountingMetric,
  AccountingReport,
} from './accounting-types.js';
import type {
  InventoryMetric,
  InventoryReplayResult,
  PinnedInventoryRate,
} from './inventory-types.js';

type WorkingDecimal = ReturnType<typeof decimalValue>;
type Work = Readonly<{
  amount: WorkingDecimal;
  known: boolean;
  reasons: readonly string[];
  references: readonly string[];
}>;
const zero = () => decimalValue('0');
const known = (amount: string | WorkingDecimal = '0'): Work => ({
  amount: typeof amount === 'string' ? decimalValue(amount) : amount,
  known: true,
  reasons: [],
  references: [],
});
const missing = (reason: string, reference: string): Work => ({
  amount: zero(),
  known: false,
  reasons: [reason],
  references: [reference],
});
function sum(items: readonly Work[]): Work {
  return {
    amount: items.reduce((total, item) => total.plus(item.amount), zero()),
    known: items.length === 0 || items.some((item) => item.known),
    reasons: [...new Set(items.flatMap((item) => item.reasons))].sort(),
    references: [...new Set(items.flatMap((item) => item.references))].sort(),
  };
}
function negate(item: Work): Work {
  return { ...item, amount: item.amount.negated() };
}
function sourceMetric(metric: InventoryMetric, reference: string): Work {
  return metric.status === 'available' && metric.value !== null
    ? known(metric.value)
    : {
        amount: zero(),
        known: false,
        reasons: metric.reasons.length ? metric.reasons : ['incomplete_inventory'],
        references: [reference],
      };
}
function render(item: Work, currencyId: string): AccountingMetric {
  try {
    const amount = quantizeDecimal(item.amount);
    const complete = item.reasons.length === 0 && item.references.length === 0;
    return {
      state: complete ? 'available' : item.known ? 'partial' : 'unavailable',
      value: complete ? amount : null,
      knownSubtotal: amount,
      currencyId,
      reasons: [...new Set(item.reasons)].sort(),
      missingReferences: [...new Set(item.references)].sort(),
    };
  } catch (error) {
    if (!(error instanceof FinancialArithmeticError) || error.code !== 'numeric_overflow')
      throw error;
    return {
      state: 'unavailable',
      value: null,
      knownSubtotal: decimal('0'),
      currencyId,
      reasons: [...new Set([...item.reasons, 'numeric_overflow'])].sort(),
      missingReferences: [...new Set([...item.references, currencyId])].sort(),
    };
  }
}
function fail(message: string): never {
  throw new FinancialArithmeticError('invalid_allocation', message);
}
function nativeGroups(items: readonly AccountingCashBalance[]): Map<string, WorkingDecimal> {
  const groups = new Map<string, WorkingDecimal>();
  for (const item of items) {
    // These are derived database balances, not source command amounts. A sum of valid
    // source postings can exceed the storage envelope; keep working precision until output.
    if (
      typeof item.amount !== 'string' ||
      item.amount.length > 512 ||
      !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(item.amount) ||
      item.amount.replace(/^-/u, '').split('.')[0]!.length > 100 ||
      (item.amount.split('.')[1]?.length ?? 0) > 36
    )
      fail('Cash balances require bounded exact derived decimal text.');
    groups.set(item.currencyId, (groups.get(item.currencyId) ?? zero()).plus(item.amount));
  }
  return groups;
}

/** Coherent dated accounting, independent from campaign attribution and external providers. */
export function calculateAccounting(input: AccountingInput): AccountingReport {
  const start = instantNanoseconds(input.from);
  const end = instantNanoseconds(input.to);
  const selected = new Set(input.accountIds);
  if (
    end <= start ||
    selected.size !== input.accountIds.length ||
    selected.size === 0 ||
    selected.size > 100 ||
    !input.reportingCurrencyId ||
    !/^\d+$/u.test(input.sourceRevision) ||
    !Number.isSafeInteger(input.pricePolicy.maxAgeMilliseconds) ||
    input.pricePolicy.maxAgeMilliseconds < 0
  )
    fail('Accounting requires a unique bounded account population and valid dated context.');
  const within = (at: string) => {
    const instant = instantNanoseconds(at);
    return instant > start && instant <= end;
  };
  const sourceIds = new Set<string>();
  const fxDependencies: { componentId: string; selection: FxRateSelection }[] = [];
  const priceDependencies: { componentId: string; observationId: string; observedAt: string }[] =
    [];
  const rate = (
    currencyId: string,
    at: string,
    componentId: string,
    pinned?: PinnedInventoryRate,
  ): FxRateSelection => {
    let result: FxRateSelection;
    if (
      currencyId !== input.reportingCurrencyId &&
      pinned?.baseCurrencyId === currencyId &&
      pinned.quoteCurrencyId === input.reportingCurrencyId
    ) {
      if (!pinned.observationId) fail('A pinned financial rate requires source evidence.');
      result = {
        state: 'available',
        value: {
          baseCurrencyId: currencyId,
          quoteCurrencyId: input.reportingCurrencyId,
          rate: positiveDecimal(pinned.rate),
          requestedAt: at,
          observationIds: [pinned.observationId],
          route: 'manual-direct',
          policyId: input.fxPolicy.id,
          reviewedContextId: `financial-source:${componentId}`,
        },
      };
    } else {
      result = selectFxRate(
        currencyId,
        input.reportingCurrencyId,
        at,
        input.fxPolicy,
        input.fxObservations,
      );
    }
    fxDependencies.push({ componentId, selection: result });
    return result;
  };
  const translate = (
    amount: WorkingDecimal,
    currencyId: string | null,
    at: string,
    componentId: string,
    pinned?: PinnedInventoryRate,
  ): Work => {
    if (currencyId === null) return missing('incompatible_currency', componentId);
    // A provably empty monetary component needs no unavailable foreign-currency quote.
    if (amount.isZero()) return known();
    const selection = rate(currencyId, at, componentId, pinned);
    return selection.state === 'available'
      ? known(amount.times(decimalValue(selection.value.rate)))
      : {
          amount: zero(),
          known: false,
          reasons: selection.reasons,
          references: [...selection.missingReferences, componentId],
        };
  };
  const mark = (
    candidate: AccountingMark | null,
    at: string,
    reference: string,
  ): AccountingMark | null => {
    if (candidate === null) return null;
    const observed = instantNanoseconds(candidate.observedAt);
    const requested = instantNanoseconds(at);
    if (observed > requested) fail('A financial mark cannot come from the future.');
    if (requested - observed > BigInt(input.pricePolicy.maxAgeMilliseconds) * 1_000_000n)
      return null;
    if (decimalValue(candidate.price).isNegative()) fail('A financial mark must be nonnegative.');
    priceDependencies.push({
      componentId: reference,
      observationId: candidate.id,
      observedAt: candidate.observedAt,
    });
    return candidate;
  };
  const grossParts = (
    reference: string,
    currencyId: string | null,
    signedBasis: WorkingDecimal | null,
    signedValue: WorkingDecimal | null,
    basisAt: string | null,
    valueAt: string,
    basisPin?: PinnedInventoryRate,
    valuePin?: PinnedInventoryRate,
  ): { trading: Work; holding: Work } => {
    if (signedBasis === null)
      return {
        trading: missing('unknown_basis', reference),
        holding: missing('unknown_basis', reference),
      };
    if (signedValue === null)
      return {
        trading: missing('missing_mark', reference),
        holding: missing('missing_mark', reference),
      };
    const trading = translate(
      signedValue.minus(signedBasis),
      currencyId,
      valueAt,
      `${reference}:trading`,
      valuePin,
    );
    if (currencyId === null)
      return { trading, holding: missing('incompatible_currency', reference) };
    if (currencyId === input.reportingCurrencyId || signedBasis.isZero())
      return { trading, holding: known() };
    if (basisAt === null) return { trading, holding: missing('missing_basis_time', reference) };
    const basisRate = rate(currencyId, basisAt, `${reference}:basis`, basisPin);
    const endRate = rate(currencyId, valueAt, `${reference}:value`, valuePin);
    if (basisRate.state !== 'available' || endRate.state !== 'available') {
      const absent = [basisRate, endRate].filter((selection) => selection.state === 'unavailable');
      return {
        trading,
        holding: {
          amount: zero(),
          known: false,
          reasons: absent.flatMap((selection) => selection.reasons),
          references: absent.flatMap((selection) => selection.missingReferences).concat(reference),
        },
      };
    }
    return {
      trading,
      holding: known(
        signedBasis.times(
          decimalValue(endRate.value.rate).minus(decimalValue(basisRate.value.rate)),
        ),
      ),
    };
  };

  const openingCash = nativeGroups(input.openingCash);
  const closingCash = nativeGroups(input.closingCash);
  for (const balances of [input.openingCash, input.closingCash]) {
    const ids = new Set<string>();
    for (const balance of balances) {
      if (
        !selected.has(balance.accountId) ||
        !balance.cashBucketId ||
        ids.has(balance.cashBucketId)
      )
        fail('Cash boundaries contain duplicate or out-of-scope buckets.');
      ids.add(balance.cashBucketId);
      sourceIds.add(balance.cashBucketId);
    }
  }
  const cashOpeningValue = sum(
    [...openingCash].map(([currency, amount]) =>
      translate(amount, currency, input.from, `cash:opening:${currency}`),
    ),
  );
  const cashClosingValue = sum(
    [...closingCash].map(([currency, amount]) =>
      translate(amount, currency, input.to, `cash:closing:${currency}`),
    ),
  );
  const costsIncomplete: Work[] = [];
  const openingHoldingValue: Work[] = [];
  const closingHoldingValue: Work[] = [];
  const openingTrading: Work[] = [];
  const closingTrading: Work[] = [];
  const openingHoldingFx: Work[] = [];
  const closingHoldingFx: Work[] = [];
  const realizedTrading: Work[] = [];
  const realizedHoldingFx: Work[] = [];
  const nativeRealized = new Map<string, Work[]>();
  const nativeOpeningUnrealized = new Map<string, Work[]>();
  const nativeClosingUnrealized = new Map<string, Work[]>();
  const addNative = (target: Map<string, Work[]>, currency: string | null, item: Work) => {
    if (currency !== null) target.set(currency, [...(target.get(currency) ?? []), item]);
  };
  const bookIds = new Set<string>();
  for (const book of input.books) {
    if (!selected.has(book.accountId) || !book.id || bookIds.has(book.id))
      fail('Holding books contain duplicate or out-of-scope ownership.');
    bookIds.add(book.id);
    sourceIds.add(book.id);
    for (const boundary of ['opening', 'closing'] as const) {
      const inventory = boundary === 'opening' ? book.openingInventory : book.closingInventory;
      validateInventory(book, inventory, input.sourceRevision);
      const asOf = boundary === 'opening' ? input.from : input.to;
      const candidate = boundary === 'opening' ? book.openingMark : book.closingMark;
      const chosen = mark(candidate, asOf, `${book.id}:${boundary}`);
      const value = valueInventory(inventory, {
        mark:
          chosen && book.multiplier !== null
            ? { id: chosen.id, price: chosen.price, multiplier: book.multiplier, instant: asOf }
            : null,
      });
      const nativeMarked = sourceMetric(value.markedValue, `${book.id}:${boundary}:mark`);
      if (nativeMarked.reasons.length === 0 && chosen !== null && book.multiplier !== null) {
        // Retain the working mark before reporting translation. The native metric's
        // quantization is an output boundary, not an extra economic settlement.
        const workingMark = inventory.lots.reduce(
          (total, lot) =>
            total.plus(
              decimalValue(lot.remainingQuantity)
                .times(decimalValue(lot.multiplier))
                .times(decimalValue(chosen.price))
                .times(lot.direction === 'long' ? '1' : '-1'),
            ),
          zero(),
        );
        (boundary === 'opening' ? openingHoldingValue : closingHoldingValue).push(
          translate(workingMark, book.currencyId, asOf, `${book.id}:${boundary}:value`),
        );
      } else {
        const holdingValue = nativeMarked.reasons.length
          ? nativeMarked
          : translate(nativeMarked.amount, book.currencyId, asOf, `${book.id}:${boundary}:value`);
        (boundary === 'opening' ? openingHoldingValue : closingHoldingValue).push(holdingValue);
      }
      addNative(
        boundary === 'opening' ? nativeOpeningUnrealized : nativeClosingUnrealized,
        book.currencyId,
        sourceMetric(value.unrealizedGross, `${book.id}:${boundary}:unrealized`),
      );
      const tradingParts: Work[] = [];
      const fxParts: Work[] = [];
      if (
        inventory.openQuantity.status !== 'available' ||
        inventory.status === 'unsupported' ||
        inventory.reasons.includes('ambiguous_chronology')
      ) {
        tradingParts.push(missing(inventory.reasons[0] ?? 'incomplete_inventory', book.id));
        fxParts.push(missing(inventory.reasons[0] ?? 'incomplete_inventory', book.id));
      } else {
        for (const lot of inventory.lots) {
          if (decimalValue(lot.remainingQuantity).isZero()) continue;
          sourceIds.add(lot.sourceId);
          const sign = lot.direction === 'long' ? '1' : '-1';
          const parts = grossParts(
            `${book.id}:${boundary}:${lot.id}`,
            book.currencyId,
            lot.remainingPrincipal === null
              ? null
              : decimalValue(lot.remainingPrincipal).times(sign),
            chosen === null
              ? null
              : decimalValue(lot.remainingQuantity)
                  .times(decimalValue(lot.multiplier))
                  .times(decimalValue(chosen.price))
                  .times(sign),
            input.sourceInstants[lot.sourceId] ?? lot.economicOrder.instant,
            asOf,
            lot.basisReportingFx,
          );
          tradingParts.push(parts.trading);
          fxParts.push(parts.holding);
          const acquired = input.sourceInstants[lot.sourceId] ?? lot.economicOrder.instant;
          if (
            boundary === 'closing' &&
            acquired !== null &&
            acquired !== undefined &&
            within(acquired) &&
            !lot.costsComplete
          )
            costsIncomplete.push(missing('missing_fees', lot.sourceId));
        }
      }
      (boundary === 'opening' ? openingTrading : closingTrading).push(sum(tradingParts));
      (boundary === 'opening' ? openingHoldingFx : closingHoldingFx).push(sum(fxParts));
    }
    const inventory = book.closingInventory;
    if (
      inventory.status === 'unsupported' ||
      inventory.openQuantity.status !== 'available' ||
      inventory.reasons.includes('ambiguous_chronology')
    ) {
      realizedTrading.push(missing(inventory.reasons[0] ?? 'incomplete_inventory', book.id));
      realizedHoldingFx.push(missing(inventory.reasons[0] ?? 'incomplete_inventory', book.id));
      addNative(
        nativeRealized,
        book.currencyId,
        missing(inventory.reasons[0] ?? 'incomplete_inventory', book.id),
      );
    } else {
      const nativeMatches: Work[] = [];
      for (const match of inventory.matches) {
        if (match.economicOrder.instant === null || !within(match.economicOrder.instant)) continue;
        sourceIds.add(match.openingSourceId);
        sourceIds.add(match.closingSourceId);
        const sign = match.direction === 'long' ? '1' : '-1';
        const parts = grossParts(
          `${book.id}:match:${match.id}`,
          book.currencyId,
          match.consumedPrincipal === null
            ? null
            : decimalValue(match.consumedPrincipal).times(sign),
          decimalValue(match.exitPrincipal).times(sign),
          input.sourceInstants[match.openingSourceId] ?? null,
          match.economicOrder.instant,
          match.basisReportingFx,
          match.exitReportingFx,
        );
        realizedTrading.push(parts.trading);
        realizedHoldingFx.push(parts.holding);
        nativeMatches.push(sourceMetric(match.grossPnl, match.id));
        if (!match.costsComplete)
          costsIncomplete.push(missing('missing_fees', match.closingSourceId));
      }
      addNative(nativeRealized, book.currencyId, sum(nativeMatches));
    }
  }

  const externalFlows: Work[] = [];
  const boundaryTransfers: Work[] = [];
  const openingAdjustments: Work[] = [];
  const income: Work[] = [];
  const fees: Work[] = [];
  const expenses: Work[] = [];
  const taxes: Work[] = [];
  const unresolved: Work[] = [];
  const postingIds = new Set<string>();
  for (const posting of input.cashPostings) {
    if (
      !selected.has(posting.accountId) ||
      !posting.id ||
      postingIds.has(posting.id) ||
      !within(posting.economicAt)
    )
      fail('Cash activity contains duplicate, out-of-scope or out-of-interval effects.');
    postingIds.add(posting.id);
    sourceIds.add(posting.eventId);
    const amount = decimalValue(posting.amount);
    const effect = () =>
      translate(
        amount,
        posting.currencyId,
        posting.economicAt,
        `posting:${posting.id}`,
        posting.reportingFx,
      );
    switch (posting.classification) {
      case 'deposit':
      case 'withdrawal':
        externalFlows.push(effect());
        break;
      case 'opening':
        openingAdjustments.push(effect());
        break;
      case 'income':
        income.push(effect());
        break;
      case 'fee':
        fees.push(negate(effect()));
        break;
      case 'expense':
        expenses.push(negate(effect()));
        break;
      case 'tax':
        taxes.push(negate(effect()));
        break;
      case 'transfer':
        if (!posting.sourceAccountId || !posting.destinationAccountId)
          unresolved.push(missing('unknown_transfer_scope', posting.eventId));
        else if (!(
          selected.has(posting.sourceAccountId) && selected.has(posting.destinationAccountId)
        ))
          boundaryTransfers.push(effect());
        break;
      case 'unresolved':
        unresolved.push(missing('unresolved_cash_classification', posting.eventId));
        break;
      case 'trade-principal':
      case 'fx-conversion':
      case 'settlement':
      case 'reclassification':
        break;
    }
  }

  const scopeTradingAdjustments: Work[] = [];
  const scopeHoldingFxAdjustments: Work[] = [];
  const transferIds = new Set<string>();
  for (const transfer of input.holdingTransfers) {
    if (!transfer.id || transferIds.has(transfer.id) || !within(transfer.economicAt))
      fail('Holding transfers require unique in-period identities.');
    transferIds.add(transfer.id);
    sourceIds.add(transfer.id);
    const sourceSelected = selected.has(transfer.sourceAccountId);
    const destinationSelected = selected.has(transfer.destinationAccountId);
    if (sourceSelected === destinationSelected) continue;
    const chosen = mark(transfer.mark, transfer.economicAt, `holding-transfer:${transfer.id}`);
    const direction = sourceSelected ? '-1' : '1';
    for (const slice of transfer.slices) {
      sourceIds.add(slice.sourceId);
      const sign = slice.direction === 'long' ? '1' : '-1';
      const signedValue =
        chosen === null
          ? null
          : decimalValue(slice.quantity)
              .times(decimalValue(slice.multiplier))
              .times(decimalValue(chosen.price))
              .times(sign);
      boundaryTransfers.push(
        signedValue === null
          ? missing('missing_mark', transfer.id)
          : translate(
              signedValue.times(direction),
              transfer.currencyId,
              transfer.economicAt,
              `holding-transfer:${transfer.id}:${slice.id}:flow`,
            ),
      );
      const parts = grossParts(
        `holding-transfer:${transfer.id}:${slice.id}`,
        transfer.currencyId,
        slice.bookedPrincipal === null ? null : decimalValue(slice.bookedPrincipal).times(sign),
        signedValue,
        input.sourceInstants[slice.sourceId] ?? slice.economicOrder.instant,
        transfer.economicAt,
        slice.basisReportingFx,
      );
      scopeTradingAdjustments.push(sourceSelected ? parts.trading : negate(parts.trading));
      scopeHoldingFxAdjustments.push(sourceSelected ? parts.holding : negate(parts.holding));
    }
  }
  for (const opening of input.holdingOpenings) {
    if (!selected.has(opening.accountId) || !within(opening.economicAt))
      fail('Holding openings must belong to the selected interval and accounts.');
    sourceIds.add(opening.id);
    const chosen = mark(opening.mark, opening.economicAt, `holding-opening:${opening.id}`);
    const sign = opening.direction === 'long' ? '1' : '-1';
    const signedValue =
      chosen === null || opening.multiplier === null
        ? null
        : decimalValue(opening.quantity)
            .times(decimalValue(opening.multiplier))
            .times(decimalValue(chosen.price))
            .times(sign);
    openingAdjustments.push(
      signedValue === null
        ? missing('missing_mark', opening.id)
        : translate(
            signedValue,
            opening.currencyId,
            opening.economicAt,
            `holding-opening:${opening.id}:capital`,
          ),
    );
    const parts = grossParts(
      `holding-opening:${opening.id}`,
      opening.currencyId,
      opening.bookedPrincipal === null ? null : decimalValue(opening.bookedPrincipal).times(sign),
      signedValue,
      opening.economicAt,
      opening.economicAt,
      opening.basisReportingFx,
    );
    scopeTradingAdjustments.push(negate(parts.trading));
    scopeHoldingFxAdjustments.push(negate(parts.holding));
  }

  const transitOpening = new Map<string, WorkingDecimal>();
  const transitClosing = new Map<string, WorkingDecimal>();
  const transitMovements = new Map<string, { id: string; amount: string; economicAt: string }[]>();
  const cashTransferIds = new Set<string>();
  for (const transfer of input.cashTransfers) {
    if (!transfer.id || cashTransferIds.has(transfer.id))
      fail('Cash transfers require unique identities.');
    cashTransferIds.add(transfer.id);
    const departure = instantNanoseconds(transfer.departedAt);
    const receipt = transfer.receivedAt === null ? null : instantNanoseconds(transfer.receivedAt);
    if (receipt !== null && receipt < departure)
      fail('A transfer receipt cannot precede departure.');
    const amount = decimalValue(positiveDecimal(transfer.amount));
    if (!(selected.has(transfer.sourceAccountId) && selected.has(transfer.destinationAccountId)))
      continue;
    sourceIds.add(transfer.id);
    if (departure <= start && (receipt === null || receipt > start))
      transitOpening.set(
        transfer.currencyId,
        (transitOpening.get(transfer.currencyId) ?? zero()).plus(amount),
      );
    if (departure <= end && (receipt === null || receipt > end))
      transitClosing.set(
        transfer.currencyId,
        (transitClosing.get(transfer.currencyId) ?? zero()).plus(amount),
      );
    const movements = transitMovements.get(transfer.currencyId) ?? [];
    if (within(transfer.departedAt))
      movements.push({
        id: `${transfer.id}:departure`,
        amount: decimal(transfer.amount),
        economicAt: transfer.departedAt,
      });
    if (transfer.receivedAt !== null && within(transfer.receivedAt))
      movements.push({
        id: `${transfer.id}:receipt`,
        amount: quantizeDecimal(amount.negated()),
        economicAt: transfer.receivedAt,
      });
    transitMovements.set(transfer.currencyId, movements);
  }
  const transitOpeningValue = sum(
    [...transitOpening].map(([currency, amount]) =>
      translate(amount, currency, input.from, `transit:opening:${currency}`),
    ),
  );
  const transitClosingValue = sum(
    [...transitClosing].map(([currency, amount]) =>
      translate(amount, currency, input.to, `transit:closing:${currency}`),
    ),
  );
  const monetaryFx = (
    kind: 'cash' | 'transit',
    opening: Map<string, WorkingDecimal>,
    closing: Map<string, WorkingDecimal>,
    activity: Map<
      string,
      readonly {
        id: string;
        amount: string;
        economicAt: string;
        reportingFx?: PinnedInventoryRate;
      }[]
    >,
  ): Work => {
    const currencies = new Set([...opening.keys(), ...closing.keys(), ...activity.keys()]);
    return sum(
      [...currencies].sort().map((currency): Work => {
        const fromAmount = opening.get(currency) ?? zero();
        const toAmount = closing.get(currency) ?? zero();
        const movements = activity.get(currency) ?? [];
        const nativeMovement = movements.reduce(
          (total, movement) => total.plus(decimalValue(movement.amount)),
          zero(),
        );
        if (!fromAmount.plus(nativeMovement).eq(toAmount))
          return missing(kind === 'cash' ? 'incomplete_cash' : 'incomplete_transit', currency);
        if (fromAmount.isZero() && toAmount.isZero() && movements.length === 0) return known();
        const openingRate = rate(currency, input.from, `${kind}:fx:opening:${currency}`);
        const endingRate = rate(currency, input.to, `${kind}:fx:closing:${currency}`);
        const selectedMovements = movements.map((movement) => ({
          ...movement,
          rate: rate(
            currency,
            movement.economicAt,
            `${kind}:fx:${movement.id}`,
            movement.reportingFx,
          ),
        }));
        if (
          openingRate.state === 'available' &&
          endingRate.state === 'available' &&
          selectedMovements.every((movement) => movement.rate.state === 'available')
        ) {
          try {
            const result = cashFx({
              currencyId: currency,
              reportingCurrencyId: input.reportingCurrencyId,
              startAt: input.from,
              endAt: input.to,
              openingBalance: quantizeDecimal(fromAmount),
              endingBalance: quantizeDecimal(toAmount),
              openingRate,
              endingRate,
              movements: selectedMovements,
              complete: true,
            });
            if (result.state === 'unavailable' && !result.reasons.includes('numeric_overflow'))
              return {
                amount: zero(),
                known: false,
                reasons: result.reasons,
                references: result.missingReferences,
              };
          } catch (error) {
            if (!(error instanceof FinancialArithmeticError) || error.code !== 'numeric_overflow')
              throw error;
            // A valid derived native balance can exceed the source storage envelope.
            // The working identity stays exact; each public result handles its own overflow.
          }
          return known(
            toAmount
              .times(decimalValue(endingRate.value.rate))
              .minus(fromAmount.times(decimalValue(openingRate.value.rate)))
              .minus(
                selectedMovements.reduce((total, movement) => {
                  if (movement.rate.state !== 'available') fail('Missing validated movement rate.');
                  return total.plus(
                    decimalValue(movement.amount).times(decimalValue(movement.rate.value.rate)),
                  );
                }, zero()),
              ),
          );
        }
        // Zero boundary amounts do not require a quote: the identity still uses every nonzero dated effect.
        return sum([
          translate(toAmount, currency, input.to, `${kind}:fx:end:${currency}`),
          negate(translate(fromAmount, currency, input.from, `${kind}:fx:start:${currency}`)),
          ...movements.map((movement) =>
            negate(
              translate(
                decimalValue(movement.amount),
                currency,
                movement.economicAt,
                `${kind}:fx:movement:${movement.id}`,
                movement.reportingFx,
              ),
            ),
          ),
        ]);
      }),
    );
  };
  const cashActivity = new Map<
    string,
    { id: string; amount: string; economicAt: string; reportingFx?: PinnedInventoryRate }[]
  >();
  for (const posting of input.cashPostings)
    cashActivity.set(posting.currencyId, [
      ...(cashActivity.get(posting.currencyId) ?? []),
      {
        id: posting.id,
        amount: posting.amount,
        economicAt: posting.economicAt,
        ...(posting.reportingFx ? { reportingFx: posting.reportingFx } : {}),
      },
    ]);
  const cashFxResult = monetaryFx('cash', openingCash, closingCash, cashActivity);
  const transitFxResult = monetaryFx('transit', transitOpening, transitClosing, transitMovements);
  const conversionEffects = sum(
    input.conversions.map((conversion): Work => {
      if (!within(conversion.economicAt))
        fail('Conversions must belong to the accounting interval.');
      sourceIds.add(conversion.id);
      const sourceRate = rate(
        conversion.sourceCurrencyId,
        conversion.economicAt,
        `conversion:${conversion.id}:source`,
      );
      const destinationRate = rate(
        conversion.destinationCurrencyId,
        conversion.economicAt,
        `conversion:${conversion.id}:destination`,
      );
      const result = conversionDifference({
        ...conversion,
        reportingCurrencyId: input.reportingCurrencyId,
        sourceRate,
        destinationRate,
      });
      return sourceRate.state === 'available' &&
        destinationRate.state === 'available' &&
        (result.state === 'available' || result.reasons.includes('numeric_overflow'))
        ? known(
            decimalValue(conversion.destinationAmount)
              .times(decimalValue(destinationRate.value.rate))
              .minus(
                decimalValue(conversion.sourceAmount).times(decimalValue(sourceRate.value.rate)),
              ),
          )
        : {
            amount: zero(),
            known: false,
            reasons: result.state === 'unavailable' ? result.reasons : ['missing_fx'],
            references:
              result.state === 'unavailable'
                ? [...result.missingReferences, conversion.id]
                : [conversion.id],
          };
    }),
  );
  const openingHoldings = sum(openingHoldingValue);
  const closingHoldings = sum(closingHoldingValue);
  const openingEquity = sum([cashOpeningValue, openingHoldings, transitOpeningValue]);
  const closingEquity = sum([cashClosingValue, closingHoldings, transitClosingValue]);
  const realized = sum(realizedTrading);
  const unrealizedChange = sum([
    ...closingTrading,
    ...openingTrading.map(negate),
    ...scopeTradingAdjustments,
  ]);
  const trading = sum([realized, unrealizedChange]);
  const holdingFxResult = sum([
    ...realizedHoldingFx,
    ...closingHoldingFx,
    ...openingHoldingFx.map(negate),
    ...scopeHoldingFxAdjustments,
  ]);
  const incomeResult = sum(income);
  const feeResult = sum([...fees, ...costsIncomplete]);
  const expenseResult = sum(expenses);
  const taxResult = sum(taxes);
  const externalResult = sum(externalFlows);
  const boundaryResult = sum(boundaryTransfers);
  const openingResult = sum(openingAdjustments);
  const capital = sum([externalResult, boundaryResult, openingResult]);
  const navChange = sum([closingEquity, negate(openingEquity)]);
  const performance = sum([navChange, negate(capital), ...costsIncomplete, ...unresolved]);
  const coverage: Work[] = input.coverage
    ? [
        {
          amount: zero(),
          known: false,
          reasons: input.coverage.reasons,
          references: input.coverage.missingReferences,
        },
      ]
    : [];
  const explained = sum([
    trading,
    holdingFxResult,
    cashFxResult,
    transitFxResult,
    conversionEffects,
    incomeResult,
    negate(feeResult),
    negate(expenseResult),
    negate(taxResult),
    ...unresolved,
    ...coverage,
  ]);
  const variance = sum([performance, negate(explained)]);
  const r = (item: Work) => render(item, input.reportingCurrencyId);
  const breakdown = {
    realizedTradingPnl: r(realized),
    unrealizedTradingPnlChange: r(unrealizedChange),
    tradingPnl: r(trading),
    holdingFx: r(holdingFxResult),
    cashFx: r(cashFxResult),
    transitFx: r(transitFxResult),
    conversionEffects: r(conversionEffects),
    income: r(incomeResult),
    fees: r(feeResult),
    expenses: r(expenseResult),
    taxes: r(taxResult),
    externalCashFlows: r(externalResult),
    boundaryTransfers: r(boundaryResult),
    openingAdjustments: r(openingResult),
  };
  const allDisplayed = [
    breakdown.tradingPnl,
    breakdown.holdingFx,
    breakdown.cashFx,
    breakdown.transitFx,
    breakdown.conversionEffects,
    breakdown.income,
    breakdown.fees,
    breakdown.expenses,
    breakdown.taxes,
  ];
  const performanceMetric = r(performance);
  const varianceMetric = r(variance);
  const openingEquityMetric = r(openingEquity);
  const closingEquityMetric = r(closingEquity);
  const displayedCapital = [
    breakdown.externalCashFlows,
    breakdown.boundaryTransfers,
    breakdown.openingAdjustments,
  ];
  const rounding =
    openingEquityMetric.value !== null &&
    closingEquityMetric.value !== null &&
    varianceMetric.value !== null &&
    [...allDisplayed, ...displayedCapital].every((item) => item.value !== null)
      ? known(
          decimalValue(closingEquityMetric.value)
            .minus(decimalValue(openingEquityMetric.value))
            .minus(
              displayedCapital.reduce(
                (total, item) => total.plus(decimalValue(item.value!)),
                zero(),
              ),
            )
            .minus(decimalValue(varianceMetric.value))
            .minus(
              allDisplayed.reduce(
                (total, item, index) =>
                  total.plus(decimalValue(item.value!).times(index >= 6 ? '-1' : '1')),
                zero(),
              ),
            ),
        )
      : missing('incomplete_reconciliation', 'rounding-residual');
  const nativeOutput = (groups: Map<string, Work[]>): AccountingCurrencyMetric[] =>
    [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currencyId, items]) => ({ currencyId, metric: render(sum(items), currencyId) }));
  const snapshot = (
    asOf: string,
    nativeCash: Map<string, WorkingDecimal>,
    cash: Work,
    holdings: Work,
    transit: Work,
    equity: Work,
    unrealized: Map<string, Work[]>,
  ) => ({
    asOf,
    cashByCurrency: [...nativeCash]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currencyId, amount]) => {
        const metric = render(known(amount), currencyId);
        return { currencyId, amount: metric.value, reasons: metric.reasons };
      }),
    cash: r(cash),
    holdings: r(holdings),
    transit: r(transit),
    equity: r(equity),
    netLiquidationValue: r(equity),
    unrealizedGrossByCurrency: nativeOutput(unrealized),
  });
  return {
    context: {
      accountIds: [...input.accountIds].sort(),
      ...(input.portfolioVersionId ? { portfolioVersionId: input.portfolioVersionId } : {}),
      reportingCurrencyId: input.reportingCurrencyId,
      sourceRevision: input.sourceRevision,
      from: input.from,
      to: input.to,
      fxPolicy: input.fxPolicy,
      pricePolicy: input.pricePolicy,
      manifest: FINANCIAL_CALCULATION_MANIFEST,
      accountingVersion: 'portfolio-accounting-v1',
    },
    opening: snapshot(
      input.from,
      openingCash,
      cashOpeningValue,
      openingHoldings,
      transitOpeningValue,
      openingEquity,
      nativeOpeningUnrealized,
    ),
    closing: snapshot(
      input.to,
      closingCash,
      cashClosingValue,
      closingHoldings,
      transitClosingValue,
      closingEquity,
      nativeClosingUnrealized,
    ),
    breakdown,
    native: {
      realizedGross: nativeOutput(nativeRealized),
      unrealizedGross: nativeOutput(nativeClosingUnrealized),
    },
    reconciliation: {
      navChange: r(navChange),
      netCapitalFlows: r(capital),
      performance: performanceMetric,
      explainedChange: r(explained),
      variance: varianceMetric,
      roundingResidual: r(rounding),
    },
    dependencies: {
      fx: fxDependencies,
      prices: priceDependencies,
      sourceIds: [...sourceIds].sort(),
    },
  };
}

function validateInventory(
  book: AccountingBook,
  inventory: InventoryReplayResult,
  sourceRevision: string,
): void {
  if (
    inventory.population !== 'account-inventory' ||
    inventory.scope.accountId !== book.accountId ||
    inventory.scope.instrumentId !== book.instrumentId ||
    inventory.scope.settlementCurrencyId !== book.currencyId ||
    inventory.sourceRevision !== sourceRevision
  )
    fail(
      'Accounting cannot mix campaign claims, inventory ownership, currencies or source revisions.',
    );
}
