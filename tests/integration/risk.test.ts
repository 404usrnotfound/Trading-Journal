import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '@journal/database';
import { strategyDefinitionSchema } from '@journal/contracts';
import { createRiskServices } from '../../packages/server/src/risk/service.js';
import { createRiskApi } from '../../packages/server/src/risk/api.js';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createFinancialObservations } from '../../packages/server/src/financial/observations.js';
import { createStrategyServices } from '../../packages/server/src/strategies/service.js';
import type { RiskLimit } from '../../packages/domain/src/risk-types.js';
import { createAccountingFixture } from './accounting-fixture.js';

const initial = '2025-01-01T00:00:00.000001Z';
const asOf = '2026-01-05T12:00:00.000001Z';
describe('persisted account and strategy risk evidence on restricted PostgreSQL roles', () => {
  let fixture: Awaited<ReturnType<typeof createAccountingFixture>>;
  let risk: ReturnType<typeof createRiskServices>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let observations: ReturnType<typeof createFinancialObservations>;
  let accountId: string,
    bucketId: string,
    currencyId: string,
    euroId: string,
    instrumentId: string,
    instrumentVersionId: string,
    strategyId: string,
    strategyVersionId: string;
  const limits: RiskLimit[] = [];
  const definition = (name: string, values: RiskLimit[]) => ({
    name,
    limits: values,
    maxAgeMilliseconds: 86400000,
    priceSources: ['manual'],
    fxSources: ['manual'],
  });
  const context = () => fixture.owner.context;
  const policy = (values: RiskLimit[], strategy = false) =>
    risk.savePolicy(
      context(),
      {
        expectedVersion: 0,
        accountId: strategy ? null : accountId,
        strategyId: strategy ? strategyId : null,
        effectiveAt: initial,
        reason: 'Reviewed explicit restrictions',
        definition: definition(strategy ? 'Strategy restrictions' : 'Account restrictions', values),
      },
      randomUUID(),
    );
  const proposal = () => ({
    instrumentVersionId,
    side: 'long' as const,
    quantity: '1',
    riskAmount: '15',
    riskCurrencyId: currencyId,
    riskMethod: 'Reviewed independent stop scenario',
    entry: '100',
    intendedExitAt: '2026-01-05T22:00:00Z',
  });
  beforeAll(async () => {
    fixture = await createAccountingFixture();
    risk = createRiskServices(fixture.services);
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    observations = createFinancialObservations(fixture.services);
    for (const code of ['USD', 'EUR']) {
      const currency = await catalog.createCurrency(
        context(),
        {
          namespace: 'iso:4217',
          code,
          name: code,
          kind: 'fiat',
          unitIdentity: `iso:${code}`,
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: initial,
        },
        randomUUID(),
      );
      if (code === 'USD') currencyId = currency.id;
      else euroId = currency.id;
    }
    accountId = (
      await catalog.createAccount(
        context(),
        {
          name: 'Independent risk account',
          environment: 'paper',
          accountType: 'margin',
          baseCurrencyId: currencyId,
          inventoryMethod: 'fifo',
          allowShort: true,
          holdingMode: 'netted',
          effectiveAt: initial,
        },
        randomUUID(),
      )
    ).id;
    bucketId = (
      await ledger.createCashBucket(context(), {
        commandId: randomUUID(),
        accountId,
        currencyId,
        kind: 'settled',
      })
    ).id;
    const instrument = await catalog.createInstrument(
      context(),
      {
        name: 'Risk source share',
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: `risk:${randomUUID()}`,
        quantityUnit: 'share',
        quoteCurrencyId: currencyId,
        settlementCurrencyId: currencyId,
        multiplier: '1',
        quantityIncrement: '0.25',
        priceIncrement: '0.01',
        capability: 'native-linear',
        effectiveAt: initial,
        metadata: {
          priceConvention: 'unit-price',
          settlementStyle: 'delivered',
          shortConvention: 'borrowed-delivery',
          carryCostPolicy: 'explicit-source-charges',
        },
      },
      randomUUID(),
    );
    instrumentId = instrument.id;
    instrumentVersionId = instrument.versionId;
    await ledger.recordCashMovement(context(), {
      commandId: randomUUID(),
      accountId,
      cashBucketId: bucketId,
      currencyId,
      amount: '1000',
      kind: 'deposit',
      economicAt: '2026-01-04T09:00:00Z',
      orderingKey: '1',
    });
    await ledger.recordExecution(context(), {
      commandId: randomUUID(),
      accountId,
      instrumentVersionId,
      side: 'buy',
      quantity: '2',
      price: '100',
      cashBucketId: bucketId,
      costsComplete: true,
      fees: [{ cashBucketId: bucketId, currencyId, amount: '2', kind: 'commission' }],
      economicAt: '2026-01-05T09:00:00Z',
      orderingKey: '1',
    });
    await ledger.recordExecution(context(), {
      commandId: randomUUID(),
      accountId,
      instrumentVersionId,
      side: 'sell',
      quantity: '1',
      price: '90',
      cashBucketId: bucketId,
      costsComplete: true,
      fees: [{ cashBucketId: bucketId, currencyId, amount: '1', kind: 'commission' }],
      economicAt: '2026-01-05T10:00:00Z',
      orderingKey: '1',
    });
    await observations.recordPriceObservation(context(), {
      commandId: randomUUID(),
      instrumentVersionId,
      currencyId,
      price: '100',
      source: 'manual',
      observedAt: '2026-01-05T11:00:00Z',
    });
    await ledger.recordCashMovement(context(), {
      commandId: randomUUID(),
      accountId,
      cashBucketId: bucketId,
      currencyId,
      amount: '100',
      kind: 'deposit',
      economicAt: '2026-01-05T11:30:00Z',
      orderingKey: '1',
    });
    const strategy = await createStrategyServices(fixture.services).create(
      context(),
      {
        definition: strategyDefinitionSchema.parse({ name: 'Pinned risk strategy' }),
        effectiveAt: initial,
        changeReason: 'Reviewed strategy',
      },
      randomUUID(),
    );
    strategyId = strategy.id;
    strategyVersionId = strategy.currentVersionId;
    limits.push(
      { id: randomUUID(), kind: 'trade-risk', maximum: '10', currencyId, measure: 'amount' },
      {
        id: randomUUID(),
        kind: 'daily-loss',
        maximum: '12',
        currencyId,
        basis: 'realized-activity',
        includeIncome: true,
        timezone: 'UTC',
      },
      {
        id: randomUUID(),
        kind: 'weekly-loss',
        maximum: '20',
        currencyId,
        basis: 'account-change',
        includeIncome: true,
        timezone: 'UTC',
      },
      { id: randomUUID(), kind: 'positions', maximum: 1 },
      { id: randomUUID(), kind: 'concentration', maximum: '0.25', currencyId, instrumentId: null },
      {
        id: randomUUID(),
        kind: 'exposure',
        maximum: '150',
        currencyId,
        measure: 'gross',
        denominator: 'amount',
      },
      { id: randomUUID(), kind: 'overnight', timezone: 'UTC', boundaryHour: 21 },
      {
        id: randomUUID(),
        kind: 'prohibited',
        instrumentIds: [],
        families: ['option'],
        subtypes: [],
      },
    );
  }, 60000);
  afterAll(async () => {
    // The runner owns this disposable database; preserve immutable evidence until its teardown.
    await Promise.all([fixture?.services.close(), fixture?.admin.close()]);
  });
  it('derives all required limit operands, costs once, capital-flow exclusion and conservative account/strategy precedence', async () => {
    const before = await fixture.admin.pool.query(
      'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
      [context().workspaceId],
    );
    const accountPolicy = await policy(limits);
    const strategyPolicy = await policy(
      [
        { id: randomUUID(), kind: 'trade-risk', maximum: '20', currencyId, measure: 'amount' },
        {
          id: randomUUID(),
          kind: 'prohibited',
          instrumentIds: [instrumentId],
          families: [],
          subtypes: [],
        },
      ],
      true,
    );
    const request = { accountId, strategyVersionId, asOf, proposal: proposal() };
    const key = randomUUID();
    const result = await risk.assess(context(), request, key);
    expect(result.state).toBe('breached');
    expect(result.policies.map((p) => p.id)).toEqual(
      expect.arrayContaining([accountPolicy.id, strategyPolicy.id]),
    );
    const byKind = (kind: string) =>
      result.results.find((r) => r.policyVersionId === accountPolicy.id && r.limit.kind === kind)!;
    expect(byKind('trade-risk')).toMatchObject({ state: 'breached', fact: { value: '15' } });
    // Gross realization -10, entry costs 2 + exit costs 1 charged today => period loss 13.
    expect(byKind('daily-loss')).toMatchObject({ state: 'breached', fact: { value: '13' } });
    // Equity 1087 - opening 1000 - today's external deposit 100 => net -13.
    expect(byKind('weekly-loss')).toMatchObject({ state: 'passed', fact: { value: '13' } });
    expect(byKind('positions')).toMatchObject({ state: 'passed', fact: { value: '1' } });
    expect(byKind('concentration').state).toBe('passed');
    expect(byKind('exposure')).toMatchObject({ state: 'breached', fact: { value: '200' } });
    expect(byKind('overnight').state).toBe('breached');
    expect(byKind('prohibited').state).toBe('passed');
    expect(
      result.results.find(
        (r) => r.policyVersionId === strategyPolicy.id && r.limit.kind === 'trade-risk',
      )!.state,
    ).toBe('passed');
    expect(
      result.results.find(
        (r) => r.policyVersionId === strategyPolicy.id && r.limit.kind === 'prohibited',
      )!.state,
    ).toBe('breached');
    expect(await risk.assess(context(), request, key)).toEqual(result);
    const after = await fixture.admin.pool.query(
      'SELECT revision FROM app.financial_state WHERE workspace_id=$1',
      [context().workspaceId],
    );
    expect(after.rows).toEqual(before.rows);
    expect(await risk.assessment(fixture.viewer.context, result.id)).toEqual(result);
    await expect(risk.assessment(fixture.outsider.context, result.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(risk.assess(context(), { ...request, proposal: null }, key)).rejects.toMatchObject(
      { code: 'IDEMPOTENCY_CONFLICT' },
    );
  });
  it('keeps incomplete and stale evidence unknown, without treating missing proposed risk as zero', async () => {
    const p = await policy([
      {
        id: randomUUID(),
        kind: 'trade-risk',
        maximum: '0.02',
        currencyId,
        measure: 'equity-ratio',
      },
      { id: randomUUID(), kind: 'concentration', maximum: '0.25', currencyId, instrumentId: null },
    ]);
    const missing = await risk.assess(
      context(),
      {
        accountId,
        strategyVersionId: null,
        asOf: '2026-01-06T12:00:00Z',
        proposal: {
          ...proposal(),
          riskAmount: null,
          riskCurrencyId: null,
          riskMethod: '',
          intendedExitAt: null,
        },
      },
      randomUUID(),
    );
    const selected = missing.results.filter((r) => r.policyVersionId === p.id);
    expect(selected.every((r) => r.state === 'unknown' && r.fact.value === null)).toBe(true);
    expect(selected[0]!.explanation).toContain('proposed_risk');
  });
  it('appends immutable policy versions, uses effective-time selection, and rejects concurrent stale publication', async () => {
    const first = await policy([{ id: randomUUID(), kind: 'positions', maximum: 1 }]);
    const body = {
      policyId: first.policyId,
      expectedVersion: 1,
      accountId,
      strategyId: null,
      effectiveAt: '2026-01-06T00:00:00Z',
      reason: 'Stricter reviewed limit',
      definition: definition('Changed policy', [
        { id: randomUUID(), kind: 'positions', maximum: 0 },
      ]),
    };
    const concurrent = await Promise.allSettled([
      risk.savePolicy(context(), body, randomUUID()),
      risk.savePolicy(context(), body, randomUUID()),
    ]);
    expect(concurrent.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { code: 'STALE_RISK_POLICY' },
    });
    const historical = await risk.assess(
      context(),
      { accountId, strategyVersionId: null, asOf, proposal: null },
      randomUUID(),
    );
    expect(historical.policies.find((p) => p.policyId === first.policyId)?.id).toBe(first.id);
    const later = await risk.assess(
      context(),
      { accountId, strategyVersionId: null, asOf: '2026-01-06T12:00:00Z', proposal: null },
      randomUUID(),
    );
    expect(later.policies.find((p) => p.policyId === first.policyId)?.version).toBe(2);
    await expect(
      fixture.services.withWorkspaceContext(context(), (tx) =>
        tx.execute(
          sql`UPDATE app.risk_policy_versions SET reason='rewrite' WHERE workspace_id=${context().workspaceId} AND id=${first.id}`,
        ),
      ),
    ).rejects.toThrow();
    await expect(risk.savePolicy(fixture.viewer.context, body, randomUUID())).rejects.toMatchObject(
      { status: 403 },
    );
    expect((await risk.policies(fixture.outsider.context)).versions).toHaveLength(0);
  });
  it('calculates exact currency-aware fractional sizes and exposes honest manual scenarios for complex products', async () => {
    const fx = await observations.recordFxObservation(context(), {
      commandId: randomUUID(),
      baseCurrencyId: currencyId,
      quoteCurrencyId: euroId,
      rate: '0.9',
      observedAt: '2026-01-05T11:00:00Z',
      source: 'manual',
    });
    const input = {
      accountId,
      instrumentVersionId,
      asOf,
      side: 'long' as const,
      mode: 'linear' as const,
      currencyId: euroId,
      budget: '100',
      entry: '102',
      stop: '99',
      fixedCosts: '3',
      perUnitCosts: '0.1',
      fxObservationId: fx.id,
      maxAgeMilliseconds: 86400000,
      manualRisk: null,
      manualQuantity: null,
      method: '',
    };
    expect(await risk.size(fixture.viewer.context, input)).toMatchObject({
      state: 'available',
      quantity: '34.5',
      riskPerUnit: '2.8',
      plannedRisk: '99.6',
      references: expect.arrayContaining([fx.id, instrumentVersionId]),
    });
    expect(await risk.size(context(), { ...input, fxObservationId: null })).toMatchObject({
      state: 'unknown',
      reasons: ['select_an_explicit_planning_fx_observation'],
    });
    expect(await risk.size(context(), { ...input, asOf: '2026-01-07T12:00:00Z' })).toMatchObject({
      state: 'unknown',
      reasons: ['planning_fx_missing_stale_or_from_future'],
    });
    const option = await catalog.createInstrument(
      context(),
      {
        name: 'Manual scenario option',
        family: 'option',
        subtype: 'manual-option',
        economicIdentity: `option:${randomUUID()}`,
        quantityUnit: 'contract',
        quoteCurrencyId: currencyId,
        settlementCurrencyId: currencyId,
        multiplier: '100',
        quantityIncrement: '1',
        priceIncrement: '0.01',
        capability: 'manual',
        effectiveAt: initial,
      },
      randomUUID(),
    );
    expect(
      await risk.size(context(), { ...input, instrumentVersionId: option.versionId }),
    ).toMatchObject({
      state: 'unknown',
      reasons: ['unsupported_linear_sizing_use_explicit_manual_risk'],
    });
    expect(
      await risk.size(context(), {
        ...input,
        instrumentVersionId: option.versionId,
        mode: 'manual',
        manualRisk: '77',
        manualQuantity: '2',
        method: 'Reviewed broker max-loss scenario including fees',
        budget: '50',
      }),
    ).toMatchObject({
      state: 'available',
      plannedRisk: '77',
      quantity: '2',
      reasons: ['manual_scenario_exceeds_budget'],
    });
  });
  it('enforces authorization and CSRF at HTTP boundaries while read-only sizing remains available to viewers', async () => {
    const api = createRiskApi(fixture.services),
      workspace = context().workspaceId;
    const body = {
      expectedVersion: 0,
      accountId,
      strategyId: null,
      effectiveAt: initial,
      reason: 'HTTP policy',
      definition: definition('HTTP no invented limits', []),
    };
    const request = (actor: typeof fixture.owner, csrf: boolean) =>
      new Request(`http://localhost:3000/api/v1/workspaces/${workspace}/risk/policies`, {
        method: 'POST',
        headers: {
          cookie: actor.cookie,
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
          ...(csrf ? { 'x-csrf-token': actor.csrf } : {}),
        },
        body: JSON.stringify(body),
      });
    await expect(api(request(fixture.owner, false), workspace, ['policies'])).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(api(request(fixture.viewer, true), workspace, ['policies'])).rejects.toMatchObject(
      { status: 403 },
    );
    const response = await api(request(fixture.owner, true), workspace, ['policies']);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const foreign = await api(
      new Request(
        `http://localhost:3000/api/v1/workspaces/${fixture.outsider.context.workspaceId}/risk/policies`,
        { headers: { cookie: fixture.outsider.cookie } },
      ),
      fixture.outsider.context.workspaceId,
      ['policies'],
    );
    expect((await foreign.json()).versions).toHaveLength(0);
    await expect(
      api(
        new Request('http://localhost:3000/api/risk/catalog?collection=accounts', {
          headers: { cookie: fixture.outsider.cookie },
        }),
        workspace,
        ['catalog'],
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
