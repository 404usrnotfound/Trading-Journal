'use client';

import {
  strategyCreateSchema,
  strategyDefinitionSchema,
  strategyUpdateSchema,
  type StrategyDefinition,
  type StrategyParameter,
  type StrategyResponse,
} from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { useRef, useState, type FormEvent } from 'react';
import { StrategyAttachments } from './strategy-attachments';

export const strategyNarrativeFields = [
  ['description', 'Description'],
  ['hypothesis', 'Hypothesis / edge'],
  ['marketRegimeFilters', 'Market regime filters'],
  ['setupConditions', 'Setup conditions'],
  ['entryRules', 'Entry rules'],
  ['confirmationRules', 'Confirmation rules'],
  ['invalidationRules', 'Invalidation rules'],
  ['stopLossMethodology', 'Stop-loss methodology'],
  ['takeProfitMethodology', 'Take-profit methodology'],
  ['riskRules', 'Risk rules'],
  ['positionSizingRules', 'Position sizing rules'],
  ['scalingRules', 'Scaling rules'],
  ['managementRules', 'Trailing / management rules'],
  ['exitRules', 'Exit rules'],
  ['reviewSchedule', 'Review schedule'],
  ['notes', 'Notes'],
] as const;
const listFields = [
  ['assetClasses', 'Asset classes'],
  ['markets', 'Markets'],
  ['timeframes', 'Timeframes'],
  ['sessions', 'Sessions'],
  ['indicators', 'Indicators'],
  ['tags', 'Tags'],
] as const;
type ListField = (typeof listFields)[number][0];
type StringField = (typeof strategyNarrativeFields)[number][0] | 'name' | 'style';

