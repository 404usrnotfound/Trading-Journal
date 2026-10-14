import { randomBytes, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import * as c from '@journal/contracts';
import { bootstrapOwner, parseServerConfig } from '@journal/server';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { testDatabaseUrls } from '../../scripts/environment.js';

async function accessibleRecorder(page: Page, info: TestInfo, stage: string) {
  for (const [width, height, theme] of [
    [1440, 1000, 'light'],
    [820, 1180, 'dark'],
    [390, 844, 'light'],
    [390, 844, 'dark'],
  ] as const) {
    await page.setViewportSize({ width, height });
    const toggle = page.getByRole('button', { name: `Switch to ${theme} theme` });
    if (await toggle.isVisible()) await toggle.click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`${stage}-${width}-${theme}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

test('fresh workspace records exact source facts and resumes a lost attribution response without duplicate cash', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const baseUrl = info.project.use.baseURL;
  if (!baseUrl) throw new Error('The isolated browser application origin is required.');
  const origin = new URL(baseUrl).origin;
  const urls = testDatabaseUrls();
  const password = randomBytes(24).toString('hex');
  const owner = await bootstrapOwner(
    { email: `manual-owner-${randomUUID()}@example.test`, password, name: 'Manual browser owner' },
    parseServerConfig({
      ...process.env,
      DATABASE_URL: urls.TEST_APP_DATABASE_URL,
      AUTH_DATABASE_URL: urls.TEST_AUTH_DATABASE_URL,
      JOB_DATABASE_URL: urls.TEST_JOB_DATABASE_URL,
      APP_ORIGIN: origin,
      NODE_ENV: 'test',
    }),
  );
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(owner.user.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const workspace = c.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  ).workspaces[0];
  if (!workspace) throw new Error('The owner needs a workspace.');
  const prefix = `/api/v1/workspaces/${workspace.id}`;
  const financial = `${prefix}/financial`;
  await page.goto(`/record?workspace=${workspace.id}`);
  await expect(page.getByRole('heading', { name: 'Record a trade', exact: true })).toBeVisible();
  await expect(page.getByText('Set up your first trade', { exact: true })).toBeVisible();
  const setup = page.locator('#catalog-setup');
  await setup.locator('summary').click();
  const initial = '2025-01-01T00:00:00Z';
  const currencyName = 'Source-verified browser dollar';
  await setup.getByLabel('Name', { exact: true }).fill(currencyName);
  await setup.getByLabel('Currency namespace').fill('manual:e2e');
  await setup.getByLabel('Currency code').fill('USD');
  await setup.getByLabel('Currency kind').selectOption('fiat');
  await setup.getByLabel('Unit identity').fill('manual:USD');
  await setup.getByLabel('Display decimal places').fill('2');
  await setup.getByLabel('Cash settlement increment').fill('0.01');
  await setup.getByLabel('Conventions effective at (ISO time with offset)').fill(initial);
  const [currencyResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `${financial}/currencies`,
    ),
    setup.getByRole('button', { name: 'Create currency', exact: true }).click(),
  ]);
  expect(currencyResponse.status()).toBe(200);
  const currency = c.currencyResponseSchema.parse(await currencyResponse.json());
  await expect(setup.getByText('Currency created. Select it in your trade.')).toBeVisible();
  await setup.getByLabel('Reference record').selectOption('account');
  const accountName = 'Manual paper account';
  await setup.getByLabel('Name', { exact: true }).fill(accountName);
  await setup.getByLabel('Account base currency').selectOption(currency.id);
  await setup.getByLabel('Account environment').selectOption('paper');
  await setup.getByLabel('Account type').selectOption('cash');
  await setup.getByLabel('Inventory policy').selectOption('fifo');
  await setup.getByLabel('Holding mode').selectOption('netted');
  await setup.getByLabel('Allow supported short inventory').selectOption('no');
  await setup.getByLabel('Conventions effective at (ISO time with offset)').fill(initial);
  const [accountResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `${financial}/accounts`,
    ),
    setup.getByRole('button', { name: 'Create account', exact: true }).click(),
  ]);
  expect(accountResponse.status()).toBe(200);
  const account = c.accountResponseSchema.parse(await accountResponse.json());
  await expect(setup.getByText('Account created. Select it in your trade.')).toBeVisible();
  await setup.getByLabel('Reference record').selectOption('instrument');
  const instrumentName = 'Manual fractional share';
  await setup.getByLabel('Name', { exact: true }).fill(instrumentName);
  await setup.getByLabel('Instrument accounting').selectOption('share');
  await setup.getByLabel('Economic identity').fill(`manual:share:${randomUUID()}`);
  await setup.getByLabel('Quote currency').selectOption(currency.id);
  await setup.getByLabel('Quantity increment').fill('0.000001');
  await setup.getByLabel('Price increment').fill('0.000001');
  await setup.getByLabel('Conventions effective at (ISO time with offset)').fill(initial);
  await setup.getByRole('checkbox', { name: /I verified delivered settlement/ }).check();
  const [instrumentResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `${financial}/instruments`,
    ),
    setup.getByRole('button', { name: 'Create instrument', exact: true }).click(),
  ]);
  expect(instrumentResponse.status()).toBe(200);
  const instrument = c.instrumentResponseSchema.parse(await instrumentResponse.json());
  await expect(setup.getByText('Instrument created. Select it in your trade.')).toBeVisible();
  await setup.locator('summary').click();
  await page.getByLabel('Account', { exact: true }).selectOption(account.id);
  await page.getByLabel('Instrument', { exact: true }).selectOption(instrument.versionId);
  await page.getByLabel('Quantity (share)', { exact: true }).fill('0.125001');
  await page.getByLabel('Execution price', { exact: true }).fill('10.000001');
  await page
    .getByLabel('Executed at (ISO time with offset)')
    .fill('2026-10-14T09:30:00.123456+02:00');
  await page.getByLabel('Source ordering key').fill('2');
  await expect(page.getByRole('checkbox', { name: /I checked the source/ })).not.toBeChecked();
  await page.getByRole('checkbox', { name: /I checked the source/ }).check();
  const title = 'Morning fractional source review';
  await page.getByLabel('Trade title', { exact: true }).fill(title);
  await page.getByLabel('Attribution reason').fill('Source fill belongs to this morning campaign');
  const writePaths: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') writePaths.push(new URL(request.url()).pathname);
  });
  await page.getByRole('button', { name: 'Preview record', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Record this execution?' })).toBeVisible();
  await expect(dialog.getByText(/buy 0.125001 share at 10.000001/)).toBeVisible();
  expect(writePaths).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).press('Escape');
  await expect(dialog).not.toBeVisible();
  await accessibleRecorder(page, info, 'manual-source');
  await page.getByRole('button', { name: 'Preview record', exact: true }).click();
  let committedAllocation: unknown = null;
  const allocationRequests: { id: string | undefined; body: unknown }[] = [];
  await page.route(`**${financial}/execution-allocations`, async (route) => {
    allocationRequests.push({
      id: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (allocationRequests.length === 1) {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      committedAllocation = c.allocationMutationResponseSchema.parse(await committed.json());
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    } else await route.continue();
  });
  await dialog.getByRole('button', { name: 'Record execution and attribute', exact: true }).click();
  await expect(page.locator('#main-content').getByRole('alert')).toContainText(
    'response was interrupted',
  );
  await expect(page.getByLabel('Quantity (share)', { exact: true })).toBeDisabled();
  const executions = c.executionResponseSchema
    .array()
    .parse(
      await (await page.request.get(`${financial}/executions?accountId=${account.id}`)).json(),
    );
  expect(executions).toHaveLength(1);
  const execution = executions[0]!;
  expect(execution).toMatchObject({
    quantity: '0.125001',
    price: '10.000001',
    bookedPrincipal: '1.25',
  });
  expect(execution.payload.sourceInput).toMatchObject({
    economicAt: '2026-10-14T09:30:00.123456+02:00',
    orderingKey: '2',
    costsComplete: true,
  });
  const balances = c.cashBalanceResponseSchema
    .array()
    .parse(
      await (await page.request.get(`${financial}/cash-balances?accountId=${account.id}`)).json(),
    );
  expect(balances).toHaveLength(1);
  expect(balances[0]).toMatchObject({
    accountId: account.id,
    currencyId: currency.id,
    amount: '-1.25',
    kind: 'unsettled',
  });
  // A navigation attempt must not discard the frozen payload and retained command identities.
  await page.getByRole('link', { name: 'Open recorded journal', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Leave an incomplete recording?' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const [retryResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `${financial}/execution-allocations` &&
        response.status() === 200,
    ),
    page.getByRole('button', { name: 'Retry remaining steps', exact: true }).click(),
  ]);
  expect(c.allocationMutationResponseSchema.parse(await retryResponse.json())).toEqual(
    committedAllocation,
  );
  expect(allocationRequests).toHaveLength(2);
  expect(allocationRequests[1]).toEqual(allocationRequests[0]);
  expect(writePaths.filter((path) => path === `${financial}/executions`)).toHaveLength(1);
  expect(writePaths.filter((path) => path === `${prefix}/journals`)).toHaveLength(1);
  expect(
    c.cashBalanceResponseSchema
      .array()
      .parse(
        await (await page.request.get(`${financial}/cash-balances?accountId=${account.id}`)).json(),
      ),
  ).toEqual(balances);
  await expect(page.getByRole('link', { name: 'Review this trade', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Review this trade', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const tradeId = new URL(page.url()).searchParams.get('trade');
  if (!tradeId) throw new Error('The journal needs its persisted trade URL.');
  const detail = c.journalDetailResponseSchema.parse(
    await (await page.request.get(`${prefix}/journals/${tradeId}`)).json(),
  );
  expect(detail.financial.legs[0]?.enteredQuantity).toMatchObject({
    status: 'available',
    value: '0.125001',
  });
  expect(detail.financial.legs[0]?.actualEntry).toMatchObject({
    status: 'available',
    value: '10.000001',
  });
  expect(detail.trade.status).not.toBe('closed');
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();

  // Previously imported/recorded unassigned fills get attribution only, never a second booking.
  const proof = (await page.request.get('/api/auth/session')).headers()['x-csrf-token'];
  expect(proof).toBeTruthy();
  const existingResponse = await page.request.post(`${financial}/executions`, {
    headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': randomUUID() },
    data: {
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      side: 'buy',
      quantity: '0.25',
      price: '12',
      cashBucketId: balances[0]!.cashBucketId,
      economicAt: '2026-10-14T08:30:00Z',
      orderingKey: '1',
      costsComplete: true,
      sourceIdentity: { namespace: 'manual-browser:imported', id: randomUUID() },
    },
  });
  expect(existingResponse.status()).toBe(200);
  const existing = c.executionResponseSchema.parse(await existingResponse.json());
  const beforeLinking = c.cashBalanceResponseSchema
    .array()
    .parse(
      await (await page.request.get(`${financial}/cash-balances?accountId=${account.id}`)).json(),
    );
  await page.goto(`/record?workspace=${workspace.id}&trade=${tradeId}&mode=existing`);
  await page.getByLabel('Account', { exact: true }).selectOption(account.id);
  await expect(page.getByLabel('Recorded execution')).toContainText(existing.economicAt);
  await page.getByLabel('Recorded execution').selectOption(existing.id);
  await expect(page.getByLabel('Matching trade leg')).toContainText(instrumentName);
  await page.getByLabel('Matching trade leg').selectOption(detail.financial.legs[0]!.legId);
  await page
    .getByLabel('Attribution reason')
    .fill('Link the reviewed imported fill to the existing campaign');
  const beforeWrites = writePaths.length;
  await page.getByRole('button', { name: 'Preview attribution', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Attribute this existing execution?' }),
  ).toBeVisible();
  await expect(dialog.getByText(/creates no duplicate execution or cash booking/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm attribution', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Review this trade', exact: true })).toBeVisible();
  expect(writePaths.slice(beforeWrites)).toEqual([`${financial}/execution-allocations`]);
  expect(
    c.cashBalanceResponseSchema
      .array()
      .parse(
        await (await page.request.get(`${financial}/cash-balances?accountId=${account.id}`)).json(),
      ),
  ).toEqual(beforeLinking);
  const allocations = c.executionAllocationResponseSchema.parse(
    await (await page.request.get(`${financial}/executions/${existing.id}/allocations`)).json(),
  );
  expect(allocations.allocations).toHaveLength(2);
  expect(allocations.allocations).toEqual(
    expect.arrayContaining([
      { tradeLegId: detail.financial.legs[0]!.legId, quantity: '0.25' },
      { tradeLegId: null, quantity: '0' },
    ]),
  );

  // Account review uses the same ledger through its read-only report, not campaign metrics.
  const accountParameters = new URLSearchParams({
    workspace: workspace.id,
    accountIds: account.id,
    currency: currency.id,
    environment: 'paper',
    from: '2026-10-14',
    to: '2026-10-14',
  });
  const financialBeforeReport = writePaths.filter((path) => path.startsWith(financial));
  await page.goto(`/accounts?${accountParameters}`);
  await expect(
    page.getByRole('heading', { name: 'Account performance', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Cash', exact: true })).toContainText('-4.25 USD');
  await expect(page.getByRole('group', { name: 'Equity', exact: true })).toContainText('Partial');
  await expect(page.getByRole('group', { name: 'External cash flows', exact: true })).toContainText(
    '0 USD',
  );
  await page.getByText('About external cash flows', { exact: true }).click();
  await expect(page.getByRole('group', { name: 'External cash flows', exact: true })).toContainText(
    'Deposits are capital',
  );
  await accessibleRecorder(page, info, 'account-review');
  expect(writePaths.filter((path) => path.startsWith(financial))).toEqual(financialBeforeReport);
});
