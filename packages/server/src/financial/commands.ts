import { randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import { decimal, decimalValue, quantizeDecimal } from '@journal/domain';
import { z } from 'zod';
import type { AuthorizationContext } from '../services.js';
import { financialInvalid, queryRows, type CommandState } from './repository.js';
import { financialTimestamp } from './reference-data.js';

export const financialUuid = z.uuid({ version: 'v4' });
export const financialInstant = financialTimestamp;
export const economicSequence = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .max(80);

export function assertEconomicInput(input: { economicAt: string; orderingKey: string }): void {
  financialInstant.parse(input.economicAt);
  economicSequence.parse(input.orderingKey);
}

export function assertPositive(value: string, label: string): string {
  const accepted = decimal(value);
  if (!decimalValue(accepted).gt('0')) throw financialInvalid(`${label} must be positive.`);
  return accepted;
}

export type CashBucketReference = {
  id: string;
  account_id: string;
  currency_id: string;
  kind: string;
};

export async function requireCashBucket(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
  accountId?: string,
  currencyId?: string,
): Promise<CashBucketReference> {
  financialUuid.parse(id);
  const [bucket] = await queryRows<CashBucketReference>(
    tx,
    sql`SELECT id,account_id,currency_id,category AS kind FROM app.cash_buckets
      WHERE workspace_id=${workspaceId}::uuid AND id=${id}::uuid`,
  );
  if (
    !bucket ||
    (accountId && bucket.account_id !== accountId) ||
    (currencyId && bucket.currency_id !== currencyId)
  ) {
    throw financialInvalid('The cash bucket must belong to the selected account and currency.');
  }
  return bucket;
}

export async function ensureCashBucket(
  tx: DbTransaction,
  workspaceId: string,
  accountId: string,
  currencyId: string,
  kind: string,
  custodyKey = 'default',
): Promise<CashBucketReference> {
  const rows = await queryRows<CashBucketReference>(
    tx,
    sql`SELECT id,account_id,currency_id,category AS kind FROM app.cash_buckets
      WHERE workspace_id=${workspaceId}::uuid AND account_id=${accountId}::uuid
        AND currency_id=${currencyId}::uuid AND category=${kind} AND custody_key=${custodyKey}`,
  );
  if (rows[0]) return rows[0];
  const id = randomUUID();
  await tx.execute(sql`INSERT INTO app.cash_buckets
    (workspace_id,id,account_id,currency_id,category,custody_key)
    VALUES (${workspaceId}::uuid,${id}::uuid,${accountId}::uuid,${currencyId}::uuid,${kind},${custodyKey})`);
  return { id, account_id: accountId, currency_id: currencyId, kind };
}

export type PostingInput = {
  currencyId: string;
  amount: string;
  cashBucketId?: string;
  controlKey?: string;
};

/** A ledger event contains one monetary unit; FX supplies one balanced event per unit. */
export async function postLedgerEvent(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  input: {
    kind: string;
    economicAt: string;
    effectKey: string;
    currencyId: string;
    postings: PostingInput[];
    reversalOfId?: string;
    payload?: Record<string, unknown>;
  },
): Promise<string> {
  if (input.postings.length < 2)
    throw financialInvalid('A monetary event needs balanced counterparts.');
  let balance = decimalValue('0');
  for (const posting of input.postings) {
    if (
      posting.currencyId !== input.currencyId ||
      Boolean(posting.cashBucketId) === Boolean(posting.controlKey)
    ) {
      throw financialInvalid('Each posting needs exactly one target in the event currency.');
    }
    balance = balance.plus(decimalValue(posting.amount));
  }
  if (!balance.isZero())
    throw financialInvalid('The monetary event does not balance in its own currency.');
  const id = randomUUID();
  await tx.execute(sql`INSERT INTO app.ledger_events
    (workspace_id,id,command_id,effect_key,currency_id,kind,economic_at,source_revision,reversal_of_id,payload,
      execution_id,fee_id,cash_movement_id,fx_conversion_id)
    VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${input.effectKey},
      ${input.currencyId}::uuid,${input.kind},${input.economicAt}::timestamptz,${state.revision}::integer,
      ${input.reversalOfId ?? null}::uuid,${JSON.stringify(input.payload ?? {})}::jsonb,
      ${input.payload?.feeId ? null : (input.payload?.executionId ?? null)}::uuid,
      ${input.payload?.feeId ?? null}::uuid,${input.payload?.cashMovementId ?? null}::uuid,
      ${input.payload?.conversionId ?? null}::uuid)`);
  for (const posting of input.postings) {
    await tx.execute(sql`INSERT INTO app.postings
      (workspace_id,id,ledger_event_id,currency_id,cash_bucket_id,control_key,amount_raw)
      VALUES (${context.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,
        ${posting.currencyId}::uuid,${posting.cashBucketId ?? null}::uuid,${posting.controlKey ?? null},${decimal(posting.amount)})`);
  }
  return id;
}

export async function postCashControl(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  input: {
    kind: string;
    economicAt: string;
    currencyId: string;
    cashBucketId: string;
    amount: string;
    controlKey: string;
    effectKey: string;
    payload?: Record<string, unknown>;
  },
) {
  const amount = decimal(input.amount);
  return postLedgerEvent(tx, context, state, {
    ...input,
    postings: [
      { currencyId: input.currencyId, cashBucketId: input.cashBucketId, amount },
      {
        currencyId: input.currencyId,
        controlKey: input.controlKey,
        amount: quantizeDecimal(decimalValue(amount).negated()),
      },
    ],
  });
}
