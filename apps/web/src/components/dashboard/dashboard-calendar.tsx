'use client';
import { useState } from 'react';
import type { DashboardResponse } from '@journal/contracts';
import { Button } from '@journal/ui';
export function DashboardCalendar({
  days,
  from,
  to,
  currency,
  unknownCount,
  onSelect,
}: {
  days: DashboardResponse['views']['calendar'];
  from: string;
  to: string;
  currency: string;
  unknownCount: number;
  onSelect: (ids: string[]) => void;
}) {
  const [month, setMonth] = useState(to.slice(0, 7));
  const [year, number] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year!, number! - 1, 1));
  const total = new Date(Date.UTC(year!, number!, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const shift = (amount: number) =>
    new Date(Date.UTC(year!, number! - 1 + amount, 1)).toISOString().slice(0, 7);
  const byDate = new Map(days.map((day) => [day.key, day]));
  const value = (input: string) =>
    `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(input))} ${currency}`;
  return (
    <section className="panel dashboard-chart">
      <div className="dashboard-chart-heading">
        <h2>Calendar performance</h2>
        <span>{currency}</span>
      </div>
      <p className="muted">
        Net completed P&L on the local close date. Blank means no activity, not zero profit.
      </p>
      <div className="dashboard-calendar-navigation">
        <Button
          variant="quiet"
          disabled={shift(-1) < from.slice(0, 7)}
          onClick={() => setMonth(shift(-1))}
        >
          Previous month
        </Button>
        <strong>
          {new Intl.DateTimeFormat(undefined, {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(first)}
        </strong>
        <Button
          variant="quiet"
          disabled={shift(1) > to.slice(0, 7)}
          onClick={() => setMonth(shift(1))}
        >
          Next month
        </Button>
      </div>
      {unknownCount > 0 && (
        <p role="note" className="muted">
          {unknownCount} excluded trades have no usable close date; calendar coverage is incomplete.
        </p>
      )}
      <div className="dashboard-calendar-month">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <span className="dashboard-weekday" key={day}>
            {day}
          </span>
        ))}
        {Array.from({ length: offset }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length: total }, (_, index) => {
          const key = `${month}-${String(index + 1).padStart(2, '0')}`;
          const entry = byDate.get(key);
          const outside = key < from || key > to;
          return (
            <button
              key={key}
              disabled={outside || !entry}
              className={
                outside
                  ? 'is-outside'
                  : entry?.value?.startsWith('-')
                    ? 'is-loss'
                    : entry?.value === null
                      ? 'is-unknown'
                      : entry
                        ? 'is-gain'
                        : 'is-empty'
              }
              aria-label={`${key}: ${entry ? (entry.value === null ? 'Unavailable' : `${entry.value} ${currency}`) : 'No closed activity'}`}
              onClick={() => entry && onSelect([...entry.campaignIds, ...entry.excludedIds])}
            >
              <span>{index + 1}</span>
              <strong>
                {entry ? (entry.value === null ? 'Unavailable' : value(entry.value)) : '—'}
              </strong>
              {entry && (
                <small>
                  {entry.campaignIds.length} trades
                  {entry.excludedIds.length ? ` · ${entry.excludedIds.length} excluded` : ''}
                </small>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
