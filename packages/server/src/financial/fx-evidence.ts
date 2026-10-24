import { sql, type DbTransaction } from '@journal/database';
import type { FxObservation } from '@journal/domain';
import type { AuthorizationContext } from '../services.js';
import { financialConflict, queryRows } from './repository.js';

/** The canonical selector supports direct/inverse pairs. Unrelated workspace
 * currencies and unselected providers are not dependencies of this report. */
export async function readReportFxEvidence(
  tx: DbTransaction,
  context: AuthorizationContext,
  input: {
    pairs: readonly (readonly [string | null, string | null])[];
    asOf: string;
    sourceRevision: string;
    sourcePriority: readonly string[];
    scopeError: string;
  },
): Promise<FxObservation[]> {
  const pairs = new Map<string, { base: string; quote: string }>();
  for (const [base, quote] of input.pairs) {
    if (!base || !quote || base === quote) continue;
    for (const [left, right] of [
      [base, quote],
      [quote, base],
    ] as const)
      pairs.set(`${left}|${right}`, { base: left, quote: right });
  }
  if (!pairs.size) return [];
  const rows = await queryRows<{
    id: string;
    base_currency_id: string;
    quote_currency_id: string;
    rate_raw: string;
    observed_at: string;
    source: string;
  }>(
    tx,
    sql`
    SELECT o.id,o.base_currency_id,o.quote_currency_id,o.rate_raw,
      to_char(o.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at,o.source
    FROM app.fx_observations o
    WHERE o.workspace_id=${context.workspaceId}::uuid AND o.observed_at<=${input.asOf}::timestamptz
      AND (o.base_currency_id,o.quote_currency_id) IN
        (SELECT base,quote FROM jsonb_to_recordset(${JSON.stringify([...pairs.values()])}::jsonb) AS needed(base uuid,quote uuid))
      AND o.source IN (SELECT jsonb_array_elements_text(${JSON.stringify(input.sourcePriority)}::jsonb))
      AND COALESCE((o.payload->>'sourceRevision')::numeric,0)<=${input.sourceRevision}::integer
      AND NOT EXISTS (SELECT 1 FROM app.fx_observations newer
        WHERE newer.workspace_id=o.workspace_id AND newer.supersedes_id=o.id
          AND COALESCE((newer.payload->>'sourceRevision')::numeric,0)<=${input.sourceRevision}::integer)
    ORDER BY o.observed_at,o.id LIMIT 10001`,
  );
  if (rows.length > 10000)
    throw financialConflict(
      input.scopeError,
      'The requested currency pairs exceed the bounded FX evidence budget. Select a smaller financial population.',
    );
  return rows.map((row) => ({
    id: row.id,
    baseCurrencyId: row.base_currency_id,
    quoteCurrencyId: row.quote_currency_id,
    rate: row.rate_raw,
    observedAt: row.observed_at,
    source: row.source,
  }));
}
