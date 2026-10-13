import { sql } from '@journal/database';
import {
  calculateAnalytics,
  ANALYTICS_MAX_GROUPS,
  FinancialArithmeticError,
  calculateDashboardViews,
  filterDashboardCampaigns,
  decimalValue,
  quantizeDecimal,
} from '@journal/domain';
import {
  dashboardCatalogSchema,
  dashboardRequestSchema,
  dashboardResponseSchema,
  accountingMetricSchema,
  type DashboardRequest,
  type DashboardResponse,
} from '@journal/contracts';
import { createAnalyticsServices } from '../analytics/service.js';
import { createAccountingReports } from '../accounting/report.js';
import {
  financialConflict,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import { canonicalFinancialInstant } from '../financial/observations.js';
import { financialInstantMicros, requireCurrency } from '../financial/reference-data.js';

const binding = (ids: readonly string[]) => `{${ids.join(',')}}`;
function bounded<T>(rows: T[], max = 500): T[] {
  if (rows.length > max)
    throw financialConflict(
      'DASHBOARD_SCOPE_TOO_LARGE',
      'Choose a narrower scope for this dashboard.',
    );
  return rows;
}
export function createDashboardServices(platform: FinancialPlatform) {
  async function catalog(context: AuthorizationContext) {
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const accounts = bounded(
          await queryRows<{
            id: string;
            label: string;
            parentId: string | null;
            environment: 'live' | 'paper';
          }>(
            tx,
            sql`SELECT id,name AS label,broker_id AS "parentId",environment FROM app.accounts WHERE workspace_id=${context.workspaceId}::uuid ORDER BY name,id LIMIT 501`,
          ),
        );
        const brokers = bounded(
          await queryRows<{ id: string; label: string; parentId: null }>(
            tx,
            sql`SELECT id,name AS label,NULL AS "parentId" FROM app.brokers WHERE workspace_id=${context.workspaceId}::uuid ORDER BY name,id LIMIT 501`,
          ),
        );
        const currencies = bounded(
          await queryRows<{ id: string; label: string; code: string; parentId: null }>(
            tx,
            sql`SELECT id,name AS label,code,NULL AS "parentId" FROM app.currencies WHERE workspace_id=${context.workspaceId}::uuid ORDER BY code,id LIMIT 501`,
          ),
        );
        const portfolios = bounded(
          await queryRows<{
            id: string;
            label: string;
            parentId: string;
            accountIds: string[];
            environment: 'live' | 'paper';
            version: number;
          }>(
            tx,
            sql`SELECT v.id,v.name||' · v'||v.version AS label,v.portfolio_id AS "parentId",v.environment,v.version,ARRAY(SELECT account_id FROM app.portfolio_version_accounts a WHERE a.workspace_id=v.workspace_id AND a.version_id=v.id ORDER BY account_id) AS "accountIds" FROM app.portfolio_versions v WHERE v.workspace_id=${context.workspaceId}::uuid ORDER BY v.name,v.version DESC LIMIT 501`,
          ),
        );
        const strategies = bounded(
          await queryRows<{ id: string; label: string; parentId: null }>(
            tx,
            sql`SELECT s.id,v.definition->>'name' AS label,NULL AS "parentId" FROM app.strategies s JOIN LATERAL (SELECT definition FROM app.strategy_versions v WHERE v.workspace_id=s.workspace_id AND v.strategy_id=s.id ORDER BY version DESC LIMIT 1) v ON true WHERE s.workspace_id=${context.workspaceId}::uuid ORDER BY s.id LIMIT 501`,
          ),
        );
        const strategyVersions = bounded(
          await queryRows<{ id: string; label: string; parentId: string }>(
            tx,
            sql`SELECT id,definition->>'name'||' · v'||version AS label,strategy_id AS "parentId" FROM app.strategy_versions WHERE workspace_id=${context.workspaceId}::uuid ORDER BY strategy_id,version DESC LIMIT 501`,
          ),
        );
        const assets = bounded(
          await queryRows<{ id: string; label: string; parentId: null; assetClass: string }>(
            tx,
            sql`SELECT id,name AS label,NULL AS "parentId",family AS "assetClass" FROM app.instruments WHERE workspace_id=${context.workspaceId}::uuid ORDER BY name,id LIMIT 501`,
          ),
        );
        const tags = bounded(
          await queryRows<{ tag: string }>(
            tx,
            sql`SELECT DISTINCT jsonb_array_elements_text(r.document->'review'->'customTags') AS tag FROM app.journal_revisions r WHERE r.workspace_id=${context.workspaceId}::uuid AND NOT EXISTS(SELECT 1 FROM app.journal_revisions n WHERE n.workspace_id=r.workspace_id AND n.trade_id=r.trade_id AND n.revision>r.revision) ORDER BY tag LIMIT 501`,
          ),
        ).map((row) => row.tag);
        const priceSources = bounded(
          await queryRows<{ source: string }>(
            tx,
            sql`SELECT DISTINCT source FROM app.price_observations WHERE workspace_id=${context.workspaceId}::uuid ORDER BY source LIMIT 65`,
          ),
          64,
        ).map((row) => row.source);
        const fxSources = bounded(
          await queryRows<{ source: string }>(
            tx,
            sql`SELECT DISTINCT source FROM app.fx_observations WHERE workspace_id=${context.workspaceId}::uuid ORDER BY source LIMIT 65`,
          ),
          64,
        ).map((row) => row.source);
        return dashboardCatalogSchema.parse({
          accounts,
          brokers,
          currencies,
          portfolios,
          strategies,
          strategyVersions,
          assets,
          tags,
          priceSources,
          fxSources,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async function report(
    context: AuthorizationContext,
    value: DashboardRequest,
  ): Promise<DashboardResponse> {
    const input = dashboardRequestSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        // Reuse both engines inside this exact tenant snapshot instead of opening independent reads.
        const snapshot: FinancialPlatform = {
          withWorkspaceContext: async (inner, callback) => {
            if (inner.workspaceId !== context.workspaceId || inner.actorId !== context.actorId)
              throw inaccessible();
            return callback(tx);
          },
        };
        const [state] = await queryRows<{ revision: number }>(
          tx,
          sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}::uuid`,
        );
        const sourceRevision = input.sourceRevision ?? String(state?.revision ?? 0);
        if (BigInt(sourceRevision) > BigInt(state?.revision ?? 0))
          throw financialInvalid('Select an existing financial generation.');
        await requireCurrency(tx, context.workspaceId, input.reportingCurrencyId, false);
        if (input.metadataAsOf) {
          const [clock] = await queryRows<{ at: string }>(
            tx,
            sql`SELECT to_char(transaction_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`,
          );
          if (financialInstantMicros(input.metadataAsOf) > financialInstantMicros(clock!.at))
            throw financialInvalid('Select an existing metadata generation.');
        }
        const filters = input.filters;
        for (const [table, ids] of [
          ['accounts', filters.accountIds],
          ['brokers', filters.brokerIds],
          ['strategies', filters.strategyIds],
          ['strategy_versions', filters.strategyVersionIds],
          ['instruments', filters.assetIds],
        ] as const) {
          if (!ids.length) continue;
          const rows = await queryRows<{ id: string }>(
            tx,
            sql`SELECT id FROM ${sql.raw(`app.${table}`)} WHERE workspace_id=${context.workspaceId}::uuid AND id=ANY(${binding(ids)}::uuid[])`,
          );
          if (rows.length !== ids.length) throw inaccessible();
        }
        let members: string[] | null = null;
        if (filters.portfolioVersionId) {
          const [version] = await queryRows<{ environment: string; source_revision: number }>(
            tx,
            sql`SELECT environment,source_revision FROM app.portfolio_versions WHERE workspace_id=${context.workspaceId}::uuid AND id=${filters.portfolioVersionId}::uuid`,
          );
          if (!version) throw inaccessible();
          if (
            version.environment !== input.environment ||
            BigInt(version.source_revision) > BigInt(sourceRevision)
          )
            throw financialInvalid(
              'The portfolio version is not compatible with this environment or generation.',
            );
          members = (
            await queryRows<{ account_id: string }>(
              tx,
              sql`SELECT account_id FROM app.portfolio_version_accounts WHERE workspace_id=${context.workspaceId}::uuid AND version_id=${filters.portfolioVersionId}::uuid`,
            )
          ).map((row) => row.account_id);
        }
        const accounts = bounded(
          await queryRows<{ id: string; name: string; broker_id: string | null }>(
            tx,
            sql`SELECT id,name,broker_id FROM app.accounts WHERE workspace_id=${context.workspaceId}::uuid AND environment=${input.environment} AND (${filters.accountIds.length === 0} OR id=ANY(${binding(filters.accountIds)}::uuid[])) AND (${filters.brokerIds.length === 0} OR broker_id=ANY(${binding(filters.brokerIds)}::uuid[])) AND (${members === null} OR id=ANY(${binding(members ?? [])}::uuid[])) ORDER BY id LIMIT 101`,
          ),
          100,
        ).filter(
          (account) =>
            (!filters.accountIds.length || filters.accountIds.includes(account.id)) &&
            (!filters.brokerIds.length ||
              (account.broker_id !== null && filters.brokerIds.includes(account.broker_id))) &&
            (members === null || members.includes(account.id)),
        );
        const accountIds = accounts.map((account) => account.id);
        const emptyViews = {
          calendar: [],
          periods: [],
          pnlDistribution: { bins: [], excludedIds: [] },
          rDistribution: { bins: [], excludedIds: [] },
          unknownChronologyIds: [],
        };
        if (!accountIds.length)
          return dashboardResponseSchema.parse({
            filters,
            analytics: null,
            views: emptyViews,
            accountView: {
              state: 'unavailable',
              reason: 'No accounts match these filters.',
              points: [],
              allocation: [],
            },
          });
        const query = {
          accountIds,
          reportingCurrencyId: input.reportingCurrencyId,
          from: input.from,
          to: input.to,
          sourceRevision,
          fxPolicy: input.fxPolicy,
          priceMaxAgeMilliseconds: input.priceMaxAgeMilliseconds,
          priceSourcePriority: input.priceSourcePriority,
          ...(input.timezone ? { timezone: input.timezone } : {}),
          ...(input.metadataAsOf ? { metadataAsOf: input.metadataAsOf } : {}),
        };
        const original = await createAnalyticsServices(snapshot).report(context, query);
        const records = filterDashboardCampaigns(original.records, filters);
        const grouping = ['strategy', 'strategyVersion', 'asset', 'account'] as const;
        const groupKeys = new Set<string>();
        for (const dimension of grouping)
          for (const record of records) {
            const keys = [
              ...new Set((record.dimensions[dimension] ?? []).map((value) => value.key)),
            ];
            groupKeys.add(
              `${dimension}:${keys.length === 0 ? 'unknown' : keys.length === 1 ? `value:${keys[0]}` : 'mixed'}`,
            );
          }
        if (groupKeys.size > ANALYTICS_MAX_GROUPS)
          throw financialConflict(
            'DASHBOARD_SCOPE_TOO_LARGE',
            'Choose fewer campaign groups for this dashboard.',
          );
        const analytics = {
          ...original,
          records,
          ...calculateAnalytics({
            campaigns: records,
            reportingCurrencyId: input.reportingCurrencyId,
            from: original.context.from,
            asOf: original.context.to,
            groupBy: [...grouping],
          }),
        };
        const views = calculateDashboardViews(records, original.context.timezone);
        let accountView: DashboardResponse['accountView'] = {
          state: 'unavailable',
          reason:
            'Account equity cannot be attributed to strategy, asset or tag filters. Clear trade filters to view account equity.',
          points: [],
          allocation: [],
        };
        const tradeFilters = [
          filters.strategyIds,
          filters.strategyVersionIds,
          filters.assetIds,
          filters.assetClasses,
          filters.tags,
        ].some((ids) => ids.length > 0);
        if (!tradeFilters && accountIds.length <= 10) {
          const accounting = createAccountingReports(snapshot);
          const { timezone: _timezone, metadataAsOf: _metadataAsOf, ...accountingQuery } = query;
          const final = await accounting.report(context, accountingQuery);
          const from = financialInstantMicros(original.context.from),
            to = financialInstantMicros(original.context.to);
          const instant = (micros: bigint) => {
            let seconds = micros / 1_000_000n,
              fraction = micros % 1_000_000n;
            if (fraction < 0n) {
              seconds--;
              fraction += 1_000_000n;
            }
            return new Date(Number(seconds * 1000n))
              .toISOString()
              .replace(/\.\d{3}Z$/, `.${fraction.toString().padStart(6, '0')}Z`);
          };
          const zero = {
            ...final.opening.equity,
            value: final.opening.equity.state === 'available' ? '0' : null,
            knownSubtotal: '0',
          };
          const points: DashboardResponse['accountView']['points'] = [
            {
              at: canonicalFinancialInstant(input.from),
              equity: accountingMetricSchema.parse(final.opening.equity),
              performance: accountingMetricSchema.parse(zero),
              sourceIds: [...final.dependencies.sourceIds],
              priceObservationIds: final.dependencies.prices.map((row) => row.observationId),
              fxObservationIds: final.dependencies.fx.flatMap((row) =>
                row.selection.state === 'available' ? row.selection.value.observationIds : [],
              ),
            },
          ];
          for (let index = 1; index < input.samples; index++) {
            const sample = from + ((to - from) * BigInt(index)) / BigInt(input.samples - 1);
            if (sample <= financialInstantMicros(points.at(-1)!.at)) continue;
            const at = instant(sample);
            const [settings] = await queryRows<{ count: number }>(
              tx,
              sql`SELECT count(DISTINCT account_id)::integer AS count FROM app.account_settings_versions WHERE workspace_id=${context.workspaceId}::uuid AND account_id=ANY(${binding(accountIds)}::uuid[]) AND effective_at<=${at}::timestamptz`,
            );
            if (settings!.count !== accountIds.length) {
              const missing = {
                state: 'unavailable' as const,
                value: null,
                knownSubtotal: '0',
                currencyId: input.reportingCurrencyId,
                reasons: ['account_configuration_not_available_at_sample'],
                missingReferences: accountIds,
              };
              points.push({
                at,
                equity: missing,
                performance: missing,
                sourceIds: [],
                priceObservationIds: [],
                fxObservationIds: [],
              });
              continue;
            }
            const current =
              index === input.samples - 1
                ? final
                : await accounting.report(context, { ...accountingQuery, to: at });
            points.push({
              at,
              equity: accountingMetricSchema.parse(current.closing.equity),
              performance: accountingMetricSchema.parse(current.reconciliation.performance),
              sourceIds: [...current.dependencies.sourceIds],
              priceObservationIds: current.dependencies.prices.map((row) => row.observationId),
              fxObservationIds: current.dependencies.fx.flatMap((row) =>
                row.selection.state === 'available' ? row.selection.value.observationIds : [],
              ),
            });
          }
          const allocation: DashboardResponse['accountView']['allocation'] = [];
          for (const account of accounts) {
            const row =
              accountIds.length === 1
                ? final
                : await accounting.report(context, {
                    ...accountingQuery,
                    accountIds: [account.id],
                  });
            const parts = [row.closing.cash, row.closing.holdings];
            const missing = parts.filter((part) => part.state !== 'available');
            let knownSubtotal: string;
            try {
              knownSubtotal = quantizeDecimal(
                parts.reduce(
                  (total, part) => total.plus(decimalValue(part.knownSubtotal)),
                  decimalValue('0'),
                ),
              );
            } catch (error) {
              if (!(error instanceof FinancialArithmeticError) || error.code !== 'numeric_overflow')
                throw error;
              allocation.push({
                id: account.id,
                label: account.name,
                equity: {
                  state: 'unavailable',
                  value: null,
                  knownSubtotal: '0',
                  currencyId: input.reportingCurrencyId,
                  reasons: ['numeric_overflow'],
                  missingReferences: [],
                },
              });
              continue;
            }
            allocation.push({
              id: account.id,
              label: account.name,
              equity: {
                state: missing.length ? 'unavailable' : 'available',
                value: missing.length ? null : knownSubtotal,
                knownSubtotal,
                currencyId: input.reportingCurrencyId,
                reasons: missing.flatMap((part) => part.reasons),
                missingReferences: missing.flatMap((part) => part.missingReferences),
              },
            });
          }
          allocation.push({
            id: 'transit',
            label: 'Owned transfers in transit',
            equity: accountingMetricSchema.parse(final.closing.transit),
          });
          accountView = { state: 'available', reason: null, points, allocation };
        } else if (!tradeFilters)
          accountView.reason = 'Select at most 10 accounts for synchronous equity history.';
        const response = { filters, analytics, views, accountView };
        if (new TextEncoder().encode(JSON.stringify(response)).byteLength > 4_194_304)
          throw financialConflict(
            'DASHBOARD_SCOPE_TOO_LARGE',
            'Choose fewer records for this dashboard.',
          );
        return dashboardResponseSchema.parse(response);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  return { catalog, report };
}
