import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accountingMutationResponseSchema,
  cashTransferListResponseSchema,
  portfolioListResponseSchema,
  portfolioMutationResponseSchema,
  portfolioResponseSchema,
  portfolioVersionListResponseSchema,
} from '@journal/contracts';
import { decimalValue } from '@journal/domain';
import { createAccountingServices } from '../../packages/server/src/accounting/service.js';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createAccountingFixture } from './accounting-fixture.js';

const initial = '2025-01-01T00:00:00.000001Z';
const at = (day: number) => `2025-02-${String(day).padStart(2, '0')}T12:00:00.000001Z`;

describe('portfolio definitions, typed account cash effects and owned transfers on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let accounting: ReturnType<typeof createAccountingServices>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let usd: string;
  let eur: string;

  beforeAll(async () => {
    fixture = await createAccountingFixture();
    accounting = createAccountingServices(fixture.services);
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    for (const code of ['USD', 'EUR']) {
      const currency = await catalog.createCurrency(
        fixture.owner.context,
        {
          namespace: 'iso:4217',
          code,
          kind: 'fiat',
          unitIdentity: `iso:${code}`,
          name: code,
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: initial,
        },
        randomUUID(),
      );
      if (code === 'USD') usd = currency.id;
      else eur = currency.id;
    }
  });

  afterAll(async () => fixture?.cleanup());

  async function account(environment: 'live' | 'paper' = 'live', currencyId = usd) {
    const broker = await catalog.createBroker(
      fixture.owner.context,
      { name: `Broker ${randomUUID()}`, sourceNamespace: `broker:${randomUUID()}` },
      randomUUID(),
    );
    const created = await catalog.createAccount(
      fixture.owner.context,
      {
        name: `Account ${randomUUID()}`,
        brokerId: broker.id,
        environment,
        accountType: 'margin',
        baseCurrencyId: currencyId,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt: initial,
      },
      randomUUID(),
    );
    const bucket = await ledger.createCashBucket(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: created.id,
      currencyId,
      kind: 'settled',
    });
    return { ...created, bucket: bucket.id, currencyId };
  }

  async function effectsSnapshot() {
    const result = await fixture.admin.pool.query(
      `SELECT
      (SELECT revision FROM app.financial_state WHERE workspace_id=$1) AS revision,
      (SELECT count(*)::integer FROM app.financial_commands WHERE workspace_id=$1) AS commands,
      (SELECT count(*)::integer FROM app.audit_events WHERE workspace_id=$1) AS audits,
      (SELECT count(*)::integer FROM app.outbox_events WHERE workspace_id=$1) AS outbox,
      (SELECT count(*)::integer FROM app.ledger_events WHERE workspace_id=$1) AS events,
      (SELECT count(*)::integer FROM app.postings WHERE workspace_id=$1) AS postings,
      (SELECT count(*)::integer FROM app.account_cash_events WHERE workspace_id=$1) AS cash_events,
      (SELECT count(*)::integer FROM app.portfolio_versions WHERE workspace_id=$1) AS versions,
      (SELECT count(*)::integer FROM app.cash_transfer_receipts WHERE workspace_id=$1) AS receipts`,
      [fixture.owner.context.workspaceId],
    );
    return result.rows[0];
  }

  async function cash(accountId: string) {
    const rows = await ledger.cashBalances(fixture.owner.context, { accountIds: [accountId] });
    return rows.reduce((sum, item) => sum.plus(item.amount), decimalValue('0')).toFixed();
  }

  function incomeInput(ownerAccount: Awaited<ReturnType<typeof account>>) {
    return {
      commandId: randomUUID(),
      accountId: ownerAccount.id,
      cashBucketId: ownerAccount.bucket,
      currencyId: ownerAccount.currencyId,
      kind: 'dividend' as const,
      amount: '100',
      withholding: '15',
      economicAt: at(2),
      orderingKey: '1',
      description: 'Gross dividend with explicit withholding',
    };
  }

  it('creates independent overlapping portfolios across brokers without duplicating accounts inside a version', async () => {
    const first = await account();
    const second = await account();
    expect(first.brokerId).not.toBe(second.brokerId);
    const result = await accounting.createPortfolio(fixture.owner.context, {
      commandId: randomUUID(),
      name: 'Trading portfolio',
      environment: 'live',
      accountIds: [first.id, second.id],
    });
    expect(portfolioMutationResponseSchema.parse(result)).toEqual(result);
    const overlapping = await accounting.createPortfolio(fixture.owner.context, {
      commandId: randomUUID(),
      name: 'Broker subset',
      environment: 'live',
      accountIds: [second.id],
    });
    const read = await accounting.portfolio(fixture.viewer.context, result.id);
    expect(portfolioResponseSchema.parse(read)).toEqual(read);
    expect(read.currentVersion).toMatchObject({
      id: result.versionId,
      version: 1,
      description: '',
      environment: 'live',
      archived: false,
      accountIds: [first.id, second.id].sort(),
    });
    expect(
      (await accounting.portfolio(fixture.owner.context, overlapping.id)).currentVersion.accountIds,
    ).toEqual([second.id]);
  });

  it('appends full scope versions and preserves old account membership, names and definitions', async () => {
    const first = await account();
    const second = await account();
    const original = await accounting.createPortfolio(fixture.owner.context, {
      commandId: randomUUID(),
      name: 'Original scope',
      description: 'Version one',
      environment: 'live',
      accountIds: [first.id],
    });
    const updated = await accounting.updatePortfolio(fixture.editor.context, original.id, {
      commandId: randomUUID(),
      expectedVersion: 1,
      reason: 'Add second broker',
      name: 'Expanded scope',
      description: 'Version two',
      environment: 'live',
      accountIds: [first.id, second.id],
    });
    expect(updated.version).toBe(2);
    const history = await accounting.portfolioVersions(fixture.viewer.context, original.id);
    expect(portfolioVersionListResponseSchema.parse(history)).toEqual(history);
    expect(history.items.map((item) => item.version)).toEqual([2, 1]);
    expect(history.items[1]).toMatchObject({
      id: original.versionId,
      name: 'Original scope',
      description: 'Version one',
      accountIds: [first.id],
      archived: false,
    });
    expect((await accounting.portfolio(fixture.owner.context, original.id)).currentVersion.id).toBe(
      updated.versionId,
    );
  });

  it('replays a completed definition update after later versions without rewriting its stored response', async () => {
    const ownerAccount = await account();
    const original = await accounting.createPortfolio(fixture.owner.context, {
      commandId: randomUUID(),
      name: 'Retry scope',
      environment: 'live',
      accountIds: [ownerAccount.id],
    });
    const input = {
      commandId: randomUUID(),
      name: 'Second',
      environment: 'live' as const,
      accountIds: [ownerAccount.id],
      expectedVersion: 1,
      reason: 'Revise once',
    };
    const second = await accounting.updatePortfolio(fixture.owner.context, original.id, input);
    await accounting.updatePortfolio(fixture.owner.context, original.id, {
      ...input,
      commandId: randomUUID(),
      expectedVersion: 2,
      name: 'Third',
      reason: 'Revise again',
    });
    const before = await effectsSnapshot();
    expect(await accounting.updatePortfolio(fixture.owner.context, original.id, input)).toEqual(
      second,
    );
    expect(await effectsSnapshot()).toEqual(before);
  });

  it('archives with another immutable version while retaining all definitions for historical reads', async () => {
    const ownerAccount = await account();
    const created = await accounting.createPortfolio(fixture.owner.context, {
      commandId: randomUUID(),
      name: 'Archive me',
      environment: 'live',
      accountIds: [ownerAccount.id],
    });
    const archived = await accounting.archivePortfolio(fixture.owner.context, created.id, {
      commandId: randomUUID(),
      expectedVersion: 1,
      reason: 'No longer used',
    });
    const current = await accounting.portfolio(fixture.viewer.context, created.id);
    expect(current.currentVersion).toMatchObject({
      id: archived.versionId,
      version: 2,
      name: 'Archive me',
      archived: true,
      reason: 'No longer used',
      accountIds: [ownerAccount.id],
    });
    expect(
      (await accounting.portfolioVersions(fixture.owner.context, created.id)).items[1]!.archived,
    ).toBe(false);
    expect(
      (await accounting.portfolios(fixture.owner.context)).items.some(
        (item) => item.id === created.id,
      ),
    ).toBe(false);
    expect(
      (
        await accounting.portfolios(fixture.owner.context, { includeArchived: true, limit: 100 })
      ).items.some((item) => item.id === created.id),
    ).toBe(true);
    const before = await effectsSnapshot();
    await expect(
      accounting.updatePortfolio(fixture.owner.context, created.id, {
        commandId: randomUUID(),
        expectedVersion: 2,
        name: 'Forbidden',
        environment: 'live',
        accountIds: [ownerAccount.id],
        reason: 'Try again',
      }),
    ).rejects.toMatchObject({ code: 'PORTFOLIO_ARCHIVED' });
    await expect(
      accounting.archivePortfolio(fixture.owner.context, created.id, {
        commandId: randomUUID(),
        expectedVersion: 2,
        reason: 'Again',
      }),
    ).rejects.toMatchObject({ code: 'PORTFOLIO_ARCHIVED' });
    expect(await effectsSnapshot()).toEqual(before);
  });

  it('rejects stale concurrent definitions atomically', async () => {
    const ownerAccount = await account();
    const created = await accounting.createPortfolio(fixture.owner.context, {
      commandId: randomUUID(),
      name: 'Concurrent edits',
      environment: 'live',
      accountIds: [ownerAccount.id],
    });
    const before = await effectsSnapshot();
    const result = await Promise.allSettled(
      ['A', 'B'].map((name) =>
        accounting.updatePortfolio(fixture.owner.context, created.id, {
          commandId: randomUUID(),
          expectedVersion: 1,
          name,
          environment: 'live',
          accountIds: [ownerAccount.id],
          reason: 'Competing edit',
        }),
      ),
    );
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const failed = result.find((item) => item.status === 'rejected');
    expect(failed?.status === 'rejected' && failed.reason).toMatchObject({
      code: 'STALE_PORTFOLIO_VERSION',
    });
    const after = await effectsSnapshot();
    expect(after.revision - before.revision).toBe(1);
    expect(after.commands - before.commands).toBe(1);
    expect(after.versions - before.versions).toBe(1);
  });

  it('rejects empty, repeated and mixed live/paper portfolio scopes without side effects', async () => {
    const live = await account();
    const paper = await account('paper');
    const before = await effectsSnapshot();
    for (const accountIds of [[], [live.id, live.id], [live.id, paper.id]])
      await expect(
        accounting.createPortfolio(fixture.owner.context, {
          commandId: randomUUID(),
          name: 'Invalid',
          environment: 'live',
          accountIds,
        }),
      ).rejects.toBeDefined();
    expect(await effectsSnapshot()).toEqual(before);
  });

  it('rejects archived accounts in a new portfolio definition', async () => {
    const ownerAccount = await account();
    await catalog.archiveCatalog(
      fixture.owner.context,
      'account',
      ownerAccount.id,
      { expectedRevision: ownerAccount.revision, reason: 'Close account' },
      randomUUID(),
    );
    const before = await effectsSnapshot();
    await expect(
      accounting.createPortfolio(fixture.owner.context, {
        commandId: randomUUID(),
        name: 'Archived account',
        environment: 'live',
        accountIds: [ownerAccount.id],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_REFERENCE' });
    expect(await effectsSnapshot()).toEqual(before);
  });

  it('paginates portfolio identities and version history with complete current snapshots', async () => {
    const ownerAccount = await account();
    const created = await accounting.createPortfolio(fixture.owner.context, {
      commandId: randomUUID(),
      name: 'Paging',
      environment: 'live',
      accountIds: [ownerAccount.id],
    });
    for (let index = 1; index <= 3; index++)
      await accounting.updatePortfolio(fixture.owner.context, created.id, {
        commandId: randomUUID(),
        expectedVersion: index,
        name: `Paging ${index + 1}`,
        environment: 'live',
        accountIds: [ownerAccount.id],
        reason: 'Next page',
      });
    const first = await accounting.portfolioVersions(fixture.owner.context, created.id, {
      limit: 2,
    });
    expect(first.items.map((item) => item.version)).toEqual([4, 3]);
    expect(first.nextCursor).toBe(first.items[1]!.id);
    const second = await accounting.portfolioVersions(fixture.owner.context, created.id, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((item) => item.version)).toEqual([2, 1]);
    expect(second.nextCursor).toBeNull();
    const list = await accounting.portfolios(fixture.owner.context, {
      limit: 1,
      includeArchived: true,
    });
    expect(portfolioListResponseSchema.parse(list)).toEqual(list);
    expect(list.items).toHaveLength(1);
    const next = await accounting.portfolios(fixture.owner.context, {
      limit: 1,
      includeArchived: true,
      cursor: list.nextCursor!,
    });
    expect(next.items[0]!.id).not.toBe(list.items[0]!.id);
  });

  it('records gross dividends and separate tax withholding atomically, with exact net cash', async () => {
    const ownerAccount = await account();
    const input = incomeInput(ownerAccount);
    const before = await effectsSnapshot();
    const result = await accounting.recordIncome(fixture.owner.context, input);
    expect(accountingMutationResponseSchema.parse(result)).toEqual(result);
    expect(await cash(ownerAccount.id)).toBe('85');
    const rows = await fixture.admin.pool.query(
      `SELECT id,kind,amount_raw,related_income_id,command_id,
      source_revision FROM app.account_cash_events WHERE workspace_id=$1 AND command_id=$2 ORDER BY kind`,
      [fixture.owner.context.workspaceId, input.commandId],
    );
    expect(rows.rows.map((item) => [item.kind, item.amount_raw])).toEqual([
      ['dividend', '100'],
      ['tax', '15'],
    ]);
    expect(rows.rows[1]!.related_income_id).toBe(result.id);
    expect(
      rows.rows.every(
        (item) =>
          item.command_id === input.commandId &&
          String(item.source_revision) === result.sourceRevision,
      ),
    ).toBe(true);
    const after = await effectsSnapshot();
    expect(after.revision - before.revision).toBe(1);
    expect(after.commands - before.commands).toBe(1);
    expect(after.audits - before.audits).toBe(1);
    expect(after.outbox - before.outbox).toBe(1);
    expect(after.cash_events - before.cash_events).toBe(2);
    expect(after.events - before.events).toBe(2);
    expect(after.postings - before.postings).toBe(4);
    const balanced = await fixture.admin.pool.query(
      `SELECT e.id,sum(p.amount)::text AS total
      FROM app.ledger_events e JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id
      WHERE e.workspace_id=$1 AND e.command_id=$2 GROUP BY e.id`,
      [fixture.owner.context.workspaceId, input.commandId],
    );
    expect(balanced.rows.every((item) => decimalValue(item.total).isZero())).toBe(true);
  });

  it('omits zero withholding and preserves separate dividend and interest facts', async () => {
    const ownerAccount = await account();
    await accounting.recordIncome(fixture.owner.context, {
      ...incomeInput(ownerAccount),
      withholding: '0',
    });
    await accounting.recordIncome(fixture.owner.context, {
      ...incomeInput(ownerAccount),
      commandId: randomUUID(),
      kind: 'interest',
      amount: '1.25',
      withholding: undefined,
      orderingKey: '2',
    });
    expect(await cash(ownerAccount.id)).toBe('101.25');
    const facts = await fixture.admin.pool.query(
      `SELECT kind FROM app.account_cash_events
      WHERE workspace_id=$1 AND account_id=$2 ORDER BY kind`,
      [fixture.owner.context.workspaceId, ownerAccount.id],
    );
    expect(facts.rows.map((item) => item.kind)).toEqual(['dividend', 'interest']);
  });

  it('preserves all 36 fractional source digits including a one-attounit-scale cash amount', async () => {
    const ownerAccount = await account();
    const tiny = '0.000000000000000000000000000000000001';
    const result = await accounting.recordIncome(fixture.owner.context, {
      ...incomeInput(ownerAccount),
      amount: tiny,
      withholding: undefined,
    });
    expect(await cash(ownerAccount.id)).toBe(tiny);
    const rows = await fixture.admin.pool.query(
      `SELECT p.amount_raw FROM app.postings p JOIN app.ledger_events e
      ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
      WHERE e.workspace_id=$1 AND e.account_cash_event_id=$2 ORDER BY p.amount`,
      [fixture.owner.context.workspaceId, result.id],
    );
    expect(rows.rows.map((item) => item.amount_raw)).toEqual([`-${tiny}`, tiny]);
  });

  it('records taxes and refunds as signed tax facts rather than income', async () => {
    const ownerAccount = await account();
    const original = await accounting.recordIncome(fixture.owner.context, {
      ...incomeInput(ownerAccount),
      withholding: undefined,
    });
    const input = {
      commandId: randomUUID(),
      accountId: ownerAccount.id,
      cashBucketId: ownerAccount.bucket,
      currencyId: usd,
      amount: '12.34',
      relatedIncomeId: original.id,
      description: 'Tax expense',
      economicAt: at(3),
      orderingKey: '1',
    };
    await accounting.recordTax(fixture.owner.context, input);
    await accounting.recordTax(fixture.owner.context, {
      ...input,
      commandId: randomUUID(),
      amount: '-2.34',
      description: 'Refund of previously charged tax',
      orderingKey: '2',
    });
    expect(await cash(ownerAccount.id)).toBe('90');
    const rows = await fixture.admin.pool.query(
      `SELECT amount_raw,related_income_id FROM app.account_cash_events
      WHERE workspace_id=$1 AND account_id=$2 AND kind='tax' ORDER BY amount`,
      [fixture.owner.context.workspaceId, ownerAccount.id],
    );
    expect(rows.rows.map((item) => item.amount_raw)).toEqual(['-2.34', '12.34']);
    expect(rows.rows.every((item) => item.related_income_id === original.id)).toBe(true);
  });

  it('records financing/interest/other expenses and signed refunds without inferring legacy fee labels', async () => {
    const ownerAccount = await account();
    const input = {
      commandId: randomUUID(),
      accountId: ownerAccount.id,
      cashBucketId: ownerAccount.bucket,
      currencyId: usd,
      amount: '3',
      kind: 'financing' as const,
      description: 'Financing charge',
      economicAt: at(3),
      orderingKey: '1',
    };
    await accounting.recordExpense(fixture.owner.context, input);
    await accounting.recordExpense(fixture.owner.context, {
      ...input,
      commandId: randomUUID(),
      kind: 'interest',
      amount: '2',
      orderingKey: '2',
    });
    await accounting.recordExpense(fixture.owner.context, {
      ...input,
      commandId: randomUUID(),
      kind: 'other',
      amount: '1',
      orderingKey: '3',
    });
    await accounting.recordExpense(fixture.owner.context, {
      ...input,
      commandId: randomUUID(),
      amount: '-0.5',
      orderingKey: '4',
    });
    expect(await cash(ownerAccount.id)).toBe('-5.5');
    const rows = await fixture.admin.pool.query(
      `SELECT kind,sum(amount)::text AS total FROM app.account_cash_events
      WHERE workspace_id=$1 AND account_id=$2 GROUP BY kind ORDER BY kind`,
      [fixture.owner.context.workspaceId, ownerAccount.id],
    );
    expect(rows.rows.map((item) => [item.kind, decimalValue(item.total).toFixed()])).toEqual([
      ['financing', '2.5'],
      ['interest-expense', '2'],
      ['other-expense', '1'],
    ]);
  });

  it('rejects mismatched cash buckets and related income units without reserving a source revision', async () => {
    const first = await account();
    const second = await account('live', eur);
    const income = await accounting.recordIncome(fixture.owner.context, incomeInput(first));
    const before = await effectsSnapshot();
    await expect(
      accounting.recordIncome(fixture.owner.context, {
        ...incomeInput(first),
        cashBucketId: second.bucket,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    await expect(
      accounting.recordTax(fixture.owner.context, {
        commandId: randomUUID(),
        accountId: second.id,
        cashBucketId: second.bucket,
        currencyId: eur,
        amount: '1',
        relatedIncomeId: income.id,
        description: 'Wrong unit',
        economicAt: at(3),
        orderingKey: '1',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    expect(await effectsSnapshot()).toEqual(before);
  });

  it('replays accounting income once and rejects a reused command with different economics', async () => {
    const ownerAccount = await account();
    const input = incomeInput(ownerAccount);
    const first = await accounting.recordIncome(fixture.owner.context, input);
    const before = await effectsSnapshot();
    expect(await accounting.recordIncome(fixture.owner.context, input)).toEqual(first);
    await expect(
      accounting.recordIncome(fixture.owner.context, { ...input, amount: '101' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await effectsSnapshot()).toEqual(before);
    expect(await cash(ownerAccount.id)).toBe('85');
  });

  it('atomically records an immediate owned transfer across brokers, conserving original currency cash', async () => {
    const source = await account();
    const destination = await account();
    await ledger.recordCashMovement(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: source.id,
      cashBucketId: source.bucket,
      currencyId: usd,
      amount: '1000',
      kind: 'deposit',
      economicAt: at(1),
      orderingKey: '1',
    });
    const input = {
      commandId: randomUUID(),
      sourceBucketId: source.bucket,
      destinationBucketId: destination.bucket,
      amount: '250.125',
      economicAt: at(3),
      receiptAt: at(3),
      orderingKey: '7',
      description: 'Move own funds',
    };
    const result = await accounting.createCashTransfer(fixture.owner.context, input);
    expect(await cash(source.id)).toBe('749.875');
    expect(await cash(destination.id)).toBe('250.125');
    const list = await accounting.cashTransfers(fixture.viewer.context, { limit: 100 });
    expect(cashTransferListResponseSchema.parse(list)).toEqual(list);
    const transfer = list.items.find((item) => item.id === result.id)!;
    expect(transfer).toMatchObject({
      status: 'received',
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      currencyId: usd,
      amount: '250.125',
      receipt: { commandId: input.commandId, economicAt: at(3), orderingKey: '7' },
    });
    const sum = await fixture.admin.pool.query(
      `SELECT sum(p.amount)::text AS total FROM app.postings p
      JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
      WHERE e.workspace_id=$1 AND e.command_id=$2 AND p.cash_bucket_id IS NOT NULL`,
      [fixture.owner.context.workspaceId, input.commandId],
    );
    expect(decimalValue(sum.rows[0]!.total).toFixed()).toBe('0');
    const before = await effectsSnapshot();
    expect(await accounting.createCashTransfer(fixture.owner.context, input)).toEqual(result);
    expect(await effectsSnapshot()).toEqual(before);
  });

  it('records departures and evidenced delayed receipts separately, with no anticipated destination cash', async () => {
    const source = await account();
    const destination = await account();
    const departure = await accounting.createCashTransfer(fixture.owner.context, {
      commandId: randomUUID(),
      sourceBucketId: source.bucket,
      destinationBucketId: destination.bucket,
      amount: '40.5',
      economicAt: at(4),
      orderingKey: '1',
      description: 'Bank transit',
    });
    expect(await cash(source.id)).toBe('-40.5');
    expect(await cash(destination.id)).toBe('0');
    const pending = (
      await accounting.cashTransfers(fixture.owner.context, { limit: 100 })
    ).items.find((item) => item.id === departure.id)!;
    expect(pending.status).toBe('pending');
    expect(pending.receipt).toBeNull();
    const receiptInput = { commandId: randomUUID(), economicAt: at(6), orderingKey: '4' };
    const receipt = await accounting.receiveCashTransfer(
      fixture.owner.context,
      departure.id,
      receiptInput,
    );
    expect(receipt.id).not.toBe(departure.id);
    expect(await cash(destination.id)).toBe('40.5');
    const before = await effectsSnapshot();
    expect(
      await accounting.receiveCashTransfer(fixture.owner.context, departure.id, receiptInput),
    ).toEqual(receipt);
    expect(await effectsSnapshot()).toEqual(before);
    const historic = (
      await accounting.cashTransfers(fixture.owner.context, { limit: 100, asOf: at(5) })
    ).items.find((item) => item.id === departure.id)!;
    expect(historic.status).toBe('pending');
    expect(historic.receipt).toBeNull();
    const received = (
      await accounting.cashTransfers(fixture.owner.context, { limit: 100, asOf: at(6) })
    ).items.find((item) => item.id === departure.id)!;
    expect(received.receipt?.id).toBe(receipt.id);
    expect(
      (
        await accounting.cashTransfers(fixture.owner.context, { limit: 100, asOf: at(3) })
      ).items.some((item) => item.id === departure.id),
    ).toBe(false);
  });

  it('rejects receipt chronology before departure, including the final microsecond and economic sequence', async () => {
    const source = await account();
    const destination = await account();
    const instant = '2025-02-08T12:00:00.000002Z';
    const departure = await accounting.createCashTransfer(fixture.owner.context, {
      commandId: randomUUID(),
      sourceBucketId: source.bucket,
      destinationBucketId: destination.bucket,
      amount: '1',
      economicAt: instant,
      orderingKey: '99',
      description: 'Microsecond chronology',
    });
    const before = await effectsSnapshot();
    for (const input of [
      { economicAt: '2025-02-08T12:00:00.000001Z', orderingKey: '100' },
      { economicAt: instant, orderingKey: '98' },
    ])
      await expect(
        accounting.receiveCashTransfer(fixture.owner.context, departure.id, {
          ...input,
          commandId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    expect(await effectsSnapshot()).toEqual(before);
    await accounting.receiveCashTransfer(fixture.owner.context, departure.id, {
      commandId: randomUUID(),
      economicAt: '2025-02-08T13:00:00.000002+01:00',
      orderingKey: '99',
    });
    expect(await cash(destination.id)).toBe('1');
  });

  it('rejects duplicate competing receipts while keeping exactly one immutable receipt and cash credit', async () => {
    const source = await account();
    const destination = await account();
    const departure = await accounting.createCashTransfer(fixture.owner.context, {
      commandId: randomUUID(),
      sourceBucketId: source.bucket,
      destinationBucketId: destination.bucket,
      amount: '7.77',
      economicAt: at(9),
      orderingKey: '1',
      description: 'Concurrent receipts',
    });
    const before = await effectsSnapshot();
    const results = await Promise.allSettled(
      [1, 2].map((index) =>
        accounting.receiveCashTransfer(fixture.owner.context, departure.id, {
          commandId: randomUUID(),
          economicAt: at(10),
          orderingKey: String(index),
        }),
      ),
    );
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((item) => item.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toMatchObject({
      code: 'TRANSFER_ALREADY_RECEIVED',
    });
    expect(await cash(destination.id)).toBe('7.77');
    const after = await effectsSnapshot();
    expect(after.receipts - before.receipts).toBe(1);
    expect(after.events - before.events).toBe(1);
    expect(after.commands - before.commands).toBe(1);
  });

  it('completes an evidenced transfer after its destination account has been archived', async () => {
    const source = await account();
    const destination = await account();
    const departure = await accounting.createCashTransfer(fixture.owner.context, {
      commandId: randomUUID(),
      sourceBucketId: source.bucket,
      destinationBucketId: destination.bucket,
      amount: '9',
      economicAt: at(9),
      orderingKey: '1',
      description: 'Previously evidenced transfer',
    });
    await catalog.archiveCatalog(
      fixture.owner.context,
      'account',
      destination.id,
      { expectedRevision: destination.revision, reason: 'Archived before import' },
      randomUUID(),
    );
    await accounting.receiveCashTransfer(fixture.owner.context, departure.id, {
      commandId: randomUUID(),
      economicAt: at(11),
      orderingKey: '1',
    });
    expect(await cash(destination.id)).toBe('9');
  });

  it('rejects cross-unit, same-account and live/paper transfers without partial departures', async () => {
    const source = await account();
    const crossCurrency = await account('live', eur);
    const paper = await account('paper');
    const secondBucket = await ledger.createCashBucket(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: source.id,
      currencyId: usd,
      kind: 'restricted',
    });
    const before = await effectsSnapshot();
    for (const destinationBucketId of [crossCurrency.bucket, paper.bucket, secondBucket.id])
      await expect(
        accounting.createCashTransfer(fixture.owner.context, {
          commandId: randomUUID(),
          sourceBucketId: source.bucket,
          destinationBucketId,
          amount: '100',
          economicAt: at(12),
          orderingKey: '1',
          description: 'Invalid transfer',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_FINANCIAL_INPUT' });
    expect(await effectsSnapshot()).toEqual(before);
    expect(await cash(source.id)).toBe('0');
  });

  it('rejects a scheduled delayed receipt supplied at departure rather than storing unevidenced future cash', async () => {
    const source = await account();
    const destination = await account();
    const before = await effectsSnapshot();
    await expect(
      accounting.createCashTransfer(fixture.owner.context, {
        commandId: randomUUID(),
        sourceBucketId: source.bucket,
        destinationBucketId: destination.bucket,
        amount: '1',
        economicAt: at(12),
        receiptAt: at(13),
        orderingKey: '1',
        description: 'Expected receipt',
      }),
    ).rejects.toBeDefined();
    expect(await effectsSnapshot()).toEqual(before);
  });

  it('retains fractional transfer source precision and exactly opposite departure/receipt cash', async () => {
    const source = await account();
    const destination = await account();
    const amount = '0.123456789012345678901234567890123456';
    await accounting.createCashTransfer(fixture.owner.context, {
      commandId: randomUUID(),
      sourceBucketId: source.bucket,
      destinationBucketId: destination.bucket,
      amount,
      economicAt: at(12),
      receiptAt: at(12),
      orderingKey: '1',
      description: 'Fractional original unit',
    });
    expect(await cash(source.id)).toBe(`-${amount}`);
    expect(await cash(destination.id)).toBe(amount);
  });

  it('enforces viewer restrictions and tenant isolation for portfolio and financial mutation methods', async () => {
    const ownerAccount = await account();
    const otherAccount = await account();
    const created = await accounting.createPortfolio(fixture.owner.context, {
      commandId: randomUUID(),
      name: 'Private scope',
      environment: 'live',
      accountIds: [ownerAccount.id],
    });
    const before = await effectsSnapshot();
    await expect(
      accounting.createPortfolio(fixture.viewer.context, {
        commandId: randomUUID(),
        name: 'Viewer write',
        environment: 'live',
        accountIds: [ownerAccount.id],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      accounting.recordIncome(fixture.viewer.context, incomeInput(ownerAccount)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      accounting.createCashTransfer(fixture.viewer.context, {
        commandId: randomUUID(),
        sourceBucketId: ownerAccount.bucket,
        destinationBucketId: otherAccount.bucket,
        amount: '1',
        economicAt: at(13),
        orderingKey: '1',
        description: 'Viewer transfer',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(accounting.portfolio(fixture.outsider.context, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      accounting.portfolioVersions(fixture.outsider.context, created.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      accounting.recordIncome(fixture.outsider.context, incomeInput(ownerAccount)),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await accounting.portfolios(fixture.outsider.context)).items).toEqual([]);
    expect((await accounting.cashTransfers(fixture.outsider.context)).items).toEqual([]);
    expect(await effectsSnapshot()).toEqual(before);
  });
});
