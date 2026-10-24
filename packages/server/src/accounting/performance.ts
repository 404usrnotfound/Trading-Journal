import { accountPerformanceRequestSchema } from '@journal/contracts';
import { sql } from '@journal/database';
import {
  calculateAccountPerformance,
  instantNanoseconds,
  type AccountPerformancePoint,
} from '@journal/domain';
import type { z } from 'zod';
import {
  financialConflict,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';
import type { AuthorizationContext } from '../services.js';
import { createAccountingReports } from './report.js';

/** Source values always come from pinned accounting snapshots, never client-supplied balances. */
export function createAccountPerformance(platform: FinancialPlatform) {
  const reports = createAccountingReports(platform);
  return async (
    context: AuthorizationContext,
    value: z.input<typeof accountPerformanceRequestSchema>,
  ) => {
    const {
      checkpoints = [],
      dependencyPage: _dependencyPage,
      ...input
    } = accountPerformanceRequestSchema.parse(value);
    if (
      checkpoints.some(
        (at) =>
          instantNanoseconds(at) <= instantNanoseconds(input.from) ||
          instantNanoseconds(at) >= instantNanoseconds(input.to),
      )
    )
      throw financialInvalid('Display checkpoints must be strictly inside the reporting period.');
    const report = await reports.report(context, { ...input, detail: 'summary' });
    const revision = report.context.sourceRevision;
    const scope = report.context.accountIds;
    const selected = `{${scope.join(',')}}`;
    const flowInstants = await platform.withWorkspaceContext(
      context,
      (tx) =>
        queryRows<{ at: string; ambiguous: boolean }>(
          tx,
          sql`
      WITH flow_times AS (
        SELECT e.economic_at AS at FROM app.ledger_events e
        LEFT JOIN app.ledger_events original ON original.workspace_id=e.workspace_id AND original.id=e.reversal_of_id
        WHERE e.workspace_id=${context.workspaceId}::uuid AND e.source_revision<=${revision}::integer
          AND COALESCE(original.kind,e.kind) IN ('deposit','withdrawal','opening','internal-transfer','cash-transfer-departure','cash-transfer-receipt')
          AND EXISTS(SELECT 1 FROM app.postings p JOIN app.cash_buckets b ON b.workspace_id=p.workspace_id AND b.id=p.cash_bucket_id
            WHERE p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id AND b.account_id=ANY(${selected}::uuid[]))
        UNION SELECT economic_at FROM app.opening_lots WHERE workspace_id=${context.workspaceId}::uuid
          AND source_revision<=${revision}::integer AND account_id=ANY(${selected}::uuid[])
        UNION SELECT economic_at FROM app.holding_transfers WHERE workspace_id=${context.workspaceId}::uuid
          AND source_revision<=${revision}::integer AND (source_account_id=ANY(${selected}::uuid[]) OR destination_account_id=ANY(${selected}::uuid[]))
      ), instants AS (SELECT DISTINCT at FROM flow_times WHERE at>${input.from}::timestamptz AND at<=${input.to}::timestamptz)
      SELECT to_char(flow.at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at,
        (EXISTS(SELECT 1 FROM app.ledger_events e
          LEFT JOIN app.ledger_events original ON original.workspace_id=e.workspace_id AND original.id=e.reversal_of_id
          WHERE e.workspace_id=${context.workspaceId}::uuid AND e.source_revision<=${revision}::integer AND e.economic_at=flow.at
            AND COALESCE(original.kind,e.kind) NOT IN ('deposit','withdrawal','opening','internal-transfer','cash-transfer-departure','cash-transfer-receipt')
            AND EXISTS(SELECT 1 FROM app.postings p JOIN app.cash_buckets b ON b.workspace_id=p.workspace_id AND b.id=p.cash_bucket_id
              WHERE p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id AND b.account_id=ANY(${selected}::uuid[])))
          OR EXISTS(SELECT 1 FROM app.executions x WHERE x.workspace_id=${context.workspaceId}::uuid
            AND x.source_revision<=${revision}::integer AND x.economic_at=flow.at AND x.account_id=ANY(${selected}::uuid[]))) AS ambiguous
        FROM instants flow ORDER BY flow.at LIMIT 33`,
        ),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
    const dates = new Map<bigint, string>();
    const ambiguousInstants = new Set(
      flowInstants.filter((point) => point.ambiguous).map((point) => instantNanoseconds(point.at)),
    );
    for (const at of [...flowInstants.map((row) => row.at), ...checkpoints, input.to])
      dates.set(instantNanoseconds(at), at);
    if (dates.size > 32)
      throw financialConflict(
        'ACCOUNT_PERFORMANCE_SCOPE_TOO_LARGE',
        'Select a shorter period: exact performance requires a valuation at every capital-flow boundary (at most 32 per request).',
      );
    const nav = (metric: typeof report.opening.netLiquidationValue) =>
      metric.state === 'available' ? metric.value : null;
    const points: AccountPerformancePoint[] = [
      {
        at: input.from,
        nav: nav(report.opening.netLiquidationValue),
        capitalFlow: '0',
        reasons: [...report.opening.netLiquidationValue.reasons],
      },
    ];
    let from = input.from;
    for (const [, at] of [...dates.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const segment = await reports.report(context, {
        ...input,
        detail: 'summary',
        from,
        to: at,
        sourceRevision: revision,
      });
      points.push({
        at,
        nav: nav(segment.closing.netLiquidationValue),
        capitalFlow:
          segment.reconciliation.netCapitalFlows.state === 'available'
            ? segment.reconciliation.netCapitalFlows.value
            : null,
        reasons: [
          ...new Set([
            ...segment.closing.netLiquidationValue.reasons,
            ...segment.reconciliation.netCapitalFlows.reasons,
            ...(segment.reconciliation.netCapitalFlows.value !== null &&
            /[1-9]/u.test(segment.reconciliation.netCapitalFlows.value) &&
            ambiguousInstants.has(instantNanoseconds(at))
              ? ['ambiguous_flow_ordering']
              : []),
          ]),
        ],
      });
      from = at;
    }
    return {
      accountIds: scope,
      reportingCurrencyId: input.reportingCurrencyId,
      sourceRevision: revision,
      from: input.from,
      to: input.to,
      method: 'exact-flow-boundaries/act-365/1' as const,
      valuationPolicy: 'report-price-and-fx-policy' as const,
      ...calculateAccountPerformance(points),
    };
  };
}
