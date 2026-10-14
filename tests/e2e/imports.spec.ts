import { createHash, randomBytes, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import * as contract from '@journal/contracts';
import { createDatabase } from '@journal/database';
import { bootstrapOwner, parseServerConfig } from '@journal/server';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { testDatabaseUrls } from '../../scripts/environment.js';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}

async function responsiveAccessibility(page: Page, info: TestInfo) {
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
      path: info.outputPath(`imports-${width}-${theme}.png`),
      fullPage: true,
    });
    await page.screenshot({
      path: info.outputPath(`imports-${width}-${theme}-viewport.png`),
      fullPage: false,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

test('reviewed CSV imports preserve exact cash, private sources, duplicates and append-only reversal', async ({
  page,
  browser,
}, info) => {
  // The complete review journey includes four axe scans across three viewport sizes.
  test.setTimeout(360_000);
  const baseUrl = info.project.use.baseURL;
  if (!baseUrl) throw new Error('The isolated browser application origin is required.');
  const origin = new URL(baseUrl).origin;
  const urls = testDatabaseUrls();
  const password = randomBytes(24).toString('hex');
  // Give this journey its own account so adding it cannot exhaust the shared owner's login limit.
  const owner = await bootstrapOwner(
    {
      email: `imports-owner-${randomUUID()}@example.test`,
      password,
      name: 'Import browser owner',
    },
    parseServerConfig({
      ...process.env,
      DATABASE_URL: urls.TEST_APP_DATABASE_URL,
      AUTH_DATABASE_URL: urls.TEST_AUTH_DATABASE_URL,
      JOB_DATABASE_URL: urls.TEST_JOB_DATABASE_URL,
      APP_ORIGIN: origin,
      NODE_ENV: 'test',
    }),
  );
  await signIn(page, owner.user.email, password);
  const workspace = contract.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  ).workspaces[0];
  if (!workspace) throw new Error('The owner needs a workspace.');
  const prefix = `/api/v1/workspaces/${workspace.id}`;
  const proof = (await page.request.get('/api/auth/session')).headers()['x-csrf-token'];
  expect(proof).toBeTruthy();
  async function post<Value>(
    resource: string,
    body: unknown,
    schema: { parse(value: unknown): Value },
  ) {
    const response = await page.request.post(`${prefix}/${resource}`, {
      data: body,
      headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': randomUUID() },
    });
    const value: unknown = await response.json();
    expect(response.status(), JSON.stringify(value)).toBe(200);
    return schema.parse(value);
  }
  async function clickMutation<Value>(
    button: Locator,
    resource: string,
    schema: { parse(value: unknown): Value },
  ) {
    if (resource.endsWith('/commit') || resource.endsWith('/reverse')) {
      await button.click();
      button = page.getByRole('dialog').getByRole('button', {
        name: resource.endsWith('/reverse') ? 'Confirm reversal' : 'Confirm posting',
        exact: true,
      });
      await expect(button).toBeVisible();
    }
    const [response] = await Promise.all([
      page.waitForResponse(
        (value) =>
          value.request().method() === 'POST' &&
          new URL(value.url()).pathname === `${prefix}/imports/${resource}`,
      ),
      button.click(),
    ]);
    const value: unknown = await response.json();
    expect(response.status(), JSON.stringify(value)).toBe(200);
    return schema.parse(value);
  }
  const fixtureId = randomUUID();
  const currency = await post(
    'financial/currencies',
    {
      namespace: `imports:e2e:${fixtureId}`,
      code: 'USD',
      kind: 'fiat',
      unitIdentity: `imports:USD:${fixtureId}`,
      name: 'Import browser dollar',
      displayScale: 2,
      settlementIncrement: '0.01',
      effectiveAt: '2025-01-01T00:00:00Z',
    },
    contract.currencyResponseSchema,
  );
  const account = await post(
    'financial/accounts',
    {
      name: `Import browser account ${fixtureId.slice(0, 8)}`,
      environment: 'live',
      accountType: 'cash',
      baseCurrencyId: currency.id,
      inventoryMethod: 'fifo',
      allowShort: false,
      holdingMode: 'netted',
      effectiveAt: '2025-01-01T00:00:00Z',
    },
    contract.accountResponseSchema,
  );
  async function balances() {
    const response = await page.request.get(
      `${prefix}/financial/cash-balances?accountId=${account.id}`,
    );
    expect(response.status()).toBe(200);
    return contract.cashBalanceResponseSchema.array().parse(await response.json());
  }
  const namespace = `browser-broker:${fixtureId}`;
  const filename = `cash-original-${fixtureId.slice(0, 8)}.csv`;
  const duplicateFilename = `cash-reimport-${fixtureId.slice(0, 8)}.csv`;
  // Include the BOM, original CRLFs and a quoted comma in an unmapped column.
  const source =
    '\uFEFFID,Date,Amount,Note\r\n' +
    'D1,2030-01-01T12:00:00.000001Z,100.25,"Original deposit, reviewed"\r\n' +
    'D2,2030-01-02T12:00:00.000002Z,20.10,Second deposit\r\n';
  const sourceBytes = Buffer.from(source, 'utf8');
  const mappingName = `Reviewed broker cash ${fixtureId.slice(0, 8)}`;
  await page.goto(`/imports?workspace=${workspace.id}`);
  await expect(page.getByRole('heading', { name: 'Imports & reconciliation' })).toBeVisible();
  await expect(page.getByLabel('Account', { exact: true })).toContainText(account.name);
  await page.getByLabel('Account', { exact: true }).selectOption(account.id);
  await page.getByLabel('Broker source namespace').fill(namespace);
  await page.getByLabel('Broker CSV file').setInputFiles({
    name: filename,
    mimeType: 'text/csv',
    buffer: sourceBytes,
  });
  await expect(
    page.getByText(`Selected: ${filename} · no financial activity has been posted.`),
  ).toBeVisible();
  await page.getByLabel('Currency field 4').selectOption(currency.id);
  await page.getByLabel('Mapping name').fill(mappingName);
  const template = await clickMutation(
    page.getByRole('button', { name: 'Save mapping version' }),
    'templates',
    contract.importTemplateResponseSchema,
  );
  await expect(page.getByLabel('Saved mapping')).toHaveValue(template.id);
  const batch = await clickMutation(
    page.getByRole('button', { name: 'Stage file for review' }),
    'batches',
    contract.importBatchResponseSchema,
  );
  expect(batch).toMatchObject({
    accountId: account.id,
    filename,
    state: 'staged',
    rowCount: 2,
    fileHash: createHash('sha256').update(sourceBytes).digest('hex'),
  });
  expect(await balances()).toEqual([]);
  const original = await page.request.get(`${prefix}/imports/batches/${batch.id}/source`);
  expect(original.status()).toBe(200);
  expect(original.headers()).toMatchObject({
    'content-type': 'application/octet-stream',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'x-source-sha256': batch.fileHash,
  });
  expect(await original.body()).toEqual(sourceBytes);
  async function selectAllGroups() {
    const groups = page.getByRole('group', { name: 'Include complete dependency groups' });
    await expect(groups.getByRole('checkbox')).toHaveCount(2);
    for (const checkbox of await groups.getByRole('checkbox').all()) await checkbox.check();
  }
  await selectAllGroups();
  const review = await clickMutation(
    page.getByRole('button', { name: 'Validate selected groups' }),
    `batches/${batch.id}/preview`,
    contract.importPreviewResponseSchema,
  );
  expect(review.committable).toBe(true);
  expect(review.rows.map((row) => row.status)).toEqual(['new', 'new']);
  expect(review.rows.every((row) => row.warnings.length > 0)).toBe(true);
  expect(await balances()).toEqual([]);
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Financial records are unchanged by preview.',
  );
  await expect(page.getByRole('button', { name: 'Commit reviewed import' })).toBeDisabled();
  await page.getByLabel('I reviewed retained unmapped columns and warnings.').check();
  // A real financial command after review must invalidate the preview before any money is posted.
  await post(
    'financial/cash-buckets',
    { accountId: account.id, currencyId: currency.id, kind: 'settled' },
    contract.cashBucketResponseSchema,
  );
  await page.getByRole('button', { name: 'Commit reviewed import' }).click();
  await expect(page.getByRole('dialog', { name: 'Post this reviewed import?' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Commit reviewed import' })).toBeFocused();
  expect((await balances())[0]?.amount).toBe('0');
  await page.getByRole('button', { name: 'Commit reviewed import' }).click();
  const [stale] = await Promise.all([
    page.waitForResponse(
      (value) =>
        value.request().method() === 'POST' &&
        new URL(value.url()).pathname === `${prefix}/imports/batches/${batch.id}/commit`,
    ),
    page.getByRole('dialog').getByRole('button', { name: 'Confirm posting', exact: true }).click(),
  ]);
  expect(stale.status()).toBe(409);
  expect(contract.problemResponseSchema.parse(await stale.json()).code).toBe(
    'STALE_IMPORT_PREVIEW',
  );
  await expect(
    page
      .getByRole('main')
      .getByRole('alert')
      .filter({ hasText: 'Financial activity changed after preview.' }),
  ).toContainText('Financial activity changed after preview.');
  await expect(page.getByRole('button', { name: 'Commit reviewed import' })).toHaveCount(0);
  expect((await balances())[0]?.amount).toBe('0');
  const freshReview = await clickMutation(
    page.getByRole('button', { name: 'Validate selected groups' }),
    `batches/${batch.id}/preview`,
    contract.importPreviewResponseSchema,
  );
  expect(freshReview.committable).toBe(true);
  await expect(page.getByRole('button', { name: 'Commit reviewed import' })).toBeDisabled();
  await expect(
    page.getByLabel('I reviewed retained unmapped columns and warnings.'),
  ).not.toBeChecked();
  const unacknowledged = await page.request.post(`${prefix}/imports/batches/${batch.id}/commit`, {
    headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': randomUUID() },
    data: {
      expectedRevision: freshReview.batchRevision,
      previewId: freshReview.id,
      acceptWarnings: false,
    },
  });
  expect(unacknowledged.status()).toBe(409);
  expect(contract.problemResponseSchema.parse(await unacknowledged.json()).code).toBe(
    'IMPORT_WARNINGS_UNREVIEWED',
  );
  expect((await balances())[0]?.amount).toBe('0');
  await page.getByLabel('I reviewed retained unmapped columns and warnings.').check();
  const committed = await clickMutation(
    page.getByRole('button', { name: 'Commit reviewed import' }),
    `batches/${batch.id}/commit`,
    contract.importBatchResponseSchema,
  );
  expect(committed.state).toBe('committed');
  expect(await balances()).toMatchObject([
    { accountId: account.id, currencyId: currency.id, amount: '120.35' },
  ]);
  const history = page.getByRole('table', { name: 'Recent statement batches' });
  await expect(history.getByRole('row').filter({ hasText: filename })).toContainText('committed');
  await page.reload();
  await expect(history.getByRole('row').filter({ hasText: filename })).toContainText('committed');
  await expect(page.getByLabel('Saved mapping')).toContainText(`${mappingName} · v1`);
  expect((await balances())[0]?.amount).toBe('120.35');
  // A new filename and operation identity still refer to the same two broker records.
  await page.getByLabel('Account', { exact: true }).selectOption(account.id);
  await page.getByLabel('Broker source namespace').fill(namespace);
  await page.getByLabel('Broker CSV file').setInputFiles({
    name: duplicateFilename,
    mimeType: 'text/csv',
    buffer: sourceBytes,
  });
  await expect(
    page.getByText(`Selected: ${duplicateFilename} · no financial activity has been posted.`),
  ).toBeVisible();
  await page.getByLabel('Saved mapping').selectOption(template.id);
  const duplicate = await clickMutation(
    page.getByRole('button', { name: 'Stage file for review' }),
    'batches',
    contract.importBatchResponseSchema,
  );
  await selectAllGroups();
  const duplicateReview = await clickMutation(
    page.getByRole('button', { name: 'Validate selected groups' }),
    `batches/${duplicate.id}/preview`,
    contract.importPreviewResponseSchema,
  );
  expect(duplicateReview.committable).toBe(true);
  expect(duplicateReview.rows.map((row) => row.status)).toEqual(['duplicate', 'duplicate']);
  await page.getByLabel('I reviewed retained unmapped columns and warnings.').check();
  await clickMutation(
    page.getByRole('button', { name: 'Commit reviewed import' }),
    `batches/${duplicate.id}/commit`,
    contract.importBatchResponseSchema,
  );
  expect((await balances())[0]?.amount).toBe('120.35');
  await history
    .getByRole('row')
    .filter({ hasText: filename })
    .getByRole('button', { name: 'Review batch' })
    .click();
  await expect(
    page.getByRole('heading', { name: `2. Review ${filename}`, exact: true }),
  ).toBeVisible();
  await page.getByText('Reverse eligible cash-only batch', { exact: true }).click();
  await page
    .getByLabel('Reversal reason')
    .fill('Reviewed accidental deposit import; preserve audit history.');
  const reversed = await clickMutation(
    page.getByRole('button', { name: 'Review and reverse cash batch' }),
    `batches/${batch.id}/reverse`,
    contract.importBatchResponseSchema,
  );
  expect(reversed.state).toBe('reversed');
  expect((await balances())[0]?.amount).toBe('0');
  const detail = contract.importBatchDetailSchema.parse(
    await (await page.request.get(`${prefix}/imports/batches/${batch.id}`)).json(),
  );
  expect(detail.rows.every((row) => row.status === 'reversed')).toBe(true);
  expect(detail.history.map((item) => item.action)).toEqual(
    expect.arrayContaining(['staged', 'previewed', 'committed', 'reversed']),
  );
  await expect(history.getByRole('row').filter({ hasText: filename })).toContainText('reversed');
  expect(
    await (await page.request.get(`${prefix}/imports/batches/${batch.id}/source`)).body(),
  ).toEqual(sourceBytes);
  await responsiveAccessibility(page, info);
  const viewerPassword = randomBytes(24).toString('hex');
  const viewer = await bootstrapOwner(
    {
      email: `imports-viewer-${randomUUID()}@example.test`,
      password: viewerPassword,
      name: 'Import browser viewer',
    },
    parseServerConfig({
      ...process.env,
      DATABASE_URL: urls.TEST_APP_DATABASE_URL,
      AUTH_DATABASE_URL: urls.TEST_AUTH_DATABASE_URL,
      JOB_DATABASE_URL: urls.TEST_JOB_DATABASE_URL,
      APP_ORIGIN: origin,
      NODE_ENV: 'test',
    }),
  );
  const admin = createDatabase(urls.TEST_DATABASE_URL);
  try {
    await admin.pool.query(
      'INSERT INTO app.workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,$3)',
      [workspace.id, viewer.user.id, 'viewer'],
    );
  } finally {
    await admin.close();
  }
  const viewerContext = await browser.newContext({ baseURL: origin });
  try {
    const viewerPage = await viewerContext.newPage();
    await signIn(viewerPage, viewer.user.email, viewerPassword);
    await viewerPage.goto(`/imports?workspace=${workspace.id}`);
    await expect(
      viewerPage.getByText(
        'You have viewer access. Source files and import history are read-only.',
      ),
    ).toBeVisible();
    await expect(viewerPage.getByLabel('Broker CSV file')).toHaveCount(0);
    await expect(viewerPage.getByRole('button', { name: 'Stage file for review' })).toHaveCount(0);
    await viewerPage
      .getByRole('table', { name: 'Recent statement batches' })
      .getByRole('row')
      .filter({ hasText: filename })
      .getByRole('button', { name: 'Review batch' })
      .click();
    await expect(viewerPage.getByRole('link', { name: 'Download original source' })).toBeVisible();
    expect(
      await (await viewerPage.request.get(`${prefix}/imports/batches/${batch.id}/source`)).body(),
    ).toEqual(sourceBytes);
    const viewerProof = (await viewerPage.request.get('/api/auth/session')).headers()[
      'x-csrf-token'
    ];
    const forbidden = await viewerPage.request.post(
      `${prefix}/imports/batches/${batch.id}/preview`,
      {
        headers: { origin, 'x-csrf-token': viewerProof!, 'idempotency-key': randomUUID() },
        data: { expectedRevision: reversed.revision, groups: ['cash_movement:D1'] },
      },
    );
    expect(forbidden.status()).toBe(403);
  } finally {
    await viewerContext.close();
  }
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (await anonymous.request.get(`${prefix}/imports/batches/${batch.id}/source`)).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
});
