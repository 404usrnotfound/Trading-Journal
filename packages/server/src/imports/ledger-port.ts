import { sql } from '@journal/database';
import * as contract from '@journal/contracts';
import { decimalValue, quantizeDecimal } from '@journal/domain';
import { createHash } from 'node:crypto';
import { createFinancialLedger } from '../financial/ledger.js';
import { createCatalogServices } from '../financial/catalog.js';
import { createFinancialObservations } from '../financial/observations.js';
import { createAccountingServices } from '../accounting/service.js';
import { createCashReversals } from '../financial/cash-reversal.js';
import { queryRows, financialConflict, type FinancialPlatform } from '../financial/repository.js';
import type { AuthorizationContext } from '../services.js';
import type { DbTransaction } from '@journal/database';
type Defined<
  T,
  D extends readonly unknown[] = [unknown, unknown, unknown, unknown, unknown, unknown],
> = D extends readonly [unknown, ...infer R]
  ? T extends readonly unknown[]
    ? { [K in keyof T]: Defined<T[K], R> }
    : T extends object
      ? { [K in keyof T]: Defined<Exclude<T[K], undefined>, R> }
      : T
  : T;
function defined<T>(value: T): Defined<T> {
  if (Array.isArray(value)) return value.map(defined) as Defined<T>;
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, defined(child)]),
    ) as Defined<T>;
  return value as Defined<T>;
}
function stableCommandId(text: string): string {
  const hex = createHash('sha256').update(text).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}
