import { createHash, randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import {
  STRATEGY_ATTACHMENT_MAXIMUM_BYTES,
  strategyAttachmentMediaTypeSchema,
  strategyAttachmentNameSchema,
  strategyAttachmentResponseSchema,
  type StrategyAttachment,
  type StrategyAttachmentMediaType,
} from '@journal/contracts';
import { z } from 'zod';
import { ApplicationError, inaccessible } from '../errors.js';
import type { AuthorizationContext, ServerServices } from '../services.js';
import { PrivateStorageError, type PrivateFileStore } from '../storage.js';

type AttachmentRow = {
  id: string;
  workspace_id: string;
  actor_id: string;
  command_id: string;
  payload_sha256: string;
  name: string;
  media_type: StrategyAttachmentMediaType;
  size: number;
  sha256: string;
  storage_key: string;
  state: 'pending' | 'ready' | 'removed';
  created_at: Date | string;
};
type Platform = Pick<ServerServices, 'withWorkspaceContext'>;
const uuid = z.uuidv4().transform((value) => value.toLowerCase());
const columns = sql`id,workspace_id,actor_id,command_id,payload_sha256,name,media_type,size,sha256,storage_key,state,created_at`;

function conflict(code: string, detail: string): ApplicationError {
  return new ApplicationError(409, code, 'Attachment operation rejected', detail);
}
function storageUnavailable(): ApplicationError {
  return new ApplicationError(
    503,
    'ATTACHMENT_STORAGE_UNAVAILABLE',
    'Attachment unavailable',
    'The private file could not be verified. Retry later.',
  );
}
function requireEditor(context: AuthorizationContext) {
  if (context.requiredRole === 'viewer' || context.role === 'viewer')
    throw new ApplicationError(
      403,
      'FORBIDDEN',
      'Action not permitted',
      'Editor access is required.',
    );
}
function metadata(row: AttachmentRow): StrategyAttachment {
  return strategyAttachmentResponseSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    mediaType: row.media_type,
    size: row.size,
    sha256: row.sha256,
    createdAt: new Date(row.created_at).toISOString(),
  });
}
async function lockWorkspace(tx: DbTransaction, workspaceId: string) {
  // The strategy command layer uses this same mutex. Editors cannot FOR UPDATE
  // app.workspaces because its UPDATE policy deliberately requires an owner.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(1791763200,hashtext(${workspaceId}::text))`);
}
async function audit(tx: DbTransaction, context: AuthorizationContext, action: string) {
  await tx.execute(sql`INSERT INTO app.audit_events(workspace_id,actor_id,action,request_id)
    VALUES(${context.workspaceId},${context.actorId},${action},${context.requestId})`);
}
function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function validPng(body: Buffer): boolean {
  if (
    body.length < 45 ||
    !body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    body.readUInt32BE(8) !== 13 ||
    body.toString('ascii', 12, 16) !== 'IHDR' ||
    body.readUInt32BE(16) === 0 ||
    body.readUInt32BE(20) === 0
  )
    return false;
  let offset = 8;
  let imageData = false;
  while (offset + 12 <= body.length) {
    const length = body.readUInt32BE(offset);
    if (length > body.length - offset - 12) return false;
    const type = body.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT' && length > 0) imageData = true;
    offset += length + 12;
    if (type === 'IEND')
      return (
        imageData &&
        length === 0 &&
        offset === body.length &&
        body.subarray(-4).equals(Buffer.from([174, 66, 96, 130]))
      );
  }
  return false;
}

function validJpeg(body: Buffer): boolean {
  if (
    body.length < 4 ||
    body[0] !== 255 ||
    body[1] !== 216 ||
    body[body.length - 2] !== 255 ||
    body[body.length - 1] !== 217
  )
    return false;
  let offset = 2;
  let frame = false;
  while (offset + 4 <= body.length) {
    if (body[offset] !== 255) return false;
    while (body[offset] === 255) offset += 1;
    const marker = body[offset++];
    if (
      marker === undefined ||
      marker === 0 ||
      marker === 216 ||
      marker === 217 ||
      offset + 2 > body.length
    )
      return false;
    const length = body.readUInt16BE(offset);
    if (length < 2 || offset + length > body.length - 2) return false;
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8 || body.readUInt16BE(offset + 3) === 0 || body.readUInt16BE(offset + 5) === 0)
        return false;
      frame = true;
    }
    if (marker === 218) return frame && offset + length < body.length - 2;
    offset += length;
  }
  return false;
}

