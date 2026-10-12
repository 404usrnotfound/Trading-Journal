'use client';

import {
  currencyResponseSchema,
  type JournalCalculatedMetric,
  type JournalDetailResponse,
} from '@journal/contracts';
type Currency = ReturnType<typeof currencyResponseSchema.parse>;
function currencyLabel(id: string | null, currencies: Currency[]): string {
  return currencies.find((currency) => currency.id === id)?.code ?? (id ? `Currency ${id}` : '');
}
export function journalReason(reason: string): string {
  const messages: Record<string, string> = {
    trade_not_closed: 'R is available after the campaign is financially closed.',
    original_plan_missing: 'No original plan has been committed.',
    original_risk_missing: 'The original committed plan does not contain initial risk.',
    retrospective_commitment: 'The original plan was recorded after trading had begun.',
    commitment_not_before_execution:
      'An effective execution predates the original commitment, including any later backdated allocation or correction.',
    closure_review_required: 'A source change requires the trade closure to be reviewed.',
    incomplete_campaign_result: 'The campaign result is incomplete.',
    missing_fx: 'Pinned historical FX is missing for this valuation.',
    unsupported_inventory: 'This instrument does not support this calculation.',
    no_executions: 'No effective executions are allocated to this trade.',
    no_effective_fills: 'No effective executions are allocated to this trade.',
    missing_original_commitment: 'The original plan has not been committed.',
    missing_original_risk: 'The original committed plan does not contain initial risk.',
    retrospective_original_plan: 'The original plan was recorded after trading had begun.',
    execution_not_after_original_commitment:
      'An effective execution is at or before the original commitment. Later backdated allocations or corrections also make R unavailable.',
    campaign_not_completed: 'R is available after the campaign is financially closed.',
    incompatible_risk_currency:
      'A complete fee-net result in the original risk currency is unavailable.',
    incompatible_pinned_historical_fx:
      'Pinned historical FX cannot translate this result into the original risk currency.',
    missing_campaign_population: 'The campaign has no complete instrument population to value.',
    unresolved_standalone_costs:
      'Standalone fees require attribution before a complete campaign result can be established.',
  };
  return messages[reason] ?? `${reason.replaceAll('_', ' ').replaceAll('-', ' ')}.`;
}
import { Panel } from '@journal/ui';
import { Calculator, LockKeyhole } from 'lucide-react';
import { formatJournalTimestamp } from './journal-time';

export function JournalMetric({
  label,
  metric,
  currencies = [],
}: {
  label: string;
  metric: JournalCalculatedMetric;
  currencies?: Currency[];
}) {
  return (
    <div className="journal-metric">
      <dt>{label}</dt>
      <dd>
        {metric.status === 'available' ? (
          <>
            <strong>{metric.value}</strong>
            <span>
              {metric.unit === 'R'
                ? 'R'
                : metric.currencyId
                  ? `${currencyLabel(metric.currencyId, currencies)}${metric.unit.startsWith('price/') ? `/${metric.unit.slice(6)}` : ''}`
                  : metric.unit}
            </span>
          </>
        ) : (
          <span className="journal-unavailable">Unavailable</span>
        )}
      </dd>
      {metric.reasons.length > 0 && (
        <p className="journal-help">{metric.reasons.map(journalReason).join(' ')}</p>
      )}
    </div>
  );
}

