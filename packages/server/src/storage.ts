import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, link, unlink, type FileHandle } from 'node:fs/promises';
import { join, parse, resolve, sep } from 'node:path';

export const DEFAULT_PRIVATE_FILE_LIMIT = 20 * 1024 * 1024;
export type PrivateFileKey = Readonly<{ workspaceId: string; objectId: string }>;
export type StoredPrivateFile = PrivateFileKey & Readonly<{ size: number; sha256: string }>;
export interface PrivateFileStore {
  write(key: PrivateFileKey, bytes: Uint8Array): Promise<StoredPrivateFile>;
  read(key: PrivateFileKey): Promise<Uint8Array>;
  delete(key: PrivateFileKey): Promise<void>;
}

export class PrivateStorageError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_KEY'
      | 'UNSAFE_STORAGE_PATH'
      | 'INPUT_TOO_LARGE'
      | 'ALREADY_EXISTS'
      | 'NOT_FOUND'
      | 'STORAGE_FAILED',
  ) {
    super('The private storage operation could not be completed.');
    this.name = 'PrivateStorageError';
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function normalizeKey(key: PrivateFileKey): PrivateFileKey {
  if (!uuid.test(key.workspaceId) || !uuid.test(key.objectId))
    throw new PrivateStorageError('INVALID_KEY');
  return { workspaceId: key.workspaceId.toLowerCase(), objectId: key.objectId.toLowerCase() };
}
function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
function storageError(error: unknown): PrivateStorageError {
  if (error instanceof PrivateStorageError) return error;
  if (isMissing(error)) return new PrivateStorageError('NOT_FOUND');
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST')
    return new PrivateStorageError('ALREADY_EXISTS');
  return new PrivateStorageError('STORAGE_FAILED');
}

async function checkedDirectory(directory: string, create: boolean): Promise<void> {
  let cursor = parse(directory).root;
  for (const part of directory.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    try {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink() || !metadata.isDirectory())
        throw new PrivateStorageError('UNSAFE_STORAGE_PATH');
    } catch (error) {
      if (!create || !isMissing(error)) throw error;
      try {
        await mkdir(cursor, { mode: 0o700 });
      } catch (creationError) {
        if (!(
          typeof creationError === 'object' &&
          creationError !== null &&
          'code' in creationError &&
          creationError.code === 'EEXIST'
        ))
          throw creationError;
      }
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink() || !metadata.isDirectory())
        throw new PrivateStorageError('UNSAFE_STORAGE_PATH');
    }
  }
  if (((await lstat(directory)).mode & 0o077) !== 0)
    throw new PrivateStorageError('UNSAFE_STORAGE_PATH');
}

async function checkedObject(path: string, allowMissing = false): Promise<void> {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o077) !== 0)
      throw new PrivateStorageError('UNSAFE_STORAGE_PATH');
  } catch (error) {
    if (!allowMissing || !isMissing(error)) throw error;
  }
}

/**
 * POSIX local infrastructure only; callers must authorize workspace access first.
 * Root/ancestors must be operator-controlled, never publicly mounted or writable
 * by untrusted users. Checks reject existing symlinks, but do not claim protection
 * from a privileged same-UID process concurrently replacing ancestor directories.
 * No database reference or attachment workflow is created by this port.
 */
export function createPrivateFileStore(
  root: string,
  options: { maximumBytes?: number } = {},
): PrivateFileStore {
  const directory = resolve(root);
  if (
    !root.trim() ||
    directory === parse(directory).root ||
    directory.split(sep).some((part) => part.toLowerCase() === 'public')
  )
    throw new PrivateStorageError('UNSAFE_STORAGE_PATH');
  const maximumBytes = options.maximumBytes ?? DEFAULT_PRIVATE_FILE_LIMIT;
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > DEFAULT_PRIVATE_FILE_LIMIT
  )
    throw new PrivateStorageError('INPUT_TOO_LARGE');

  async function paths(input: PrivateFileKey, create: boolean) {
    const key = normalizeKey(input);
    await checkedDirectory(directory, create);
    const workspace = join(directory, key.workspaceId);
    await checkedDirectory(workspace, create);
    return { key, workspace, object: join(workspace, key.objectId) };
  }

  return {
    async write(input, bytes) {
      if (bytes.byteLength > maximumBytes) throw new PrivateStorageError('INPUT_TOO_LARGE');
      const content = Buffer.from(bytes);
      let handle: FileHandle | undefined;
      let stagingPath: string | undefined;
      try {
        const target = await paths(input, true);
        await checkedObject(target.object, true);
        const stagingDirectory = join(target.workspace, '.staging');
        await checkedDirectory(stagingDirectory, true);
        stagingPath = join(stagingDirectory, randomUUID());
        handle = await open(
          stagingPath,
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
          0o600,
        );
        await handle.writeFile(content);
        await handle.sync();
        await handle.close();
        handle = undefined;
        // Atomic publish without overwrite; the completed bytes share this volume.
        await link(stagingPath, target.object);
        const parent = await open(
          target.workspace,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        try {
          await parent.sync();
        } finally {
          await parent.close();
        }
        return {
          ...target.key,
          size: content.byteLength,
          sha256: createHash('sha256').update(content).digest('hex'),
        };
      } catch (error) {
        throw storageError(error);
      } finally {
        if (handle) await handle.close();
        if (stagingPath) await unlink(stagingPath).catch(() => undefined);
      }
    },
    async read(input) {
      let handle: FileHandle | undefined;
      try {
        const target = await paths(input, false);
        await checkedObject(target.object);
        handle = await open(
          target.object,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        const metadata = await handle.stat();
        if (!metadata.isFile()) throw new PrivateStorageError('UNSAFE_STORAGE_PATH');
        if (metadata.size > maximumBytes) throw new PrivateStorageError('INPUT_TOO_LARGE');
        const bytes = await handle.readFile();
        if (bytes.byteLength > maximumBytes) throw new PrivateStorageError('INPUT_TOO_LARGE');
        return bytes;
      } catch (error) {
        throw storageError(error);
      } finally {
        if (handle) await handle.close();
      }
    },
    async delete(input) {
      try {
        const target = await paths(input, false);
        await checkedObject(target.object);
        await unlink(target.object);
      } catch (error) {
        if (isMissing(error)) return;
        throw storageError(error);
      }
    },
  };
}
