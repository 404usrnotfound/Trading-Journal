'use client';

import {
  STRATEGY_ATTACHMENT_MAXIMUM_BYTES,
  strategyAttachmentListResponseSchema,
  strategyAttachmentMediaTypeSchema,
  strategyAttachmentNameSchema,
  strategyAttachmentResponseSchema,
  type JournalReviewDefinition,
  type StrategyAttachment,
} from '@journal/contracts';
import { Button } from '@journal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState, type ChangeEvent } from 'react';
import { sessionProof } from '../strategies/strategy-api';
import { JournalApiError, journalErrorMessage, journalRead } from './journal-api';

type Evidence = JournalReviewDefinition['attachments'][number];
const phases = ['before', 'during', 'after'] as const;

export function JournalAttachments({
  workspaceId,
  attachments,
  editable,
  onChange,
  onUploadingChange,
}: {
  workspaceId: string;
  attachments: Evidence[];
  editable: boolean;
  onChange: (attachments: Evidence[]) => void;
  onUploadingChange: (value: boolean) => void;
}) {
  const prefix = `/api/v1/workspaces/${workspaceId}/journal-attachments`;
  const id = useId();
  const client = useQueryClient();
  const metadata = useQuery({
    queryKey: ['journal-attachments', workspaceId],
    queryFn: () => journalRead(`${prefix}?limit=100`, strategyAttachmentListResponseSchema),
  });
  const [phase, setPhase] = useState<Evidence['phase']>('before');
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Record<string, StrategyAttachment>>({});
  const command = useRef<{ file: File; phase: Evidence['phase']; id: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || uploading) return;
    setFailure(null);
    if (
      !strategyAttachmentMediaTypeSchema.safeParse(file.type).success ||
      !strategyAttachmentNameSchema.safeParse(file.name).success ||
      file.size === 0 ||
      file.size > STRATEGY_ATTACHMENT_MAXIMUM_BYTES
    ) {
      setFailure(
        'Choose a PNG, JPEG, WEBP or PDF up to 10 MiB with a filename of 120 characters or fewer.',
      );
      event.target.value = '';
      return;
    }
    if (command.current?.file !== file) command.current = { file, phase, id: crypto.randomUUID() };
    setUploading(true);
    onUploadingChange(true);
    try {
      const proof = await sessionProof();
      const response = await fetch(prefix, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name),
          'X-CSRF-Token': proof,
          'Idempotency-Key': command.current.id,
        },
        body: file,
      });
      if (!response.ok) throw new JournalApiError(response.status);
      const value = strategyAttachmentResponseSchema.parse(await response.json());
      setUploaded((previous) => ({ ...previous, [value.id]: value }));
      onChange([...attachments, { attachmentId: value.id, phase: command.current.phase }]);
      command.current = null;
      if (input.current) input.current.value = '';
      await client.invalidateQueries({ queryKey: ['journal-attachments', workspaceId] });
    } catch (error) {
      setFailure(journalErrorMessage(error));
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  }

  return (
    <section className="journal-section" aria-labelledby={`${id}-heading`}>
      <div className="journal-section-heading">
        <h3 id={`${id}-heading`}>Screenshots &amp; evidence</h3>
        <span className="journal-source">Private files · Manual phase</span>
      </div>
      <p className="journal-help">
        Phase labels describe your review. They do not certify when an image was captured. Saved
        revisions keep their evidence.
      </p>
      {editable && (
        <div className="journal-upload">
          <div className="journal-field">
            <label htmlFor={`${id}-phase`}>Screenshot phase</label>
            <select
              id={`${id}-phase`}
              value={phase}
              onChange={(event) => setPhase(event.target.value as Evidence['phase'])}
              disabled={uploading}
            >
              {phases.map((value) => (
                <option key={value} value={value}>
                  {value[0]?.toUpperCase()}
                  {value.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="journal-field">
            <label htmlFor={`${id}-file`}>Upload screenshot or document</label>
            <input
              id={`${id}-file`}
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(event) => void upload(event)}
              disabled={uploading || attachments.length >= 100}
            />
            <small>PNG, JPEG, WEBP or PDF · 10 MiB maximum.</small>
          </div>
        </div>
      )}
      {uploading && <p role="status">Uploading private evidence…</p>}
      {failure && (
        <p role="alert" className="form-error">
          {failure}
          <Button
            variant="quiet"
            onClick={() => {
              if (input.current)
                void upload({ target: input.current } as ChangeEvent<HTMLInputElement>);
            }}
          >
            Retry upload
          </Button>
        </p>
      )}
      {metadata.isError && attachments.length > 0 && (
        <p role="alert" className="form-error">
          File names could not be loaded. The private download links remain available.
        </p>
      )}
      <div className="journal-evidence-grid">
        {phases.map((value) => (
          <div className="journal-evidence-phase" key={value}>
            <h4>
              {value[0]?.toUpperCase()}
              {value.slice(1)}
            </h4>
            {attachments.some((attachment) => attachment.phase === value) ? (
              <ul>
                {attachments
                  .filter((attachment) => attachment.phase === value)
                  .map((attachment) => {
                    const file =
                      uploaded[attachment.attachmentId] ??
                      metadata.data?.find((entry) => entry.id === attachment.attachmentId);
                    return (
                      <li key={attachment.attachmentId}>
                        <a
                          href={`${prefix}/${attachment.attachmentId}`}
                          download={file?.name ?? true}
                        >
                          {file?.name ?? `Download evidence ${attachment.attachmentId}`}
                        </a>
                        {editable && (
                          <Button
                            variant="quiet"
                            disabled={uploading}
                            onClick={() =>
                              onChange(
                                attachments.filter(
                                  (entry) => entry.attachmentId !== attachment.attachmentId,
                                ),
                              )
                            }
                          >
                            Remove {file?.name ?? 'evidence'} from draft
                          </Button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="journal-help">No evidence added.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