export function JournalFinancial({
  detail,
  currencies,
  timeZone,
  locale,
}: {
  detail: JournalDetailResponse;
  currencies: Currency[];
  timeZone: string;
  locale?: string;
}) {
  const snapshot = detail.financial;
  const risk = detail.originalPlan?.definition.initialRisk;
  return (
    <Panel className="journal-financial">
      <div className="journal-section-heading">
        <h3>
          <Calculator size={18} aria-hidden="true" /> Ledger actuals
        </h3>
        <span className="journal-source">
          <LockKeyhole size={12} aria-hidden="true" /> Calculated · Read only
        </span>
      </div>
      <p className="journal-help">
        Effective fills and allocated costs, calculated from financial source revision{' '}
        {snapshot.sourceRevision}. Manual observations do not change these results.
      </p>
      <div className="journal-risk-summary">
        <dl>
          <JournalMetric label="R multiple" metric={snapshot.rMultiple} currencies={currencies} />
        </dl>
        <div>
          <span className="journal-eyebrow">Original committed risk</span>
          <strong>
            {risk
              ? `${risk.amount} ${currencyLabel(risk.currencyId, currencies)} · ${risk.method}`
              : 'No original risk recorded'}
          </strong>
          <p className="journal-help">
            {detail.commitment
              ? `${detail.commitment.timing === 'pre-trade' ? 'Recorded before known fills' : 'Retrospective plan'} · ${formatJournalTimestamp(detail.commitment.committedAt, timeZone, locale)}`
              : 'Publish a plan to record a server-timed commitment.'}
          </p>
          <p className="journal-help">
            Later plans and supplemental risk do not replace the original R denominator.
          </p>
        </div>
      </div>
      {snapshot.legs.length === 0 && (
        <p className="journal-help">
          No instrument legs are linked to this trade. Add catalog-linked legs when creating a
          trade, or use the ledger API for existing campaigns.
        </p>
      )}
      {snapshot.legs.map((leg) => (
        <section
          className="journal-ledger-leg"
          key={leg.legId}
          aria-label={`Ledger actuals for ${leg.instrumentName}`}
        >
          <div className="journal-leg-heading">
            <h4>{leg.instrumentName}</h4>
            <span>
              {leg.accountName} · {leg.direction} · {leg.quantityUnit}
            </span>
          </div>
          <dl className="journal-metrics-grid">
            <JournalMetric label="Actual entry" metric={leg.actualEntry} currencies={currencies} />
            <JournalMetric label="Actual exit" metric={leg.actualExit} currencies={currencies} />
            <JournalMetric
              label="Open quantity"
              metric={leg.openQuantity}
              currencies={currencies}
            />
            <JournalMetric
              label="Entered quantity"
              metric={leg.enteredQuantity}
              currencies={currencies}
            />
            <JournalMetric
              label="Exited quantity"
              metric={leg.exitedQuantity}
              currencies={currencies}
            />
            <JournalMetric label="Cost basis" metric={leg.costBasis} currencies={currencies} />
            <JournalMetric
              label="Realized gross P&L"
              metric={leg.realizedGross}
              currencies={currencies}
            />
            <JournalMetric
              label="Realized net P&L"
              metric={leg.realizedNet}
              currencies={currencies}
            />
          </dl>
          <details>
            <summary>Fills, fees &amp; lot attribution</summary>
            {leg.executions.length === 0 ? (
              <p className="journal-help">No effective executions allocated.</p>
            ) : (
              <div className="journal-table-wrap">
                <table className="journal-table">
                  <caption>Effective allocated executions for {leg.instrumentName}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Role</th>
                      <th scope="col">Quantity</th>
                      <th scope="col">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leg.executions.map((fill) => (
                      <tr key={fill.allocationId}>
                        <td>{formatJournalTimestamp(fill.economicAt, timeZone, locale)}</td>
                        <td>
                          {fill.role} · {fill.side}
                        </td>
                        <td>
                          {fill.quantity} {leg.quantityUnit}
                        </td>
                        <td>
                          {fill.price ?? 'Unavailable'}{' '}
                          {currencyLabel(leg.quoteCurrencyId, currencies)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="journal-help">
              {leg.lots.length} inventory lots · {leg.matches.length} realized matches. Fee amounts
              retain their currency; different units are never combined.
            </p>
            {leg.fees.length > 0 && (
              <ul className="journal-facts-list">
                {leg.fees.map((fee) => (
                  <li key={fee.feeId}>
                    {fee.amount} {currencyLabel(fee.currencyId, currencies)} ·{' '}
                    {formatJournalTimestamp(fee.chargedAt, timeZone, locale)}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>
      ))}
      <details className="journal-timeline">
        <summary>Financial timeline ({snapshot.timeline.length} events)</summary>
        <p className="journal-help">
          Only events allocated to this trade. Unrelated account cash movements are excluded.
        </p>
        {snapshot.timeline.length === 0 ? (
          <p className="journal-help">No financial events recorded.</p>
        ) : (
          <ol>
            {snapshot.timeline.map((event) => (
              <li key={event.id}>
                <time dateTime={event.economicAt}>
                  {formatJournalTimestamp(event.economicAt, timeZone, locale)}
                </time>
                <strong>{event.kind}</strong>
                <span>
                  {event.quantity !== null
                    ? `${event.quantity} units`
                    : event.amount !== null
                      ? `${event.amount} ${currencyLabel(event.currencyId, currencies)}`
                      : 'Amount unavailable'}
                  {event.price !== null ? ` @ ${event.price}` : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </details>
    </Panel>
  );
}
