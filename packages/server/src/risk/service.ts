import { randomUUID } from 'node:crypto';
import { sql, type DbTransaction } from '@journal/database';
import {
  decimalValue,
  quantizeDecimal,
  selectFxRate,
  type FxObservation,
  type PinnedInventoryRate,
} from '@journal/domain';
import {
  assessRiskLimit,
  riskAssessmentState,
  riskCrossesBoundary,
  riskPeriodStart,
  sizeLinearRisk,
} from '@journal/domain';
import type { RiskFact } from '@journal/domain';
import { financialIdSchema } from '@journal/contracts';
import {
  riskAssessmentRequestSchema,
  riskAssessmentResponseSchema,
  riskPolicyListSchema,
  riskPolicyVersionSchema,
  riskPolicyWriteSchema,
  riskSizingRequestSchema,
  riskSizingResponseSchema,
  type RiskAssessmentRequest,
  type RiskPolicyVersion,
  type RiskSizingRequest,
} from '@journal/contracts';
import type { AuthorizationContext } from '../services.js';
import { ApplicationError, inaccessible } from '../errors.js';
import {
  financialConflict,
  financialFingerprint,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';
import {
  financialInstantMicros,
  requireAccount,
  requireCurrency,
  requireInstrumentVersion,
  supportsNativeShortInventory,
} from '../financial/reference-data.js';
import {
  canonicalFinancialInstant,
  createFinancialObservations,
} from '../financial/observations.js';
import { createAccountingReports } from '../accounting/report.js';

const instantSql = (column: string) =>
  sql.raw(`to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`);
const unknownFact = (
  unit: RiskFact['unit'],
  currencyId: string | null,
  reason: string,
  references: string[] = [],
): RiskFact => ({ value: null, unit, currencyId, reasons: [reason], references });
const knownFact = (
  value: string,
  unit: RiskFact['unit'],
  currencyId: string | null,
  references: string[],
): RiskFact => ({ value, unit, currencyId, reasons: [], references });

export function createRiskServices(platform: FinancialPlatform) {
  async function command<T>(
    context: AuthorizationContext,
    commandId: string,
    kind: string,
    payload: unknown,
    run: (tx: DbTransaction) => Promise<T>,
  ): Promise<T> {
    if (context.role === 'viewer' || context.requiredRole === 'viewer')
      throw new ApplicationError(
        403,
        'FORBIDDEN',
        'Action not permitted',
        'Editor access is required to publish risk evidence.',
      );
    const id = financialIdSchema.parse(commandId),
      hash = financialFingerprint({ kind, payload });
    return platform.withWorkspaceContext(context, async (tx) => {
      if (kind === 'assessment-captured') {
        // Share the ledger's revision lock so every dependent read sees one stable generation.
        // A zero-revision row establishes an empty workspace; no financial fact is posted.
        await tx.execute(
          sql`INSERT INTO app.financial_state(workspace_id,revision) VALUES(${context.workspaceId},0) ON CONFLICT(workspace_id) DO NOTHING`,
        );
        await tx.execute(
          sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId} FOR SHARE`,
        );
      }
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(1791763203,hashtext(${context.workspaceId}))`,
      );
      const [previous] = await queryRows<{ request_hash: string; result: T }>(
        tx,
        sql`SELECT request_hash,result FROM app.risk_commands WHERE workspace_id=${context.workspaceId} AND id=${id}`,
      );
      if (previous) {
        if (previous.request_hash !== hash)
          throw financialConflict(
            'IDEMPOTENCY_CONFLICT',
            'This risk command has different contents.',
          );
        return previous.result;
      }
      const result = await run(tx);
      if (Buffer.byteLength(JSON.stringify(result)) > 1_000_000)
        throw financialConflict(
          'RISK_SCOPE_TOO_LARGE',
          'Select fewer policies before capturing this assessment.',
        );
      await tx.execute(
        sql`INSERT INTO app.risk_commands(workspace_id,id,request_hash,result) VALUES(${context.workspaceId},${id},${hash},${JSON.stringify(result)}::jsonb)`,
      );
      await tx.execute(
        sql`INSERT INTO app.audit_events(workspace_id,id,actor_id,action,request_id) VALUES(${context.workspaceId},${randomUUID()},${context.actorId},${`risk.${kind}`},${context.requestId})`,
      );
      return result;
    });
  }
  async function version(
    tx: DbTransaction,
    context: AuthorizationContext,
    id: string,
  ): Promise<RiskPolicyVersion> {
    const [row] = await queryRows<{ data: unknown }>(
      tx,
      sql`SELECT jsonb_build_object('id',v.id,'policyId',v.policy_id,'workspaceId',v.workspace_id,'accountId',p.account_id,'strategyId',p.strategy_id,'version',v.version,'effectiveAt',${instantSql('v.effective_at')},'createdAt',${instantSql('v.created_at')},'actorId',v.actor_id,'reason',v.reason,'definition',v.definition) AS data FROM app.risk_policy_versions v JOIN app.risk_policies p ON p.workspace_id=v.workspace_id AND p.id=v.policy_id WHERE v.workspace_id=${context.workspaceId} AND v.id=${id}`,
    );
    if (!row) throw inaccessible();
    return riskPolicyVersionSchema.parse(row.data);
  }
  async function savePolicy(context: AuthorizationContext, value: unknown, commandId: string) {
    const input = riskPolicyWriteSchema.parse(value);
    return command(context, commandId, 'policy-published', input, async (tx) => {
      if (input.accountId)
        await requireAccount(tx, context.workspaceId, input.accountId, false, input.effectiveAt);
      if (input.strategyId) {
        const rows = await queryRows(
          tx,
          sql`SELECT id FROM app.strategies WHERE workspace_id=${context.workspaceId} AND id=${input.strategyId}`,
        );
        if (!rows.length) throw inaccessible();
      }
      for (const limit of input.definition.limits) {
        if ('currencyId' in limit)
          await requireCurrency(tx, context.workspaceId, limit.currencyId, false);
        const ids =
          limit.kind === 'prohibited'
            ? limit.instrumentIds
            : limit.kind === 'concentration' && limit.instrumentId
              ? [limit.instrumentId]
              : [];
        for (const id of ids) {
          if (
            !(
              await queryRows(
                tx,
                sql`SELECT id FROM app.instruments WHERE workspace_id=${context.workspaceId} AND id=${id}`,
              )
            ).length
          )
            throw inaccessible();
        }
      }
      const policyId = input.policyId ?? randomUUID();
      if (input.policyId) {
        const [existing] = await queryRows<{
          account_id: string | null;
          strategy_id: string | null;
          version: number;
        }>(
          tx,
          sql`SELECT p.account_id,p.strategy_id,max(v.version)::integer AS version FROM app.risk_policies p JOIN app.risk_policy_versions v ON v.workspace_id=p.workspace_id AND v.policy_id=p.id WHERE p.workspace_id=${context.workspaceId} AND p.id=${policyId} GROUP BY p.account_id,p.strategy_id`,
        );
        if (!existing) throw inaccessible();
        if (
          existing.version !== input.expectedVersion ||
          existing.account_id !== input.accountId ||
          existing.strategy_id !== input.strategyId
        )
          throw financialConflict(
            'STALE_RISK_POLICY',
            'Reload the policy version; its scope cannot be changed.',
          );
      } else {
        if (input.expectedVersion !== 0)
          throw financialInvalid('A new risk policy starts with expected version zero.');
        await tx.execute(
          sql`INSERT INTO app.risk_policies(workspace_id,id,account_id,strategy_id) VALUES(${context.workspaceId},${policyId},${input.accountId},${input.strategyId})`,
        );
      }
      const id = randomUUID();
      await tx.execute(
        sql`INSERT INTO app.risk_policy_versions(workspace_id,id,policy_id,version,effective_at,definition,reason) VALUES(${context.workspaceId},${id},${policyId},${input.expectedVersion + 1},${input.effectiveAt}::timestamptz,${JSON.stringify(input.definition)}::jsonb,${input.reason})`,
      );
      return version(tx, context, id);
    });
  }
  async function policies(
    context: AuthorizationContext,
    query: { after?: string; accountId?: string; strategyId?: string } = {},
  ) {
    const after = query.after ? financialIdSchema.parse(query.after) : null;
    const account = query.accountId ? financialIdSchema.parse(query.accountId) : null;
    const strategy = query.strategyId ? financialIdSchema.parse(query.strategyId) : null;
    return platform.withWorkspaceContext(context, async (tx) => {
      const rows = await queryRows<{ id: string }>(
        tx,
        sql`SELECT v.id FROM app.risk_policy_versions v JOIN app.risk_policies p ON p.workspace_id=v.workspace_id AND p.id=v.policy_id WHERE v.workspace_id=${context.workspaceId} AND (${after}::uuid IS NULL OR v.id>${after}::uuid) AND (${account}::uuid IS NULL OR p.account_id=${account}::uuid) AND (${strategy}::uuid IS NULL OR p.strategy_id=${strategy}::uuid) ORDER BY v.id LIMIT 51`,
      );
      const versions = [];
      for (const row of rows.slice(0, 50)) versions.push(await version(tx, context, row.id));
      return riskPolicyListSchema.parse({
        versions,
        nextCursor: rows.length > 50 ? rows[49]!.id : null,
      });
    });
  }
  async function fx(
    tx: DbTransaction,
    context: AuthorizationContext,
    from: string,
    to: string,
    at: string,
    definition: RiskPolicyVersion['definition'],
    pin?: PinnedInventoryRate,
  ) {
    if (from === to) return { rate: '1', references: [`identity:${from}`], reasons: [] };
    if (
      pin?.baseCurrencyId === from &&
      pin.quoteCurrencyId === to &&
      pin.observationId &&
      decimalValue(pin.rate).gt(0)
    )
      return { rate: pin.rate, references: [pin.observationId], reasons: [] };
    const rows = await queryRows<{
      id: string;
      base_currency_id: string;
      quote_currency_id: string;
      rate_raw: string;
      observed_at: string;
      source: string;
    }>(
      tx,
      sql`SELECT o.id,o.base_currency_id,o.quote_currency_id,o.rate_raw,${instantSql('o.observed_at')} AS observed_at,o.source FROM app.fx_observations o WHERE o.workspace_id=${context.workspaceId} AND ((o.base_currency_id=${from} AND o.quote_currency_id=${to}) OR (o.base_currency_id=${to} AND o.quote_currency_id=${from})) AND o.observed_at<=${at}::timestamptz AND NOT EXISTS(SELECT 1 FROM app.fx_observations n WHERE n.workspace_id=o.workspace_id AND n.supersedes_id=o.id) ORDER BY o.observed_at DESC,o.id LIMIT 10001`,
    );
    if (rows.length > 10000)
      return { rate: null, references: [from, to], reasons: ['fx_evidence_scope_too_large'] };
    const observations: FxObservation[] = rows.map((r) => ({
      id: r.id,
      baseCurrencyId: r.base_currency_id,
      quoteCurrencyId: r.quote_currency_id,
      rate: r.rate_raw,
      observedAt: r.observed_at,
      source: r.source,
    }));
    const selected = selectFxRate(
      from,
      to,
      at,
      {
        id: 'risk-historical-fx/1',
        maxAgeMilliseconds: definition.maxAgeMilliseconds,
        sourcePriority: definition.fxSources,
      },
      observations,
    );
    return selected.state === 'available'
      ? { rate: selected.value.rate, references: [...selected.value.observationIds], reasons: [] }
      : { rate: null, references: [...selected.missingReferences], reasons: [...selected.reasons] };
  }
  async function assess(
    context: AuthorizationContext,
    value: RiskAssessmentRequest,
    commandId: string,
  ) {
    const input = riskAssessmentRequestSchema.parse(value);
    return command(context, commandId, 'assessment-captured', input, async (tx) => {
      const account = await requireAccount(
        tx,
        context.workspaceId,
        input.accountId,
        false,
        input.asOf,
      );
      let strategyId: string | null = null;
      if (input.strategyVersionId) {
        const [row] = await queryRows<{ strategy_id: string; effective_at: string }>(
          tx,
          sql`SELECT strategy_id,${instantSql('effective_at')} AS effective_at FROM app.strategy_versions WHERE workspace_id=${context.workspaceId} AND id=${input.strategyVersionId}`,
        );
        if (!row) throw inaccessible();
        if (financialInstantMicros(row.effective_at) > financialInstantMicros(input.asOf))
          throw financialInvalid(
            'The selected strategy version was not effective at the assessment instant.',
          );
        strategyId = row.strategy_id;
      }
      const proposalInstrument = input.proposal
        ? await requireInstrumentVersion(
            tx,
            context.workspaceId,
            input.proposal.instrumentVersionId,
            false,
          )
        : null;
      if (
        proposalInstrument &&
        financialInstantMicros(proposalInstrument.effectiveAt) > financialInstantMicros(input.asOf)
      )
        throw financialInvalid(
          'The proposed instrument convention was not effective at the assessment instant.',
        );
      const [state] = await queryRows<{ revision: number; at: string }>(
        tx,
        sql`SELECT coalesce((SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}),0)::integer AS revision,${instantSql('clock_timestamp()')} AS at`,
      );
      if (financialInstantMicros(input.asOf) > financialInstantMicros(state!.at))
        throw financialInvalid('Assessment time cannot be in the future.');
      const selected = await queryRows<{ id: string }>(
        tx,
        sql`SELECT v.id FROM app.risk_policies p JOIN LATERAL(SELECT id FROM app.risk_policy_versions v WHERE v.workspace_id=p.workspace_id AND v.policy_id=p.id AND v.effective_at<=${input.asOf}::timestamptz ORDER BY effective_at DESC,version DESC LIMIT 1) v ON true WHERE p.workspace_id=${context.workspaceId} AND (p.account_id=${input.accountId} OR p.strategy_id=${strategyId}::uuid) ORDER BY p.id LIMIT 17`,
      );
      if (selected.length > 16)
        throw financialConflict(
          'RISK_SCOPE_TOO_LARGE',
          'At most sixteen applicable risk policies can be assessed together. Consolidate redundant policies.',
        );
      const applied = [];
      for (const row of selected) applied.push(await version(tx, context, row.id));
      const snapshot: FinancialPlatform = {
        withWorkspaceContext: async (inner, callback) => {
          if (inner.workspaceId !== context.workspaceId || inner.actorId !== context.actorId)
            throw inaccessible();
          return callback(tx);
        },
      };
      const observations = createFinancialObservations(snapshot),
        accounting = createAccountingReports(snapshot);
      type Valuation = Awaited<ReturnType<typeof observations.valuation>>;
      const valuationCache = new Map<string, Promise<Valuation>>();
      const capitalCache = new Map<
        string,
        Promise<Awaited<ReturnType<typeof accounting.report>>>
      >();
      const capital = (currencyId: string, d: RiskPolicyVersion['definition']) => {
        const key = JSON.stringify([currencyId, d.maxAgeMilliseconds, d.priceSources, d.fxSources]);
        let result = capitalCache.get(key);
        if (!result) {
          result = accounting.report(context, {
            accountIds: [input.accountId],
            reportingCurrencyId: currencyId,
            from: `${new Date(new Date(input.asOf).getTime() - 1).toISOString().slice(0, -1)}999Z`,
            to: input.asOf,
            sourceRevision: String(state!.revision),
            fxPolicy: {
              id: 'risk-capital-fx/1',
              maxAgeMilliseconds: d.maxAgeMilliseconds,
              sourcePriority: d.fxSources,
            },
            priceMaxAgeMilliseconds: d.maxAgeMilliseconds,
            priceSourcePriority: d.priceSources,
          });
          capitalCache.set(key, result);
        }
        return result;
      };
      const valuation = (currencyId: string, d: RiskPolicyVersion['definition']) => {
        const key = JSON.stringify([currencyId, d.maxAgeMilliseconds, d.priceSources, d.fxSources]);
        let promise = valuationCache.get(key);
        if (!promise) {
          promise = observations.valuation(context, {
            accountIds: [input.accountId],
            reportingCurrencyId: currencyId,
            asOf: input.asOf,
            fxPolicy: {
              id: 'risk-evidence/1',
              maxAgeMilliseconds: d.maxAgeMilliseconds,
              sourcePriority: d.fxSources,
            },
            priceMaxAgeMilliseconds: d.maxAgeMilliseconds,
            priceSourcePriority: d.priceSources,
          });
          valuationCache.set(key, promise);
        }
        return promise;
      };
      const results = [];
      for (const policy of applied)
        for (const limit of policy.definition.limits) {
          const d = policy.definition,
            refs: string[] = [
              `account-settings:${account.settingsId}`,
              `financial-revision:${state!.revision}`,
            ];
          const unit: RiskFact['unit'] =
            limit.kind === 'positions'
              ? 'count'
              : limit.kind === 'overnight' || limit.kind === 'prohibited'
                ? 'boolean'
                : limit.kind === 'concentration' ||
                    (limit.kind === 'trade-risk' && limit.measure === 'equity-ratio') ||
                    (limit.kind === 'exposure' && limit.denominator === 'equity')
                  ? 'ratio'
                  : 'money';
          const currency = 'currencyId' in limit ? limit.currencyId : account.baseCurrencyId;
          let fact: RiskFact;
          try {
            const bookCount = await queryRows<{ count: number }>(
              tx,
              sql`SELECT count(*)::integer AS count FROM app.holding_books WHERE workspace_id=${context.workspaceId} AND account_id=${input.accountId}`,
            );
            if (bookCount[0]!.count > 200)
              fact = unknownFact(
                unit,
                unit === 'money' ? currency : null,
                'risk_book_capacity_exceeded_select_a_supported_scope',
                refs,
              );
            else if (limit.kind === 'trade-risk') {
              if (!input.proposal?.riskAmount || !input.proposal.riskCurrencyId)
                fact = unknownFact(
                  unit,
                  unit === 'money' ? currency : null,
                  'record_explicit_proposed_risk_amount_currency_and_method',
                  refs,
                );
              else {
                const rate = await fx(
                  tx,
                  context,
                  input.proposal.riskCurrencyId,
                  currency,
                  input.asOf,
                  d,
                );
                refs.push(...rate.references, `manual-risk-method:${input.proposal.riskMethod}`);
                if (rate.rate === null)
                  fact = unknownFact(
                    unit,
                    unit === 'money' ? currency : null,
                    `missing_proposal_risk_fx:${rate.reasons.join(',')}`,
                    refs,
                  );
                else {
                  let amount = decimalValue(input.proposal.riskAmount).times(rate.rate);
                  if (limit.measure === 'equity-ratio') {
                    const report = await capital(currency, d);
                    const equity = report.closing.equity;
                    refs.push(...report.dependencies.sourceIds);
                    if (
                      equity.state !== 'available' ||
                      equity.value === null ||
                      !decimalValue(equity.value).gt(0)
                    ) {
                      fact = unknownFact(
                        unit,
                        null,
                        'complete_positive_equity_required_for_risk_ratio',
                        refs,
                      );
                      results.push(assessRiskLimit(policy.id, limit, fact));
                      continue;
                    }
                    amount = amount.div(equity.value);
                  }
                  fact = knownFact(
                    quantizeDecimal(amount),
                    unit,
                    unit === 'money' ? currency : null,
                    refs,
                  );
                }
              }
            } else if (limit.kind === 'daily-loss' || limit.kind === 'weekly-loss') {
              const start = riskPeriodStart(
                input.asOf,
                limit.timezone,
                limit.kind === 'weekly-loss',
              );
              if (!start)
                fact = unknownFact('money', currency, 'ambiguous_calendar_boundary', refs);
              else {
                const from = `${new Date(new Date(start).getTime() - 1).toISOString().slice(0, -1)}999Z`;
                const report = await accounting.report(context, {
                  accountIds: [input.accountId],
                  reportingCurrencyId: currency,
                  from,
                  to: input.asOf,
                  sourceRevision: String(state!.revision),
                  fxPolicy: {
                    id: 'risk-period-fx/1',
                    maxAgeMilliseconds: d.maxAgeMilliseconds,
                    sourcePriority: d.fxSources,
                  },
                  priceMaxAgeMilliseconds: d.maxAgeMilliseconds,
                  priceSourcePriority: d.priceSources,
                });
                refs.push(
                  `period:${start}/${input.asOf}`,
                  ...report.dependencies.sourceIds,
                  ...report.dependencies.prices.map((p) => p.observationId),
                  ...report.dependencies.fx.flatMap((f) =>
                    f.selection.state === 'available' ? f.selection.value.observationIds : [],
                  ),
                );
                let net: ReturnType<typeof decimalValue> | null = null;
                const reasons: string[] = [];
                if (limit.basis === 'account-change') {
                  const performance = report.reconciliation.performance;
                  if (performance.state === 'available' && performance.value !== null)
                    net = decimalValue(performance.value);
                  else reasons.push(...performance.reasons);
                  // Account-change is the full net change: income inclusion cannot be silently toggled.
                  if (!limit.includeIncome) {
                    const income = report.breakdown.income;
                    if (net && income.state === 'available' && income.value !== null)
                      net = net.minus(income.value);
                    else reasons.push(...income.reasons);
                  }
                } else {
                  net = decimalValue('0');
                  const v = await valuation(currency, d);
                  for (const position of v.positions) {
                    if (position.inventory.status !== 'available') {
                      reasons.push('unsupported_or_incomplete_realization');
                      continue;
                    }
                    for (const match of position.inventory.matches) {
                      if (match.economicOrder.instant === null) {
                        reasons.push('missing_realization_instant');
                        continue;
                      }
                      const at = financialInstantMicros(match.economicOrder.instant);
                      if (
                        at < financialInstantMicros(start) ||
                        at > financialInstantMicros(input.asOf)
                      )
                        continue;
                      const native = position.inventory.scope.settlementCurrencyId;
                      if (
                        native === null ||
                        match.grossPnl.value === null ||
                        !match.costsComplete ||
                        match.consumedPrincipal === null
                      ) {
                        reasons.push('incomplete_realized_result_or_costs');
                        continue;
                      }
                      const closeRate = await fx(
                        tx,
                        context,
                        native,
                        currency,
                        match.economicOrder.instant,
                        d,
                        match.exitReportingFx,
                      );
                      const lot = position.inventory.lots.find((l) => l.id === match.lotId);
                      const source = lot?.economicOrder.instant;
                      const openRate = source
                        ? await fx(tx, context, native, currency, source, d, match.basisReportingFx)
                        : { rate: null, references: [], reasons: ['missing_acquisition_instant'] };
                      refs.push(match.id, ...closeRate.references, ...openRate.references);
                      if (closeRate.rate === null || openRate.rate === null) {
                        reasons.push('missing_realization_fx');
                        continue;
                      }
                      net = net.plus(decimalValue(match.grossPnl.value).times(closeRate.rate)).plus(
                        decimalValue(match.consumedPrincipal)
                          .times(match.direction === 'long' ? '1' : '-1')
                          .times(decimalValue(closeRate.rate).minus(openRate.rate)),
                      );
                    }
                  }
                  for (const component of ['fees', 'expenses', 'taxes'] as const) {
                    const metric = report.breakdown[component];
                    if (metric.state !== 'available' || metric.value === null)
                      reasons.push(...metric.reasons);
                    else net = net.minus(metric.value);
                  }
                  if (limit.includeIncome) {
                    const metric = report.breakdown.income;
                    if (metric.state !== 'available' || metric.value === null)
                      reasons.push(...metric.reasons);
                    else net = net.plus(metric.value);
                  }
                  const unresolved = report.reconciliation.performance.reasons.filter(
                    (r) => r.includes('unresolved') || r.includes('classification'),
                  );
                  reasons.push(...unresolved);
                }
                fact =
                  net && reasons.length === 0
                    ? knownFact(
                        quantizeDecimal(net.isNegative() ? net.negated() : decimalValue('0')),
                        'money',
                        currency,
                        refs,
                      )
                    : unknownFact(
                        'money',
                        currency,
                        reasons.join(';') || 'incomplete_period_inputs',
                        refs,
                      );
              }
            } else {
              const v = await valuation(currency, d);
              const active = v.positions.filter(
                (p) =>
                  p.inventory.openQuantity.value === null ||
                  !decimalValue(p.inventory.longQuantity.value ?? '0').isZero() ||
                  !decimalValue(p.inventory.shortQuantity.value ?? '0').isZero(),
              );
              refs.push(
                ...v.priceDependencies.map((p) => p.id),
                ...v.fxDependencies.flatMap((f) =>
                  f.selection.state === 'available' ? f.selection.value.observationIds : [],
                ),
              );
              if (limit.kind === 'positions') {
                if (active.some((p) => p.inventory.openQuantity.value === null))
                  fact = unknownFact('count', null, 'unknown_actual_position_quantity', refs);
                else
                  fact = knownFact(
                    String(
                      active.length +
                        (input.proposal &&
                        !active.some((p) => p.instrumentId === proposalInstrument?.instrumentId)
                          ? 1
                          : 0),
                    ),
                    'count',
                    null,
                    refs,
                  );
              } else if (limit.kind === 'prohibited') {
                const instruments = [];
                for (const p of active)
                  instruments.push(
                    await requireInstrumentVersion(
                      tx,
                      context.workspaceId,
                      p.instrumentVersionId,
                      false,
                    ),
                  );
                if (proposalInstrument) instruments.push(proposalInstrument);
                const forbidden = instruments.filter(
                  (i) =>
                    limit.instrumentIds.includes(i.instrumentId) ||
                    limit.families.includes(i.family) ||
                    limit.subtypes.includes(i.subtype),
                );
                refs.push(...instruments.map((i) => i.id));
                fact = forbidden.length
                  ? knownFact('1', 'boolean', null, [
                      ...refs,
                      ...forbidden.map((i) => `prohibited:${i.instrumentId}`),
                    ])
                  : active.some((p) => p.inventory.openQuantity.value === null)
                    ? unknownFact('boolean', null, 'unknown_position_eligibility', refs)
                    : knownFact('0', 'boolean', null, refs);
              } else if (limit.kind === 'overnight') {
                const crossings: (boolean | null)[] = [];
                for (const p of active) {
                  if (p.inventory.status !== 'available') crossings.push(null);
                  for (const lot of p.inventory.lots.filter(
                    (l) => !decimalValue(l.remainingQuantity).isZero(),
                  ))
                    crossings.push(
                      lot.transferId || lot.economicOrder.instant === null
                        ? null
                        : riskCrossesBoundary(
                            lot.economicOrder.instant,
                            input.asOf,
                            limit.timezone,
                            limit.boundaryHour,
                          ),
                    );
                }
                if (input.proposal)
                  crossings.push(
                    input.proposal.intendedExitAt
                      ? riskCrossesBoundary(
                          input.asOf,
                          input.proposal.intendedExitAt,
                          limit.timezone,
                          limit.boundaryHour,
                        )
                      : null,
                  );
                fact = crossings.includes(true)
                  ? knownFact('1', 'boolean', null, refs)
                  : crossings.includes(null)
                    ? unknownFact(
                        'boolean',
                        null,
                        'missing_position_session_or_proposed_exit_evidence',
                        refs,
                      )
                    : knownFact('0', 'boolean', null, refs);
              } else {
                const amounts = new Map<string, ReturnType<typeof decimalValue>>();
                let missing = false;
                for (const p of active) {
                  const amount = p.valuation.reportingMarkedValue;
                  if (amount.status !== 'available' || amount.value === null) missing = true;
                  else
                    amounts.set(
                      p.instrumentId,
                      (amounts.get(p.instrumentId) ?? decimalValue('0')).plus(amount.value),
                    );
                }
                if (input.proposal && proposalInstrument) {
                  if (
                    proposalInstrument.capability !== 'native-linear' ||
                    proposalInstrument.quoteCurrencyId === null ||
                    proposalInstrument.multiplier === null ||
                    input.proposal.entry === null
                  )
                    missing = true;
                  else {
                    const rate = await fx(
                      tx,
                      context,
                      proposalInstrument.quoteCurrencyId,
                      currency,
                      input.asOf,
                      d,
                    );
                    refs.push(...rate.references);
                    if (rate.rate === null) missing = true;
                    else
                      amounts.set(
                        proposalInstrument.instrumentId,
                        (amounts.get(proposalInstrument.instrumentId) ?? decimalValue('0')).plus(
                          decimalValue(input.proposal.quantity)
                            .times(input.proposal.entry)
                            .times(proposalInstrument.multiplier)
                            .times(rate.rate)
                            .times(input.proposal.side === 'long' ? '1' : '-1'),
                        ),
                      );
                  }
                }
                if (missing)
                  fact = unknownFact(
                    unit,
                    unit === 'money' ? currency : null,
                    'complete_supported_position_and_proposal_exposure_required',
                    refs,
                  );
                else {
                  const values = [...amounts.values()];
                  let amount =
                    limit.kind === 'concentration'
                      ? limit.instrumentId
                        ? (amounts.get(limit.instrumentId) ?? decimalValue('0')).abs()
                        : values.reduce((m, a) => (a.abs().gt(m) ? a.abs() : m), decimalValue('0'))
                      : limit.measure === 'gross'
                        ? values.reduce((sum, a) => sum.plus(a.abs()), decimalValue('0'))
                        : values.reduce((sum, a) => sum.plus(a), decimalValue('0')).abs();
                  if (unit === 'ratio') {
                    const report = await capital(currency, d);
                    const equity = report.closing.equity;
                    refs.push(...report.dependencies.sourceIds);
                    if (
                      equity.state !== 'available' ||
                      equity.value === null ||
                      !decimalValue(equity.value).gt(0)
                    ) {
                      fact = unknownFact(
                        unit,
                        null,
                        'complete_positive_equity_required_for_exposure_ratio',
                        refs,
                      );
                      results.push(assessRiskLimit(policy.id, limit, fact));
                      continue;
                    }
                    amount = amount.div(equity.value);
                  }
                  fact = knownFact(
                    quantizeDecimal(amount),
                    unit,
                    unit === 'money' ? currency : null,
                    refs,
                  );
                }
              }
            }
          } catch (error) {
            if (!(error instanceof ApplicationError) || ![409, 422].includes(error.status))
              throw error;
            fact = unknownFact(
              unit,
              unit === 'money' ? currency : null,
              `evidence_unavailable:${error.code}`,
              refs,
            );
          }
          results.push(assessRiskLimit(policy.id, limit, fact));
        }
      const id = randomUUID();
      const result = riskAssessmentResponseSchema.parse({
        id,
        accountId: input.accountId,
        strategyVersionId: input.strategyVersionId,
        asOf: canonicalFinancialInstant(input.asOf),
        createdAt: state!.at,
        actorId: context.actorId,
        sourceRevision: String(state!.revision),
        definitionVersion: 'risk-assessment/1',
        state: riskAssessmentState(results),
        policies: applied,
        results,
        proposal: input.proposal,
      });
      await tx.execute(
        sql`INSERT INTO app.risk_assessments(workspace_id,id,account_id,source_revision,as_of,result) VALUES(${context.workspaceId},${id},${input.accountId},${state!.revision},${input.asOf}::timestamptz,${JSON.stringify(result)}::jsonb)`,
      );
      for (const policy of applied)
        await tx.execute(
          sql`INSERT INTO app.risk_assessment_policies(workspace_id,assessment_id,policy_version_id) VALUES(${context.workspaceId},${id},${policy.id})`,
        );
      return result;
    });
  }
  async function assessment(context: AuthorizationContext, id: string) {
    financialIdSchema.parse(id);
    return platform.withWorkspaceContext(context, async (tx) => {
      const [row] = await queryRows<{ result: unknown }>(
        tx,
        sql`SELECT result FROM app.risk_assessments WHERE workspace_id=${context.workspaceId} AND id=${id}`,
      );
      if (!row) throw inaccessible();
      return riskAssessmentResponseSchema.parse(row.result);
    });
  }
  async function size(context: AuthorizationContext, value: RiskSizingRequest) {
    const input = riskSizingRequestSchema.parse(value);
    return platform.withWorkspaceContext(context, async (tx) => {
      const account = await requireAccount(
        tx,
        context.workspaceId,
        input.accountId,
        false,
        input.asOf,
      );
      const instrument = await requireInstrumentVersion(
        tx,
        context.workspaceId,
        input.instrumentVersionId,
        false,
      );
      await requireCurrency(tx, context.workspaceId, input.currencyId, false);
      const references = [account.settingsId, instrument.id];
      const base = {
        budget: input.budget,
        currencyId: input.currencyId,
        mode: input.mode,
        definitionVersion: 'planned-stop-risk/1' as const,
        references,
        warning:
          'Planned stop risk does not guarantee the realized loss. This calculation neither places a trade nor changes original committed risk.',
      };
      const unknown = (reason: string) =>
        riskSizingResponseSchema.parse({
          ...base,
          state: 'unknown',
          quantity: null,
          plannedRisk: null,
          riskPerUnit: null,
          reasons: [reason],
        });
      if (financialInstantMicros(instrument.effectiveAt) > financialInstantMicros(input.asOf))
        return unknown('instrument_convention_not_effective');
      if (input.mode === 'manual') {
        if (!input.manualRisk || !input.manualQuantity || !input.method)
          return unknown('explicit_manual_risk_quantity_and_scenario_method_required');
        return riskSizingResponseSchema.parse({
          ...base,
          state: 'available',
          quantity: input.manualQuantity,
          plannedRisk: input.manualRisk,
          riskPerUnit: null,
          reasons: decimalValue(input.manualRisk).gt(input.budget)
            ? ['manual_scenario_exceeds_budget']
            : [],
          references: [...references, `manual-scenario:${input.method}`],
        });
      }
      const native =
        instrument.capability === 'native-linear' &&
        ['ordinary-share', 'ordinary-etf', 'non-rebasing-spot'].includes(instrument.subtype) &&
        account.holdingMode === 'netted';
      if (
        !native ||
        !instrument.multiplier ||
        !instrument.quantityIncrement ||
        !instrument.quoteCurrencyId ||
        instrument.quoteCurrencyId !== instrument.settlementCurrencyId
      )
        return unknown('unsupported_linear_sizing_use_explicit_manual_risk');
      if (
        input.side === 'short' &&
        (!account.allowShort ||
          !supportsNativeShortInventory(instrument.family, instrument.metadata))
      )
        return unknown('short_convention_not_validated_for_this_account_and_instrument');
      if (!input.entry || !input.stop) return unknown('entry_and_adverse_stop_required');
      let rate = '1';
      if (instrument.quoteCurrencyId !== input.currencyId) {
        if (!input.fxObservationId) return unknown('select_an_explicit_planning_fx_observation');
        const [row] = await queryRows<{
          base_currency_id: string;
          quote_currency_id: string;
          rate_raw: string;
          observed_at: string;
        }>(
          tx,
          sql`SELECT o.base_currency_id,o.quote_currency_id,o.rate_raw,${instantSql('o.observed_at')} AS observed_at FROM app.fx_observations o WHERE o.workspace_id=${context.workspaceId} AND o.id=${input.fxObservationId} AND NOT EXISTS(SELECT 1 FROM app.fx_observations n WHERE n.workspace_id=o.workspace_id AND n.supersedes_id=o.id)`,
        );
        if (!row) throw inaccessible();
        const age = financialInstantMicros(input.asOf) - financialInstantMicros(row.observed_at);
        if (age < 0n || age > BigInt(input.maxAgeMilliseconds) * 1000n)
          return unknown('planning_fx_missing_stale_or_from_future');
        if (
          row.base_currency_id === instrument.quoteCurrencyId &&
          row.quote_currency_id === input.currencyId
        )
          rate = row.rate_raw;
        else if (
          row.quote_currency_id === instrument.quoteCurrencyId &&
          row.base_currency_id === input.currencyId
        )
          rate = quantizeDecimal(decimalValue('1').div(row.rate_raw));
        else return unknown('planning_fx_has_incompatible_currency_pair');
        references.push(input.fxObservationId);
      }
      return riskSizingResponseSchema.parse({
        ...base,
        ...sizeLinearRisk({
          nativeLinear: native,
          side: input.side,
          entry: input.entry,
          stop: input.stop,
          multiplier: instrument.multiplier,
          quantityIncrement: instrument.quantityIncrement,
          quoteToRiskRate: rate,
          budget: input.budget,
          fixedCosts: input.fixedCosts,
          perUnitCosts: input.perUnitCosts,
          currencyId: input.currencyId,
        }),
      });
    });
  }
  return { savePolicy, policies, assess, assessment, size };
}
