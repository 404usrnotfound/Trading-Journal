'use client';

import {
  currencyResponseSchema,
  journalDetailResponseSchema,
  journalDocumentSchema,
  journalEntryResponseSchema,
  journalPlanVersionResponseSchema,
  journalRiskAdditionResponseSchema,
  journalSaveSchema,
  type JournalDetailResponse,
  type JournalDocument,
  type JournalEntryResponse,
  type JournalPlanDefinition,
  type JournalReviewDefinition,
  type StrategyVersionResponse,
  type StrategyResponse,
} from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { useQuery } from '@tanstack/react-query';
import { strategyVersionListResponseSchema } from '@journal/contracts';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { JournalApiError, journalErrorMessage, journalRead, journalWrite } from './journal-api';
import { JournalAttachments } from './journal-attachments';
import { ConfirmDialog } from '../ux/confirm-dialog';
import { useJournalNavigationGuard } from './journal-navigation';
import { journalValidationMessage } from './journal-validation';

function labels(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]/u)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}
function serializedDocument(value: JournalDocument): string {
  const parsed = journalDocumentSchema.safeParse(value);
  return JSON.stringify(parsed.success ? parsed.data : value);
}

export function JournalField({
  label,
  value,
  onChange,
  disabled = false,
  multiline = false,
  help,
  decimal = false,
  error,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  help?: string;
  decimal?: boolean;
  error?: string | undefined;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className={`journal-field${multiline ? ' journal-field-wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          maxLength={20_000}
          aria-describedby={
            [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
            undefined
          }
          aria-invalid={error ? true : undefined}
          required={required}
        />
      ) : (
        <input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          inputMode={decimal ? 'decimal' : undefined}
          maxLength={decimal ? 512 : undefined}
          aria-describedby={
            [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
            undefined
          }
          aria-invalid={error ? true : undefined}
          required={required}
        />
      )}{' '}
      {help && <small id={`${id}-help`}>{help}</small>}
      {error && (
        <small className="form-error" id={`${id}-error`}>
          {error}
        </small>
      )}
    </div>
  );
}

export function JournalEditor({
  workspaceId,
  detail,
  currencies,
  editable,
  onSaved,
  onDirtyChange,
  historyDocument,
  strategies,
}: {
  workspaceId: string;
  detail: JournalDetailResponse;
  currencies: Array<ReturnType<typeof currencyResponseSchema.parse>>;
  editable: boolean;
  onSaved: () => Promise<void>;
  onDirtyChange: (value: boolean) => void;
  historyDocument?: JournalDocument;
  strategies: StrategyResponse[];
}) {
  const prefix = `/api/v1/workspaces/${workspaceId}/journals/${detail.trade.id}`;
  const canEdit = editable && historyDocument === undefined;
  const [document, setDocument] = useState<JournalDocument>(
    () => historyDocument ?? detail.journal.document,
  );
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>(
    'saved',
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [listInputs, setListInputs] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [latest, setLatest] = useState<JournalEntryResponse | null>(null);
  const [confirmation, setConfirmation] = useState<'publish' | 'replace' | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [supplement, setSupplement] = useState({
    amount: '',
    currencyId: currencies[0]?.id ?? '',
    method: '',
    methodNotes: '',
    reason: '',
  });
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyVersionResponse | null>(
    detail.strategy,
  );
  const documentStrategy = [
    selectedStrategy,
    detail.strategy,
    ...strategies.map((strategy) => strategy.currentVersion),
  ].find((version) => version?.id === document.plan.strategyVersionId);
  const checklist = documentStrategy?.definition.checklist ?? [];
  const recordedRules = canEdit
    ? []
    : document.review.ruleAssessments
        .filter((assessment) => !checklist.some((item) => item.id === assessment.checklistItemId))
        .map((assessment) => ({
          id: assessment.checklistItemId,
          label: `Recorded rule ${assessment.checklistItemId}`,
          required: false,
        }));
  const displayedChecklist = checklist.concat(recordedRules);
  const [strategyId, setStrategyId] = useState('');
  const strategyVersions = useQuery({
    queryKey: ['journal-strategy-versions', workspaceId, strategyId],
    enabled: canEdit && !!strategyId,
    queryFn: () =>
      journalRead(
        `/api/v1/workspaces/${workspaceId}/strategies/${strategyId}/versions?limit=100`,
        strategyVersionListResponseSchema,
      ),
  });
  const current = useRef(document);
  const revision = useRef(detail.journal.revision);
  const saved = useRef(serializedDocument(document));
  const saving = useRef(false);
  const uploadBusy = useRef(false);
  const blocked = useRef(false);
  const command = useRef<{
    id: string;
    body: { expectedRevision: number; document: JournalDocument };
  } | null>(null);
  const actionCommand = useRef<{ serialized: string; id: string } | null>(null);
  const id = useId();

  const save = useCallback(async (): Promise<boolean> => {
    if (!canEdit || uploadBusy.current || saving.current || blocked.current) return false;
    const parsed = journalSaveSchema.safeParse({
      expectedRevision: revision.current,
      document: current.current,
    });
    if (!parsed.success) {
      setIssues(
        parsed.error.issues.map((issue) => journalValidationMessage(issue.path, issue.message)),
      );
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      );
      return false;
    }
    setIssues([]);
    setFieldErrors({});
    if (JSON.stringify(parsed.data.document) === saved.current && !command.current) {
      setSaveState('saved');
      onDirtyChange(uploadBusy.current);
      return true;
    }
    if (!command.current) command.current = { id: crypto.randomUUID(), body: parsed.data };
    saving.current = true;
    setSaveState('saving');
    setFailure(null);
    try {
      const result = await journalWrite(
        prefix,
        'PUT',
        command.current.body,
        journalEntryResponseSchema,
        command.current.id,
      );
      revision.current = result.revision;
      saved.current = JSON.stringify(result.document);
      command.current = null;
      await onSaved();
      const dirty = serializedDocument(current.current) !== saved.current;
      if (!dirty) {
        current.current = result.document;
        setDocument(result.document);
      }
      setSaveState(dirty ? 'dirty' : 'saved');
      onDirtyChange(dirty || uploadBusy.current);
      return !dirty;
    } catch (error) {
      blocked.current = true;
      setFailure(journalErrorMessage(error));
      setSaveState(error instanceof JournalApiError && error.status === 409 ? 'conflict' : 'error');
      return false;
    } finally {
      saving.current = false;
    }
  }, [canEdit, prefix, onSaved, onDirtyChange]);

  useEffect(() => {
    if (!canEdit || uploading) return;
    const timer = setTimeout(() => {
      void save();
    }, 800);
    return () => clearTimeout(timer);
  }, [document, canEdit, uploading, save, saveState]);
  useJournalNavigationGuard(
    () =>
      canEdit &&
      (serializedDocument(current.current) !== saved.current ||
        saving.current ||
        uploadBusy.current),
    () =>
      setFailure(
        'Save your journal draft before leaving this page. Your edits remain in the form.',
      ),
  );
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && canEdit) {
        event.preventDefault();
        if (!busy && !uploading && !blocked.current) void save();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [canEdit, busy, uploading, save]);

  function change(next: JournalDocument) {
    current.current = next;
    setDocument(next);
    setMessage(null);
    const dirty = serializedDocument(next) !== saved.current;
    if (!blocked.current) setSaveState(saving.current ? 'saving' : dirty ? 'dirty' : 'saved');
    onDirtyChange(dirty || uploadBusy.current);
  }
  function uploadState(value: boolean) {
    uploadBusy.current = value;
    setUploading(value);
    onDirtyChange(value || serializedDocument(current.current) !== saved.current);
  }
  function plan<Key extends keyof JournalPlanDefinition>(
    key: Key,
    value: JournalPlanDefinition[Key],
  ) {
    change({ ...current.current, plan: { ...current.current.plan, [key]: value } });
  }
  function review<Key extends keyof JournalReviewDefinition>(
    key: Key,
    value: JournalReviewDefinition[Key],
  ) {
    change({ ...current.current, review: { ...current.current.review, [key]: value } });
  }
  function updateAssessment(
    checklistItemId: string,
    values: Partial<JournalReviewDefinition['ruleAssessments'][number]>,
  ) {
    const assessments = current.current.review.ruleAssessments;
    const assessment = assessments.find((entry) => entry.checklistItemId === checklistItemId);
    review('ruleAssessments', [
      ...assessments.filter((entry) => entry.checklistItemId !== checklistItemId),
      {
        checklistItemId,
        outcome: 'unknown',
        evidence: '',
        source: 'manual',
        ...assessment,
        ...values,
      },
    ]);
  }
  async function retry() {
    blocked.current = false;
    await save();
  }
  async function loadLatest() {
    setBusy(true);
    try {
      setLatest((await journalRead(prefix, journalDetailResponseSchema)).journal);
    } catch (error) {
      setFailure(journalErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function replaceDraft() {
    if (!latest) return;
    current.current = latest.document;
    setDocument(latest.document);
    saved.current = JSON.stringify(latest.document);
    revision.current = latest.revision;
    command.current = null;
    blocked.current = false;
    setFailure(null);
    setIssues([]);
    setFieldErrors({});
    setListInputs({});
    setSaveState('saved');
    setLatest(null);
    onDirtyChange(false);
  }
  function selectStrategy(versionId: string) {
    const version = strategyVersions.data?.versions.find((version) => version.id === versionId);
    if (!version) return;
    setSelectedStrategy(version);
    change({
      ...current.current,
      plan: { ...current.current.plan, strategyVersionId: version.id, setupId: null },
      review: { ...current.current.review, ruleAssessments: [] },
    });
  }
  function actionId(body: unknown) {
    const serialized = JSON.stringify(body);
    if (actionCommand.current?.serialized !== serialized)
      actionCommand.current = { serialized, id: crypto.randomUUID() };
    return actionCommand.current.id;
  }
  async function publish() {
    if (!reason.trim() || busy || uploading || blocked.current) return;
    setBusy(true);
    setFailure(null);
    setMessage(null);
    try {
      if (!(await save())) return;
      const body = {
        expectedRevision: revision.current,
        expectedTradeRevision: detail.trade.revision,
        reason,
      };
      const result = await journalWrite(
        `${prefix}/plans`,
        'POST',
        body,
        journalPlanVersionResponseSchema,
        actionId(body),
      );
      revision.current += 1;
      actionCommand.current = null;
      setReason('');
      setMessage(
        `Plan v${result.version} published. ${detail.originalPlan ? 'The original plan and risk remain unchanged.' : 'The server recorded the original commitment time.'}`,
      );
      await onSaved();
    } catch (error) {
      setFailure(journalErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function addRisk() {
    if (
      !supplement.amount ||
      !supplement.currencyId ||
      !supplement.method.trim() ||
      !supplement.reason.trim() ||
      busy
    )
      return;
    setBusy(true);
    setFailure(null);
    setMessage(null);
    try {
      if (!(await save())) return;
      const body = { ...supplement, expectedRevision: revision.current };
      await journalWrite(
        `${prefix}/risk-additions`,
        'POST',
        body,
        journalRiskAdditionResponseSchema,
        actionId(body),
      );
      revision.current += 1;
      actionCommand.current = null;
      setSupplement({ ...supplement, amount: '', reason: '' });
      setMessage(
        'Supplemental risk recorded separately. The original risk and R denominator remain unchanged.',
      );
      await onSaved();
    } catch (error) {
      setFailure(journalErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function planLeg(
    legId: string,
    key: keyof JournalPlanDefinition['legs'][number],
    value: string | string[] | null,
  ) {
    const existing = current.current.plan.legs.find((leg) => leg.legId === legId) ?? {
      legId,
      plannedEntry: null,
      plannedStop: null,
      plannedTargets: [],
      plannedQuantity: null,
      estimatedCosts: null,
    };
    plan('legs', [
      ...current.current.plan.legs.filter((leg) => leg.legId !== legId),
      { ...existing, [key]: value },
    ]);
  }
  function observation(
    legId: string,
    key: keyof JournalReviewDefinition['actualObservations'][number],
    value: string | null,
  ) {
    const existing = current.current.review.actualObservations.find(
      (leg) => leg.legId === legId,
    ) ?? { legId, actualStop: null, reportedEntry: null, reportedExit: null, notes: '' };
    review('actualObservations', [
      ...current.current.review.actualObservations.filter((leg) => leg.legId !== legId),
      { ...existing, [key]: value },
    ]);
  }

  return (
    <Panel className="journal-editor">
      <ConfirmDialog
        open={confirmation !== null}
        title={
          confirmation === 'replace'
            ? 'Replace your unsaved draft?'
            : detail.originalPlan
              ? 'Publish this plan revision?'
              : 'Commit the original plan?'
        }
        description={
          confirmation === 'replace' ? (
            'Your current local edits will be replaced by the latest saved revision. Copy any notes you want to keep before continuing.'
          ) : (
            <>
              <p>
                Publication creates an immutable plan snapshot. The strategy version and original
                risk commitment remain historical facts.
              </p>
              {!detail.originalPlan && document.plan.initialRisk === null && (
                <p>
                  No initial risk is recorded. A later plan cannot establish the original R
                  denominator.
                </p>
              )}
            </>
          )
        }
        confirmLabel={confirmation === 'replace' ? 'Replace draft' : 'Confirm publication'}
        busy={busy || saveState === 'saving' || uploading}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const action = confirmation;
          setConfirmation(null);
          if (action === 'replace') replaceDraft();
          else if (action === 'publish') void publish();
        }}
      />
      <div className="journal-section-heading">
        <h3>{historyDocument ? 'Historical journal snapshot' : 'Plan & trade review'}</h3>
        <span className="journal-source">Manual journal information</span>
      </div>
      <nav className="journal-section-links" aria-label="Trade review sections">
        <a href={`#${id}-plan`}>Plan</a>
        <a href={`#${id}-review`}>Review &amp; lessons</a>
        <a href={`#${id}-evidence`}>Screenshots</a>
      </nav>
      <div className="journal-save-bar">
        <p role="status" aria-live="polite">
          {!canEdit
            ? 'Read only'
            : uploading
              ? 'Upload in progress · saving paused'
              : saveState === 'saving'
                ? 'Saving journal…'
                : saveState === 'saved'
                  ? 'All journal changes saved'
                  : saveState === 'dirty'
                    ? 'Unsaved draft · autosave pending'
                    : saveState === 'conflict'
                      ? 'Conflict · your draft is preserved'
                      : 'Save failed · your draft is preserved'}
        </p>
        {canEdit && (
          <Button
            variant="secondary"
            onClick={() => void (blocked.current ? retry() : save())}
            disabled={saveState === 'saving' || uploading || busy || saveState === 'conflict'}
          >
            {saveState === 'error' ? 'Retry save' : 'Save now'}
          </Button>
        )}
      </div>
      {canEdit && (
        <p className="journal-help">Changes autosave. Press Ctrl+S or ⌘+S to save immediately.</p>
      )}
      {issues.length > 0 && (
        <div role="alert" className="strategy-errors">
          <strong>Complete or correct these fields to save</strong>
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {failure && (
        <p role="alert" className="form-error">
          {failure}
        </p>
      )}
      {message && (
        <p role="status" className="journal-notice">
          {message}
        </p>
      )}
      {saveState === 'conflict' && (
        <div className="journal-conflict">
          <p>
            Your local edits remain in the form. Inspect the saved version before deciding whether
            to replace them.
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void loadLatest()}>
            View latest saved revision
          </Button>
          {latest && (
            <>
              <pre>{JSON.stringify(latest.document, null, 2)}</pre>
              <Button variant="secondary" onClick={() => setConfirmation('replace')}>
                Replace draft with latest saved version
              </Button>
            </>
          )}
        </div>
      )}
      <fieldset
        id={`${id}-plan`}
        tabIndex={-1}
        className="journal-fieldset"
        disabled={!canEdit || busy}
      >
        <legend>Plan · manual</legend>
        <div className="journal-pinned">
          <strong>
            {documentStrategy
              ? `${documentStrategy.definition.name} · v${documentStrategy.version}`
              : document.plan.strategyVersionId
                ? `${historyDocument ? 'Historical strategy version' : 'Strategy version'} ${document.plan.strategyVersionId}`
                : 'No strategy version selected'}
          </strong>
          <p className="journal-help">
            {historyDocument
              ? 'This snapshot retains the strategy version and manual assessments recorded in this revision.'
              : detail.trade.strategyVersionId
                ? 'The trade is permanently associated with these historical rules.'
                : 'Publishing can associate one explicit strategy version. It cannot later be reassigned.'}
          </p>
          {documentStrategy && (
            <a
              href={`/strategies?workspace=${encodeURIComponent(workspaceId)}&strategy=${encodeURIComponent(documentStrategy.strategyId)}`}
            >
              Open strategy playbook
            </a>
          )}
        </div>
        {!detail.trade.strategyVersionId && canEdit && (
          <div className="journal-fields">
            <div className="journal-field">
              <label htmlFor={`${id}-strategy`}>Strategy</label>
              <select
                id={`${id}-strategy`}
                value={strategyId}
                onChange={(event) => setStrategyId(event.target.value)}
              >
                <option value="">Choose strategy</option>
                {strategies
                  .filter((strategy) => strategy.archivedAt === null)
                  .map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.currentVersion.definition.name}
                    </option>
                  ))}
              </select>
              {strategyVersions.isFetching && strategyId && (
                <small role="status">Loading strategy versions…</small>
              )}
              {!strategies.length && (
                <small>
                  Create a strategy playbook first, then select an immutable version here.
                </small>
              )}
            </div>
            <div className="journal-field">
              <label htmlFor={`${id}-strategy-version`}>Strategy version</label>
              <select
                id={`${id}-strategy-version`}
                value={document.plan.strategyVersionId ?? ''}
                onChange={(event) => selectStrategy(event.target.value)}
                disabled={!strategyId || strategyVersions.isPending}
              >
                <option value="">Choose explicit version</option>
                {strategyVersions.data?.versions.map((version) => (
                  <option value={version.id} key={version.id}>
                    v{version.version} · {version.definition.name}
                  </option>
                ))}
              </select>
            </div>
            {strategyVersions.isError && (
              <p role="alert" className="form-error">
                Strategy versions could not be loaded.
              </p>
            )}
          </div>
        )}
        <div className="journal-fields">
          <div className="journal-field">
            <label htmlFor={`${id}-setup`}>Setup</label>
            <select
              id={`${id}-setup`}
              value={document.plan.setupId ?? ''}
              onChange={(event) => plan('setupId', event.target.value || null)}
            >
              <option value="">No named setup</option>
              {document.plan.setupId &&
                !documentStrategy?.definition.setups.some(
                  (setup) => setup.id === document.plan.setupId,
                ) && (
                  <option value={document.plan.setupId}>
                    Recorded setup {document.plan.setupId}
                  </option>
                )}
              {documentStrategy?.definition.setups.map((setup) => (
                <option value={setup.id} key={setup.id}>
                  {setup.name}
                </option>
              ))}
            </select>
          </div>
          <JournalField
            label="Timeframe"
            value={document.plan.timeframe}
            onChange={(value) => plan('timeframe', value)}
          />
          <JournalField
            label="Thesis"
            value={document.plan.thesis}
            onChange={(value) => plan('thesis', value)}
            multiline
          />
          <JournalField
            label="Planned market conditions"
            value={document.plan.marketConditions}
            onChange={(value) => plan('marketConditions', value)}
            multiline
          />
        </div>
        {detail.financial.legs.map((leg) => {
          const planned = document.plan.legs.find((entry) => entry.legId === leg.legId);
          return (
            <div className="journal-leg-plan" key={leg.legId}>
              <h4>
                {leg.instrumentName} · {leg.accountName}
              </h4>
              <p className="journal-help">
                Prices follow the instrument's recorded quote convention; quantities in{' '}
                {leg.quantityUnit}. Exact decimal input is retained.
              </p>
              <div className="journal-fields">
                {[
                  ['plannedEntry', 'Planned entry'],
                  ['plannedStop', 'Planned stop'],
                  ['plannedQuantity', 'Planned quantity'],
                  ['estimatedCosts', 'Estimated costs'],
                ].map(([key, label]) => (
                  <JournalField
                    key={key}
                    label={`${label} · ${leg.instrumentName}`}
                    value={String(planned?.[key as 'plannedEntry'] ?? '')}
                    onChange={(value) =>
                      planLeg(
                        leg.legId,
                        key as keyof JournalPlanDefinition['legs'][number],
                        value || null,
                      )
                    }
                    decimal
                    error={
                      fieldErrors[
                        `document.plan.legs.${document.plan.legs.findIndex((entry) => entry.legId === leg.legId)}.${key}`
                      ]
                    }
                  />
                ))}
                <JournalField
                  label={`Planned targets · ${leg.instrumentName}`}
                  value={
                    listInputs[`targets:${leg.legId}`] ?? planned?.plannedTargets.join(', ') ?? ''
                  }
                  onChange={(value) => {
                    setListInputs((previous) => ({ ...previous, [`targets:${leg.legId}`]: value }));
                    planLeg(leg.legId, 'plannedTargets', labels(value));
                  }}
                  help="Separate multiple targets with commas."
                  decimal
                  error={
                    fieldErrors[
                      `document.plan.legs.${document.plan.legs.findIndex((entry) => entry.legId === leg.legId)}.plannedTargets`
                    ]
                  }
                />
              </div>
            </div>
          );
        })}
        <label className="journal-check">
          <input
            type="checkbox"
            checked={document.plan.initialRisk !== null}
            onChange={(event) =>
              plan(
                'initialRisk',
                event.target.checked
                  ? { amount: '', currencyId: currencies[0]?.id ?? '', method: '', methodNotes: '' }
                  : null,
              )
            }
          />{' '}
          Record planned initial risk
        </label>
        {document.plan.initialRisk && (
          <div className="journal-fields">
            <JournalField
              label="Initial risk amount"
              value={document.plan.initialRisk.amount}
              onChange={(value) =>
                plan('initialRisk', { ...document.plan.initialRisk!, amount: value })
              }
              decimal
              error={fieldErrors['document.plan.initialRisk.amount']}
            />
            <div className="journal-field">
              <label htmlFor={`${id}-risk-currency`}>Initial risk currency</label>
              <select
                id={`${id}-risk-currency`}
                value={document.plan.initialRisk.currencyId}
                aria-invalid={
                  fieldErrors['document.plan.initialRisk.currencyId'] ? true : undefined
                }
                onChange={(event) =>
                  plan('initialRisk', {
                    ...document.plan.initialRisk!,
                    currencyId: event.target.value,
                  })
                }
              >
                <option value="">Choose currency</option>
                {currencies.map((currency) => (
                  <option value={currency.id} key={currency.id}>
                    {currency.code} · {currency.name}
                  </option>
                ))}
              </select>
            </div>
            <JournalField
              label="Initial risk methodology"
              value={document.plan.initialRisk.method}
              onChange={(value) =>
                plan('initialRisk', { ...document.plan.initialRisk!, method: value })
              }
              error={fieldErrors['document.plan.initialRisk.method']}
            />
            <JournalField
              label="Risk methodology notes"
              value={document.plan.initialRisk.methodNotes}
              onChange={(value) =>
                plan('initialRisk', { ...document.plan.initialRisk!, methodNotes: value })
              }
              multiline
            />
          </div>
        )}
      </fieldset>
      {canEdit &&
        detail.trade.archivedAt === null &&
        !['closed', 'canceled'].includes(detail.trade.status) && (
          <div className="journal-publish">
            <div>
              <h4>{detail.originalPlan ? 'Publish a revised plan' : 'Commit the original plan'}</h4>
              <p className="journal-help">
                A saved draft is not a committed plan. Publication freezes the saved plan and
                records the server time. Earlier executions make the original plan retrospective.
              </p>
              {!detail.originalPlan && document.plan.initialRisk === null && (
                <p className="journal-notice">
                  This original plan has no initial risk. Publishing it permanently records that
                  omission; adding risk to a later plan cannot establish the original R denominator.
                </p>
              )}
            </div>
            <JournalField label="Plan publication reason" value={reason} onChange={setReason} />
            <Button
              onClick={() => setConfirmation('publish')}
              disabled={
                !reason.trim() ||
                busy ||
                uploading ||
                saveState === 'saving' ||
                saveState === 'conflict'
              }
            >
              {detail.originalPlan ? 'Publish plan revision' : 'Commit original plan'}
            </Button>
          </div>
        )}
      <fieldset
        id={`${id}-review`}
        tabIndex={-1}
        className="journal-fieldset"
        disabled={!canEdit || busy}
      >
        <legend>Review · manual observations</legend>
        <div className="journal-fields">
          <JournalField
            label="Observed market conditions"
            value={document.review.marketConditions}
            onChange={(value) => review('marketConditions', value)}
            multiline
          />
          {(['mistakes', 'emotions', 'customTags'] as const).map((key) => (
            <JournalField
              key={key}
              label={
                key === 'customTags' ? 'Custom tags' : key === 'mistakes' ? 'Mistakes' : 'Emotions'
              }
              value={listInputs[key] ?? document.review[key].join(', ')}
              onChange={(value) => {
                setListInputs((previous) => ({ ...previous, [key]: value }));
                review(key, labels(value));
              }}
              help="Separate entries with commas."
              error={fieldErrors[`document.review.${key}`]}
            />
          ))}
          <div className="journal-field">
            <label htmlFor={`${id}-confidence`}>Confidence</label>
            <select
              id={`${id}-confidence`}
              value={document.review.confidence ?? ''}
              onChange={(event) =>
                review('confidence', event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">Not recorded</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} ·{' '}
                  {value === 1
                    ? 'Very low'
                    : value === 2
                      ? 'Low'
                      : value === 3
                        ? 'Moderate'
                        : value === 4
                          ? 'High'
                          : 'Very high'}
                </option>
              ))}
            </select>
            <small>Subjective scale: 1 very low to 5 very high.</small>
          </div>
          <div className="journal-field">
            <label htmlFor={`${id}-quality`}>Execution quality</label>
            <select
              id={`${id}-quality`}
              value={document.review.executionQuality ?? ''}
              onChange={(event) =>
                review(
                  'executionQuality',
                  (event.target.value || null) as JournalReviewDefinition['executionQuality'],
                )
              }
            >
              <option value="">Not recorded</option>
              {['excellent', 'good', 'mixed', 'poor'].map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          {(
            [
              ['exitReason', 'Exit reason'],
              ['lessonsLearned', 'Lessons learned'],
              ['postTradeReview', 'Post-trade review'],
              ['customNotes', 'Custom notes'],
            ] as const
          ).map(([key, label]) => (
            <JournalField
              key={key}
              label={label}
              value={document.review[key]}
              onChange={(value) => review(key, value)}
              multiline
            />
          ))}
        </div>
        {detail.financial.legs.map((leg) => {
          const actual = document.review.actualObservations.find(
            (entry) => entry.legId === leg.legId,
          );
          return (
            <div className="journal-leg-plan" key={leg.legId}>
              <h4>Manual observations · {leg.instrumentName}</h4>
              <p className="journal-help">
                Actual stop is your observation. Reported entry and exit are separate notes; the
                ledger actuals above remain authoritative.
              </p>
              <div className="journal-fields">
                {(
                  [
                    ['actualStop', 'Actual stop'],
                    ['reportedEntry', 'Manually reported entry'],
                    ['reportedExit', 'Manually reported exit'],
                  ] as const
                ).map(([key, label]) => (
                  <JournalField
                    label={`${label} · ${leg.instrumentName}`}
                    key={key}
                    value={actual?.[key] ?? ''}
                    onChange={(value) => observation(leg.legId, key, value || null)}
                    decimal
                    error={
                      fieldErrors[
                        `document.review.actualObservations.${document.review.actualObservations.findIndex((entry) => entry.legId === leg.legId)}.${key}`
                      ]
                    }
                  />
                ))}
                <JournalField
                  label={`Execution notes · ${leg.instrumentName}`}
                  value={actual?.notes ?? ''}
                  onChange={(value) => observation(leg.legId, 'notes', value)}
                  multiline
                />
              </div>
            </div>
          );
        })}
        <div className="journal-section-heading">
          <h4>Rule adherence</h4>
          <span className="journal-source">Manual assessment</span>
        </div>
        <p className="journal-help">
          Unknown means unassessed or insufficient evidence. No automatic rule pass is inferred.
        </p>
        {displayedChecklist.length > 0 ? (
          displayedChecklist.map((item) => {
            const assessment = document.review.ruleAssessments.find(
              (entry) => entry.checklistItemId === item.id,
            );
            return (
              <div className="journal-checklist-item" key={item.id}>
                <div className="journal-field">
                  <label htmlFor={`${id}-${item.id}`}>
                    {item.label}
                    {item.required ? ' · Required rule' : ''}
                  </label>
                  <select
                    id={`${id}-${item.id}`}
                    value={assessment?.outcome ?? 'unknown'}
                    onChange={(event) =>
                      updateAssessment(item.id, {
                        outcome: event.target.value as 'passed' | 'failed' | 'unknown',
                      })
                    }
                  >
                    <option value="unknown">Unknown / unassessed</option>
                    <option value="passed">Passed · manually assessed</option>
                    <option value="failed">Failed · manually assessed</option>
                  </select>
                </div>
                <JournalField
                  label={`Evidence · ${item.label}`}
                  value={assessment?.evidence ?? ''}
                  onChange={(value) => updateAssessment(item.id, { evidence: value })}
                  multiline
                />
              </div>
            );
          })
        ) : (
          <p className="journal-help">
            Choose a strategy version with checklist rules to record adherence.
          </p>
        )}
      </fieldset>
      <div id={`${id}-evidence`} tabIndex={-1}>
        <JournalAttachments
          workspaceId={workspaceId}
          attachments={document.review.attachments}
          editable={canEdit && !busy}
          onUploadingChange={uploadState}
          onChange={(attachments) =>
            change({
              ...current.current,
              plan: {
                ...current.current.plan,
                attachmentIds: attachments
                  .filter((attachment) => attachment.phase === 'before')
                  .map((attachment) => attachment.attachmentId),
              },
              review: { ...current.current.review, attachments },
            })
          }
        />
      </div>
      {canEdit &&
        detail.commitment &&
        detail.trade.archivedAt === null &&
        !['closed', 'canceled'].includes(detail.trade.status) && (
          <details className="journal-supplement">
            <summary>Record supplemental risk</summary>
            <p className="journal-help">
              Append a separately timed risk addition. It never rewrites the original plan or
              historical R denominator.
            </p>
            <div className="journal-fields">
              <JournalField
                label="Supplemental risk amount"
                value={supplement.amount}
                onChange={(value) => setSupplement({ ...supplement, amount: value })}
                decimal
              />
              <div className="journal-field">
                <label htmlFor={`${id}-supplement-currency`}>Supplemental risk currency</label>
                <select
                  id={`${id}-supplement-currency`}
                  value={supplement.currencyId}
                  onChange={(event) =>
                    setSupplement({ ...supplement, currencyId: event.target.value })
                  }
                >
                  {currencies.map((currency) => (
                    <option key={currency.id} value={currency.id}>
                      {currency.code}
                    </option>
                  ))}
                </select>
              </div>
              <JournalField
                label="Supplemental risk methodology"
                value={supplement.method}
                onChange={(value) => setSupplement({ ...supplement, method: value })}
              />
              <JournalField
                label="Supplemental risk notes"
                value={supplement.methodNotes}
                onChange={(value) => setSupplement({ ...supplement, methodNotes: value })}
                multiline
              />
              <JournalField
                label="Supplemental risk reason"
                value={supplement.reason}
                onChange={(value) => setSupplement({ ...supplement, reason: value })}
              />
            </div>
            <Button
              variant="secondary"
              disabled={
                busy ||
                uploading ||
                !supplement.amount ||
                !supplement.method ||
                !supplement.reason ||
                saveState === 'conflict'
              }
              onClick={() => void addRisk()}
            >
              Record risk addition
            </Button>
          </details>
        )}
    </Panel>
  );
}
