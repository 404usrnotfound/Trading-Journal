import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { strategyAttachmentResponseSchema, strategyDefinitionSchema } from '@journal/contracts';
import { createDatabase, type Database } from '@journal/database';
import {
  createServerServices,
  createStrategyAttachmentApi,
  createStrategyAttachmentServices,
  createStrategyServices,
  parseServerConfig,
  toProblemResponse,
  type ServerServices,
} from '@journal/server';
import {
  createPrivateFileStore,
  PrivateStorageError,
  type PrivateFileStore,
} from '@journal/server/storage';
import { grayscalePng } from '../helpers/attachment-images.js';

const origin = 'http://localhost:3000';
const password = 'strategy-attachment-isolated-fixture-passphrase-42';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVYAAAAASUVORK5CYII=',
  'base64',
);
type Actor = {
  person: Awaited<ReturnType<ServerServices['bootstrapOwner']>>;
  cookie: string;
  csrf: string;
};
type Options = {
  actor?: Actor | null;
  workspaceId?: string;
  commandId?: string;
  name?: string;
  mediaType?: string;
  csrf?: string | null;
  api?: ReturnType<typeof createStrategyAttachmentApi>;
};

describe('private immutable strategy attachments with PostgreSQL, sessions and real filesystem bytes', () => {
  let admin: Database;
  let platform: ServerServices;
  let root: string;
  let store: PrivateFileStore;
  let api: ReturnType<typeof createStrategyAttachmentApi>;
  let owner: Actor;
  let editor: Actor;
  let viewer: Actor;
  let outsider: Actor;

  async function authenticate(person: Actor['person']): Promise<Actor> {
    const login = await platform.handleAuthRequest(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: person.user.email, password }),
      }),
    );
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const session = await platform.handleAuthRequest(
      new Request(`${origin}/api/auth/session`, { headers: { cookie, origin } }),
    );
    const csrf = session.headers.get('x-csrf-token');
    if (!csrf) throw new Error('An authenticated session-bound CSRF proof is required');
    return { person, cookie, csrf };
  }

  async function request(
    method: string,
    attachmentId?: string,
    bytes?: Uint8Array,
    options: Options = {},
  ) {
    const actor = options.actor === undefined ? owner : options.actor;
    const workspaceId = options.workspaceId ?? owner.person.workspace.id;
    const headers = new Headers({ origin });
    if (actor) headers.set('cookie', actor.cookie);
    if (method !== 'GET') {
      const csrf = options.csrf === undefined ? actor?.csrf : options.csrf;
      if (csrf) headers.set('x-csrf-token', csrf);
      headers.set('idempotency-key', options.commandId ?? randomUUID());
    }
    if (bytes !== undefined) {
      headers.set('content-type', options.mediaType ?? 'image/png');
      headers.set('x-file-name', encodeURIComponent(options.name ?? 'entry.png'));
    }
    const raw = new Request(
      `${origin}/api/v1/workspaces/${workspaceId}/strategy-attachments${attachmentId ? `/${attachmentId}` : ''}`,
      { method, headers, ...(bytes === undefined ? {} : { body: Buffer.from(bytes) }) },
    );
    try {
      return await (options.api ?? api)(raw, workspaceId, attachmentId);
    } catch (error) {
      return toProblemResponse(error, 'strategy-attachments-fixture');
    }
  }

  async function upload(bytes = png, options: Options = {}) {
    const response = await request('POST', undefined, bytes, options);
    const body: unknown = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(201);
    return strategyAttachmentResponseSchema.parse(body);
  }

  async function mutationContext() {
    return platform.authorizeWorkspace(
      new Request(origin, { headers: { cookie: owner.cookie } }),
      owner.person.workspace.id,
      'editor',
    );
  }

  async function row(commandId: string) {
    const result = await admin.pool.query<{ id: string; state: string; payload_sha256: string }>(
      'SELECT id,state,payload_sha256 FROM app.strategy_attachments WHERE workspace_id=$1 AND command_id=$2',
      [owner.person.workspace.id, commandId],
    );
    return result.rows[0];
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('Dedicated test PostgreSQL is required');
    admin = createDatabase(process.env.TEST_DATABASE_URL);
    platform = createServerServices(
      parseServerConfig({
        NODE_ENV: 'test',
        APP_ORIGIN: origin,
        DATABASE_URL: process.env.TEST_APP_DATABASE_URL,
        AUTH_DATABASE_URL: process.env.TEST_AUTH_DATABASE_URL,
        JOB_DATABASE_URL: process.env.TEST_JOB_DATABASE_URL,
        BETTER_AUTH_SECRET: 'strategy-attachment-fixture-secret-at-least-32-characters',
        LOG_LEVEL: 'silent',
      }),
    );
    root = await mkdtemp(join(tmpdir(), 'journal-strategy-attachments-'));
    store = createPrivateFileStore(root, { maximumBytes: 10 * 1024 * 1024 });
    api = createStrategyAttachmentApi(platform, { store });
    const actors: Actor[] = [];
    for (const name of ['owner', 'editor', 'viewer', 'outsider']) {
      const person = await platform.bootstrapOwner({
        email: `strategy-attachment-${name}-${randomUUID()}@example.test`,
        name: `Attachment ${name}`,
        password,
      });
      actors.push(await authenticate(person));
    }
    [owner, editor, viewer, outsider] = actors as [Actor, Actor, Actor, Actor];
    await admin.pool.query(
      'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3),($1,$4,$5)',
      [owner.person.workspace.id, editor.person.user.id, 'editor', viewer.person.user.id, 'viewer'],
    );
  });
  afterAll(async () => {
    if (platform) await platform.close();
    if (admin) await admin.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('stores actual immutable bytes with restricted permissions and safely serves them to a workspace viewer', async () => {
    const attachment = await upload(png, { actor: editor, name: 'RSI été "entry".png' });
    expect(attachment).toMatchObject({
      workspaceId: owner.person.workspace.id,
      name: 'RSI été "entry".png',
      mediaType: 'image/png',
      size: png.length,
      sha256: createHash('sha256').update(png).digest('hex'),
    });
    expect((await stat(join(root, attachment.workspaceId, attachment.id))).mode & 0o777).toBe(
      0o600,
    );
    const response = await request('GET', attachment.id, undefined, { actor: viewer });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''RSI%20%C3%A9t%C3%A9",
    );
    const listed = await request('GET');
    expect(await listed.json()).toEqual(expect.arrayContaining([attachment]));
  });

  it('downloads PDF files rather than executing their active content in the application origin', async () => {
    const pdf = Buffer.from(
      '%PDF-1.7\n1 0 obj\n<< /JavaScript (private fixture) >>\nendobj\n%%EOF\n',
    );
    const attachment = await upload(pdf, { mediaType: 'application/pdf', name: 'playbook.pdf' });
    const response = await request('GET', attachment.id);
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/u);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
  });

  it('rejects MIME spoofing, path/control names and unsupported types before reserving an upload', async () => {
    for (const options of [
      { mediaType: 'image/jpeg' },
      { mediaType: 'image/svg+xml' },
      { name: '../private.png' },
      { name: 'path\\private.png' },
      { name: 'bad\r\nX: value.png' },
      { name: 'a'.repeat(121) },
    ]) {
      const commandId = randomUUID();
      const response = await request('POST', undefined, png, { ...options, commandId });
      expect([400, 415]).toContain(response.status);
      expect(await row(commandId)).toBeUndefined();
    }
  });

  it('rejects a highly compressed oversized image before reserving metadata or publishing private bytes', async () => {
    const commandId = randomUUID();
    const response = await request('POST', undefined, grayscalePng(6144, 4096), { commandId });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'IMAGE_DIMENSIONS_EXCEEDED' });
    expect(await row(commandId)).toBeUndefined();
  });

  it('blocks oversized images accepted under a legacy policy while retaining their immutable private history', async () => {
    const bytes = grayscalePng(6144, 4096);
    const id = randomUUID();
    const commandId = randomUUID();
    const workspaceId = owner.person.workspace.id;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const payload = createHash('sha256')
      .update(
        JSON.stringify({ name: 'legacy.png', mediaType: 'image/png', size: bytes.length, sha256 }),
      )
      .digest('hex');
    // Operator fixture models a file accepted before the pixel limit existed;
    // normal upload validation, immutable triggers and runtime grants stay intact.
    await admin.pool.query(
      `INSERT INTO app.strategy_attachments
        (workspace_id,id,actor_id,command_id,payload_sha256,name,media_type,size,sha256,storage_key,state)
        VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5,'legacy.png','image/png',$6,$7,$2::uuid::text,'pending')`,
      [workspaceId, id, owner.person.user.id, commandId, payload, bytes.length, sha256],
    );
    await store.write({ workspaceId, objectId: id }, bytes);
    await admin.pool.query(
      "UPDATE app.strategy_attachments SET state='ready',ready_at=now() WHERE workspace_id=$1 AND id=$2",
      [workspaceId, id],
    );
    const response = await request('GET', id, undefined, { actor: viewer });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'IMAGE_DIMENSIONS_EXCEEDED' });
    expect((await row(commandId))?.state).toBe('ready');
    expect(Buffer.from(await store.read({ workspaceId, objectId: id }))).toEqual(bytes);
  });

  it('enforces sessions, CSRF, roles and workspace ownership for both bytes and metadata', async () => {
    const attachment = await upload();
    for (const options of [
      { actor: null },
      { csrf: null },
      { actor: viewer },
      { actor: outsider },
    ]) {
      const commandId = randomUUID();
      const response = await request('POST', undefined, png, { ...options, commandId });
      expect([401, 403, 404]).toContain(response.status);
      expect(await row(commandId)).toBeUndefined();
    }
    expect((await request('GET', attachment.id, undefined, { actor: null })).status).toBe(401);
    expect((await request('GET', attachment.id, undefined, { actor: outsider })).status).toBe(404);
    expect(
      (
        await request('GET', attachment.id, undefined, {
          workspaceId: outsider.person.workspace.id,
          actor: outsider,
        })
      ).status,
    ).toBe(404);
    expect((await request('DELETE', attachment.id, undefined, { actor: viewer })).status).toBe(403);
  });

  it('serializes concurrent retries and rejects changed filenames or file hashes under the same idempotency key', async () => {
    const commandId = randomUUID();
    const [a, b] = await Promise.all([upload(png, { commandId }), upload(png, { commandId })]);
    expect(a).toEqual(b);
    const count = await admin.pool.query<{ count: string }>(
      'SELECT count(*)::text FROM app.strategy_attachments WHERE workspace_id=$1 AND command_id=$2',
      [owner.person.workspace.id, commandId],
    );
    expect(count.rows[0]?.count).toBe('1');
    expect(
      (await request('POST', undefined, png, { commandId, name: 'another-name.png' })).status,
    ).toBe(409);
    expect(
      (
        await request('POST', undefined, Buffer.from('%PDF-1.7\n%%EOF'), {
          commandId,
          mediaType: 'application/pdf',
        })
      ).status,
    ).toBe(409);
    expect(await upload(png, { commandId })).toEqual(a);
  });

  it('leaves a failed file write pending and resumes it without false ready metadata or overwrites', async () => {
    const commandId = randomUUID();
    const failingStore: PrivateFileStore = {
      ...store,
      write: async () => {
        throw new PrivateStorageError('STORAGE_FAILED');
      },
    };
    const failedApi = createStrategyAttachmentApi(platform, { store: failingStore });
    expect((await request('POST', undefined, png, { commandId, api: failedApi })).status).toBe(503);
    const pending = await row(commandId);
    expect(pending?.state).toBe('pending');
    expect((await request('GET', pending!.id)).status).toBe(404);
    const repaired = await upload(png, { commandId });
    expect(repaired.id).toBe(pending?.id);
    expect((await row(commandId))?.state).toBe('ready');
  });

  it('recovers a file publish that succeeded before its write result was lost', async () => {
    const commandId = randomUUID();
    const lostResultStore: PrivateFileStore = {
      ...store,
      write: async (key, bytes) => {
        await store.write(key, bytes);
        throw new PrivateStorageError('STORAGE_FAILED');
      },
    };
    expect(
      (
        await request('POST', undefined, png, {
          commandId,
          api: createStrategyAttachmentApi(platform, { store: lostResultStore }),
        })
      ).status,
    ).toBe(503);
    const pending = await row(commandId);
    expect(pending?.state).toBe('pending');
    expect((await upload(png, { commandId })).id).toBe(pending?.id);
    expect(
      Buffer.from(
        await store.read({ workspaceId: owner.person.workspace.id, objectId: pending!.id }),
      ),
    ).toEqual(png);
  });

  it('never deletes a committed ready file after an ambiguous database commit result', async () => {
    const commandId = randomUUID();
    let transactions = 0;
    const ambiguousPlatform: Pick<
      ServerServices,
      'authorizeWorkspace' | 'requireMutationSession' | 'withWorkspaceContext'
    > = {
      authorizeWorkspace: platform.authorizeWorkspace,
      requireMutationSession: platform.requireMutationSession,
      async withWorkspaceContext(context, callback, options) {
        const result = await platform.withWorkspaceContext(context, callback, options);
        transactions += 1;
        if (transactions === 2) throw new Error('Simulated loss after commit');
        return result;
      },
    };
    expect(
      (
        await request('POST', undefined, png, {
          commandId,
          api: createStrategyAttachmentApi(ambiguousPlatform, { store }),
        })
      ).status,
    ).toBe(500);
    const committed = await row(commandId);
    expect(committed?.state).toBe('ready');
    const retry = await upload(png, { commandId });
    expect(retry.id).toBe(committed?.id);
    expect((await request('GET', retry.id)).status).toBe(200);
  });

  it('rejects corrupted stored bytes instead of serving content with an accepted checksum', async () => {
    const attachment = await upload();
    await writeFile(
      join(root, attachment.workspaceId, attachment.id),
      Buffer.from('altered private bytes'),
      { mode: 0o600 },
    );
    const response = await request('GET', attachment.id);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'ATTACHMENT_STORAGE_UNAVAILABLE' });
    expect((await request('DELETE', attachment.id)).status).toBe(204);
  });

  it('commits a removal tombstone before filesystem cleanup and permits safe cleanup retries', async () => {
    const commandId = randomUUID();
    const attachment = await upload(png, { commandId });
    const deleteFailure: PrivateFileStore = {
      ...store,
      delete: async () => {
        throw new PrivateStorageError('STORAGE_FAILED');
      },
    };
    expect(
      (
        await request('DELETE', attachment.id, undefined, {
          api: createStrategyAttachmentApi(platform, { store: deleteFailure }),
        })
      ).status,
    ).toBe(503);
    expect((await row(commandId))?.state).toBe('removed');
    expect((await request('GET', attachment.id)).status).toBe(404);
    expect((await request('POST', undefined, png, { commandId })).status).toBe(409);
    expect((await request('DELETE', attachment.id)).status).toBe(204);
    await expect(
      store.read({ workspaceId: attachment.workspaceId, objectId: attachment.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('retains a historical attachment after a later strategy version removes it from its current definition', async () => {
    const attachment = await upload();
    const context = await mutationContext();
    const strategies = createStrategyServices(platform);
    const initial = await strategies.create(
      context,
      {
        definition: strategyDefinitionSchema.parse({
          name: 'Immutable attachment playbook',
          attachmentIds: [attachment.id],
        }),
        effectiveAt: '2026-01-01T00:00:00Z',
        changeReason: 'Initial playbook',
      },
      randomUUID(),
    );
    await strategies.update(
      context,
      initial.id,
      {
        definition: strategyDefinitionSchema.parse({
          name: 'Immutable attachment playbook',
          attachmentIds: [],
        }),
        effectiveAt: '2026-02-01T00:00:00Z',
        changeReason: 'Remove attachment from future rules',
        expectedRevision: initial.revision,
      },
      randomUUID(),
    );
    const removal = await request('DELETE', attachment.id);
    expect(removal.status).toBe(409);
    expect(await removal.json()).toMatchObject({ code: 'ATTACHMENT_REFERENCED' });
    expect((await request('GET', attachment.id, undefined, { actor: viewer })).status).toBe(200);
  });

  it('serializes linking a new immutable version against deletion so no dangling ready reference is possible', async () => {
    const attachment = await upload();
    const context = await mutationContext();
    const strategies = createStrategyServices(platform);
    const results = await Promise.allSettled([
      strategies.create(
        context,
        {
          definition: strategyDefinitionSchema.parse({
            name: 'Concurrent linked screenshot',
            attachmentIds: [attachment.id],
          }),
          effectiveAt: '2026-03-01T00:00:00Z',
          changeReason: 'Race fixture',
        },
        randomUUID(),
      ),
      createStrategyAttachmentServices(platform, store).remove(context, attachment.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const state = await admin.pool.query<{ state: string; references: string }>(
      'SELECT a.state,(SELECT count(*)::text FROM app.strategy_version_attachments l WHERE l.workspace_id=a.workspace_id AND l.attachment_id=a.id) AS references FROM app.strategy_attachments a WHERE a.workspace_id=$1 AND a.id=$2',
      [attachment.workspaceId, attachment.id],
    );
    expect(state.rows[0]).toEqual(
      results[0]?.status === 'fulfilled'
        ? { state: 'ready', references: '1' }
        : { state: 'removed', references: '0' },
    );
  });

  it('rechecks membership after authorization before a private file reservation', async () => {
    const requestBefore = new Request(origin, { headers: { cookie: editor.cookie } });
    const context = await platform.authorizeWorkspace(
      requestBefore,
      owner.person.workspace.id,
      'editor',
    );
    await admin.pool.query(
      "UPDATE app.workspace_memberships SET role='viewer' WHERE workspace_id=$1 AND user_id=$2",
      [owner.person.workspace.id, editor.person.user.id],
    );
    const commandId = randomUUID();
    await expect(
      createStrategyAttachmentServices(platform, store).upload(context, {
        commandId,
        name: 'forbidden.png',
        mediaType: 'image/png',
        bytes: png,
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await row(commandId)).toBeUndefined();
  });
});
