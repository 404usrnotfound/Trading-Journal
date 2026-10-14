'use client';

import { useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  accountingReportRequestSchema,
  accountingReportResponseSchema,
  dashboardCatalogSchema,
  type AccountingReportRequest,
  type AccountingReportResponse,
  type DashboardCatalog,
  type WorkspaceResponse,
} from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import { dashboardDatePreset, inclusiveDateRange } from '../dashboard/dashboard-time';
import './accounts.css';

type Form = {
  from: string;
  to: string;
  currency: string;
  environment: string;
  age: string;
  accountIds: string;
  portfolioVersionId: string;
  explicitAccounts: boolean;
  priceSources: string | null;
  fxSources: string | null;
};
type Metric = AccountingReportResponse['breakdown']['tradingPnl'];
const split = (value: string) => value.split(',').map((entry) => entry.trim());
const sourceList = (selected: string | null, available: string[]) =>
  selected !== null
    ? selected.split(/\r?\n/u).map((entry) => entry.trim())
    : available.length
      ? available
      : ['manual'];
function sourceFromUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const sources: unknown = JSON.parse(value);
    if (Array.isArray(sources) && sources.every((source) => typeof source === 'string'))
      return sources.join('\n');
  } catch {
    /* A single source remains a valid explicit selection. */
  }
  return value;
}

async function read<T>(
  url: string,
  schema: { parse(value: unknown): T },
  signal: AbortSignal,
  body?: AccountingReportRequest,
): Promise<T> {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    ...(body
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'Your session ended. Sign in again to review account performance.'
        : response.status === 403
          ? 'You no longer have access to this workspace. Choose another workspace.'
          : response.status === 409
            ? 'This report exceeds the accounting limit. Choose fewer accounts or a shorter period.'
            : 'The account report could not be loaded. Check the selected scope and try again.',
    );
  try {
    return schema.parse(await response.json());
  } catch {
    throw new Error(
      'The account report response could not be validated. Retry loading the report; no totals were displayed.',
    );
  }
}

function prepare(
  form: Form,
  data: DashboardCatalog,
  workspace: WorkspaceResponse,
): AccountingReportRequest {
  if (!['live', 'paper'].includes(form.environment))
    throw new Error('Choose Live or Paper accounts.');
  if (form.portfolioVersionId && form.explicitAccounts)
    throw new Error('Choose accounts or an immutable portfolio version, rather than both.');
  const accounts = form.explicitAccounts
    ? split(form.accountIds)
    : data.accounts.filter((row) => row.environment === form.environment).map((row) => row.id);
  const portfolio = form.portfolioVersionId
    ? data.portfolios.find((row) => row.id === form.portfolioVersionId)
    : null;
  if (form.portfolioVersionId && (!portfolio || portfolio.environment !== form.environment))
    throw new Error(
      'This portfolio version is unavailable in the selected environment. Choose an available version.',
    );
  if (
    !form.portfolioVersionId &&
    (!accounts.length ||
      accounts.some(
        (selected) =>
          !data.accounts.some((row) => row.id === selected && row.environment === form.environment),
      ))
  )
    throw new Error(
      'Choose available accounts in the selected environment. No report was requested for the invalid account selection.',
    );
  const currency =
    form.currency ||
    data.currencies.find((row) => row.code === workspace.reportingCurrency)?.id ||
    '';
  if (!data.currencies.some((row) => row.id === currency))
    throw new Error(
      'Choose an available reporting currency. Add the workspace reporting currency in reference setup if needed.',
    );
  if (!/^\d+$/u.test(form.age))
    throw new Error('Maximum observation age must be a nonnegative whole number of milliseconds.');
  if (form.from > form.to) throw new Error('From must be on or before Through.');
  const request = accountingReportRequestSchema.safeParse({
    ...(form.portfolioVersionId
      ? { portfolioVersionId: form.portfolioVersionId }
      : { accountIds: accounts }),
    reportingCurrencyId: currency,
    ...inclusiveDateRange(form.from, form.to, workspace.timezone),
    fxPolicy: {
      id: 'account-review-explicit-sources/1',
      maxAgeMilliseconds: Number(form.age),
      sourcePriority: sourceList(form.fxSources, data.fxSources),
    },
    priceMaxAgeMilliseconds: Number(form.age),
    priceSourcePriority: sourceList(form.priceSources, data.priceSources),
  });
  if (!request.success)
    throw new Error(request.error.issues[0]?.message ?? 'Check the report settings.');
  return request.data;
}

