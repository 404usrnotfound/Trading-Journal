'use client';
import { useId, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
export type DashboardChartRow = {
  key: string;
  label: string;
  value: string | null;
  campaignIds: string[];
  detail?: string;
};
export function DashboardChart({
  title,
  description,
  unit,
  rows,
  kind = 'bar',
  onSelect,
  empty = 'No eligible observations in this sample.',
}: {
  title: string;
  description: string;
  unit: string;
  rows: DashboardChartRow[];
  kind?: 'bar' | 'line' | 'step';
  onSelect?: (row: DashboardChartRow) => void;
  empty?: string;
}) {
  const id = useId();
  const [tableOpen, setTableOpen] = useState(false);
  const data = rows.map((row) => ({ ...row, plot: row.value === null ? null : Number(row.value) }));
  const available = rows.some((row) => row.value !== null);
  const common = { data, margin: { top: 12, right: 15, bottom: 5, left: 5 } };
  const axes = (
    <>
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} minTickGap={20} />
      <YAxis
        allowDecimals={unit !== 'trades'}
        width={72}
        tick={{ fill: 'var(--muted)', fontSize: 11 }}
        tickFormatter={(value) =>
          new Intl.NumberFormat(undefined, {
            notation: 'compact',
            maximumFractionDigits: 1,
          }).format(value as number)
        }
      />
      <Tooltip
        content={({ payload, label }) => {
          const row = payload?.[0]?.payload as DashboardChartRow | undefined;
          return row ? (
            <div className="dashboard-tooltip">
              <strong>{String(label)}</strong>
              <p>
                {row.value ?? 'Unavailable'} {unit}
              </p>
              {row.detail && <small>{row.detail}</small>}
            </div>
          ) : null;
        }}
      />
    </>
  );
  return (
    <section className="panel dashboard-chart" aria-labelledby={id}>
      <div className="dashboard-chart-heading">
        <h2 id={id}>{title}</h2>
        <span>{unit}</span>
      </div>
      <p className="muted dashboard-chart-description">{description}</p>
      {available ? (
        <div
          className="dashboard-plot"
          aria-label={`${title} visualization; exact values and keyboard drill-down in the data table below`}
          role="img"
        >
          <ResponsiveContainer width="100%" height={230} minWidth={0}>
            {kind === 'bar' ? (
              <BarChart {...common}>
                {axes}
                <Bar
                  dataKey="plot"
                  fill="var(--accent)"
                  isAnimationActive={false}
                  onClick={(entry) => {
                    const row = entry as unknown as DashboardChartRow;
                    if (onSelect) onSelect(row);
                  }}
                />
              </BarChart>
            ) : (
              <LineChart {...common}>
                {axes}
                <Line
                  type={kind === 'step' ? 'stepAfter' : 'linear'}
                  dataKey="plot"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={{ r: 3 }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="dashboard-chart-empty" role="note">
          {empty}
        </p>
      )}
      <details
        className="dashboard-chart-table"
        onToggle={(event) => setTableOpen(event.currentTarget.open)}
      >
        <summary>View data · {rows.length} observations</summary>
        {tableOpen && (
          <div className="dashboard-table-scroll">
            <table>
              <caption>
                {title} · exact values in {unit}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Observation</th>
                  <th scope="col">Value</th>
                  <th scope="col">Supporting records</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    <td>
                      {row.value === null ? 'Unavailable' : `${row.value} ${unit}`}
                      {row.detail && <small className="muted">{row.detail}</small>}
                    </td>
                    <td>
                      {onSelect && row.campaignIds.length ? (
                        <button className="button button-quiet" onClick={() => onSelect(row)}>
                          Review {row.campaignIds.length} trades
                        </button>
                      ) : (
                        (row.detail ?? 'Account-ledger observation')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </section>
  );
}
