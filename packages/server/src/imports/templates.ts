import { randomUUID } from 'node:crypto';
import { sql } from '@journal/database';
import * as c from '@journal/contracts';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import {
  financialFingerprint,
  financialConflict,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';
import type { ImportAdapterRegistry } from './adapters/registry.js';
const columns = sql.raw(`id,template_id AS "templateId",name,version,mapping,archived`);
export function createImportTemplates(
  platform: FinancialPlatform,
  registry: ImportAdapterRegistry,
) {
  async function save(
    context: AuthorizationContext,
    value: unknown,
    commandId: string,
    templateId?: string,
  ) {
    if (context.role === 'viewer' || context.requiredRole === 'viewer')
      throw financialInvalid('Editor access is required.');
    c.financialIdSchema.parse(commandId);
    if (templateId) c.financialIdSchema.parse(templateId);
    const input = c.importTemplateCreateSchema.parse(value),
      hash = financialFingerprint({ templateId: templateId ?? null, input });
    try {
      registry.get(input.mapping.adapterId, input.mapping.adapterVersion);
    } catch (error) {
      throw financialInvalid(
        error instanceof Error ? error.message : 'The mapping adapter is unavailable.',
      );
    }
    if (new TextEncoder().encode(JSON.stringify(input.mapping)).byteLength > 65536)
      throw financialInvalid('Mapping exceeds 64 KiB.');
    return platform.withWorkspaceContext(context, async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`import-templates:${context.workspaceId}`},0))`,
      );
      const [previous] = await queryRows(
        tx,
        sql`SELECT ${columns},request_hash FROM app.import_template_versions WHERE workspace_id=${context.workspaceId}::uuid AND id=${commandId}::uuid`,
      );
      if (previous) {
        if (previous.request_hash !== hash)
          throw financialConflict(
            'IDEMPOTENCY_CONFLICT',
            'This template command has different contents.',
          );
        return c.importTemplateResponseSchema.strip().parse(previous);
      }
      const [mappingSize] = await queryRows<{ bytes: number }>(
        tx,
        sql`SELECT octet_length(${JSON.stringify(input.mapping)}::jsonb::text) AS bytes`,
      );
      if (!mappingSize || mappingSize.bytes > 65536)
        throw financialInvalid('Mapping exceeds 64 KiB in stored JSON.');
      const [latest] = templateId
        ? await queryRows<{ version: number; archived: boolean }>(
            tx,
            sql`SELECT version,archived FROM app.import_template_versions WHERE workspace_id=${context.workspaceId}::uuid AND template_id=${templateId}::uuid ORDER BY version DESC LIMIT 1`,
          )
        : [];
      if (templateId && !latest) throw inaccessible();
      if ((input.expectedVersion ?? 0) !== (latest?.version ?? 0) || latest?.archived)
        throw financialConflict(
          'IMPORT_TEMPLATE_REVISION_CONFLICT',
          'Reload the current template before saving.',
        );
      const identity = templateId ?? randomUUID(),
        version = (latest?.version ?? 0) + 1;
      await tx.execute(
        sql`INSERT INTO app.import_template_versions(workspace_id,id,template_id,version,name,mapping,archived,request_hash) VALUES(${context.workspaceId}::uuid,${commandId}::uuid,${identity}::uuid,${version},${input.name},${JSON.stringify(input.mapping)}::jsonb,${input.archived},${hash})`,
      );
      await tx.execute(
        sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action,request_id) VALUES(${context.workspaceId}::uuid,${randomUUID()}::uuid,${context.actorId},'import.template_saved',${context.requestId})`,
      );
      return c.importTemplateResponseSchema.parse({
        id: commandId,
        templateId: identity,
        version,
        name: input.name,
        mapping: input.mapping,
        archived: input.archived,
      });
    });
  }
  async function list(context: AuthorizationContext) {
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const items = await queryRows(
          tx,
          sql`SELECT ${columns} FROM (SELECT DISTINCT ON(template_id) * FROM app.import_template_versions WHERE workspace_id=${context.workspaceId}::uuid ORDER BY template_id,version DESC) t ORDER BY name,id LIMIT 101`,
        );
        if (items.length > 100)
          throw financialConflict(
            'IMPORT_CATALOG_TOO_LARGE',
            'The synchronous template list supports at most 100 templates.',
          );
        return c.importTemplatesResponseSchema.parse({ items });
      },
      { accessMode: 'read only' },
    );
  }
  async function catalog(context: AuthorizationContext) {
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const accounts = await queryRows(
          tx,
          sql`SELECT a.id,a.name,b.source_namespace AS namespace FROM app.accounts a LEFT JOIN app.brokers b ON b.workspace_id=a.workspace_id AND b.id=a.broker_id WHERE a.workspace_id=${context.workspaceId}::uuid AND a.status='active' ORDER BY a.name,a.id LIMIT 501`,
        );
        const currencies = await queryRows(
          tx,
          sql`SELECT id,name,code FROM app.currencies WHERE workspace_id=${context.workspaceId}::uuid AND archived_at IS NULL ORDER BY code,id LIMIT 501`,
        );
        const instruments = await queryRows(
          tx,
          sql`SELECT i.id,i.name || ' · v' || v.version::text AS name,v.id AS "versionId" FROM app.instruments i JOIN app.instrument_versions v ON v.workspace_id=i.workspace_id AND v.instrument_id=i.id WHERE i.workspace_id=${context.workspaceId}::uuid AND i.archived_at IS NULL ORDER BY i.name,i.id LIMIT 501`,
        );
        if ([accounts, currencies, instruments].some((rows) => rows.length > 500))
          throw financialConflict(
            'IMPORT_CATALOG_TOO_LARGE',
            'The synchronous mapping catalog supports at most 500 entries per collection.',
          );
        return c.importCatalogResponseSchema.parse({
          accounts,
          currencies,
          instruments,
          adapters: registry.list(),
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  return { save, list, catalog };
}
