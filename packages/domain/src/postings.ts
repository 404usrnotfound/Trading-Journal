import {
  decimal,
  decimalValue,
  FinancialArithmeticError,
  quantizeDecimal,
  subtractDecimal,
} from './decimal.js';
import type { DecimalString } from './index.js';
import { instantNanoseconds } from './valuation.js';

export type CashBucketKind = 'settled' | 'unsettled' | 'restricted' | 'collateral';
export type PostingTarget = Readonly<
  | { kind: 'cash'; bucketId: string; bucket: CashBucketKind }
  | { kind: 'control'; classification: string }
>;
export type FinancialPosting = Readonly<{
  id: string;
  eventId: string;
  accountId: string;
  currencyId: string;
  economicAt: string;
  amount: string;
  target: PostingTarget;
}>;
export type CashBalance = Readonly<{
  accountId: string;
  currencyId: string;
  bucketId: string;
  bucket: CashBucketKind;
  amount: DecimalString;
}>;

/** Cross-currency values can never cancel one another to establish event balance. */
export function assertBalancedPostings(postings: readonly FinancialPosting[]): void {
  const ids = new Set<string>();
  const events = new Map<string, { count: number; total: ReturnType<typeof decimalValue> }>();
  for (const posting of postings) {
    if (
      !posting.id ||
      ids.has(posting.id) ||
      !posting.eventId ||
      !posting.accountId ||
      !posting.currencyId
    )
      throw new FinancialArithmeticError(
        'invalid_allocation',
        'Invalid or duplicate posting identity.',
      );
    ids.add(posting.id);
    instantNanoseconds(posting.economicAt);
    if (posting.target.kind === 'cash' ? !posting.target.bucketId : !posting.target.classification)
      throw new FinancialArithmeticError(
        'invalid_allocation',
        'Posting requires exactly one valid target.',
      );
    const key = JSON.stringify([posting.eventId, posting.accountId, posting.currencyId]);
    const current = events.get(key) ?? { count: 0, total: decimalValue('0') };
    current.count += 1;
    current.total = current.total.plus(decimalValue(posting.amount));
    events.set(key, current);
  }
  if (
    events.size === 0 ||
    [...events.values()].some(({ count, total }) => count < 2 || !total.isZero())
  )
    throw new FinancialArithmeticError(
      'invalid_allocation',
      'Each account/event/currency must balance exactly.',
    );
}

/** Call with the visible original + reversal + replacement postings, never only effective originals. */
export function cashBalances(
  postings: readonly FinancialPosting[],
  filter: Readonly<{ accountIds?: readonly string[]; asOf?: string }> = {},
): CashBalance[] {
  const asOf = filter.asOf ? instantNanoseconds(filter.asOf) : undefined;
  const accounts = filter.accountIds ? new Set(filter.accountIds) : undefined;
  const balances = new Map<
    string,
    {
      accountId: string;
      currencyId: string;
      bucketId: string;
      bucket: CashBucketKind;
      total: ReturnType<typeof decimalValue>;
    }
  >();
  const seen = new Set<string>();
  for (const posting of postings) {
    if (seen.has(posting.id))
      throw new FinancialArithmeticError(
        'invalid_allocation',
        'Cash population contains a duplicate posting.',
      );
    seen.add(posting.id);
    const economicAt = instantNanoseconds(posting.economicAt);
    const amount = decimalValue(posting.amount);
    if (
      posting.target.kind !== 'cash' ||
      (accounts && !accounts.has(posting.accountId)) ||
      (asOf !== undefined && economicAt > asOf)
    )
      continue;
    const { bucketId, bucket } = posting.target;
    const key = JSON.stringify([posting.accountId, posting.currencyId, bucketId]);
    const current = balances.get(key) ?? {
      accountId: posting.accountId,
      currencyId: posting.currencyId,
      bucketId,
      bucket,
      total: decimalValue('0'),
    };
    if (current.bucket !== bucket)
      throw new FinancialArithmeticError(
        'invalid_allocation',
        'A cash bucket cannot change classification within a population.',
      );
    current.total = current.total.plus(amount);
    balances.set(key, current);
  }
  return [...balances.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, { total, ...identity }]) => ({ ...identity, amount: quantizeDecimal(total) }));
}

export function makeCashMovementPostings(
  input: Readonly<{
    eventId: string;
    accountId: string;
    currencyId: string;
    economicAt: string;
    amount: string;
    bucketId: string;
    bucket: CashBucketKind;
    classification: string;
  }>,
): FinancialPosting[] {
  const amount = decimal(input.amount);
  const base = {
    eventId: input.eventId,
    accountId: input.accountId,
    currencyId: input.currencyId,
    economicAt: input.economicAt,
  };
  const postings: FinancialPosting[] = [
    {
      ...base,
      id: `${input.eventId}:${input.accountId}:${input.currencyId}:cash`,
      amount,
      target: { kind: 'cash', bucketId: input.bucketId, bucket: input.bucket },
    },
    {
      ...base,
      id: `${input.eventId}:${input.accountId}:${input.currencyId}:control`,
      amount: subtractDecimal('0', amount),
      target: { kind: 'control', classification: input.classification },
    },
  ];
  assertBalancedPostings(postings);
  return postings;
}

export function makeSettlementPostings(
  input: Readonly<{
    eventId: string;
    accountId: string;
    currencyId: string;
    economicAt: string;
    amount: string;
    from: { bucketId: string; bucket: CashBucketKind };
    to: { bucketId: string; bucket: CashBucketKind };
  }>,
): FinancialPosting[] {
  if (input.from.bucketId === input.to.bucketId)
    throw new FinancialArithmeticError(
      'invalid_allocation',
      'A bucket move requires distinct source and destination.',
    );
  const amount = decimal(input.amount);
  const base = {
    eventId: input.eventId,
    accountId: input.accountId,
    currencyId: input.currencyId,
    economicAt: input.economicAt,
  };
  const postings: FinancialPosting[] = [
    {
      ...base,
      id: `${input.eventId}:from`,
      amount: subtractDecimal('0', amount),
      target: { kind: 'cash', ...input.from },
    },
    { ...base, id: `${input.eventId}:to`, amount, target: { kind: 'cash', ...input.to } },
  ];
  assertBalancedPostings(postings);
  return postings;
}

export function reversePostings(
  original: readonly FinancialPosting[],
  reversalEventId: string,
): FinancialPosting[] {
  assertBalancedPostings(original);
  const eventIds = new Set(original.map((posting) => posting.eventId));
  if (eventIds.size !== 1 || eventIds.has(reversalEventId) || !reversalEventId)
    throw new FinancialArithmeticError(
      'invalid_allocation',
      'Reversal requires one original and a distinct event identity.',
    );
  return original.map((posting) => ({
    ...posting,
    id: `${reversalEventId}:${posting.id}`,
    eventId: reversalEventId,
    amount: subtractDecimal('0', posting.amount),
  }));
}
