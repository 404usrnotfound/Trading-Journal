import { randomUUID } from 'node:crypto';
import { sql, DATABASE_SCHEMA_VERSION, type DbTransaction } from '@journal/database';
import {
  PORTABLE_FORMAT,
  PORTABLE_MAXIMUM_BYTES,
  PORTABLE_MAXIMUM_ROWS,
  portableExportRequestSchema,
  portableRestoreRequestSchema,
  portableRestoreResponseSchema,
  type PortableArchive,
} from '@journal/contracts';
import { FINANCIAL_CALCULATION_MANIFEST } from '@journal/domain';
import type { AuthorizationContext } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import { queryRows, type FinancialPlatform } from '../financial/repository.js';
import { replayBookAt } from '../financial/ledger.js';
import { createAnalyticsServices } from '../analytics/service.js';
import type { PrivateFileStore } from '../storage.js';
import { PORTABLE_TABLES } from './tables.js';
import {
  byteHash,
  inspectPortableJson,
  portabilityError,
  portableHash,
  rebindWorkspace,
  validateArchive,
} from './integrity.js';
import { filteredRows, serializeExport } from './exports.js';

async function supportedTables(tx: DbTransaction): Promise<string[]> {
  const tables = (
    await queryRows<{ name: string }>(tx, sql`SELECT name FROM app.portable_workspace_tables()`)
  )
    .map((row) => row.name)
    .sort();
  if (tables.some((name) => !(PORTABLE_TABLES as readonly string[]).includes(name)))
    throw portabilityError(
      'The database requires another portability release.',
      'INCOMPATIBLE_WORKSPACE_ARCHIVE',
    );
  return tables;
}

