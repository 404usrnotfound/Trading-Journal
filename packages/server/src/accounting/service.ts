import { randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import { decimal, decimalValue, quantizeDecimal } from '@journal/domain';
import {
  archivePortfolioRequestSchema,
  createCashTransferRequestSchema,
  createPortfolioRequestSchema,
  financialIdSchema,
  receiveCashTransferRequestSchema,
  recordExpenseRequestSchema,
  recordIncomeRequestSchema,
  recordTaxRequestSchema,
  updatePortfolioRequestSchema,
} from '@journal/contracts';
import { z } from 'zod';
import { financialTimestamp } from '../financial/reference-data.js';

const pageFilterSchema = z.strictObject({
  cursor: financialIdSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
const portfolioFilterSchema = pageFilterSchema.extend({
  includeArchived: z.boolean().default(false),
});
const transferFilterSchema = pageFilterSchema.extend({ asOf: financialTimestamp.optional() });
import { inaccessible } from '../errors.js';
import type { AuthorizationContext } from '../services.js';
import { requireCashBucket } from '../financial/commands.js';
import {
  executeFinancialCommand,
  financialConflict,
  financialInvalid,
  queryRows,
  type CommandState,
  type FinancialPlatform,
} from '../financial/repository.js';
import {
  financialInstantMicros,
  requireAccount,
  requireCurrency,
} from '../financial/reference-data.js';

type WithCommand<Input> = Input & { commandId: string };
export type PortfolioVersionDto = {
  id: string;
  portfolioId: string;
  version: number;
  name: string;
  description: string;
  environment: 'live' | 'paper';
  accountIds: string[];
  archived: boolean;
  reason: string;
  sourceRevision: string;
  commandId: string;
  createdAt: string;
};
export type PortfolioDto = {
  id: string;
  workspaceId: string;
  createdAt: string;
  currentVersion: PortfolioVersionDto;
};
export type AccountingMutationDto = { id: string; commandId: string; sourceRevision: string };
export type PortfolioMutationDto = AccountingMutationDto & { versionId: string; version: number };
export type CashTransferReceiptDto = AccountingMutationDto & {
  economicAt: string;
  orderingKey: string;
};
export type CashTransferDto = AccountingMutationDto & {
  sourceAccountId: string;
  destinationAccountId: string;
  sourceBucketId: string;
  destinationBucketId: string;
  currencyId: string;
  amount: string;
  economicAt: string;
  orderingKey: string;
  description: string;
  status: 'pending' | 'received';
  receipt: CashTransferReceiptDto | null;
};

function body<Input>(input: WithCommand<Input>): Input {
  const { commandId: _, ...value } = input;
  return value as Input;
}

function mutation(id: string, state: CommandState): AccountingMutationDto {
  return { id, commandId: state.eventId, sourceRevision: state.revision };
}

/** Keep PostgreSQL's six timestamp digits; JavaScript Date must not order financial events. */
const instantSql = (field: ReturnType<typeof sql>) =>
  sql`to_char(${field} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

async function version(
  tx: DbTransaction,
  workspaceId: string,
  versionId: string,
): Promise<PortfolioVersionDto> {
  const [row] = await queryRows<{ data: PortfolioVersionDto }>(
    tx,
    sql`SELECT jsonb_build_object(
      'id',v.id,'portfolioId',v.portfolio_id,'version',v.version,'name',v.name,
      'description',v.description,'environment',v.environment,'archived',v.archived,
      'reason',v.reason,'sourceRevision',v.source_revision::text,'commandId',v.command_id,
      'createdAt',${instantSql(sql`v.created_at`)},
      'accountIds',(SELECT coalesce(jsonb_agg(a.account_id ORDER BY a.account_id),'[]'::jsonb)
        FROM app.portfolio_version_accounts a
        WHERE a.workspace_id=v.workspace_id AND a.version_id=v.id)) AS data
      FROM app.portfolio_versions v
      WHERE v.workspace_id=${workspaceId}::uuid AND v.id=${versionId}::uuid`,
  );
  if (!row) throw inaccessible();
  return row.data;
}

async function readPortfolio(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
): Promise<PortfolioDto> {
  const [row] = await queryRows<{
    id: string;
    workspace_id: string;
    created_at: string;
    version_id: string;
  }>(
    tx,
    sql`SELECT p.id,p.workspace_id,${instantSql(sql`p.created_at`)} AS created_at,v.id AS version_id
      FROM app.portfolios p
      JOIN LATERAL (SELECT id FROM app.portfolio_versions
        WHERE workspace_id=p.workspace_id AND portfolio_id=p.id ORDER BY version DESC LIMIT 1) v ON true
      WHERE p.workspace_id=${workspaceId}::uuid AND p.id=${id}::uuid`,
  );
  if (!row) throw inaccessible();
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdAt: row.created_at,
    currentVersion: await version(tx, workspaceId, row.version_id),
  };
}

async function validateAccounts(
  tx: DbTransaction,
  workspaceId: string,
  definition: { accountIds: string[]; environment: 'live' | 'paper' },
) {
  for (const accountId of [...definition.accountIds].sort()) {
    const account = await requireAccount(tx, workspaceId, accountId);
    if (account.environment !== definition.environment)
      throw financialInvalid('Every portfolio account must belong to its declared environment.');
  }
}

async function insertPortfolioVersion(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  input: {
    portfolioId: string;
    versionId: string;
    version: number;
    name: string;
    description: string;
    environment: 'live' | 'paper';
    accountIds: string[];
    archived: boolean;
    reason: string;
  },
) {
  await tx.execute(sql`INSERT INTO app.portfolio_versions
    (workspace_id,id,portfolio_id,command_id,source_revision,version,name,description,environment,archived,reason,actor_id)
    VALUES (${context.workspaceId}::uuid,${input.versionId}::uuid,${input.portfolioId}::uuid,
      ${state.eventId}::uuid,${state.revision}::integer,${input.version},${input.name},${input.description},
      ${input.environment},${input.archived},${input.reason},${context.actorId})`);
  for (const accountId of [...input.accountIds].sort())
    await tx.execute(sql`INSERT INTO app.portfolio_version_accounts(workspace_id,version_id,account_id,actor_id)
      VALUES (${context.workspaceId}::uuid,${input.versionId}::uuid,${accountId}::uuid,${context.actorId})`);
}

/** New typed facts have relational source links and exactly one cash leg plus a control. */
async function postTypedCash(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  input: {
    kind: string;
    source: 'income' | 'transfer' | 'receipt';
    sourceId: string;
    economicAt: string;
    currencyId: string;
    cashBucketId: string;
    amount: string;
    controlKey: string;
  },
) {
  const eventId = randomUUID();
  const amount = decimal(input.amount);
  const counterpart = quantizeDecimal(decimalValue(amount).negated());
  await tx.execute(sql`INSERT INTO app.ledger_events
    (workspace_id,id,command_id,effect_key,currency_id,kind,economic_at,source_revision,payload,
      account_cash_event_id,cash_transfer_id,cash_transfer_receipt_id)
    VALUES (${context.workspaceId}::uuid,${eventId}::uuid,${state.eventId}::uuid,
      ${`${input.kind}:${input.sourceId}`},${input.currencyId}::uuid,${input.kind},
      ${input.economicAt}::timestamptz,${state.revision}::integer,
      ${JSON.stringify({ sourceId: input.sourceId })}::jsonb,
      ${input.source === 'income' ? input.sourceId : null}::uuid,
      ${input.source === 'transfer' ? input.sourceId : null}::uuid,
      ${input.source === 'receipt' ? input.sourceId : null}::uuid)`);
  await tx.execute(sql`INSERT INTO app.postings
    (workspace_id,id,ledger_event_id,currency_id,cash_bucket_id,control_key,amount_raw)
    VALUES (${context.workspaceId}::uuid,${randomUUID()}::uuid,${eventId}::uuid,
      ${input.currencyId}::uuid,${input.cashBucketId}::uuid,NULL,${amount}),
      (${context.workspaceId}::uuid,${randomUUID()}::uuid,${eventId}::uuid,
      ${input.currencyId}::uuid,NULL,${input.controlKey},${counterpart})`);
}

type CashEventKind =
  'dividend' | 'interest' | 'tax' | 'financing' | 'interest-expense' | 'other-expense';
async function insertCashEvent(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  input: {
    accountId: string;
    cashBucketId: string;
    currencyId: string;
    kind: CashEventKind;
    amount: string;
    economicAt: string;
    orderingKey: string;
    description: string;
    relatedIncomeId?: string | undefined;
  },
) {
  const id = randomUUID();
  const income = input.kind === 'dividend' || input.kind === 'interest';
  const ledgerKind = income
    ? 'account-income'
    : input.kind === 'tax'
      ? 'account-tax'
      : 'account-expense';
  const amount = decimal(input.amount);
  await tx.execute(sql`INSERT INTO app.account_cash_events
    (workspace_id,id,command_id,source_revision,account_id,cash_bucket_id,currency_id,kind,
      amount_raw,related_income_id,description,economic_at,ordering_key,actor_id)
    VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
      ${input.accountId}::uuid,${input.cashBucketId}::uuid,${input.currencyId}::uuid,${input.kind},
      ${amount},${input.relatedIncomeId ?? null}::uuid,${input.description},
      ${input.economicAt}::timestamptz,${input.orderingKey},${context.actorId})`);
  await postTypedCash(tx, context, state, {
    kind: ledgerKind,
    source: 'income',
    sourceId: id,
    economicAt: input.economicAt,
    currencyId: input.currencyId,
    cashBucketId: input.cashBucketId,
    amount: income ? amount : quantizeDecimal(decimalValue(amount).negated()),
    controlKey: income ? `income:${input.kind}` : `expense:${input.kind}`,
  });
  return id;
}

async function validateCashEvent(
  tx: DbTransaction,
  context: AuthorizationContext,
  input: { accountId: string; cashBucketId: string; currencyId: string; economicAt: string },
) {
  await requireAccount(tx, context.workspaceId, input.accountId, true, input.economicAt);
  await requireCurrency(tx, context.workspaceId, input.currencyId);
  await requireCashBucket(
    tx,
    context.workspaceId,
    input.cashBucketId,
    input.accountId,
    input.currencyId,
  );
}

async function insertReceipt(
  tx: DbTransaction,
  context: AuthorizationContext,
  state: CommandState,
  transfer: Pick<CashTransferDto, 'id' | 'destinationBucketId' | 'currencyId' | 'amount'>,
  input: { economicAt: string; orderingKey: string },
) {
  const id = randomUUID();
  await tx.execute(sql`INSERT INTO app.cash_transfer_receipts
    (workspace_id,id,transfer_id,command_id,source_revision,economic_at,ordering_key,actor_id)
    VALUES (${context.workspaceId}::uuid,${id}::uuid,${transfer.id}::uuid,${state.eventId}::uuid,
      ${state.revision}::integer,${input.economicAt}::timestamptz,${input.orderingKey},${context.actorId})`);
  await postTypedCash(tx, context, state, {
    kind: 'cash-transfer-receipt',
    source: 'receipt',
    sourceId: id,
    economicAt: input.economicAt,
    currencyId: transfer.currencyId,
    cashBucketId: transfer.destinationBucketId,
    amount: transfer.amount,
    controlKey: `owned-transfer:${transfer.id}`,
  });
  return id;
}

async function readTransfer(
  tx: DbTransaction,
  workspaceId: string,
  id: string,
  asOf?: string,
): Promise<CashTransferDto> {
  const [row] = await queryRows<{ data: Omit<CashTransferDto, 'status'> }>(
    tx,
    sql`SELECT jsonb_build_object('id',t.id,'commandId',t.command_id,'sourceRevision',t.source_revision::text,
      'sourceAccountId',t.source_account_id,'destinationAccountId',t.destination_account_id,
      'sourceBucketId',t.source_bucket_id,'destinationBucketId',t.destination_bucket_id,
      'currencyId',t.currency_id,'amount',t.amount_raw,'economicAt',${instantSql(sql`t.economic_at`)},
      'orderingKey',t.ordering_key,'description',t.description,
      'receipt',(SELECT jsonb_build_object('id',r.id,'commandId',r.command_id,
        'sourceRevision',r.source_revision::text,'economicAt',${instantSql(sql`r.economic_at`)},
        'orderingKey',r.ordering_key) FROM app.cash_transfer_receipts r
        WHERE r.workspace_id=t.workspace_id AND r.transfer_id=t.id
        AND (${asOf ?? null}::timestamptz IS NULL OR r.economic_at<=${asOf ?? null}::timestamptz))) AS data
      FROM app.cash_transfers t WHERE t.workspace_id=${workspaceId}::uuid AND t.id=${id}::uuid
      AND (${asOf ?? null}::timestamptz IS NULL OR t.economic_at<=${asOf ?? null}::timestamptz)`,
  );
  if (!row) throw inaccessible();
  return { ...row.data, status: row.data.receipt ? 'received' : 'pending' };
}

/** Portfolio membership and accounting sources are immutable, auditable financial commands. */
export function createAccountingServices(platform: FinancialPlatform) {
  async function createPortfolio(
    context: AuthorizationContext,
    value: WithCommand<z.input<typeof createPortfolioRequestSchema>>,
  ) {
    const input = createPortfolioRequestSchema.parse(body(value));
    return executeFinancialCommand(
      platform,
      context,
      { commandId: value.commandId, kind: 'portfolio-created', payload: input },
      async (tx, state): Promise<PortfolioMutationDto> => {
        await validateAccounts(tx, context.workspaceId, input);
        const id = randomUUID();
        const versionId = randomUUID();
        await tx.execute(sql`INSERT INTO app.portfolios(workspace_id,id,command_id,source_revision,actor_id)
          VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,${context.actorId})`);
        await insertPortfolioVersion(tx, context, state, {
          ...input,
          portfolioId: id,
          versionId,
          version: 1,
          archived: false,
          reason: 'Created',
        });
        return { ...mutation(id, state), versionId, version: 1 };
      },
    );
  }

  async function updatePortfolio(
    context: AuthorizationContext,
    portfolioId: string,
    value: WithCommand<z.input<typeof updatePortfolioRequestSchema>>,
  ) {
    const id = financialIdSchema.parse(portfolioId).toLowerCase();
    const input = updatePortfolioRequestSchema.parse(body(value));
    return executeFinancialCommand(
      platform,
      context,
      { commandId: value.commandId, kind: 'portfolio-version-created', payload: { id, ...input } },
      async (tx, state): Promise<PortfolioMutationDto> => {
        const current = await readPortfolio(tx, context.workspaceId, id);
        if (current.currentVersion.version !== input.expectedVersion)
          throw financialConflict(
            'STALE_PORTFOLIO_VERSION',
            'Reload the current portfolio version before editing.',
          );
        if (current.currentVersion.archived)
          throw financialConflict(
            'PORTFOLIO_ARCHIVED',
            'An archived portfolio cannot receive a new definition.',
          );
        await validateAccounts(tx, context.workspaceId, input);
        const versionId = randomUUID();
        const next = current.currentVersion.version + 1;
        await insertPortfolioVersion(tx, context, state, {
          ...input,
          portfolioId: id,
          versionId,
          version: next,
          archived: false,
        });
        return { ...mutation(id, state), versionId, version: next };
      },
    );
  }

  async function archivePortfolio(
    context: AuthorizationContext,
    portfolioId: string,
    value: WithCommand<z.input<typeof archivePortfolioRequestSchema>>,
  ) {
    const id = financialIdSchema.parse(portfolioId).toLowerCase();
    const input = archivePortfolioRequestSchema.parse(body(value));
    return executeFinancialCommand(
      platform,
      context,
      { commandId: value.commandId, kind: 'portfolio-archived', payload: { id, ...input } },
      async (tx, state): Promise<PortfolioMutationDto> => {
        const current = await readPortfolio(tx, context.workspaceId, id);
        if (current.currentVersion.version !== input.expectedVersion)
          throw financialConflict(
            'STALE_PORTFOLIO_VERSION',
            'Reload the current portfolio version before archiving.',
          );
        if (current.currentVersion.archived)
          throw financialConflict('PORTFOLIO_ARCHIVED', 'The portfolio is already archived.');
        const versionId = randomUUID();
        const next = current.currentVersion.version + 1;
        await insertPortfolioVersion(tx, context, state, {
          ...current.currentVersion,
          portfolioId: id,
          versionId,
          version: next,
          archived: true,
          reason: input.reason,
        });
        return { ...mutation(id, state), versionId, version: next };
      },
    );
  }

  async function recordIncome(
    context: AuthorizationContext,
    value: WithCommand<z.input<typeof recordIncomeRequestSchema>>,
  ) {
    const input = recordIncomeRequestSchema.parse(body(value));
    return executeFinancialCommand(
      platform,
      context,
      { commandId: value.commandId, kind: 'account-income-recorded', payload: input },
      async (tx, state) => {
        await validateCashEvent(tx, context, input);
        const id = await insertCashEvent(tx, context, state, {
          ...input,
          description: input.description ?? '',
        });
        if (input.withholding !== undefined && !decimalValue(input.withholding).isZero())
          await insertCashEvent(tx, context, state, {
            ...input,
            kind: 'tax',
            amount: input.withholding,
            relatedIncomeId: id,
            description: input.description ?? '',
          });
        return mutation(id, state);
      },
    );
  }

  async function recordTax(
    context: AuthorizationContext,
    value: WithCommand<z.input<typeof recordTaxRequestSchema>>,
  ) {
    const input = recordTaxRequestSchema.parse(body(value));
    return executeFinancialCommand(
      platform,
      context,
      { commandId: value.commandId, kind: 'account-tax-recorded', payload: input },
      async (tx, state) => {
        await validateCashEvent(tx, context, input);
        if (input.relatedIncomeId) {
          const [income] = await queryRows<{
            account_id: string;
            currency_id: string;
            kind: string;
          }>(
            tx,
            sql`SELECT account_id,currency_id,kind FROM app.account_cash_events
              WHERE workspace_id=${context.workspaceId}::uuid AND id=${input.relatedIncomeId}::uuid`,
          );
          if (!income) throw inaccessible();
          if (
            income.account_id !== input.accountId ||
            income.currency_id !== input.currencyId ||
            (income.kind !== 'dividend' && income.kind !== 'interest')
          )
            throw financialInvalid(
              'A related income source must belong to this account and monetary unit.',
            );
        }
        const id = await insertCashEvent(tx, context, state, { ...input, kind: 'tax' });
        return mutation(id, state);
      },
    );
  }

  async function recordExpense(
    context: AuthorizationContext,
    value: WithCommand<z.input<typeof recordExpenseRequestSchema>>,
  ) {
    const input = recordExpenseRequestSchema.parse(body(value));
    return executeFinancialCommand(
      platform,
      context,
      { commandId: value.commandId, kind: 'account-expense-recorded', payload: input },
      async (tx, state) => {
        await validateCashEvent(tx, context, input);
        const kind =
          input.kind === 'interest'
            ? 'interest-expense'
            : input.kind === 'other'
              ? 'other-expense'
              : 'financing';
        const id = await insertCashEvent(tx, context, state, { ...input, kind });
        return mutation(id, state);
      },
    );
  }

  async function createCashTransfer(
    context: AuthorizationContext,
    value: WithCommand<z.input<typeof createCashTransferRequestSchema>>,
  ) {
    const input = createCashTransferRequestSchema.parse(body(value));
    return executeFinancialCommand(
      platform,
      context,
      { commandId: value.commandId, kind: 'owned-cash-transfer-departed', payload: input },
      async (tx, state) => {
        const source = await requireCashBucket(tx, context.workspaceId, input.sourceBucketId);
        const destination = await requireCashBucket(
          tx,
          context.workspaceId,
          input.destinationBucketId,
        );
        if (
          source.account_id === destination.account_id ||
          source.currency_id !== destination.currency_id
        )
          throw financialInvalid(
            'An owned cash transfer requires distinct accounts in the same monetary unit; record FX separately.',
          );
        const sourceAccount = await requireAccount(
          tx,
          context.workspaceId,
          source.account_id,
          true,
          input.economicAt,
        );
        const destinationAccount = await requireAccount(
          tx,
          context.workspaceId,
          destination.account_id,
          true,
          input.economicAt,
        );
        if (sourceAccount.environment !== destinationAccount.environment)
          throw financialInvalid('A cash transfer cannot cross live and paper accounts.');
        await requireCurrency(tx, context.workspaceId, source.currency_id);
        if (
          input.receiptAt !== undefined &&
          financialInstantMicros(input.receiptAt) !== financialInstantMicros(input.economicAt)
        )
          throw financialInvalid(
            'An immediate receipt must have the departure instant; record delayed receipts only when evidenced.',
          );
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.cash_transfers
          (workspace_id,id,command_id,source_revision,source_account_id,destination_account_id,
            source_bucket_id,destination_bucket_id,currency_id,amount_raw,economic_at,ordering_key,description,actor_id)
          VALUES (${context.workspaceId}::uuid,${id}::uuid,${state.eventId}::uuid,${state.revision}::integer,
            ${source.account_id}::uuid,${destination.account_id}::uuid,${source.id}::uuid,${destination.id}::uuid,
            ${source.currency_id}::uuid,${input.amount},${input.economicAt}::timestamptz,
            ${input.orderingKey},${input.description},${context.actorId})`);
        await postTypedCash(tx, context, state, {
          kind: 'cash-transfer-departure',
          source: 'transfer',
          sourceId: id,
          economicAt: input.economicAt,
          currencyId: source.currency_id,
          cashBucketId: source.id,
          amount: quantizeDecimal(decimalValue(input.amount).negated()),
          controlKey: `owned-transfer:${id}`,
        });
        if (input.receiptAt !== undefined)
          await insertReceipt(
            tx,
            context,
            state,
            {
              id,
              destinationBucketId: destination.id,
              currencyId: source.currency_id,
              amount: input.amount,
            },
            { economicAt: input.receiptAt, orderingKey: input.orderingKey },
          );
        return mutation(id, state);
      },
    );
  }

  async function receiveCashTransfer(
    context: AuthorizationContext,
    transferId: string,
    value: WithCommand<z.input<typeof receiveCashTransferRequestSchema>>,
  ) {
    const id = financialIdSchema.parse(transferId).toLowerCase();
    const input = receiveCashTransferRequestSchema.parse(body(value));
    return executeFinancialCommand(
      platform,
      context,
      {
        commandId: value.commandId,
        kind: 'owned-cash-transfer-received',
        payload: { id, ...input },
      },
      async (tx, state) => {
        const transfer = await readTransfer(tx, context.workspaceId, id);
        const reversed = await queryRows(
          tx,
          sql`SELECT r.id FROM app.ledger_events e
          JOIN app.ledger_events r ON r.workspace_id=e.workspace_id AND r.reversal_of_id=e.id
          WHERE e.workspace_id=${context.workspaceId}::uuid AND e.cash_transfer_id=${id}::uuid`,
        );
        if (reversed.length)
          throw financialConflict(
            'TRANSFER_REVERSED',
            'A historically reversed transfer cannot receive a receipt.',
          );
        if (transfer.receipt)
          throw financialConflict(
            'TRANSFER_ALREADY_RECEIVED',
            'This transfer already has an immutable receipt.',
          );
        const departureTime = financialInstantMicros(transfer.economicAt);
        const receiptTime = financialInstantMicros(input.economicAt);
        if (
          receiptTime < departureTime ||
          (receiptTime === departureTime &&
            BigInt(input.orderingKey) < BigInt(transfer.orderingKey))
        )
          throw financialInvalid('A receipt cannot precede its transfer departure.');
        // Historical evidence may complete a transfer after an account has been archived.
        await requireAccount(
          tx,
          context.workspaceId,
          transfer.destinationAccountId,
          false,
          input.economicAt,
        );
        await requireCashBucket(
          tx,
          context.workspaceId,
          transfer.destinationBucketId,
          transfer.destinationAccountId,
          transfer.currencyId,
        );
        const receiptId = await insertReceipt(tx, context, state, transfer, input);
        return mutation(receiptId, state);
      },
    );
  }

  const portfolio = (context: AuthorizationContext, portfolioId: string) =>
    platform.withWorkspaceContext(
      context,
      (tx) =>
        readPortfolio(tx, context.workspaceId, financialIdSchema.parse(portfolioId).toLowerCase()),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

  async function portfolios(
    context: AuthorizationContext,
    value: z.input<typeof portfolioFilterSchema> = {},
  ) {
    const filter = portfolioFilterSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT p.id FROM app.portfolios p JOIN LATERAL (SELECT archived FROM app.portfolio_versions
          WHERE workspace_id=p.workspace_id AND portfolio_id=p.id ORDER BY version DESC LIMIT 1) v ON true
          WHERE p.workspace_id=${context.workspaceId}::uuid AND (${filter.includeArchived} OR NOT v.archived)
          AND (${filter.cursor ?? null}::uuid IS NULL OR p.id>${filter.cursor ?? null}::uuid)
          ORDER BY p.id LIMIT ${filter.limit + 1}`,
        );
        const page = rows.slice(0, filter.limit);
        const items: PortfolioDto[] = [];
        for (const item of page) items.push(await readPortfolio(tx, context.workspaceId, item.id));
        return { items, nextCursor: rows.length > filter.limit ? page.at(-1)!.id : null };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async function portfolioVersions(
    context: AuthorizationContext,
    portfolioId: string,
    value: z.input<typeof pageFilterSchema> = {},
  ) {
    const id = financialIdSchema.parse(portfolioId).toLowerCase();
    const filter = pageFilterSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        await readPortfolio(tx, context.workspaceId, id);
        let beforeVersion: number | null = null;
        if (filter.cursor) {
          const cursorVersion = await version(tx, context.workspaceId, filter.cursor);
          if (cursorVersion.portfolioId !== id) throw inaccessible();
          beforeVersion = cursorVersion.version;
        }
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.portfolio_versions WHERE workspace_id=${context.workspaceId}::uuid AND portfolio_id=${id}::uuid
          AND (${beforeVersion}::integer IS NULL OR version<${beforeVersion}::integer)
          ORDER BY version DESC LIMIT ${filter.limit + 1}`,
        );
        const page = rows.slice(0, filter.limit);
        const items: PortfolioVersionDto[] = [];
        for (const item of page) items.push(await version(tx, context.workspaceId, item.id));
        return { items, nextCursor: rows.length > filter.limit ? page.at(-1)!.id : null };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  async function cashTransfers(
    context: AuthorizationContext,
    value: z.input<typeof transferFilterSchema> = {},
  ) {
    const filter = transferFilterSchema.parse(value);
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`SELECT id FROM app.cash_transfers t WHERE workspace_id=${context.workspaceId}::uuid
          AND NOT EXISTS (SELECT 1 FROM app.ledger_events e JOIN app.ledger_events r
            ON r.workspace_id=e.workspace_id AND r.reversal_of_id=e.id
            WHERE e.workspace_id=t.workspace_id AND e.cash_transfer_id=t.id)
          AND (${filter.cursor ?? null}::uuid IS NULL OR id>${filter.cursor ?? null}::uuid)
          AND (${filter.asOf ?? null}::timestamptz IS NULL OR economic_at<=${filter.asOf ?? null}::timestamptz)
          ORDER BY id LIMIT ${filter.limit + 1}`,
        );
        const page = rows.slice(0, filter.limit);
        const items: CashTransferDto[] = [];
        for (const item of page)
          items.push(await readTransfer(tx, context.workspaceId, item.id, filter.asOf));
        return { items, nextCursor: rows.length > filter.limit ? page.at(-1)!.id : null };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  return {
    createPortfolio,
    updatePortfolio,
    archivePortfolio,
    portfolios,
    portfolio,
    portfolioVersions,
    recordIncome,
    recordTax,
    recordExpense,
    createCashTransfer,
    receiveCashTransfer,
    cashTransfers,
  };
}
