import { sql } from '@journal/database';
import { decimalValue, quantizeDecimal } from '@journal/domain';
import {
  accountingCorrectionSourcesQuerySchema,
  financialIdSchema,
  reverseAccountingSourceRequestSchema,
} from '@journal/contracts';
import { inaccessible } from '../errors.js';
import { postLedgerEvent } from '../financial/commands.js';
import {
  executeFinancialCommand,
  financialConflict,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';
import type { AuthorizationContext } from '../services.js';
import type { z } from 'zod';

/** Append exact historical negations, keeping the original source and its classification intact. */
export function createAccountingCorrections(platform: FinancialPlatform) {
  async function sources(
    context: AuthorizationContext,
    value: z.input<typeof accountingCorrectionSourcesQuerySchema> = {},
  ) {
    const input = accountingCorrectionSourcesQuerySchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const [state] = await queryRows<{ revision: number }>(
          tx,
          sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}::uuid`,
        );
        const rows = await queryRows<{
          id: string;
          sourceType: 'cash-event' | 'transfer';
          kind: string;
          description: string;
          economicAt: string;
          currencyId: string;
          amount: string;
          reversed: boolean;
        }>(
          tx,
          sql`
        WITH sources AS (
          SELECT c.id,'cash-event' AS source_type,c.kind,c.description,c.economic_at,c.currency_id,c.amount_raw,
            EXISTS(SELECT 1 FROM app.ledger_events e JOIN app.ledger_events r ON r.workspace_id=e.workspace_id AND r.reversal_of_id=e.id
              WHERE e.workspace_id=c.workspace_id AND e.account_cash_event_id=c.id) AS reversed
          FROM app.account_cash_events c WHERE c.workspace_id=${context.workspaceId}::uuid
          UNION ALL
          SELECT t.id,'transfer','owned-transfer',t.description,t.economic_at,t.currency_id,t.amount_raw,
            EXISTS(SELECT 1 FROM app.ledger_events e JOIN app.ledger_events r ON r.workspace_id=e.workspace_id AND r.reversal_of_id=e.id
              WHERE e.workspace_id=t.workspace_id AND e.cash_transfer_id=t.id)
          FROM app.cash_transfers t WHERE t.workspace_id=${context.workspaceId}::uuid
        ) SELECT id,source_type AS "sourceType",kind,description,
          to_char(economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "economicAt",
          currency_id AS "currencyId",amount_raw AS amount,reversed
        FROM sources WHERE (${input.cursor ?? null}::uuid IS NULL OR id>${input.cursor ?? null}::uuid)
        ORDER BY id LIMIT ${input.limit + 1}`,
        );
        return {
          sourceRevision: String(state?.revision ?? 0),
          items: rows.slice(0, input.limit),
          nextCursor: rows.length > input.limit ? rows[input.limit - 1]!.id : null,
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async function reverse(
    context: AuthorizationContext,
    sourceId: string,
    value: z.input<typeof reverseAccountingSourceRequestSchema> & { commandId: string },
  ) {
    const id = financialIdSchema.parse(sourceId).toLowerCase();
    const { commandId, ...body } = value;
    const input = reverseAccountingSourceRequestSchema.parse(body);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'accounting-source-reversed', payload: { id, ...input } },
      async (tx, state) => {
        if (BigInt(state.revision) - 1n !== BigInt(input.expectedSourceRevision))
          throw financialConflict(
            'STALE_FINANCIAL_STATE',
            'Refresh the historical correction review.',
          );
        const events = await queryRows<{
          id: string;
          currency_id: string;
          economic_at: string;
          reversed: boolean;
          primary_source: boolean;
        }>(
          tx,
          sql`
        SELECT e.id,e.currency_id,to_char(e.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS economic_at,
          EXISTS(SELECT 1 FROM app.ledger_events r WHERE r.workspace_id=e.workspace_id AND r.reversal_of_id=e.id) AS reversed,
          (e.account_cash_event_id=${id}::uuid OR e.cash_transfer_id=${id}::uuid) AS primary_source
        FROM app.ledger_events e
        LEFT JOIN app.account_cash_events c ON c.workspace_id=e.workspace_id AND c.id=e.account_cash_event_id
        LEFT JOIN app.cash_transfer_receipts receipt ON receipt.workspace_id=e.workspace_id AND receipt.id=e.cash_transfer_receipt_id
        WHERE e.workspace_id=${context.workspaceId}::uuid AND e.reversal_of_id IS NULL
          AND ((${input.sourceType === 'cash-event'} AND (c.id=${id}::uuid OR c.related_income_id=${id}::uuid))
            OR (${input.sourceType === 'transfer'} AND (e.cash_transfer_id=${id}::uuid OR receipt.transfer_id=${id}::uuid)))
        ORDER BY e.economic_at,e.id`,
        );
        const primary = events.find((event) => event.primary_source);
        if (!primary) throw inaccessible();
        if (primary.reversed)
          throw financialConflict(
            'ALREADY_REVERSED',
            'This historical source was already reversed.',
          );
        for (const event of events.filter((event) => !event.reversed)) {
          const postings = await queryRows<{
            currency_id: string;
            cash_bucket_id: string | null;
            control_key: string | null;
            amount_raw: string;
          }>(
            tx,
            sql`SELECT currency_id,cash_bucket_id,control_key,amount_raw FROM app.postings WHERE workspace_id=${context.workspaceId}::uuid AND ledger_event_id=${event.id}::uuid`,
          );
          await postLedgerEvent(tx, context, state, {
            kind: 'reversal',
            economicAt: event.economic_at,
            currencyId: event.currency_id,
            effectKey: `accounting-correction:${event.id}`,
            reversalOfId: event.id,
            payload: { reason: input.reason, sourceType: input.sourceType, sourceId: id },
            postings: postings.map((posting) => ({
              currencyId: posting.currency_id,
              amount: quantizeDecimal(decimalValue(posting.amount_raw).negated()),
              ...(posting.cash_bucket_id
                ? { cashBucketId: posting.cash_bucket_id }
                : { controlKey: posting.control_key! }),
            })),
          });
        }
        return { id, commandId: state.eventId, sourceRevision: state.revision };
      },
    );
  }
  return { sources, reverse };
}
