import { createStrategyFixture } from './strategy-fixture.js';

/** Unique actor workspaces only; this operator cleanup never touches shared financial fixtures. */
export async function createJournalFinancialFixture() {
  const fixture = await createStrategyFixture();
  return {
    ...fixture,
    async cleanup() {
      const workspaceIds = [fixture.owner, fixture.viewer, fixture.editor, fixture.outsider].map(
        (actor) => actor.person.workspace.id,
      );
      const client = await fixture.admin.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL session_replication_role = replica');
        const tables = await client.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.columns WHERE table_schema='app'
            AND column_name='workspace_id' ORDER BY table_name`,
        );
        for (const row of tables.rows) {
          if (!/^[a-z_]+$/.test(row.table_name)) throw new Error('Unsafe cleanup table');
          await client.query(
            `DELETE FROM app.${row.table_name} WHERE workspace_id=ANY($1::uuid[])`,
            [workspaceIds],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      await fixture.cleanup();
    },
  };
}
