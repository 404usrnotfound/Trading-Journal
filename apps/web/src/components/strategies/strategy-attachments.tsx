'use client';

import {
  STRATEGY_ATTACHMENT_MAXIMUM_BYTES,
  strategyAttachmentListResponseSchema,
  strategyAttachmentMediaTypeSchema,
  strategyAttachmentNameSchema,
  strategyAttachmentResponseSchema,
  type StrategyAttachment,
} from '@journal/contracts';
import { Button } from '@journal/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent } from 'react';
import { sessionProof, StrategyApiError, strategyErrorMessage, strategyRead } from './strategy-api';

export function StrategyAttachments({
  workspaceId,
  attachmentIds,
  editable = false,
  onChange,
  onUploadingChange,
}: {
  workspaceId: string;
  attachmentIds: string[];
  editable?: boolean;
  onChange?: (ids: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const prefix = `/api/v1/workspaces/${workspaceId}/strategy-attachments`;
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['strategy-attachments', workspaceId],
    queryFn: () => strategyRead(`${prefix}?limit=100`, strategyAttachmentListResponseSchema),
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Record<string, StrategyAttachment>>({});
  const uploadCommand = useRef<{ file: File; id: string } | null>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || uploading) return;
    setError(null);
    if (
      !strategyAttachmentMediaTypeSchema.safeParse(file.type).success ||
      !strategyAttachmentNameSchema.safeParse(file.name).success ||
      file.size === 0 ||
      file.size > STRATEGY_ATTACHMENT_MAXIMUM_BYTES
    ) {
      setError(
        'Choose a PNG, JPEG, WEBP or PDF up to 10 MiB with a filename of 120 characters or fewer.',
      );
      event.target.value = '';
      return;
    }
    if (uploadCommand.current?.file !== file)
      uploadCommand.current = { file, id: crypto.randomUUID() };
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const proof = await sessionProof();
      const response = await fetch(prefix, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': file.type,
          'X-File-Name': encodeURIComponent(file.name),
          'Idempotency-Key': uploadCommand.current.id,
          'X-CSRF-Token': proof,
        },
        body: file,
      });
      if (!response.ok) throw new StrategyApiError(response.status);
      const attachment = strategyAttachmentResponseSchema.parse(await response.json());
      setUploaded((previous) => ({ ...previous, [attachment.id]: attachment }));
      onChange?.([...attachmentIds, attachment.id]);
      await client.invalidateQueries({ queryKey: ['strategy-attachments', workspaceId] });
    } catch (failure) {
      setError(strategyErrorMessage(failure));
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      event.target.value = '';
    }
  }

  return (
    <div>
      {editable && (
        <div className="strategy-field">
          <label htmlFor="strategy-attachment-upload">
            Upload screenshot or reference document
          </label>
          <input
            id="strategy-attachment-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(event) => void upload(event)}
            disabled={uploading || attachmentIds.length >= 100}
          />
          <small>
            PNG, JPEG, WEBP or PDF, up to 10 MiB. Uploaded files become part of this version when
            you save.
          </small>
        </div>
      )}
      {uploading && (
        <p role="status" className="strategy-status">
          Uploading attachment…
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {query.isError && attachmentIds.length > 0 && (
        <p role="alert" className="form-error">
          Attachment names could not be loaded. You can retry their downloads.
        </p>
      )}
      {attachmentIds.length === 0 ? (
        <p className="strategy-readonly-note">No attachments in this version.</p>
      ) : (
        <ul className="strategy-attachment-list">
          {attachmentIds.map((id) => {
            const metadata = uploaded[id] ?? query.data?.find((attachment) => attachment.id === id);
            return (
              <li key={id}>
                <a href={`${prefix}/${id}`}>{metadata?.name ?? `Download attachment ${id}`}</a>
                {metadata && (
                  <span className="muted">
                    {' '}
                    · {metadata.mediaType} · {Math.ceil(metadata.size / 1024)} KiB
                  </span>
                )}
                {editable && (
                  <Button
                    variant="quiet"
                    disabled={uploading}
                    onClick={() => onChange?.(attachmentIds.filter((entry) => entry !== id))}
                  >
                    Remove {metadata?.name ?? 'attachment'} from this version
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
