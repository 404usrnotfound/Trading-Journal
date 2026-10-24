'use client';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Panel } from '@journal/ui';
import {
  riskAssessmentResponseSchema,
  riskCatalogResponseSchema,
  riskDefinitionSchema,
  riskPolicyListSchema,
  riskPolicyVersionSchema,
  riskSizingResponseSchema,
  type RiskAssessmentResponse,
  type RiskPolicyVersion,
  type WorkspaceResponse,
} from '@journal/contracts';
import type { RiskLimit } from '@journal/domain';
import { recordRead, retainedCommand } from '../record/record-api';
import { riskWrite as recordWrite } from './risk-api';
import { formatJournalTimestamp } from '../journal/journal-time';
import './risk.css';

type Collection =
  | 'accounts'
  | 'strategies'
  | 'strategy-versions'
  | 'instruments'
  | 'currencies'
  | 'fx-observations';
function Lookup({
  prefix,
  collection,
  label,
  value,
  onChange,
  required = false,
}: {
  prefix: string;
  collection: Collection;
  label: string;
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
}) {
  const [search, setSearch] = useState('');
  const identity = useId();
  const query = useInfiniteQuery({
    queryKey: ['risk-catalog', prefix, collection, search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ collection, search });
      if (pageParam) p.set('after', pageParam);
      return recordRead(`${prefix}/catalog?${p}`, riskCatalogResponseSchema);
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="risk-field">
      <label htmlFor={`${identity}-search`}>Search {label.toLowerCase()}</label>
      <input
        id={`${identity}-search`}
        aria-label={`Search ${label.toLowerCase()}`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search reference names"
      />
      <label htmlFor={`${identity}-select`}>{label}</label>
      <select
        id={`${identity}-select`}
        aria-label={label}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{required ? 'Choose…' : 'None'}</option>
        {value && !rows.some((r) => r.id === value) && (
          <option value={value}>Selected reference · {value}</option>
        )}
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.label}
          </option>
        ))}
      </select>
      {query.isError && (
        <p role="alert">
          References could not load.{' '}
          <Button onClick={() => void query.refetch()}>Retry references</Button>
        </p>
      )}
      {query.hasNextPage && (
        <Button
          variant="quiet"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          Load more {label.toLowerCase()}
        </Button>
      )}
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  required = false,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  help?: string;
}) {
  const identity = useId();
  return (
    <div className="risk-field">
      <label htmlFor={identity}>{label}</label>
      <input
        id={identity}
        value={value}
        required={required}
        aria-describedby={help ? `${identity}-help` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {help && <small id={`${identity}-help`}>{help}</small>}
    </div>
  );
}
const numberText = (text: string) => {
  if (!/^\d+$/u.test(text))
    throw new Error('Enter a nonnegative whole number for calendar hours, counts and freshness.');
  return Number(text);
};
const csv = (text: string) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

function PolicyEditor({
  prefix,
  workspace,
  selected,
  onSaved,
}: {
  prefix: string;
  workspace: WorkspaceResponse;
  selected: RiskPolicyVersion | null;
  onSaved: (value: RiskPolicyVersion) => void;
}) {
  const [name, setName] = useState(selected?.definition.name ?? '');
  const [scope, setScope] = useState(selected?.strategyId ? 'strategy' : 'account');
  const [scopeId, setScopeId] = useState(selected?.accountId ?? selected?.strategyId ?? '');
  const [effectiveAt, setEffectiveAt] = useState(new Date().toISOString());
  const [reason, setReason] = useState('');
  const [age, setAge] = useState(selected ? String(selected.definition.maxAgeMilliseconds) : '');
  const [priceSources, setPriceSources] = useState(
    selected?.definition.priceSources.join(', ') ?? 'manual',
  );
  const [fxSources, setFxSources] = useState(selected?.definition.fxSources.join(', ') ?? 'manual');
  const [limits, setLimits] = useState<RiskLimit[]>(selected?.definition.limits ?? []);
  const [kind, setKind] = useState<RiskLimit['kind']>('trade-risk');
  const [maximum, setMaximum] = useState('');
  const [currency, setCurrency] = useState('');
  const [measure, setMeasure] = useState('amount');
  const [basis, setBasis] = useState<'realized-activity' | 'account-change'>('account-change');
  const [includeIncome, setIncludeIncome] = useState(true);
  const [timezone, setTimezone] = useState(workspace.timezone);
  const [denominator, setDenominator] = useState<'amount' | 'equity'>('amount');
  const [instrument, setInstrument] = useState('');
  const [boundary, setBoundary] = useState('');
  const [instrumentIds, setInstrumentIds] = useState('');
  const [families, setFamilies] = useState('');
  const [subtypes, setSubtypes] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const commands = useRef(new Map<string, { serialized: string; id: string }>());
  function addLimit() {
    setFailure(null);
    try {
      const common = { id: crypto.randomUUID(), kind };
      let limit: unknown;
      if (kind === 'positions') limit = { ...common, maximum: numberText(maximum) };
      else if (kind === 'overnight')
        limit = { ...common, timezone, boundaryHour: numberText(boundary) };
      else if (kind === 'prohibited')
        limit = {
          ...common,
          instrumentIds: csv(instrumentIds),
          families: csv(families),
          subtypes: csv(subtypes),
        };
      else if (kind === 'daily-loss' || kind === 'weekly-loss')
        limit = { ...common, maximum, currencyId: currency, basis, includeIncome, timezone };
      else if (kind === 'concentration')
        limit = { ...common, maximum, currencyId: currency, instrumentId: instrument || null };
      else if (kind === 'exposure')
        limit = {
          ...common,
          maximum,
          currencyId: currency,
          measure: measure === 'net' ? 'net' : 'gross',
          denominator,
        };
      else
        limit = {
          ...common,
          maximum,
          currencyId: currency,
          measure: measure === 'equity-ratio' ? 'equity-ratio' : 'amount',
        };
      const parsed = riskDefinitionSchema.parse({
        name: name || 'Draft policy',
        limits: [...limits, limit],
        maxAgeMilliseconds: age === '' ? 0 : numberText(age),
        priceSources: csv(priceSources),
        fxSources: csv(fxSources),
      });
      setLimits(parsed.limits);
      setMaximum('');
      setBoundary('');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Check the limit fields.');
    }
  }
  async function publish(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFailure(null);
    setBusy(true);
    try {
      const body = {
        ...(selected ? { policyId: selected.policyId } : {}),
        expectedVersion: selected?.version ?? 0,
        accountId: scope === 'account' ? scopeId : null,
        strategyId: scope === 'strategy' ? scopeId : null,
        effectiveAt,
        reason,
        definition: {
          name,
          limits,
          maxAgeMilliseconds: numberText(age),
          priceSources: csv(priceSources),
          fxSources: csv(fxSources),
        },
      };
      const result = await recordWrite(
        `${prefix}/policies`,
        body,
        riskPolicyVersionSchema,
        retainedCommand(commands.current, 'publish', body),
      );
      commands.current.delete('publish');
      onSaved(result);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Policy publication failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void publish(e)}>
      <fieldset disabled={busy || workspace.role === 'viewer'}>
        <legend>
          {selected ? `Publish version after v${selected.version}` : 'Create a risk policy'}
        </legend>
        <p>
          Account and strategy restrictions both apply. A strategy cannot relax an account limit.
          Strategy policies restrict the account used for that strategy; they do not invent a
          separate strategy capital balance.
        </p>
        <div className="risk-grid">
          <Field label="Policy name" value={name} onChange={setName} required />
          <label className="risk-field">
            Policy scope
            <select
              value={scope}
              disabled={!!selected}
              onChange={(e) => {
                setScope(e.target.value);
                setScopeId('');
              }}
            >
              <option value="account">Account</option>
              <option value="strategy">Strategy</option>
            </select>
          </label>
          {selected ? (
            <p>Immutable scope: {scopeId}</p>
          ) : (
            <Lookup
              prefix={prefix}
              collection={scope === 'account' ? 'accounts' : 'strategies'}
              label="Policy scope reference"
              value={scopeId}
              onChange={setScopeId}
              required
            />
          )}
          <Field
            label="Effective instant"
            value={effectiveAt}
            onChange={setEffectiveAt}
            required
            help="ISO timestamp with offset. Historical assessments already captured remain unchanged."
          />
          <Field label="Change reason" value={reason} onChange={setReason} required />
          <Field
            label="Maximum observation age in milliseconds"
            value={age}
            onChange={setAge}
            required
            help="Choose explicitly; missing or stale prices and FX make affected assessments unknown."
          />
          <Field
            label="Price source priority"
            value={priceSources}
            onChange={setPriceSources}
            required
            help="Comma-separated exact source names, highest priority first."
          />
          <Field label="FX source priority" value={fxSources} onChange={setFxSources} required />
        </div>
        <h3>Configured limits</h3>
        {limits.length === 0 ? (
          <p>
            No numeric restrictions configured. An empty policy will not claim compliance with an
            invented limit.
          </p>
        ) : (
          <ol>
            {limits.map((limit) => (
              <li key={limit.id}>
                <strong>{limit.kind}</strong>
                <pre>{JSON.stringify(limit, null, 2)}</pre>
                <Button
                  variant="quiet"
                  onClick={() => setLimits(limits.filter((item) => item.id !== limit.id))}
                >
                  Remove {limit.kind} limit
                </Button>
              </li>
            ))}
          </ol>
        )}
        <details open={limits.length === 0}>
          <summary>Add a typed restriction</summary>
          <div className="risk-grid">
            <label className="risk-field">
              Limit kind
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as RiskLimit['kind']);
                  setMeasure('amount');
                }}
              >
                {[
                  'trade-risk',
                  'daily-loss',
                  'weekly-loss',
                  'positions',
                  'concentration',
                  'exposure',
                  'overnight',
                  'prohibited',
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            {!['overnight', 'prohibited'].includes(kind) && (
              <Field
                label="Configured maximum"
                value={maximum}
                onChange={setMaximum}
                help={
                  kind === 'concentration' || measure === 'equity-ratio' || denominator === 'equity'
                    ? 'A ratio is a fraction: 0.02 means 2%. No capital or threshold is assumed.'
                    : 'Enter an exact decimal; positions requires a whole-number count.'
                }
              />
            )}
            {!['positions', 'overnight', 'prohibited'].includes(kind) && (
              <Lookup
                prefix={prefix}
                collection="currencies"
                label="Limit currency"
                value={currency}
                onChange={setCurrency}
              />
            )}
            {kind === 'trade-risk' && (
              <label className="risk-field">
                Risk measure
                <select value={measure} onChange={(e) => setMeasure(e.target.value)}>
                  <option value="amount">Monetary risk</option>
                  <option value="equity-ratio">Risk / complete positive account equity</option>
                </select>
              </label>
            )}
            {['daily-loss', 'weekly-loss'].includes(kind) && (
              <>
                <label className="risk-field">
                  Period loss basis
                  <select value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)}>
                    <option value="account-change">
                      Complete account change excluding capital flows
                    </option>
                    <option value="realized-activity">
                      Gross realizations plus realized FX less period-charged costs
                    </option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={includeIncome}
                    onChange={(e) => setIncludeIncome(e.target.checked)}
                  />
                  Include actual period income
                </label>
              </>
            )}
            {['daily-loss', 'weekly-loss', 'overnight'].includes(kind) && (
              <Field label="Policy calendar timezone" value={timezone} onChange={setTimezone} />
            )}
            {kind === 'exposure' && (
              <>
                <label className="risk-field">
                  Exposure measure
                  <select value={measure} onChange={(e) => setMeasure(e.target.value)}>
                    <option value="gross">Gross absolute instrument exposure</option>
                    <option value="net">Absolute net account exposure</option>
                  </select>
                </label>
                <label className="risk-field">
                  Exposure denominator
                  <select
                    value={denominator}
                    onChange={(e) => setDenominator(e.target.value as typeof denominator)}
                  >
                    <option value="amount">Absolute monetary cap</option>
                    <option value="equity">Complete positive account equity</option>
                  </select>
                </label>
              </>
            )}
            {kind === 'concentration' && (
              <Field
                label="Concentration instrument ID (optional)"
                value={instrument}
                onChange={setInstrument}
                help="Empty evaluates the largest individual instrument's absolute exposure / account equity."
              />
            )}
            {kind === 'overnight' && (
              <Field
                label="Prohibited local boundary hour"
                value={boundary}
                onChange={setBoundary}
                help="Integer 0–23. Existing holdings crossing that hour breach; a proposal needs its intended exit."
              />
            )}
            {kind === 'prohibited' && (
              <>
                <Field
                  label="Prohibited instrument IDs"
                  value={instrumentIds}
                  onChange={setInstrumentIds}
                  help="Comma-separated exact instrument identities, distinct from metadata version IDs."
                />
                <Field label="Prohibited asset families" value={families} onChange={setFamilies} />
                <Field
                  label="Prohibited instrument subtypes"
                  value={subtypes}
                  onChange={setSubtypes}
                />
              </>
            )}
          </div>
          <Button variant="secondary" onClick={addLimit} disabled={limits.length >= 32}>
            Add configured limit
          </Button>
        </details>
        <p>
          Review the scope, effective instant and configured limits before publishing an immutable
          version. Actual fills remain recordable after a breach.
        </p>
        <Button type="submit">{busy ? 'Publishing…' : 'Publish policy version'}</Button>
      </fieldset>
      {failure && (
        <p role="alert" className="form-error">
          {failure}
        </p>
      )}
    </form>
  );
}

