import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPrivateFileStore, DEFAULT_PRIVATE_FILE_LIMIT } from '@journal/server/storage';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'journal-private-storage-'));
  roots.push(root);
  return {
    root,
    store: createPrivateFileStore(root),
    key: { workspaceId: randomUUID(), objectId: randomUUID() },
  };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('private immutable filesystem foundation', () => {
  it('round-trips scoped bytes with exact checksum/size and private permissions', async () => {
    const { root, store, key } = await fixture();
    const bytes = Buffer.from('private infrastructure fixture');
    const saved = await store.write(key, bytes);
    expect(saved).toEqual({
      ...key,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(Buffer.from(await store.read(key))).toEqual(bytes);
    expect((await stat(join(root, key.workspaceId))).mode & 0o777).toBe(0o700);
    expect((await stat(join(root, key.workspaceId, key.objectId))).mode & 0o777).toBe(0o600);
    await expect(store.read({ ...key, workspaceId: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await store.delete(key);
    await store.delete(key);
    await expect(store.read(key)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('blocks overwriting an accepted object and leaves its original bytes intact', async () => {
    const { store, key } = await fixture();
    await store.write(key, Buffer.from('original'));
    await expect(store.write(key, Buffer.from('replacement'))).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
    });
    expect(Buffer.from(await store.read(key)).toString()).toBe('original');
  });

  it('rejects traversal, non-UUID keys, public roots, and oversized bytes before writing', async () => {
    const { root, store, key } = await fixture();
    for (const bad of [
      { ...key, workspaceId: '../outside' },
      { ...key, objectId: '../../outside' },
      { ...key, objectId: '/etc/passwd' },
    ]) {
      await expect(store.write(bad, Buffer.from('fixture'))).rejects.toMatchObject({
        code: 'INVALID_KEY',
      });
    }
    expect(() => createPrivateFileStore(join(root, 'public', 'private'))).toThrow();
    for (const directory of ['.next', 'dist', 'build'])
      expect(() => createPrivateFileStore(join(root, directory, 'private'))).toThrow();
    await expect(
      store.write(key, new Uint8Array(DEFAULT_PRIVATE_FILE_LIMIT + 1)),
    ).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
  });

  it('refuses symlink roots, workspace directories and object leaves', async () => {
    const { root, store, key } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), 'journal-storage-outside-'));
    roots.push(outside);
    const alias = join(outside, 'root-link');
    await symlink(root, alias);
    await expect(
      createPrivateFileStore(alias).write(key, Buffer.from('fixture')),
    ).rejects.toMatchObject({ code: 'UNSAFE_STORAGE_PATH' });
    await symlink(outside, join(root, key.workspaceId));
    await expect(store.write(key, Buffer.from('fixture'))).rejects.toMatchObject({
      code: 'UNSAFE_STORAGE_PATH',
    });
    await rm(join(root, key.workspaceId));
    await mkdir(join(root, key.workspaceId), { mode: 0o700 });
    const externalFile = join(outside, 'untouched');
    await writeFile(externalFile, 'outside fixture', { mode: 0o600 });
    await symlink(externalFile, join(root, key.workspaceId, key.objectId));
    await expect(store.read(key)).rejects.toMatchObject({ code: 'UNSAFE_STORAGE_PATH' });
    await expect(store.delete(key)).rejects.toMatchObject({ code: 'UNSAFE_STORAGE_PATH' });
    await expect(store.write(key, Buffer.from('replacement'))).rejects.toMatchObject({
      code: 'UNSAFE_STORAGE_PATH',
    });
  });
});
