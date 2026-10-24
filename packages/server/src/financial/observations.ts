import { randomUUID } from 'node:crypto';
import { sql } from '@journal/database';
import {
  calculateNav,
  decimal,
  decimalValue,
  translateAmount,
  instantNanoseconds,
  selectFxRate,
  valueInventory,
  type FinancialUnavailableReason,
  type FxObservation,
  type FxRateSelection,
  type FxSelectionPolicy,
  type InventoryReplayResult,
  type NavComponent,
} from '@journal/domain';
import { z } from 'zod';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import {
  executeFinancialCommand,
  financialConflict,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from './repository.js';
import {
  financialInstantMicros,
  financialLabel,
  financialPositiveDecimal,
  financialTimestamp,
  financialUuid,
  requireAccount,
  requireCurrency,
  requireInstrumentVersion,
} from './reference-data.js';
import { replayBookAt } from './ledger.js';
import { compatiblePriceConventions } from './price-conventions.js';
import {
  choosePositionComponent,
  componentReference,
  selectComponents,
} from '../supplied/selection.js';

const fxInput = z.strictObject({
  commandId: financialUuid,
  baseCurrencyId: financialUuid,
  quoteCurrencyId: financialUuid,
  rate: financialPositiveDecimal,
  observedAt: financialTimestamp,
  source: financialLabel,
  supersedesId: financialUuid.optional(),
  reason: financialLabel.optional(),
});
const signedDecimal = z.unknown().transform((value, context) => {
  try {
    return decimal(value);
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'A signed representable decimal string is required',
    });
    return z.NEVER;
  }
});
const priceInput = z.strictObject({
  commandId: financialUuid,
  instrumentVersionId: financialUuid,
  currencyId: financialUuid,
  price: signedDecimal,
  observedAt: financialTimestamp,
  source: financialLabel,
  supersedesId: financialUuid.optional(),
  reason: financialLabel.optional(),
});
const accountValuationInput = z.strictObject({
  commandId: financialUuid,
  accountId: financialUuid,
  currencyId: financialUuid,
  amount: signedDecimal,
  observedAt: financialTimestamp,
  definition: financialLabel,
  source: financialLabel,
  supersedesId: financialUuid.optional(),
  reason: financialLabel.optional(),
});
const sourcePriority = financialLabel
  .array()
  .min(1)
  .max(64)
  .refine(
    (values) => new Set(values).size === values.length,
    'Each source priority must be unique',
  );
const maxAgeMilliseconds = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const valuationInput = z.strictObject({
  suppliedPositionIds: financialUuid.array().max(100).optional(),
  accountIds: financialUuid
    .array()
    .min(1)
    .max(100)
    .refine((values) => new Set(values).size === values.length, 'Select each account once'),
  reportingCurrencyId: financialUuid,
  asOf: financialTimestamp,
  fxPolicy: z.strictObject({ id: financialLabel, maxAgeMilliseconds, sourcePriority }),
  priceMaxAgeMilliseconds: maxAgeMilliseconds,
  priceSourcePriority: sourcePriority,
});
export type RecordFxObservationInput = z.input<typeof fxInput>;
export type RecordPriceObservationInput = z.input<typeof priceInput>;
export type RecordAccountValuationObservationInput = z.input<typeof accountValuationInput>;
export type AccountValuationObservationQuery = Readonly<{
  accountId?: string;
  asOf?: string;
  includeSuperseded?: boolean;
  limit?: number;
}>;
export type FinancialValuationQuery = Readonly<{
  suppliedPositionIds?: readonly string[];
  accountIds: readonly string[];
  reportingCurrencyId: string;
  asOf: string;
  fxPolicy: FxSelectionPolicy;
  priceMaxAgeMilliseconds: number;
  priceSourcePriority: readonly string[];
}>;

/** Normalize only the calendar/offset; preserve PostgreSQL's six fractional digits. */
export function canonicalFinancialInstant(input: string): string {
  const micros = financialInstantMicros(input);
  const wholeSeconds = (micros - (((micros % 1_000_000n) + 1_000_000n) % 1_000_000n)) / 1_000_000n;
  const fraction = micros - wholeSeconds * 1_000_000n;
  return `${new Date(Number(wholeSeconds * 1_000n)).toISOString().slice(0, 19)}.${fraction.toString().padStart(6, '0')}Z`;
}

