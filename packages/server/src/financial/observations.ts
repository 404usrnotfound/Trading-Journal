import { randomUUID } from 'node:crypto';
import { sql } from '@journal/database';
import {
  calculateNav,
  decimal,
  decimalValue,
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
const nonnegativeDecimal = z.unknown().transform((value, context) => {
  try {
    const canonical = decimal(value);
    if (decimalValue(canonical).isNegative()) throw new Error('Nonnegative decimal required');
    return canonical;
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'A nonnegative representable decimal is required',
    });
    return z.NEVER;
  }
});
const priceInput = z.strictObject({
  commandId: financialUuid,
  instrumentVersionId: financialUuid,
  currencyId: financialUuid,
  price: nonnegativeDecimal,
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
          sql`SELECT * FROM app.holding_books WHERE workspace_id=${context.workspaceId}::uuid AND account_id=ANY(${accountIdArray}::uuid[]) ORDER BY account_id,instrument_id LIMIT 1001`,
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
            price_raw: string;
            observed_at: string;
            source: string;
          }>(
            tx,
            sql`SELECT o.id,o.price_raw,to_char(o.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at,o.source FROM app.price_observations o
          WHERE o.workspace_id=${context.workspaceId}::uuid AND o.instrument_version_id=${book.instrument_version_id}::uuid AND o.observed_at<=${asOf}::timestamptz
            AND NOT EXISTS (SELECT 1 FROM app.price_observations newer WHERE newer.workspace_id=o.workspace_id AND newer.supersedes_id=o.id)
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
          if (selected)
            priceDependencies.push({
              ...selected,
              instrumentVersionId: book.instrument_version_id,
            });
          const rate: FxRateSelection =
            instrument.settlementCurrencyId === null
              ? {
                  state: 'unavailable',
                  reasons: ['incompatible_currency'],
                  missingReferences: [`${book.instrument_version_id}:settlement-currency`],
                }
              : selectFxRate(
                  instrument.settlementCurrencyId,
                  reportingCurrencyId,
                  asOf,
                  input.fxPolicy,
                  fxObservations,
                );
          const valuation = valueInventory(inventory, {
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
            ...(rate.state === 'available' && instrument.settlementCurrencyId !== null
              ? {
                  markReportingFx: {
                    observationId:
                      rate.value.observationIds.join(',') || `identity:${reportingCurrencyId}`,
                    rate: rate.value.rate,
                    baseCurrencyId: instrument.settlementCurrencyId,
                    quoteCurrencyId: reportingCurrencyId,
                  },
                }
              : {}),
          });
          positions.push({
            id: book.id,
            accountId: book.account_id,
            instrumentId: book.instrument_id,
            instrumentVersionId: book.instrument_version_id,
            sourceRevision,
            inventory,
            valuation,
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
            currencyId: instrument.settlementCurrencyId,
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