function MetricCard({
  title,
  metric,
  currency,
  help,
}: {
  title: string;
  metric: Metric;
  currency: string;
  help: string;
}) {
  return (
    <Panel className="account-metric" role="group" aria-label={title}>
      <h3>{title}</h3>
      <p className="account-metric-value">
        {metric.state === 'available'
          ? `${metric.value} ${currency}`
          : metric.state === 'partial'
            ? 'Partial — total unavailable'
            : 'Unavailable'}
      </p>
      {metric.state !== 'available' && (
        <p className="account-incomplete">
          Known subtotal: {metric.knownSubtotal} {currency}. This is not the complete value.
        </p>
      )}
      <details>
        <summary>About {title.toLowerCase()}</summary>
        <p>{help}</p>
        {metric.reasons.length > 0 && (
          <p>
            Missing evidence:{' '}
            {metric.reasons.map((reason) => reason.replaceAll('_', ' ')).join('; ')}.
          </p>
        )}
        {metric.missingReferences.length > 0 && (
          <p className="account-reference">References: {metric.missingReferences.join(', ')}</p>
        )}
      </details>
    </Panel>
  );
}

const breakdown = [
  [
    'tradingPnl',
    'Trading P&L',
    'Realized trading P&L plus the change in unrealized trading P&L over this period. Fees, income, taxes, FX effects and capital flows remain separate.',
  ],
  [
    'realizedTradingPnl',
    'Realized trading P&L',
    'Gross realized trading outcomes recognized within the selected reporting period.',
  ],
  [
    'unrealizedTradingPnlChange',
    'Unrealized P&L change',
    'The period change in gross unrealized trading outcomes. This is a change, rather than the closing unrealized balance.',
  ],
  ['income', 'Income', 'Recorded dividends and interest. Income is separate from trading P&L.'],
  [
    'fees',
    'Fees',
    'Actual attributed execution costs and recorded fees. Values retain the accounting engine’s signed convention.',
  ],
  [
    'expenses',
    'Expenses',
    'Recorded financing, interest and other expenses, separate from trading outcomes.',
  ],
  ['taxes', 'Taxes', 'Recorded taxes and withholding. No tax liability is estimated.'],
  [
    'holdingFx',
    'Holdings FX effect',
    'Change from translating held instrument values between native and reporting currencies.',
  ],
  [
    'cashFx',
    'Cash FX effect',
    'The reporting-currency effect of changes in FX rates on cash balances.',
  ],
  [
    'transitFx',
    'Transfer-in-transit FX effect',
    'FX valuation changes on owned cash currently in transit.',
  ],
  [
    'conversionEffects',
    'FX conversion effects',
    'Effects of recorded two-currency conversions. An FX conversion is not a separate instrument holding.',
  ],
  [
    'externalCashFlows',
    'External cash flows',
    'Deposits and withdrawals crossing the user-owned boundary. Deposits are capital, rather than trading performance.',
  ],
  [
    'boundaryTransfers',
    'Scope-boundary transfers',
    'Transfers between user-owned accounts crossing this report’s selected scope. They are capital flows for this scope, rather than trading profit or loss.',
  ],
  [
    'openingAdjustments',
    'Opening adjustments',
    'Explicit adjustments separately identified by the accounting engine.',
  ],
] as const;

