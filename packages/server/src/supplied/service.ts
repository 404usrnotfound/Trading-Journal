import { randomUUID } from 'node:crypto';
import { sql } from '@journal/database';
import { decimal, decimalValue } from '@journal/domain';
import {
  suppliedComponentCreateSchema,
  suppliedComponentListQuerySchema,
  suppliedComponentListResponseSchema,
} from '@journal/contracts';
import type { AuthorizationContext } from '../services.js';
import {
  executeFinancialCommand,
  financialConflict,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';
import {
  financialInstantMicros,
  requireAccount,
  requireCurrency,
  requireInstrumentVersion,
} from '../financial/reference-data.js';
import { replayBookAt } from '../financial/ledger.js';
import { readTrade } from '../financial/catalog.js';
import { readComponentRows } from './selection.js';

export function createSuppliedComponents(platform: FinancialPlatform) {
  async function record(context: AuthorizationContext, value: unknown, commandId: string) {
    const input = suppliedComponentCreateSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'supplied-component.recorded', payload: input },
      async (tx, state) => {
        const basisRevision = String(BigInt(state.revision) - 1n);
        if (input.expectedSourceRevision !== basisRevision)
          throw financialConflict(
            'STALE_SUPPLIED_COMPONENT',
            'Financial records changed. Review the source scope again before recording its supplied value.',
          );
        await requireCurrency(tx, context.workspaceId, input.currencyId, false);
        if (input.kind === 'position-equity') {
          await requireAccount(tx, context.workspaceId, input.accountId, false, input.observedAt);
          const instrument = await requireInstrumentVersion(
            tx,
            context.workspaceId,
            input.instrumentVersionId,
            false,
          );
          if (
            instrument.capability !== 'manual' ||
            financialInstantMicros(input.observedAt) <
              financialInstantMicros(instrument.effectiveAt)
          )
            throw financialInvalid(
              'A supplied position value requires a manual convention effective at its observation time.',
            );
          const inventory = await replayBookAt(
            tx,
            context,
            { accountId: input.accountId, instrumentVersionId: input.instrumentVersionId },
            input.observedAt,
            basisRevision,
          );
          if (
            inventory.openQuantity.value === null ||
            !decimalValue(inventory.openQuantity.value).eq(input.signedQuantity)
          )
            throw financialInvalid(
              'The supplied signed quantity must equal the holding source quantity at this observation boundary.',
            );
          if (decimalValue(input.signedQuantity).isZero() && !decimalValue(input.amount).isZero())
            throw financialInvalid(
              'A flat holding cannot contribute a nonzero residual position value. Record outstanding cash/claims explicitly.',
            );
        } else {
          const trade = await readTrade(tx, context.workspaceId, input.tradeId);
          const [scope] = await queryRows<{ manual: boolean; last_fill: string | null }>(
            tx,
            sql`
          SELECT bool_or(v.capability='manual') AS manual,to_char(max(e.economic_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS last_fill
          FROM app.trade_legs l JOIN app.instrument_versions v ON v.workspace_id=l.workspace_id AND v.id=l.instrument_version_id
          LEFT JOIN app.allocation_items a ON a.workspace_id=l.workspace_id AND a.trade_leg_id=l.id
          LEFT JOIN app.allocation_sets s ON s.workspace_id=a.workspace_id AND s.id=a.allocation_set_id
          LEFT JOIN app.executions e ON e.workspace_id=s.workspace_id AND e.id=s.execution_id
          WHERE l.workspace_id=${context.workspaceId}::uuid AND l.trade_id=${input.tradeId}::uuid`,
          );
          if (!scope?.manual)
            throw financialInvalid(
              'Supplied campaign results are reserved for campaigns containing a manual instrument leg.',
            );
          if (
            scope.last_fill &&
            financialInstantMicros(scope.last_fill) > financialInstantMicros(input.observedAt)
          )
            throw financialInvalid(
              'The supplied result cannot precede campaign execution activity.',
            );
          if (
            input.resultDefinition === 'completed-realized-net' &&
            (trade.status !== 'closed' || trade.closureReviewRequired)
          )
            throw financialInvalid(
              'A completed result requires a current confirmed closed campaign.',
            );
        }
        if (input.supersedesId) {
          const [successor] = await queryRows<{ id: string }>(
            tx,
            sql`SELECT id FROM app.supplied_components WHERE workspace_id=${context.workspaceId}::uuid AND supersedes_id=${input.supersedesId}::uuid LIMIT 1`,
          );
          if (successor)
            throw financialConflict(
              'SUPERSEDED_SUPPLIED_COMPONENT',
              'This observation already has a correction. Reload the source history and correct its current observation.',
            );
          const previous = await readComponentRows(tx, context, [input.supersedesId]);
          const original = previous[0];
          if (
            !original ||
            original.kind !== input.kind ||
            (input.kind === 'position-equity'
              ? original.accountId !== input.accountId ||
                original.instrumentVersionId !== input.instrumentVersionId
              : original.tradeId !== input.tradeId)
          )
            throw financialInvalid(
              'A supplied correction must retain the original component scope.',
            );
        }
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.supplied_components(workspace_id,id,command_id,source_revision,basis_revision,kind,account_id,instrument_version_id,trade_id,currency_id,amount_raw,quantity_raw,observed_at,definition_version,source,payload,supersedes_id)
        VALUES(${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,${basisRevision}::integer,${input.kind},${input.kind === 'position-equity' ? input.accountId : null}::uuid,${input.kind === 'position-equity' ? input.instrumentVersionId : null}::uuid,${input.kind === 'campaign-net-result' ? input.tradeId : null}::uuid,${input.currencyId}::uuid,${decimal(input.amount)},${input.kind === 'position-equity' ? decimal(input.signedQuantity) : null},${input.observedAt}::timestamptz,${input.kind === 'position-equity' ? 'residual-position-equity/1' : 'lifetime-campaign-net-result/1'},${input.source},${JSON.stringify(input)}::jsonb,${input.supersedesId ?? null}::uuid)`);
        return { id, commandId: state.eventId, sourceRevision: state.revision };
      },
    );
  }
  async function list(context: AuthorizationContext, value: unknown = {}) {
    const input = suppliedComponentListQuerySchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const [state] = await queryRows<{ revision: number }>(
          tx,
          sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}::uuid`,
        );
        const ids = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.supplied_components WHERE workspace_id=${context.workspaceId}::uuid
        AND (${input.accountId ?? null}::uuid IS NULL OR account_id=${input.accountId ?? null}::uuid) AND (${input.tradeId ?? null}::uuid IS NULL OR trade_id=${input.tradeId ?? null}::uuid)
        AND (${input.afterId ?? null}::uuid IS NULL OR id>${input.afterId ?? null}::uuid) ORDER BY id LIMIT ${input.limit + 1}`,
        );
        const rows = await readComponentRows(
          tx,
          context,
          ids.slice(0, input.limit).map((item) => item.id),
        );
        return suppliedComponentListResponseSchema.parse({
          sourceRevision: String(state?.revision ?? 0),
          items: rows,
          nextCursor: ids.length > input.limit ? ids[input.limit - 1]!.id : null,
        });
      },
      { accessMode: 'read only' },
    );
  }
  return { record, list };
}
