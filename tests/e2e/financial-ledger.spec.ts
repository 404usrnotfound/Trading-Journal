import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import * as contract from '@journal/contracts';

test('authenticated ledger API records exact fractional economics and survives a browser reload', async ({
  page,
}) => {
  const email = process.env.TEST_OWNER_EMAIL;
  const password = process.env.TEST_OWNER_PASSWORD;
  if (!email || !password) throw new Error('The isolated browser owner fixture is required');
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Password', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const origin = new URL(page.url()).origin;
  const session = await page.request.get('/api/auth/session');
  const proof = session.headers()['x-csrf-token'];
  expect(proof).toBeTruthy();
  const workspaces = contract.workspaceListResponseSchema.parse(
    await (await page.request.get('/api/v1/workspaces')).json(),
  );
  const workspaceId = workspaces.workspaces[0]?.id;
  if (!workspaceId) throw new Error('The owner needs a workspace');
  const prefix = `/api/v1/workspaces/${workspaceId}/financial`;
  async function post<Value>(
    resource: string,
    body: unknown,
    schema: { parse(input: unknown): Value },
    commandId = randomUUID(),
  ) {
    const response = await page.request.post(`${prefix}/${resource}`, {
      data: body,
      headers: { origin, 'x-csrf-token': proof!, 'idempotency-key': commandId },
    });
    const value: unknown = await response.json();
    expect(response.status(), JSON.stringify(value)).toBe(200);
    return schema.parse(value);
  }
  const initial = '2025-01-01T00:00:00.000001Z';
  const currency = await post(
    'currencies',
    {
      namespace: 'iso:4217',
      code: 'USD',
      kind: 'fiat',
      unitIdentity: 'iso:USD',
      name: 'US dollar',
      displayScale: 2,
      settlementIncrement: '0.01',
      effectiveAt: initial,
    },
    contract.currencyResponseSchema,
  );
  const account = await post(
    'accounts',
    {
      name: 'Browser ledger fixture',
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
    'cash-buckets',
    { accountId: account.id, currencyId: currency.id, kind: 'settled' },
    contract.cashBucketResponseSchema,
  );
  const instrument = await post(
    'instruments',
    {
      name: 'Fractional browser share',
      family: 'stock',
      subtype: 'ordinary-share',
      economicIdentity: `e2e:ordinary-share:${randomUUID()}`,
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
  await post(
    'cash-movements',
    {
      accountId: account.id,
      cashBucketId: bucket.id,
      currencyId: currency.id,
      amount: '100',
      kind: 'deposit',
      economicAt: '2025-02-01T00:00:00.000001Z',
      orderingKey: '1',
    },
    contract.financialMutationResponseSchema,
  );
  const order = await post(
    'orders',
    {
      accountId: account.id,
      kind: 'single',
      legs: [{ instrumentVersionId: instrument.versionId, side: 'buy', ratio: '1' }],
      instruction: { status: 'working', quantity: '1.5', orderType: 'market', timeInForce: 'day' },
      economicAt: '2025-02-01T01:00:00.000001Z',
    },
    contract.orderResponseSchema,
  );
  const commandId = randomUUID();
  const buy = {
    accountId: account.id,
    instrumentVersionId: instrument.versionId,
    orderLegId: order.legs[0]!.id,
    side: 'buy',
    quantity: '1.5',
    price: '10',
    cashBucketId: bucket.id,
    costsComplete: true,
    economicAt: '2025-02-02T00:00:00.000001Z',
    orderingKey: '1',
    fees: [
      { cashBucketId: bucket.id, currencyId: currency.id, amount: '0.30', kind: 'commission' },
    ],
  };
  const first = await post('executions', buy, contract.executionResponseSchema, commandId);
  expect(await post('executions', buy, contract.executionResponseSchema, commandId)).toEqual(first);
  await post(
    'executions',
    {
      accountId: account.id,
      instrumentVersionId: instrument.versionId,
      side: 'sell',
      quantity: '0.5',
      price: '12',
      cashBucketId: bucket.id,
      costsComplete: true,
      economicAt: '2025-02-03T00:00:00.000001Z',
      orderingKey: '1',
      fees: [
        { cashBucketId: bucket.id, currencyId: currency.id, amount: '0.10', kind: 'commission' },
      ],
    },
    contract.executionResponseSchema,
  );
  const source = `e2e-mark:${randomUUID()}`;
  await post(
    'price-observations',
    {
      instrumentVersionId: instrument.versionId,
      currencyId: currency.id,
      price: '11',
      observedAt: '2025-02-04T00:00:00.000001Z',
      source,
    },
    contract.financialMutationResponseSchema,
  );
  const query = new URLSearchParams({
    accountIds: account.id,
    reportingCurrencyId: currency.id,
    asOf: '2025-02-04T00:00:00.000001Z',
    fxPolicyId: 'e2e-reviewed/1',
    fxMaxAgeMilliseconds: '86400000',
    fxSourcePriority: source,
    priceMaxAgeMilliseconds: '86400000',
    priceSourcePriority: source,
  });
  const view = contract.financialValuationResponseSchema.parse(
    await (await page.request.get(`${prefix}/valuation?${query}`)).json(),
  );
  expect(view.nav).toMatchObject({
    state: 'available',
    value: { currencyId: currency.id, amount: '101.6' },
  });
  expect(view.positions[0]?.inventory.openQuantity.value).toBe('1');
  expect(view.positions[0]?.inventory.realizedNet.value).toBe('0.8');
  expect(view.positions[0]?.valuation?.unrealizedNet.value).toBe('0.8');
  await page.reload();
  const reloaded: unknown = await page.evaluate(async (path) => {
    const response = await fetch(path, { credentials: 'same-origin' });
    return response.json();
  }, `${prefix}/valuation?${query}`);
  expect(contract.financialValuationResponseSchema.parse(reloaded)).toEqual(view);
  const executions = contract.executionResponseSchema
    .array()
    .parse(await (await page.request.get(`${prefix}/executions?accountId=${account.id}`)).json());
  expect(executions).toHaveLength(2);
  expect(executions[0]?.quantity).toBe('1.5');
  expect(executions[1]?.quantity).toBe('0.5');
});