function listValues(value: string): string[] {
  return value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
function inputDate(instant: string): string {
  const date = new Date(instant);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function newParameter(
  type: StrategyParameter['type'],
  id = crypto.randomUUID(),
): StrategyParameter {
  const base = { id, name: '', description: '' };
  switch (type) {
    case 'decimal':
      return { ...base, type, value: '0', unit: null, minimum: null, maximum: null };
    case 'boolean':
      return { ...base, type, value: false };
    case 'enum':
      return { ...base, type, value: '', options: [] };
    case 'text':
      return { ...base, type, value: '' };
  }
}

export function StrategyEditor({
  workspaceId,
  strategy,
  onSave,
  onCancel,
  conflict,
  onReload,
}: {
  workspaceId: string;
  strategy: StrategyResponse | null;
  onSave: (input: unknown, commandId: string) => Promise<void>;
  onCancel: () => void;
  conflict: boolean;
  onReload: () => Promise<void>;
}) {
  const [definition, setDefinition] = useState<StrategyDefinition>(
    () =>
      strategy?.currentVersion.definition ?? {
        ...strategyDefinitionSchema.parse({ name: 'New strategy' }),
        name: '',
      },
  );
  const [lists, setLists] = useState<Record<ListField, string>>(
    () =>
      Object.fromEntries(
        listFields.map(([key]) => [key, strategy?.currentVersion.definition[key].join(', ') ?? '']),
      ) as Record<ListField, string>,
  );
  const [instrumentIds, setInstrumentIds] = useState(
    strategy?.currentVersion.definition.eligibleInstruments.join(', ') ?? '',
  );
  const [parameterOptions, setParameterOptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (strategy?.currentVersion.definition.parameters ?? [])
        .filter((parameter) => parameter.type === 'enum')
        .map((parameter) => [parameter.id, parameter.options.join(', ')]),
    ),
  );
  const [effectiveAt, setEffectiveAt] = useState(() => inputDate(new Date().toISOString()));
  const [changeReason, setChangeReason] = useState(strategy ? '' : 'Initial version');
  const [errors, setErrors] = useState<Array<{ path: string; message: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const command = useRef<{ serialized: string; id: string } | null>(null);
  const errorSummary = useRef<HTMLDivElement>(null);

  function updateString(key: StringField, value: string) {
    setDefinition((previous) => ({ ...previous, [key]: value }));
  }
  function updateParameter(index: number, parameter: StrategyParameter) {
    setDefinition((previous) => ({
      ...previous,
      parameters: previous.parameters.map((item, itemIndex) =>
        itemIndex === index ? parameter : item,
      ),
    }));
  }
  function fieldInvalid(key: string) {
    return errors.some((error) => error.path === key || error.path.startsWith(`${key}.`));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || uploading || conflict) return;
    setFailure(null);
    const fields = Object.fromEntries(listFields.map(([key]) => [key, listValues(lists[key])]));
    const instant = new Date(effectiveAt);
    const input = {
      definition: {
        ...definition,
        ...fields,
        eligibleInstruments: listValues(instrumentIds),
        parameters: definition.parameters.map((parameter) =>
          parameter.type === 'enum'
            ? {
                ...parameter,
                options: listValues(parameterOptions[parameter.id] ?? parameter.options.join(', ')),
              }
            : parameter,
        ),
      },
      effectiveAt: Number.isNaN(instant.getTime()) ? effectiveAt : instant.toISOString(),
      changeReason,
      ...(strategy ? { expectedRevision: strategy.revision } : {}),
    };
    const parsed = strategy
      ? strategyUpdateSchema.safeParse(input)
      : strategyCreateSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.').replace(/^definition\./u, ''),
          message: issue.message,
        })),
      );
      queueMicrotask(() => errorSummary.current?.focus());
      return;
    }
    setErrors([]);
    const serialized = JSON.stringify(parsed.data);
    if (command.current?.serialized !== serialized)
      command.current = { serialized, id: crypto.randomUUID() };
    setSaving(true);
    try {
      await onSave(parsed.data, command.current.id);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Unable to save this strategy.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel className="strategy-editor">
      <h2>{strategy ? `Edit ${strategy.currentVersion.definition.name}` : 'Create strategy'}</h2>
      <p>
        {strategy
          ? `Saving creates version ${strategy.currentVersion.version + 1}. Previous versions and trade references stay unchanged.`
          : 'Create an independent playbook. Each save preserves a complete version of its rules.'}
      </p>
      <form className="strategy-form" onSubmit={submit} noValidate aria-busy={saving}>
        {errors.length > 0 && (
          <div className="strategy-errors" role="alert" tabIndex={-1} ref={errorSummary}>
            <strong>Review these fields before saving.</strong>
            <ul>
              {errors.map((error, index) => (
                <li key={`${error.path}-${index}`}>
                  {error.path}: {error.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {failure && (
          <p className="strategy-errors" role="alert">
            {failure}
          </p>
        )}
        {conflict && (
          <div className="strategy-errors" role="alert">
            <p>
              Your changes have been kept here. This strategy changed elsewhere; saving is blocked
              until you reload or cancel.
            </p>
            <Button variant="secondary" onClick={() => void onReload()}>
              Discard edits and reload latest
            </Button>
          </div>
        )}
        <fieldset className="strategy-fieldset">
          <legend>Identity &amp; eligibility</legend>
          <div className="strategy-fields">
            <div className="strategy-field wide">
              <label htmlFor="strategy-name">Name</label>
              <input
                id="strategy-name"
                value={definition.name}
                onChange={(event) => updateString('name', event.target.value)}
                maxLength={160}
                required
                aria-invalid={fieldInvalid('name')}
                autoComplete="off"
              />
            </div>
            <div className="strategy-field">
              <label htmlFor="strategy-status">Status</label>
              <select
                id="strategy-status"
                value={definition.status}
                onChange={(event) =>
                  setDefinition((previous) => ({
                    ...previous,
                    status: event.target.value as StrategyDefinition['status'],
                  }))
                }
              >
                {['draft', 'active', 'paused', 'retired'].map((status) => (
                  <option key={status} value={status}>
                    {status[0]?.toUpperCase()}
                    {status.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="strategy-field">
              <label htmlFor="strategy-direction">Direction</label>
              <select
                id="strategy-direction"
                value={definition.direction}
                onChange={(event) =>
                  setDefinition((previous) => ({
                    ...previous,
                    direction: event.target.value as StrategyDefinition['direction'],
                  }))
                }
              >
                <option value="both">Long and short</option>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            {listFields.map(([key, label]) => (
              <div className="strategy-field" key={key}>
                <label htmlFor={`strategy-${key}`}>{label}</label>
                <input
                  id={`strategy-${key}`}
                  value={lists[key]}
                  onChange={(event) =>
                    setLists((previous) => ({ ...previous, [key]: event.target.value }))
                  }
                  aria-describedby={`strategy-${key}-help`}
                  aria-invalid={fieldInvalid(key)}
                />
                <small id={`strategy-${key}-help`}>Separate entries with commas.</small>
              </div>
            ))}
            <div className="strategy-field">
              <label htmlFor="strategy-style">Trading style</label>
              <input
                id="strategy-style"
                value={definition.style}
                onChange={(event) => updateString('style', event.target.value)}
                maxLength={160}
              />
            </div>
            <div className="strategy-field">
              <label htmlFor="strategy-instruments">Eligible instrument IDs</label>
              <textarea
                id="strategy-instruments"
                value={instrumentIds}
                onChange={(event) => setInstrumentIds(event.target.value)}
                aria-invalid={fieldInvalid('eligibleInstruments')}
              />
              <small>
                Optional workspace instrument UUIDs, separated by commas. Leave blank for no
                explicit instrument restriction.
              </small>
            </div>
          </div>
        </fieldset>
        <fieldset className="strategy-fieldset">
          <legend>Rules &amp; reference notes</legend>
          <div className="strategy-fields">
            {strategyNarrativeFields.map(([key, label]) => (
              <div className="strategy-field wide" key={key}>
                <label htmlFor={`strategy-${key}`}>{label}</label>
                <textarea
                  id={`strategy-${key}`}
                  value={definition[key]}
                  onChange={(event) => updateString(key, event.target.value)}
                  maxLength={20_000}
                  aria-invalid={fieldInvalid(key)}
                />
              </div>
            ))}
          </div>
        </fieldset>
        <fieldset className="strategy-fieldset">
          <legend>Required checklist</legend>
          <div className="strategy-repeater">
            {definition.checklist.map((item, index) => (
              <div className="strategy-repeater-row" key={item.id}>
                <div className="strategy-repeater-heading">
                  <strong>Item {index + 1}</strong>
                  <Button
                    variant="quiet"
                    onClick={() =>
                      setDefinition((previous) => ({
                        ...previous,
                        checklist: previous.checklist.filter((entry) => entry.id !== item.id),
                        setups: previous.setups.map((setup) => ({
                          ...setup,
                          checklistItemIds: setup.checklistItemIds.filter((id) => id !== item.id),
                        })),
                      }))
                    }
                  >
                    Remove checklist item {index + 1}
                  </Button>
                </div>
                <div className="strategy-field">
                  <label htmlFor={`checklist-${item.id}`}>Checklist item {index + 1}</label>
                  <input
                    id={`checklist-${item.id}`}
                    value={item.label}
                    onChange={(event) =>
                      setDefinition((previous) => ({
                        ...previous,
                        checklist: previous.checklist.map((entry) =>
                          entry.id === item.id ? { ...entry, label: event.target.value } : entry,
                        ),
                      }))
                    }
                    maxLength={160}
                  />
                </div>
                <label className="strategy-check">
                  <input
                    type="checkbox"
                    checked={item.required}
                    onChange={(event) =>
                      setDefinition((previous) => ({
                        ...previous,
                        checklist: previous.checklist.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, required: event.target.checked }
                            : entry,
                        ),
                      }))
                    }
                  />
                  Required item {index + 1}
                </label>
              </div>
            ))}
            <Button
              variant="secondary"
              disabled={definition.checklist.length >= 100}
              onClick={() =>
                setDefinition((previous) => ({
                  ...previous,
                  checklist: [
                    ...previous.checklist,
                    { id: crypto.randomUUID(), label: '', required: true },
                  ],
                }))
              }
            >
              Add checklist item
            </Button>
          </div>
        </fieldset>
        <fieldset className="strategy-fieldset">
          <legend>Named setups</legend>
          <p className="strategy-readonly-note">
            A setup is a specific pattern within this strategy, with its own conditions and
            checklist selection.
          </p>
          <div className="strategy-repeater">
            {definition.setups.map((setup, index) => (
              <div className="strategy-repeater-row" key={setup.id}>
                <div className="strategy-repeater-heading">
                  <strong>Setup {index + 1}</strong>
                  <Button
                    variant="quiet"
                    onClick={() =>
                      setDefinition((previous) => ({
                        ...previous,
                        setups: previous.setups.filter((entry) => entry.id !== setup.id),
                      }))
                    }
                  >
                    Remove setup {index + 1}
                  </Button>
                </div>
                <div className="strategy-fields">
                  {(['name', 'description', 'conditions'] as const).map((key) => (
                    <div className="strategy-field wide" key={key}>
                      <label htmlFor={`setup-${setup.id}-${key}`}>
                        Setup {index + 1} {key}
                      </label>
                      <textarea
                        id={`setup-${setup.id}-${key}`}
                        value={setup[key]}
                        maxLength={key === 'name' ? 160 : 20_000}
                        onChange={(event) =>
                          setDefinition((previous) => ({
                            ...previous,
                            setups: previous.setups.map((entry) =>
                              entry.id === setup.id
                                ? { ...entry, [key]: event.target.value }
                                : entry,
                            ),
                          }))
                        }
                      />
                    </div>
                  ))}
                  {definition.checklist.map((item) => (
                    <label className="strategy-check" key={item.id}>
                      <input
                        type="checkbox"
                        checked={setup.checklistItemIds.includes(item.id)}
                        onChange={(event) =>
                          setDefinition((previous) => ({
                            ...previous,
                            setups: previous.setups.map((entry) =>
                              entry.id === setup.id
                                ? {
                                    ...entry,
                                    checklistItemIds: event.target.checked
                                      ? [...entry.checklistItemIds, item.id]
                                      : entry.checklistItemIds.filter((id) => id !== item.id),
                                  }
                                : entry,
                            ),
                          }))
                        }
                      />
                      Setup {index + 1}: {item.label || 'Unnamed checklist item'}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <Button
              variant="secondary"
              disabled={definition.setups.length >= 100}
              onClick={() =>
                setDefinition((previous) => ({
                  ...previous,
                  setups: [
                    ...previous.setups,
                    {
                      id: crypto.randomUUID(),
                      name: '',
                      description: '',
                      conditions: '',
                      checklistItemIds: [],
                    },
                  ],
                }))
              }
            >
              Add named setup
            </Button>
          </div>
        </fieldset>
        <fieldset className="strategy-fieldset">
          <legend>Typed parameters</legend>
          <p className="strategy-readonly-note">
            These values describe your rules. They do not automatically evaluate market conditions
            or enforce risk limits.
          </p>
          <div className="strategy-repeater">
            {definition.parameters.map((parameter, index) => (
              <div className="strategy-repeater-row" key={parameter.id}>
                <div className="strategy-repeater-heading">
                  <strong>Parameter {index + 1}</strong>
                  <Button
                    variant="quiet"
                    onClick={() =>
                      setDefinition((previous) => ({
                        ...previous,
                        parameters: previous.parameters.filter(
                          (entry) => entry.id !== parameter.id,
                        ),
                      }))
                    }
                  >
                    Remove parameter {index + 1}
                  </Button>
                </div>
                <div className="strategy-fields">
                  <div className="strategy-field">
                    <label htmlFor={`parameter-${parameter.id}-name`}>
                      Parameter {index + 1} name
                    </label>
                    <input
                      id={`parameter-${parameter.id}-name`}
                      value={parameter.name}
                      maxLength={160}
                      onChange={(event) =>
                        updateParameter(index, { ...parameter, name: event.target.value })
                      }
                    />
                  </div>
                  <div className="strategy-field">
                    <label htmlFor={`parameter-${parameter.id}-type`}>
                      Parameter {index + 1} type
                    </label>
                    <select
                      id={`parameter-${parameter.id}-type`}
                      value={parameter.type}
                      onChange={(event) =>
                        updateParameter(index, {
                          ...newParameter(
                            event.target.value as StrategyParameter['type'],
                            parameter.id,
                          ),
                          name: parameter.name,
                          description: parameter.description,
                        })
                      }
                    >
                      <option value="decimal">Decimal number</option>
                      <option value="boolean">Boolean</option>
                      <option value="text">Text</option>
                      <option value="enum">Choice</option>
                    </select>
                  </div>
                  <div className="strategy-field wide">
                    <label htmlFor={`parameter-${parameter.id}-description`}>
                      Parameter {index + 1} description
                    </label>
                    <input
                      id={`parameter-${parameter.id}-description`}
                      value={parameter.description}
                      onChange={(event) =>
                        updateParameter(index, { ...parameter, description: event.target.value })
                      }
                    />
                  </div>
                  {parameter.type === 'boolean' ? (
                    <label className="strategy-check">
                      <input
                        type="checkbox"
                        checked={parameter.value}
                        onChange={(event) =>
                          updateParameter(index, { ...parameter, value: event.target.checked })
                        }
                      />
                      Parameter {index + 1} enabled
                    </label>
                  ) : (
                    <div className="strategy-field">
                      <label htmlFor={`parameter-${parameter.id}-value`}>
                        Parameter {index + 1} value
                      </label>
                      <input
                        id={`parameter-${parameter.id}-value`}
                        value={parameter.value}
                        inputMode={parameter.type === 'decimal' ? 'decimal' : 'text'}
                        onChange={(event) =>
                          updateParameter(index, { ...parameter, value: event.target.value })
                        }
                      />
                    </div>
                  )}
                  {parameter.type === 'decimal' &&
                    (['unit', 'minimum', 'maximum'] as const).map((key) => (
                      <div className="strategy-field" key={key}>
                        <label htmlFor={`parameter-${parameter.id}-${key}`}>
                          Parameter {index + 1} {key}
                        </label>
                        <input
                          id={`parameter-${parameter.id}-${key}`}
                          value={parameter[key] ?? ''}
                          inputMode={key === 'unit' ? 'text' : 'decimal'}
                          onChange={(event) =>
                            updateParameter(index, {
                              ...parameter,
                              [key]: event.target.value.trim() === '' ? null : event.target.value,
                            })
                          }
                        />
                      </div>
                    ))}
                  {parameter.type === 'enum' && (
                    <div className="strategy-field">
                      <label htmlFor={`parameter-${parameter.id}-options`}>
                        Parameter {index + 1} choices
                      </label>
                      <input
                        id={`parameter-${parameter.id}-options`}
                        value={parameterOptions[parameter.id] ?? parameter.options.join(', ')}
                        onChange={(event) =>
                          setParameterOptions((previous) => ({
                            ...previous,
                            [parameter.id]: event.target.value,
                          }))
                        }
                      />
                      <small>Separate declared choices with commas.</small>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <Button
              variant="secondary"
              disabled={definition.parameters.length >= 100}
              onClick={() =>
                setDefinition((previous) => ({
                  ...previous,
                  parameters: [...previous.parameters, newParameter('decimal')],
                }))
              }
            >
              Add parameter
            </Button>
          </div>
        </fieldset>
        <fieldset className="strategy-fieldset">
          <legend>Screenshots &amp; attachments</legend>
          <StrategyAttachments
            workspaceId={workspaceId}
            attachmentIds={definition.attachmentIds}
            editable
            onUploadingChange={setUploading}
            onChange={(attachmentIds) =>
              setDefinition((previous) => ({ ...previous, attachmentIds }))
            }
          />
        </fieldset>
        <fieldset className="strategy-fieldset">
          <legend>Version record</legend>
          <div className="strategy-fields">
            <div className="strategy-field">
              <label htmlFor="strategy-effective">Effective date &amp; time</label>
              <input
                id="strategy-effective"
                type="datetime-local"
                value={effectiveAt}
                onChange={(event) => setEffectiveAt(event.target.value)}
                required
              />
              <small>
                Entered in your browser’s local timezone. Stored with an explicit UTC instant.
              </small>
            </div>
            <div className="strategy-field">
              <label htmlFor="strategy-reason">Reason for this version</label>
              <textarea
                id="strategy-reason"
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                maxLength={2_000}
                required
                aria-invalid={fieldInvalid('changeReason')}
              />
            </div>
          </div>
        </fieldset>
        <div className="strategy-actions">
          <Button type="submit" disabled={saving || uploading || conflict}>
            {saving ? 'Saving…' : strategy ? 'Save new version' : 'Create strategy'}
          </Button>
          <Button variant="secondary" disabled={saving} onClick={onCancel}>
            Cancel editing
          </Button>
        </div>
      </form>
    </Panel>
  );
}
