'use client';
import { useId, useRef, useState } from 'react';
import { Button, Panel } from '@journal/ui';
import {
  PORTABLE_MAXIMUM_BYTES,
  portableRestoreResponseSchema,
  problemResponseSchema,
  type WorkspaceResponse,
  type PortableExportRequest,
} from '@journal/contracts';
import { ConfirmDialog } from '@/components/ux/confirm-dialog';
import { retainedCommand } from '../record/record-api';

async function checked(response: Response) {
  if (response.ok) return response;
  const result = problemResponseSchema.safeParse(await response.json());
  throw new Error(
    result.success ? result.data.detail : 'The portability request could not be completed.',
  );
}
function download(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
async function mutationHeaders(commandId = crypto.randomUUID()) {
  const session = await fetch('/api/auth/session'),
    proof = session.headers.get('x-csrf-token');
  if (!proof) throw new Error('Refresh your session before continuing.');
  return {
    'content-type': 'application/json',
    'x-csrf-token': proof,
    'idempotency-key': commandId,
  };
}
export function PortabilityWorkspace({ workspace }: { workspace: WorkspaceResponse }) {
  const commands = useRef(new Map<string, { serialized: string; id: string }>());
  const id = useId(),
    base = `/api/v1/workspaces/${workspace.id}/portability`;
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null),
    [name, setName] = useState(`${workspace.name} restored`),
    [confirm, setConfirm] = useState(false),
    [restored, setRestored] = useState<string | null>(null);
  const [kind, setKind] = useState<PortableExportRequest['kind']>('trades'),
    [format, setFormat] = useState<'json' | 'csv'>('json');
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [accounts, setAccounts] = useState(''),
    [ids, setIds] = useState(''),
    [analytics, setAnalytics] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The operation failed.');
    } finally {
      setBusy(false);
    }
  }
  const backup = () =>
    run(async () => {
      const response = await checked(await fetch(`${base}/backup`));
      download(await response.blob(), `workspace-${workspace.id}.journal.json`);
      setMessage(
        'Workspace backup downloaded, including private attachment bytes and verification checksums.',
      );
    });
  const restore = () =>
    run(async () => {
      setConfirm(false);
      if (!file) throw new Error('Select a workspace backup.');
      if (file.size > PORTABLE_MAXIMUM_BYTES) throw new Error('Use a backup smaller than 64 MiB.');
      const archive: unknown = JSON.parse(await file.text());
      const body = { name, archive };
      const commandId = retainedCommand(commands.current, 'restore', body);
      const response = await checked(
        await fetch(`${base}/restore`, {
          method: 'POST',
          headers: await mutationHeaders(commandId),
          body: JSON.stringify(body),
        }),
      );
      const result = portableRestoreResponseSchema.parse(await response.json());
      commands.current.delete('restore');
      setRestored(result.workspaceId);
      setMessage('The new workspace was restored and verified.');
    });
  const exportRecords = () =>
    run(async () => {
      const split = (value: string) => value.split(/[\s,]+/u).filter(Boolean);
      const body = {
        kind,
        format,
        ...(from ? { from: new Date(from).toISOString() } : {}),
        ...(to ? { to: new Date(to).toISOString() } : {}),
        ...(accounts.trim() ? { accountIds: split(accounts) } : {}),
        ...(ids.trim() ? { ids: split(ids) } : {}),
        ...(kind === 'analytics' ? { analytics: JSON.parse(analytics) as unknown } : {}),
      };
      const response = await checked(
        await fetch(`${base}/export`, {
          method: 'POST',
          headers: await mutationHeaders(),
          body: JSON.stringify(body),
        }),
      );
      download(await response.blob(), `journal-${kind}.${format}`);
      setMessage('The filtered records were exported.');
    });
  return (
    <div className="workflow-stack">
      <header className="page-heading">
        <h1>Data portability</h1>
        <p>
          Download workspace records and private media, restore a backup into a new workspace, or
          export a filtered selection.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {restored && (
        <a href={`/accounts?workspace=${encodeURIComponent(restored)}`}>Open restored workspace</a>
      )}
      <Panel>
        <h2>Complete workspace backup</h2>
        <p>
          The versioned JSON file preserves original decimal values, source records, history,
          calculation versions and private attachments. Store it privately.
        </p>
        {workspace.role === 'owner' ? (
          <Button disabled={busy} onClick={() => void backup()}>
            {busy ? 'Working…' : 'Download workspace backup'}
          </Button>
        ) : (
          <p>
            Workspace owner access is required for a complete backup. Filtered exports remain
            available below.
          </p>
        )}
      </Panel>
      <Panel>
        <h2>Restore into a new workspace</h2>
        <p>
          Restoring creates a separate workspace owned by you. Checksums, source relationships,
          calculation versions and regenerated balances are verified before it becomes available.
          Sign-in credentials, sessions and old access permissions are excluded.
        </p>
        {workspace.role !== 'owner' ? (
          <p>Workspace owner access is required to restore a backup.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor={`${id}-file`}>Workspace backup JSON</label>
              <input
                id={`${id}-file`}
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-name`}>New workspace name</label>
              <input
                id={`${id}-name`}
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
              />
            </div>
            <Button disabled={busy || !file || !name.trim()} onClick={() => setConfirm(true)}>
              Review restore
            </Button>
          </>
        )}
      </Panel>
      <Panel>
        <h2>Filtered record export</h2>
        <p>
          JSON preserves exact values. CSV uses quoted, spreadsheet-safe cells. Trade dates use
          record creation time; execution/cash dates use activity time; strategy dates use effective
          publication time; review dates use revision time. The interval includes the opening
          boundary and excludes the closing boundary.
        </p>
        <div className="field">
          <label htmlFor={`${id}-kind`}>Records</label>
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={(event) => setKind(event.target.value as PortableExportRequest['kind'])}
          >
            {['trades', 'executions', 'cash', 'strategies', 'reviews', 'analytics'].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-format`}>Format</label>
          <select
            id={`${id}-format`}
            value={format}
            onChange={(event) => setFormat(event.target.value as 'json' | 'csv')}
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </div>
        {kind === 'analytics' ? (
          <div className="field">
            <label htmlFor={`${id}-analytics`}>Analytics calculation context JSON</label>
            <textarea
              id={`${id}-analytics`}
              value={analytics}
              onChange={(event) => setAnalytics(event.target.value)}
              rows={8}
            />
            <p>
              Use the same account, currency, interval, source priorities and freshness settings as
              the analytics report.
            </p>
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor={`${id}-from`}>From (UTC, ISO timestamp)</label>
              <input
                id={`${id}-from`}
                value={from}
                placeholder="2025-01-01T00:00:00Z"
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-to`}>Until (UTC, ISO timestamp)</label>
              <input
                id={`${id}-to`}
                value={to}
                placeholder="2026-01-01T00:00:00Z"
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <details>
              <summary>Account and record identity filters</summary>
              <div className="field">
                <label htmlFor={`${id}-accounts`}>Account IDs (comma separated, optional)</label>
                <input
                  id={`${id}-accounts`}
                  value={accounts}
                  onChange={(event) => setAccounts(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`${id}-ids`}>Record IDs (comma separated, optional)</label>
                <input
                  id={`${id}-ids`}
                  value={ids}
                  onChange={(event) => setIds(event.target.value)}
                />
              </div>
            </details>
          </>
        )}
        <Button disabled={busy} onClick={() => void exportRecords()}>
          Export selected records
        </Button>
      </Panel>
      <ConfirmDialog
        open={confirm}
        title="Restore a separate workspace?"
        description={
          <p>
            Restore {file?.name} as “{name}”. Existing workspace data stays available. The new
            workspace becomes available only after verification passes.
          </p>
        }
        confirmLabel="Restore and verify"
        busy={busy}
        onConfirm={() => void restore()}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
