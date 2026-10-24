'use client';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  periodReviewCatalogSchema,
  periodReviewDefinitionSchema,
  periodReviewHistorySchema,
  periodReviewKindSchema,
  periodReviewListSchema,
  periodReviewSummarySchema,
  periodReviewTemplateDefinitionSchema,
  periodReviewTemplateListSchema,
  periodReviewTemplateVersionSchema,
  periodReviewVersionSchema,
  type PeriodReviewDefinition,
  type PeriodReviewTemplateVersion,
  type PeriodReviewVersion,
  type WorkspaceResponse,
} from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { ReviewSaveError, reviewRead, reviewWrite } from './review-api';
import { retainedCommand } from '../record/record-api';
import { formatJournalTimestamp } from '../journal/journal-time';
import { useJournalNavigationGuard } from '../journal/journal-navigation';
import {
  dashboardDatePreset,
  localDayBoundary,
  nextDay,
  todayInZone,
} from '../dashboard/dashboard-time';
import './reviews.css';
const list = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
function Field({
  label,
  value,
  onChange,
  multiline = false,
  help = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  help?: string;
}) {
  const id = useId();
  return (
    <div className="review-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          aria-describedby={help ? `${id}-help` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          value={value}
          aria-describedby={help ? `${id}-help` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {help && <small id={`${id}-help`}>{help}</small>}
    </div>
  );
}
function Links({
  prefix,
  collection,
  label,
  values,
  onChange,
}: {
  prefix: string;
  collection: 'trades' | 'strategy-versions';
  label: string;
  values: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['review-catalog', prefix, collection, search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      reviewRead(
        `${prefix}/catalog?${new URLSearchParams({ collection, search, ...(pageParam ? { after: pageParam } : {}) })}`,
        periodReviewCatalogSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const options = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div>
      <Field label={`Search ${label.toLowerCase()}`} value={search} onChange={setSearch} />
      <label className="review-field">
        {label}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose a source record…</option>
          {options.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="secondary"
        disabled={!selected || values.includes(selected) || values.length >= 100}
        onClick={() => {
          onChange([...values, selected]);
          setSelected('');
        }}
      >
        Link selected {collection === 'trades' ? 'trade' : 'strategy version'}
      </Button>
      {query.hasNextPage && (
        <Button variant="quiet" onClick={() => void query.fetchNextPage()}>
          More source records
        </Button>
      )}
      {query.isError && <p role="alert">Source references could not load.</p>}
      <ul>
        {values.map((value) => (
          <li key={value}>
            {options.find((row) => row.id === value)?.label ?? value}
            <Button variant="quiet" onClick={() => onChange(values.filter((id) => id !== value))}>
              Unlink {value}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
function blank(workspace: WorkspaceResponse): PeriodReviewDefinition {
  const today = todayInZone(workspace.timezone);
  return {
    title: '',
    kind: 'daily',
    from: localDayBoundary(today, workspace.timezone),
    to: localDayBoundary(nextDay(today), workspace.timezone),
    timezone: workspace.timezone,
    status: 'draft',
    notes: '',
    goals: [],
    recurringMistakes: [],
    emotions: [],
    improvementActions: [],
    templateVersionId: null,
    answers: [],
    tradeIds: [],
    strategyVersionIds: [],
  };
}

function EntryEditor({
  prefix,
  workspace,
  initial,
  templates,
  onSaved,
  onDirtyChange,
}: {
  prefix: string;
  workspace: WorkspaceResponse;
  initial: PeriodReviewVersion | null;
  templates: PeriodReviewTemplateVersion[];
  onSaved: (version: PeriodReviewVersion) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [definition, setDefinition] = useState(initial?.definition ?? blank(workspace));
  const [saved, setSaved] = useState(initial);
  const [template, setTemplate] = useState(initial?.template ?? null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState(
    initial
      ? `Loaded version ${initial.version}.`
      : 'Draft autosaves after a valid title and period are entered.',
  );
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{
    body: { expectedVersion: number; reason: string; definition: PeriodReviewDefinition };
    entryId: string | null;
  } | null>(null);
  const current = useRef(definition),
    savedRef = useRef(saved),
    inFlight = useRef(false),
    commands = useRef(new Map<string, { serialized: string; id: string }>());
  const [lastSaved, setLastSaved] = useState(
    JSON.stringify(initial?.definition ?? blank(workspace)),
  );
  useEffect(() => {
    current.current = definition;
    savedRef.current = saved;
  }, [definition, saved]);
  const [rawLists, setRawLists] = useState({
    goals: definition.goals.join('\n'),
    recurringMistakes: definition.recurringMistakes.join('\n'),
    emotions: definition.emotions.join('\n'),
    improvementActions: definition.improvementActions.map((a) => a.text).join('\n'),
  });
  const serialized = JSON.stringify(definition),
    dirty = serialized !== lastSaved;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useJournalNavigationGuard(
    () => dirty || inFlight.current,
    () => setNotice('Save this draft, or explicitly reload/discard it before leaving.'),
  );
  const save = useCallback(
    async (finalize = false) => {
      if (inFlight.current || conflict || workspace.role === 'viewer') return;
      const snapshot = pending.current?.body.definition ?? {
        ...current.current,
        status: finalize ? ('final' as const) : current.current.status,
      };
      const parsed = periodReviewDefinitionSchema.safeParse(snapshot);
      if (!parsed.success) {
        setFailure(parsed.error.issues.map((issue) => issue.message).join(' '));
        return;
      }
      inFlight.current = true;
      setSaving(true);
      setFailure(null);
      try {
        const previous = savedRef.current;
        const body = pending.current?.body ?? {
          expectedVersion: previous?.version ?? 0,
          reason: finalize ? 'Explicit period review finalization' : 'Saved review draft',
          definition: parsed.data,
        };
        pending.current ??= { body, entryId: previous?.entryId ?? null };
        const result = await reviewWrite(
          `${prefix}/entries${pending.current.entryId ? `/${pending.current.entryId}` : ''}`,
          body,
          periodReviewVersionSchema,
          retainedCommand(commands.current, 'save', body),
        );
        commands.current.delete('save');
        pending.current = null;
        setUncertain(false);
        setLastSaved(JSON.stringify(result.definition));
        setSaved(result);
        savedRef.current = result;
        setTemplate(result.template);
        if (JSON.stringify(current.current) === JSON.stringify(snapshot) || finalize) {
          setDefinition(result.definition);
          current.current = result.definition;
        }
        setNotice(
          `Saved version ${result.version}${result.definition.status === 'final' ? ' · finalized' : ' · draft'}.`,
        );
        onSaved(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The draft could not save.';
        setFailure(message);
        if (error instanceof ReviewSaveError && error.outcome === 'unknown') setUncertain(true);
        else pending.current = null;
        if (message.includes('changed') || message.includes('Reload')) setConflict(true);
      } finally {
        inFlight.current = false;
        setSaving(false);
      }
    },
    [conflict, onSaved, prefix, workspace.role],
  );
  useEffect(() => {
    if (
      !dirty ||
      definition.status !== 'draft' ||
      conflict ||
      uncertain ||
      failure ||
      workspace.role === 'viewer' ||
      !periodReviewDefinitionSchema.safeParse(definition).success
    )
      return;
    const timer = setTimeout(() => void save(), 1000);
    return () => clearTimeout(timer);
  }, [serialized, dirty, definition, conflict, uncertain, failure, save, saving, workspace.role]);
  const update = <K extends keyof PeriodReviewDefinition>(
    key: K,
    value: PeriodReviewDefinition[K],
  ) => {
    setFailure(null);
    setDefinition((previous) => ({ ...previous, [key]: value }));
  };
  async function reload() {
    if (savedRef.current) {
      try {
        const latest = await reviewRead(
          `${prefix}/entries/${savedRef.current.entryId}`,
          periodReviewVersionSchema,
        );
        setDefinition(latest.definition);
        setRawLists({
          goals: latest.definition.goals.join('\n'),
          recurringMistakes: latest.definition.recurringMistakes.join('\n'),
          emotions: latest.definition.emotions.join('\n'),
          improvementActions: latest.definition.improvementActions.map((a) => a.text).join('\n'),
        });
        current.current = latest.definition;
        setSaved(latest);
        setTemplate(latest.template);
        setLastSaved(JSON.stringify(latest.definition));
        setConflict(false);
        setFailure(null);
        setNotice(`Reloaded saved version ${latest.version}; local changes discarded.`);
      } catch (error) {
        setFailure(error instanceof Error ? error.message : 'Reload failed.');
      }
    } else {
      const empty = blank(workspace);
      setDefinition(empty);
      setRawLists({ goals: '', recurringMistakes: '', emotions: '', improvementActions: '' });
      current.current = empty;
      setLastSaved(JSON.stringify(empty));
      setFailure(null);
      setNotice('Unsaved draft discarded.');
    }
  }
  function period(kind: PeriodReviewDefinition['kind']) {
    try {
      const today = todayInZone(definition.timezone);
      let start = today,
        end = nextDay(today);
      if (kind === 'weekly') {
        const dates = dashboardDatePreset('this-week', definition.timezone);
        start = dates.from;
        const endDate = new Date(`${start}T12:00:00Z`);
        endDate.setUTCDate(endDate.getUTCDate() + 7);
        end = endDate.toISOString().slice(0, 10);
      } else if (kind === 'monthly') {
        start = `${today.slice(0, 7)}-01`;
        const date = new Date(`${start}T12:00:00Z`);
        date.setUTCMonth(date.getUTCMonth() + 1);
        end = date.toISOString().slice(0, 10);
      }
      setDefinition((previous) => ({
        ...previous,
        kind,
        from: localDayBoundary(start, previous.timezone),
        to: localDayBoundary(end, previous.timezone),
      }));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Calendar boundary unavailable.');
    }
  }
  const summary = useQuery({
    queryKey: ['period-review-summary', prefix, saved?.entryId, saved?.id],
    enabled: !!saved,
    queryFn: () =>
      reviewRead(`${prefix}/entries/${saved!.entryId}/summary`, periodReviewSummarySchema),
  });
  const history = useInfiniteQuery({
    queryKey: ['period-review-history', prefix, saved?.entryId, saved?.version],
    enabled: !!saved,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      reviewRead(
        `${prefix}/entries/${saved!.entryId}/history${pageParam ? `?after=${pageParam}` : ''}`,
        periodReviewHistorySchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const final = definition.status === 'final';
  return (
    <section aria-label="Standalone period review editor">
      <h2>{saved ? `Period review · version ${saved.version}` : 'New period review'}</h2>
      <p role="status">{saving ? 'Saving draft…' : notice}</p>
      {failure && <p role="alert">{failure}</p>}
      {uncertain && (
        <>
          <p>
            The previous save outcome is unknown. Editing is paused until the retained command is
            retried.
          </p>
          <Button disabled={saving} onClick={() => void save()}>
            Retry retained review save
          </Button>
        </>
      )}
      {conflict && (
        <p>
          Keep or copy your current text before discarding local changes and loading the saved
          version. Nothing has been overwritten.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset
          disabled={
            workspace.role === 'viewer' || final || conflict || uncertain || (saving && !saved)
          }
        >
          <div className="review-grid">
            <Field
              label="Review title"
              value={definition.title}
              onChange={(value) => update('title', value)}
            />
            <label className="review-field">
              Review kind
              <select
                value={definition.kind}
                onChange={(e) => period(e.target.value as PeriodReviewDefinition['kind'])}
              >
                {periodReviewKindSchema.options.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <Field
              label="Period starts at"
              value={definition.from}
              onChange={(value) => update('from', value)}
              help="ISO instant with offset; the period includes its start and excludes its end."
            />
            <Field
              label="Period ends at"
              value={definition.to}
              onChange={(value) => update('to', value)}
            />
            <Field
              label="Review timezone"
              value={definition.timezone}
              onChange={(value) => update('timezone', value)}
              help="An IANA timezone. Existing saved boundaries do not move when display preferences change."
            />
            <label className="review-field">
              Reusable template version
              <select
                value={definition.templateVersionId ?? ''}
                onChange={(e) => {
                  const selected = templates.find((item) => item.id === e.target.value) ?? null;
                  setTemplate(selected);
                  setDefinition((previous) => ({
                    ...previous,
                    templateVersionId: selected?.id ?? null,
                    answers: [],
                  }));
                }}
              >
                <option value="">No template</option>
                {template && !templates.some((item) => item.id === template.id) && (
                  <option value={template.id}>
                    {template.definition.name} · pinned v{template.version}
                  </option>
                )}
                {templates
                  .filter((item) => item.definition.status === 'active')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.definition.name} · v{item.version}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <Field
            label="Notes and session preparation/review"
            value={definition.notes}
            onChange={(value) => update('notes', value)}
            multiline
          />
          <div className="review-grid">
            <Field
              label="Goals"
              value={rawLists.goals}
              onChange={(value) => {
                setRawLists({ ...rawLists, goals: value });
                update('goals', list(value));
              }}
              multiline
              help="One goal per line."
            />
            <Field
              label="Recurring mistakes"
              value={rawLists.recurringMistakes}
              onChange={(value) => {
                setRawLists({ ...rawLists, recurringMistakes: value });
                update('recurringMistakes', list(value));
              }}
              multiline
            />
            <Field
              label="Emotions"
              value={rawLists.emotions}
              onChange={(value) => {
                setRawLists({ ...rawLists, emotions: value });
                update('emotions', list(value));
              }}
              multiline
              help="Your own labels; no fixed emotional interpretation is assigned."
            />
            <Field
              label="Improvement actions"
              value={rawLists.improvementActions}
              onChange={(value) => {
                setRawLists({ ...rawLists, improvementActions: value });
                update(
                  'improvementActions',
                  list(value).map((text, index) => ({
                    id: definition.improvementActions[index]?.id ?? crypto.randomUUID(),
                    text,
                    status: definition.improvementActions[index]?.status ?? 'open',
                  })),
                );
              }}
              multiline
            />
          </div>
          {definition.improvementActions.map((action) => (
            <label key={action.id} className="review-check">
              <input
                type="checkbox"
                checked={action.status === 'done'}
                onChange={(e) =>
                  update(
                    'improvementActions',
                    definition.improvementActions.map((item) =>
                      item.id === action.id
                        ? { ...item, status: e.target.checked ? 'done' : 'open' }
                        : item,
                    ),
                  )
                }
              />
              Completed: {action.text}
            </label>
          ))}
          {template && (
            <section>
              <h3>
                {template.definition.name} · immutable v{template.version}
              </h3>
              <p>{template.definition.instructions}</p>
              {template.definition.fields.map((field) => {
                const answer = definition.answers.find((item) => item.fieldId === field.id);
                const setAnswer = (value: string | boolean) =>
                  update('answers', [
                    ...definition.answers.filter((item) => item.fieldId !== field.id),
                    { fieldId: field.id, value },
                  ]);
                return field.type === 'boolean' ? (
                  <label key={field.id} className="review-field">
                    {field.label}
                    {field.required ? ' (required)' : ''}
                    <select
                      value={typeof answer?.value === 'boolean' ? String(answer.value) : ''}
                      onChange={(e) =>
                        e.target.value === ''
                          ? update(
                              'answers',
                              definition.answers.filter((item) => item.fieldId !== field.id),
                            )
                          : setAnswer(e.target.value === 'true')
                      }
                    >
                      <option value="">Unanswered</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                    <small>{field.help}</small>
                  </label>
                ) : (
                  <Field
                    key={field.id}
                    label={`${field.label}${field.required ? ' (required)' : ''}`}
                    value={typeof answer?.value === 'string' ? answer.value : ''}
                    onChange={setAnswer}
                    multiline={field.type === 'text'}
                    help={`${field.type === 'decimal' ? 'Enter exact decimal text. ' : ''}${field.help}`}
                  />
                );
              })}
            </section>
          )}
          <details>
            <summary>Link supporting trades and strategy versions</summary>
            <Links
              prefix={prefix}
              collection="trades"
              label="Supporting trade"
              values={definition.tradeIds}
              onChange={(value) => update('tradeIds', value)}
            />
            <Links
              prefix={prefix}
              collection="strategy-versions"
              label="Supporting strategy version"
              values={definition.strategyVersionIds}
              onChange={(value) => update('strategyVersionIds', value)}
            />
          </details>
          <Button type="submit" disabled={saving}>
            Save draft now
          </Button>
          <Button variant="secondary" disabled={saving} onClick={() => void save(true)}>
            Finalize review
          </Button>
        </fieldset>
      </form>
      {final && workspace.role !== 'viewer' && (
        <Button variant="secondary" onClick={() => update('status', 'draft')}>
          Reopen as a new draft version
        </Button>
      )}
      <Button variant="quiet" disabled={saving || uncertain} onClick={() => void reload()}>
        Discard local changes and reload saved review
      </Button>
      {saved && (
        <>
          <a href={`/reviews?workspace=${workspace.id}&entry=${saved.entryId}`}>
            Permanent period review
          </a>
          <section aria-label="Deterministic period summary">
            <h3>Recorded process summary</h3>
            {summary.data ? (
              <>
                <p>
                  {summary.data.linkedTradeCount} linked trades · {summary.data.reviewedTradeCount}{' '}
                  with recorded post-trade reviews · {summary.data.goalCount} goals ·{' '}
                  {summary.data.openActionCount} open improvement actions
                </p>
                <ul>
                  {summary.data.recurringMistakes.map((item) => (
                    <li key={item.label}>
                      {item.label}: {item.count} linked trades
                    </li>
                  ))}
                </ul>
                <p>{summary.data.explanation}</p>
                <small>
                  Financial revision {summary.data.sourceRevision}; generated{' '}
                  {formatJournalTimestamp(summary.data.generatedAt, workspace.timezone)}.
                </small>
              </>
            ) : (
              <p>
                {summary.isError
                  ? 'Summary could not load; review data remains saved.'
                  : 'Loading source summary…'}
              </p>
            )}
          </section>
          <details>
            <summary>Immutable review history</summary>
            {history.data?.pages
              .flatMap((page) => page.versions)
              .map((version) => (
                <article key={version.id}>
                  <h4>
                    Version {version.version} · {version.definition.status}
                  </h4>
                  <p>
                    {formatJournalTimestamp(version.createdAt, workspace.timezone)} ·{' '}
                    {version.reason}
                  </p>
                  <details>
                    <summary>Read this saved snapshot</summary>
                    <p>{version.definition.notes}</p>
                    <p>Goals: {version.definition.goals.join('; ') || 'None recorded'}</p>
                    <p>
                      Template:{' '}
                      {version.template
                        ? `${version.template.definition.name} v${version.template.version}`
                        : 'None'}
                    </p>
                  </details>
                </article>
              ))}
            {history.hasNextPage && (
              <Button variant="quiet" onClick={() => void history.fetchNextPage()}>
                More saved versions
              </Button>
            )}
          </details>
        </>
      )}
    </section>
  );
}

function TemplateEditor({
  prefix,
  workspace,
  selected,
  onSaved,
  onDirtyChange,
}: {
  prefix: string;
  workspace: WorkspaceResponse;
  selected: PeriodReviewTemplateVersion | null;
  onSaved: (version: PeriodReviewTemplateVersion) => void | Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [definition, setDefinition] = useState(
    selected?.definition ?? {
      name: '',
      instructions: '',
      status: 'active' as const,
      fields: [] as PeriodReviewTemplateVersion['definition']['fields'],
    },
  );
  const [reason, setReason] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{
    expectedVersion: number;
    reason: string;
    definition: PeriodReviewTemplateVersion['definition'];
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const commands = useRef(new Map<string, { serialized: string; id: string }>());
  const baseline = JSON.stringify({
    definition: selected?.definition ?? {
      name: '',
      instructions: '',
      status: 'active',
      fields: [],
    },
    reason: '',
  });
  const dirty = JSON.stringify({ definition, reason }) !== baseline;
  useEffect(() => onDirtyChange(dirty || uncertain), [dirty, uncertain, onDirtyChange]);
  useJournalNavigationGuard(
    () => dirty || busy || uncertain,
    () => setFailure('Publish or explicitly discard this template draft before leaving.'),
  );
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (busy || workspace.role === 'viewer') return;
    setFailure(null);
    setBusy(true);
    try {
      const body = pending.current ?? {
        expectedVersion: selected?.version ?? 0,
        reason,
        definition: periodReviewTemplateDefinitionSchema.parse(definition),
      };
      pending.current = body;
      const response = await reviewWrite(
        `${prefix}/templates${selected ? `/${selected.templateId}` : ''}`,
        body,
        periodReviewTemplateVersionSchema,
        retainedCommand(commands.current, 'template', body),
      );
      commands.current.delete('template');
      pending.current = null;
      setUncertain(false);
      await onSaved(response);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Template publication failed.');
      if (error instanceof ReviewSaveError && error.outcome === 'unknown') setUncertain(true);
      else pending.current = null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)}>
      <fieldset disabled={busy || uncertain || workspace.role === 'viewer'}>
        <legend>
          {selected
            ? `New template version after v${selected.version}`
            : 'Create a reusable review template'}
        </legend>
        <Field
          label="Template name"
          value={definition.name}
          onChange={(name) => setDefinition({ ...definition, name })}
        />
        <Field
          label="Template instructions"
          value={definition.instructions}
          onChange={(instructions) => setDefinition({ ...definition, instructions })}
          multiline
        />
        <label className="review-field">
          Template status
          <select
            value={definition.status}
            onChange={(e) =>
              setDefinition({ ...definition, status: e.target.value as 'active' | 'archived' })
            }
          >
            <option value="active">Active</option>
            <option value="archived">Archived for new selection</option>
          </select>
        </label>
        {definition.fields.map((field, index) => (
          <fieldset key={field.id}>
            <legend>Configurable review field {index + 1}</legend>
            <Field
              label={`Field ${index + 1} label`}
              value={field.label}
              onChange={(label) =>
                setDefinition({
                  ...definition,
                  fields: definition.fields.map((item) =>
                    item.id === field.id ? { ...item, label } : item,
                  ),
                })
              }
            />
            <label className="review-field">
              Field {index + 1} type
              <select
                value={field.type}
                onChange={(e) =>
                  setDefinition({
                    ...definition,
                    fields: definition.fields.map((item) =>
                      item.id === field.id
                        ? { ...item, type: e.target.value as typeof field.type }
                        : item,
                    ),
                  })
                }
              >
                <option value="text">Text</option>
                <option value="boolean">Yes / No</option>
                <option value="decimal">Exact decimal</option>
              </select>
            </label>
            <Field
              label={`Field ${index + 1} help`}
              value={field.help}
              onChange={(help) =>
                setDefinition({
                  ...definition,
                  fields: definition.fields.map((item) =>
                    item.id === field.id ? { ...item, help } : item,
                  ),
                })
              }
            />
            <label>
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) =>
                  setDefinition({
                    ...definition,
                    fields: definition.fields.map((item) =>
                      item.id === field.id ? { ...item, required: e.target.checked } : item,
                    ),
                  })
                }
              />
              Required before finalization
            </label>
            <Button
              variant="quiet"
              onClick={() =>
                setDefinition({
                  ...definition,
                  fields: definition.fields.filter((item) => item.id !== field.id),
                })
              }
            >
              Remove field {index + 1}
            </Button>
          </fieldset>
        ))}
        <Button
          variant="secondary"
          disabled={definition.fields.length >= 50}
          onClick={() =>
            setDefinition({
              ...definition,
              fields: [
                ...definition.fields,
                { id: crypto.randomUUID(), label: '', type: 'text', required: false, help: '' },
              ],
            })
          }
        >
          Add configurable review field
        </Button>
        <Field label="Template change reason" value={reason} onChange={setReason} />
        <p>
          Publishing appends a complete immutable version. Existing reviews keep their selected
          template and answer definitions.
        </p>
        <Button type="submit">{busy ? 'Publishing…' : 'Publish review template'}</Button>
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
      {uncertain ? (
        <>
          <p>
            The previous template publication outcome is unknown. Retry the retained command before
            editing.
          </p>
          <Button disabled={busy} onClick={() => void submit()}>
            Retry retained template publication
          </Button>
        </>
      ) : (
        <Button
          variant="quiet"
          disabled={busy}
          onClick={() => {
            setDefinition(
              selected?.definition ?? { name: '', instructions: '', status: 'active', fields: [] },
            );
            setReason('');
            setFailure(null);
          }}
        >
          Discard unpublished template changes
        </Button>
      )}
    </form>
  );
}

export function ReviewWorkspace({
  workspace,
  initialEntryId = null,
}: {
  workspace: WorkspaceResponse;
  initialEntryId?: string | null;
}) {
  const prefix = `/api/v1/workspaces/${workspace.id}/reviews`,
    client = useQueryClient();
  const [tab, setTab] = useState<'entries' | 'templates'>('entries');
  const [selectedId, setSelectedId] = useState(initialEntryId);
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const [templateEdit, setTemplateEdit] = useState<PeriodReviewTemplateVersion | null>(null);
  const templates = useInfiniteQuery({
    queryKey: ['period-review-templates', workspace.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      reviewRead(
        `${prefix}/templates${pageParam ? `?after=${pageParam}` : ''}`,
        periodReviewTemplateListSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const entries = useInfiniteQuery({
    queryKey: ['period-reviews', workspace.id, kind, search],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      reviewRead(
        `${prefix}/entries?${new URLSearchParams({ ...(pageParam ? { after: pageParam } : {}), ...(kind ? { kind } : {}), search })}`,
        periodReviewListSchema,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const detail = useQuery({
    queryKey: ['period-review-detail', workspace.id, selectedId],
    enabled: !!selectedId,
    queryFn: () => reviewRead(`${prefix}/entries/${selectedId}`, periodReviewVersionSchema),
  });
  const changed = useCallback((value: boolean) => setDirty(value), []);
  const saved = useCallback(
    (version: PeriodReviewVersion) => {
      client.setQueryData(['period-review-detail', workspace.id, version.entryId], version);
      void client.invalidateQueries({ queryKey: ['period-reviews', workspace.id] });
      window.history.replaceState(
        null,
        '',
        `/reviews?workspace=${workspace.id}&entry=${version.entryId}`,
      );
    },
    [client, workspace.id],
  );
  function navigate(action: () => void) {
    if (dirty) {
      setNotice('Save or discard the current review before changing this workspace view.');
      return;
    }
    setNotice('');
    action();
  }
  return (
    <section className="review-workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Notes and deliberate review</span>
          <h1>Journal &amp; period reviews</h1>
          <p>
            Prepare a session, reflect daily, or retain a weekly/monthly review without creating a
            fictitious trade.
          </p>
        </div>
      </div>
      <nav aria-label="Review workflows">
        <Button onClick={() => navigate(() => setTab('entries'))}>Period reviews</Button>
        <Button variant="secondary" onClick={() => navigate(() => setTab('templates'))}>
          Reusable review templates
        </Button>
      </nav>
      {notice && <p role="status">{notice}</p>}
      <Panel>
        {tab === 'entries' ? (
          <>
            <div className="review-grid">
              <Field label="Search period review titles" value={search} onChange={setSearch} />
              <label className="review-field">
                Filter review kind
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">All kinds</option>
                  {periodReviewKindSchema.options.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                navigate(() => {
                  setSelectedId(null);
                  setEditorKey((key) => key + 1);
                })
              }
            >
              Start a standalone review
            </Button>
            {entries.isError && (
              <p role="alert">
                Review list could not load.{' '}
                <Button onClick={() => void entries.refetch()}>Retry review list</Button>
              </p>
            )}
            <div className="review-list">
              {entries.data?.pages
                .flatMap((page) => page.entries)
                .map((entry) => (
                  <Button
                    key={entry.entryId}
                    variant="quiet"
                    onClick={() =>
                      navigate(() => {
                        setSelectedId(entry.entryId);
                        setEditorKey((key) => key + 1);
                      })
                    }
                  >
                    {entry.definition.title} · {entry.definition.kind} · {entry.definition.status}
                  </Button>
                ))}
            </div>
            {entries.hasNextPage && (
              <Button variant="quiet" onClick={() => void entries.fetchNextPage()}>
                More period reviews
              </Button>
            )}
            {detail.isError && selectedId && <p role="alert">Selected review could not load.</p>}
            {!selectedId || detail.data ? (
              <EntryEditor
                key={`${selectedId ?? 'new'}:${editorKey}`}
                prefix={prefix}
                workspace={workspace}
                initial={selectedId ? detail.data! : null}
                templates={templates.data?.pages.flatMap((page) => page.templates) ?? []}
                onSaved={saved}
                onDirtyChange={changed}
              />
            ) : (
              <p role="status">Loading selected review…</p>
            )}
            {templates.hasNextPage && (
              <Button variant="quiet" onClick={() => void templates.fetchNextPage()}>
                Load more reusable templates
              </Button>
            )}
          </>
        ) : (
          <>
            <h2>Reusable typed templates</h2>
            <Button
              variant="secondary"
              onClick={() =>
                navigate(() => {
                  setTemplateEdit(null);
                  setEditorKey((key) => key + 1);
                })
              }
            >
              Start a new template
            </Button>
            {templates.data?.pages
              .flatMap((page) => page.templates)
              .map((template) => (
                <article key={template.id}>
                  <h3>
                    {template.definition.name} · v{template.version} · {template.definition.status}
                  </h3>
                  <Button
                    variant="quiet"
                    onClick={() =>
                      navigate(() => {
                        setTemplateEdit(template);
                        setEditorKey((key) => key + 1);
                      })
                    }
                  >
                    Edit template as new version
                  </Button>
                </article>
              ))}
            {templates.hasNextPage && (
              <Button variant="quiet" onClick={() => void templates.fetchNextPage()}>
                More templates
              </Button>
            )}
            <TemplateEditor
              key={editorKey}
              prefix={prefix}
              workspace={workspace}
              selected={templateEdit}
              onDirtyChange={changed}
              onSaved={async (value) => {
                const key = ['period-review-templates', workspace.id];
                await client.cancelQueries({ queryKey: key });
                client.setQueryData<
                  InfiniteData<ReturnType<typeof periodReviewTemplateListSchema.parse>>
                >(key, (previous) => ({
                  pages: previous?.pages.length
                    ? previous.pages.map((page, index) => ({
                        ...page,
                        templates: [
                          ...page.templates.filter((item) => item.templateId !== value.templateId),
                          ...(index === 0 ? [value] : []),
                        ],
                      }))
                    : [{ templates: [value], nextCursor: null }],
                  pageParams: previous?.pageParams ?? [null],
                }));
                setTemplateEdit(value);
                setEditorKey((key) => key + 1);
                setNotice(`Published ${value.definition.name} template v${value.version}.`);
              }}
            />
          </>
        )}
      </Panel>
    </section>
  );
}
