'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  workspacePreferencesUpdateSchema,
  workspaceResponseSchema,
  type WorkspacePreferencesUpdateInput,
  type WorkspaceResponse,
} from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { apiClient } from '@/lib/api-client';

function formValues(workspace: WorkspaceResponse): WorkspacePreferencesUpdateInput {
  return {
    timezone: workspace.timezone,
    reportingCurrency: workspace.reportingCurrency,
    expectedRevision: workspace.revision,
  };
}

export function WorkspacePreferences({ workspace }: { workspace: WorkspaceResponse }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WorkspacePreferencesUpdateInput>({
    resolver: zodResolver(workspacePreferencesUpdateSchema),
    defaultValues: formValues(workspace),
  });

  useEffect(() => {
    reset(formValues(workspace));
  }, [workspace, reset]);

  async function save(input: WorkspacePreferencesUpdateInput) {
    setMessage(null);
    setFailed(false);
    setConflict(false);
    try {
      const session = await apiClient.GET('/api/auth/session');
      const csrfToken = session.response.headers.get('x-csrf-token');
      if (!session.response.ok || !csrfToken) {
        setFailed(true);
        setMessage('Your session has ended. Sign in again to save these preferences.');
        return;
      }
      const result = await apiClient.PATCH('/api/v1/workspaces/{workspaceId}', {
        params: {
          path: { workspaceId: workspace.id },
          header: { 'X-CSRF-Token': csrfToken },
        },
        body: {
          expectedRevision: input.expectedRevision,
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.reportingCurrency !== undefined
            ? { reportingCurrency: input.reportingCurrency }
            : {}),
        },
      });
      if (!result.response.ok) {
        setFailed(true);
        setConflict(result.response.status === 409);
        setMessage(
          result.response.status === 409
            ? 'These preferences changed elsewhere. Reload them before saving again.'
            : 'Unable to save your preferences. Check your access and try again.',
        );
        return;
      }
      const updated = workspaceResponseSchema.parse(result.data);
      reset(formValues(updated));
      setMessage('Preferences saved.');
      router.refresh();
    } catch {
      setFailed(true);
      setMessage('The connection failed. Please try again.');
    }
  }

  return (
    <Panel className="preferences-panel">
      <h2>Workspace preferences</h2>
      <p className="muted">Choose how dates and future reports appear in this workspace.</p>
      {workspace.role === 'owner' ? (
        <form onSubmit={handleSubmit(save)} noValidate aria-busy={isSubmitting}>
          <input type="hidden" {...register('expectedRevision', { valueAsNumber: true })} />
          <div className="preferences-fields">
            <div className="field">
              <label htmlFor="timezone">Timezone</label>
              <input
                id="timezone"
                {...register('timezone')}
                autoComplete="off"
                spellCheck={false}
                list="timezone-suggestions"
                aria-invalid={Boolean(errors.timezone)}
                aria-describedby={errors.timezone ? 'timezone-error' : 'timezone-help'}
              />
              <datalist id="timezone-suggestions">
                {['UTC', 'Europe/London', 'Europe/Madrid', 'America/New_York', 'Asia/Tokyo'].map(
                  (timezone) => (
                    <option key={timezone} value={timezone} />
                  ),
                )}
              </datalist>
              <span id="timezone-help" className="field-help">
                Use a timezone such as Europe/Madrid.
              </span>
              {errors.timezone && (
                <p id="timezone-error" role="alert" className="form-error">
                  Enter a valid timezone.
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="reporting-currency">Reporting currency</label>
              <input
                id="reporting-currency"
                {...register('reportingCurrency', {
                  setValueAs: (value: unknown) => {
                    if (typeof value !== 'string' || value.trim() === '') return null;
                    return value.trim().toUpperCase();
                  },
                })}
                placeholder="Optional, e.g. EUR"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={16}
                aria-invalid={Boolean(errors.reportingCurrency)}
                aria-describedby={
                  errors.reportingCurrency ? 'reporting-currency-error' : 'reporting-currency-help'
                }
              />
              <span id="reporting-currency-help" className="field-help">
                Leave blank to choose later.
              </span>
              {errors.reportingCurrency && (
                <p id="reporting-currency-error" role="alert" className="form-error">
                  Enter a valid currency label.
                </p>
              )}
            </div>
          </div>
          <div className="preferences-actions">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save preferences'}
            </Button>
            {conflict && (
              <Button
                variant="secondary"
                onClick={() => {
                  router.refresh();
                  setMessage(null);
                  setConflict(false);
                }}
              >
                Reload preferences
              </Button>
            )}
            {message && (
              <p
                role={failed ? 'alert' : 'status'}
                className={failed ? 'form-error' : 'preferences-status'}
              >
                {message}
              </p>
            )}
          </div>
        </form>
      ) : (
        <dl className="preferences-summary">
          <div>
            <dt>Timezone</dt>
            <dd>{workspace.timezone}</dd>
          </div>
          <div>
            <dt>Reporting currency</dt>
            <dd>{workspace.reportingCurrency ?? 'Not selected'}</dd>
          </div>
        </dl>
      )}
    </Panel>
  );
}