export function createFinancialObservations(platform: FinancialPlatform) {
  async function recordFxObservation(
    context: AuthorizationContext,
    input: RecordFxObservationInput,
  ) {
    const body = fxInput.parse(input);
    const payload = { ...body, sourceInput: input };
    if (body.baseCurrencyId === body.quoteCurrencyId)
      throw financialInvalid('An FX observation requires two different monetary units.');
    if (body.supersedesId && !body.reason)
      throw financialInvalid('An observation correction requires a reason.');
    return executeFinancialCommand(
      platform,
      context,
      { commandId: body.commandId, kind: 'fx-observation', payload },
      async (tx, state) => {
        await requireCurrency(tx, context.workspaceId, body.baseCurrencyId, false);
        await requireCurrency(tx, context.workspaceId, body.quoteCurrencyId, false);
        if (body.supersedesId) {
          const [original] = await queryRows<{
            base_currency_id: string;
            quote_currency_id: string;
          }>(
            tx,
            sql`SELECT base_currency_id,quote_currency_id FROM app.fx_observations WHERE workspace_id=${context.workspaceId}::uuid AND id=${body.supersedesId}::uuid`,
          );
          if (!original) throw inaccessible();
          if (
            original.base_currency_id !== body.baseCurrencyId ||
            original.quote_currency_id !== body.quoteCurrencyId
          )
            throw financialInvalid('A correction must retain the same currency pair direction.');
          const [newer] = await queryRows<{ id: string }>(
            tx,
            sql`SELECT id FROM app.fx_observations WHERE workspace_id=${context.workspaceId}::uuid AND supersedes_id=${body.supersedesId}::uuid`,
          );
          if (newer)
            throw financialConflict(
              'OBSERVATION_ALREADY_SUPERSEDED',
              'Correct the current observation rather than creating competing replacement branches.',
            );
        }
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.fx_observations (workspace_id,id,base_currency_id,quote_currency_id,rate_raw,observed_at,source,supersedes_id,payload)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${body.baseCurrencyId}::uuid,${body.quoteCurrencyId}::uuid,${body.rate},${body.observedAt}::timestamptz,${body.source},${body.supersedesId ?? null}::uuid,${JSON.stringify({ ...payload, sourceRevision: state.revision })}::jsonb)`);
        return { id, commandId: body.commandId, sourceRevision: state.revision };
      },
    );
  }

  async function recordPriceObservation(
    context: AuthorizationContext,
    input: RecordPriceObservationInput,
  ) {
    const body = priceInput.parse(input);
    const payload = { ...body, sourceInput: input };
    if (body.supersedesId && !body.reason)
      throw financialInvalid('An observation correction requires a reason.');
    return executeFinancialCommand(
      platform,
      context,
      { commandId: body.commandId, kind: 'price-observation', payload },
      async (tx, state) => {
        const instrument = await requireInstrumentVersion(
          tx,
          context.workspaceId,
          body.instrumentVersionId,
          false,
        );
        if (
          financialInstantMicros(body.observedAt) < financialInstantMicros(instrument.effectiveAt)
        )
          throw financialInvalid(
            'The instrument convention is not effective at the observation instant.',
          );
        if (instrument.capability !== 'manual' && decimalValue(body.price).isNegative())
          throw financialInvalid('Automatic delivered-instrument marks cannot be negative.');
        await requireCurrency(tx, context.workspaceId, body.currencyId, false);
        if (instrument.quoteCurrencyId === null)
          throw financialInvalid(
            'A price observation requires a published quote currency convention.',
          );
        if (instrument.quoteCurrencyId !== body.currencyId)
          throw financialInvalid('The observation must use the published quote currency.');
        if (body.supersedesId) {
          const [original] = await queryRows<{
            instrument_version_id: string;
            currency_id: string;
          }>(
            tx,
            sql`SELECT instrument_version_id,currency_id FROM app.price_observations WHERE workspace_id=${context.workspaceId}::uuid AND id=${body.supersedesId}::uuid`,
          );
          if (!original) throw inaccessible();
          if (
            original.instrument_version_id !== body.instrumentVersionId ||
            original.currency_id !== body.currencyId
          )
            throw financialInvalid(
              'A correction must retain the same instrument convention and currency.',
            );
          const [newer] = await queryRows<{ id: string }>(
            tx,
            sql`SELECT id FROM app.price_observations WHERE workspace_id=${context.workspaceId}::uuid AND supersedes_id=${body.supersedesId}::uuid`,
          );
          if (newer)
            throw financialConflict(
              'OBSERVATION_ALREADY_SUPERSEDED',
              'Correct the current observation rather than creating competing replacement branches.',
            );
        }
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.price_observations (workspace_id,id,instrument_version_id,currency_id,price_raw,observed_at,source,supersedes_id,payload)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${body.instrumentVersionId}::uuid,${body.currencyId}::uuid,${body.price},${body.observedAt}::timestamptz,${body.source},${body.supersedesId ?? null}::uuid,${JSON.stringify({ ...payload, sourceRevision: state.revision })}::jsonb)`);
        return { id, commandId: body.commandId, sourceRevision: state.revision };
      },
    );
  }

  /** Broker/manual totals retain their stated definition; they never override internal cash or NAV. */
  async function recordAccountValuationObservation(
    context: AuthorizationContext,
    input: RecordAccountValuationObservationInput,
  ) {
    const body = accountValuationInput.parse(input);
    const payload = { ...body, sourceInput: input };
    if (body.supersedesId && !body.reason)
      throw financialInvalid('An observation correction requires a reason.');
    return executeFinancialCommand(
      platform,
      context,
      { commandId: body.commandId, kind: 'account-valuation-observation', payload },
      async (tx, state) => {
        await requireAccount(tx, context.workspaceId, body.accountId, false, body.observedAt);
        await requireCurrency(tx, context.workspaceId, body.currencyId, false);
        if (body.supersedesId) {
          const [original] = await queryRows<{
            account_id: string;
            currency_id: string;
            definition: string;
          }>(
            tx,
            sql`SELECT account_id,currency_id,definition FROM app.account_valuation_observations WHERE workspace_id=${context.workspaceId}::uuid AND id=${body.supersedesId}::uuid`,
          );
          if (!original) throw inaccessible();
          if (
            original.account_id !== body.accountId ||
            original.currency_id !== body.currencyId ||
            original.definition !== body.definition
          )
            throw financialInvalid(
              'A correction must retain the same account, currency and stated valuation definition.',
            );
          const [newer] = await queryRows<{ id: string }>(
            tx,
            sql`SELECT id FROM app.account_valuation_observations WHERE workspace_id=${context.workspaceId}::uuid AND supersedes_id=${body.supersedesId}::uuid`,
          );
          if (newer)
            throw financialConflict(
              'OBSERVATION_ALREADY_SUPERSEDED',
              'Correct the current observation rather than creating competing replacement branches.',
            );
        }
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO app.account_valuation_observations (workspace_id,id,account_id,currency_id,amount_raw,observed_at,definition,source,supersedes_id,payload)
        VALUES (${context.workspaceId}::uuid,${id}::uuid,${body.accountId}::uuid,${body.currencyId}::uuid,${body.amount},${body.observedAt}::timestamptz,${body.definition},${body.source},${body.supersedesId ?? null}::uuid,${JSON.stringify({ ...payload, sourceRevision: state.revision })}::jsonb)`);
        return { id, commandId: body.commandId, sourceRevision: state.revision };
      },
    );
  }

  async function accountValuationObservations(
    context: AuthorizationContext,
    query: AccountValuationObservationQuery = {},
  ) {
    const input = z
      .strictObject({
        accountId: financialUuid.optional(),
        asOf: financialTimestamp.optional(),
        includeSuperseded: z.boolean().default(false),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(query);
    return platform.withWorkspaceContext(context, async (tx) => {
      if (input.accountId)
        await requireAccount(tx, context.workspaceId, input.accountId, false, input.asOf);
      const rows = await queryRows<{
        id: string;
        account_id: string;
        currency_id: string;
        amount_raw: string;
        observed_at: string;
        definition: string;
        source: string;
        supersedes_id: string | null;
        actor_id: string;
        origin: string;
        created_at: string;
        payload: Record<string, unknown>;
      }>(
        tx,
        sql`SELECT o.id,o.account_id,o.currency_id,o.amount_raw,to_char(o.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at,o.definition,o.source,o.supersedes_id,o.actor_id,o.origin,to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,o.payload
        FROM app.account_valuation_observations o WHERE o.workspace_id=${context.workspaceId}::uuid
          AND (${input.accountId ?? null}::uuid IS NULL OR o.account_id=${input.accountId ?? null}::uuid)
          AND (${input.asOf ?? null}::timestamptz IS NULL OR o.observed_at<=${input.asOf ?? null}::timestamptz)
          AND (${input.includeSuperseded} OR NOT EXISTS (SELECT 1 FROM app.account_valuation_observations newer WHERE newer.workspace_id=o.workspace_id AND newer.supersedes_id=o.id))
        ORDER BY o.observed_at DESC,o.id LIMIT ${input.limit}`,
      );
      return rows.map((row) => ({
        id: row.id,
        accountId: row.account_id,
        currencyId: row.currency_id,
        amount: row.amount_raw,
        observedAt: row.observed_at,
        definition: row.definition,
        source: row.source,
        supersedesId: row.supersedes_id,
        actorId: row.actor_id,
        origin: row.origin,
        recordedAt: row.created_at,
        payload: row.payload,
      }));
    });
  }

  async function valuation(context: AuthorizationContext, query: FinancialValuationQuery) {
    const input = valuationInput.parse(query);
    const asOf = canonicalFinancialInstant(input.asOf);
    const { accountIds, reportingCurrencyId } = input;
    // Drizzle expands interpolated JavaScript arrays as SQL lists. Bind one PostgreSQL
    // array value; every element has already passed UUID validation above.
    const accountIdArray = `{${accountIds.join(',')}}`;
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        // Read-only repeatable read pins revision, facts, policies and mutable projections together.
        // It also permits viewers without granting them row-locking UPDATE visibility.
        const [state] = await queryRows<{ revision: number }>(
          tx,
          sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}::uuid`,
        );
        await requireCurrency(tx, context.workspaceId, reportingCurrencyId, false);
        const accounts = [];
        for (const id of [...accountIds].sort())
          accounts.push(await requireAccount(tx, context.workspaceId, id, false, asOf));
        if (new Set(accounts.map((account) => account.environment)).size !== 1)
          throw financialInvalid('Live and paper accounts require separate valuation populations.');
        const sourceRevision = String(state?.revision ?? 0);
        const supplied = await selectComponents(
          tx,
          context,
          input.suppliedPositionIds,
          sourceRevision,
          'position-equity',
        );
        if (
          supplied.some((item) => item.accountId === null || !accountIds.includes(item.accountId))
        )
          throw financialInvalid(
            'Supplied position selections must belong to the selected accounts.',
          );
        const fxRows = await queryRows<{
          id: string;
          base_currency_id: string;
          quote_currency_id: string;
          rate_raw: string;
          observed_at: string;
          source: string;
        }>(
          tx,
          sql`SELECT o.id,o.base_currency_id,o.quote_currency_id,o.rate_raw,to_char(o.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at,o.source
        FROM app.fx_observations o WHERE o.workspace_id=${context.workspaceId}::uuid AND o.observed_at<=${asOf}::timestamptz
          AND NOT EXISTS (SELECT 1 FROM app.fx_observations newer WHERE newer.workspace_id=o.workspace_id AND newer.supersedes_id=o.id)
        ORDER BY o.observed_at,o.id LIMIT 10001`,
        );
        if (fxRows.length > 10000)
          throw financialConflict(
            'VALUATION_SCOPE_TOO_LARGE',
            'Narrow or archive the observation population before calculating this view.',
          );
        const fxObservations: FxObservation[] = fxRows.map((row) => ({
          id: row.id,
          baseCurrencyId: row.base_currency_id,
          quoteCurrencyId: row.quote_currency_id,
          rate: row.rate_raw,
          observedAt: row.observed_at,
          source: row.source,
        }));
        const cash = await queryRows<{
          id: string;
          account_id: string;
          currency_id: string;
          category: string;
          amount: string;
        }>(
          tx,
          sql`SELECT b.id,b.account_id,b.currency_id,b.category,COALESCE(sum(p.amount) FILTER (WHERE e.economic_at<=${asOf}::timestamptz),0)::text AS amount
        FROM app.cash_buckets b LEFT JOIN app.postings p ON p.workspace_id=b.workspace_id AND p.cash_bucket_id=b.id
        LEFT JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
        WHERE b.workspace_id=${context.workspaceId}::uuid AND b.account_id=ANY(${accountIdArray}::uuid[])
        GROUP BY b.id,b.account_id,b.currency_id,b.category ORDER BY b.account_id,b.currency_id,b.id`,
        );
        const books = await queryRows<{
          id: string;
          account_id: string;
          instrument_id: string;
          instrument_version_id: string;
          state: InventoryReplayResult;
          source_revision: number;
        }>(
          tx,
          sql`SELECT b.*,COALESCE(latest.instrument_version_id,b.instrument_version_id) AS instrument_version_id
          FROM app.holding_books b
          LEFT JOIN LATERAL (
            SELECT source.instrument_version_id FROM (
              SELECT e.instrument_version_id,e.economic_at,e.source_revision FROM app.executions e
              WHERE e.workspace_id=b.workspace_id AND e.account_id=b.account_id
                AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions s
                  WHERE s.workspace_id=e.workspace_id AND s.original_execution_id=e.id
                    AND s.source_revision<=${sourceRevision}::integer)
              UNION ALL SELECT o.instrument_version_id,o.economic_at,o.source_revision FROM app.opening_lots o
              WHERE o.workspace_id=b.workspace_id AND o.account_id=b.account_id
              UNION ALL SELECT t.instrument_version_id,t.economic_at,t.source_revision FROM app.holding_transfers t
              WHERE t.workspace_id=b.workspace_id AND (t.source_account_id=b.account_id OR t.destination_account_id=b.account_id)
            ) source JOIN app.instrument_versions v ON v.workspace_id=b.workspace_id AND v.id=source.instrument_version_id
            WHERE v.instrument_id=b.instrument_id AND source.source_revision<=${sourceRevision}::integer
              AND source.economic_at<=${asOf}::timestamptz
            ORDER BY source.economic_at DESC,source.source_revision DESC,v.version DESC LIMIT 1
          ) latest ON true
          WHERE b.workspace_id=${context.workspaceId}::uuid AND b.account_id=ANY(${accountIdArray}::uuid[])
          ORDER BY b.account_id,b.instrument_id LIMIT 1001`,
        );
        if (books.length > 1000)
          throw financialConflict(
            'VALUATION_SCOPE_TOO_LARGE',
            'Select fewer accounts for this valuation.',
          );
        const components: NavComponent[] = cash.map((row) => ({
          id: row.id,
          kind: 'cash',
          currencyId: row.currency_id,
          amount: decimal(row.amount),
          rate: selectFxRate(
            row.currency_id,
            reportingCurrencyId,
            asOf,
            input.fxPolicy,
            fxObservations,
          ),
        }));
        const transit = await queryRows<{ id: string; currency_id: string; amount_raw: string }>(
          tx,
          sql`SELECT t.id,t.currency_id,t.amount_raw FROM app.cash_transfers t
          LEFT JOIN app.cash_transfer_receipts r ON r.workspace_id=t.workspace_id AND r.transfer_id=t.id
          WHERE t.workspace_id=${context.workspaceId}::uuid
            AND t.source_account_id=ANY(${accountIdArray}::uuid[])
            AND t.destination_account_id=ANY(${accountIdArray}::uuid[])
            AND t.economic_at<=${asOf}::timestamptz AND t.source_revision<=${sourceRevision}::integer
            AND NOT EXISTS (SELECT 1 FROM app.ledger_events e JOIN app.ledger_events reversed
              ON reversed.workspace_id=e.workspace_id AND reversed.reversal_of_id=e.id
              WHERE e.workspace_id=t.workspace_id AND e.cash_transfer_id=t.id
                AND reversed.source_revision<=${sourceRevision}::integer)
            AND (r.id IS NULL OR r.economic_at>${asOf}::timestamptz OR r.source_revision>${sourceRevision}::integer)
          ORDER BY t.id LIMIT 10001`,
        );
        if (transit.length > 10000)
          throw financialConflict(
            'VALUATION_SCOPE_TOO_LARGE',
            'Select fewer accounts for this transit valuation.',
          );
        for (const transfer of transit)
          components.push({
            id: transfer.id,
            kind: 'asset',
            currencyId: transfer.currency_id,
            amount: decimal(transfer.amount_raw),
            rate: selectFxRate(
              transfer.currency_id,
              reportingCurrencyId,
              asOf,
              input.fxPolicy,
              fxObservations,
            ),
          });
        const positions = [];
        const priceDependencies = [];
        const fxDependencies = components.map((component) => ({
          componentId: component.id,
          selection: component.rate,
        }));
        for (const book of books) {
          const instrument = await requireInstrumentVersion(
            tx,
            context.workspaceId,
            book.instrument_version_id,
            false,
          );
          const inventory = await replayBookAt(
            tx,
            context,
            { accountId: book.account_id, instrumentVersionId: book.instrument_version_id },
            asOf,
            sourceRevision,
          );
          const marks = await queryRows<{
            id: string;
            instrument_version_id: string;
            price_raw: string;
            observed_at: string;
            source: string;
          }>(
            tx,
            sql`SELECT o.id,o.instrument_version_id,o.price_raw,to_char(o.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at,o.source
          FROM app.price_observations o
          JOIN app.instrument_versions candidate ON candidate.workspace_id=o.workspace_id AND candidate.id=o.instrument_version_id
          JOIN app.instrument_versions reference ON reference.workspace_id=o.workspace_id AND reference.id=${book.instrument_version_id}::uuid
          WHERE o.workspace_id=${context.workspaceId}::uuid AND ${compatiblePriceConventions('candidate', 'reference')}
            AND candidate.effective_at<=${asOf}::timestamptz AND o.observed_at<=${asOf}::timestamptz
            AND COALESCE((o.payload->>'sourceRevision')::numeric,0)<=${sourceRevision}::integer
            AND NOT EXISTS (SELECT 1 FROM app.price_observations newer
              WHERE newer.workspace_id=o.workspace_id AND newer.supersedes_id=o.id
                AND COALESCE((newer.payload->>'sourceRevision')::numeric,0)<=${sourceRevision}::integer)
          ORDER BY o.observed_at DESC,o.id LIMIT 10001`,
          );
          if (marks.length > 10000)
            throw financialConflict(
              'VALUATION_SCOPE_TOO_LARGE',
              'Narrow the selected instrument observation population.',
            );
          const eligible = marks.filter(
            (mark) =>
              input.priceSourcePriority.includes(mark.source) &&
              instantNanoseconds(asOf) - instantNanoseconds(mark.observed_at) <=
                BigInt(input.priceMaxAgeMilliseconds) * 1_000_000n,
          );
          eligible.sort(
            (a, b) =>
              input.priceSourcePriority.indexOf(a.source) -
                input.priceSourcePriority.indexOf(b.source) ||
              (instantNanoseconds(a.observed_at) === instantNanoseconds(b.observed_at)
                ? a.id.localeCompare(b.id)
                : instantNanoseconds(a.observed_at) > instantNanoseconds(b.observed_at)
                  ? -1
                  : 1),
          );
          const selected = eligible[0];
          const suppliedValue = choosePositionComponent(supplied, {
            accountId: book.account_id,
            instrumentId: book.instrument_id,
            inventory,
            capability: instrument.capability,
            asOf,
            maxAgeMilliseconds: input.priceMaxAgeMilliseconds,
          });
          if (selected && !suppliedValue)
            priceDependencies.push({
              id: selected.id,
              price_raw: selected.price_raw,
              observed_at: selected.observed_at,
              source: selected.source,
              instrumentVersionId: selected.instrument_version_id,
            });
          const valueCurrency = suppliedValue?.currencyId ?? instrument.settlementCurrencyId;
          const rate: FxRateSelection =
            valueCurrency === null
              ? {
                  state: 'unavailable',
                  reasons: ['incompatible_currency'],
                  missingReferences: [`${book.instrument_version_id}:settlement-currency`],
                }
              : selectFxRate(
                  valueCurrency,
                  reportingCurrencyId,
                  asOf,
                  input.fxPolicy,
                  fxObservations,
                );
          const nativeValuation = valueInventory(inventory, {
            mark:
              selected && instrument.multiplier !== null
                ? {
                    id: selected.id,
                    price: selected.price_raw,
                    multiplier: instrument.multiplier,
                    instant: asOf,
                    eligible: true,
                  }
                : null,
            reportingCurrencyId,
            ...(!suppliedValue && rate.state === 'available' && valueCurrency !== null
              ? {
                  markReportingFx: {
                    observationId:
                      rate.value.observationIds.join(',') || `identity:${reportingCurrencyId}`,
                    rate: rate.value.rate,
                    baseCurrencyId: valueCurrency,
                    quoteCurrencyId: reportingCurrencyId,
                  },
                }
              : {}),
          });
          const suppliedReporting = suppliedValue
            ? translateAmount(
                { amount: suppliedValue.amount, currencyId: suppliedValue.currencyId },
                reportingCurrencyId,
                rate,
              )
            : null;
          const valuation = suppliedValue
            ? {
                ...nativeValuation,
                markId: suppliedValue.id,
                observationIds: [suppliedValue.id],
                markedValue: {
                  status: 'available' as const,
                  value: decimal(suppliedValue.amount),
                  currencyId: suppliedValue.currencyId,
                  reasons: [],
                },
                reportingMarkedValue:
                  suppliedReporting?.state === 'available'
                    ? {
                        status: 'available' as const,
                        value: suppliedReporting.value.amount,
                        currencyId: reportingCurrencyId,
                        reasons: [],
                      }
                    : {
                        status: 'unavailable' as const,
                        value: null,
                        currencyId: reportingCurrencyId,
                        reasons:
                          suppliedReporting?.state === 'unavailable'
                            ? suppliedReporting.reasons
                            : ['missing_fx'],
                      },
              }
            : nativeValuation;
          positions.push({
            id: book.id,
            accountId: book.account_id,
            instrumentId: book.instrument_id,
            instrumentVersionId: book.instrument_version_id,
            sourceRevision,
            inventory,
            valuation,
            ...(suppliedValue ? { suppliedValue: componentReference(suppliedValue) } : {}),
          });
          const missingReasons: readonly FinancialUnavailableReason[] =
            valuation.markedValue.status === 'unsupported'
              ? instrument.settlementCurrencyId === null
                ? ['unsupported', 'incompatible_currency']
                : ['unsupported']
              : valuation.markedValue.reasons.includes('ambiguous_chronology')
                ? ['incomplete_inventory']
                : !selected && marks.some((mark) => input.priceSourcePriority.includes(mark.source))
                  ? ['stale_mark']
                  : ['missing_mark'];
          components.push({
            id: book.id,
            kind: 'holding',
            currencyId: valueCurrency,
            ...(valuation.markedValue.status === 'available' && valuation.markedValue.value !== null
              ? { amount: valuation.markedValue.value }
              : {
                  unavailableReasons: missingReasons,
                  missingReferences: [book.instrument_version_id],
                }),
            rate,
          });
          fxDependencies.push({ componentId: book.id, selection: rate });
        }
        return {
          accountIds,
          environment: accounts[0]!.environment,
          reportingCurrencyId,
          asOf,
          sourceRevision,
          fxPolicy: input.fxPolicy,
          pricePolicy: {
            maxAgeMilliseconds: input.priceMaxAgeMilliseconds,
            sourcePriority: input.priceSourcePriority,
          },
          priceDependencies,
          fxDependencies,
          positions,
          nav: calculateNav({ reportingCurrencyId, asOf, sourceRevision, components }),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  return {
    recordFxObservation,
    recordPriceObservation,
    recordAccountValuationObservation,
    accountValuationObservations,
    valuation,
  };
}
