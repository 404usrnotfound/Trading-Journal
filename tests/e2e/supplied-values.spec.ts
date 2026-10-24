import { randomUUID } from 'node:crypto';
import * as c from '@journal/contracts';
import { expect, test } from '@playwright/test';
import { createBrowserOwner } from './owner-fixture.js';

test('reviewed residual value replaces manual holdings without repeating settled cash', async ({
  page,
}) => {
  test.setTimeout(90_000);
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
  const workspace = c.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  ).workspaces[0]!;
  const prefix = `/api/v1/workspaces/${workspace.id}`;
  const source = `residual-browser:${randomUUID()}`;
  const effectiveAt = '2025-01-01T00:00:00Z';
  async function post<Value>(
    resource: string,
    body: unknown,
    schema: { parse(value: unknown): Value },
  ) {
    const response = await page.request.post(`${prefix}/financial/${resource}`, {
      data: body,
      headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': randomUUID() },
    });
    const result: unknown = await response.json();
    expect(response.status(), JSON.stringify(result)).toBe(200);
    return schema.parse(result);
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
      effectiveAt,
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
      effectiveAt,
    },
    c.accountResponseSchema,
  );
  const instrument = await post(
    'instruments',
    {
      name: source,
      family: 'future',
      subtype: 'source-settled-future',
      economicIdentity: source,
      quantityUnit: 'contract',
      quoteCurrencyId: currency.id,
      settlementCurrencyId: currency.id,
      multiplier: '1',
      quantityIncrement: '1',
      priceIncrement: '0.01',
      capability: 'manual',
      effectiveAt,
      metadata: { priceConvention: 'points', settlementStyle: 'explicit-source-settlement' },
    },
    c.instrumentResponseSchema,
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
      economicAt: effectiveAt,
      orderingKey: '0',
    },
    c.financialMutationResponseSchema,
  );
  await post(
    'executions',
    {
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      side: 'buy',
      quantity: '2',
      price: '-37.63',
      economicAt: '2025-02-01T12:00:00Z',
      orderingKey: '1',
      costsComplete: true,
      manualCashEffects: [{ cashBucketId: bucket.id, currencyId: currency.id, amount: '5' }],
    },
    c.executionResponseSchema,
  );
  await page.goto(`/supplied-values?workspace=${workspace.id}`);
  await page.getByLabel('Account', { exact: true }).selectOption(account.id);
  await page
    .getByLabel('Manual instrument version', { exact: true })
    .selectOption(instrument.versionId);
  await page.getByLabel('Signed holding quantity', { exact: true }).fill('2');
  await page.getByLabel('Value currency', { exact: true }).selectOption(currency.id);
  await page.getByLabel('Supplied amount', { exact: true }).fill('7');
  await page
    .getByLabel('Observation timestamp', { exact: true })
    .fill('2025-03-01T12:00:00.000001Z');
  await page.getByLabel('Source name', { exact: true }).fill(source);
  await page
    .getByLabel('Source reference and evidence', { exact: true })
    .fill('Independent residual equity excludes the five already settled in cash');
  for (const label of [
    'Ledger cash excluded',
    'Collateral balances excluded',
    'Settled P&L excluded',
    'Unsettled cash claims excluded',
  ])
    await page.getByRole('checkbox', { name: label, exact: true }).check();
  await page.getByRole('button', { name: 'Review supplied observation', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Supplied observation review' })).toBeVisible();
  const [created] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/supplied-components/observations'),
    ),
    page.getByRole('button', { name: 'Confirm supplied observation', exact: true }).click(),
  ]);
  expect(created.status(), await created.text()).toBe(200);
  const component = c.financialMutationResponseSchema.parse(await created.json());
  await page.goto(
    `/accounts?${new URLSearchParams({ workspace: workspace.id, accountIds: account.id, environment: 'paper', currency: currency.id, from: '2025-02-27', to: '2025-03-01', priceSources: 'manual', fxSources: 'manual' })}`,
  );
  await page.getByText('Price and FX evidence policy', { exact: true }).click();
  await page.getByText('Reviewed supplied position values', { exact: true }).click();
  await page.getByRole('checkbox', { name: new RegExp(source) }).check();
  const [reportResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/accounting/reports') &&
        (response.request().postData()?.includes(component.id) ?? false),
    ),
    page.getByRole('button', { name: 'Apply report settings', exact: true }).click(),
  ]);
  expect(reportResponse.status(), await reportResponse.text()).toBe(200);
  const report = c.accountingReportResponseSchema.parse(await reportResponse.json());
  expect(report.closing.cash).toMatchObject({ state: 'available', value: '105' });
  expect(report.closing.holdings).toMatchObject({ state: 'available', value: '7' });
  expect(report.closing.netLiquidationValue).toMatchObject({ state: 'available', value: '112' });
  await expect(
    page.getByRole('group', { name: 'Net liquidation value', exact: true }),
  ).toContainText('112 USD');
  const cash = c.cashBalanceResponseSchema
    .array()
    .parse(
      await (
        await page.request.get(`${prefix}/financial/cash-balances?accountId=${account.id}`)
      ).json(),
    );
  expect(cash).toEqual([expect.objectContaining({ amount: '105' })]);
});