function AccountContent({
  workspace,
  workspaces,
}: {
  workspace: WorkspaceResponse;
  workspaces: WorkspaceResponse[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const id = useId();
  const prefix = `/api/v1/workspaces/${workspace.id}`;
  const [form, setForm] = useState<Form>(() => ({
    ...dashboardDatePreset('last-30-days', workspace.timezone),
    from: params.get('from') ?? dashboardDatePreset('last-30-days', workspace.timezone).from,
    to: params.get('to') ?? dashboardDatePreset('last-30-days', workspace.timezone).to,
    currency: params.get('currency') ?? '',
    environment: params.get('environment') ?? 'live',
    age: params.get('age') ?? '86400000',
    accountIds: params.get('accountIds') ?? '',
    portfolioVersionId: params.get('portfolioVersionId') ?? '',
    explicitAccounts: params.has('accountIds'),
    priceSources: sourceFromUrl(params.get('priceSources')),
    fxSources: sourceFromUrl(params.get('fxSources')),
  }));
  const [applied, setApplied] = useState(form);
  const [failure, setFailure] = useState<string | null>(null);
  const catalog = useQuery({
    queryKey: ['dashboard-catalog', workspace.id],
    queryFn: ({ signal }) => read(`${prefix}/dashboard/catalog`, dashboardCatalogSchema, signal),
  });
  const data = catalog.data;
  let request: AccountingReportRequest | undefined;
  let invalid: string | null = null;
  if (data) {
    try {
      request = prepare(applied, data, workspace);
    } catch (error) {
      invalid = error instanceof Error ? error.message : 'Check the report settings.';
    }
    if (
      params.has('portfolioVersionId') &&
      !applied.portfolioVersionId &&
      !applied.explicitAccounts
    )
      invalid =
        'Choose an immutable portfolio version or select accounts. The URL contained an empty portfolio selection.';
  }
  const report = useQuery({
    queryKey: ['accounting-report', workspace.id, request],
    enabled: !!request && !invalid,
    queryFn: ({ signal }) =>
      read(`${prefix}/accounting/reports`, accountingReportResponseSchema, signal, request!),
    retry: false,
  });
  const pending = JSON.stringify(form) !== JSON.stringify(applied);
  const availableAccounts =
    data?.accounts.filter((row) => row.environment === form.environment) ?? [];
  const selectedAccounts = form.explicitAccounts
    ? split(form.accountIds)
    : availableAccounts.map((row) => row.id);
  const availablePortfolios =
    data?.portfolios.filter((row) => row.environment === form.environment) ?? [];
  function change<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function apply(event?: FormEvent) {
    event?.preventDefault();
    if (!data) return;
    try {
      const next = prepare(form, data, workspace);
      const normalized = {
        ...form,
        currency: next.reportingCurrencyId,
        accountIds: next.accountIds?.join(',') ?? '',
        explicitAccounts: next.accountIds !== undefined,
        priceSources: next.priceSourcePriority.join('\n'),
        fxSources: next.fxPolicy.sourcePriority.join('\n'),
      };
      setForm(normalized);
      setApplied(normalized);
      setFailure(null);
      const url = new URLSearchParams({ workspace: workspace.id });
      for (const [key, value] of Object.entries(normalized))
        if (key !== 'explicitAccounts' && value)
          url.set(
            key,
            key === 'priceSources' || key === 'fxSources'
              ? JSON.stringify(sourceList(String(value), []))
              : String(value),
          );
      router.replace(`/accounts?${url}`, { scroll: false });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Check the report settings.');
    }
  }
  const response = !invalid ? report.data : undefined;
  const currency =
    data?.currencies.find((row) => row.id === response?.context.reportingCurrencyId)?.code ??
    'reporting currency';
  const dashboardParams = response
    ? new URLSearchParams({
        workspace: workspace.id,
        from: applied.from,
        to: applied.to,
        currency: response.context.reportingCurrencyId,
        environment: response.context.environment,
        age: String(response.context.pricePolicy.maxAgeMilliseconds),
        ...(response.context.portfolioVersionId
          ? { portfolioVersionId: response.context.portfolioVersionId }
          : { accountIds: response.context.accountIds.join(',') }),
      })
    : null;
  const setupUrl = `/record?workspace=${workspace.id}#catalog-setup`;
  const noAccounts = data && !data.accounts.some((row) => row.environment === form.environment);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACCOUNT REVIEW</div>
          <h1>Account performance</h1>
          <p>
            Review balances, trading outcomes and capital flows with a reconciled account report.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!request || !!invalid || report.isFetching}
          onClick={() => {
            void report.refetch();
          }}
        >
          {report.isFetching ? 'Refreshing report…' : 'Refresh report'}
        </Button>
      </div>
      {workspaces.length > 1 && (
        <WorkspaceSwitcher selected={workspace.id} workspaces={workspaces} />
      )}
      {catalog.isPending && (
        <Panel className="account-notice" role="status">
          Loading accounts and reporting choices…
        </Panel>
      )}
      {catalog.isError && (
        <Panel className="account-notice" role="alert">
          <p>{catalog.error.message}</p>
          <Button
            variant="secondary"
            onClick={() => {
              void catalog.refetch();
            }}
          >
            Retry loading accounts
          </Button>
        </Panel>
      )}
      {data && (
        <>
          {noAccounts && (
            <Panel className="account-notice">
              <h2>No {form.environment} accounts yet</h2>
              <p>Add an account and its cash currencies before reviewing performance.</p>
              <a className="button button-primary" href={setupUrl}>
                Set up accounts
              </a>
            </Panel>
          )}
          <Panel className="account-filters">
            <form onSubmit={apply} aria-label="Account report filters">
              <div className="account-filter-grid">
                <div className="field">
                  <label htmlFor={`${id}-environment`}>Environment</label>
                  <select
                    id={`${id}-environment`}
                    value={form.environment}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        environment: event.target.value,
                        portfolioVersionId: '',
                        accountIds: '',
                        explicitAccounts: false,
                      }))
                    }
                  >
                    {!['live', 'paper'].includes(form.environment) && (
                      <option value={form.environment}>
                        Invalid environment: {form.environment}
                      </option>
                    )}
                    <option value="live">Live</option>
                    <option value="paper">Paper</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${id}-currency`}>Reporting currency</label>
                  <select
                    id={`${id}-currency`}
                    value={
                      form.currency ||
                      data.currencies.find((row) => row.code === workspace.reportingCurrency)?.id ||
                      ''
                    }
                    onChange={(event) => change('currency', event.target.value)}
                  >
                    <option value="">Choose currency</option>
                    {form.currency && !data.currencies.some((row) => row.id === form.currency) && (
                      <option value={form.currency}>Unavailable currency</option>
                    )}
                    {data.currencies.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.code} · {row.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${id}-from`}>From</label>
                  <input
                    id={`${id}-from`}
                    type="date"
                    value={form.from}
                    onChange={(event) => change('from', event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${id}-to`}>Through</label>
                  <input
                    id={`${id}-to`}
                    type="date"
                    value={form.to}
                    onChange={(event) => change('to', event.target.value)}
                  />
                </div>
              </div>
              <p className="account-help">
                Calendar dates use {workspace.timezone}. The Through date is included. Live and
                paper accounts are reported separately.
              </p>
              <div className="account-shortcuts" aria-label="Report date presets">
                {(
                  [
                    ['today', 'Today'],
                    ['this-week', 'This week'],
                    ['last-week', 'Last week'],
                    ['last-30-days', 'Last 30 days'],
                  ] as const
                ).map(([preset, label]) => (
                  <Button
                    key={preset}
                    variant="quiet"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        ...dashboardDatePreset(preset, workspace.timezone),
                      }))
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <fieldset className="account-scope">
                <legend>Report scope</legend>
                <div className="account-scope-choices">
                  <label>
                    <input
                      type="radio"
                      name={`${id}-scope`}
                      checked={!form.portfolioVersionId}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          portfolioVersionId: '',
                          explicitAccounts: false,
                          accountIds: '',
                        }))
                      }
                    />{' '}
                    Accounts
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`${id}-scope`}
                      checked={!!form.portfolioVersionId}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          portfolioVersionId: availablePortfolios[0]?.id ?? '',
                          accountIds: '',
                          explicitAccounts: false,
                        }))
                      }
                      disabled={!availablePortfolios.length}
                    />{' '}
                    Immutable portfolio version
                  </label>
                </div>
                {form.portfolioVersionId ? (
                  <div className="field">
                    <label htmlFor={`${id}-portfolio`}>Portfolio version</label>
                    <select
                      id={`${id}-portfolio`}
                      value={form.portfolioVersionId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          portfolioVersionId: event.target.value,
                          accountIds: '',
                          explicitAccounts: false,
                        }))
                      }
                    >
                      {!availablePortfolios.some((row) => row.id === form.portfolioVersionId) && (
                        <option value={form.portfolioVersionId}>
                          Unavailable version — choose another
                        </option>
                      )}
                      {availablePortfolios.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label} · v{row.version}
                        </option>
                      ))}
                    </select>
                    <p className="account-help">
                      This saved version fixes the account membership. Later portfolio edits do not
                      reinterpret this scope.
                    </p>
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor={`${id}-accounts`}>Accounts</label>
                    <select
                      id={`${id}-accounts`}
                      multiple
                      size={Math.min(5, Math.max(2, availableAccounts.length))}
                      value={selectedAccounts}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          accountIds: Array.from(
                            event.target.selectedOptions,
                            (option) => option.value,
                          ).join(','),
                          explicitAccounts: true,
                          portfolioVersionId: '',
                        }))
                      }
                    >
                      {selectedAccounts
                        .filter((selected) => !availableAccounts.some((row) => row.id === selected))
                        .map((selected, index) => (
                          <option key={`${selected}-${index}`} value={selected}>
                            Unavailable account: {selected || '(empty selection)'}
                          </option>
                        ))}
                      {availableAccounts.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label}
                          {row.parentId
                            ? ` · ${data.brokers.find((broker) => broker.id === row.parentId)?.label ?? 'Broker'}`
                            : ''}
                        </option>
                      ))}
                    </select>
                    <p className="account-help">
                      Choose one or more accounts. Use Ctrl or Command to select multiple, or Shift
                      with the arrow keys.
                    </p>
                    <Button
                      variant="quiet"
                      disabled={!availableAccounts.length}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          accountIds: availableAccounts.map((row) => row.id).join(','),
                          explicitAccounts: true,
                        }))
                      }
                    >
                      Select all {form.environment} accounts
                    </Button>
                  </div>
                )}
              </fieldset>
              <details className="account-policy">
                <summary>Price and FX evidence policy</summary>
                <p>
                  The report selects existing observations in this priority order, within the
                  maximum age. Missing evidence leaves affected totals incomplete. Refreshing does
                  not create prices or FX rates.
                </p>
                <div className="account-policy-grid">
                  <div className="field">
                    <label htmlFor={`${id}-age`}>Maximum observation age (milliseconds)</label>
                    <input
                      id={`${id}-age`}
                      inputMode="numeric"
                      value={form.age}
                      onChange={(event) => change('age', event.target.value)}
                    />
                    <span className="account-help">
                      86400000 = 24 hours. Zero requires an observation at the boundary.
                    </span>
                  </div>
                  <div className="field">
                    <label htmlFor={`${id}-price-sources`}>Price source priority</label>
                    <textarea
                      id={`${id}-price-sources`}
                      rows={3}
                      value={form.priceSources ?? sourceList(null, data.priceSources).join('\n')}
                      onChange={(event) => change('priceSources', event.target.value)}
                    />
                    <span className="account-help">
                      One source per line, highest priority first. Names may contain commas.
                    </span>
                  </div>
                  <div className="field">
                    <label htmlFor={`${id}-fx-sources`}>FX source priority</label>
                    <textarea
                      id={`${id}-fx-sources`}
                      rows={3}
                      value={form.fxSources ?? sourceList(null, data.fxSources).join('\n')}
                      onChange={(event) => change('fxSources', event.target.value)}
                    />
                    <span className="account-help">
                      One source per line, highest priority first. Names may contain commas.
                    </span>
                  </div>
                </div>
              </details>
              <div className="account-apply">
                <Button type="submit" disabled={noAccounts}>
                  Apply report settings
                </Button>
                <span role="status">
                  {pending
                    ? 'Settings changed. Apply to update the complete report.'
                    : 'All values below use the applied report settings.'}
                </span>
              </div>
              {(failure || invalid) && (
                <p className="account-validation" role="alert">
                  {failure || invalid}
                </p>
              )}
            </form>
          </Panel>
          {!invalid && report.isPending && !!request && (
            <Panel className="account-notice" role="status">
              Loading the account report…
            </Panel>
          )}
          {!invalid && report.isError && (
            <Panel className="account-notice" role="alert">
              <p>{report.error.message}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  void report.refetch();
                }}
              >
                Retry account report
              </Button>
            </Panel>
          )}
          {response && (
            <div className="account-results" aria-busy={report.isFetching}>
              <p className="account-context">
                {response.context.environment === 'live' ? 'Live' : 'Paper'} ·{' '}
                {response.context.accountIds.length} account
                {response.context.accountIds.length === 1 ? '' : 's'} · {applied.from} through{' '}
                {applied.to} · {currency}
                {response.context.portfolioVersion !== null
                  ? ` · Portfolio v${response.context.portfolioVersion}`
                  : ''}
              </p>
              <section aria-labelledby={`${id}-balances`}>
                <h2 id={`${id}-balances`}>Closing balances</h2>
                <div className="account-metric-grid">
                  <MetricCard
                    title="Cash"
                    metric={response.closing.cash}
                    currency={currency}
                    help="Closing cash translated into the reporting currency. Native cash balances are shown below; cash deposits are capital flows."
                  />
                  <MetricCard
                    title="Equity"
                    metric={response.closing.equity}
                    currency={currency}
                    help="Closing account equity under the documented accounting policy. Missing prices, FX observations or unsupported asset accounting leave the total incomplete."
                  />
                  <MetricCard
                    title="Net liquidation value"
                    metric={response.closing.netLiquidationValue}
                    currency={currency}
                    help="The engine’s closing net liquidation value with its explicit treatment of liabilities and owned cash in transit. This is not a broker guarantee of executable liquidation proceeds."
                  />
                </div>
                <details className="account-native-cash">
                  <summary>Cash by native currency</summary>
                  <ul>
                    {response.closing.cashByCurrency.map((row) => (
                      <li key={row.currencyId}>
                        {data.currencies.find((entry) => entry.id === row.currencyId)?.code ??
                          row.currencyId}
                        : {row.amount ?? 'Unavailable'}
                        {row.reasons.length > 0 &&
                          ` · ${row.reasons.map((reason) => reason.replaceAll('_', ' ')).join('; ')}`}
                      </li>
                    ))}
                  </ul>
                  {!response.closing.cashByCurrency.length && (
                    <p>No native cash balances in this scope.</p>
                  )}
                </details>
              </section>
              <section aria-labelledby={`${id}-reconcile`}>
                <h2 id={`${id}-reconcile`}>Reconciliation</h2>
                <p className="account-help">
                  Transfers within the selected owned accounts are not profit or loss. External cash
                  flows and transfers crossing this scope are capital flows, separate from
                  performance.
                </p>
                <div className="account-metric-grid">
                  <MetricCard
                    title="NAV change"
                    metric={response.reconciliation.navChange}
                    currency={currency}
                    help="Closing net asset value minus opening net asset value. Capital flows can change NAV without representing performance."
                  />
                  <MetricCard
                    title="Account performance"
                    metric={response.reconciliation.performance}
                    currency={currency}
                    help="NAV change after removing net capital flows. This is a monetary period result, not a percentage return."
                  />
                  <MetricCard
                    title="Reconciliation variance"
                    metric={response.reconciliation.variance}
                    currency={currency}
                    help="Difference between NAV change and its explained accounting components. A complete zero variance reconciles; an incomplete zero known subtotal does not prove reconciliation."
                  />
                </div>
                <details className="account-reconciliation-details">
                  <summary>Reconciliation components</summary>
                  <div className="account-metric-grid">
                    <MetricCard
                      title="Net capital flows"
                      metric={response.reconciliation.netCapitalFlows}
                      currency={currency}
                      help="External cash flows and owned-account transfers crossing the chosen account scope."
                    />
                    <MetricCard
                      title="Explained NAV change"
                      metric={response.reconciliation.explainedChange}
                      currency={currency}
                      help="The sum of the accounting engine’s separate components explaining the NAV change."
                    />
                    <MetricCard
                      title="Rounding residual"
                      metric={response.reconciliation.roundingResidual}
                      currency={currency}
                      help="Explicit arithmetic precision residual retained by the accounting engine; the UI does not recompute or round authoritative totals."
                    />
                  </div>
                </details>
              </section>
              <section aria-labelledby={`${id}-breakdown`}>
                <h2 id={`${id}-breakdown`}>Period breakdown</h2>
                <p className="account-help">
                  Amounts retain the report’s signed conventions. Trading P&L is shown alongside its
                  components; the cards should not be added together.
                </p>
                <div className="account-breakdown-grid">
                  {breakdown.map(([key, title, help]) => (
                    <MetricCard
                      key={key}
                      title={title}
                      metric={response.breakdown[key]}
                      currency={currency}
                      help={help}
                    />
                  ))}
                </div>
              </section>
              <details className="account-evidence">
                <summary>Applied scope and evidence</summary>
                <p>
                  Source revision: {response.context.sourceRevision}. Reporting boundaries:{' '}
                  {response.context.from} to {response.context.to}.
                </p>
                <p>
                  Accounts:{' '}
                  {response.context.accountIds
                    .map(
                      (accountId) =>
                        data.accounts.find((row) => row.id === accountId)?.label ?? accountId,
                    )
                    .join(', ')}
                  .
                </p>
                <p>
                  Price sources: {response.context.pricePolicy.sourcePriority.join(' → ')}; maximum
                  age {response.context.pricePolicy.maxAgeMilliseconds} milliseconds. FX sources:{' '}
                  {response.context.fxPolicy.sourcePriority.join(' → ')}; maximum age{' '}
                  {response.context.fxPolicy.maxAgeMilliseconds} milliseconds.
                </p>
                <p>
                  {response.dependencies.prices.length} selected price observations;{' '}
                  {response.dependencies.fx.length} FX selections. Refresh may use a newer ledger
                  revision.
                </p>
                <p className="account-reference">
                  Accounting policy: {response.context.accountingVersion}; calculation kernel:{' '}
                  {response.context.manifest.kernel}.
                </p>
              </details>
              <div className="account-links">
                <a href={`/dashboard?${dashboardParams}`}>Review trade analytics</a>
                <p className="account-help">
                  The dashboard retains this account and date scope and uses its own displayed
                  price/FX coverage policy.
                </p>
                <a href={`/journal?workspace=${workspace.id}`}>Open trade history</a>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

export function AccountWorkspace(props: {
  workspace: WorkspaceResponse;
  workspaces: WorkspaceResponse[];
}) {
  const params = useSearchParams();
  return <AccountContent key={`${props.workspace.id}:${params.toString()}`} {...props} />;
}