/** Independently replay source inventory and sum actual cash postings, retaining exact decimals. */
async function verification(tx: DbTransaction, context: AuthorizationContext) {
  const [state] = await queryRows<{ revision: number }>(
    tx,
    sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}::uuid`,
  );
  const revision = String(state?.revision ?? 0);
  const cash = await queryRows<{
    account_id: string;
    currency_id: string;
    category: string;
    amount: string;
  }>(
    tx,
    sql`
    SELECT b.account_id,b.currency_id,b.category,COALESCE(sum(p.amount),0)::text AS amount
    FROM app.cash_buckets b LEFT JOIN app.postings p ON p.workspace_id=b.workspace_id AND p.cash_bucket_id=b.id
    WHERE b.workspace_id=${context.workspaceId}::uuid GROUP BY b.account_id,b.currency_id,b.category ORDER BY b.account_id,b.currency_id,b.category`,
  );
  const books = await queryRows<{ id: string; account_id: string; instrument_version_id: string }>(
    tx,
    sql`
    SELECT id,account_id,instrument_version_id FROM app.holding_books WHERE workspace_id=${context.workspaceId}::uuid ORDER BY id`,
  );
  const inventory = [];
  for (const book of books) {
    const result = await replayBookAt(
      tx,
      context,
      { accountId: book.account_id, instrumentVersionId: book.instrument_version_id },
      '9999-12-31T23:59:59.999999Z',
      revision,
    );
    inventory.push({
      id: book.id,
      accountId: book.account_id,
      ...result,
      sourceRevision: revision,
    });
  }
  return { sourceRevision: revision, cash, inventory };
}

export function createPortabilityServices(platform: FinancialPlatform, store: PrivateFileStore) {
  async function backup(context: AuthorizationContext): Promise<PortableArchive> {
    if (context.role !== 'owner' || context.requiredRole === 'viewer')
      throw new ApplicationError(
        403,
        'FORBIDDEN',
        'Owner access required',
        'Only the current workspace owner can download a complete workspace backup.',
      );
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        // Shares the publication/file lifecycle mutex; immutable bytes stay present during capture.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(1791763200,hashtext(${context.workspaceId}::text))`,
        );
        const names = await supportedTables(tx);
        const [workspace] = await queryRows<{
          id: string;
          name: string;
          timezone: string;
          reporting_currency: string | null;
          created_at: string;
        }>(
          tx,
          sql`
        SELECT id,name,timezone,reporting_currency,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at FROM app.workspaces WHERE id=${context.workspaceId}::uuid`,
        );
        if (!workspace) throw inaccessible();
        const tables: PortableArchive['tables'] = [];
        let rowCount = 0,
          bytes = 0;
        for (const name of names) {
          const table = sql.raw(`app."${name}"`);
          // Reject before transferring/materializing a large relation in the web process.
          const [budget] = await queryRows<{ count: string; bytes: string }>(
            tx,
            sql`SELECT count(*)::text AS count,COALESCE(sum(octet_length(to_jsonb(t)::text)),0)::text AS bytes FROM ${table} t WHERE workspace_id=${context.workspaceId}::uuid`,
          );
          rowCount += Number(budget?.count ?? 0);
          bytes += Number(budget?.bytes ?? 0);
          if (rowCount > PORTABLE_MAXIMUM_ROWS || bytes > PORTABLE_MAXIMUM_BYTES / 2)
            throw portabilityError(
              'This workspace exceeds the portable archive record/byte budget. Use an operator backup for larger workspaces.',
              'WORKSPACE_ARCHIVE_TOO_LARGE',
            );
          const columns = await queryRows<{ name: string; generated: boolean; numeric: boolean }>(
            tx,
            sql`
          SELECT attname AS name,attgenerated<>'' AS generated,atttypid='numeric'::regtype AS numeric FROM pg_attribute
          WHERE attrelid=to_regclass(${`app.${name}`}) AND attnum>0 AND NOT attisdropped ORDER BY attnum`,
          );
          const generated = columns
            .filter((column) => column.generated)
            .map((column) => column.name);
          const decimalColumns = columns.filter((column) => column.numeric && !column.generated);
          const expression = sql`to_jsonb(t) - ${`{${generated.join(',')}}`}::text[]`;
          const decimals = decimalColumns.length
            ? sql` || jsonb_build_object(${sql.join(
                decimalColumns.flatMap((column) => [
                  sql`${column.name}`,
                  sql.raw(`t."${column.name}"::text`),
                ]),
                sql`,`,
              )})`
            : sql``;
          const rows = (
            await queryRows<{ row: PortableArchive['tables'][number]['rows'][number] }>(
              tx,
              sql`SELECT (${expression}${decimals}) AS row FROM ${table} t WHERE workspace_id=${context.workspaceId}::uuid ORDER BY to_jsonb(t)::text`,
            )
          ).map((row) => row.row);
          tables.push({ name, rows, sha256: portableHash(rows) });
        }
        const media: PortableArchive['media'] = [];
        const files = tables.find((table) => table.name === 'strategy_attachments')?.rows ?? [];
        for (const file of files.filter((row) => row.state === 'ready')) {
          const objectId = String(file.id),
            content = await store.read({ workspaceId: context.workspaceId, objectId });
          if (content.byteLength !== file.size || byteHash(content) !== file.sha256)
            throw portabilityError(
              'An attachment is missing or has changed. A media-complete backup cannot be created.',
              'WORKSPACE_MEDIA_UNAVAILABLE',
            );
          media.push({
            objectId,
            size: content.byteLength,
            sha256: byteHash(content),
            contentBase64: Buffer.from(content).toString('base64'),
          });
        }
        const body = {
          format: PORTABLE_FORMAT,
          schemaVersion: DATABASE_SCHEMA_VERSION,
          calculationManifest: FINANCIAL_CALCULATION_MANIFEST,
          sourceWorkspace: {
            id: workspace.id,
            name: workspace.name,
            timezone: workspace.timezone,
            reportingCurrency: workspace.reporting_currency,
            createdAt: workspace.created_at,
          },
          exportedAt: new Date().toISOString(),
          tables,
          media,
          verification: await verification(tx, context),
        };
        const archive = { ...body, sha256: portableHash(body) };
        return validateArchive(archive);
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async function restore(context: AuthorizationContext, value: unknown, commandId: string) {
    if (context.role !== 'owner' || context.requiredRole === 'viewer')
      throw new ApplicationError(
        403,
        'FORBIDDEN',
        'Owner access required',
        'Only the current workspace owner can restore into a new workspace.',
      );
    inspectPortableJson(value);
    const input = portableRestoreRequestSchema.parse(value),
      archive = validateArchive(input.archive);
    const target = randomUUID(),
      written: string[] = [];
    let completed = false;
    try {
      const result = await platform.withWorkspaceContext(context, async (tx) => {
        const expected = await supportedTables(tx);
        if (
          portableHash(expected) !== portableHash(archive.tables.map((table) => table.name).sort())
        )
          throw portabilityError(
            'The archive does not contain every supported application collection.',
          );
        const [old] = await queryRows<{ archive_sha256: string; result: unknown }>(
          tx,
          sql`SELECT archive_sha256,result FROM app.portable_restore_requests WHERE workspace_id=${context.workspaceId}::uuid AND command_id=${commandId}::uuid`,
        );
        if (old) {
          if (old.archive_sha256 !== archive.sha256)
            throw portabilityError(
              'This restore key was already used for another archive.',
              'IDEMPOTENCY_CONFLICT',
            );
          return portableRestoreResponseSchema.parse(old.result);
        }
        for (const media of archive.media) {
          await store.write(
            { workspaceId: target, objectId: media.objectId },
            Buffer.from(media.contentBase64, 'base64'),
          );
          written.push(media.objectId);
        }
        const rebound = {
          ...archive,
          tables: archive.tables.map((table) => ({
            ...table,
            rows: table.rows.map((row) => {
              const next = rebindWorkspace(row, archive.sourceWorkspace.id, target) as typeof row;
              next.workspace_id = archive.sourceWorkspace.id;
              if (table.name === 'strategy_attachments') next.storage_key = String(row.id);
              return next;
            }),
          })),
        };
        const [response] = await queryRows<{ result: unknown }>(
          tx,
          sql`SELECT app.restore_portable_workspace(${target}::uuid,${input.name},${commandId}::uuid,${archive.sha256},${JSON.stringify(rebound)}::jsonb) AS result`,
        );
        const restored = portableRestoreResponseSchema.parse(response?.result);
        if (restored.workspaceId !== target) return restored; // concurrent identical retry won the mutex
        const restoredContext = { ...context, workspaceId: target };
        const actual = await verification(tx, restoredContext);
        const expectedVerification = rebindWorkspace(
          archive.verification,
          archive.sourceWorkspace.id,
          target,
        );
        if (portableHash(actual) !== portableHash(expectedVerification))
          throw portabilityError(
            'Regenerated inventory or native cash differs from the archive verification. Nothing was restored.',
            'WORKSPACE_FIDELITY_MISMATCH',
          );
        // Constraints execute again after independent replay; failure rolls back the new namespace.
        await tx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
        return restored;
      });
      completed = result.workspaceId === target;
      return result;
    } finally {
      if (!completed)
        for (const objectId of written) await store.delete({ workspaceId: target, objectId });
    }
  }

  async function exportRecords(context: AuthorizationContext, value: unknown) {
    const input = portableExportRequestSchema.parse(value);
    const records =
      input.kind === 'analytics'
        ? [await createAnalyticsServices(platform).report(context, input.analytics!)]
        : await platform.withWorkspaceContext(context, (tx) => filteredRows(tx, context, input), {
            isolationLevel: 'repeatable read',
            accessMode: 'read only',
          });
    return serializeExport(input, records);
  }
  return { backup, restore, exportRecords };
}
