import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  journalCreateSchema,
  journalDocumentSchema,
  strategyDefinitionSchema,
} from '@journal/contracts';
import { createJournalServices } from '../../packages/server/src/journal/service.js';
import { createStrategyServices } from '../../packages/server/src/strategies/service.js';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createJournalFixture } from './journal-fixture.js';

const effectiveAt = '2025-01-01T00:00:00.000001Z';
describe('journal append-only workflow on restricted PostgreSQL roles', () => {
  let fixture: Awaited<ReturnType<typeof createJournalFixture>>;
  let journals: ReturnType<typeof createJournalServices>,
    strategies: ReturnType<typeof createStrategyServices>,
    catalog: ReturnType<typeof createCatalogServices>;
  beforeAll(async () => {
    fixture = await createJournalFixture();
    journals = createJournalServices(fixture.services);
    strategies = createStrategyServices(fixture.services);
    catalog = createCatalogServices(fixture.services);
  });
  afterAll(async () => {
    await fixture?.cleanup();
  });
  const create = (title = `Journal ${randomUUID()}`) =>
    journals.create(
      fixture.owner.context,
      journalCreateSchema.parse({ title, classification: 'active-trading' }),
      randomUUID(),
    );
  const document = (notes: string) =>
    journalDocumentSchema.parse({ review: { customNotes: notes } });
  const save = (tradeId: string, expectedRevision: number, notes: string, key = randomUUID()) =>
    journals.save(
      fixture.owner.context,
      tradeId,
      { expectedRevision, document: document(notes) },
      key,
    );
  async function sourceSnapshot() {
    return (
      await fixture.admin.pool.query(
        `SELECT (SELECT revision FROM app.financial_state WHERE workspace_id=$1) revision,
    (SELECT count(*)::text FROM app.financial_commands WHERE workspace_id=$1) commands,(SELECT count(*)::text FROM app.outbox_events WHERE workspace_id=$1) outbox,
    (SELECT count(*)::text FROM app.postings WHERE workspace_id=$1) postings,(SELECT count(*)::text FROM app.positions WHERE workspace_id=$1) positions`,
        [fixture.owner.context.workspaceId],
      )
    ).rows[0];
  }

  it('creates a bare campaign atomically and replays the exact originally returned detail', async () => {
    const key = randomUUID(),
      input = journalCreateSchema.parse({ title: 'Atomic idea', classification: 'investing' });
    const first = await journals.create(fixture.owner.context, input, key);
    expect(first.trade).toMatchObject({
      status: 'planned',
      revision: 1,
      closureReviewRequired: false,
    });
    expect(first.journal).toMatchObject({ revision: 0, updatedAt: null, updatedBy: null });
    expect(first.financial.rMultiple).toMatchObject({ status: 'unavailable', value: null });
    await save(first.trade.id, 0, 'Later review');
    expect(await journals.create(fixture.owner.context, input, key)).toEqual(first);
    await expect(
      journals.create(fixture.owner.context, { ...input, title: 'Changed' }, key),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const rows = await fixture.admin.pool.query(
      'SELECT count(*)::text count FROM app.trades WHERE workspace_id=$1 AND id=$2',
      [fixture.owner.context.workspaceId, first.trade.id],
    );
    expect(rows.rows[0].count).toBe('1');
  });
  it('appends complete immutable revisions with actor/hash and leaves ledger state unchanged', async () => {
    const trade = await create(),
      before = await sourceSnapshot();
    const first = await save(trade.trade.id, 0, 'Before review'),
      second = await save(trade.trade.id, 1, 'After review');
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(second.updatedBy).toBe(fixture.owner.context.actorId);
    const history = await journals.revisions(fixture.owner.context, trade.trade.id);
    expect(history.revisions.map((revision) => revision.revision)).toEqual([2, 1]);
    expect(
      await journals.getRevision(fixture.owner.context, trade.trade.id, history.revisions[1]!.id),
    ).toMatchObject({
      document: { review: { customNotes: 'Before review' } },
      documentHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(await sourceSnapshot()).toEqual(before);
    expect((await journals.get(fixture.owner.context, trade.trade.id)).trade).toEqual(trade.trade);
  });
  it('serializes concurrent identical retries and rejects a changed payload after acceptance', async () => {
    const trade = await create(),
      key = randomUUID();
    const results = await Promise.all([
      save(trade.trade.id, 0, 'One immutable save', key),
      save(trade.trade.id, 0, 'One immutable save', key),
    ]);
    expect(results[0]).toEqual(results[1]);
    await expect(save(trade.trade.id, 0, 'Changed', key)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    expect(
      (await journals.revisions(fixture.owner.context, trade.trade.id)).revisions,
    ).toHaveLength(1);
    const events = await fixture.admin.pool.query(
      `SELECT count(*)::text count FROM app.audit_events WHERE workspace_id=$1 AND action='journal.saved' AND id=(SELECT audit_event_id FROM app.journal_commands WHERE workspace_id=$1 AND id=$2)`,
      [fixture.owner.context.workspaceId, key],
    );
    expect(events.rows[0].count).toBe('1');
  });
  it('accepts exactly one competing draft and preserves stale draft as an explicit conflict', async () => {
    const trade = await create();
    const results = await Promise.allSettled([
      save(trade.trade.id, 0, 'Draft A'),
      save(trade.trade.id, 0, 'Draft B'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'STALE_JOURNAL_REVISION' },
    });
    expect((await journals.get(fixture.owner.context, trade.trade.id)).journal.revision).toBe(1);
  });
  it('starts journals on pre-existing trades at revision zero without a separate ledger mutation', async () => {
    const trade = await catalog.createTrade(
      fixture.owner.context,
      { title: 'Old campaign', classification: 'investing' },
      randomUUID(),
    );
    const before = await sourceSnapshot();
    expect((await journals.get(fixture.owner.context, trade.id)).journal.revision).toBe(0);
    expect((await save(trade.id, 0, 'Retrospective notes')).revision).toBe(1);
    expect(await sourceSnapshot()).toEqual(before);
  });
  it('publishes immutable original risk, separates later plans and records supplemental risk', async () => {
    const trade = await create();
    const currency = await catalog.createCurrency(
      fixture.owner.context,
      {
        namespace: 'iso',
        code: `X${randomUUID().slice(0, 6)}`,
        kind: 'custom',
        unitIdentity: `test:${randomUUID()}`,
        name: 'Risk currency',
        displayScale: 2,
        settlementIncrement: '0.01',
        effectiveAt,
      },
      randomUUID(),
    );
    const firstDocument = journalDocumentSchema.parse({
      plan: {
        thesis: 'Original thesis',
        initialRisk: {
          amount: '12.5000',
          currencyId: currency.id,
          method: 'Manual pre-trade risk',
        },
      },
    });
    await journals.save(
      fixture.owner.context,
      trade.trade.id,
      { expectedRevision: 0, document: firstDocument },
      randomUUID(),
    );
    const before = await sourceSnapshot(),
      key = randomUUID();
    const first = await journals.publishPlan(
      fixture.owner.context,
      trade.trade.id,
      {
        expectedRevision: 1,
        expectedTradeRevision: trade.trade.revision,
        reason: 'Original plan before execution',
      },
      key,
    );
    const committed = (await journals.get(fixture.owner.context, trade.trade.id)).commitment;
    expect(first.version).toBe(1);
    expect(committed).toMatchObject({ originalPlanId: first.id, timing: 'pre-trade' });
    expect(committed!.committedAt).toMatch(/\.\d{6}Z$/u);
    expect(
      await journals.publishPlan(
        fixture.owner.context,
        trade.trade.id,
        {
          expectedRevision: 1,
          expectedTradeRevision: trade.trade.revision,
          reason: 'Original plan before execution',
        },
        key,
      ),
    ).toEqual(first);
    await journals.save(
      fixture.owner.context,
      trade.trade.id,
      {
        expectedRevision: 2,
        document: journalDocumentSchema.parse({
          plan: {
            ...firstDocument.plan,
            thesis: 'Adjusted thesis',
            initialRisk: { ...firstDocument.plan.initialRisk!, amount: '999' },
          },
        }),
      },
      randomUUID(),
    );
    const second = await journals.publishPlan(
      fixture.owner.context,
      trade.trade.id,
      {
        expectedRevision: 3,
        expectedTradeRevision: trade.trade.revision,
        reason: 'Adjust plan without rewriting original risk',
      },
      randomUUID(),
    );
    const risk = await journals.addRisk(
      fixture.owner.context,
      trade.trade.id,
      {
        expectedRevision: 4,
        amount: '3.7500',
        currencyId: currency.id,
        method: 'Additional scale-in risk',
        methodNotes: 'Distinct supplemental record',
        reason: 'Add reviewed scale-in',
      },
      randomUUID(),
    );
    expect(risk.amount).toBe('3.7500');
    const detail = await journals.get(fixture.owner.context, trade.trade.id);
    expect(detail.originalPlan).toEqual(first);
    expect(detail.currentPlan).toEqual(second);
    expect(detail.commitment).toEqual(committed);
    expect(detail.journal.revision).toBe(5);
    expect(
      (await journals.riskAdditions(fixture.owner.context, trade.trade.id)).riskAdditions,
    ).toEqual([risk]);
    expect(await sourceSnapshot()).toEqual(before);
  });
  it('keeps the pinned strategy snapshot while later strategy definitions change', async () => {
    const checklistId = randomUUID(),
      setupId = randomUUID();
    const strategy = await strategies.create(
      fixture.owner.context,
      {
        definition: strategyDefinitionSchema.parse({
          name: 'Original rules',
          status: 'active',
          checklist: [{ id: checklistId, label: 'Confirm thesis', required: true }],
          setups: [
            {
              id: setupId,
              name: 'Pullback',
              conditions: 'Original condition',
              checklistItemIds: [checklistId],
            },
          ],
        }),
        effectiveAt,
        changeReason: 'Initial strategy rules',
      },
      randomUUID(),
    );
    const trade = await journals.create(
      fixture.owner.context,
      journalCreateSchema.parse({
        title: 'Pinned journal',
        classification: 'active-trading',
        strategyVersionId: strategy.currentVersionId,
      }),
      randomUUID(),
    );
    expect(trade.journal.document.plan.strategyVersionId).toBe(strategy.currentVersionId);
    const savedDocument = journalDocumentSchema.parse({
      plan: { strategyVersionId: strategy.currentVersionId, setupId },
      review: {
        ruleAssessments: [
          {
            checklistItemId: checklistId,
            outcome: 'unknown',
            evidence: 'Awaiting evidence',
            source: 'manual',
          },
        ],
      },
    });
    await journals.save(
      fixture.owner.context,
      trade.trade.id,
      { expectedRevision: 0, document: savedDocument },
      randomUUID(),
    );
    await strategies.update(
      fixture.owner.context,
      strategy.id,
      {
        expectedRevision: 1,
        definition: strategyDefinitionSchema.parse({
          ...strategy.currentVersion.definition,
          entryRules: 'Changed RSI rule',
        }),
        effectiveAt,
        changeReason: 'Revise after review',
      },
      randomUUID(),
    );
    const detail = await journals.get(fixture.owner.context, trade.trade.id);
    expect(detail.strategy).toEqual(strategy.currentVersion);
    expect(detail.journal.document.review.ruleAssessments[0]?.outcome).toBe('unknown');
    await expect(
      journals.save(
        fixture.owner.context,
        trade.trade.id,
        {
          expectedRevision: 1,
          document: journalDocumentSchema.parse({ plan: { strategyVersionId: randomUUID() } }),
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'TRADE_STRATEGY_ALREADY_PINNED' });
    const changed = structuredClone(savedDocument);
    changed.plan.setupId = randomUUID();
    await expect(
      journals.save(
        fixture.owner.context,
        trade.trade.id,
        { expectedRevision: 1, document: changed },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_JOURNAL_REFERENCE' });
    changed.plan.setupId = setupId;
    changed.review.ruleAssessments[0]!.checklistItemId = randomUUID();
    await expect(
      journals.save(
        fixture.owner.context,
        trade.trade.id,
        { expectedRevision: 1, document: changed },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_JOURNAL_REFERENCE' });
  });
  it('records a once-only retrospective strategy association at publication without an economic revision', async () => {
    const strategy = await strategies.create(
      fixture.owner.context,
      {
        definition: strategyDefinitionSchema.parse({ name: 'Chosen rules', status: 'active' }),
        effectiveAt,
        changeReason: 'Initial strategy rules',
      },
      randomUUID(),
    );
    const trade = await create();
    await journals.save(
      fixture.owner.context,
      trade.trade.id,
      {
        expectedRevision: 0,
        document: journalDocumentSchema.parse({
          plan: { strategyVersionId: strategy.currentVersionId },
        }),
      },
      randomUUID(),
    );
    const before = await sourceSnapshot();
    await journals.publishPlan(
      fixture.owner.context,
      trade.trade.id,
      { expectedRevision: 1, expectedTradeRevision: 1, reason: 'Select rules after trade record' },
      randomUUID(),
    );
    expect((await journals.get(fixture.owner.context, trade.trade.id)).trade).toMatchObject({
      strategyVersionId: strategy.currentVersionId,
      strategyLinkTiming: 'retrospective',
      revision: 2,
    });
    expect(await sourceSnapshot()).toEqual(before);
  });
  it('validates exact tenant-owned leg and currency references before creating immutable history', async () => {
    const trade = await create();
    await expect(
      journals.save(
        fixture.owner.context,
        trade.trade.id,
        {
          expectedRevision: 0,
          document: journalDocumentSchema.parse({
            plan: { legs: [{ legId: randomUUID(), plannedEntry: '10' }] },
          }),
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_JOURNAL_REFERENCE' });
    await expect(
      journals.save(
        fixture.owner.context,
        trade.trade.id,
        {
          expectedRevision: 0,
          document: journalDocumentSchema.parse({
            plan: {
              initialRisk: { amount: '10', currencyId: randomUUID(), method: 'No currency' },
            },
          }),
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await journals.get(fixture.owner.context, trade.trade.id)).journal.revision).toBe(0);
  });
  it('denies viewer mutation, hides cross-tenant trades and supports editor review', async () => {
    const trade = await create();
    await expect(
      journals.save(
        fixture.viewer.context,
        trade.trade.id,
        { expectedRevision: 0, document: document('Denied') },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(journals.get(fixture.outsider.context, trade.trade.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      (
        await journals.save(
          fixture.editor.context,
          trade.trade.id,
          { expectedRevision: 0, document: document('Editor review') },
          randomUUID(),
        )
      ).updatedBy,
    ).toBe(fixture.editor.context.actorId);
    expect(
      (await journals.get(fixture.viewer.context, trade.trade.id)).journal.document.review
        .customNotes,
    ).toBe('Editor review');
  });
  it('keeps strategy pins and journal saves in financial-state-before-advisory lock order', async () => {
    const strategy = await strategies.create(
      fixture.owner.context,
      {
        definition: strategyDefinitionSchema.parse({ name: 'Lock order strategy' }),
        effectiveAt,
        changeReason: 'Initial rules',
      },
      randomUUID(),
    );
    const trade = await create();
    const before = await sourceSnapshot();
    const blocker = await fixture.admin.pool.connect(),
      probe = await fixture.admin.pool.connect();
    let linking: ReturnType<typeof strategies.linkTrade> | undefined;
    let saving: ReturnType<typeof journals.save> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        'SELECT revision FROM app.financial_state WHERE workspace_id=$1 FOR UPDATE',
        [fixture.owner.context.workspaceId],
      );
      linking = strategies.linkTrade(
        fixture.owner.context,
        strategy.id,
        {
          tradeId: trade.trade.id,
          versionId: strategy.currentVersionId,
          expectedTradeRevision: 1,
          reason: 'Concurrent immutable association',
        },
        randomUUID(),
      );
      // Wait for the actual database lock wait, then inspect the advisory mutex independently.
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await probe.query(
          `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%app.financial_state%' AND pid<>pg_backend_pid()) waiting`,
        );
        if (result.rows[0].waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(waiting).toBe(true);
      await probe.query('BEGIN');
      const mutex = await probe.query(
        'SELECT pg_try_advisory_xact_lock(1791763200,hashtext($1::text)) available',
        [fixture.owner.context.workspaceId],
      );
      expect(mutex.rows[0].available).toBe(true);
      await probe.query('COMMIT');
      saving = save(trade.trade.id, 0, 'Review while strategy association is accepted');
      await blocker.query('COMMIT');
      const [linked, saved] = await Promise.all([linking, saving]);
      expect(linked.strategyVersionId).toBe(strategy.currentVersionId);
      expect(saved.document.plan.strategyVersionId).toBe(strategy.currentVersionId);
      expect(await sourceSnapshot()).toEqual(before);
    } finally {
      await Promise.all([blocker.query('ROLLBACK'), probe.query('ROLLBACK')]);
      await Promise.allSettled([linking, saving].filter((promise) => promise !== undefined));
      blocker.release();
      probe.release();
    }
  });
  it('creates account/instrument legs atomically and keeps manual prices out of calculated actuals', async () => {
    const currency = await catalog.createCurrency(
      fixture.owner.context,
      {
        namespace: 'journal-tests',
        code: 'JCU',
        kind: 'custom',
        unitIdentity: `journal:${randomUUID()}`,
        name: 'Journal unit',
        displayScale: 2,
        settlementIncrement: '0.01',
        effectiveAt,
      },
      randomUUID(),
    );
    const account = await catalog.createAccount(
      fixture.owner.context,
      {
        name: 'Journal custody',
        environment: 'live',
        accountType: 'cash',
        baseCurrencyId: currency.id,
        inventoryMethod: 'fifo',
        allowShort: false,
        holdingMode: 'netted',
        effectiveAt,
      },
      randomUUID(),
    );
    const instrument = await catalog.createInstrument(
      fixture.owner.context,
      {
        name: 'Fractional journal share',
        family: 'stock',
        subtype: 'ordinary-share',
        economicIdentity: `journal:share:${randomUUID()}`,
        quantityUnit: 'share',
        quoteCurrencyId: currency.id,
        settlementCurrencyId: currency.id,
        multiplier: '1',
        quantityIncrement: '0.001',
        priceIncrement: '0.01',
        capability: 'native-linear',
        effectiveAt,
        metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
      },
      randomUUID(),
    );
    const trade = await journals.create(
      fixture.owner.context,
      journalCreateSchema.parse({
        title: 'Fractional plan',
        classification: 'active-trading',
        legs: [
          {
            accountId: account.id,
            instrumentVersionId: instrument.versionId,
            direction: 'long',
            label: 'Entry share leg',
          },
        ],
      }),
      randomUUID(),
    );
    expect(trade.financial.legs).toHaveLength(1);
    const legId = trade.financial.legs[0]!.legId;
    const draft = journalDocumentSchema.parse({
      plan: {
        legs: [
          {
            legId,
            plannedEntry: '100.2500',
            plannedStop: '98.50',
            plannedTargets: ['103.75', '105'],
            plannedQuantity: '0.125',
            estimatedCosts: '0.0100',
          },
        ],
      },
      review: {
        actualObservations: [
          {
            legId,
            actualStop: '99.5',
            reportedEntry: '101.5',
            reportedExit: '102.75',
            notes: 'Reported prices are manual observations',
          },
        ],
      },
    });
    await journals.save(
      fixture.owner.context,
      trade.trade.id,
      { expectedRevision: 0, document: draft },
      randomUUID(),
    );
    const detail = await journals.get(fixture.owner.context, trade.trade.id);
    expect(detail.journal.document).toEqual(draft);
    expect(detail.financial.legs[0]!.actualEntry).toMatchObject({
      status: 'unavailable',
      value: null,
      source: 'calculated-ledger',
    });
    expect(detail.financial.legs[0]!.actualExit).toMatchObject({
      status: 'unavailable',
      value: null,
    });
    expect(detail.financial.legs[0]!.openQuantity).toMatchObject({
      status: 'unavailable',
      value: null,
      reasons: expect.arrayContaining([expect.any(String)]),
    });
    const before = await sourceSnapshot();
    await expect(
      journals.create(
        fixture.owner.context,
        journalCreateSchema.parse({
          title: 'Must roll back',
          classification: 'investing',
          legs: [
            {
              accountId: account.id,
              instrumentVersionId: randomUUID(),
              direction: 'long',
              label: 'Invalid instrument',
            },
          ],
        }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await sourceSnapshot()).toEqual(before);
  });
  it('keeps historical strategy and currency references reviewable after archive while rejecting new archived pins', async () => {
    const strategy = await strategies.create(
      fixture.owner.context,
      {
        definition: strategyDefinitionSchema.parse({ name: 'Archived historical rules' }),
        effectiveAt,
        changeReason: 'Initial rules',
      },
      randomUUID(),
    );
    const currency = await catalog.createCurrency(
      fixture.owner.context,
      {
        namespace: 'journal-archive',
        code: 'ARCH',
        kind: 'custom',
        unitIdentity: `journal:archive:${randomUUID()}`,
        name: 'Historical risk unit',
        displayScale: 2,
        settlementIncrement: '0.01',
        effectiveAt,
      },
      randomUUID(),
    );
    const trade = await journals.create(
      fixture.owner.context,
      journalCreateSchema.parse({
        title: 'Historical archived references',
        classification: 'investing',
        strategyVersionId: strategy.currentVersionId,
      }),
      randomUUID(),
    );
    const draft = journalDocumentSchema.parse({
      plan: {
        strategyVersionId: strategy.currentVersionId,
        initialRisk: { amount: '10.00', currencyId: currency.id, method: 'Original risk' },
      },
    });
    await journals.save(
      fixture.owner.context,
      trade.trade.id,
      { expectedRevision: 0, document: draft },
      randomUUID(),
    );
    await strategies.archive(
      fixture.owner.context,
      strategy.id,
      { expectedRevision: 1, reason: 'Retired playbook' },
      randomUUID(),
    );
    await catalog.archiveCatalog(
      fixture.owner.context,
      'currency',
      currency.id,
      { expectedRevision: currency.revision, reason: 'Historical currency retained' },
      randomUUID(),
    );
    draft.review.customNotes = 'Review remains available after definitions are archived';
    expect(
      (
        await journals.save(
          fixture.owner.context,
          trade.trade.id,
          { expectedRevision: 1, document: draft },
          randomUUID(),
        )
      ).revision,
    ).toBe(2);
    expect((await journals.get(fixture.owner.context, trade.trade.id)).strategy).toEqual(
      strategy.currentVersion,
    );
    await expect(
      journals.create(
        fixture.owner.context,
        journalCreateSchema.parse({
          title: 'Invalid new archived pin',
          classification: 'investing',
          strategyVersionId: strategy.currentVersionId,
        }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'STRATEGY_ARCHIVED' });
    const unpinned = await create();
    await expect(
      journals.save(
        fixture.owner.context,
        unpinned.trade.id,
        {
          expectedRevision: 0,
          document: journalDocumentSchema.parse({
            plan: { strategyVersionId: strategy.currentVersionId },
          }),
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'STRATEGY_ARCHIVED' });
  });
  it('rejects publication for canceled or archived trades while preserving journal reviews', async () => {
    const canceled = await create();
    await catalog.cancelTrade(
      fixture.owner.context,
      canceled.trade.id,
      { expectedRevision: 1, reason: 'Idea abandoned' },
      randomUUID(),
    );
    await save(canceled.trade.id, 0, 'Record why the idea was canceled');
    await expect(
      journals.publishPlan(
        fixture.owner.context,
        canceled.trade.id,
        { expectedRevision: 1, expectedTradeRevision: 2, reason: 'Invalid late plan' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'TRADE_NOT_ACTIVE' });
    const archived = await create();
    await catalog.archiveCatalog(
      fixture.owner.context,
      'trade',
      archived.trade.id,
      { expectedRevision: 1, reason: 'Archive unused idea' },
      randomUUID(),
    );
    await save(archived.trade.id, 0, 'Archived trade review');
    await expect(
      journals.publishPlan(
        fixture.owner.context,
        archived.trade.id,
        { expectedRevision: 1, expectedTradeRevision: 2, reason: 'Invalid archived plan' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'TRADE_NOT_ACTIVE' });
  });
  it('requires a saved revision and original commitment for publication and supplemental risk', async () => {
    const trade = await create();
    await expect(
      journals.publishPlan(
        fixture.owner.context,
        trade.trade.id,
        { expectedRevision: 1, expectedTradeRevision: 1, reason: 'Stale draft' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'STALE_JOURNAL_REVISION' });
    await expect(
      journals.publishPlan(
        fixture.owner.context,
        trade.trade.id,
        { expectedRevision: 0, expectedTradeRevision: 2, reason: 'Stale trade' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'STALE_TRADE_REVISION' });
    await expect(
      journals.addRisk(
        fixture.owner.context,
        trade.trade.id,
        {
          expectedRevision: 0,
          amount: '1',
          currencyId: randomUUID(),
          method: 'Extra risk',
          methodNotes: '',
          reason: 'Missing original',
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'ORIGINAL_PLAN_REQUIRED' });
  });
  it('paginates revisions/plans/list deterministically and rejects another trade cursor', async () => {
    const trade = await create('Pagination example');
    await save(trade.trade.id, 0, 'One');
    await save(trade.trade.id, 1, 'Two');
    await save(trade.trade.id, 2, 'Three');
    const first = await journals.revisions(fixture.owner.context, trade.trade.id, { limit: 2 });
    expect(first.revisions.map((revision) => revision.revision)).toEqual([3, 2]);
    expect(first.nextCursor).toBe(first.revisions[1]!.id);
    const second = await journals.revisions(fixture.owner.context, trade.trade.id, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.revisions.map((revision) => revision.revision)).toEqual([1]);
    expect(second.nextCursor).toBeNull();
    const other = await create();
    await save(other.trade.id, 0, 'Other');
    const otherHistory = await journals.revisions(fixture.owner.context, other.trade.id);
    await expect(
      journals.revisions(fixture.owner.context, trade.trade.id, {
        cursor: otherHistory.revisions[0]!.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const list = await journals.list(fixture.owner.context, {
      search: 'Pagination example',
      limit: 1,
    });
    expect(list.trades.map((row) => row.id)).toContain(trade.trade.id);
  });
});
