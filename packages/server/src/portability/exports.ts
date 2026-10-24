import { sql, type DbTransaction } from '@journal/database';
import { type PortableExportRequest } from '@journal/contracts';
import type { AuthorizationContext } from '../services.js';
import { queryRows } from '../financial/repository.js';
import { portabilityError } from './integrity.js';

export async function filteredRows(
  tx: DbTransaction,
  context: AuthorizationContext,
  input: PortableExportRequest,
): Promise<Record<string, unknown>[]> {
  const accountArray = input.accountIds ? `{${input.accountIds.join(',')}}` : null;
  const idArray = input.ids ? `{${input.ids.join(',')}}` : null;
  if (input.accountIds) {
    const accounts = await queryRows<{ id: string }>(
      tx,
      sql`SELECT id FROM app.accounts WHERE workspace_id=${context.workspaceId}::uuid AND id=ANY(${accountArray}::uuid[])`,
    );
    if (accounts.length !== new Set(input.accountIds).size)
      throw portabilityError('Select accounts belonging to this workspace.');
  }
  if (input.kind === 'strategies' && input.accountIds?.length)
    throw portabilityError(
      'Strategies are account independent. Filter them by identity or publication dates.',
    );
  let query;
  if (input.kind === 'executions')
    query = sql`
    SELECT jsonb_build_object('id',e.id,'accountId',e.account_id,'instrumentVersionId',e.instrument_version_id,'side',e.side,'quantity',e.quantity_raw,'price',e.price_raw,'bookedPrincipal',e.principal_raw,'principalCurrencyId',e.principal_currency_id,'economicAt',to_char(e.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'orderingKey',e.ordering_key,'sourceNamespace',e.source_namespace,'sourceId',e.source_id,'supersedesId',e.supersedes_id,'source',e.payload) AS row
    FROM app.executions e WHERE e.workspace_id=${context.workspaceId}::uuid
      AND (${accountArray}::uuid[] IS NULL OR e.account_id=ANY(${accountArray}::uuid[]))
      AND (${idArray}::uuid[] IS NULL OR e.id=ANY(${idArray}::uuid[]))
      AND (${input.from ?? null}::timestamptz IS NULL OR e.economic_at>=${input.from ?? null}::timestamptz)
      AND (${input.to ?? null}::timestamptz IS NULL OR e.economic_at<${input.to ?? null}::timestamptz)
    ORDER BY e.economic_at,e.ordering_key::numeric,e.id LIMIT 10001`;
  else if (input.kind === 'cash')
    query = sql`
    SELECT jsonb_build_object('id',p.id,'eventId',e.id,'accountId',b.account_id,'currencyId',p.currency_id,'amount',p.amount_raw,'bucket',b.category,'kind',e.kind,'economicAt',to_char(e.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceRevision',e.source_revision,'reversalOfId',e.reversal_of_id,'source',e.payload) AS row
    FROM app.postings p JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id JOIN app.cash_buckets b ON b.workspace_id=p.workspace_id AND b.id=p.cash_bucket_id
    WHERE p.workspace_id=${context.workspaceId}::uuid
      AND (${accountArray}::uuid[] IS NULL OR b.account_id=ANY(${accountArray}::uuid[]))
      AND (${idArray}::uuid[] IS NULL OR e.id=ANY(${idArray}::uuid[]))
      AND (${input.from ?? null}::timestamptz IS NULL OR e.economic_at>=${input.from ?? null}::timestamptz)
      AND (${input.to ?? null}::timestamptz IS NULL OR e.economic_at<${input.to ?? null}::timestamptz)
    ORDER BY e.economic_at,p.id LIMIT 10001`;
  else if (input.kind === 'trades')
    query = sql`
    SELECT jsonb_build_object('id',t.id,'title',t.title,'classification',t.classification,'status',t.status,'revision',t.revision,'createdAt',t.created_at,'archivedAt',t.archived_at,'strategyId',s.strategy_id,'strategyVersionId',s.strategy_version_id) AS row
    FROM app.trades t LEFT JOIN app.trade_strategy_links s ON s.workspace_id=t.workspace_id AND s.trade_id=t.id
    WHERE t.workspace_id=${context.workspaceId}::uuid AND (${idArray}::uuid[] IS NULL OR t.id=ANY(${idArray}::uuid[]))
      AND (${accountArray}::uuid[] IS NULL OR EXISTS(SELECT 1 FROM app.trade_legs l WHERE l.workspace_id=t.workspace_id AND l.trade_id=t.id AND l.account_id=ANY(${accountArray}::uuid[])))
      AND (${input.from ?? null}::timestamptz IS NULL OR t.created_at>=${input.from ?? null}::timestamptz)
      AND (${input.to ?? null}::timestamptz IS NULL OR t.created_at<${input.to ?? null}::timestamptz)
    ORDER BY t.created_at,t.id LIMIT 10001`;
  else if (input.kind === 'strategies')
    query = sql`
    SELECT jsonb_build_object('id',s.id,'versionId',v.id,'version',v.version,'effectiveAt',v.effective_at,'definition',v.definition,'definitionHash',v.definition_hash,'archivedAt',s.archived_at) AS row
    FROM app.strategies s JOIN app.strategy_versions v ON v.workspace_id=s.workspace_id AND v.strategy_id=s.id
    WHERE s.workspace_id=${context.workspaceId}::uuid AND (${idArray}::uuid[] IS NULL OR s.id=ANY(${idArray}::uuid[]))
      AND (${input.from ?? null}::timestamptz IS NULL OR v.effective_at>=${input.from ?? null}::timestamptz)
      AND (${input.to ?? null}::timestamptz IS NULL OR v.effective_at<${input.to ?? null}::timestamptz)
    ORDER BY s.id,v.version LIMIT 10001`;
  else
    query = sql`
    SELECT jsonb_build_object('id',r.id,'tradeId',r.trade_id,'revision',r.revision,'createdAt',r.created_at,'document',r.document,'actorId',r.actor_id) AS row
    FROM app.journal_revisions r WHERE r.workspace_id=${context.workspaceId}::uuid
      AND (${idArray}::uuid[] IS NULL OR r.trade_id=ANY(${idArray}::uuid[]))
      AND (${accountArray}::uuid[] IS NULL OR EXISTS(SELECT 1 FROM app.trade_legs l WHERE l.workspace_id=r.workspace_id AND l.trade_id=r.trade_id AND l.account_id=ANY(${accountArray}::uuid[])))
      AND (${input.from ?? null}::timestamptz IS NULL OR r.created_at>=${input.from ?? null}::timestamptz)
      AND (${input.to ?? null}::timestamptz IS NULL OR r.created_at<${input.to ?? null}::timestamptz)
    ORDER BY r.created_at,r.id LIMIT 10001`;
  const result = await queryRows<{ row: Record<string, unknown> }>(tx, query);
  if (result.length > 10000)
    throw portabilityError(
      'The selection exceeds 10,000 export rows. Narrow the date or identity filters.',
      'EXPORT_SCOPE_TOO_LARGE',
    );
  return result.map((item) => item.row);
}

/** CSV is a spreadsheet presentation. Lossless source values remain available in JSON. */
export function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function serializeExport(input: PortableExportRequest, rows: Record<string, unknown>[]) {
  const body =
    input.format === 'json'
      ? JSON.stringify({
          format: 'journal-record-export/1',
          kind: input.kind,
          filters: input,
          rows,
        })
      : (() => {
          const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
          return `${columns.map(csvCell).join(',')}\r\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\r\n')}\r\n`;
        })();
  if (Buffer.byteLength(body) > 16 * 1024 * 1024)
    throw portabilityError(
      'This export exceeds 16 MiB. Narrow the selection.',
      'EXPORT_SCOPE_TOO_LARGE',
    );
  return {
    body,
    mediaType:
      input.format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
    filename: `journal-${input.kind}.${input.format}`,
  };
}
