import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as c from '@journal/contracts';
import { expect, test } from '@playwright/test';
import { createBrowserOwner } from './owner-fixture.js';

test('risk, independent statements and portable restore work through authenticated forms', async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  await page.goto('/sign-in');
  const origin = new URL(page.url()).origin;
  const { email, password } = await createBrowserOwner(origin);
  expect(
    (
      await page.request.post('/api/auth/sign-in/email', {
        headers: { origin },
        data: { email, password },
      })
    ).status(),
  ).toBe(200);
  const proof = (await page.request.get('/api/auth/session')).headers()['x-csrf-token'];
  expect(proof).toBeTruthy();
  const workspace = c.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  ).workspaces[0]!;
  const prefix = `/api/v1/workspaces/${workspace.id}`;
  const source = `release-browser:${randomUUID()}`;
  const initial = '2025-01-01T00:00:00Z';
  async function post<Value>(
    resource: string,
    body: unknown,
    schema: { parse(value: unknown): Value },
  ) {
    const response = await page.request.post(`${prefix}/financial/${resource}`, {
      data: body,
      headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': randomUUID() },
    });
    const value: unknown = await response.json();
    expect(response.status(), JSON.stringify(value)).toBe(200);
    return schema.parse(value);
  }
  const currency = await post(
    'currencies',
    {
      namespace: source,
      code: 'USD',
      kind: 'fiat',
      unitIdentity: source,
      name: source,
      displayScale: 2,
      settlementIncrement: '0.01',
      effectiveAt: initial,
    },
    c.currencyResponseSchema,
  );
  const account = await post(
    'accounts',
    {
      name: source,
      environment: 'paper',
      accountType: 'cash',
      baseCurrencyId: currency.id,
      inventoryMethod: 'fifo',
      allowShort: false,
      holdingMode: 'netted',
      effectiveAt: initial,
    },
    c.accountResponseSchema,
  );
  const bucket = await post(
    'cash-buckets',
    { accountId: account.id, currencyId: currency.id, kind: 'settled' },
    c.cashBucketResponseSchema,
  );
  await post(
    'cash-movements',
    {
      accountId: account.id,
      cashBucketId: bucket.id,
      currencyId: currency.id,
      amount: '100',
      kind: 'deposit',
      economicAt: initial,
      orderingKey: '1',
    },
    c.financialMutationResponseSchema,
  );

  await page.goto(`/risk?workspace=${workspace.id}`);
  await page.getByLabel('Policy name', { exact: true }).fill(source);
  await page.getByLabel('Policy scope reference', { exact: true }).selectOption(account.id);
  await page.getByLabel('Effective instant', { exact: true }).fill(initial);
  await page
    .getByLabel('Change reason', { exact: true })
    .fill('Independently reviewed position count limit');
  await page
    .getByLabel('Maximum observation age in milliseconds', { exact: true })
    .fill('86400000');
  await page.getByRole('combobox', { name: /^Limit kind/u }).selectOption('positions');
  await page.getByLabel('Configured maximum', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Add configured limit', exact: true }).click();
  const [published] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/risk/policies'),
    ),
    page.getByRole('button', { name: 'Publish policy version', exact: true }).click(),
  ]);
  expect(published.status(), await published.text()).toBe(200);
  await page.getByRole('button', { name: 'Assess risk', exact: true }).click();
  await page.getByLabel('Assessment account', { exact: true }).selectOption(account.id);
  await page.getByLabel('Assessment instant', { exact: true }).fill('2025-03-01T12:00:00Z');
  await page.getByRole('button', { name: 'Capture risk assessment', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Assessment: passed', exact: true }),
  ).toBeVisible();

  await page.goto(`/reconciliation?workspace=${workspace.id}`);
  const statement = page.getByRole('form', { name: 'Record independent statement', exact: true });
  await statement.getByLabel('Account', { exact: true }).selectOption(account.id);
  await statement.getByLabel('Statement time (UTC)', { exact: true }).fill('2025-03-01T12:00');
  await statement.getByLabel('Statement source', { exact: true }).fill('Independent custodian');
  await statement.getByLabel('Statement reference', { exact: true }).fill(source);
  await statement
    .getByLabel('Statement lists every cash currency; omitted currencies mean zero.', {
      exact: true,
    })
    .check();
  await statement
    .getByLabel('Statement lists every holding; omitted holdings mean zero.', { exact: true })
    .check();
  await statement.getByRole('button', { name: 'Add cash balance', exact: true }).click();
  await statement.getByLabel('Cash currency 1', { exact: true }).selectOption(currency.id);
  await statement.getByLabel('Statement cash 1', { exact: true }).fill('99');
  await statement.getByLabel('Cash tolerance 1', { exact: true }).fill('0');
  await statement.getByRole('button', { name: 'Save independent statement', exact: true }).click();
  await page
    .getByLabel('Review note', { exact: true })
    .fill('Independent source deliberately differs by one');
  await page.getByRole('button', { name: 'Compare with ledger', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Statement comparison result', exact: true });
  await expect(comparison).toContainText('Result: variance');
  await expect(
    page.getByRole('button', { name: 'Accept matching statement', exact: true }),
  ).toBeDisabled();
  const cashRow = comparison
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'Cash', exact: true }) });
  await expect(cashRow).toContainText('99');
  await expect(cashRow).toContainText('100');

  await page.goto(`/portability?workspace=${workspace.id}`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download workspace backup', exact: true }).click(),
  ]);
  const archivePath = await download.path();
  if (!archivePath) throw new Error('The source backup download was not available.');
  const archive = c.portableArchiveSchema.parse(JSON.parse(await readFile(archivePath, 'utf8')));
  expect(archive.sourceWorkspace.id).toBe(workspace.id);
  expect(
    archive.tables.find((table) => table.name === 'risk_assessments')?.rows.length,
  ).toBeGreaterThan(0);
  expect(
    archive.tables.find((table) => table.name === 'source_statements')?.rows.length,
  ).toBeGreaterThan(0);
  await page.getByLabel('Workspace backup JSON', { exact: true }).setInputFiles(archivePath);
  await page.getByLabel('New workspace name', { exact: true }).fill(source + ' restored');
  await page.getByRole('button', { name: 'Review restore', exact: true }).click();
  const [restoredResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/portability/restore'),
    ),
    page.getByRole('button', { name: 'Restore and verify', exact: true }).click(),
  ]);
  expect(restoredResponse.status(), await restoredResponse.text()).toBe(201);
  const restored = c.portableRestoreResponseSchema.parse(await restoredResponse.json());
  expect(restored.workspaceId).not.toBe(workspace.id);
  await expect(
    page.getByRole('link', { name: 'Open restored workspace', exact: true }),
  ).toBeVisible();
  const balances = c.cashBalanceResponseSchema
    .array()
    .parse(
      await (
        await page.request.get(
          `/api/v1/workspaces/${restored.workspaceId}/financial/cash-balances?accountId=${account.id}`,
        )
      ).json(),
    );
  expect(balances).toEqual([
    expect.objectContaining({ amount: '100', currencyId: currency.id, accountId: account.id }),
  ]);
});
