'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  accountingCorrectionSourcesResponseSchema,
  accountingMutationResponseSchema,
  reverseAccountingSourceRequestSchema,
  type WorkspaceResponse,
} from '@journal/contracts';
import { Button, Panel } from '@journal/ui';
import {
  FinancialWriteError,
  recordRead,
  recordWrite,
  retainedCommand,
} from '../record/record-api';

export function AccountCorrections({ workspace }: { workspace: WorkspaceResponse }) {
  const client = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [selection, setSelection] = useState('');
  const [reason, setReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const commands = useRef(new Map<string, { serialized: string; id: string }>());
  const prefix = `/api/v1/workspaces/${workspace.id}/accounting/corrections`;
  const sources = useQuery({
    queryKey: ['accounting-correction-sources', workspace.id, cursor],
    queryFn: () =>
      recordRead(
        `${prefix}?limit=25${cursor ? `&cursor=${cursor}` : ''}`,
        accountingCorrectionSourcesResponseSchema,
      ),
    enabled: workspace.role !== 'viewer' && !reviewing,
  });
  if (workspace.role === 'viewer') return null;
  const selected = sources.data?.items.find((item) => item.id === selection);
  const execute = async () => {
    if (!selected || !sources.data) return;
    try {
      setBusy(true);
      setMessage(null);
      const body = reverseAccountingSourceRequestSchema.parse({
        sourceType: selected.sourceType,
        expectedSourceRevision: sources.data.sourceRevision,
        reason,
      });
      await recordWrite(
        `${prefix}/${selected.id}/reverse`,
        body,
        accountingMutationResponseSchema,
        retainedCommand(commands.current, selected.id, body),
      );
      setUnknown(false);
      setReviewing(false);
      setSelection('');
      setReason('');
      setMessage(
        'Historical source reversed. Original evidence is retained. Record the corrected replacement using its original economic time.',
      );
      await client.invalidateQueries({ queryKey: ['accounting-correction-sources', workspace.id] });
      await client.invalidateQueries({ queryKey: ['accounting-report', workspace.id] });
    } catch (error) {
      setUnknown(error instanceof FinancialWriteError && error.outcome === 'unknown');
      setMessage(error instanceof Error ? error.message : 'The correction could not be confirmed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel>
      <h2>Correct historical account facts</h2>
      <p>
        Reverse an erroneous dividend, tax, expense or owned transfer at its original economic time.
        Linked withholding and received transfer legs reverse together. Genuine later refunds remain
        separate source records.
      </p>
      {sources.isError && <p role="alert">Historical sources could not be loaded.</p>}
      <fieldset disabled={busy || reviewing}>
        <label>
          Historical source
          <select
            aria-label="Historical accounting source"
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
          >
            <option value="">Choose a source</option>
            {sources.data?.items.map((item) => (
              <option key={item.id} value={item.id} disabled={item.reversed}>
                {item.kind} · {item.amount} · {item.economicAt} · {item.description || item.id}
                {item.reversed ? ' · reversed' : ''}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          disabled={!cursor}
          onClick={() => {
            setCursor(null);
            setSelection('');
          }}
        >
          First sources
        </Button>
        <Button
          variant="secondary"
          disabled={!sources.data?.nextCursor}
          onClick={() => {
            setCursor(sources.data!.nextCursor);
            setSelection('');
          }}
        >
          Next sources
        </Button>
        <label>
          Correction reason
          <textarea
            aria-label="Historical correction reason"
            value={reason}
            maxLength={2000}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <Button
          disabled={!selected || selected.reversed || !reason.trim()}
          onClick={() => {
            setReviewing(true);
            setMessage(null);
          }}
        >
          Review historical reversal
        </Button>
      </fieldset>
      {reviewing && selected && (
        <div>
          <p>
            Reverse {selected.kind} {selected.amount} recorded at {selected.economicAt}. This
            changes historical account reports, retains every original source and appends balanced
            reversals. Reason: {reason}
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              void execute();
            }}
          >
            {busy ? 'Confirming…' : 'Confirm historical reversal'}
          </Button>
          <Button
            variant="secondary"
            disabled={busy || unknown}
            onClick={() => setReviewing(false)}
          >
            Return to source fields
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </Panel>
  );
}
