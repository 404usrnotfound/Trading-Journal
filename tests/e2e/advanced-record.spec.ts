import { randomUUID } from 'node:crypto';
import * as c from '@journal/contracts';
import { expect, test, type Locator } from '@playwright/test';
import { createBrowserOwner } from './owner-fixture.js';

test('advanced entry funds and converts cash, records selected lots and multiple charges, then splits one existing fill', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/sign-in');
  const origin = new URL(page.url()).origin;
  const { email, password } = await createBrowserOwner(origin);
  const login = await page.request.post('/api/auth/sign-in/email', {
    headers: { origin, 'content-type': 'application/json' },
    data: { email, password },
  });
  expect(login.status()).toBe(200);
  const session = await page.request.get('/api/auth/session');
  const proof = session.headers()['x-csrf-token'];
  expect(proof).toBeTruthy();
  const workspace = c.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  ).workspaces[0];
  if (!workspace) throw new Error('The owner needs a workspace.');
  const financial = `/api/v1/workspaces/${workspace.id}/financial`;
  const source = `advanced-browser:${randomUUID()}`;
  const initial = '2025-01-01T00:00:00Z';
  const at = (day: string) => `2025-03-${day}T12:00:00.123456+01:00`;
  async function post<Value>(
    resource: string,
    body: unknown,
    schema: { parse(input: unknown): Value },
  ) {
    const response = await page.request.post(`${financial}/${resource}`, {
      data: body,
      headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': randomUUID() },
    });
    const result: unknown = await response.json();
    expect(response.status(), JSON.stringify(result)).toBe(200);
    return schema.parse(result);
  }
  const currencies = [];
  for (const code of ['USD', 'EUR']) {
    currencies.push(
      await post(
        'currencies',
        {
          namespace: source,
          code,
          kind: 'fiat',
          unitIdentity: `${source}:${code}`,
          name: `${source} ${code}`,
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: initial,
        },
        c.currencyResponseSchema,
      ),
    );
  }
  const [usd, eur] = currencies;
  if (!usd || !eur) throw new Error('Both source currencies are required.');
  await page.goto(`/record?workspace=${workspace.id}&mode=advanced`);
  await expect(page.getByRole('heading', { name: 'Advanced financial entry' })).toBeVisible();
  async function operation(value: string) {
    await page.getByLabel('Record type', { exact: true }).selectOption(value);
  }
  async function fields(values: Record<string, string>, scope: Locator = page.locator('form')) {
    for (const [label, value] of Object.entries(values))
      await scope.getByLabel(label, { exact: true }).fill(value);
  }
  async function confirm<Value>(resource: string, schema: { parse(input: unknown): Value }) {
    await page.getByRole('button', { name: 'Review record', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Review financial record' })).toBeVisible();
    const [response] = await Promise.all([
      page.waitForResponse(
        (result) =>
          result.request().method() === 'POST' &&
          new URL(result.url()).pathname === `${financial}/${resource}`,
      ),
      page.getByRole('button', { name: 'Confirm and record', exact: true }).click(),
    ]);
    const result: unknown = await response.json();
    expect(response.status(), JSON.stringify(result)).toBe(200);
    await expect(
      page.getByText(
        'Recorded successfully. Financial history and source references are retained.',
      ),
    ).toBeVisible();
    return schema.parse(result);
  }
  await operation('brokers');
  await fields({ 'Broker name': 'Independent source broker', 'Source namespace': source });
  const broker = await confirm('brokers', c.brokerResponseSchema);
  const account = await post(
    'accounts',
    {
      name: source,
      brokerId: broker.id,
      environment: 'paper',
      accountType: 'cash',
      baseCurrencyId: usd.id,
      inventoryMethod: 'specific',
      allowShort: false,
      holdingMode: 'netted',
      effectiveAt: initial,
    },
    c.accountResponseSchema,
  );
  const instrument = await post(
    'instruments',
    {
      name: `${source} share`,
      family: 'stock',
      subtype: 'ordinary-share',
      economicIdentity: `${source}:share`,
      quantityUnit: 'share',
      quoteCurrencyId: usd.id,
      settlementCurrencyId: usd.id,
      multiplier: '1',
      quantityIncrement: '0.000001',
      priceIncrement: '0.000001',
      capability: 'native-linear',
      effectiveAt: initial,
      metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
    },
    c.instrumentResponseSchema,
  );
  const buckets = [];
  for (const currency of [usd, eur]) {
    await operation('cash-buckets');
    await fields({ Account: account.id, Currency: currency.id });
    await page.getByLabel('Cash category', { exact: true }).selectOption('settled');
    buckets.push(await confirm('cash-buckets', c.cashBucketResponseSchema));
  }
  const [usdBucket, eurBucket] = buckets;
  if (!usdBucket || !eurBucket) throw new Error('Both cash buckets are required.');
  for (const [currency, cashBucket, amount] of [
    [usd, usdBucket, '1000'],
    [eur, eurBucket, '100'],
  ] as const) {
    await operation('cash-movements');
    await fields({
      Account: account.id,
      'Cash bucket': cashBucket.id,
      Currency: currency.id,
      'Actual amount': amount,
      'Economic time (ISO 8601 with offset)': at('01'),
    });
    await page.getByLabel('Movement type', { exact: true }).selectOption('deposit');
    await confirm('cash-movements', c.financialMutationResponseSchema);
  }
  async function charge(index: number, currency: string, cashBucket: string, amount: string) {
    await page.getByRole('button', { name: 'Add charge', exact: true }).click();
    await fields(
      {
        Currency: currency,
        'Cash bucket': cashBucket,
        'Actual amount': amount,
        'Charge kind': 'commission',
      },
      page.getByRole('group', { name: `fees ${index}`, exact: true }),
    );
  }
  await operation('fx-conversions');
  await fields({
    'Source cash bucket': usdBucket.id,
    'Destination cash bucket': eurBucket.id,
    'Actual source amount': '100',
    'Actual destination amount': '90',
    'Source quoted rate (optional)': '0.9',
    'Economic time (ISO 8601 with offset)': at('02'),
  });
  await charge(1, usd.id, usdBucket.id, '0.5');
  await charge(2, eur.id, eurBucket.id, '0.2');
  await confirm('fx-conversions', c.fxConversionResponseSchema);
  await operation('opening-lots');
  await fields({
    Account: account.id,
    'Instrument version': instrument.versionId,
    Quantity: '2',
    'Known original entry price': '100',
    'Known original booked basis': '200',
    'Reason / source evidence': 'Verified historical source lot; cash was funded separately',
    'Economic time (ISO 8601 with offset)': at('03'),
  });
  await page.getByLabel('Direction', { exact: true }).selectOption('long');
  await page.getByLabel('Original actual costs are complete', { exact: true }).check();
  const opening = await confirm('opening-lots', c.financialMutationResponseSchema);
  await operation('executions');
  await fields({
    Account: account.id,
    'Instrument version': instrument.versionId,
    Quantity: '1',
    'Actual source fill price': '120',
    'Cash bucket': usdBucket.id,
    'Economic time (ISO 8601 with offset)': at('04'),
  });
  await page.getByLabel('Side', { exact: true }).selectOption('sell');
  await page.getByLabel('All actual source costs are included', { exact: true }).check();
  await page.getByLabel('Close only', { exact: true }).check();
  await page.getByText('Available source lots', { exact: true }).click();
  const sourceLotRow = page
    .locator('details')
    .filter({ has: page.getByText('Available source lots', { exact: true }) })
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '2', exact: true }) });
  await expect(sourceLotRow).toBeVisible();
  const selectedLotId = await sourceLotRow.getByRole('cell').first().innerText();
  expect(selectedLotId).toBe(opening.id);
  await charge(1, usd.id, usdBucket.id, '1');
  await charge(2, eur.id, eurBucket.id, '2');
  await page.getByRole('button', { name: 'Add lot', exact: true }).click();
  await fields(
    { 'Source lot reference': selectedLotId, Quantity: '1' },
    page.getByRole('group', { name: 'lots 1', exact: true }),
  );
  const attempts: { key: string | undefined; body: unknown }[] = [];
  let committed: unknown;
  await page.route(`**${financial}/executions`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON(),
    });
    if (attempts.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committed = c.executionResponseSchema.parse(await response.json());
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Review record', exact: true }).click();
  expect(attempts).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirm and record', exact: true }).click();
  await expect(page.locator('#main-content').getByRole('alert')).toContainText(
    'response was interrupted',
  );
  await expect(page.getByLabel('Account', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Record type', { exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Return to source fields', exact: true }),
  ).toBeDisabled();
  // The retry must use the frozen economics and command after a committed but
  // lost response, never book a second disposal or charge the fees twice.
  const [retry] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `${financial}/executions` &&
        response.status() === 200,
    ),
    page.getByRole('button', { name: 'Confirm and record', exact: true }).click(),
  ]);
  expect(c.executionResponseSchema.parse(await retry.json())).toEqual(committed);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  const execution = c.executionResponseSchema.parse(committed);
  expect(execution.payload.sourceInput).toMatchObject({
    fees: [
      { amount: '1', currencyId: usd.id },
      { amount: '2', currencyId: eur.id },
    ],
    specificLots: [{ lotId: opening.id, quantity: '1' }],
    economicAt: at('04'),
  });
  const balances = c.cashBalanceResponseSchema
    .array()
    .parse(
      await (await page.request.get(`${financial}/cash-balances?accountId=${account.id}`)).json(),
    );
  expect(balances).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ currencyId: usd.id, amount: '1018.5' }),
      expect.objectContaining({ currencyId: eur.id, amount: '187.8' }),
    ]),
  );
  const positions = c.positionResponseSchema
    .array()
    .parse(await (await page.request.get(`${financial}/positions?accountId=${account.id}`)).json());
  expect(positions[0]?.inventory.openQuantity.value).toBe('1');
  expect(positions[0]?.inventory.matches[0]?.lotId).toBe(opening.id);

  const campaignSources: { tradeId: string; title: string; legId: string }[] = [];
  for (const label of ['First idea', 'Second idea']) {
    const trade = await post(
      'trades',
      { title: `${source} ${label}`, classification: 'active-trading' },
      c.tradeResponseSchema,
    );
    const leg = await post(
      'trade-legs',
      {
        tradeId: trade.id,
        expectedRevision: trade.revision,
        accountId: account.id,
        instrumentVersionId: instrument.versionId,
        direction: 'long',
        label,
      },
      c.tradeLegResponseSchema,
    );
    campaignSources.push({ tradeId: trade.id, title: trade.title, legId: leg.id });
  }
  // Re-enter after preparing the independent campaign fixtures so the browser
  // discovers their human labels and source references from the actual reads.
  await page.reload();
  await operation('execution-allocations');
  await fields({
    'Filter source executions by account': account.id,
    'Recorded execution': execution.id,
    'Reason / source evidence':
      'Split the one actual source fill between independently reviewed ideas',
  });
  const allocationReference = page.getByRole('region', { name: 'Current execution allocation' });
  await expect(allocationReference).toContainText('Current allocation version:');
  const allocationVersion = (await allocationReference.innerText()).match(
    /Current allocation version: (\d+)/u,
  )?.[1];
  expect(allocationVersion).toBeTruthy();
  await allocationReference.getByRole('button', { name: 'Use current allocation version' }).click();
  await expect(page.getByLabel('Current allocation version', { exact: true })).toHaveValue(
    allocationVersion!,
  );
  const legIds: string[] = [];
  for (const [index, quantity] of ['0.4', '0.6'].entries()) {
    const campaignSource = campaignSources[index]!;
    const campaignOption = page
      .locator('datalist option')
      .filter({ hasText: campaignSource.title });
    await expect(campaignOption).toHaveCount(1);
    const suggestedTradeId = await campaignOption.getAttribute('value');
    expect(suggestedTradeId).toBe(campaignSource.tradeId);
    await fields({ 'Choose campaign for allocation leg suggestions': suggestedTradeId! });
    const references = page
      .locator('details')
      .filter({ hasText: `Campaign leg references · ${campaignSource.title}` });
    const sourceText = await references.getByRole('listitem').innerText();
    const legId = sourceText.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )?.[0];
    expect(legId).toBe(campaignSource.legId);
    legIds.push(legId!);
    await page.getByRole('button', { name: 'Add allocation', exact: true }).click();
    await fields(
      { 'Campaign leg reference': legIds[index]!, Quantity: quantity },
      page.getByRole('group', { name: `allocations ${index + 1}`, exact: true }),
    );
  }
  await confirm('execution-allocations', c.allocationMutationResponseSchema);
  const allocated = c.executionAllocationResponseSchema.parse(
    await (await page.request.get(`${financial}/executions/${execution.id}/allocations`)).json(),
  );
  expect(allocated.allocations).toEqual(
    expect.arrayContaining([
      { tradeLegId: legIds[0], quantity: '0.4' },
      { tradeLegId: legIds[1], quantity: '0.6' },
      { tradeLegId: null, quantity: '0' },
    ]),
  );
  expect(
    c.cashBalanceResponseSchema
      .array()
      .parse(
        await (await page.request.get(`${financial}/cash-balances?accountId=${account.id}`)).json(),
      ),
  ).toEqual(balances);
  expect(
    c.executionResponseSchema
      .array()
      .parse(
        await (await page.request.get(`${financial}/executions?accountId=${account.id}`)).json(),
      ),
  ).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Advanced financial entry' })).toBeVisible();
});
