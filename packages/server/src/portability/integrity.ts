import { createHash } from 'node:crypto';
import {
  PORTABLE_MAXIMUM_BYTES,
  PORTABLE_MAXIMUM_ROWS,
  portableArchiveSchema,
  type PortableArchive,
} from '@journal/contracts';
import { DATABASE_SCHEMA_VERSION } from '@journal/database';
import { FINANCIAL_CALCULATION_MANIFEST } from '@journal/domain';
import { ApplicationError } from '../errors.js';
import { PORTABLE_TABLES } from './tables.js';

export function portabilityError(detail: string, code = 'INVALID_WORKSPACE_ARCHIVE') {
  return new ApplicationError(422, code, 'Workspace archive rejected', detail);
}
export function stablePortableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stablePortableJson).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, child]) => `${JSON.stringify(key)}:${stablePortableJson(child)}`)
    .join(',')}}`;
}
export function portableHash(value: unknown): string {
  return createHash('sha256').update(stablePortableJson(value)).digest('hex');
}
export function byteHash(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
/** Bound depth before recursive contract validation, including direct service callers. */
export function inspectPortableJson(value: unknown) {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++nodes > 2_000_000 || item.depth > 48)
      throw portabilityError('The archive exceeds the structural limit.');
    if (item.value && typeof item.value === 'object') {
      for (const [key, child] of Object.entries(item.value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key))
          throw portabilityError('Reserved JSON field in archive.');
        pending.push({ value: child, depth: item.depth + 1 });
      }
    }
  }
  if (Buffer.byteLength(JSON.stringify(value)) > PORTABLE_MAXIMUM_BYTES)
    throw portabilityError('The archive exceeds 64 MiB.');
}
export function validateArchive(value: unknown): PortableArchive {
  inspectPortableJson(value);
  const archive = portableArchiveSchema.parse(value);
  if (
    archive.schemaVersion !== DATABASE_SCHEMA_VERSION ||
    portableHash(archive.calculationManifest) !== portableHash(FINANCIAL_CALCULATION_MANIFEST)
  )
    throw portabilityError(
      'This archive requires another schema or calculation version. Restore it with the matching application release.',
      'INCOMPATIBLE_WORKSPACE_ARCHIVE',
    );
  const { sha256, ...body } = archive;
  if (portableHash(body) !== sha256) throw portabilityError('The archive checksum does not match.');
  const names = new Set<string>();
  let count = 0;
  for (const table of archive.tables) {
    if (!(PORTABLE_TABLES as readonly string[]).includes(table.name) || names.has(table.name))
      throw portabilityError('Unknown or duplicate archive collection.');
    names.add(table.name);
    count += table.rows.length;
    if (count > PORTABLE_MAXIMUM_ROWS)
      throw portabilityError('The archive exceeds 100,000 records.');
    if (portableHash(table.rows) !== table.sha256)
      throw portabilityError(`Checksum mismatch for ${table.name}.`);
    for (const row of table.rows)
      if (row.workspace_id !== archive.sourceWorkspace.id)
        throw portabilityError('Archive records must belong to its declared source workspace.');
  }
  const objects = new Set<string>();
  let mediaBytes = 0;
  for (const media of archive.media) {
    const bytes = Buffer.from(media.contentBase64, 'base64');
    if (
      objects.has(media.objectId) ||
      bytes.toString('base64') !== media.contentBase64 ||
      bytes.length !== media.size ||
      byteHash(bytes) !== media.sha256
    )
      throw portabilityError('Private media is duplicated, malformed or has an invalid checksum.');
    objects.add(media.objectId);
    mediaBytes += bytes.length;
    if (mediaBytes > 48 * 1024 * 1024)
      throw portabilityError('Expanded private media exceeds 48 MiB.');
  }
  const files = archive.tables.find((table) => table.name === 'strategy_attachments')?.rows ?? [];
  const ready = files.filter((row) => row.state === 'ready');
  if (ready.length !== archive.media.length)
    throw portabilityError(
      'A media-complete archive must contain every ready attachment exactly once.',
    );
  for (const file of ready) {
    const media = archive.media.find((item) => item.objectId === file.id);
    if (!media || media.sha256 !== file.sha256 || media.size !== file.size)
      throw portabilityError(
        'A ready attachment is missing or differs from its recorded evidence.',
      );
  }
  return archive;
}

/** Rebind workspace references, while preserving domain identities and original opaque actors. */
export function rebindWorkspace(value: unknown, source: string, target: string): unknown {
  if (Array.isArray(value)) return value.map((child) => rebindWorkspace(child, source, target));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        ['workspace_id', 'workspaceId'].includes(key) && child === source
          ? target
          : rebindWorkspace(child, source, target),
      ]),
    );
  return value;
}
