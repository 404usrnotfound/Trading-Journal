import { randomUUID, createHash } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import { z } from 'zod';
import * as c from '@journal/contracts';
import { FinancialArithmeticError, InventoryError } from '@journal/domain';
import type { AuthorizationContext } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import {
  financialConflict,
  financialFingerprint,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';
import { ImportAdapterRegistry } from './adapters/registry.js';
import { validateDraft, importIdentity, rowReferences, resolveReferences } from './normalize.js';
import { legacyImportSource } from './legacy-source.js';
import { importLedgerPort } from './ledger-port.js';

type Batch = z.infer<typeof c.importBatchResponseSchema> & {
  mapping: c.ImportMapping;
  sourceText: string;
};
type Row = c.ImportRowResponse & {
  identityKey: string | null;
  payloadHash: string | null;
  commandId: string;
  recordedCommandId: string | null;
};
type Claim = {
  recordedCommandId?: string | null;
  payloadHash: string;
  currentRowId: string;
  result: Record<string, unknown>;
  state: 'active' | 'reversed';
};
const batchColumns = sql.raw(
  `id,account_id AS "accountId",namespace,filename,file_hash AS "fileHash",adapter_id AS "adapterId",adapter_version AS "adapterVersion",revision,state,row_count AS "rowCount",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",preview,mapping,source_text AS "sourceText"`,
);
const rowColumns = sql.raw(
  `id,row_number AS "rowNumber",source_key AS "sourceKey",group_key AS "groupKey",source_id AS "sourceId",record_kind AS kind,raw_fields AS raw,payload,errors,warnings,status,result,identity_key AS "identityKey",payload_hash AS "payloadHash",command_id AS "commandId",recorded_command_id AS "recordedCommandId"`,
);
const json = (value: unknown) => JSON.stringify(value);
function requireEditor(context: AuthorizationContext) {
  if (context.role === 'viewer' || context.requiredRole === 'viewer')
    throw new ApplicationError(
      403,
      'FORBIDDEN',
      'Action not permitted',
      'Editor access is required for import review and commit.',
    );
}
function safeIssue(error: unknown): c.ImportRowResponse['errors'][number] {
  if (error instanceof z.ZodError)
    return {
      code: 'INVALID_FINANCIAL_ROW',
      message: error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
        .slice(0, 2000),
    };
  if (error instanceof ApplicationError && error.status < 500)
    return { code: error.code, message: error.detail.slice(0, 2000) };
  if (error instanceof InventoryError)
    return {
      code: 'INVENTORY_CONFLICT',
      message:
        'Review quantity, chronology, short permissions and lot/basis coverage for this group.',
    };
  if (
    error instanceof Error &&
    'cause' in error &&
    error.cause instanceof Error &&
    'code' in error.cause
  )
    return safeIssue(error.cause);
  if (error instanceof FinancialArithmeticError)
    return { code: error.code, message: error.message.slice(0, 2000) };
  if (
    error instanceof Error &&
    'code' in error &&
    ['23514', '23503', '23505', '22P02', '57014'].includes(String(error.code))
  )
    return {
      code: 'LEDGER_VALIDATION_FAILED',
      message:
        'The ledger rejected this group. Review financial references, precision and group size.',
    };
  throw error;
}
class DryRun extends Error {
  constructor(readonly rows: Row[]) {
    super('Dry run complete');
  }
}
export function createImportServices(
  platform: FinancialPlatform,
  registry = new ImportAdapterRegistry(),
) {
  async function readBatch(
    tx: DbTransaction,
    context: AuthorizationContext,
    id: string,
    lock = false,
  ): Promise<Batch> {
    const [batch] = await queryRows<Batch>(
      tx,
      sql`SELECT ${batchColumns} FROM app.import_batches WHERE workspace_id=${context.workspaceId}::uuid AND id=${c.financialIdSchema.parse(id)}::uuid ${lock ? sql`FOR UPDATE` : sql``}`,
    );
    if (!batch) throw inaccessible();
    return batch;
  }
  const readRows = (tx: DbTransaction, context: AuthorizationContext, id: string) =>
    queryRows<Row>(
      tx,
      sql`SELECT ${rowColumns} FROM app.import_rows WHERE workspace_id=${context.workspaceId}::uuid AND batch_id=${id}::uuid ORDER BY row_number`,
    );
  async function revision(tx: DbTransaction, context: AuthorizationContext, lock = false) {
    if (lock)
      await tx.execute(
        sql`INSERT INTO app.financial_state(workspace_id,revision) VALUES(${context.workspaceId}::uuid,0) ON CONFLICT DO NOTHING`,
      );
    const [state] = await queryRows<{ revision: number }>(
      tx,
      sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}::uuid ${lock ? sql`FOR UPDATE` : sql``}`,
    );
    return String(state?.revision ?? 0);
  }
  async function operation(
    tx: DbTransaction,
    context: AuthorizationContext,
    batchId: string,
    action: string,
    details: unknown,
    key?: string,
    hash?: string,
  ) {
    const id = randomUUID();
    await tx.execute(
      sql`INSERT INTO app.import_operations(workspace_id,id,batch_id,action,details,idempotency_key,request_hash) VALUES(${context.workspaceId}::uuid,${id}::uuid,${batchId}::uuid,${action},${json(details)}::jsonb,${key ?? null}::uuid,${hash ?? null})`,
    );
    await tx.execute(
      sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action,request_id) VALUES(${context.workspaceId}::uuid,${randomUUID()}::uuid,${context.actorId},${`import.${action}`},${context.requestId})`,
    );
    return id;
  }
  async function replay(
    tx: DbTransaction,
    context: AuthorizationContext,
    key: string,
    action: string,
    hash: string,
  ) {
    const [old] = await queryRows<{ action: string; request_hash: string; details: unknown }>(
      tx,
      sql`SELECT action,request_hash,details FROM app.import_operations WHERE workspace_id=${context.workspaceId}::uuid AND idempotency_key=${key}::uuid`,
    );
    if (old && (old.action !== action || old.request_hash !== hash))
      throw financialConflict(
        'IDEMPOTENCY_CONFLICT',
        'This import command key has different contents.',
      );
    return old?.details;
  }
  async function claim(
    tx: DbTransaction,
    context: AuthorizationContext,
    batch: Batch,
    row: Row,
  ): Promise<Claim | undefined> {
    const [found] = await queryRows<Claim>(
      tx,
      sql`SELECT s.payload_hash AS "payloadHash",s.current_row_id AS "currentRowId",s.result,s.state,r.recorded_command_id AS "recordedCommandId" FROM app.import_sources s JOIN app.import_rows r ON r.workspace_id=s.workspace_id AND r.id=s.current_row_id WHERE s.workspace_id=${context.workspaceId}::uuid AND s.account_id=${batch.accountId}::uuid AND s.namespace=${batch.namespace} AND s.record_kind=${row.kind} AND s.identity_key=${row.identityKey}`,
    );
    return found;
  }
  async function recordSource(
    tx: DbTransaction,
    context: AuthorizationContext,
    batch: Batch,
    row: Row,
    opId: string,
    action: string,
    result: unknown,
  ) {
    await tx.execute(
      sql`INSERT INTO app.import_source_history(workspace_id,id,operation_id,row_id,action,payload_hash,result) VALUES(${context.workspaceId}::uuid,${randomUUID()}::uuid,${opId}::uuid,${row.id}::uuid,${action},${row.payloadHash},${json(result)}::jsonb)`,
    );
    if (action !== 'duplicate' || !(await claim(tx, context, batch, row)))
      await tx.execute(
        sql`INSERT INTO app.import_sources(workspace_id,account_id,namespace,record_kind,identity_key,payload_hash,current_row_id,result,state) VALUES(${context.workspaceId}::uuid,${batch.accountId}::uuid,${batch.namespace},${row.kind},${row.identityKey},${row.payloadHash},${row.id}::uuid,${json(result)}::jsonb,'active') ON CONFLICT(workspace_id,account_id,namespace,record_kind,identity_key) DO UPDATE SET payload_hash=excluded.payload_hash,current_row_id=excluded.current_row_id,result=excluded.result,state='active'`,
      );
  }
  async function assertAccountScope(
    tx: DbTransaction,
    context: AuthorizationContext,
    batch: Batch,
    payload: unknown,
  ) {
    const buckets: string[] = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value !== null && typeof value === 'object')
        for (const [key, child] of Object.entries(value)) {
          if (
            ['cashBucketId', 'sourceBucketId', 'destinationBucketId'].includes(key) &&
            typeof child === 'string'
          )
            buckets.push(c.financialIdSchema.parse(child));
          else visit(child);
        }
    };
    visit(payload);
    for (const id of new Set(buckets)) {
      const [bucket] = await queryRows<{ account_id: string }>(
        tx,
        sql`SELECT account_id FROM app.cash_buckets WHERE workspace_id=${context.workspaceId}::uuid AND id=${id}::uuid`,
      );
      if (!bucket || bucket.account_id !== batch.accountId)
        throw financialInvalid('Every cash bucket must belong to the selected batch account.');
    }
  }
  async function processRows(
    tx: DbTransaction,
    context: AuthorizationContext,
    batch: Batch,
    all: Row[],
    groups: string[],
    corrections: Record<string, string>,
    opId: string,
    dry: boolean,
  ): Promise<Row[]> {
    const selected = all.filter((row) => groups.includes(row.groupKey));
    if (!selected.length || selected.length > c.IMPORT_LIMITS.commitRows)
      throw financialInvalid('Choose complete groups totaling at most 100 rows.');
    if (groups.some((group) => !selected.some((row) => row.groupKey === group)))
      throw financialInvalid('Every selected group must belong to this batch.');
    if (Object.keys(corrections).some((id) => !selected.some((row) => row.id === id)))
      throw financialInvalid('Correction reviews must refer to selected rows.');
    const results = new Map<string, unknown>(),
      byKey = new Map(all.map((row) => [row.sourceKey, row]));
    for (const row of all) {
      if (row.status === 'committed' || row.status === 'duplicate' || row.status === 'reconciled')
        results.set(row.sourceKey, row.result);
      else if (row.kind && row.identityKey) {
        const existing = await claim(tx, context, batch, row);
        if (existing?.state === 'active' && existing.payloadHash === row.payloadHash)
          results.set(row.sourceKey, existing.result);
      }
    }
    const dependencies = (row: Row) => [
      ...rowReferences(row.payload),
      ...(row.kind === 'execution_cash' && typeof row.payload?.executionSourceId === 'string'
        ? all
            .filter(
              (item) =>
                item.kind === 'execution' && item.sourceId === row.payload!.executionSourceId,
            )
            .map((item) => item.sourceKey)
        : []),
    ];
    const order: string[] = [],
      visiting = new Set<string>(),
      visited = new Set<string>();
    const walk = (group: string) => {
      if (visiting.has(group))
        throw financialInvalid(
          'Import dependency groups form a cycle. Merge dependent rows into one group or remove the cycle.',
        );
      if (visited.has(group)) return;
      visiting.add(group);
      for (const row of selected.filter((item) => item.groupKey === group))
        for (const reference of dependencies(row)) {
          const target = byKey.get(reference);
          if (target && target.groupKey !== group && groups.includes(target.groupKey))
            walk(target.groupKey);
        }
      visiting.delete(group);
      visited.add(group);
      order.push(group);
    };
    groups.forEach(walk);
    const output: Row[] = [];
    for (const group of order) {
      const members = selected.filter((row) => row.groupKey === group);
      let processed: Row[] = [];
      const previousResults = new Map(results);
      try {
        processed = await tx.transaction(async (groupTx) => {
          await groupTx.execute(sql`SELECT set_config('app.source_origin','import',true)`);
          const port = importLedgerPort(groupTx),
            pending = [...members],
            done: Row[] = [];
          while (pending.length) {
            const index = pending.findIndex((row) =>
              dependencies(row).every(
                (key) => results.has(key) || !pending.some((item) => item.sourceKey === key),
              ),
            );
            if (index < 0)
              throw financialInvalid('Rows within this group have circular dependencies.');
            const [row] = pending.splice(index, 1);
            if (!row) throw financialInvalid('Missing import row.');
            if (
              row.errors.length ||
              !row.payload ||
              !row.kind ||
              ['invalid', 'ambiguous', 'reversed'].includes(row.status)
            )
              throw financialInvalid(
                `Row ${row.rowNumber} cannot be committed: ${row.errors.map((issue) => issue.message).join('; ') || row.status}`,
              );
            if (['committed', 'duplicate', 'reconciled'].includes(row.status)) {
              done.push({
                ...row,
                status: dry && row.status === 'committed' ? 'duplicate' : row.status,
              });
              results.set(row.sourceKey, row.result);
              continue;
            }
            let existing = await claim(groupTx, context, batch, row);
            if (!existing) {
              const legacy = await legacyImportSource(
                groupTx,
                context,
                batch.accountId,
                batch.namespace,
                row.kind,
                row.sourceId,
                row.payload,
              );
              if (legacy)
                existing = {
                  ...legacy,
                  payloadHash:
                    legacy.payloadHash === 'same' ? row.payloadHash! : legacy.payloadHash,
                };
            }
            if (existing?.state === 'reversed')
              throw financialConflict(
                'IMPORT_SOURCE_REVERSED',
                'This source was reversed. Reimport will not resurrect it automatically.',
              );
            if (existing && existing.payloadHash === row.payloadHash) {
              await recordSource(groupTx, context, batch, row, opId, 'duplicate', existing.result);
              done.push({
                ...row,
                status: 'duplicate',
                recordedCommandId:
                  existing.recordedCommandId ??
                  (typeof existing.result.commandId === 'string'
                    ? existing.result.commandId
                    : null),
                result: c.financialJsonSchema.parse(existing.result),
              });
              results.set(row.sourceKey, existing.result);
              continue;
            }
            let payload: unknown;
            try {
              payload = resolveReferences(row.payload, results);
            } catch (error) {
              throw financialInvalid(error instanceof Error ? error.message : 'Invalid reference.');
            }
            await assertAccountScope(groupTx, context, batch, payload);
            if (existing && !corrections[row.id])
              throw financialConflict(
                'IMPORT_CORRECTION_REQUIRED',
                'This broker source ID has changed. Review an explicit correction; do not append it.',
              );
            const result = existing
              ? await port.correct(
                  context,
                  row.kind,
                  payload,
                  row.commandId,
                  existing.result as { id: string },
                  corrections[row.id]!,
                  await revision(groupTx, context),
                  batch.namespace,
                  row.sourceId ?? undefined,
                )
              : row.kind === 'execution_cash'
                ? await port.reconcileCash(context, batch.accountId, batch.namespace, payload)
                : await port.apply(
                    context,
                    row.kind,
                    payload,
                    row.commandId,
                    batch.namespace,
                    row.sourceId ?? undefined,
                  );
            const action = existing
              ? 'corrected'
              : row.kind === 'execution_cash'
                ? 'reconciled'
                : 'imported';
            await recordSource(groupTx, context, batch, row, opId, action, result);
            results.set(row.sourceKey, result);
            done.push({
              ...row,
              status: row.kind === 'execution_cash' ? 'reconciled' : 'new',
              recordedCommandId:
                row.kind === 'execution_cash'
                  ? null
                  : typeof (result as Record<string, unknown>).commandId === 'string'
                    ? String((result as Record<string, unknown>).commandId)
                    : row.commandId,
              result: c.financialJsonSchema.parse(result),
            });
          }
          // A dry run must flush deferred financial invariants before throwing its rollback sentinel.
          await groupTx.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
          await groupTx.execute(sql`SET CONSTRAINTS ALL DEFERRED`);
          return done;
        });
      } catch (error) {
        if (!dry) throw error;
        results.clear();
        for (const [key, value] of previousResults) results.set(key, value);
        const issue = safeIssue(error);
        processed = members.map((row) => ({
          ...row,
          status: issue.code === 'IMPORT_CORRECTION_REQUIRED' ? 'correction' : 'invalid',
          errors: [...row.errors, issue],
          result: null,
        }));
      }
      output.push(...processed);
    }
    return output.sort((a, b) => a.rowNumber - b.rowNumber);
  }
  async function stage(context: AuthorizationContext, value: unknown, key: string) {
    requireEditor(context);
    c.financialIdSchema.parse(key);
    const input = c.importStageSchema.parse(value);
    let mapping = input.mapping;
    if (input.templateVersionId)
      mapping = await platform.withWorkspaceContext(context, async (tx) => {
        const [template] = await queryRows<{ mapping: c.ImportMapping; archived: boolean }>(
          tx,
          sql`SELECT t.mapping,latest.archived FROM app.import_template_versions t JOIN LATERAL (SELECT archived FROM app.import_template_versions WHERE workspace_id=t.workspace_id AND template_id=t.template_id ORDER BY version DESC LIMIT 1) latest ON true WHERE t.workspace_id=${context.workspaceId}::uuid AND t.id=${input.templateVersionId}::uuid`,
        );
        if (!template || template.archived) throw inaccessible();
        return c.importMappingSchema.parse(template.mapping);
      });
    if (!mapping) throw financialInvalid('Select a mapping.');
    mapping = c.importMappingSchema.parse(mapping);
    if (new TextEncoder().encode(json(mapping)).byteLength > 65536)
      throw financialInvalid('Mapping exceeds 64 KiB.');
    let parsed;
    try {
      parsed = registry
        .get(mapping.adapterId, mapping.adapterVersion)
        .parse(input.content, mapping);
    } catch (error) {
      throw financialInvalid(
        error instanceof Error ? error.message : 'The file could not be parsed.',
      );
    }
    if (!parsed.length || parsed.length > 1000)
      throw financialInvalid('CSV must contain 1–1,000 source rows.');
    const requestHash = financialFingerprint({ ...input, mapping }),
      hash = createHash('sha256').update(input.content, 'utf8').digest('hex');
    return platform.withWorkspaceContext(context, async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`import-stage:${context.workspaceId}`},0))`,
      );
      const old = await replay(tx, context, key, 'staged', requestHash);
      if (old) return c.importBatchResponseSchema.strip().parse(old);
      const [mappingSize] = await queryRows<{ bytes: number }>(
        tx,
        sql`SELECT octet_length(${json(mapping)}::jsonb::text) AS bytes`,
      );
      if (!mappingSize || mappingSize.bytes > 65536)
        throw financialInvalid('Mapping exceeds 64 KiB in stored JSON.');
      const [account] = await queryRows(
        tx,
        sql`SELECT id FROM app.accounts WHERE workspace_id=${context.workspaceId}::uuid AND id=${input.accountId}::uuid AND status='active'`,
      );
      if (!account) throw inaccessible();
      const id = randomUUID();
      await tx.execute(
        sql`INSERT INTO app.import_batches(workspace_id,id,account_id,namespace,filename,source_text,file_hash,mapping,template_version_id,adapter_id,adapter_version,row_count) VALUES(${context.workspaceId}::uuid,${id}::uuid,${input.accountId}::uuid,${input.namespace},${input.filename},${input.content},${hash},${json(mapping)}::jsonb,${input.templateVersionId ?? null}::uuid,${mapping.adapterId},${mapping.adapterVersion},${parsed.length})`,
      );
      const normalized = parsed.map((item) => {
        let draft = item.draft;
        const errors = [...item.errors];
        if (draft)
          try {
            draft = validateDraft(draft, input.accountId);
          } catch (error) {
            if (error instanceof Error && error.name === 'Error')
              errors.push({ code: 'INVALID_CANONICAL_ROW', message: error.message.slice(0, 2000) });
            else errors.push(safeIssue(error));
          }
        return {
          ...item,
          draft,
          errors,
          identity: null as ReturnType<typeof importIdentity> | null,
        };
      });
      const sourceKeys = new Map<string, number>();
      for (const row of normalized)
        if (row.draft)
          sourceKeys.set(row.draft.sourceKey, (sourceKeys.get(row.draft.sourceKey) ?? 0) + 1);
      const dependencies = new Map(
        normalized
          .filter((row) => row.draft && sourceKeys.get(row.draft.sourceKey) === 1)
          .map((row) => [row.draft!.sourceKey, row.draft!]),
      );
      const dependencyHashes = new Map<string, string>();
      for (const row of normalized) {
        if (!row.draft) continue;
        if ((sourceKeys.get(row.draft.sourceKey) ?? 0) > 1)
          row.errors.push({
            code: 'AMBIGUOUS_SOURCE_KEY',
            message:
              'Every local source key must identify exactly one row. Map distinct keys before resolving dependencies.',
          });
        if (!row.draft.sourceId && rowReferences(row.draft.payload).length)
          row.errors.push({
            code: 'STABLE_SOURCE_ID_REQUIRED',
            message:
              'Records with local row references require a stable broker source ID. Map it before importing dependent financial facts.',
          });
        try {
          row.identity = importIdentity(row.draft, dependencies, dependencyHashes);
        } catch (error) {
          row.errors.push({
            code: 'INVALID_IMPORT_DEPENDENCY',
            message:
              error instanceof Error ? error.message.slice(0, 2000) : 'Invalid import dependency.',
          });
        }
      }
      const fingerprints = new Map<string, number>();
      for (const row of normalized)
        if (row.draft && !row.draft.sourceId && row.identity)
          fingerprints.set(
            row.identity.identityKey,
            (fingerprints.get(row.identity.identityKey) ?? 0) + 1,
          );
      for (const row of normalized) {
        const ambiguous =
          !!row.identity &&
          !row.draft?.sourceId &&
          (fingerprints.get(row.identity.identityKey) ?? 0) > 1;
        const errors = [
          ...row.errors,
          ...(ambiguous
            ? [
                {
                  code: 'AMBIGUOUS_FINGERPRINT',
                  message:
                    'Identical rows without stable broker IDs may represent distinct events. Map a stable occurrence/source ID; no row will be silently dropped.',
                },
              ]
            : []),
        ];
        const draft = row.draft;
        await tx.execute(
          sql`INSERT INTO app.import_rows(workspace_id,id,batch_id,row_number,source_key,group_key,source_id,record_kind,identity_key,payload_hash,payload,raw_fields,errors,warnings,status,command_id) VALUES(${context.workspaceId}::uuid,${randomUUID()}::uuid,${id}::uuid,${row.rowNumber},${draft?.sourceKey ?? `invalid-${row.rowNumber}`},${draft?.groupKey ?? `invalid-${row.rowNumber}`},${draft?.sourceId ?? null},${draft?.kind ?? null},${row.identity?.identityKey ?? null},${row.identity?.payloadHash ?? null},${draft ? json(draft.payload) : null}::jsonb,${json(row.raw)}::jsonb,${json(errors)}::jsonb,${json(draft?.warnings ?? [])}::jsonb,${ambiguous ? 'ambiguous' : errors.length ? 'invalid' : 'ready'},${randomUUID()}::uuid)`,
        );
      }
      const response = c.importBatchResponseSchema.strip().parse(await readBatch(tx, context, id));
      await operation(tx, context, id, 'staged', response, key, requestHash);
      return response;
    });
  }
  async function preview(context: AuthorizationContext, id: string, value: unknown) {
    requireEditor(context);
    const input = c.importPreviewRequestSchema.parse(value);
    return platform.withWorkspaceContext(context, async (tx) => {
      const sourceRevision = await revision(tx, context, true),
        batch = await readBatch(tx, context, id, true);
      if (batch.revision !== input.expectedRevision || batch.state === 'reversed')
        throw financialConflict('IMPORT_REVISION_CONFLICT', 'Refresh this batch before reviewing.');
      const rows = await readRows(tx, context, id),
        previewId = randomUUID(),
        batchRevision = batch.revision + 1;
      const opId = await operation(tx, context, id, 'previewed', {
        previewId,
        groups: input.groups,
        sourceRevision,
      });
      let simulated: Row[] = [];
      try {
        await tx.transaction(async (simulation) => {
          const result = await processRows(
            simulation,
            context,
            batch,
            rows,
            input.groups,
            input.corrections,
            opId,
            true,
          );
          throw new DryRun(result);
        });
      } catch (error) {
        if (error instanceof DryRun) simulated = error.rows;
        else throw error;
      }
      const response = c.importPreviewResponseSchema.parse({
        id: previewId,
        batchRevision,
        sourceRevision,
        groups: input.groups,
        corrections: input.corrections,
        committable: simulated.every(
          (row) =>
            !row.errors.length && !['invalid', 'ambiguous', 'correction'].includes(row.status),
        ),
        rows: simulated.map((row) => c.importRowResponseSchema.strip().parse(row)),
      });
      await tx.execute(
        sql`UPDATE app.import_batches SET preview=${json(response)}::jsonb,revision=${batchRevision} WHERE workspace_id=${context.workspaceId}::uuid AND id=${id}::uuid`,
      );
      return response;
    });
  }
  async function commit(context: AuthorizationContext, id: string, value: unknown, key: string) {
    requireEditor(context);
    c.financialIdSchema.parse(key);
    const input = c.importCommitRequestSchema.parse(value),
      requestHash = financialFingerprint({ id, input });
    return platform.withWorkspaceContext(context, async (tx) => {
      const sourceRevision = await revision(tx, context, true),
        old = await replay(tx, context, key, 'committed', requestHash);
      if (old) return c.importBatchResponseSchema.strip().parse(old);
      const batch = await readBatch(tx, context, id, true),
        review = batch.preview;
      if (
        batch.revision !== input.expectedRevision ||
        !review ||
        review.id !== input.previewId ||
        review.batchRevision !== batch.revision ||
        batch.state === 'reversed'
      )
        throw financialConflict(
          'IMPORT_REVIEW_REQUIRED',
          'Preview this exact selection before committing.',
        );
      if (review.sourceRevision !== sourceRevision)
        throw financialConflict(
          'STALE_IMPORT_PREVIEW',
          'Financial activity changed after preview. Preview again before committing.',
        );
      if (!review.committable)
        throw financialConflict(
          'IMPORT_VALIDATION_FAILED',
          'Resolve errors or explicitly select complete valid groups.',
        );
      if (review.rows.some((row) => row.warnings.length) && !input.acceptWarnings)
        throw financialConflict(
          'IMPORT_WARNINGS_UNREVIEWED',
          'Acknowledge retained unmapped columns before committing.',
        );
      const all = await readRows(tx, context, id),
        opId = await operation(tx, context, id, 'committed', { pending: true }, key, requestHash);
      const applied = await processRows(
        tx,
        context,
        batch,
        all,
        review.groups,
        review.corrections,
        opId,
        false,
      );
      for (const row of applied)
        await tx.execute(
          sql`UPDATE app.import_rows SET status=${row.status === 'new' ? 'committed' : row.status},result=${json(row.result)}::jsonb,recorded_command_id=${row.recordedCommandId}::uuid WHERE workspace_id=${context.workspaceId}::uuid AND id=${row.id}::uuid`,
        );
      const remaining = all.filter(
        (row) =>
          !review.groups.includes(row.groupKey) &&
          !['committed', 'duplicate', 'reconciled'].includes(row.status),
      );
      await tx.execute(
        sql`UPDATE app.import_batches SET state=${remaining.length ? 'partial' : 'committed'},revision=revision+1,preview=NULL WHERE workspace_id=${context.workspaceId}::uuid AND id=${id}::uuid`,
      );
      const response = c.importBatchResponseSchema.strip().parse(await readBatch(tx, context, id)),
        finalRevision = await revision(tx, context);
      const financialCommands = await queryRows<{ id: string }>(
        tx,
        sql`SELECT id FROM app.financial_commands WHERE workspace_id=${context.workspaceId}::uuid AND source_revision>${sourceRevision}::integer AND source_revision<=${finalRevision}::integer`,
      );
      // Operation details become immutable at completion (guarded by the one-transaction insertion).
      await tx.execute(
        sql`UPDATE app.import_operations SET details=${json({ ...response, financialRevision: finalRevision, financialCommandIds: financialCommands.map((command) => command.id), includedGroups: review.groups, excludedGroups: [...new Set(remaining.map((row) => row.groupKey))] })}::jsonb WHERE workspace_id=${context.workspaceId}::uuid AND id=${opId}::uuid`,
      );
      return response;
    });
  }
  async function reverse(context: AuthorizationContext, id: string, value: unknown, key: string) {
    requireEditor(context);
    c.financialIdSchema.parse(key);
    const input = c.importReverseRequestSchema.parse(value),
      hash = financialFingerprint({ id, input });
    return platform.withWorkspaceContext(context, async (tx) => {
      await revision(tx, context, true);
      const old = await replay(tx, context, key, 'reversed', hash);
      if (old) return c.importBatchResponseSchema.strip().parse(old);
      const batch = await readBatch(tx, context, id, true);
      if (
        batch.revision !== input.expectedRevision ||
        !['partial', 'committed'].includes(batch.state)
      )
        throw financialConflict(
          'IMPORT_REVISION_CONFLICT',
          'Refresh this committed batch before reversing.',
        );
      const rows = (await readRows(tx, context, id)).filter((row) => row.status === 'committed');
      const operations = await queryRows<{ details: { financialCommandIds?: string[] } }>(
        tx,
        sql`SELECT details FROM app.import_operations WHERE workspace_id=${context.workspaceId}::uuid AND batch_id=${id}::uuid AND action='committed'`,
      );
      const ownedCommands = [
        ...new Set(operations.flatMap((operation) => operation.details.financialCommandIds ?? [])),
      ];
      if (rows.length) {
        const [first] = await queryRows<{ revision: number }>(
          tx,
          sql`SELECT min(source_revision)::integer AS revision FROM app.financial_commands WHERE workspace_id=${context.workspaceId}::uuid AND id=ANY(${`{${ownedCommands.join(',')}}`}::uuid[])`,
        );
        const downstream = await queryRows(
          tx,
          sql`SELECT id FROM app.financial_commands WHERE workspace_id=${context.workspaceId}::uuid AND source_revision>=${first?.revision ?? 0}::integer AND NOT(id=ANY(${`{${ownedCommands.join(',')}}`}::uuid[])) LIMIT 1`,
        );
        if (!first?.revision || downstream.length)
          throw financialConflict(
            'IMPORT_REVERSAL_DEPENDENCIES',
            'Financial activity outside this batch exists after its first financial effect. Use a dependency-aware correction; no-op retries cannot reset this boundary.',
          );
      }
      if (rows.some((row) => row.kind !== 'cash_movement'))
        throw financialConflict(
          'IMPORT_REVERSAL_UNSUPPORTED',
          'Automatic monetary reversal is limited to independent cash movements. Fills, lots, fees, FX, orders and catalog/valuation records need explicit domain correction.',
        );
      const corrected = await queryRows(
        tx,
        sql`SELECT h.id FROM app.import_source_history h JOIN app.import_rows r ON r.workspace_id=h.workspace_id AND r.id=h.row_id WHERE r.workspace_id=${context.workspaceId}::uuid AND r.batch_id=${id}::uuid AND h.action='corrected' LIMIT 1`,
      );
      if (corrected.length)
        throw financialConflict(
          'IMPORT_REVERSAL_DEPENDENCIES',
          'This batch contains corrections to earlier history. Review a domain correction instead of erasing its replacement.',
        );
      await tx.execute(sql`SELECT set_config('app.source_origin','import',true)`);
      const opId = await operation(tx, context, id, 'reversed', { pending: true }, key, hash),
        port = importLedgerPort(tx);
      for (const row of rows) {
        const existing = await claim(tx, context, batch, row);
        if (existing?.currentRowId !== row.id || existing.state !== 'active')
          throw financialConflict(
            'IMPORT_REVERSAL_DEPENDENCIES',
            'This source has changed since this batch committed.',
          );
        const result = await port.reverseCash(context, {
          commandId: randomUUID(),
          cashMovementId: String(existing.result.id),
          expectedSourceRevision: await revision(tx, context),
          reason: input.reason,
        });
        await tx.execute(
          sql`INSERT INTO app.import_source_history(workspace_id,id,operation_id,row_id,action,payload_hash,result) VALUES(${context.workspaceId}::uuid,${randomUUID()}::uuid,${opId}::uuid,${row.id}::uuid,'reversed',${row.payloadHash},${json(result)}::jsonb)`,
        );
        await tx.execute(
          sql`UPDATE app.import_sources SET state='reversed' WHERE workspace_id=${context.workspaceId}::uuid AND current_row_id=${row.id}::uuid`,
        );
        await tx.execute(
          sql`UPDATE app.import_rows SET status='reversed' WHERE workspace_id=${context.workspaceId}::uuid AND id=${row.id}::uuid`,
        );
      }
      await tx.execute(
        sql`UPDATE app.import_batches SET state='reversed',revision=revision+1,preview=NULL WHERE workspace_id=${context.workspaceId}::uuid AND id=${id}::uuid`,
      );
      const response = c.importBatchResponseSchema.strip().parse(await readBatch(tx, context, id));
      await tx.execute(
        sql`UPDATE app.import_operations SET details=${json({ ...response, reason: input.reason })}::jsonb WHERE workspace_id=${context.workspaceId}::uuid AND id=${opId}::uuid`,
      );
      return response;
    });
  }
  async function detail(context: AuthorizationContext, id: string, cursor = 0) {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw financialInvalid('Invalid row cursor.');
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const batch = await readBatch(tx, context, id),
          all = await readRows(tx, context, id),
          page = all.filter((row) => row.rowNumber > cursor).slice(0, 51),
          rows = page.slice(0, 50);
        const map = new Map<string, Row[]>();
        for (const row of all) {
          const members = map.get(row.groupKey) ?? [];
          members.push(row);
          map.set(row.groupKey, members);
        }
        const history = await queryRows(
          tx,
          sql`SELECT id,action,actor_id AS "actorId",to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",details FROM app.import_operations WHERE workspace_id=${context.workspaceId}::uuid AND batch_id=${id}::uuid ORDER BY created_at DESC,id DESC LIMIT 100`,
        );
        return c.importBatchDetailSchema.parse({
          batch: c.importBatchResponseSchema.strip().parse(batch),
          rows: rows.map((row) => c.importRowResponseSchema.strip().parse(row)),
          nextCursor: page.length > 50 ? rows.at(-1)!.rowNumber : null,
          groups: [...map].map(([key, members]) => ({
            key,
            rows: members.length,
            invalid: members.filter((row) => row.errors.length).length,
            committed: members.filter((row) =>
              ['committed', 'duplicate', 'reconciled'].includes(row.status),
            ).length,
          })),
          history,
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async function history(context: AuthorizationContext, cursor?: string) {
    if (cursor) c.financialIdSchema.parse(cursor);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const rows = await queryRows<Batch>(
          tx,
          sql`SELECT ${batchColumns} FROM app.import_batches WHERE workspace_id=${context.workspaceId}::uuid ${cursor ? sql`AND (created_at,id)<(SELECT created_at,id FROM app.import_batches WHERE workspace_id=${context.workspaceId}::uuid AND id=${cursor}::uuid)` : sql``} ORDER BY created_at DESC,id DESC LIMIT 51`,
        );
        return c.importHistoryResponseSchema.parse({
          items: rows.slice(0, 50).map((row) => c.importBatchResponseSchema.strip().parse(row)),
          nextCursor: rows.length > 50 ? rows[49]!.id : null,
        });
      },
      { accessMode: 'read only' },
    );
  }
  async function source(context: AuthorizationContext, id: string) {
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const batch = await readBatch(tx, context, id);
        return { filename: batch.filename, content: batch.sourceText, fileHash: batch.fileHash };
      },
      { accessMode: 'read only' },
    );
  }
  return { stage, preview, commit, reverse, detail, history, source, registry };
}