export function importLedgerPort(tx: DbTransaction) {
  // Each core command gets a savepoint, including FinancialNoop's rollback path.
  const platform: FinancialPlatform = {
    withWorkspaceContext: (_context, callback) =>
      tx.transaction(async (inner) => {
        const result = await callback(inner);
        await inner.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
        await inner.execute(sql`SET CONSTRAINTS ALL DEFERRED`);
        return result;
      }),
  };
  const ledger = createFinancialLedger(platform),
    catalog = createCatalogServices(platform),
    observations = createFinancialObservations(platform),
    accounting = createAccountingServices(platform),
    reverseCash = createCashReversals(platform);
  async function apply(
    context: AuthorizationContext,
    kind: contract.ImportKind,
    value: unknown,
    commandId: string,
    namespace: string,
    sourceId: string | undefined,
  ) {
    const payload = contract.canonicalImportPayloadSchemas[kind].parse(value);
    const body = defined(payload);
    if (
      ['cash_movement', 'fee', 'income', 'tax', 'expense'].includes(kind) &&
      !(body as { cashBucketId?: string }).cashBucketId &&
      'accountId' in body &&
      'currencyId' in body &&
      typeof body.accountId === 'string' &&
      typeof body.currencyId === 'string'
    ) {
      const bucket = await ledger.createCashBucket(context, {
        commandId: stableCommandId(
          `import-settled-bucket/1:${context.workspaceId}:${body.accountId}:${body.currencyId}`,
        ),
        accountId: body.accountId,
        currencyId: body.currencyId,
        kind: 'settled',
      });
      return apply(
        context,
        kind,
        { ...body, cashBucketId: bucket.id },
        commandId,
        namespace,
        sourceId,
      );
    }
    const schema = contract.canonicalImportPayloadSchemas;
    const source = sourceId ? { namespace, id: sourceId } : undefined;
    switch (kind) {
      case 'cash_movement':
        return ledger.recordCashMovement(context, {
          ...defined(contract.cashMovementCreateSchema.parse(body)),
          commandId,
          ...(source ? { sourceIdentity: source } : {}),
        });
      case 'execution':
        return ledger.recordExecution(context, {
          ...defined(contract.executionCreateSchema.parse(body)),
          commandId,
          ...(source ? { sourceIdentity: source } : {}),
        });
      case 'fee':
        return ledger.recordFee(context, {
          ...defined(contract.feeCreateSchema.parse(body)),
          commandId,
        });
      case 'fx_conversion':
        return ledger.recordFxConversion(context, {
          ...defined(schema.fx_conversion.parse(body)),
          commandId,
        });
      case 'opening_lot':
        return ledger.recordOpeningLot(context, {
          ...defined(schema.opening_lot.parse(body)),
          commandId,
        });
      case 'instrument':
        return catalog.createInstrument(context, defined(schema.instrument.parse(body)), commandId);
      case 'order':
        return catalog.createOrder(context, defined(schema.order.parse(body)), commandId);
      case 'price':
        return observations.recordPriceObservation(context, {
          ...defined(schema.price.parse(body)),
          commandId,
        });
      case 'fx_rate':
        return observations.recordFxObservation(context, {
          ...defined(schema.fx_rate.parse(body)),
          commandId,
        });
      case 'account_valuation':
        return observations.recordAccountValuationObservation(context, {
          ...defined(schema.account_valuation.parse(body)),
          commandId,
        });
      case 'income':
        return accounting.recordIncome(context, {
          ...defined(contract.recordIncomeRequestSchema.parse(body)),
          commandId,
        });
      case 'tax':
        return accounting.recordTax(context, {
          ...defined(contract.recordTaxRequestSchema.parse(body)),
          commandId,
        });
      case 'expense':
        return accounting.recordExpense(context, {
          ...defined(contract.recordExpenseRequestSchema.parse(body)),
          commandId,
        });
      case 'execution_cash':
        throw financialConflict(
          'ACCOUNT_SCOPE_REQUIRED',
          'Use the account-bound reconciliation command.',
        );
    }
  }
  async function reconcileCash(
    context: AuthorizationContext,
    accountId: string,
    namespace: string,
    value: unknown,
  ) {
    const record = contract.canonicalImportPayloadSchemas.execution_cash.parse(value);
    const [claim] = await queryRows<{ result: { id: string }; state: string }>(
      tx,
      sql`SELECT result,state FROM app.import_sources WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${accountId}::uuid AND namespace=${namespace} AND record_kind='execution' AND identity_key=${`id:${record.executionSourceId}`}`,
    );
    const [execution] = await queryRows<{ id: string }>(
      tx,
      sql`SELECT id FROM app.executions WHERE workspace_id=${context.workspaceId}::uuid AND account_id=${accountId}::uuid AND source_namespace=${namespace} AND source_id=${record.executionSourceId}`,
    );
    const executionId = claim?.state === 'active' ? claim.result.id : execution?.id;
    if (!executionId)
      throw financialConflict(
        'FILL_REFERENCE_MISSING',
        'Import or identify the referenced execution first.',
      );
    const rows = await queryRows<{ amount: string }>(
      tx,
      sql`SELECT p.amount_raw AS amount FROM app.postings p JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id LEFT JOIN app.fees f ON f.workspace_id=e.workspace_id AND f.id=e.fee_id JOIN app.cash_buckets b ON b.workspace_id=p.workspace_id AND b.id=p.cash_bucket_id WHERE p.workspace_id=${context.workspaceId}::uuid AND b.account_id=${accountId}::uuid AND p.currency_id=${record.currencyId}::uuid AND ((e.execution_id=${executionId}::uuid AND ${record.scope !== 'fees'}) OR (f.execution_id=${executionId}::uuid AND ${record.scope !== 'principal'})) AND e.economic_at=${record.economicAt}::timestamptz`,
    );
    if (!rows.length)
      throw financialConflict(
        'FILL_CASH_REFERENCE_MISSING',
        'No cash posting matches this fill, currency, scope and date.',
      );
    const actual = quantizeDecimal(
      rows.reduce((sum, row) => sum.plus(decimalValue(row.amount)), decimalValue('0')),
    );
    if (!decimalValue(actual).eq(record.amount))
      throw financialConflict(
        'FILL_CASH_VARIANCE',
        `Reported cash ${record.amount} differs from the existing fill cash ${actual}. No extra cash will be posted.`,
      );
    return {
      executionId,
      actual,
      reported: record.amount,
      currencyId: record.currencyId,
      state: 'reconciled',
    };
  }
  async function correct(
    context: AuthorizationContext,
    kind: contract.ImportKind,
    payload: unknown,
    commandId: string,
    original: { id: string },
    reason: string,
    revision: string,
    namespace: string,
    _sourceId: string | undefined,
  ) {
    if (kind === 'execution')
      return ledger.correctExecution(context, {
        commandId,
        originalExecutionId: original.id,
        reason,
        replacement: defined(contract.executionCreateSchema.parse(payload)),
      });
    if (kind === 'cash_movement') {
      await reverseCash(context, {
        commandId: stableCommandId(`import-correction-reversal:${commandId}`),
        cashMovementId: original.id,
        reason,
        expectedSourceRevision: revision,
      });
      // Replacement has no duplicate original broker key; the import source chain retains it.
      return apply(context, kind, payload, commandId, namespace, undefined);
    }
    throw financialConflict(
      'CORRECTION_REVIEW_REQUIRED',
      'This record type needs an explicit domain correction outside this importer; it cannot be appended as new activity.',
    );
  }
  return { apply, reconcileCash, correct, reverseCash };
}
