'use client';

import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  accountPerformanceRequestSchema,
  accountPerformanceResponseSchema,
  type AccountingReportRequest,
} from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { DashboardChart } from '../dashboard/dashboard-chart';

export function AccountReturnSeries({
  workspaceId,
  timezone,
  request,
  currency,
}: {
  workspaceId: string;
  timezone: string;
  request: AccountingReportRequest;
  currency: string;
}) {
  const [dates, setDates] = useState('');
  const [applied, setApplied] = useState<ReturnType<
    typeof accountPerformanceRequestSchema.parse
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const performance = useQuery({
    queryKey: ['account-return-series', workspaceId, applied],
    enabled: applied !== null,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/accounting/performance`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(applied),
      });
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'This period has too many flow boundaries. Select a shorter period.'
            : 'Account return series could not be loaded. Review access and valuation settings.',
        );
      return accountPerformanceResponseSchema.parse(await response.json());
    },
    retry: false,
  });
  const show = (event: FormEvent) => {
    event.preventDefault();
    try {
      setApplied(
        accountPerformanceRequestSchema.parse({
          ...request,
          detail: 'summary',
          checkpoints: dates
            .split(/\r?\n/u)
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      );
      setError(null);
    } catch {
      setError('Use at most 24 ISO timestamps strictly inside the selected period.');
    }
  };
  const data = performance.data;
  const metric = (
    value: typeof data extends undefined ? never : NonNullable<typeof data>['twr'],
  ) =>
    value.state === 'available'
      ? `${value.value} (decimal ratio)`
      : `Unavailable: ${value.reasons.join(', ')}`;
  const label = (at: string) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(at));
  return (
    <Panel className="account-performance-series">
      <h2>Account NAV and flow-adjusted returns</h2>
      <p>
        Every capital-flow instant is valued using the report price and FX policy. Optional samples
        add detail; unobserved periods are not inferred. Unitized returns remove deposits and
        scope-boundary transfers. Returns and drawdown require complete positive capital at every
        subperiod boundary.
      </p>
      <form onSubmit={show}>
        <label>
          Additional valuation timestamps, one ISO timestamp per line
          <textarea
            aria-label="Additional account valuation timestamps"
            value={dates}
            onChange={(event) => setDates(event.target.value)}
          />
        </label>
        <Button disabled={performance.isFetching} type="submit">
          {performance.isFetching ? 'Calculating account series…' : 'Calculate account series'}
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {performance.isError && <p role="alert">{performance.error.message}</p>}
      {data && (
        <>
          <dl>
            <dt>Time-weighted return (period)</dt>
            <dd>{metric(data.twr)}</dd>
            <dt>Money-weighted return (annualized ACT/365)</dt>
            <dd>{metric(data.mwr)}</dd>
            <dt>Maximum unitized drawdown (sampled boundaries)</dt>
            <dd>{metric(data.maximumDrawdown)}</dd>
            <dt>Observed recovery duration</dt>
            <dd>
              {data.recoveryDurationMilliseconds === null
                ? 'Unavailable or still unrecovered'
                : `${data.recoveryDurationMilliseconds} milliseconds`}
            </dd>
          </dl>
          <p>
            Source revision {data.sourceRevision}. MWR requires a proven unique discount-factor
            root; ambiguous patterns return unavailable. Charts sample the listed checkpoints and do
            not claim an intraperiod maximum.
          </p>
          <DashboardChart
            title="Raw account NAV"
            description="Account net liquidation value, including capital contributions. This curve is not a flow-adjusted return."
            unit={currency}
            kind="line"
            rows={data.series.map((point) => ({
              key: point.at,
              label: label(point.at),
              value: point.nav,
              campaignIds: [],
              detail: `Economic time ${point.at}; capital flow ${point.capitalFlow ?? 'unavailable'} ${currency}. ${point.reasons.join(', ')}`,
            }))}
          />
          <DashboardChart
            title="Flow-adjusted account performance"
            description="Unit index starts at 100. Capital contributions do not create recovery. Missing valuation evidence breaks the series."
            unit="index"
            kind="line"
            rows={data.series.map((point) => ({
              key: point.at,
              label: label(point.at),
              value: point.unitIndex,
              campaignIds: [],
              detail: `Drawdown ${point.drawdown ?? 'unavailable'}; ${point.reasons.join(', ')}`,
            }))}
          />
        </>
      )}
    </Panel>
  );
}
