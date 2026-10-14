import { randomBytes, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import * as contract from '@journal/contracts';
import { createDatabase } from '@journal/database';
import { bootstrapOwner, parseServerConfig } from '@journal/server';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { testDatabaseUrls } from '../../scripts/environment.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVYAAAAASUVORK5CYII=',
  'base64',
);
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}
function financialMetric(scope: Page | Locator, label: string) {
  return scope.getByText(label, { exact: true }).locator('..').getByRole('definition');
}
async function accessibility(page: Page, info: TestInfo, stage: string) {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark'] as const) {
      const toggle = page.getByRole('button', { name: `Switch to ${theme} theme` });
      if (await toggle.isVisible()) await toggle.click();
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`${stage}-${viewport.width}-${theme}.png`),
        fullPage: true,
      });
      await page.screenshot({
        path: info.outputPath(`${stage}-${viewport.width}-${theme}-viewport.png`),
        fullPage: false,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

test('journal workflow keeps original risk, ledger actuals and private review history independent', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const email = process.env.TEST_OWNER_EMAIL;
  const password = process.env.TEST_OWNER_PASSWORD;
  if (!email || !password) throw new Error('The isolated browser owner fixture is required.');
  await signIn(page, email, password);
  const origin = new URL(page.url()).origin;
  const workspace = contract.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  ).workspaces[0];
  if (!workspace) throw new Error('The owner needs a workspace.');
  const prefix = `/api/v1/workspaces/${workspace.id}`;
  const proof = (await page.request.get('/api/auth/session')).headers()['x-csrf-token'];
  expect(proof).toBeTruthy();
  const preferences = await page.request.patch(prefix, {
    data: { timezone: 'Europe/Madrid', expectedRevision: workspace.revision },
    headers: { origin, 'x-csrf-token': proof! },
  });
  expect(preferences.status()).toBe(200);
  expect(contract.workspaceResponseSchema.parse(await preferences.json()).timezone).toBe(
    'Europe/Madrid',
  );
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
  async function detail(tradeId: string) {
    return contract.journalDetailResponseSchema.parse(
      await (await page.request.get(`${prefix}/journals/${tradeId}`)).json(),
    );
  }
  const initial = '2025-01-01T00:00:00.000Z';
  const currency = await post(
    'financial/currencies',
    {
      namespace: 'journal:e2e',
      code: `USD-${randomUUID().slice(0, 8)}`,
      kind: 'fiat',
      unitIdentity: `journal:USD:${randomUUID()}`,
      name: 'Journal US dollar',
      displayScale: 2,
      settlementIncrement: '0.01',
      effectiveAt: initial,
    },
    contract.currencyResponseSchema,
  );
  const account = await post(
    'financial/accounts',
    {
      name: `Journal account ${randomUUID().slice(0, 8)}`,
      environment: 'live',
      accountType: 'cash',
      baseCurrencyId: currency.id,
      inventoryMethod: 'fifo',
      allowShort: false,
      holdingMode: 'netted',
      effectiveAt: initial,
    },
    contract.accountResponseSchema,
  );
  const bucket = await post(
    'financial/cash-buckets',
    { accountId: account.id, currencyId: currency.id, kind: 'settled' },
    contract.cashBucketResponseSchema,
  );
  const instrument = await post(
    'financial/instruments',
    {
      name: `Journal fractional share ${randomUUID().slice(0, 8)}`,
      family: 'stock',
      subtype: 'ordinary-share',
      economicIdentity: `journal:share:${randomUUID()}`,
      quantityUnit: 'share',
      quoteCurrencyId: currency.id,
      settlementCurrencyId: currency.id,
      multiplier: '1',
      quantityIncrement: '0.0001',
      priceIncrement: '0.0001',
      capability: 'native-linear',
      effectiveAt: initial,
      metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
    },
    contract.instrumentResponseSchema,
  );
  const ruleId = randomUUID();
  const setupId = randomUUID();
  const strategy = await post(
    'strategies',
    {
      definition: {
        name: `Journal RSI ${randomUUID().slice(0, 8)}`,
        status: 'active',
        entryRules: 'RSI below 30 before entry',
        setups: [
          {
            id: setupId,
            name: 'Trend pullback',
            description: 'A controlled retracement',
            conditions: 'Trend remains intact',
            checklistItemIds: [ruleId],
          },
        ],
        checklist: [{ id: ruleId, label: 'RSI confirmed', required: true }],
      },
      effectiveAt: initial,
      changeReason: 'Original RSI rule',
    },
    contract.strategyResponseSchema,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: 'Open trade journal', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open trade journal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Trade journal', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Strategies', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'New trade idea', exact: true }).click();
  const title = `Journal campaign ${randomUUID().slice(0, 8)}`;
  await page.getByLabel('Trade title').fill(title);
  await page.getByLabel('Strategy', { exact: true }).selectOption(strategy.id);
  await page
    .getByLabel('Strategy version', { exact: true })
    .selectOption(strategy.currentVersionId);
  await page.getByRole('button', { name: 'Add instrument leg' }).click();
  await page.getByLabel('Leg 1 account').selectOption(account.id);
  await page.getByLabel('Leg 1 instrument').selectOption(instrument.versionId);
  await page.getByRole('button', { name: 'Create trade journal' }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/journal\?workspace=[^&]+&trade=[^&]+$/);
  const tradeId = new URL(page.url()).searchParams.get('trade');
  if (!tradeId) throw new Error('The created trade needs its detail URL.');
  await page.getByLabel('Setup', { exact: true }).selectOption(setupId);
  await page
    .getByLabel('Thesis', { exact: true })
    .fill('A controlled pullback, with confirmation before entry.');
  await page.getByLabel('Timeframe', { exact: true }).fill('1h');
  await page.getByLabel(`Planned entry · ${instrument.name}`, { exact: true }).fill('10');
  await page.getByLabel(`Planned stop · ${instrument.name}`, { exact: true }).fill('8');
  await page.getByLabel(`Planned targets · ${instrument.name}`, { exact: true }).fill('14');
  await page.getByLabel('Record planned initial risk').check();
  await page.getByLabel('Initial risk amount').fill('1');
  await page.getByLabel('Initial risk currency').selectOption(currency.id);
  await page.getByLabel('Initial risk methodology').fill('Quantity times entry-to-stop distance');
  await page.getByLabel('Screenshot phase').selectOption('before');
  await page
    .getByLabel('Upload screenshot or document')
    .setInputFiles({ name: 'before-entry.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('link', { name: 'before-entry.png' })).toBeVisible();
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.getByText('All journal changes saved')).toBeVisible();
  await page.getByLabel('Plan publication reason').fill('Commit original risk before trading');
  await page.getByRole('button', { name: 'Commit original plan' }).click();
  await page.getByRole('button', { name: 'Confirm publication' }).click();
  await expect(page.getByText(/Plan v1 published/)).toBeVisible();
  const committed = await detail(tradeId);
  expect(committed.commitment?.timing).toBe('pre-trade');
  expect(committed.originalPlan?.definition.initialRisk?.amount).toBe('1');
  expect(committed.originalPlan?.definition.attachmentIds).toHaveLength(1);
  await expect(page.getByText(/Recorded before known fills/)).toContainText('Europe/Madrid');
  await page.getByLabel('Initial risk amount').fill('4');
  await page.getByLabel(`Planned stop · ${instrument.name}`, { exact: true }).fill('9');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.getByText('All journal changes saved')).toBeVisible();
  await page.getByLabel('Plan publication reason').fill('A revised plan retains the original risk');
  await page.getByRole('button', { name: 'Publish plan revision' }).click();
  await page.getByRole('button', { name: 'Confirm publication' }).click();
  await expect(page.getByText(/Plan v2 published/)).toBeVisible();
  const planned = await detail(tradeId);
  expect(planned.originalPlan?.definition.initialRisk?.amount).toBe('1');
  expect(planned.currentPlan?.definition.initialRisk?.amount).toBe('4');
  const legId = planned.financial.legs[0]?.legId;
  if (!legId || !planned.commitment)
    throw new Error('The trade needs its catalog leg and original commitment.');
  const executionAt = new Date(
    new Date(planned.commitment.committedAt).getTime() + 60_000,
  ).toISOString();
  const exitAt = new Date(new Date(executionAt).getTime() + 60_000).toISOString();
  for (const [side, price, economicAt] of [
    ['buy', '10', executionAt],
    ['sell', '14', exitAt],
  ] as const) {
    const execution = await post(
      'financial/executions',
      {
        accountId: account.id,
        instrumentVersionId: instrument.versionId,
        side,
        quantity: '0.5',
        price,
        cashBucketId: bucket.id,
        costsComplete: true,
        economicAt,
        orderingKey: '1',
        fees: [
          { cashBucketId: bucket.id, currencyId: currency.id, amount: '0.05', kind: 'commission' },
        ],
      },
      contract.executionResponseSchema,
    );
    await post(
      'financial/execution-allocations',
      {
        executionId: execution.id,
        expectedVersion: 1,
        reason: 'Journal campaign attribution',
        allocations: [{ tradeLegId: legId, quantity: '0.5' }],
      },
      contract.allocationMutationResponseSchema,
    );
  }
  const beforeClosure = await detail(tradeId);
  await post(
    `financial/trades/${tradeId}/closures`,
    {
      expectedRevision: beforeClosure.trade.revision,
      reason: 'Review completed campaign',
      obligationEvidence: 'Both settled cash principals are booked and no quantity remains',
    },
    contract.tradeClosureResponseSchema,
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const finished = await detail(tradeId);
  expect(finished.financial.rMultiple).toMatchObject({
    status: 'available',
    value: '1.9',
    originalPlanId: committed.originalPlan?.id,
  });
  expect(finished.financial.legs[0]?.actualEntry.value).toBe('10');
  expect(finished.financial.legs[0]?.actualExit.value).toBe('14');
  await expect(financialMetric(page, 'R multiple').getByText('1.9', { exact: true })).toBeVisible();
  await expect(financialMetric(page, 'R multiple').getByText('R', { exact: true })).toBeVisible();
  const ledgerActuals = page.getByRole('region', {
    name: `Ledger actuals for ${instrument.name}`,
    exact: true,
  });
  for (const [label, value] of [
    ['Actual entry', '10'],
    ['Actual exit', '14'],
    ['Open quantity', '0'],
    ['Entered quantity', '0.5'],
    ['Exited quantity', '0.5'],
    ['Cost basis', '0'],
    ['Realized gross P&L', '2'],
    ['Realized net P&L', '1.9'],
  ] as const) {
    await expect(
      financialMetric(ledgerActuals, label).getByText(value, { exact: true }),
    ).toBeVisible();
  }
  await expect(financialMetric(ledgerActuals, 'Actual entry')).toContainText(
    `${currency.code}/share`,
  );
  await expect(financialMetric(ledgerActuals, 'Realized net P&L')).toContainText(currency.code);
  await page.getByLabel(`Actual stop · ${instrument.name}`).fill('9');
  await page.getByLabel(`Manually reported entry · ${instrument.name}`).fill('999');
  await page.getByLabel('Mistakes', { exact: true }).fill('late confirmation');
  await page.getByLabel('Emotions', { exact: true }).fill('calm, focused');
  await page.getByLabel('Confidence', { exact: true }).selectOption('4');
  await page.getByLabel('Execution quality', { exact: true }).selectOption('good');
  await page
    .getByLabel('Lessons learned', { exact: true })
    .fill('Wait for confirmation, then follow the plan.');
  await page
    .getByLabel('Post-trade review', { exact: true })
    .fill('Good process despite a delayed confirmation.');
  await page.getByLabel('Custom tags', { exact: true }).fill('pullback, practice');
  await page
    .getByLabel('Custom notes', { exact: true })
    .fill('<script>Recorded literally as a note.</script>');
  await page.getByLabel('RSI confirmed · Required rule', { exact: true }).selectOption('passed');
  await page.getByLabel('Screenshot phase').selectOption('after');
  await page
    .getByLabel('Upload screenshot or document')
    .setInputFiles({ name: 'after-exit.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('link', { name: 'after-exit.png' })).toBeVisible();
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.getByText('All journal changes saved')).toBeVisible();
  const reviewed = await detail(tradeId);
  expect(reviewed.financial.rMultiple.value).toBe('1.9');
  expect(reviewed.financial.legs[0]?.actualEntry.value).toBe('10');
  expect(reviewed.journal.document.review.actualObservations[0]?.reportedEntry).toBe('999');
  expect(
    reviewed.journal.document.review.attachments.map((attachment) => attachment.phase),
  ).toEqual(['before', 'after']);
  await expect(financialMetric(page, 'R multiple').getByText('1.9', { exact: true })).toBeVisible();
  await expect(
    financialMetric(ledgerActuals, 'Actual entry').getByText('10', { exact: true }),
  ).toBeVisible();
  await page.getByText('Plans, reviews & immutable history', { exact: true }).click();
  await page.getByLabel('Published plan snapshot').selectOption(committed.originalPlan!.id);
  await expect(
    page
      .getByRole('region', { name: 'Published plan v1', exact: true })
      .getByText('1 ' + currency.code + ' · Quantity times entry-to-stop distance', {
        exact: true,
      }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Lessons learned')).toHaveValue(
    'Wait for confirmation, then follow the plan.',
  );
  await accessibility(page, info, 'journal-review');
  const urls = testDatabaseUrls();
  const viewerPassword = randomBytes(24).toString('hex');
  const viewer = await bootstrapOwner(
    {
      email: `journal-viewer-${randomUUID()}@example.test`,
      password: viewerPassword,
      name: 'Journal browser viewer',
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
    await viewerPage.goto(`/journal?workspace=${workspace.id}&trade=${tradeId}`);
    await expect(viewerPage.getByText(/Viewer access/)).toBeVisible();
    await expect(viewerPage.getByLabel('Thesis')).toBeDisabled();
    await expect(viewerPage.getByRole('button', { name: 'Save now' })).toHaveCount(0);
    await expect(viewerPage.getByLabel('Upload screenshot or document')).toHaveCount(0);
    await expect(
      financialMetric(viewerPage, 'R multiple').getByText('1.9', { exact: true }),
    ).toBeVisible();
    await accessibility(viewerPage, info, 'journal-viewer');
  } finally {
    await viewerContext.close();
  }
  const anonymous = await browser.newContext();
  try {
    const attachmentId = reviewed.journal.document.review.attachments[0]!.attachmentId;
    expect(
      (
        await anonymous.request.get(`${origin}${prefix}/journal-attachments/${attachmentId}`)
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
});

test('retrospective original plans remain reviewable without inventing historical R', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const email = process.env.TEST_OWNER_EMAIL;
  const password = process.env.TEST_OWNER_PASSWORD;
  if (!email || !password) throw new Error('The isolated browser owner fixture is required.');
  await signIn(page, email, password);
  const origin = new URL(page.url()).origin;
  const workspaceId = contract.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  ).workspaces[0]?.id;
  if (!workspaceId) throw new Error('The owner needs a workspace.');
  const prefix = `/api/v1/workspaces/${workspaceId}`;
  const proof = (await page.request.get('/api/auth/session')).headers()['x-csrf-token'];
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
  const initial = '2025-01-01T00:00:00.000Z';
  const currency = await post(
    'financial/currencies',
    {
      namespace: 'journal:retrospective',
      code: `USD-${randomUUID().slice(0, 8)}`,
      kind: 'fiat',
      unitIdentity: `journal:retro:USD:${randomUUID()}`,
      name: 'Retrospective dollar',
      displayScale: 2,
      settlementIncrement: '0.01',
      effectiveAt: initial,
    },
    contract.currencyResponseSchema,
  );
  const account = await post(
    'financial/accounts',
    {
      name: 'Retrospective account ' + randomUUID().slice(0, 8),
      environment: 'live',
      accountType: 'cash',
      baseCurrencyId: currency.id,
      inventoryMethod: 'fifo',
      allowShort: false,
      holdingMode: 'netted',
      effectiveAt: initial,
    },
    contract.accountResponseSchema,
  );
  const bucket = await post(
    'financial/cash-buckets',
    { accountId: account.id, currencyId: currency.id, kind: 'settled' },
    contract.cashBucketResponseSchema,
  );
  const instrument = await post(
    'financial/instruments',
    {
      name: 'Retrospective fractional share ' + randomUUID().slice(0, 8),
      family: 'stock',
      subtype: 'ordinary-share',
      economicIdentity: 'journal:retro:' + randomUUID(),
      quantityUnit: 'share',
      quoteCurrencyId: currency.id,
      settlementCurrencyId: currency.id,
      multiplier: '1',
      quantityIncrement: '0.0001',
      priceIncrement: '0.0001',
      capability: 'native-linear',
      effectiveAt: initial,
      metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
    },
    contract.instrumentResponseSchema,
  );
  const trade = await post(
    'financial/trades',
    {
      title: 'Retrospective campaign ' + randomUUID().slice(0, 8),
      classification: 'active-trading',
    },
    contract.tradeResponseSchema,
  );
  const leg = await post(
    'financial/trade-legs',
    {
      tradeId: trade.id,
      expectedRevision: trade.revision,
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      direction: 'long',
      label: 'Historical long leg',
    },
    contract.tradeLegResponseSchema,
  );
  for (const [side, price, economicAt] of [
    ['buy', '100', '2025-02-01T00:00:00.000Z'],
    ['sell', '104', '2025-02-02T00:00:00.000Z'],
  ] as const) {
    const execution = await post(
      'financial/executions',
      {
        accountId: account.id,
        instrumentVersionId: instrument.versionId,
        side,
        quantity: '0.125',
        price,
        cashBucketId: bucket.id,
        costsComplete: true,
        economicAt,
        orderingKey: '1',
        fees: [],
      },
      contract.executionResponseSchema,
    );
    await post(
      'financial/execution-allocations',
      {
        executionId: execution.id,
        expectedVersion: 1,
        reason: 'Historical journal attribution',
        allocations: [{ tradeLegId: leg.id, quantity: '0.125' }],
      },
      contract.allocationMutationResponseSchema,
    );
  }
  await page.goto(`/journal?workspace=${workspaceId}&trade=${trade.id}`);
  await expect(page.getByRole('heading', { name: trade.title, exact: true })).toBeVisible();
  await page.getByLabel('Thesis').fill('Recorded honestly after the executions.');
  await page.getByLabel('Record planned initial risk').check();
  await page.getByLabel('Initial risk amount').fill('0.25');
  await page.getByLabel('Initial risk currency').selectOption(currency.id);
  await page.getByLabel('Initial risk methodology').fill('Retrospective reconstruction');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.getByText('All journal changes saved')).toBeVisible();
  await page.getByLabel('Plan publication reason').fill('An explicitly retrospective review');
  await page.getByRole('button', { name: 'Commit original plan' }).click();
  await page.getByRole('button', { name: 'Confirm publication' }).click();
  await expect(page.getByText(/Plan v1 published/)).toBeVisible();
  const detail = contract.journalDetailResponseSchema.parse(
    await (await page.request.get(`${prefix}/journals/${trade.id}`)).json(),
  );
  expect(detail.commitment?.timing).toBe('retrospective');
  await post(
    `financial/trades/${trade.id}/closures`,
    {
      expectedRevision: detail.trade.revision,
      reason: 'Review historical flat trade',
      obligationEvidence: 'Both historical principals are recorded in settled cash',
    },
    contract.tradeClosureResponseSchema,
  );
  await page.reload();
  await expect(page.getByText(/Retrospective plan/)).toBeVisible();
  await expect(page.getByText(/original plan was recorded after trading had begun/i)).toBeVisible();
  const reviewed = contract.journalDetailResponseSchema.parse(
    await (await page.request.get(`${prefix}/journals/${trade.id}`)).json(),
  );
  expect(reviewed.financial.rMultiple).toMatchObject({ status: 'unavailable', value: null });
  expect(reviewed.financial.rMultiple.reasons).toContain('retrospective_original_plan');
  await page.getByLabel('Lessons learned').fill('Future plans must be committed before execution.');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.getByText('All journal changes saved')).toBeVisible();
});
