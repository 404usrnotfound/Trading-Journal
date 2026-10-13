import { sql } from '@journal/database';
import { decimalValue, quantizeDecimal } from '@journal/domain';
import { z } from 'zod';
import type { AuthorizationContext } from '../services.js';
import {
  executeFinancialCommand,
  financialConflict,
  queryRows,
  type FinancialPlatform,
} from './repository.js';
import { postLedgerEvent } from './commands.js';

/** Generic append-only reversal; no broker format or importer accounting formula lives here. */
export function createCashReversals(platform: FinancialPlatform) {
  return async (
    context: AuthorizationContext,
    input: {
      commandId: string;
      cashMovementId: string;
      expectedSourceRevision: string;
      reason: string;
    },
  ) => {
    z.uuidv4().parse(input.cashMovementId);
    z.string().trim().min(1).max(160).parse(input.reason);
    return executeFinancialCommand(
      platform,
      context,
      { commandId: input.commandId, kind: 'cash-reversed', payload: input },
      async (tx, state) => {
        if (BigInt(state.revision) - 1n !== BigInt(input.expectedSourceRevision))
          throw financialConflict('STALE_FINANCIAL_STATE', 'Refresh the reversal review.');
        const [event] = await queryRows<{ id: string; currency_id: string; economic_at: string }>(
          tx,
          sql`SELECT id,currency_id,to_char(economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS economic_at FROM app.ledger_events WHERE workspace_id=${context.workspaceId}::uuid AND cash_movement_id=${input.cashMovementId}::uuid`,
        );
        if (!event)
          throw financialConflict(
            'CASH_SOURCE_UNAVAILABLE',
            'The original cash event is unavailable.',
          );
        const reversed = await queryRows(
          tx,
          sql`SELECT id FROM app.ledger_events WHERE workspace_id=${context.workspaceId}::uuid AND reversal_of_id=${event.id}::uuid`,
        );
        if (reversed.length)
          throw financialConflict(
            'ALREADY_REVERSED',
            'This cash source has already been reversed.',
          );
        const postings = await queryRows<{
          currency_id: string;
          cash_bucket_id: string | null;
          control_key: string | null;
          amount_raw: string;
        }>(
          tx,
          sql`SELECT currency_id,cash_bucket_id,control_key,amount_raw FROM app.postings WHERE workspace_id=${context.workspaceId}::uuid AND ledger_event_id=${event.id}::uuid`,
        );
        const id = await postLedgerEvent(tx, context, state, {
          kind: 'reversal',
          economicAt: event.economic_at,
          currencyId: event.currency_id,
          effectKey: `cash-reversal:${input.cashMovementId}`,
          reversalOfId: event.id,
          payload: { reason: input.reason, reversesCashMovementId: input.cashMovementId },
          postings: postings.map((row) => ({
            currencyId: row.currency_id,
            amount: quantizeDecimal(decimalValue(row.amount_raw).negated()),
            ...(row.cash_bucket_id
              ? { cashBucketId: row.cash_bucket_id }
              : { controlKey: row.control_key! }),
          })),
        });
        return { id, commandId: input.commandId, sourceRevision: state.revision };
      },
    );
  };
}
