import { sql } from '@journal/database';
import {
  analyticsReportRequestSchema,
  analyticsReportResponseSchema,
  type AnalyticsReportRequest,
} from '@journal/contracts';
import { calculateAnalytics, INVENTORY_CALCULATION_MANIFEST } from '@journal/domain';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import {
  financialConflict,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';
import { canonicalFinancialInstant } from '../financial/observations.js';
import { financialInstantMicros, requireCurrency } from '../financial/reference-data.js';
import { readAnalyticsSources } from './sources.js';

/** Analytics reads immutable ledger/metadata evidence; no command, projection, audit or job writes. */
export function createAnalyticsServices(platform: FinancialPlatform) {
  async function report(context: AuthorizationContext, value: AnalyticsReportRequest) {
    const parsed = analyticsReportRequestSchema.parse(value);
    const query = {
      ...parsed,
      from: canonicalFinancialInstant(parsed.from),
      to: canonicalFinancialInstant(parsed.to),
    };
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const [workspace] = await queryRows<{
          timezone: string;
          revision: number;
          recorded_at: string;
        }>(
          tx,
          sql`SELECT timezone,revision,to_char(transaction_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recorded_at
          FROM app.workspaces WHERE id=${context.workspaceId}::uuid`,
        );
        if (!workspace) throw inaccessible();
        const [state] = await queryRows<{ revision: number }>(
          tx,
          sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}::uuid`,
        );
        const sourceRevision = query.sourceRevision ?? String(state?.revision ?? 0);
        if (BigInt(sourceRevision) > BigInt(state?.revision ?? 0))
          throw financialInvalid('Analytics cannot select a future financial revision.');
        const metadataAsOf = canonicalFinancialInstant(query.metadataAsOf ?? workspace.recorded_at);
        if (financialInstantMicros(metadataAsOf) > financialInstantMicros(workspace.recorded_at))
          throw financialInvalid('Analytics cannot select future journal or strategy metadata.');
        await requireCurrency(tx, context.workspaceId, query.reportingCurrencyId, false);
        const accounts = await queryRows<{ id: string; environment: 'live' | 'paper' }>(
          tx,
          sql`SELECT id,environment FROM app.accounts WHERE workspace_id=${context.workspaceId}::uuid AND id=ANY(${`{${query.accountIds.join(',')}}`}::uuid[])`,
        );
        if (accounts.length !== query.accountIds.length) throw inaccessible();
        const environment = accounts[0]!.environment;
        if (accounts.some((account) => account.environment !== environment))
          throw financialInvalid('Live and paper accounts require separate analytics populations.');
        const timezone = query.timezone ?? workspace.timezone;
        const records = await readAnalyticsSources(tx, context, {
          query,
          sourceRevision,
          metadataAsOf,
          timezone,
        });
        let groupCount = 0;
        for (const dimension of query.groupBy ?? []) {
          const groups = new Set<string>();
          for (const record of records) {
            if ((record.dimensions[dimension] ?? []).length > 100)
              throw financialConflict(
                'ANALYTICS_SCOPE_TOO_LARGE',
                'Select fewer accounts or group dimensions before calculating this analytics report.',
              );
            const keys = [...new Set((record.dimensions[dimension] ?? []).map((item) => item.key))];
            if (dimension === 'tag') {
              for (const key of keys.length ? keys.map((key) => `value:${key}`) : ['unknown'])
                groups.add(key);
            } else
              groups.add(
                keys.length === 0 ? 'unknown' : keys.length === 1 ? `value:${keys[0]}` : 'mixed',
              );
          }
          groupCount += groups.size;
          if (groupCount > 500)
            throw financialConflict(
              'ANALYTICS_SCOPE_TOO_LARGE',
              'Select fewer accounts or group dimensions before calculating this analytics report.',
            );
        }
        const result = calculateAnalytics({
          campaigns: records,
          reportingCurrencyId: query.reportingCurrencyId,
          from: query.from,
          asOf: query.to,
          ...(query.groupBy ? { groupBy: query.groupBy } : {}),
        });
        const response = {
          context: {
            accountIds: [...query.accountIds].sort(),
            reportingCurrencyId: query.reportingCurrencyId,
            ...(query.suppliedCampaignResultIds
              ? { suppliedCampaignResultIds: query.suppliedCampaignResultIds }
              : {}),
            from: query.from,
            to: query.to,
            sourceRevision,
            recordedAt: workspace.recorded_at,
            metadataAsOf,
            timezone,
            workspaceRevision: workspace.revision,
            environment,
            fxPolicy: query.fxPolicy,
            priceMaxAgeMilliseconds: query.priceMaxAgeMilliseconds,
            priceSourcePriority: query.priceSourcePriority,
            population: 'campaign-attribution',
            moneyPopulation: 'selected-completed-and-open-lifetime-asof',
            manifest: INVENTORY_CALCULATION_MANIFEST,
          },
          records,
          ...result,
        };
        if (new TextEncoder().encode(JSON.stringify(response)).byteLength > 4_194_304)
          throw financialConflict(
            'ANALYTICS_SCOPE_TOO_LARGE',
            'Select fewer accounts or group dimensions before calculating this analytics report.',
          );
        return analyticsReportResponseSchema.parse(response);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  return { report };
}
