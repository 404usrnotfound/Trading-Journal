import { randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import {
  decimal,
  decimalValue,
  FinancialArithmeticError,
  instantNanoseconds,
  quantizeDecimal,
} from '@journal/domain';
import {
  createStatementRequestSchema,
  evaluateStatementRequestSchema,
  statementListQuerySchema,
  statementResponseSchema,
  statementReconciliationResponseSchema,
  financialIdSchema,
  type StatementDocument,
  type StatementResponse,
  type StatementReconciliation,
  type StatementVariance,
} from '@journal/contracts';
import type { z } from 'zod';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import {
  executeFinancialCommand,
  financialConflict,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';
import {
  requireAccount,
  requireCurrency,
  requireInstrumentVersion,
} from '../financial/reference-data.js';
import { replayBookAt } from '../financial/ledger.js';
import { createAccountingReports } from '../accounting/report.js';

const at = (column: string) =>
  sql.raw(`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);
type StatementRow = {
  id: string;
  account_id: string;
  as_of: string;
  created_at: string;
  source_revision: number;
  document: StatementDocument;
};
async function readStatement(
  tx: DbTransaction,
  context: AuthorizationContext,
  id: string,
): Promise<StatementResponse> {
  const [row] = await queryRows<StatementRow>(
    tx,
    sql`SELECT id,account_id,${at('as_of')} AS as_of,
    ${at('created_at')} AS created_at,source_revision,document FROM app.source_statements
    WHERE workspace_id=${context.workspaceId}::uuid AND id=${id}::uuid`,
  );
  if (!row) throw inaccessible();
  return statementFromRow(row);
}
function statementFromRow(row: StatementRow): StatementResponse {
  return statementResponseSchema.parse({
    id: row.id,
    accountId: row.account_id,
    asOf: row.as_of,
    createdAt: row.created_at,
    sourceRevision: String(row.source_revision),
    document: row.document,
  });
}
async function currentEconomicRevision(tx: DbTransaction, context: AuthorizationContext) {
  const [row] = await queryRows<{ revision: number }>(
    tx,
    sql`SELECT coalesce(max(source_revision),0)::integer AS revision
    FROM app.financial_commands WHERE workspace_id=${context.workspaceId}::uuid
    AND kind NOT IN ('statement.created','statement.evaluated')`,
  );
  return String(row?.revision ?? 0);
}
function compare(
  kind: StatementVariance['kind'],
  referenceId: string,
  expected: string,
  actual: string | null,
  tolerance: string,
  reasons: readonly string[] = [],
): StatementVariance {
  try {
    const variance =
      actual === null ? null : quantizeDecimal(decimalValue(actual).minus(decimalValue(expected)));
    return {
      kind,
      referenceId,
      expected: decimal(expected),
      actual: actual === null ? null : decimal(actual),
      variance,
      tolerance: decimal(tolerance),
      state:
        variance === null
          ? 'unavailable'
          : decimalValue(variance).abs().lte(tolerance)
            ? 'matched'
            : 'variance',
      reasons: [...new Set(reasons)].sort(),
    };
  } catch (error) {
    if (!(error instanceof FinancialArithmeticError)) throw error;
    return {
      kind,
      referenceId,
      expected: decimal(expected),
      actual: null,
      variance: null,
      tolerance: decimal(tolerance),
      state: 'unavailable',
      reasons: [error.code],
    };
  }
}
function instantBefore(value: string) {
  const micros = instantNanoseconds(value) / 1000n - 1n;
  let seconds = micros / 1_000_000n,
    fraction = micros % 1_000_000n;
  if (fraction < 0) {
    seconds--;
    fraction += 1_000_000n;
  }
  return new Date(Number(seconds * 1000n))
    .toISOString()
    .replace(/\.\d{3}Z$/u, `.${fraction.toString().padStart(6, '0')}Z`);
}

/** Independent evidence never changes ledger cash, lots, marks or source amounts. */
export function createReconciliationServices(platform: FinancialPlatform) {
  async function create(
    context: AuthorizationContext,
    value: z.input<typeof createStatementRequestSchema>,
    commandId: string,
  ) {
    // Keep the original offset in source evidence; PostgreSQL stores the dated comparison in UTC.
    const document = createStatementRequestSchema.parse(value);
    return executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'statement.created', payload: document },
      async (tx, state) => {
        await requireAccount(tx, context.workspaceId, document.accountId, false, document.asOf);
        for (const line of [...document.cash, ...(document.equity ? [document.equity] : [])])
          await requireCurrency(tx, context.workspaceId, line.currencyId, false);
        const instruments = new Set<string>();
        for (const line of document.holdings) {
          const instrument = await requireInstrumentVersion(
            tx,
            context.workspaceId,
            line.instrumentVersionId,
            false,
          );
          if (instruments.has(instrument.instrumentId))
            throw financialInvalid(
              'A statement lists each underlying instrument ownership book once.',
            );
          instruments.add(instrument.instrumentId);
        }
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.source_statements(workspace_id,id,actor_id,command_id,source_revision,account_id,as_of,document)
        VALUES(${context.workspaceId}::uuid,${id}::uuid,${context.actorId},${state.eventId}::uuid,${state.revision}::integer,
        ${document.accountId}::uuid,${document.asOf}::timestamptz,${JSON.stringify(document)}::jsonb)`);
        return readStatement(tx, context, id);
      },
    );
  }
  const get = (context: AuthorizationContext, id: string) =>
    platform.withWorkspaceContext(
      context,
      (tx) => readStatement(tx, context, financialIdSchema.parse(id).toLowerCase()),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

  async function evaluate(
    context: AuthorizationContext,
    statementId: string,
    value: z.input<typeof evaluateStatementRequestSchema>,
    commandId: string,
  ): Promise<StatementReconciliation> {
    const id = financialIdSchema.parse(statementId).toLowerCase();
    const input = evaluateStatementRequestSchema.parse(value);
    const result = await executeFinancialCommand(
      platform,
      context,
      { commandId, kind: 'statement.evaluated', payload: { statementId: id, ...input } },
      async (tx, state) => {
        const statement = await readStatement(tx, context, id),
          document = statement.document;
        const comparedRevision = input.sourceRevision ?? String(BigInt(state.revision) - 1n);
        if (
          BigInt(comparedRevision) >= BigInt(state.revision) ||
          BigInt(comparedRevision) < BigInt(statement.sourceRevision)
        )
          throw financialInvalid(
            'Select a financial revision at or after the statement and before this assessment.',
          );
        const rows: StatementVariance[] = [];
        const cash = await queryRows<{ currency_id: string; amount: string }>(
          tx,
          sql`SELECT b.currency_id,coalesce(sum(p.amount) FILTER (
        WHERE e.source_revision<=${comparedRevision}::integer AND e.economic_at<=${statement.asOf}::timestamptz),0)::text AS amount
        FROM app.cash_buckets b LEFT JOIN app.postings p ON p.workspace_id=b.workspace_id AND p.cash_bucket_id=b.id
        LEFT JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
        WHERE b.workspace_id=${context.workspaceId}::uuid AND b.account_id=${statement.accountId}::uuid GROUP BY b.currency_id LIMIT 201`,
        );
        if (cash.length > 100)
          throw financialConflict(
            'RECONCILIATION_SCOPE_TOO_LARGE',
            'Select an account with at most 100 cash units.',
          );
        const actualCash = new Map(cash.map((line) => [line.currency_id, line.amount]));
        for (const line of document.cash)
          rows.push(
            compare(
              'cash',
              line.currencyId,
              line.amount,
              actualCash.get(line.currencyId) ?? '0',
              line.tolerance,
            ),
          );
        if (document.completeCash)
          for (const [currency, amount] of actualCash)
            if (!document.cash.some((line) => line.currencyId === currency))
              rows.push(compare('cash', currency, '0', amount, '0'));
        const actualBooks = document.completeHoldings
          ? await queryRows<{ instrument_version_id: string }>(
              tx,
              sql`SELECT DISTINCT ON (v.instrument_id) s.instrument_version_id
        FROM (
          SELECT e.instrument_version_id,e.economic_at,e.source_revision FROM app.executions e
          WHERE e.workspace_id=${context.workspaceId}::uuid AND e.account_id=${statement.accountId}::uuid
            AND NOT EXISTS(SELECT 1 FROM app.execution_supersessions x WHERE x.workspace_id=e.workspace_id AND x.original_execution_id=e.id AND x.source_revision<=${comparedRevision}::integer)
          UNION ALL SELECT instrument_version_id,economic_at,source_revision FROM app.opening_lots
          WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${statement.accountId}::uuid
          UNION ALL SELECT instrument_version_id,economic_at,source_revision FROM app.holding_transfers
          WHERE workspace_id=${context.workspaceId}::uuid AND (source_account_id=${statement.accountId}::uuid OR destination_account_id=${statement.accountId}::uuid)
        ) s JOIN app.instrument_versions v ON v.workspace_id=${context.workspaceId}::uuid AND v.id=s.instrument_version_id
        WHERE s.source_revision<=${comparedRevision}::integer AND s.economic_at<=${statement.asOf}::timestamptz
        ORDER BY v.instrument_id,s.economic_at DESC,s.source_revision DESC LIMIT 101`,
            )
          : [];
        if (actualBooks.length > 100)
          throw financialConflict(
            'RECONCILIATION_SCOPE_TOO_LARGE',
            'Select an account with at most 100 holding books.',
          );
        const comparedInstruments = new Set<string>();
        for (const line of document.holdings) {
          const instrument = await requireInstrumentVersion(
            tx,
            context.workspaceId,
            line.instrumentVersionId,
            false,
          );
          comparedInstruments.add(instrument.instrumentId);
          const inventory = await replayBookAt(
            tx,
            context,
            { accountId: statement.accountId, instrumentVersionId: line.instrumentVersionId },
            statement.asOf,
            comparedRevision,
          );
          rows.push(
            compare(
              'holding',
              line.instrumentVersionId,
              line.quantity,
              inventory.openQuantity.status === 'available' ? inventory.openQuantity.value : null,
              line.tolerance,
              inventory.openQuantity.reasons,
            ),
          );
        }
        for (const book of actualBooks) {
          const instrument = await requireInstrumentVersion(
            tx,
            context.workspaceId,
            book.instrument_version_id,
            false,
          );
          if (comparedInstruments.has(instrument.instrumentId)) continue;
          const inventory = await replayBookAt(
            tx,
            context,
            { accountId: statement.accountId, instrumentVersionId: book.instrument_version_id },
            statement.asOf,
            comparedRevision,
          );
          rows.push(
            compare(
              'holding',
              book.instrument_version_id,
              '0',
              inventory.openQuantity.status === 'available' ? inventory.openQuantity.value : null,
              '0',
              inventory.openQuantity.reasons,
            ),
          );
        }
        if (document.equity) {
          if (!input.valuationPolicy)
            throw financialInvalid(
              'An equity comparison requires explicit price and FX freshness/source policies.',
            );
          const snapshot: FinancialPlatform = {
            withWorkspaceContext: async (inner, callback) => {
              if (inner.workspaceId !== context.workspaceId || inner.actorId !== context.actorId)
                throw inaccessible();
              return callback(tx);
            },
          };
          const report = await createAccountingReports(snapshot).report(context, {
            accountIds: [statement.accountId],
            reportingCurrencyId: document.equity.currencyId,
            from: instantBefore(statement.asOf),
            to: statement.asOf,
            sourceRevision: comparedRevision,
            fxPolicy: input.valuationPolicy.fxPolicy,
            priceMaxAgeMilliseconds: input.valuationPolicy.pricePolicy.maxAgeMilliseconds,
            priceSourcePriority: input.valuationPolicy.pricePolicy.sourcePriority,
          });
          rows.push(
            compare(
              'equity',
              document.equity.currencyId,
              document.equity.amount,
              report.closing.equity.value,
              document.equity.tolerance,
              report.closing.equity.reasons,
            ),
          );
        }
        const status = rows.some((row) => row.state === 'variance')
          ? 'variance'
          : rows.some((row) => row.state === 'unavailable')
            ? 'unavailable'
            : 'matched';
        if (input.accept && status !== 'matched')
          throw financialConflict(
            'RECONCILIATION_NOT_MATCHED',
            'Resolve variances and unavailable evidence before accepting a reconciliation.',
          );
        const assessmentId = randomUUID();
        const assessment = statementReconciliationResponseSchema.parse({
          id: assessmentId,
          statementId: id,
          accountId: statement.accountId,
          asOf: statement.asOf,
          createdAt: state.recordedAt,
          sourceRevision: state.revision,
          comparedRevision,
          currentRevision: await currentEconomicRevision(tx, context),
          stale: false,
          status,
          accepted: input.accept,
          reviewNote: input.reviewNote,
          ...(input.valuationPolicy ? { valuationPolicy: input.valuationPolicy } : {}),
          rows,
        });
        await tx.execute(sql`INSERT INTO app.statement_reconciliations(workspace_id,id,actor_id,command_id,source_revision,account_id,as_of,statement_id,compared_revision,status,accepted,result)
        VALUES(${context.workspaceId}::uuid,${assessmentId}::uuid,${context.actorId},${state.eventId}::uuid,${state.revision}::integer,
        ${statement.accountId}::uuid,${statement.asOf}::timestamptz,${id}::uuid,${comparedRevision}::integer,${status},${input.accept},${JSON.stringify(assessment)}::jsonb)`);
        return assessment;
      },
    );
    // Retries preserve the original evidence, while currentness is always resolved on read.
    return evaluation(context, result.id);
  }
  async function readEvaluation(tx: DbTransaction, context: AuthorizationContext, id: string) {
    const [row] = await queryRows<{ result: StatementReconciliation }>(
      tx,
      sql`SELECT result FROM app.statement_reconciliations WHERE workspace_id=${context.workspaceId}::uuid AND id=${id}::uuid`,
    );
    if (!row) throw inaccessible();
    const currentRevision = await currentEconomicRevision(tx, context);
    return statementReconciliationResponseSchema.parse({
      ...row.result,
      currentRevision,
      stale: BigInt(currentRevision) > BigInt(row.result.comparedRevision),
    });
  }
  const evaluation = (context: AuthorizationContext, id: string) =>
    platform.withWorkspaceContext(
      context,
      (tx) => readEvaluation(tx, context, financialIdSchema.parse(id).toLowerCase()),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  async function list(
    context: AuthorizationContext,
    value: z.input<typeof statementListQuerySchema> = {},
  ) {
    const filter = statementListQuerySchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        if (filter.accountId)
          await requireAccount(tx, context.workspaceId, filter.accountId, false);
        const rows = await queryRows<StatementRow>(
          tx,
          sql`SELECT id,account_id,${at('as_of')} AS as_of,${at('created_at')} AS created_at,source_revision,document FROM app.source_statements WHERE workspace_id=${context.workspaceId}::uuid
        AND (${filter.accountId ?? null}::uuid IS NULL OR account_id=${filter.accountId ?? null}::uuid)
        AND (${filter.cursor ?? null}::uuid IS NULL OR id>${filter.cursor ?? null}::uuid) ORDER BY id LIMIT ${filter.limit + 1}`,
        );
        const items = rows.slice(0, filter.limit).map(statementFromRow);
        return { items, nextCursor: rows.length > filter.limit ? items.at(-1)!.id : null };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async function evaluations(
    context: AuthorizationContext,
    statementId: string,
    value: z.input<typeof statementListQuerySchema> = {},
  ) {
    const id = financialIdSchema.parse(statementId).toLowerCase(),
      filter = statementListQuerySchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        await readStatement(tx, context, id);
        const rows = await queryRows<{ id: string; result: StatementReconciliation }>(
          tx,
          sql`SELECT id,result FROM app.statement_reconciliations WHERE workspace_id=${context.workspaceId}::uuid
        AND statement_id=${id}::uuid AND (${filter.cursor ?? null}::uuid IS NULL OR id>${filter.cursor ?? null}::uuid) ORDER BY id LIMIT ${filter.limit + 1}`,
        );
        const currentRevision = await currentEconomicRevision(tx, context);
        const items = rows.slice(0, filter.limit).map((row) =>
          statementReconciliationResponseSchema.parse({
            ...row.result,
            currentRevision,
            stale: BigInt(currentRevision) > BigInt(row.result.comparedRevision),
          }),
        );
        return { items, nextCursor: rows.length > filter.limit ? items.at(-1)!.id : null };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  return { create, get, list, evaluate, evaluation, evaluations };
}
