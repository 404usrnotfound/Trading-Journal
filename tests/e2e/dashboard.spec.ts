import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as contract from '@journal/contracts';

test('dashboard real-data filters, all views, drill-down and responsive themed accessibility', async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  const email = process.env.TEST_OWNER_EMAIL,
    password = process.env.TEST_OWNER_PASSWORD;
  if (!email || !password) throw new Error('Isolated browser credentials are required');
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const origin = new URL(page.url()).origin,
    session = await page.request.get('/api/auth/session'),
    proof = session.headers()['x-csrf-token'];
  const workspaces = contract.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  );
  const workspace = workspaces.workspaces[0]!.id,
    prefix = `/api/v1/workspaces/${workspace}`;
  async function post<T>(path: string, body: unknown, schema: { parse(value: unknown): T }) {
    const result = await page.request.post(prefix + path, {
      data: body,
      headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': randomUUID() },
    });
    const value: unknown = await result.json();
    expect(result.status(), JSON.stringify(value)).toBe(200);
    return schema.parse(value);
  }
  const effectiveAt = '2025-01-01T00:00:00Z';
  const strategy = await post(
    '/strategies',
    {
      definition: {
        name: 'Dashboard historical playbook',
        status: 'active',
        entryRules: 'Original rules remain attached to this version.',
      },
      effectiveAt,
    },
    contract.strategyResponseSchema,
  );
  const currency = await post(
    '/financial/currencies',
    {
      namespace: `dashboard:${randomUUID()}`,
      code: 'EUR',
      kind: 'fiat',
      unitIdentity: `dashboard:EUR:${randomUUID()}`,
      name: 'Dashboard euro',
      displayScale: 2,
      settlementIncrement: '0.01',
      effectiveAt,
    },
    contract.currencyResponseSchema,
  );
  const account = await post(
    '/financial/accounts',
    {
      name: 'Dashboard isolated account',
      environment: 'live',
      accountType: 'cash',
      baseCurrencyId: currency.id,
      inventoryMethod: 'fifo',
      allowShort: false,
      holdingMode: 'netted',
      effectiveAt,
    },
    contract.accountResponseSchema,
  );
  const bucket = await post(
    '/financial/cash-buckets',
    { accountId: account.id, currencyId: currency.id, kind: 'settled' },
    contract.cashBucketResponseSchema,
  );
  const asset = await post(
    '/financial/instruments',
    {
      name: 'Dashboard isolated equity',
      family: 'stock',
      subtype: 'ordinary-share',
      economicIdentity: `dashboard:${randomUUID()}`,
      quantityUnit: 'share',
      quoteCurrencyId: currency.id,
      settlementCurrencyId: currency.id,
      multiplier: '1',
      quantityIncrement: '1',
      priceIncrement: '0.01',
      capability: 'native-linear',
      metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
      effectiveAt,
    },
    contract.instrumentResponseSchema,
  );
  await post(
    '/financial/cash-movements',
    {
      accountId: account.id,
      cashBucketId: bucket.id,
      currencyId: currency.id,
      amount: '1000',
      kind: 'deposit',
      economicAt: '2029-12-31T12:00:00Z',
      orderingKey: '1',
    },
    contract.financialMutationResponseSchema,
  );
  const created = await post(
    '/journals',
    {
      title: 'Dashboard known winner',
      classification: 'active-trading',
      strategyVersionId: strategy.currentVersionId,
      legs: [
        {
          accountId: account.id,
          instrumentVersionId: asset.versionId,
          direction: 'long',
          label: 'Main',
        },
      ],
    },
    contract.journalDetailResponseSchema,
  );
  const save = await page.request.put(`${prefix}/journals/${created.trade.id}`, {
    data: {
      expectedRevision: created.journal.revision,
      document: contract.journalDocumentSchema.parse({
        plan: {
          initialRisk: { amount: '10', currencyId: currency.id, method: 'Original committed risk' },
        },
        review: { customTags: ['dashboard-reviewed'] },
      }),
    },
    headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': randomUUID() },
  });
  expect(save.status()).toBe(200);
  const saved = contract.journalEntryResponseSchema.parse(await save.json());
  await post(
    `/journals/${created.trade.id}/plans`,
    {
      expectedRevision: saved.revision,
      expectedTradeRevision: created.trade.revision,
      reason: 'Commit before economic entry',
    },
    contract.journalPlanVersionResponseSchema,
  );

  for (const [side, price, economicAt] of [
    ['buy', '100', '2030-01-02T12:00:00Z'],
    ['sell', '120', '2030-01-03T12:00:00Z'],
  ] as const) {
    const fill = await post(
      '/financial/executions',
      {
        accountId: account.id,
        instrumentVersionId: asset.versionId,
        side,
        quantity: '1',
        price,
        cashBucketId: bucket.id,
        costsComplete: true,
        economicAt,
        orderingKey: '1',
        fees: [
          { currencyId: currency.id, cashBucketId: bucket.id, amount: '1', kind: 'commission' },
        ],
      },
      contract.executionResponseSchema,
    );
    await post(
      '/financial/execution-allocations',
      {
        executionId: fill.id,
        expectedVersion: 1,
        reason: 'Assign once',
        allocations: [{ tradeLegId: created.financial.legs[0]!.legId, quantity: '1' }],
      },
      contract.allocationMutationResponseSchema,
    );
  }
  const trade = contract.tradeResponseSchema.parse(
    await (await page.request.get(`${prefix}/financial/trades/${created.trade.id}`)).json(),
  );
  await post(
    `/financial/trades/${trade.id}/closures`,
    {
      expectedRevision: trade.revision,
      reason: 'Actual flat quantity',
      obligationEvidence: 'Settled cash',
    },
    contract.tradeClosureResponseSchema,
  );
  const params = new URLSearchParams({
    workspace,
    from: '2030-01-01',
    to: '2030-01-05',
    accountIds: account.id,
    currency: currency.id,
    strategy: strategy.id,
    strategyVersionId: strategy.currentVersionId,
  });
  await page.goto(`/dashboard?${params}`);
  await expect(page.getByRole('heading', { name: 'Analytics dashboard' })).toBeVisible();
  const net = page.getByRole('button', { name: /Closed net P&L/ });
  await expect(net).toContainText('18 EUR');
  await expect(page.getByRole('button', { name: /Average R/ })).toContainText('1.8 R');
  await expect(
    page.getByRole('button', { name: /Strategy: Dashboard historical playbook/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Strategy version: Dashboard historical playbook/ }),
  ).toBeVisible();
  await page.getByText('About Average R', { exact: true }).click();
  await expect(page.getByText(/Missing or retrospective risk is excluded/)).toBeVisible();
  await page.getByText('About Average R', { exact: true }).click();
  const performanceTab = page.getByRole('tab', { name: 'Performance' });
  await performanceTab.focus();
  await performanceTab.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Distributions' })).toBeFocused();
  await expect(page).toHaveURL(/view=distributions/);
  await expect(page).toHaveURL(new RegExp(`strategyVersionId=${strategy.currentVersionId}`));
  await page.getByRole('tab', { name: 'Distributions' }).press('Home');
  await expect(performanceTab).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Equity curve', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Capital-adjusted performance', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Capital-adjusted monetary performance' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Distributions' }).click();
  for (const name of ['P&L distribution', 'R distribution', 'Win/loss distribution'])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Breakdowns' }).click();
  for (const name of ['Strategy performance', 'Asset performance', 'Account allocation'])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByText('Portfolio, trade and pricing filters').click();
  for (const view of ['Distributions', 'Breakdowns']) {
    await page.getByRole('tab', { name: view }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${view.toLowerCase()}.png`),
      fullPage: true,
    });
  }
  await page.getByLabel('Asset', { exact: true }).selectOption(asset.id);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(new RegExp(`assetIds=${asset.id}`));
  await expect(net).toContainText('18 EUR');
  await expect(page.getByText(/Account equity cannot be attributed/)).toBeVisible();
  await page.reload();
  await expect(net).toContainText('18 EUR');
  await page.getByRole('button', { name: /Asset: Dashboard isolated equity/ }).click();
  await expect(page).not.toHaveURL(new RegExp(`assetIds=${asset.id}`));
  await expect(net).toContainText('18 EUR');
  await page.getByRole('tab', { name: 'Performance' }).click();
  await page.getByRole('button', { name: '2030-01-03: 18 EUR' }).click();
  await expect(page.getByRole('button', { name: 'Show all filtered trades' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard known winner' })).toHaveAttribute(
    'href',
    `/journal?workspace=${workspace}&trade=${trade.id}`,
  );
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 820, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ['light', 'dark'] as const) {
      const toggle = page.getByRole('button', { name: `Switch to ${theme} theme` });
      if (await toggle.isVisible()) await toggle.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`dashboard-${viewport.width}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await page.getByText('Weekly review guide', { exact: true }).click();
  await expect(page.getByText(/Record lessons in the trade journal/)).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No completed trades in this period' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Win rate/ })).toContainText('Unavailable');
  await expect(page).toHaveURL(new RegExp(`strategyVersionIds=${strategy.currentVersionId}`));
  await expect(page.getByRole('link', { name: 'Review account performance' })).toHaveAttribute(
    'href',
    new RegExp(`accountIds=${account.id}`),
  );
  await page.goto(`/dashboard?${params}`);
  await expect(net).toContainText('18 EUR');
  await page.getByRole('link', { name: 'Dashboard known winner' }).click();
  await expect(page.getByRole('heading', { name: 'Trade journal', exact: true })).toBeVisible();
});
