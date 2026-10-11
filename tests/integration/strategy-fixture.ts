import { randomUUID } from 'node:crypto';
import { createDatabase, type Database } from '@journal/database';
import {
  createServerServices,
  parseServerConfig,
  type AuthorizationContext,
  type ServerServices,
} from '@journal/server';

export const strategyTestOrigin = 'http://localhost:3000';
const password = 'strategy-test-isolated-passphrase-42';
type Person = Awaited<ReturnType<ServerServices['bootstrapOwner']>>;
export type StrategyTestActor = {
  person: Person;
  cookie: string;
  csrf: string;
  context: AuthorizationContext;
};

export async function createStrategyFixture() {
  if (!process.env.TEST_DATABASE_URL) throw new Error('Dedicated test PostgreSQL is required');
  const admin: Database = createDatabase(process.env.TEST_DATABASE_URL);
  const services = createServerServices(
    parseServerConfig({
      NODE_ENV: 'test',
      APP_ORIGIN: strategyTestOrigin,
      DATABASE_URL: process.env.TEST_APP_DATABASE_URL,
      AUTH_DATABASE_URL: process.env.TEST_AUTH_DATABASE_URL,
      JOB_DATABASE_URL: process.env.TEST_JOB_DATABASE_URL,
      BETTER_AUTH_SECRET: 'strategy-test-secret-with-at-least-32-characters',
      LOG_LEVEL: 'silent',
    }),
  );
  const persons: Person[] = [];
  for (let index = 0; index < 4; index++)
    persons.push(
      await services.bootstrapOwner({
        email: `strategy-${randomUUID()}@example.test`,
        name: `Strategy actor ${index}`,
        password,
      }),
    );
  const [first, second, third, fourth] = persons;
  if (!first || !second || !third || !fourth) throw new Error('Strategy actors missing');
  await admin.pool.query(
    'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3),($1,$4,$5)',
    [first.workspace.id, second.user.id, 'viewer', third.user.id, 'editor'],
  );
  async function authenticate(
    person: Person,
    workspaceId: string,
    requiredRole: 'viewer' | 'editor',
  ): Promise<StrategyTestActor> {
    const login = await services.handleAuthRequest(
      new Request(`${strategyTestOrigin}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin: strategyTestOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ email: person.user.email, password }),
      }),
    );
    if (login.status !== 200) throw new Error('Strategy actor login failed');
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const session = await services.handleAuthRequest(
      new Request(`${strategyTestOrigin}/api/auth/session`, {
        headers: { cookie, origin: strategyTestOrigin },
      }),
    );
    const csrf = session.headers.get('x-csrf-token');
    if (!csrf) throw new Error('Strategy actor CSRF proof missing');
    const context = await services.authorizeWorkspace(
      new Request(`${strategyTestOrigin}/api/workspaces`, { headers: { cookie } }),
      workspaceId,
      requiredRole,
    );
    return { person, cookie, csrf, context };
  }
  const owner = await authenticate(first, first.workspace.id, 'editor');
  const viewer = await authenticate(second, first.workspace.id, 'viewer');
  const editor = await authenticate(third, first.workspace.id, 'editor');
  const outsider = await authenticate(fourth, fourth.workspace.id, 'editor');
  async function cleanup() {
    try {
      const client = await admin.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET CONSTRAINTS ALL DEFERRED');
        // Dedicated test administrator only; suppress immutable-fact guards for scoped teardown.
        await client.query('SET LOCAL session_replication_role = replica');
        const workspaceIds = persons.map((person) => person.workspace.id);
        for (const table of [
          'strategy_version_attachments',
          'trade_strategy_links',
          'strategy_commands',
          'strategy_versions',
          'strategies',
          'strategy_attachments',
          'instrument_versions',
          'instruments',
          'trades',
          'currency_convention_versions',
          'currencies',
          'outbox_events',
          'financial_commands',
          'financial_state',
        ])
          await client.query(`DELETE FROM app.${table} WHERE workspace_id=ANY($1::uuid[])`, [
            workspaceIds,
          ]);
        // Restore normal FK cascades for platform/auth ownership records.
        await client.query('SET LOCAL session_replication_role = origin');
        await client.query('DELETE FROM app.workspaces WHERE id=ANY($1::uuid[])', [workspaceIds]);
        const userIds = persons.map((person) => person.user.id);
        await client.query('DELETE FROM auth."user" WHERE id=ANY($1::text[])', [userIds]);
        await client.query(
          'DELETE FROM auth.security_events WHERE subject_user_id=ANY($1::text[])',
          [userIds],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } finally {
      await Promise.all([services.close(), admin.close()]);
    }
  }
  return { admin, services, owner, viewer, editor, outsider, cleanup };
}
