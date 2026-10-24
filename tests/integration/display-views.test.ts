import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '@journal/database';
import {
  defaultDisplayViewSettings,
  displayViewSettingsSchema,
} from '../../packages/contracts/src/display-views.js';
import { createDisplayViewServices } from '../../packages/server/src/display-views/service.js';
import { createDisplayViewApi } from '../../packages/server/src/display-views/api.js';
import { createAccountingFixture } from './accounting-fixture.js';
describe('private per-member saved display preferences on restricted PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>,
    views: ReturnType<typeof createDisplayViewServices>;
  const journal = (name = 'Open reviews') =>
    displayViewSettingsSchema.parse({
      screen: 'journal',
      columns: ['title', 'status'],
      views: [
        {
          id: randomUUID(),
          name,
          filters: {
            search: 'review',
            status: 'open',
            includeArchived: 'false',
            period: 'all',
            from: '',
            to: '',
            accountId: '',
          },
        },
      ],
    });
  beforeAll(async () => {
    fixture = await createAccountingFixture();
    views = createDisplayViewServices(fixture.services);
  }, 60000);
  afterAll(async () => {
    await Promise.all([fixture?.services.close(), fixture?.admin.close()]);
  });
  it('persists filters/columns across service recreation and isolates members in the same workspace and other tenants', async () => {
    const before = await fixture.admin.pool.query(
      'SELECT count(*)::int n FROM app.ledger_events WHERE workspace_id=$1',
      [fixture.owner.context.workspaceId],
    );
    const settings = journal(),
      first = await views.write(fixture.owner.context, 'journal', {
        expectedRevision: 0,
        settings,
      });
    expect(first).toEqual({ revision: 1, settings });
    expect(
      await createDisplayViewServices(fixture.services).read(fixture.owner.context, 'journal'),
    ).toEqual(first);
    expect((await views.read(fixture.viewer.context, 'journal')).settings.views).toEqual([]);
    expect((await views.read(fixture.outsider.context, 'journal')).settings.views).toEqual([]);
    const hidden = await fixture.services.withWorkspaceContext(fixture.viewer.context, (tx) =>
      tx.execute(
        sql`SELECT saved_views FROM app.user_preferences WHERE workspace_id=${fixture.owner.context.workspaceId} AND user_id=${fixture.owner.context.actorId}`,
      ),
    );
    expect(hidden.rows).toHaveLength(0);
    expect(
      (
        await fixture.admin.pool.query(
          'SELECT count(*)::int n FROM app.ledger_events WHERE workspace_id=$1',
          [fixture.owner.context.workspaceId],
        )
      ).rows,
    ).toEqual(before.rows);
    expect(
      await fixture.services.withWorkspaceContext(fixture.owner.context, (tx) =>
        tx
          .execute(
            sql`SELECT name FROM app.portable_workspace_tables() WHERE name='user_preferences'`,
          )
          .then((result) => result.rows),
      ),
    ).toHaveLength(0);
  });
  it('preserves other screens, handles uncertain retries, and rejects stale/concurrent preference overwrites', async () => {
    const current = await views.read(fixture.owner.context, 'journal'),
      same = { expectedRevision: current.revision - 1, settings: current.settings };
    expect(await views.write(fixture.owner.context, 'journal', same)).toEqual(current);
    await expect(
      views.write(fixture.owner.context, 'journal', {
        expectedRevision: 0,
        settings: journal('Stale replacement'),
      }),
    ).rejects.toMatchObject({ status: 409 });
    const strategy = defaultDisplayViewSettings('strategies');
    strategy.columns = ['name', 'version'];
    await views.write(fixture.owner.context, 'strategies', {
      expectedRevision: current.revision,
      settings: strategy,
    });
    expect((await views.read(fixture.owner.context, 'journal')).settings).toEqual(current.settings);
    const latest = await views.read(fixture.owner.context, 'journal');
    const outcomes = await Promise.allSettled([
      views.write(fixture.owner.context, 'journal', {
        expectedRevision: latest.revision,
        settings: journal('First replacement'),
      }),
      views.write(fixture.owner.context, 'journal', {
        expectedRevision: latest.revision,
        settings: journal('Second replacement'),
      }),
    ]);
    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
  });
  it('allows viewers to save only their private settings and enforces CSRF and workspace authorization at HTTP boundaries', async () => {
    const api = createDisplayViewApi(fixture.services),
      workspace = fixture.owner.context.workspaceId;
    const request = (csrf: boolean) =>
      new Request(`http://localhost:3000/api/v1/workspaces/${workspace}/display-views/journal`, {
        method: 'POST',
        headers: {
          cookie: fixture.viewer.cookie,
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          ...(csrf ? { 'x-csrf-token': fixture.viewer.csrf } : {}),
        },
        body: JSON.stringify({ expectedRevision: 0, settings: journal('Viewer private review') }),
      });
    await expect(api(request(false), workspace, 'journal')).rejects.toMatchObject({ status: 403 });
    const response = await api(request(true), workspace, 'journal');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await views.read(fixture.viewer.context, 'journal')).settings.views[0]!.name).toBe(
      'Viewer private review',
    );
    expect((await views.read(fixture.owner.context, 'journal')).settings.views[0]!.name).not.toBe(
      'Viewer private review',
    );
    await expect(
      api(
        new Request(`http://localhost:3000/api/v1/workspaces/${workspace}/display-views/journal`, {
          headers: { cookie: fixture.outsider.cookie },
        }),
        workspace,
        'journal',
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      views.write(fixture.viewer.context, 'strategies', {
        expectedRevision: 1,
        settings: journal(),
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