function Assessment({ prefix, workspace }: { prefix: string; workspace: WorkspaceResponse }) {
  const [account, setAccount] = useState('');
  const [strategy, setStrategy] = useState('');
  const [at, setAt] = useState(new Date().toISOString());
  const [proposed, setProposed] = useState(false);
  const [instrument, setInstrument] = useState('');
  const [side, setSide] = useState('long');
  const [quantity, setQuantity] = useState('');
  const [entry, setEntry] = useState('');
  const [risk, setRisk] = useState('');
  const [currency, setCurrency] = useState('');
  const [method, setMethod] = useState('');
  const [exit, setExit] = useState('');
  const [result, setResult] = useState<RiskAssessmentResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyId, setHistoryId] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('assessment') ?? ''),
  );
  const stored = useQuery({
    queryKey: ['risk-assessment', prefix, historyId],
    enabled: !!historyId,
    queryFn: () => recordRead(`${prefix}/assessments/${historyId}`, riskAssessmentResponseSchema),
  });
  const commands = useRef(new Map<string, { serialized: string; id: string }>());
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const body = {
        accountId: account,
        strategyVersionId: strategy || null,
        asOf: at,
        proposal: proposed
          ? {
              instrumentVersionId: instrument,
              side,
              quantity,
              riskAmount: risk || null,
              riskCurrencyId: currency || null,
              riskMethod: method,
              entry: entry || null,
              intendedExitAt: exit || null,
            }
          : null,
      };
      const response = await recordWrite(
        `${prefix}/assessments`,
        body,
        riskAssessmentResponseSchema,
        retainedCommand(commands.current, 'assessment', body),
      );
      commands.current.delete('assessment');
      setResult(response);
      setHistoryId('');
      window.history.replaceState(
        null,
        '',
        `/risk?workspace=${encodeURIComponent(workspace.id)}&assessment=${response.id}`,
      );
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Assessment failed.');
    } finally {
      setBusy(false);
    }
  }
  const displayed = result ?? stored.data;
  return (
    <>
      <h2>Assess account and proposed trade</h2>
      <p>
        This captures a point-in-time, source-revision-pinned assessment. Missing evidence is
        unknown, never a pass. All applicable account and selected strategy policies are evaluated;
        the strictest compatible restriction therefore governs.
      </p>
      <form onSubmit={(e) => void submit(e)}>
        <fieldset disabled={busy || workspace.role === 'viewer'}>
          <div className="risk-grid">
            <Lookup
              prefix={prefix}
              collection="accounts"
              label="Assessment account"
              value={account}
              onChange={setAccount}
              required
            />
            <Lookup
              prefix={prefix}
              collection="strategy-versions"
              label="Strategy version used"
              value={strategy}
              onChange={setStrategy}
            />
            <Field
              label="Assessment instant"
              value={at}
              onChange={setAt}
              required
              help="ISO timestamp with timezone offset, at or before now."
            />
          </div>
          <label>
            <input
              type="checkbox"
              checked={proposed}
              onChange={(e) => setProposed(e.target.checked)}
            />
            Include a proposed trade
          </label>
          {proposed && (
            <div className="risk-grid">
              <Lookup
                prefix={prefix}
                collection="instruments"
                label="Proposed instrument version"
                value={instrument}
                onChange={setInstrument}
                required
              />
              <label className="risk-field">
                Proposed direction
                <select value={side} onChange={(e) => setSide(e.target.value)}>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </label>
              <Field label="Proposed quantity" value={quantity} onChange={setQuantity} required />
              <Field
                label="Planned entry price"
                value={entry}
                onChange={setEntry}
                help="Required for a validated linear exposure estimate. Unsupported nonlinear exposure stays unknown."
              />
              <Field
                label="Proposed initial risk"
                value={risk}
                onChange={setRisk}
                help="Use the sizing result or an explicit reviewed scenario amount. This does not publish an original trading plan."
              />
              <Lookup
                prefix={prefix}
                collection="currencies"
                label="Proposed risk currency"
                value={currency}
                onChange={setCurrency}
              />
              <Field label="Risk method and evidence" value={method} onChange={setMethod} />
              <Field
                label="Intended exit instant"
                value={exit}
                onChange={setExit}
                help="ISO timestamp with offset; required for a proposed overnight assessment."
              />
            </div>
          )}
          <Button type="submit">{busy ? 'Assessing…' : 'Capture risk assessment'}</Button>
        </fieldset>
      </form>
      {failure && <p role="alert">{failure}</p>}
      {stored.isError && <p role="alert">The stored assessment could not be loaded.</p>}
      {displayed && (
        <section aria-label="Risk assessment result">
          <h3>Assessment: {displayed.state}</h3>
          <p>
            Captured {formatJournalTimestamp(displayed.createdAt, workspace.timezone)} · financial
            revision {displayed.sourceRevision} · {displayed.definitionVersion}
          </p>
          <p>
            This immutable assessment is evidence for its captured context. Later activity, policies
            or observations require a new assessment.
          </p>
          {displayed.state === 'unconfigured' && (
            <p>
              No effective account or selected strategy restriction was configured. This is not a
              claim that risk is acceptable.
            </p>
          )}
          <a href={`/risk?workspace=${workspace.id}&assessment=${displayed.id}`}>
            Permanent assessment record
          </a>
          {displayed.results.map((item) => (
            <article key={`${item.policyVersionId}:${item.limit.id}`} className="risk-result">
              <h4>
                {item.limit.kind}: {item.state}
              </h4>
              <p>{item.explanation}</p>
              <p>
                Observed: {item.fact.value ?? 'Unknown'} {item.fact.unit}
                {item.fact.currencyId ? ` · currency ${item.fact.currencyId}` : ''}
              </p>
              <details>
                <summary>Policy and source evidence</summary>
                <p>Policy version {item.policyVersionId}</p>
                <pre>{JSON.stringify(item.limit, null, 2)}</pre>
                <ul>
                  {item.fact.references.map((reference, index) => (
                    <li key={`${reference}:${index}`}>{reference}</li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function Sizing({ prefix }: { prefix: string }) {
  const [values, setValues] = useState<Record<string, string>>({
    mode: 'linear',
    side: 'long',
    asOf: new Date().toISOString(),
  });
  const value = (key: string) => values[key] ?? '';
  const set = (key: string) => (next: string) =>
    setValues((previous) => ({ ...previous, [key]: next }));
  const [result, setResult] = useState<ReturnType<typeof riskSizingResponseSchema.parse> | null>(
    null,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure(null);
    setResult(null);
    try {
      const body = {
        accountId: value('accountId'),
        instrumentVersionId: value('instrumentVersionId'),
        asOf: value('asOf'),
        side: value('side'),
        mode: value('mode'),
        currencyId: value('currencyId'),
        budget: value('budget'),
        entry: value('entry') || null,
        stop: value('stop') || null,
        fixedCosts: value('fixedCosts'),
        perUnitCosts: value('perUnitCosts'),
        fxObservationId: value('fxObservationId') || null,
        maxAgeMilliseconds: numberText(value('maxAgeMilliseconds')),
        manualRisk: value('manualRisk') || null,
        manualQuantity: value('manualQuantity') || null,
        method: value('method'),
      };
      const response = await fetch(`${prefix}/sizing`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(
          'Sizing inputs were rejected. Check the exact decimals, references and conventions.',
        );
      setResult(riskSizingResponseSchema.parse(await response.json()));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Sizing failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h2>Pre-trade sizing</h2>
      <p>
        Validated ordinary linear instruments use stop distance × multiplier, explicit planning FX
        and estimated costs, rounded down to the instrument quantity increment. Complex products
        require explicit manual scenario risk. No account capital, default risk budget or minimum
        size is invented.
      </p>
      <form onSubmit={(e) => void submit(e)}>
        <fieldset disabled={busy}>
          <div className="risk-grid">
            <Lookup
              prefix={prefix}
              collection="accounts"
              label="Sizing account"
              value={value('accountId')}
              onChange={set('accountId')}
              required
            />
            <Lookup
              prefix={prefix}
              collection="instruments"
              label="Sizing instrument version"
              value={value('instrumentVersionId')}
              onChange={set('instrumentVersionId')}
              required
            />
            <Lookup
              prefix={prefix}
              collection="currencies"
              label="Sizing risk currency"
              value={value('currencyId')}
              onChange={set('currencyId')}
              required
            />
            <Field label="Planning instant" value={value('asOf')} onChange={set('asOf')} required />
            <Field
              label="Explicit risk budget"
              value={value('budget')}
              onChange={set('budget')}
              required
            />
            <label className="risk-field">
              Sizing method
              <select value={value('mode')} onChange={(e) => set('mode')(e.target.value)}>
                <option value="linear">Validated linear stop scenario</option>
                <option value="manual">Explicit manual scenario risk</option>
              </select>
            </label>
            <label className="risk-field">
              Sizing direction
              <select value={value('side')} onChange={(e) => set('side')(e.target.value)}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            <Field
              label="Estimated fixed costs in risk currency"
              value={value('fixedCosts')}
              onChange={set('fixedCosts')}
              required
              help="Enter 0 explicitly if there are no estimated fixed charges."
            />
            <Field
              label="Estimated costs per quantity unit in risk currency"
              value={value('perUnitCosts')}
              onChange={set('perUnitCosts')}
              required
            />
            <Field
              label="Maximum planning FX age in milliseconds"
              value={value('maxAgeMilliseconds')}
              onChange={set('maxAgeMilliseconds')}
              required
            />
            {value('mode') === 'linear' ? (
              <>
                <Field
                  label="Entry price"
                  value={value('entry')}
                  onChange={set('entry')}
                  required
                />
                <Field
                  label="Adverse stop price"
                  value={value('stop')}
                  onChange={set('stop')}
                  required
                />
                <Lookup
                  prefix={prefix}
                  collection="fx-observations"
                  label="Planning FX observation (if currencies differ)"
                  value={value('fxObservationId')}
                  onChange={set('fxObservationId')}
                />
              </>
            ) : (
              <>
                <Field
                  label="Manual initial risk including planned costs"
                  value={value('manualRisk')}
                  onChange={set('manualRisk')}
                  required
                />
                <Field
                  label="Manual scenario quantity"
                  value={value('manualQuantity')}
                  onChange={set('manualQuantity')}
                  required
                />
                <Field
                  label="Scenario or max-loss method and evidence"
                  value={value('method')}
                  onChange={set('method')}
                  required
                />
              </>
            )}
          </div>
          <Button type="submit">{busy ? 'Calculating…' : 'Calculate planned size'}</Button>
        </fieldset>
      </form>
      {failure && <p role="alert">{failure}</p>}
      {result && (
        <section aria-label="Sizing result">
          <h3>Sizing: {result.state}</h3>
          <p>
            Quantity: {result.quantity ?? 'Unavailable'} · planned risk:{' '}
            {result.plannedRisk ?? 'Unavailable'} · budget: {result.budget} · currency{' '}
            {result.currencyId}
          </p>
          {result.reasons.map((reason) => (
            <p key={reason}>{reason.replaceAll('_', ' ')}</p>
          ))}
          <p>{result.warning}</p>
          <details>
            <summary>Calculation evidence</summary>
            <p>
              {result.definitionVersion} · {result.mode}
            </p>
            <p>Risk per unit: {result.riskPerUnit ?? 'Manual scenario'}</p>
            <ul>
              {result.references.map((reference) => (
                <li key={reference}>{reference}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </>
  );
}

export function RiskWorkspace({ workspace }: { workspace: WorkspaceResponse }) {
  const prefix = `/api/v1/workspaces/${workspace.id}/risk`,
    client = useQueryClient();
  const [tab, setTab] = useState<'policies' | 'assess' | 'size'>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('assessment')
      ? 'assess'
      : 'policies',
  );
  const [selected, setSelected] = useState<RiskPolicyVersion | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [message, setMessage] = useState('');
  const policies = useInfiniteQuery({
    queryKey: ['risk-policies', workspace.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      recordRead(
        `${prefix}/policies${pageParam ? `?after=${pageParam}` : ''}`,
        riskPolicyListSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return (
    <section className="risk-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Planning and monitoring</span>
          <h1>Risk policies &amp; sizing</h1>
          <p>
            Risk assessments inform decisions. They never block truthful activity recording or
            rewrite original risk used by historical R.
          </p>
        </div>
      </div>
      {workspace.role === 'viewer' && (
        <p role="status">
          Your role can review policies and stored assessments and use sizing. Publishing policies
          and assessments requires editor access.
        </p>
      )}
      <nav aria-label="Risk workflows" className="risk-tabs">
        {(['policies', 'assess', 'size'] as const).map((item) => (
          <Button
            key={item}
            variant={tab === item ? 'primary' : 'secondary'}
            onClick={() => setTab(item)}
          >
            {item === 'policies'
              ? 'Policies & history'
              : item === 'assess'
                ? 'Assess risk'
                : 'Size a trade'}
          </Button>
        ))}
      </nav>
      {message && <p role="status">{message}</p>}
      <Panel>
        {tab === 'policies' ? (
          <>
            <h2>Immutable policies and versions</h2>
            {policies.isError && (
              <p role="alert">
                Risk policies could not load.{' '}
                <Button onClick={() => void policies.refetch()}>Retry policies</Button>
              </p>
            )}
            {policies.isPending && <p role="status">Loading policies…</p>}
            {policies.data?.pages
              .flatMap((page) => page.versions)
              .map((policy) => (
                <article key={policy.id} className="risk-result">
                  <h3>
                    {policy.definition.name} · v{policy.version}
                  </h3>
                  <p>
                    {policy.accountId ? 'Account' : 'Strategy'}{' '}
                    {policy.accountId ?? policy.strategyId} · effective{' '}
                    {formatJournalTimestamp(policy.effectiveAt, workspace.timezone)}
                  </p>
                  <p>{policy.reason}</p>
                  <Button
                    variant="secondary"
                    disabled={workspace.role === 'viewer'}
                    onClick={() => {
                      setSelected(policy);
                      setEditorKey((key) => key + 1);
                      setMessage('');
                    }}
                  >
                    Edit as a new version
                  </Button>
                </article>
              ))}
            {policies.hasNextPage && (
              <Button variant="quiet" onClick={() => void policies.fetchNextPage()}>
                Load more policy history
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={workspace.role === 'viewer'}
              onClick={() => {
                setSelected(null);
                setEditorKey((key) => key + 1);
              }}
            >
              Start a new policy
            </Button>
            <PolicyEditor
              key={editorKey}
              prefix={prefix}
              workspace={workspace}
              selected={selected}
              onSaved={(value) => {
                setSelected(value);
                setEditorKey((key) => key + 1);
                setMessage(
                  `Published ${value.definition.name} version ${value.version}. Earlier policy and assessment history remains available.`,
                );
                void client.invalidateQueries({ queryKey: ['risk-policies', workspace.id] });
              }}
            />
          </>
        ) : tab === 'assess' ? (
          <Assessment prefix={prefix} workspace={workspace} />
        ) : (
          <Sizing prefix={prefix} />
        )}
      </Panel>
    </section>
  );
}
