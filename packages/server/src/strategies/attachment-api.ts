import {
  STRATEGY_ATTACHMENT_MAXIMUM_BYTES,
  strategyAttachmentListQuerySchema,
  strategyAttachmentListResponseSchema,
  strategyAttachmentMediaTypeSchema,
  strategyAttachmentNameSchema,
  strategyAttachmentResponseSchema,
} from '@journal/contracts';
import { z } from 'zod';
import { getServerConfig } from '../config.js';
import { ApplicationError } from '../errors.js';
import type { ServerServices } from '../services.js';
import { createPrivateFileStore, type PrivateFileStore } from '../storage.js';
import { createStrategyAttachmentServices } from './attachments.js';

type Platform = Pick<
  ServerServices,
  'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
>;

export async function readStrategyAttachmentBody(request: Request): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (
    length !== null &&
    (!/^\d{1,12}$/u.test(length) || Number(length) > STRATEGY_ATTACHMENT_MAXIMUM_BYTES)
  )
    throw new ApplicationError(
      413,
      'INPUT_TOO_LARGE',
      'Request too large',
      'The attachment exceeds 10 MiB.',
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApplicationError(
      400,
      'INVALID_ATTACHMENT_CONTENT',
      'File required',
      'Send the binary attachment body.',
    );
  // Retain fixed-size blocks rather than one object per untrusted body chunk.
  // Even millions of tiny/empty chunks cannot grow upload metadata without
  // contributing bytes. Partial final blocks are excluded from the result.
  const blockBytes = 64 * 1024;
  const chunks: Buffer[] = [];
  let block: Buffer | undefined;
  let blockOffset = 0;
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (size + next.value.byteLength > STRATEGY_ATTACHMENT_MAXIMUM_BYTES) {
        await reader.cancel();
        throw new ApplicationError(
          413,
          'INPUT_TOO_LARGE',
          'Request too large',
          'The attachment exceeds 10 MiB.',
        );
      }
      let offset = 0;
      while (offset < next.value.byteLength) {
        if (!block || blockOffset === block.length) {
          block = Buffer.allocUnsafe(
            Math.min(blockBytes, STRATEGY_ATTACHMENT_MAXIMUM_BYTES - size),
          );
          chunks.push(block);
          blockOffset = 0;
        }
        const count = Math.min(block.length - blockOffset, next.value.byteLength - offset);
        block.set(next.value.subarray(offset, offset + count), blockOffset);
        offset += count;
        blockOffset += count;
        size += count;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export function strategyAttachmentDisposition(name: string, mediaType: string): string {
  const safe = strategyAttachmentNameSchema.parse(name);
  const fallback = safe.replace(/[^\x20-\x7e]|["\\]/gu, '_');
  const encoded = encodeURIComponent(safe).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${mediaType === 'application/pdf' ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function createStrategyAttachmentApi(
  platform: Platform,
  options: { store?: PrivateFileStore } = {},
) {
  let attachments: ReturnType<typeof createStrategyAttachmentServices> | undefined;
  function services() {
    attachments ??= createStrategyAttachmentServices(
      platform,
      options.store ??
        createPrivateFileStore(getServerConfig().storageRoot, {
          maximumBytes: STRATEGY_ATTACHMENT_MAXIMUM_BYTES,
        }),
    );
    return attachments;
  }
  return async (
    request: Request,
    workspaceId: string,
    attachmentId?: string,
  ): Promise<Response> => {
    z.uuidv4().parse(workspaceId);
    if (attachmentId !== undefined) z.uuidv4().parse(attachmentId);
    const read = request.method === 'GET';
    if (!read && request.method !== 'POST' && request.method !== 'DELETE')
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Use GET, POST or DELETE for this resource.',
      );
    if (!read) await platform.requireMutationSession(request);
    const context = await platform.authorizeWorkspace(
      request,
      workspaceId.toLowerCase(),
      read ? 'viewer' : 'editor',
    );
    const headers = { 'cache-control': 'private, no-store' };
    if (read) {
      if (attachmentId === undefined) {
        const query = strategyAttachmentListQuerySchema.parse(
          Object.fromEntries(new URL(request.url).searchParams),
        );
        return Response.json(
          strategyAttachmentListResponseSchema.parse(await services().list(context, query.limit)),
          { headers },
        );
      }
      if (new URL(request.url).searchParams.size !== 0)
        throw new ApplicationError(
          400,
          'INVALID_REQUEST',
          'Invalid request',
          'Attachment downloads do not accept query parameters.',
        );
      const { attachment, bytes } = await services().download(context, attachmentId);
      return new Response(Buffer.from(bytes), {
        headers: {
          ...headers,
          'content-type': attachment.mediaType,
          'content-length': String(attachment.size),
          'content-disposition': strategyAttachmentDisposition(
            attachment.name,
            attachment.mediaType,
          ),
          'content-security-policy': "default-src 'none'; sandbox",
          'x-content-type-options': 'nosniff',
          'cross-origin-resource-policy': 'same-origin',
        },
      });
    }
    if (request.method === 'DELETE' && attachmentId !== undefined) {
      await services().remove(context, attachmentId);
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST' || attachmentId !== undefined)
      throw new ApplicationError(
        405,
        'METHOD_NOT_ALLOWED',
        'Method not allowed',
        'Upload to the collection or delete an attachment by ID.',
      );
    const mediaType = strategyAttachmentMediaTypeSchema.safeParse(
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase(),
    );
    if (!mediaType.success)
      throw new ApplicationError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Unsupported file',
        'Upload a PNG, JPEG, WebP or PDF.',
      );
    const commandId = z.uuidv4().parse(request.headers.get('idempotency-key'));
    const fileName = request.headers.get('x-file-name');
    if (!fileName || fileName.length > 1440)
      throw new ApplicationError(
        400,
        'INVALID_FILE_NAME',
        'Invalid filename',
        'Send a URI-component encoded X-File-Name of at most 120 characters.',
      );
    let name: string;
    try {
      name = strategyAttachmentNameSchema.parse(decodeURIComponent(fileName));
    } catch {
      throw new ApplicationError(
        400,
        'INVALID_FILE_NAME',
        'Invalid filename',
        'Use a display filename without paths or control characters.',
      );
    }
    const attachment = await services().upload(context, {
      commandId,
      name,
      mediaType: mediaType.data,
      bytes: await readStrategyAttachmentBody(request),
    });
    return Response.json(strategyAttachmentResponseSchema.parse(attachment), {
      status: 201,
      headers,
    });
  };
}
