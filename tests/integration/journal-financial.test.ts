import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { journalDocumentSchema, journalFinancialSnapshotSchema } from '@journal/contracts';
import { sumDecimals } from '@journal/domain';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createFinancialObservations } from '../../packages/server/src/financial/observations.js';
import type { ExecutionInput } from '../../packages/server/src/financial/ledger-types.js';
import { createJournalServices } from '../../packages/server/src/journal/service.js';
import { createJournalFinancialFixture } from './journal-financial-fixture.js';

const initial = '2025-01-01T00:00:00.000001Z';
// Economic time is controlled independently of the server's real commitment clock.
const at = (day: number) => `2030-01-${String(day).padStart(2, '0')}T12:00:00.000001Z`;

describe('journal financial read model on restricted real PostgreSQL and persisted original plans', () => {
  let fixture: Awaited<ReturnType<typeof createJournalFinancialFixture>>;
  let catalog: ReturnType<typeof createCatalogServices>;
  let ledger: ReturnType<typeof createFinancialLedger>;
  let journal: ReturnType<typeof createJournalServices>;
  let observations: ReturnType<typeof createFinancialObservations>;
  let usd: string;
  let eur: string;
  let instrument: string;
  beforeAll(async () => {
    fixture = await createJournalFinancialFixture();
    catalog = createCatalogServices(fixture.services);
    ledger = createFinancialLedger(fixture.services);
    journal = createJournalServices(fixture.services);
    observations = createFinancialObservations(fixture.services);
    for (const code of ['USD', 'EUR']) {
      const created = await catalog.createCurrency(
        fixture.owner.context,
        {
          namespace: 'iso:4217',
          code,
          kind: 'fiat',
          unitIdentity: `iso:${code}`,
          name: code,
          displayScale: 2,
          settlementIncrement: '0.01',
          effectiveAt: initial,
        },
        randomUUID(),
      );
      if (code === 'USD') usd = created.id;
      else eur = created.id;
    }
    instrument = (
      await catalog.createInstrument(
        fixture.owner.context,
        {
          name: 'Journal financial ordinary share',
          family: 'stock',
          subtype: 'ordinary-share',
          economicIdentity: `journal-financial:${randomUUID()}`,
          quantityUnit: 'share',
          quoteCurrencyId: usd,
          settlementCurrencyId: usd,
          multiplier: '1',
          quantityIncrement: '0.0001',
          priceIncrement: '0.000001',
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
      )
    ).versionId;
  });
  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });

  async function account() {
    const created = await catalog.createAccount(
      fixture.owner.context,
      {
        name: `Journal account ${randomUUID()}`,
        environment: 'live',
        accountType: 'margin',
        baseCurrencyId: usd,
        inventoryMethod: 'fifo',
        allowShort: true,
        holdingMode: 'netted',
        effectiveAt: initial,
      },
      randomUUID(),
    );
    const bucket = await ledger.createCashBucket(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: created.id,
      currencyId: usd,
      kind: 'settled',
    });
    return { id: created.id, bucket: bucket.id };
  }
  async function campaign(
    scopes: { id: string; direction?: 'long' | 'short' }[],
    riskAmount: string | null = '20',
    riskCurrency = usd,
    instrumentVersionId = instrument,
  ) {
    const created = await journal.create(
      fixture.owner.context,
      {
        title: `Journal financial campaign ${randomUUID()}`,
        classification: 'active-trading',
        legs: scopes.map((scope, index) => ({
          accountId: scope.id,
          instrumentVersionId,
          direction: scope.direction ?? 'long',
          label: `Leg ${index + 1}`,
        })),
      },
      randomUUID(),
    );
    const document = journalDocumentSchema.parse({
      plan: {
        thesis: 'Original thesis before actual economic activity',
        initialRisk:
          riskAmount === null
            ? null
            : {
                amount: riskAmount,
                currencyId: riskCurrency,
                method: 'Cash risk',
                methodNotes: 'Reviewed original risk',
              },
      },
    });
    const saved = await journal.save(
      fixture.owner.context,
      created.trade.id,
      { expectedRevision: created.journal.revision, document },
      randomUUID(),
    );
    await journal.publishPlan(
      fixture.owner.context,
      created.trade.id,
      {
        expectedRevision: saved.revision,
        expectedTradeRevision: created.trade.revision,
        reason: 'Original pre-trade plan.',
      },
      randomUUID(),
    );
    return journal.get(fixture.owner.context, created.trade.id);
  }
  async function fill(
    scope: { id: string; bucket: string },
    legId: string,
    side: 'buy' | 'sell',
    quantity: string,
    price: string,
    fee: string | null,
    day: number,
    extra: Partial<ExecutionInput> = {},
  ) {
    const created = await ledger.recordExecution(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      instrumentVersionId: instrument,
      side,
      quantity,
      price,
      cashBucketId: scope.bucket,
      economicAt: at(day),
      orderingKey: '1',
      costsComplete: true,
      ...(fee === null
        ? {}
        : {
            fees: [
              { cashBucketId: scope.bucket, currencyId: usd, amount: fee, kind: 'commission' },
            ],
          }),
      ...extra,
    });
    await ledger.allocateExecution(fixture.owner.context, {
      commandId: randomUUID(),
      executionId: created.id,
      expectedVersion: 1,
      reason: 'Actual source attribution',
      allocations: [{ tradeLegId: legId, quantity }],
    });
    return created;
  }
  async function close(tradeId: string) {
    const trade = await catalog.getTrade(fixture.owner.context, tradeId);
    await catalog.confirmTradeClosure(
      fixture.owner.context,
      tradeId,
      {
        expectedRevision: trade.revision,
        reason: 'All campaign legs settled and flat.',
        obligationEvidence: 'All execution principal and fee cash buckets are settled.',
      },
      randomUUID(),
    );
    return journal.get(fixture.owner.context, tradeId);
  }

  it('distinguishes lifetime actual fills from remaining basis, manual prices, revised plans and supplemental risk', async () => {
    const scope = await account();
    const created = await campaign([scope]);
    const tradeId = created.trade.id,
      legId = created.financial.legs[0]!.legId;
    expect(created.commitment?.timing).toBe('pre-trade');
    expect(created.financial.rMultiple).toMatchObject({ status: 'unavailable', value: null });
    await fill(scope, legId, 'buy', '1.25', '80', '0.5', 1);
    await fill(scope, legId, 'buy', '0.75', '120', '0.3', 2);
    await fill(scope, legId, 'sell', '1', '130', '0.4', 3);
    const partial = await journal.get(fixture.owner.context, tradeId);
    expect(partial.financial.legs[0]).toMatchObject({
      actualEntry: { value: '95' },
      actualExit: { value: '130' },
      openQuantity: { value: '1' },
      realizedGross: { value: '50' },
      realizedNet: { value: '49.2' },
      costBasis: { value: '110.4' },
    });
    expect(partial.financial.rMultiple.reasons).toContain('campaign_has_open_quantity');
    const saved = await journal.save(
      fixture.owner.context,
      tradeId,
      {
        expectedRevision: partial.journal.revision,
        document: {
          ...partial.journal.document,
          plan: {
            ...partial.journal.document.plan,
            initialRisk: {
              amount: '999',
              currencyId: usd,
              method: 'Revised risk',
              methodNotes: '',
            },
          },
          review: {
            ...partial.journal.document.review,
            actualObservations: [
              {
                legId,
                actualStop: '79',
                reportedEntry: '9000',
                reportedExit: '7000',
                notes: 'Manual statements are not ledger prices',
              },
            ],
          },
        },
      },
      randomUUID(),
    );
    await journal.publishPlan(
      fixture.owner.context,
      tradeId,
      {
        expectedRevision: saved.revision,
        expectedTradeRevision: partial.trade.revision,
        reason: 'Changed plan after scale-in.',
      },
      randomUUID(),
    );
    const revised = await journal.get(fixture.owner.context, tradeId);
    await journal.addRisk(
      fixture.owner.context,
      tradeId,
      {
        expectedRevision: revised.journal.revision,
        amount: '40',
        currencyId: usd,
        method: 'Additional risk',
        methodNotes: '',
        reason: 'Supplement recorded separately.',
      },
      randomUUID(),
    );
    await ledger.recordCashMovement(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      cashBucketId: scope.bucket,
      currencyId: usd,
      amount: '987',
      kind: 'deposit',
      economicAt: at(3),
      orderingKey: '10',
    });
    await fill(scope, legId, 'sell', '1', '125', '0.5', 4);
    const completed = await close(tradeId);
    expect(completed.financial.legs[0]).toMatchObject({
      actualEntry: { value: '95' },
      actualExit: { value: '127.5' },
      enteredQuantity: { value: '2' },
      exitedQuantity: { value: '2' },
      openQuantity: { value: '0' },
      realizedNet: { value: '63.3' },
      costBasis: { value: '0' },
    });
    expect(completed.financial.rMultiple).toMatchObject({
      status: 'available',
      value: '3.165',
      currencyId: usd,
      originalPlanId: created.originalPlan!.id,
    });
    expect(completed.originalPlan!.definition.initialRisk!.amount).toBe('20');
    expect(completed.currentPlan!.definition.initialRisk!.amount).toBe('999');
    expect(completed.journal.document.review.actualObservations[0]!.reportedEntry).toBe('9000');
    expect(
      sumDecimals(
        completed.financial.timeline
          .filter((event) => event.kind === 'cash')
          .map((event) => event.amount!),
      ),
    ).toBe('65');
    expect(
      sumDecimals(
        completed.financial.timeline
          .filter((event) => event.kind === 'fee')
          .map((event) => event.amount!),
      ),
    ).toBe('1.7');
    expect(completed.financial.timeline.some((event) => event.amount === '987')).toBe(false);
    expect(journalFinancialSnapshotSchema.parse(completed.financial)).toEqual(completed.financial);
    const closedReview = await journal.save(
      fixture.owner.context,
      tradeId,
      {
        expectedRevision: completed.journal.revision,
        document: {
          ...completed.journal.document,
          review: {
            ...completed.journal.document.review,
            postTradeReview: 'Closed trade reviewed after ledger completion.',
            lessonsLearned: 'Keep planning and observed financial facts distinct.',
            actualObservations: [
              {
                legId,
                actualStop: '75',
                reportedEntry: '12',
                reportedExit: '15',
                notes: 'Later manual observations',
              },
            ],
          },
        },
      },
      randomUUID(),
    );
    const afterReview = await journal.get(fixture.owner.context, tradeId);
    expect(afterReview.trade).toEqual(completed.trade);
    expect(afterReview.trade.status).toBe('closed');
    expect(afterReview.financial).toEqual(completed.financial);
    expect(afterReview.journal.revision).toBe(closedReview.revision);
    expect(afterReview.journal.document.review.postTradeReview).toBe(
      'Closed trade reviewed after ledger completion.',
    );
  });

  it('keeps account and leg quantities independent while combining compatible long and short monetary results', async () => {
    const first = await account(),
      second = await account();
    const created = await campaign([{ id: first.id }, { id: second.id, direction: 'short' }], '10');
    const firstLeg = created.financial.legs.find((leg) => leg.accountId === first.id)!.legId;
    const secondLeg = created.financial.legs.find((leg) => leg.accountId === second.id)!.legId;
    await fill(first, firstLeg, 'buy', '2', '10', '1', 1);
    await fill(first, firstLeg, 'sell', '2', '12', '1', 2);
    await fill(second, secondLeg, 'sell', '1', '30', '0.5', 1);
    await fill(second, secondLeg, 'buy', '1', '25', '0.5', 2);
    const completed = await close(created.trade.id);
    expect(completed.financial.legs.find((leg) => leg.legId === firstLeg)).toMatchObject({
      actualEntry: { value: '10' },
      actualExit: { value: '12' },
      enteredQuantity: { value: '2' },
      realizedNet: { value: '2' },
    });
    expect(completed.financial.legs.find((leg) => leg.legId === secondLeg)).toMatchObject({
      actualEntry: { value: '30' },
      actualExit: { value: '25' },
      enteredQuantity: { value: '1' },
      realizedNet: { value: '4' },
    });
    expect(completed.financial.rMultiple).toMatchObject({ status: 'available', value: '0.6' });
  });

  it('conserves shared execution cash and fees across two campaigns using latest partial allocation sets', async () => {
    const scope = await account();
    const first = await campaign([scope], '10');
    const second = await campaign([scope], '10');
    const firstLeg = first.financial.legs[0]!.legId;
    const secondLeg = second.financial.legs[0]!.legId;
    for (const [side, price, fee, day] of [
      ['buy', '95', '0.8', 1],
      ['sell', '125', '0.4', 2],
    ] as const) {
      const execution = await ledger.recordExecution(fixture.owner.context, {
        commandId: randomUUID(),
        accountId: scope.id,
        instrumentVersionId: instrument,
        side,
        quantity: '2',
        price,
        cashBucketId: scope.bucket,
        costsComplete: true,
        economicAt: at(day),
        orderingKey: '1',
        fees: [{ cashBucketId: scope.bucket, currencyId: usd, amount: fee, kind: 'commission' }],
      });
      await ledger.allocateExecution(fixture.owner.context, {
        commandId: randomUUID(),
        executionId: execution.id,
        expectedVersion: 1,
        reason: 'Partial campaign attribution',
        allocations: [{ tradeLegId: firstLeg, quantity: '1' }],
      });
      await ledger.allocateExecution(fixture.owner.context, {
        commandId: randomUUID(),
        executionId: execution.id,
        expectedVersion: 2,
        reason: 'Final shared attribution without duplicate financial facts',
        allocations: [
          { tradeLegId: firstLeg, quantity: '1.25' },
          { tradeLegId: secondLeg, quantity: '0.75' },
        ],
      });
    }
    const firstCompleted = await close(first.trade.id);
    const secondCompleted = await close(second.trade.id);
    expect(firstCompleted.financial.legs[0]).toMatchObject({
      actualEntry: { value: '95' },
      enteredQuantity: { value: '1.25' },
      realizedNet: { value: '36.75' },
    });
    expect(secondCompleted.financial.legs[0]).toMatchObject({
      actualEntry: { value: '95' },
      enteredQuantity: { value: '0.75' },
      realizedNet: { value: '22.05' },
    });
    expect(firstCompleted.financial.rMultiple.value).toBe('3.675');
    expect(secondCompleted.financial.rMultiple.value).toBe('2.205');
    const combined = [...firstCompleted.financial.timeline, ...secondCompleted.financial.timeline];
    expect(
      sumDecimals(combined.filter((event) => event.kind === 'cash').map((event) => event.amount!)),
    ).toBe('60');
    expect(
      sumDecimals(combined.filter((event) => event.kind === 'fee').map((event) => event.amount!)),
    ).toBe('1.2');
    expect(firstCompleted.financial.legs[0]!.executions).toHaveLength(2);
    expect(secondCompleted.financial.legs[0]!.executions).toHaveLength(2);
  });

  it('uses historical entry/exit/fee pins for multi-currency R and ignores unrelated newer FX', async () => {
    const scope = await account(),
      created = await campaign([scope], '10', eur);
    const legId = created.financial.legs[0]!.legId;
    const entryFx = await observations.recordFxObservation(fixture.owner.context, {
      commandId: randomUUID(),
      baseCurrencyId: usd,
      quoteCurrencyId: eur,
      rate: '0.9',
      observedAt: at(1),
      source: 'journal historical entry',
    });
    const exitFx = await observations.recordFxObservation(fixture.owner.context, {
      commandId: randomUUID(),
      baseCurrencyId: usd,
      quoteCurrencyId: eur,
      rate: '0.95',
      observedAt: at(2),
      source: 'journal historical exit',
    });
    const costs = (pin: { id: string }, rate: string) => [
      {
        cashBucketId: scope.bucket,
        currencyId: usd,
        amount: '1',
        kind: 'commission',
        reportingFx: { observationId: pin.id, rate },
      },
    ];
    await fill(scope, legId, 'buy', '10', '10', null, 1, {
      basisReportingFx: { observationId: entryFx.id, rate: '0.9' },
      fees: costs(entryFx, '0.9'),
    });
    await fill(scope, legId, 'sell', '10', '12', null, 2, {
      basisReportingFx: { observationId: exitFx.id, rate: '0.95' },
      fees: costs(exitFx, '0.95'),
    });
    const completed = await close(created.trade.id);
    expect(completed.financial.legs[0]!.realizedNet.value).toBe('18');
    expect(completed.financial.rMultiple).toMatchObject({
      status: 'available',
      value: '2.215',
      currencyId: eur,
    });
    await observations.recordFxObservation(fixture.owner.context, {
      commandId: randomUUID(),
      baseCurrencyId: usd,
      quoteCurrencyId: eur,
      rate: '3',
      observedAt: at(3),
      source: 'Unrelated newer observation',
    });
    expect(
      (await journal.get(fixture.owner.context, created.trade.id)).financial.rMultiple.value,
    ).toBe('2.215');
  });

  it.each(['missing-fees', 'missing-fx', 'missing-risk'] as const)(
    'returns explained unavailable R for %s without losing actual fills',
    async (reason) => {
      const scope = await account(),
        created = await campaign(
          [scope],
          reason === 'missing-risk' ? null : '10',
          reason === 'missing-fx' ? eur : usd,
        );
      const legId = created.financial.legs[0]!.legId;
      await fill(scope, legId, 'buy', '1', '10', null, 1, {
        costsComplete: reason !== 'missing-fees',
      });
      await fill(scope, legId, 'sell', '1', '12', null, 2);
      const completed = await close(created.trade.id);
      expect(completed.financial.legs[0]!.actualEntry.value).toBe('10');
      expect(completed.financial.rMultiple).toMatchObject({ status: 'unavailable', value: null });
      expect(completed.financial.rMultiple.reasons).toContain(
        reason === 'missing-fees'
          ? 'incomplete_costs'
          : reason === 'missing-fx'
            ? 'missing_exit_fx'
            : 'missing_original_risk',
      );
    },
  );

  it('reevaluates later backdated effective allocation and correction without altering the persisted original commitment', async () => {
    const scope = await account(),
      created = await campaign([scope], '10');
    const legId = created.financial.legs[0]!.legId;
    const entry = await fill(scope, legId, 'buy', '1', '10', null, 1);
    await fill(scope, legId, 'sell', '1', '12', null, 2);
    const completed = await close(created.trade.id);
    expect(completed.financial.rMultiple.value).toBe('0.2');
    const corrected = await ledger.correctExecution(fixture.owner.context, {
      commandId: randomUUID(),
      originalExecutionId: entry.id,
      reason: 'Reviewed broker time correction to prior economic activity.',
      replacement: {
        accountId: scope.id,
        instrumentVersionId: instrument,
        side: 'buy',
        quantity: '1',
        price: '10',
        cashBucketId: scope.bucket,
        costsComplete: true,
        economicAt: '2025-06-01T12:00:00.000001Z',
        orderingKey: '1',
      },
    });
    const after = await journal.get(fixture.owner.context, created.trade.id);
    expect(after.trade).toMatchObject({ status: 'closed', closureReviewRequired: false });
    expect(after.financial.rMultiple).toMatchObject({ status: 'unavailable', value: null });
    expect(after.financial.rMultiple.reasons).toContain('execution_not_after_original_commitment');
    expect(after.commitment).toEqual(completed.commitment);
    expect(after.originalPlan).toEqual(completed.originalPlan);
    expect(
      after.financial.legs[0]!.executions.some((execution) => execution.executionId === entry.id),
    ).toBe(false);
    expect(
      after.financial.legs[0]!.executions.some(
        (execution) => execution.executionId === corrected.id,
      ),
    ).toBe(true);
    expect(after.financial.sourceRevision).not.toBe(completed.financial.sourceRevision);
  });

  it('reevaluates a previously unassigned backdated execution when a later allocation links it to a pre-trade commitment', async () => {
    const scope = await account();
    const prior = await ledger.recordExecution(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      instrumentVersionId: instrument,
      side: 'buy',
      quantity: '1',
      price: '10',
      cashBucketId: scope.bucket,
      economicAt: '2025-06-01T12:00:00.000001Z',
      orderingKey: '1',
      costsComplete: true,
    });
    const created = await campaign([scope], '10');
    expect(created.commitment?.timing).toBe('pre-trade');
    const commitment = created.commitment;
    const legId = created.financial.legs[0]!.legId;
    await ledger.allocateExecution(fixture.owner.context, {
      commandId: randomUUID(),
      executionId: prior.id,
      expectedVersion: 1,
      reason: 'Review linked an earlier imported source after original plan commitment',
      allocations: [{ tradeLegId: legId, quantity: '1' }],
    });
    await fill(scope, legId, 'sell', '1', '12', null, 2);
    const completed = await close(created.trade.id);
    expect(completed.financial.legs[0]!.realizedNet.value).toBe('2');
    expect(completed.financial.rMultiple).toMatchObject({ status: 'unavailable', value: null });
    expect(completed.financial.rMultiple.reasons).toContain(
      'execution_not_after_original_commitment',
    );
    expect(completed.commitment).toEqual(commitment);
    expect(completed.commitment?.timing).toBe('pre-trade');
  });

  it('keeps an originally retrospective plan ineligible for genuine historical results', async () => {
    const scope = await account();
    const created = await journal.create(
      fixture.owner.context,
      {
        title: 'Retrospective historical review',
        classification: 'active-trading',
        legs: [
          {
            accountId: scope.id,
            instrumentVersionId: instrument,
            direction: 'long',
            label: 'Historical share',
          },
        ],
      },
      randomUUID(),
    );
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '10', null, 1, {
      economicAt: '2025-06-01T12:00:00.000001Z',
    });
    await fill(scope, legId, 'sell', '1', '12', null, 2, {
      economicAt: '2025-06-02T12:00:00.000001Z',
    });
    const actual = await journal.get(fixture.owner.context, created.trade.id);
    const save = await journal.save(
      fixture.owner.context,
      created.trade.id,
      {
        expectedRevision: actual.journal.revision,
        document: journalDocumentSchema.parse({
          plan: {
            initialRisk: {
              amount: '10',
              currencyId: usd,
              method: 'Reconstructed',
              methodNotes: '',
            },
          },
        }),
      },
      randomUUID(),
    );
    await journal.publishPlan(
      fixture.owner.context,
      created.trade.id,
      {
        expectedRevision: save.revision,
        expectedTradeRevision: actual.trade.revision,
        reason: 'Review recorded after historical execution.',
      },
      randomUUID(),
    );
    const completed = await close(created.trade.id);
    expect(completed.commitment?.timing).toBe('retrospective');
    expect(completed.financial.rMultiple).toMatchObject({ status: 'unavailable', value: null });
    expect(completed.financial.rMultiple.reasons).toContain('retrospective_original_plan');
    expect(completed.financial.legs[0]!.realizedNet.value).toBe('2');
  });

  it('retains manual instrument executions and actual cash without inventing unsupported derivative P&L or R', async () => {
    const scope = await account();
    const manual = await catalog.createInstrument(
      fixture.owner.context,
      {
        name: 'Journal manual option',
        family: 'option',
        subtype: 'listed-option',
        economicIdentity: `journal-manual-option:${randomUUID()}`,
        quantityUnit: 'contract',
        quoteCurrencyId: usd,
        settlementCurrencyId: usd,
        multiplier: '100',
        quantityIncrement: '1',
        priceIncrement: '0.01',
        capability: 'manual',
        effectiveAt: initial,
        metadata: { priceConvention: 'unit-price', settlementStyle: 'manual' },
      },
      randomUUID(),
    );
    const created = await campaign([scope], '100', usd, manual.versionId);
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '2', null, 1, {
      instrumentVersionId: manual.versionId,
      bookedPrincipal: '200',
      principalCurrencyId: usd,
      principalReview: { source: 'Broker statement', reason: 'Actual option principal evidence' },
      manualCashEffects: [{ cashBucketId: scope.bucket, currencyId: usd, amount: '-200' }],
    });
    await fill(scope, legId, 'sell', '1', '3', null, 2, {
      instrumentVersionId: manual.versionId,
      bookedPrincipal: '300',
      principalCurrencyId: usd,
      principalReview: { source: 'Broker statement', reason: 'Actual option exit evidence' },
      manualCashEffects: [{ cashBucketId: scope.bucket, currencyId: usd, amount: '300' }],
    });
    const completed = await close(created.trade.id);
    expect(completed.financial.legs[0]).toMatchObject({
      quantityUnit: 'contract',
      actualEntry: { status: 'available', value: '2' },
      actualExit: { value: '3' },
      realizedNet: { status: 'unavailable', value: null },
    });
    expect(completed.financial.rMultiple).toMatchObject({ status: 'unavailable', value: null });
    expect(completed.financial.rMultiple.reasons).toContain('unsupported_inventory');
    expect(
      sumDecimals(
        completed.financial.timeline
          .filter((event) => event.kind === 'cash')
          .map((event) => event.amount!),
      ),
    ).toBe('100');
  });

  it('does not claim complete campaign fees when a standalone inventory-only carrying cost is unresolved', async () => {
    const scope = await account(),
      created = await campaign([scope], '10');
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '10', null, 1);
    await ledger.recordFee(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      cashBucketId: scope.bucket,
      currencyId: usd,
      amount: '0.5',
      kind: 'carry',
      economicAt: at(2),
      orderingKey: '1',
    });
    await fill(scope, legId, 'sell', '1', '12', null, 3);
    const completed = await close(created.trade.id);
    expect(completed.financial.legs[0]!.realizedGross.value).toBe('2');
    expect(completed.financial.legs[0]!.realizedNet).toMatchObject({
      status: 'unavailable',
      value: null,
      reasons: ['standalone_costs_require_campaign_attribution'],
    });
    expect(completed.financial.rMultiple).toMatchObject({ status: 'unavailable', value: null });
    expect(completed.financial.rMultiple.reasons).toContain(
      'standalone_costs_require_campaign_attribution',
    );
  });

  it('keeps a standalone charge explicitly attributed to another instrument outside this campaign result', async () => {
    const scope = await account(),
      created = await campaign([scope], '10');
    const legId = created.financial.legs[0]!.legId;
    await fill(scope, legId, 'buy', '1', '10', null, 1);
    const other = await catalog.createInstrument(
      fixture.owner.context,
      {
        name: 'Unrelated journal fee scope',
        family: 'etf',
        subtype: 'ordinary-etf',
        economicIdentity: `journal-fee-scope:${randomUUID()}`,
        quantityUnit: 'share',
        quoteCurrencyId: usd,
        settlementCurrencyId: usd,
        multiplier: '1',
        quantityIncrement: '0.0001',
        priceIncrement: '0.000001',
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
    await ledger.recordExecution(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      instrumentVersionId: other.versionId,
      side: 'buy',
      quantity: '1',
      price: '5',
      cashBucketId: scope.bucket,
      economicAt: at(1),
      orderingKey: '2',
      costsComplete: true,
    });
    const otherBook = (await ledger.positions(fixture.owner.context, { accountId: scope.id })).find(
      (position) => position.inventory.scope.instrumentId === other.id,
    )!;
    const carrying = await ledger.recordFee(fixture.owner.context, {
      commandId: randomUUID(),
      accountId: scope.id,
      cashBucketId: scope.bucket,
      currencyId: usd,
      amount: '0.5',
      kind: 'carrying',
      economicAt: at(2),
      orderingKey: '1',
    });
    await ledger.attributeFee(fixture.owner.context, {
      commandId: randomUUID(),
      feeId: carrying.id,
      instrumentVersionId: other.versionId,
      expectedVersion: 0,
      economicAt: at(2),
      orderingKey: '2',
      reason: 'Reviewed charge belongs to the unrelated ETF book.',
      allocations: [
        { target: 'lot', targetId: otherBook.inventory.lots[0]!.id, amount: '0.5' },
        { target: 'unassigned', amount: '0' },
      ],
    });
    await fill(scope, legId, 'sell', '1', '12', null, 3);
    const completed = await close(created.trade.id);
    expect(completed.financial.legs[0]!.realizedNet).toMatchObject({
      status: 'available',
      value: '2',
    });
    expect(completed.financial.rMultiple).toMatchObject({ status: 'available', value: '0.2' });
    expect(completed.financial.timeline.some((event) => event.feeId === carrying.id)).toBe(false);
  });
});