function validWebp(body: Buffer): boolean {
  if (
    body.length < 20 ||
    body.toString('ascii', 0, 4) !== 'RIFF' ||
    body.readUInt32LE(4) + 8 !== body.length ||
    body.toString('ascii', 8, 12) !== 'WEBP' ||
    !['VP8 ', 'VP8L', 'VP8X'].includes(body.toString('ascii', 12, 16))
  )
    return false;
  let offset = 12;
  let imageData = false;
  while (offset + 8 <= body.length) {
    const type = body.toString('ascii', offset, offset + 4);
    const length = body.readUInt32LE(offset + 4);
    if (length > body.length - offset - 8) return false;
    if (type === 'VP8 ') {
      if (length < 10 || !body.subarray(offset + 11, offset + 14).equals(Buffer.from([157, 1, 42])))
        return false;
      imageData = true;
    }
    if (type === 'VP8L') {
      if (length < 5 || body[offset + 8] !== 47) return false;
      imageData = true;
    }
    offset += 8 + length + (length % 2);
  }
  return imageData && offset === body.length;
}

/** Validate the binary signature and container envelope, rather than trusting MIME/extension. */
export function validateStrategyAttachmentBytes(
  bytes: Uint8Array,
  claimedMediaType: string,
): StrategyAttachmentMediaType {
  const mediaType = strategyAttachmentMediaTypeSchema.parse(claimedMediaType);
  if (bytes.byteLength < 1 || bytes.byteLength > STRATEGY_ATTACHMENT_MAXIMUM_BYTES)
    throw new ApplicationError(
      413,
      'INPUT_TOO_LARGE',
      'Invalid attachment size',
      'Use a file between 1 byte and 10 MiB.',
    );
  const body = Buffer.from(bytes);
  let valid = false;
  if (mediaType === 'image/png') {
    valid = validPng(body);
  } else if (mediaType === 'image/jpeg') {
    valid = validJpeg(body);
  } else if (mediaType === 'image/webp') {
    valid = validWebp(body);
  } else {
    valid =
      /^%PDF-[12]\.[0-9]/u.test(body.toString('ascii', 0, 8)) &&
      /%%EOF\s*$/u.test(body.subarray(-1024).toString('ascii'));
  }
  if (!valid)
    throw new ApplicationError(
      415,
      'INVALID_ATTACHMENT_CONTENT',
      'Invalid attachment content',
      'The file bytes must match a supported PNG, JPEG, WebP or PDF format.',
    );
  return mediaType;
}

/**
 * Durable pending reservation -> immutable bytes -> ready transition. A crash or
 * ambiguous commit never triggers deletion of potentially committed bytes. The
 * same idempotency key resumes a pending upload; removed reservations are final.
 */
