import { randomBytes, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import * as contract from '@journal/contracts';
import { createDatabase } from '@journal/database';
import { bootstrapOwner, parseServerConfig } from '@journal/server';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { testDatabaseUrls } from '../../scripts/environment.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lVYAAAAASUVORK5CYII=',
  'base64',
);

/** Small valid single-page PDF, including byte offsets and a cross-reference table. */
function referencePdf(): Buffer {
  const contents = 'BT /F1 12 Tf 30 100 Td (RSI pullback reference) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(contents)} >>\nstream\n${contents}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let document = '%PDF-1.7\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const crossReference = Buffer.byteLength(document);
  document += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${crossReference}\n%%EOF\n`;
  return Buffer.from(document);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}

async function checkAccessible(page: Page, testInfo: TestInfo, stage: string) {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark'] as const) {
      const switchButton = page.getByRole('button', { name: `Switch to ${theme} theme` });
      if (await switchButton.isVisible()) await switchButton.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(result.violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${stage}-${viewport.width}-${theme}.png`),
        fullPage: true,
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath(`${stage}-${viewport.width}-${theme}-viewport.png`),
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

test('strategy playbook versions retain historical rules, attachments and trade pins', async ({
  page,
  browser,
}, testInfo) => {
  // This journey includes owner/viewer workflows and eighteen full accessibility scans.
  test.setTimeout(360_000);
  const email = process.env.TEST_OWNER_EMAIL;
  const password = process.env.TEST_OWNER_PASSWORD;
  if (!email || !password) throw new Error('The isolated browser owner fixture is required');
  await signIn(page, email, password);
  const origin = new URL(page.url()).origin;
  const workspaces = contract.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  );
  const workspace = workspaces.workspaces[0];
  if (!workspace) throw new Error('The owner needs a workspace');
  const prefix = `/api/v1/workspaces/${workspace.id}`;
  await page.getByRole('link', { name: 'Strategies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Strategies', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New strategy', exact: true }).click();
  const name = `RSI pullback ${randomUUID().slice(0, 8)}`;
  const narratives = {
    Description: 'Pullbacks in an established trend with explicit RSI confirmation.',
    'Hypothesis / edge': 'Trend continuation after a controlled pullback.',
    'Market regime filters': 'Positive broad-market trend.',
    'Setup conditions': 'Pullback to the rising twenty-day average.',
    'Entry rules': 'RSI below 30 and a close above the trigger candle.',
    'Confirmation rules': 'Volume exceeds the twenty-day average.',
    'Invalidation rules': 'A close below the identified swing low.',
    'Stop-loss methodology': 'Stop below the swing low before entry.',
    'Take-profit methodology': 'Scale at two R and trail the remainder.',
    'Risk rules': 'Risk at most one percent of account equity.',
    'Position sizing rules': 'Risk budget divided by the entry-to-stop distance.',
    'Scaling rules': 'One additional entry after confirmation.',
    'Trailing / management rules': 'Trail below completed daily swing lows.',
    'Exit rules': 'Exit on invalidation or a completed trailing stop.',
    'Review schedule': 'Review after twenty qualified trades.',
    Notes: '<img src=x onerror=alert(1)> is a literal research note.',
  };
  for (const section of [
    'Additional eligibility & context',
    'Detailed rules & reference notes',
    'Required checklist',
    'Named setups',
    'Typed parameters',
    'Screenshots & attachments',
  ])
    await page.locator('summary').filter({ hasText: section }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Status', { exact: true }).selectOption('active');
  await page.getByLabel('Direction', { exact: true }).selectOption('long');
  for (const [label, value] of Object.entries({
    'Asset classes': 'stock, ETF',
    Markets: 'NYSE, NASDAQ',
    Timeframes: '1h, 1d',
    Sessions: 'New York regular',
    Indicators: 'RSI, SMA',
    Tags: 'momentum, pullback',
    'Trading style': 'Swing',
    ...narratives,
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Effective date & time').fill('2025-01-01T10:00');
  await page.getByRole('button', { name: 'Add checklist item', exact: true }).click();
  await page.getByLabel('Checklist item 1', { exact: true }).fill('Volume confirmed');
  await expect(page.getByLabel('Required item 1')).toBeChecked();
  await page.getByRole('button', { name: 'Add named setup', exact: true }).click();
  await page.getByLabel('Setup 1 name', { exact: true }).fill('Opening pullback');
  await page.getByLabel('Setup 1 description', { exact: true }).fill('Trend pullback after open.');
  await page.getByLabel('Setup 1 conditions', { exact: true }).fill('A higher low is confirmed.');
  await page.getByLabel('Setup 1: Volume confirmed', { exact: true }).check();
  await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await page.getByLabel('Parameter 1 name', { exact: true }).fill('RSI threshold');
  const exactThreshold = '30.000000000000000000000000000000000001';
  await page.getByLabel('Parameter 1 value', { exact: true }).fill(exactThreshold);
  await page.getByLabel('Parameter 1 unit', { exact: true }).fill('RSI points');
  await page.getByLabel('Parameter 1 minimum', { exact: true }).fill('0');
  await page.getByLabel('Parameter 1 maximum', { exact: true }).fill('100');
  const pdf = referencePdf();
  for (const file of [
    { name: 'entry-chart.png', mimeType: 'image/png', buffer: png },
    { name: 'playbook-reference.pdf', mimeType: 'application/pdf', buffer: pdf },
  ]) {
    await page.getByLabel('Upload screenshot or reference document').setInputFiles(file);
    await expect(page.getByRole('link', { name: file.name, exact: true })).toBeVisible();
    await expect(page.getByLabel('Upload screenshot or reference document')).toBeEnabled();
  }
  await checkAccessible(page, testInfo, 'strategy-editor');
  const created = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/strategies'),
  );
  await page.getByRole('button', { name: 'Create strategy', exact: true }).click();
  const createResponse = await created;
  expect(createResponse.status(), await createResponse.text()).toBe(200);
  const first = contract.strategyResponseSchema.parse(await createResponse.json());
  expect(first.currentVersion.version).toBe(1);
  expect(first.currentVersion.definition.parameters[0]).toMatchObject({ value: exactThreshold });
  expect(first.currentVersion.definition.attachmentIds).toHaveLength(2);
  expect(first.currentVersion.definition.setups[0]?.checklistItemIds).toEqual([
    first.currentVersion.definition.checklist[0]!.id,
  ]);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText(narratives.Notes, { exact: true })).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  const proof = (await page.request.get('/api/auth/session')).headers()['x-csrf-token'];
  expect(proof).toBeTruthy();
  const tradeName = `Version-one trade ${randomUUID().slice(0, 8)}`;
  const tradeResponse = await page.request.post(`${prefix}/financial/trades`, {
    data: {
      title: tradeName,
      classification: 'active-trading',
      strategyVersionId: first.currentVersionId,
    },
    headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': randomUUID() },
  });
  expect(tradeResponse.status(), await tradeResponse.text()).toBe(200);
  const trade = contract.tradeResponseSchema.parse(await tradeResponse.json());
  expect(trade.strategyLinkTiming).toBe('recorded-with-trade');
  expect(trade.strategyVersionId).toBe(first.currentVersionId);

  await page.getByRole('button', { name: 'Edit current version', exact: true }).click();
  await page
    .getByLabel('Entry rules', { exact: true })
    .fill('RSI below 25 and a confirmed trigger.');
  await page.getByLabel('Parameter 1 value', { exact: true }).fill('25');
  await page.getByLabel('Reason for this version').fill('Refine RSI threshold after review');
  await page.getByLabel('Effective date & time').fill('2025-04-01T10:00');
  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().endsWith(`/strategies/${first.id}`),
  );
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  const updateResponse = await updated;
  expect(updateResponse.status(), await updateResponse.text()).toBe(200);
  const second = contract.strategyResponseSchema.parse(await updateResponse.json());
  expect(second.currentVersion.version).toBe(2);
  expect(second.currentVersionId).not.toBe(first.currentVersionId);
  await page.getByLabel('View strategy version').selectOption(first.currentVersionId);
  await expect(page.getByText(narratives['Entry rules'], { exact: true })).toBeVisible();
  await expect(page.getByText(tradeName, { exact: true })).toBeVisible();
  await expect(page.getByText('Recorded with trade', { exact: false })).toBeVisible();
  await page.getByLabel('Compare this version with').selectOption(second.currentVersionId);
  await expect(
    page.getByRole('table').getByText('RSI below 25 and a confirmed trigger.'),
  ).toBeVisible();
  await checkAccessible(page, testInfo, 'strategy-history');
  expect(await page.getByText(/win rate|expectancy/iu).count()).toBe(0);
  const oldVersion = await page.request.get(
    `${prefix}/strategies/${first.id}/versions/${first.currentVersionId}`,
  );
  expect(contract.strategyVersionResponseSchema.parse(await oldVersion.json())).toEqual(
    first.currentVersion,
  );
  const tradeRead = await page.request.get(`${prefix}/financial/trades/${trade.id}`);
  expect(contract.tradeResponseSchema.parse(await tradeRead.json())).toEqual(trade);
  const attachmentNames = ['entry-chart.png', 'playbook-reference.pdf'];
  const attachmentBytes = [png, pdf];
  for (const [index, id] of first.currentVersion.definition.attachmentIds.entries()) {
    const file = await page.request.get(`${prefix}/strategy-attachments/${id}`);
    expect(file.status()).toBe(200);
    expect(file.headers()['cache-control']).toContain('private');
    expect(file.headers()['content-disposition']).toContain(attachmentNames[index]);
    expect(await file.body()).toEqual(attachmentBytes[index]);
    if (index === 1) expect(file.headers()['content-disposition']).toMatch(/^attachment;/u);
  }

  await page.reload();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByLabel('View strategy version')).toHaveValue(first.currentVersionId);
  await page.getByLabel('View strategy version').selectOption(second.currentVersionId);
  await expect(
    page.getByText('RSI below 25 and a confirmed trigger.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('View strategy version').selectOption(first.currentVersionId);
  await expect(page.getByText(tradeName, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archive strategy', exact: true }).click();
  await page.getByLabel('Reason for archiving').fill('Retire after research review');
  await page.getByRole('button', { name: 'Confirm archive', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Archive this strategy?');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Archive strategy', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'Strategy archived. Its versions and linked trades have been preserved.',
  );
  await page.getByLabel('Include archived', { exact: true }).check();
  await expect(page.getByRole('button', { name: new RegExp(name, 'u') })).toBeVisible();
  await page.reload();
  await page.getByLabel('View strategy version').selectOption(first.currentVersionId);
  await expect(page.getByText(tradeName, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'entry-chart.png', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit current version', exact: true })).toHaveCount(
    0,
  );

  // Provision only isolated browser-test data; real viewer membership drives both UI and API rules.
  const urls = testDatabaseUrls();
  const viewerPassword = randomBytes(24).toString('hex');
  const viewer = await bootstrapOwner(
    {
      email: `strategy-viewer-${randomUUID()}@example.test`,
      password: viewerPassword,
      name: 'Strategy browser viewer',
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
    await viewerPage.goto(`/strategies?workspace=${workspace.id}&strategy=${first.id}`);
    await expect(
      viewerPage.getByText(
        'You have viewer access. Strategy versions and linked trades are read-only.',
      ),
    ).toBeVisible();
    for (const action of ['New strategy', 'Edit current version', 'Archive strategy'])
      await expect(viewerPage.getByRole('button', { name: action, exact: true })).toHaveCount(0);
    await expect(viewerPage.getByLabel('Unclassified trade')).toHaveCount(0);
    await viewerPage.getByLabel('View strategy version').selectOption(first.currentVersionId);
    await expect(viewerPage.getByText(narratives['Entry rules'], { exact: true })).toBeVisible();
    await expect(viewerPage.getByText(tradeName, { exact: true })).toBeVisible();
    const viewerProof = (await viewerPage.request.get('/api/auth/session')).headers()[
      'x-csrf-token'
    ];
    expect(viewerProof).toBeTruthy();
    const forbidden = await viewerPage.request.post(`${prefix}/strategies`, {
      data: {
        definition: { name: 'Forbidden viewer strategy' },
        effectiveAt: '2025-01-01T00:00:00Z',
      },
      headers: { origin, 'x-csrf-token': viewerProof!, 'idempotency-key': randomUUID() },
    });
    expect(forbidden.status()).toBe(403);
    await checkAccessible(viewerPage, testInfo, 'strategy-viewer');
  } finally {
    await viewerContext.close();
  }
  const outsider = await browser.newContext();
  try {
    const denied = await outsider.request.get(
      `${origin}${prefix}/strategy-attachments/${first.currentVersion.definition.attachmentIds[0]}`,
    );
    expect(denied.status()).toBe(401);
  } finally {
    await outsider.close();
  }
});