export function createStrategyAttachmentServices(platform: Platform, store: PrivateFileStore) {
  async function verifiedBytes(row: AttachmentRow): Promise<Uint8Array> {
    try {
      const bytes = await store.read({ workspaceId: row.workspace_id, objectId: row.storage_key });
      if (bytes.byteLength !== row.size || checksum(bytes) !== row.sha256)
        throw storageUnavailable();
      return bytes;
    } catch {
      throw storageUnavailable();
    }
  }

  async function list(context: AuthorizationContext, limit = 100): Promise<StrategyAttachment[]> {
    z.number().int().min(1).max(100).parse(limit);
    return platform.withWorkspaceContext(context, async (tx) => {
      const result =
        await tx.execute<AttachmentRow>(sql`SELECT ${columns} FROM app.strategy_attachments
        WHERE workspace_id=${context.workspaceId} AND state='ready'
        ORDER BY created_at DESC,id LIMIT ${limit}`);
      return result.rows.map(metadata);
    });
  }

  async function upload(
    context: AuthorizationContext,
    input: { commandId: string; name: string; mediaType: string; bytes: Uint8Array },
  ): Promise<StrategyAttachment> {
    requireEditor(context);
    const commandId = uuid.parse(input.commandId);
    const name = strategyAttachmentNameSchema.parse(input.name);
    const mediaType = validateStrategyAttachmentBytes(input.bytes, input.mediaType);
    const sha256 = checksum(input.bytes);
    const size = input.bytes.byteLength;
    const payload = checksum(Buffer.from(JSON.stringify({ name, mediaType, size, sha256 })));
    const reserved = await platform.withWorkspaceContext(context, async (tx) => {
      await lockWorkspace(tx, context.workspaceId);
      const result =
        await tx.execute<AttachmentRow>(sql`SELECT ${columns} FROM app.strategy_attachments
        WHERE workspace_id=${context.workspaceId} AND command_id=${commandId} FOR UPDATE`);
      const previous = result.rows[0];
      if (previous) {
        if (previous.payload_sha256 !== payload)
          throw conflict(
            'IDEMPOTENCY_CONFLICT',
            'The upload key was already used with a different file or filename.',
          );
        if (previous.state === 'removed')
          throw conflict('ATTACHMENT_REMOVED', 'This upload was removed. Use a new upload key.');
        return previous;
      }
      const id = randomUUID();
      const inserted = await tx.execute<AttachmentRow>(sql`INSERT INTO app.strategy_attachments
        (workspace_id,id,actor_id,command_id,payload_sha256,name,media_type,size,sha256,storage_key,state)
        VALUES(${context.workspaceId},${id},${context.actorId},${commandId},${payload},${name},${mediaType},${size},${sha256},${id},'pending')
        RETURNING ${columns}`);
      await audit(tx, context, 'strategy.attachment-upload-reserved');
      return inserted.rows[0]!;
    });
    if (reserved.state === 'ready') {
      await verifiedBytes(reserved);
      return metadata(reserved);
    }
    try {
      await store.write(
        { workspaceId: context.workspaceId, objectId: reserved.storage_key },
        input.bytes,
      );
    } catch (error) {
      if (!(error instanceof PrivateStorageError) || error.code !== 'ALREADY_EXISTS')
        throw storageUnavailable();
    }
    await verifiedBytes(reserved);
    return platform.withWorkspaceContext(context, async (tx) => {
      await lockWorkspace(tx, context.workspaceId);
      const result =
        await tx.execute<AttachmentRow>(sql`SELECT ${columns} FROM app.strategy_attachments
        WHERE workspace_id=${context.workspaceId} AND id=${reserved.id} FOR UPDATE`);
      const current = result.rows[0];
      if (!current || current.state === 'removed')
        throw conflict('ATTACHMENT_REMOVED', 'This upload was removed before publication.');
      if (current.state === 'ready') return metadata(current);
      const ready =
        await tx.execute<AttachmentRow>(sql`UPDATE app.strategy_attachments SET state='ready',ready_at=now()
        WHERE workspace_id=${context.workspaceId} AND id=${current.id} RETURNING ${columns}`);
      await audit(tx, context, 'strategy.attachment-uploaded');
      return metadata(ready.rows[0]!);
    });
  }

  async function download(context: AuthorizationContext, attachmentId: string) {
    const id = uuid.parse(attachmentId);
    return platform.withWorkspaceContext(context, async (tx) => {
      const result =
        await tx.execute<AttachmentRow>(sql`SELECT ${columns} FROM app.strategy_attachments
        WHERE workspace_id=${context.workspaceId} AND id=${id} AND state='ready'`);
      const row = result.rows[0];
      if (!row) throw inaccessible();
      return { attachment: metadata(row), bytes: await verifiedBytes(row) };
    });
  }

  async function remove(context: AuthorizationContext, attachmentId: string): Promise<void> {
    requireEditor(context);
    const id = uuid.parse(attachmentId);
    const row = await platform.withWorkspaceContext(context, async (tx) => {
      await lockWorkspace(tx, context.workspaceId);
      const result =
        await tx.execute<AttachmentRow>(sql`SELECT ${columns} FROM app.strategy_attachments
        WHERE workspace_id=${context.workspaceId} AND id=${id} FOR UPDATE`);
      const current = result.rows[0];
      if (!current) throw inaccessible();
      const references = await tx.execute(sql`SELECT 1 FROM app.strategy_version_attachments
        WHERE workspace_id=${context.workspaceId} AND attachment_id=${id} LIMIT 1`);
      if (references.rows.length > 0)
        throw conflict(
          'ATTACHMENT_REFERENCED',
          'An immutable strategy version references this file. Remove it from a new version to stop displaying it there; its historical file must remain available.',
        );
      if (current.state !== 'removed') {
        await tx.execute(sql`UPDATE app.strategy_attachments SET state='removed',removed_at=now()
          WHERE workspace_id=${context.workspaceId} AND id=${id}`);
        await audit(tx, context, 'strategy.attachment-removed');
      }
      return current;
    });
    // The tombstone commits first. A failed delete leaves private, unserved bytes
    // and can be retried; it cannot publish a dangling ready attachment.
    try {
      await store.delete({ workspaceId: row.workspace_id, objectId: row.storage_key });
    } catch {
      throw storageUnavailable();
    }
  }

  return { list, upload, download, remove };
}
