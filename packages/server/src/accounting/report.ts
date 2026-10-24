import { sql, type DbTransaction } from '@journal/database';
import {
  calculateAccounting,
  AccountingDetailLimitError,
  decimal,
  instantNanoseconds,
  replayInventory,
  type AccountingBook,
  type AccountingCashPosting,
  type AccountingHoldingOpening,
  type AccountingHoldingTransfer,
  type AccountingMark,
  type AccountingSuppliedValue,
  type InventoryTransferredSlice,
  type PinnedInventoryRate,
} from '@journal/domain';
import { accountingReportRequestSchema, type AccountingReportRequest } from '@journal/contracts';
import type { AuthorizationContext } from '../services.js';
import { inaccessible } from '../errors.js';
import { replayBookAt } from '../financial/ledger.js';
import { readReportFxEvidence } from '../financial/fx-evidence.js';
import {
  choosePositionComponent,
  componentReference,
  selectComponents,
} from '../supplied/selection.js';
import { canonicalFinancialInstant } from '../financial/observations.js';
import { compatiblePriceConventions } from '../financial/price-conventions.js';
import type { AccountReference, InstrumentVersionReference } from '../financial/catalog-types.js';
import {
  financialConflict,
  financialInvalid,
  queryRows,
  type FinancialPlatform,
} from '../financial/repository.js';
import {
  requireAccount,
  requireCurrency,
  requireInstrumentVersion,
  supportsNativeShortInventory,
} from '../financial/reference-data.js';

type ReportInput = AccountingReportRequest;

type PriceRow = {
  id: string;
  instrument_version_id: string;
  reference_version_ids: string[];
  convention_effective_at: string;
  price_raw: string;
  observed_at: string;
  source: string;
};
type BookRow = {
  id: string;
  account_id: string;
  instrument_id: string;
  instrument_version_id: string;
  opening_instrument_version_id: string | null;
};
type HoldingTransferRow = {
  id: string;
  source_account_id: string;
  destination_account_id: string;
  instrument_version_id: string;
  instrument_id: string;
  economic_at: string;
  payload: { receipt: { slices: InventoryTransferredSlice[] } };
};
type HoldingOpeningRow = {
  id: string;
  account_id: string;
  instrument_version_id: string;
  instrument_id: string;
  direction: 'long' | 'short';
  quantity_raw: string;
  principal_raw: string | null;
  economic_at: string;
  payload: { basisReportingFx?: PinnedInventoryRate };
};
type PostingRow = {
  id: string;
  event_id: string;
  account_id: string;
  cash_bucket_id: string;
  currency_id: string;
  amount_raw: string;
  economic_at: string;
  source_kind: string;
  reporting_fx: PinnedInventoryRate | null;
  source_account_id: string | null;
  destination_account_id: string | null;
};

const arrayBinding = (values: readonly string[]) => `{${values.join(',')}}`;
const sourceInstant = sql.raw(
  `to_char(e.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
);

function bounded<Row>(rows: Row[], maximum: number): Row[] {
  if (rows.length > maximum)
    throw financialConflict(
      'ACCOUNTING_SCOPE_TOO_LARGE',
      'Select fewer accounts or a shorter period before calculating this accounting report.',
    );
  return rows;
}

/** A reversal keeps the original classification but contributes its actual negated posting. */
function classification(row: PostingRow): AccountingCashPosting['classification'] {
  switch (row.source_kind) {
    case 'deposit':
    case 'withdrawal':
    case 'opening':
    case 'income':
    case 'fee':
    case 'settlement':
    case 'reclassification':
      return row.source_kind;
    case 'account-income':
      return 'income';
    case 'account-tax':
      return 'tax';
    case 'account-expense':
      return 'expense';
    case 'execution-principal':
    case 'manual-settlement':
      return 'trade-principal';
    case 'fx-source':
    case 'fx-destination':
      return 'fx-conversion';
    case 'internal-transfer':
    case 'cash-transfer-departure':
    case 'cash-transfer-receipt':
      return 'transfer';
    default:
      return 'unresolved';
  }
}

function chooseMark(
  prices: readonly PriceRow[],
  instrumentVersionId: string,
  asOf: string,
  input: Pick<ReportInput, 'priceSourcePriority' | 'priceMaxAgeMilliseconds'>,
): AccountingMark | null {
  const instant = instantNanoseconds(asOf);
  const maximumAge = BigInt(input.priceMaxAgeMilliseconds) * 1_000_000n;
  const eligible = prices.filter(
    (price) =>
      price.reference_version_ids.includes(instrumentVersionId) &&
      instantNanoseconds(price.convention_effective_at) <= instant &&
      input.priceSourcePriority.includes(price.source) &&
      instantNanoseconds(price.observed_at) <= instant &&
      instant - instantNanoseconds(price.observed_at) <= maximumAge,
  );
  eligible.sort(
    (left, right) =>
      input.priceSourcePriority.indexOf(left.source) -
        input.priceSourcePriority.indexOf(right.source) ||
      (instantNanoseconds(left.observed_at) === instantNanoseconds(right.observed_at)
        ? left.id.localeCompare(right.id)
        : instantNanoseconds(left.observed_at) > instantNanoseconds(right.observed_at)
          ? -1
          : 1),
  );
  const selected = eligible[0];
  return selected
    ? { id: selected.id, price: decimal(selected.price_raw), observedAt: selected.observed_at }
    : null;
}

async function balances(
  tx: DbTransaction,
  workspaceId: string,
  accountIds: readonly string[],
  asOf: string,
  revision: string,
) {
  const rows = await queryRows<{
    account_id: string;
    currency_id: string;
    cash_bucket_id: string;
    category: string;
    amount: string;
  }>(
    tx,
    sql`SELECT b.account_id,b.currency_id,b.id AS cash_bucket_id,b.category,
      COALESCE(sum(p.amount) FILTER (WHERE e.economic_at<=${asOf}::timestamptz
        AND e.source_revision<=${revision}::integer),0)::text AS amount
    FROM app.cash_buckets b LEFT JOIN app.postings p
      ON p.workspace_id=b.workspace_id AND p.cash_bucket_id=b.id
    LEFT JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
    WHERE b.workspace_id=${workspaceId}::uuid AND b.account_id=ANY(${arrayBinding(accountIds)}::uuid[])
      AND (EXISTS (
        SELECT 1 FROM app.financial_commands command
        WHERE command.workspace_id=b.workspace_id AND command.kind='cash-bucket-created'
          AND command.result->>'id'=b.id::text AND command.source_revision<=${revision}::integer
      ) OR EXISTS (
        SELECT 1 FROM app.postings evidence JOIN app.ledger_events event
          ON event.workspace_id=evidence.workspace_id AND event.id=evidence.ledger_event_id
        WHERE evidence.workspace_id=b.workspace_id AND evidence.cash_bucket_id=b.id
          AND event.source_revision<=${revision}::integer
      ))
    GROUP BY b.account_id,b.currency_id,b.id,b.category ORDER BY b.account_id,b.currency_id,b.id
    LIMIT 10001`,
  );
  return bounded(rows, 10000).map((row) => ({
    accountId: row.account_id,
    currencyId: row.currency_id,
    cashBucketId: row.cash_bucket_id,
    kind: row.category,
    // This is a derived aggregate, whose whole-part may exceed a source amount's
    // bound. The accounting kernel reports output overflow explicitly.
    amount: row.amount,
  }));
}

/** Facts, both boundaries, correction leaves and the revision share one read-only snapshot. */
export function createAccountingReports(platform: FinancialPlatform) {
  async function report(context: AuthorizationContext, query: ReportInput) {
    const parsed = accountingReportRequestSchema.parse(query);
    const input = {
      ...parsed,
      from: canonicalFinancialInstant(parsed.from),
      to: canonicalFinancialInstant(parsed.to),
    };
    return platform.withWorkspaceContext(
      context,
      async (tx) => {
        const [state] = await queryRows<{ revision: number }>(
          tx,
          sql`SELECT revision FROM app.financial_state WHERE workspace_id=${context.workspaceId}::uuid`,
        );
        const revision = input.sourceRevision ?? String(state?.revision ?? 0);
        if (BigInt(revision) > BigInt(state?.revision ?? 0))
          throw financialInvalid('An accounting report cannot select a future financial revision.');
        await requireCurrency(tx, context.workspaceId, input.reportingCurrencyId, false);
        let accountIds = input.accountIds ? [...input.accountIds].sort() : [];
        let portfolioId: string | null = null;
        let portfolioVersion: number | null = null;
        if (input.portfolioVersionId) {
          const [version] = await queryRows<{
            portfolio_id: string;
            version: number;
            source_revision: number;
          }>(
            tx,
            sql`SELECT portfolio_id,version,source_revision FROM app.portfolio_versions
            WHERE workspace_id=${context.workspaceId}::uuid AND id=${input.portfolioVersionId}::uuid`,
          );
          if (!version) throw inaccessible();
          if (BigInt(version.source_revision) > BigInt(revision))
            throw financialInvalid(
              'The portfolio definition did not exist at this financial revision.',
            );
          portfolioId = version.portfolio_id;
          portfolioVersion = version.version;
          const members = await queryRows<{ account_id: string }>(
            tx,
            sql`SELECT account_id FROM app.portfolio_version_accounts
            WHERE workspace_id=${context.workspaceId}::uuid AND version_id=${input.portfolioVersionId}::uuid
            ORDER BY account_id LIMIT 101`,
          );
          accountIds = bounded(members, 100).map((member) => member.account_id);
        }
        if (!accountIds.length)
          throw financialInvalid('An accounting report requires at least one account.');
        const accounts = [];
        for (const accountId of accountIds)
          accounts.push(await requireAccount(tx, context.workspaceId, accountId, false, input.to));
        if (new Set(accounts.map((account) => account.environment)).size !== 1)
          throw financialInvalid(
            'Live and paper accounts require separate accounting populations.',
          );
        const accountReferences = new Map<string, AccountReference>(
          accounts.map((account) => [`${account.id}|${input.to}`, account]),
        );
        const instrumentReferences = new Map<string, InstrumentVersionReference>();
        async function accountReference(accountId: string, asOf: string) {
          const key = `${accountId}|${asOf}`;
          let value = accountReferences.get(key);
          if (!value) {
            value = await requireAccount(tx, context.workspaceId, accountId, false, asOf);
            accountReferences.set(key, value);
          }
          return value;
        }
        async function instrumentReference(versionId: string) {
          let value = instrumentReferences.get(versionId);
          if (!value) {
            value = await requireInstrumentVersion(tx, context.workspaceId, versionId, false);
            instrumentReferences.set(versionId, value);
          }
          return value;
        }
        const selected = arrayBinding(accountIds);
        const supplied = await selectComponents(
          tx,
          context,
          input.suppliedPositionIds,
          revision,
          'position-equity',
        );
        if (supplied.some((value) => !accountIds.includes(value.accountId!)))
          throw financialInvalid(
            'A selected supplied position must belong to the report account scope.',
          );
        const bookRows = bounded(
          await queryRows<BookRow>(
            tx,
            sql`SELECT b.id,b.account_id,b.instrument_id,
              latest.instrument_version_id,opening.instrument_version_id AS opening_instrument_version_id
            FROM app.holding_books b
            JOIN LATERAL (
              SELECT source.instrument_version_id FROM (
                SELECT e.instrument_version_id,e.economic_at,e.source_revision FROM app.executions e
                WHERE e.workspace_id=b.workspace_id AND e.account_id=b.account_id
                  AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions supersession
                    WHERE supersession.workspace_id=e.workspace_id AND supersession.original_execution_id=e.id
                      AND supersession.source_revision<=${revision}::integer)
                UNION ALL SELECT o.instrument_version_id,o.economic_at,o.source_revision FROM app.opening_lots o
                  WHERE o.workspace_id=b.workspace_id AND o.account_id=b.account_id
                UNION ALL SELECT t.instrument_version_id,t.economic_at,t.source_revision FROM app.holding_transfers t
                  WHERE t.workspace_id=b.workspace_id AND (t.source_account_id=b.account_id OR t.destination_account_id=b.account_id)
              ) source JOIN app.instrument_versions v ON v.workspace_id=b.workspace_id AND v.id=source.instrument_version_id
              WHERE v.instrument_id=b.instrument_id AND source.source_revision<=${revision}::integer
                AND source.economic_at<=${input.to}::timestamptz
              ORDER BY source.economic_at DESC,source.source_revision DESC LIMIT 1
            ) latest ON true
            LEFT JOIN LATERAL (
              SELECT source.instrument_version_id FROM (
                SELECT e.instrument_version_id,e.economic_at,e.source_revision FROM app.executions e
                WHERE e.workspace_id=b.workspace_id AND e.account_id=b.account_id
                  AND NOT EXISTS (SELECT 1 FROM app.execution_supersessions supersession
                    WHERE supersession.workspace_id=e.workspace_id AND supersession.original_execution_id=e.id
                      AND supersession.source_revision<=${revision}::integer)
                UNION ALL SELECT o.instrument_version_id,o.economic_at,o.source_revision FROM app.opening_lots o
                  WHERE o.workspace_id=b.workspace_id AND o.account_id=b.account_id
                UNION ALL SELECT t.instrument_version_id,t.economic_at,t.source_revision FROM app.holding_transfers t
                  WHERE t.workspace_id=b.workspace_id AND (t.source_account_id=b.account_id OR t.destination_account_id=b.account_id)
              ) source JOIN app.instrument_versions v ON v.workspace_id=b.workspace_id AND v.id=source.instrument_version_id
              WHERE v.instrument_id=b.instrument_id AND source.source_revision<=${revision}::integer
                AND source.economic_at<=${input.from}::timestamptz
              ORDER BY source.economic_at DESC,source.source_revision DESC LIMIT 1
            ) opening ON true
            WHERE b.workspace_id=${context.workspaceId}::uuid AND b.account_id=ANY(${selected}::uuid[])
            ORDER BY b.account_id,b.instrument_id LIMIT 1001`,
          ),
          1000,
        );
        const holdingTransferRows = bounded(
          await queryRows<HoldingTransferRow>(
            tx,
            sql`SELECT t.id,t.source_account_id,t.destination_account_id,t.instrument_version_id,v.instrument_id,
              to_char(t.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS economic_at,t.payload
            FROM app.holding_transfers t JOIN app.instrument_versions v
              ON v.workspace_id=t.workspace_id AND v.id=t.instrument_version_id
            WHERE t.workspace_id=${context.workspaceId}::uuid AND t.source_revision<=${revision}::integer
              AND t.economic_at>${input.from}::timestamptz AND t.economic_at<=${input.to}::timestamptz
              AND (t.source_account_id=ANY(${selected}::uuid[]) OR t.destination_account_id=ANY(${selected}::uuid[]))
            ORDER BY t.economic_at,t.ordering_key::numeric,t.id LIMIT 10001`,
          ),
          10000,
        );
        const openingRows = bounded(
          await queryRows<HoldingOpeningRow>(
            tx,
            sql`SELECT o.id,o.account_id,o.instrument_version_id,v.instrument_id,o.direction,o.quantity_raw,o.principal_raw,
              to_char(o.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS economic_at,o.payload
            FROM app.opening_lots o JOIN app.instrument_versions v ON v.workspace_id=o.workspace_id AND v.id=o.instrument_version_id
            WHERE o.workspace_id=${context.workspaceId}::uuid AND o.account_id=ANY(${selected}::uuid[])
              AND o.source_revision<=${revision}::integer AND o.economic_at>${input.from}::timestamptz
              AND o.economic_at<=${input.to}::timestamptz ORDER BY o.economic_at,o.ordering_key::numeric,o.id LIMIT 10001`,
          ),
          10000,
        );
        const instrumentVersionIds = [
          ...new Set([
            ...bookRows.map((book) => book.instrument_version_id),
            ...bookRows.flatMap((book) => book.opening_instrument_version_id ?? []),
            ...holdingTransferRows.map((transfer) => transfer.instrument_version_id),
            ...openingRows.map((opening) => opening.instrument_version_id),
          ]),
        ];
        const prices = bounded(
          await queryRows<PriceRow>(
            tx,
            sql`SELECT o.id,o.instrument_version_id,o.price_raw,
              to_char(o.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at,o.source,
              to_char(candidate.effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS convention_effective_at,
              compatible.reference_version_ids
            FROM app.price_observations o
            JOIN app.instrument_versions candidate ON candidate.workspace_id=o.workspace_id AND candidate.id=o.instrument_version_id
            JOIN LATERAL (
              SELECT array_agg(reference.id) AS reference_version_ids FROM app.instrument_versions reference
              WHERE reference.workspace_id=o.workspace_id AND reference.id=ANY(${arrayBinding(instrumentVersionIds)}::uuid[])
                AND ${compatiblePriceConventions('candidate', 'reference')}
            ) compatible ON compatible.reference_version_ids IS NOT NULL
            WHERE o.workspace_id=${context.workspaceId}::uuid
              AND candidate.instrument_id IN (
                SELECT instrument_id FROM app.instrument_versions
                WHERE workspace_id=${context.workspaceId}::uuid
                  AND id=ANY(${arrayBinding(instrumentVersionIds)}::uuid[])
              )
              AND candidate.effective_at<=${input.to}::timestamptz
              AND o.observed_at<=${input.to}::timestamptz
              AND COALESCE((o.payload->>'sourceRevision')::numeric,0)<=${revision}::integer
              AND NOT EXISTS (SELECT 1 FROM app.price_observations newer
                WHERE newer.workspace_id=o.workspace_id AND newer.supersedes_id=o.id
                  AND COALESCE((newer.payload->>'sourceRevision')::numeric,0)<=${revision}::integer)
            ORDER BY o.observed_at,o.id LIMIT 10001`,
          ),
          10000,
        );
        const books: AccountingBook[] = [];
        for (const book of bookRows) {
          const instrument = await instrumentReference(book.instrument_version_id);
          const closingInventory = await replayBookAt(
            tx,
            context,
            { accountId: book.account_id, instrumentVersionId: book.instrument_version_id },
            input.to,
            revision,
            { account: await accountReference(book.account_id, input.to), instrument },
          );
          // No effective holding source existed at the opening boundary. Derive an
          // empty population without pretending later account settings existed then.
          const openingInventory = book.opening_instrument_version_id
            ? await replayBookAt(
                tx,
                context,
                {
                  accountId: book.account_id,
                  instrumentVersionId: book.opening_instrument_version_id,
                },
                input.from,
                revision,
                {
                  account: await accountReference(book.account_id, input.from),
                  instrument: await instrumentReference(book.opening_instrument_version_id),
                },
              )
            : replayInventory({
                scope: closingInventory.scope,
                manifest: closingInventory.manifest,
                policy: closingInventory.policy,
                capability: {
                  subtype: instrument.subtype,
                  nativeInventory: instrument.capability === 'native-linear',
                  shortSupported: false,
                  averageCostSupported: true,
                },
                sources: [],
                sourceRevision: revision,
              });
          const suppliedAt = (
            asOf: string,
            inventory: typeof closingInventory,
          ): AccountingSuppliedValue | undefined => {
            const value = choosePositionComponent(supplied, {
              accountId: book.account_id,
              instrumentId: book.instrument_id,
              inventory,
              capability: instrument.capability,
              asOf,
              maxAgeMilliseconds: input.priceMaxAgeMilliseconds,
            });
            return value
              ? {
                  ...componentReference(value),
                  kind: 'position-equity',
                  definitionVersion: 'residual-position-equity/1',
                  signedQuantity: value.signedQuantity!,
                  cashExcluded: true,
                  collateralExcluded: true,
                  settledPnlExcluded: true,
                  unsettledCashExcluded: true,
                }
              : undefined;
          };
          const openingSuppliedValue = suppliedAt(input.from, openingInventory),
            closingSuppliedValue = suppliedAt(input.to, closingInventory);
          books.push({
            id: book.id,
            accountId: book.account_id,
            instrumentId: book.instrument_id,
            instrumentVersionId: book.instrument_version_id,
            currencyId: instrument.settlementCurrencyId,
            multiplier: instrument.multiplier,
            openingInventory,
            closingInventory,
            allowSupplied: instrument.capability === 'manual',
            ...(openingSuppliedValue ? { openingSuppliedValue } : {}),
            ...(closingSuppliedValue ? { closingSuppliedValue } : {}),
            openingMark: book.opening_instrument_version_id
              ? chooseMark(prices, book.opening_instrument_version_id, input.from, input)
              : null,
            closingMark: chooseMark(prices, book.instrument_version_id, input.to, input),
          });
        }
        const holdingTransfers: AccountingHoldingTransfer[] = [];
        for (const transfer of holdingTransferRows) {
          const instrument = await instrumentReference(transfer.instrument_version_id);
          holdingTransfers.push({
            id: transfer.id,
            sourceAccountId: transfer.source_account_id,
            destinationAccountId: transfer.destination_account_id,
            instrumentId: transfer.instrument_id,
            currencyId: instrument.settlementCurrencyId,
            economicAt: transfer.economic_at,
            slices: transfer.payload.receipt.slices,
            mark: chooseMark(prices, transfer.instrument_version_id, transfer.economic_at, input),
          });
        }
        const holdingOpenings: AccountingHoldingOpening[] = [];
        for (const opening of openingRows) {
          const instrument = await instrumentReference(opening.instrument_version_id);
          const account = await accountReference(opening.account_id, opening.economic_at);
          holdingOpenings.push({
            id: opening.id,
            accountId: opening.account_id,
            instrumentId: opening.instrument_id,
            currencyId: instrument.settlementCurrencyId,
            economicAt: opening.economic_at,
            direction: opening.direction,
            quantity: opening.quantity_raw,
            multiplier: instrument.multiplier,
            nativeValuation:
              instrument.capability === 'native-linear' &&
              account.holdingMode === 'netted' &&
              (opening.direction === 'long' ||
                supportsNativeShortInventory(instrument.family, instrument.metadata)),
            bookedPrincipal: opening.principal_raw,
            ...(opening.payload.basisReportingFx
              ? { basisReportingFx: opening.payload.basisReportingFx }
              : {}),
            mark: chooseMark(prices, opening.instrument_version_id, opening.economic_at, input),
          });
        }
        const postings = bounded(
          await queryRows<PostingRow>(
            tx,
            sql`SELECT p.id,e.id AS event_id,b.account_id,p.cash_bucket_id,p.currency_id,p.amount_raw,
              ${sourceInstant} AS economic_at,COALESCE(original.kind,e.kind) AS source_kind,
              COALESCE(fee.payload->'reportingFx',CASE
                WHEN COALESCE(original.kind,e.kind)='execution-principal'
                THEN execution.payload->'basisReportingFx' END) AS reporting_fx,
              COALESCE(transfer.source_account_id,legs.source_account_id) AS source_account_id,
              COALESCE(transfer.destination_account_id,legs.destination_account_id) AS destination_account_id
            FROM app.postings p JOIN app.cash_buckets b ON b.workspace_id=p.workspace_id AND b.id=p.cash_bucket_id
            JOIN app.ledger_events e ON e.workspace_id=p.workspace_id AND e.id=p.ledger_event_id
            LEFT JOIN app.ledger_events original ON original.workspace_id=e.workspace_id AND original.id=e.reversal_of_id
            LEFT JOIN app.fees fee ON fee.workspace_id=e.workspace_id AND fee.id=COALESCE(original.fee_id,e.fee_id)
            LEFT JOIN app.executions execution ON execution.workspace_id=e.workspace_id
              AND execution.id=COALESCE(original.execution_id,e.execution_id)
            LEFT JOIN LATERAL (
              SELECT (min(owner.account_id::text) FILTER (WHERE leg.amount<0))::uuid AS source_account_id,
                (min(owner.account_id::text) FILTER (WHERE leg.amount>0))::uuid AS destination_account_id
              FROM app.postings leg JOIN app.cash_buckets owner ON owner.workspace_id=leg.workspace_id AND owner.id=leg.cash_bucket_id
              WHERE leg.workspace_id=e.workspace_id AND leg.ledger_event_id=COALESCE(original.id,e.id)
                AND COALESCE(original.kind,e.kind)='internal-transfer'
              HAVING count(*)=2 AND sum(leg.amount)=0
            ) legs ON COALESCE(original.kind,e.kind)='internal-transfer'
            LEFT JOIN app.cash_transfer_receipts receipt ON receipt.workspace_id=e.workspace_id
              AND receipt.id=COALESCE(original.cash_transfer_receipt_id,e.cash_transfer_receipt_id)
            LEFT JOIN app.cash_transfers transfer ON transfer.workspace_id=e.workspace_id
              AND transfer.id=COALESCE(original.cash_transfer_id,e.cash_transfer_id,receipt.transfer_id)
            WHERE p.workspace_id=${context.workspaceId}::uuid AND b.account_id=ANY(${selected}::uuid[])
              AND e.source_revision<=${revision}::integer AND e.economic_at>${input.from}::timestamptz
              AND e.economic_at<=${input.to}::timestamptz ORDER BY e.economic_at,e.source_revision,e.id,p.id LIMIT 50001`,
          ),
          50000,
        );
        const cashPostings: AccountingCashPosting[] = postings.map((row) => {
          const sourceAccountId = row.source_account_id;
          const destinationAccountId = row.destination_account_id;
          return {
            id: row.id,
            eventId: row.event_id,
            accountId: row.account_id,
            cashBucketId: row.cash_bucket_id,
            currencyId: row.currency_id,
            amount: decimal(row.amount_raw),
            economicAt: row.economic_at,
            classification: classification(row),
            ...(row.reporting_fx ? { reportingFx: row.reporting_fx } : {}),
            ...(sourceAccountId ? { sourceAccountId } : {}),
            ...(destinationAccountId ? { destinationAccountId } : {}),
          };
        });
        const cashTransfers = bounded(
          await queryRows<{
            id: string;
            source_account_id: string;
            destination_account_id: string;
            currency_id: string;
            amount_raw: string;
            departed_at: string;
            received_at: string | null;
          }>(
            tx,
            sql`SELECT t.id,t.source_account_id,t.destination_account_id,t.currency_id,t.amount_raw,
              to_char(t.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS departed_at,
              to_char(r.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS received_at
            FROM app.cash_transfers t LEFT JOIN app.cash_transfer_receipts r
              ON r.workspace_id=t.workspace_id AND r.transfer_id=t.id AND r.source_revision<=${revision}::integer
            WHERE t.workspace_id=${context.workspaceId}::uuid AND t.source_revision<=${revision}::integer
              AND NOT EXISTS (SELECT 1 FROM app.ledger_events e JOIN app.ledger_events reversed
                ON reversed.workspace_id=e.workspace_id AND reversed.reversal_of_id=e.id
                WHERE e.workspace_id=t.workspace_id AND e.cash_transfer_id=t.id
                  AND reversed.source_revision<=${revision}::integer)
              AND t.economic_at<=${input.to}::timestamptz
              AND (t.source_account_id=ANY(${selected}::uuid[]) OR t.destination_account_id=ANY(${selected}::uuid[]))
            ORDER BY t.economic_at,t.id LIMIT 10001`,
          ),
          10000,
        ).map((row) => ({
          id: row.id,
          sourceAccountId: row.source_account_id,
          destinationAccountId: row.destination_account_id,
          currencyId: row.currency_id,
          amount: decimal(row.amount_raw),
          departedAt: row.departed_at,
          receivedAt: row.received_at,
        }));
        const conversions = bounded(
          await queryRows<{
            id: string;
            source_currency_id: string;
            destination_currency_id: string;
            source_amount_raw: string;
            destination_amount_raw: string;
            economic_at: string;
          }>(
            tx,
            sql`SELECT f.id,source.currency_id AS source_currency_id,destination.currency_id AS destination_currency_id,
              f.source_amount_raw,f.destination_amount_raw,to_char(f.economic_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS economic_at
            FROM app.fx_conversions f JOIN app.cash_buckets source ON source.workspace_id=f.workspace_id AND source.id=f.source_bucket_id
            JOIN app.cash_buckets destination ON destination.workspace_id=f.workspace_id AND destination.id=f.destination_bucket_id
            WHERE f.workspace_id=${context.workspaceId}::uuid AND source.account_id=ANY(${selected}::uuid[])
              AND f.source_revision<=${revision}::integer AND f.economic_at>${input.from}::timestamptz
              AND f.economic_at<=${input.to}::timestamptz ORDER BY f.economic_at,f.id LIMIT 10001`,
          ),
          10000,
        ).map((row) => ({
          id: row.id,
          sourceCurrencyId: row.source_currency_id,
          destinationCurrencyId: row.destination_currency_id,
          sourceAmount: decimal(row.source_amount_raw),
          destinationAmount: decimal(row.destination_amount_raw),
          economicAt: row.economic_at,
        }));
        // Transfer descendants can refer to an acquisition in another account.
        // Select their actual source identities, rather than loading every fill
        // in the workspace that happens to use a selected instrument.
        const dependencySourceIds = [
          ...new Set([
            ...books.flatMap((book) =>
              [book.openingInventory, book.closingInventory].flatMap((inventory) => [
                ...inventory.lots.map((lot) => lot.sourceId),
                ...inventory.matches.flatMap((match) => [
                  match.openingSourceId,
                  match.closingSourceId,
                ]),
              ]),
            ),
            ...holdingTransfers.flatMap((transfer) =>
              transfer.slices.map((slice) => slice.sourceId),
            ),
            ...holdingOpenings.map((opening) => opening.id),
          ]),
        ];
        const sourceRows = bounded(
          await queryRows<{ id: string; economic_at: string }>(
            tx,
            sql`SELECT e.id,${sourceInstant} AS economic_at FROM (
              SELECT workspace_id,id,instrument_version_id,economic_at,source_revision FROM app.executions
              UNION ALL SELECT workspace_id,id,instrument_version_id,economic_at,source_revision FROM app.opening_lots
            ) e
            WHERE e.workspace_id=${context.workspaceId}::uuid AND e.id=ANY(${arrayBinding(dependencySourceIds)}::uuid[])
              AND e.source_revision<=${revision}::integer AND e.economic_at<=${input.to}::timestamptz
            ORDER BY e.economic_at,e.id LIMIT 50001`,
          ),
          50000,
        );
        const sourceInstants = Object.fromEntries(
          sourceRows.map((row) => [row.id, row.economic_at]),
        );
        const openingCash = await balances(
          tx,
          context.workspaceId,
          accountIds,
          input.from,
          revision,
        );
        const closingCash = await balances(tx, context.workspaceId, accountIds, input.to, revision);
        const currencies = new Set([
          ...supplied.map((value) => value.currencyId),
          ...openingCash.filter((row) => /[1-9]/u.test(row.amount)).map((row) => row.currencyId),
          ...closingCash.filter((row) => /[1-9]/u.test(row.amount)).map((row) => row.currencyId),
          ...cashPostings.map((row) => row.currencyId),
          ...books.map((book) => book.currencyId),
          ...holdingTransfers.map((row) => row.currencyId),
          ...holdingOpenings.map((row) => row.currencyId),
          ...cashTransfers.map((row) => row.currencyId),
          ...conversions.flatMap((row) => [row.sourceCurrencyId, row.destinationCurrencyId]),
        ]);
        const fxObservations = await readReportFxEvidence(tx, context, {
          pairs: [...currencies].map((currency) => [currency, input.reportingCurrencyId] as const),
          asOf: input.to,
          sourceRevision: revision,
          sourcePriority: input.fxPolicy.sourcePriority,
          scopeError: 'ACCOUNTING_SCOPE_TOO_LARGE',
        });
        let result;
        try {
          result = calculateAccounting({
            ...(input.detail ? { detail: input.detail } : {}),
            ...(input.dependencyPage ? { dependencyPage: input.dependencyPage } : {}),
            fullDetailLimit: 4000,
            accountIds,
            ...(input.portfolioVersionId ? { portfolioVersionId: input.portfolioVersionId } : {}),
            reportingCurrencyId: input.reportingCurrencyId,
            sourceRevision: revision,
            ...(input.suppliedPositionIds
              ? { suppliedPositionIds: input.suppliedPositionIds }
              : {}),
            from: input.from,
            to: input.to,
            fxPolicy: input.fxPolicy,
            pricePolicy: {
              maxAgeMilliseconds: input.priceMaxAgeMilliseconds,
              sourcePriority: input.priceSourcePriority,
            },
            fxObservations,
            sourceInstants,
            openingCash,
            closingCash,
            cashPostings,
            books,
            cashTransfers,
            holdingTransfers,
            holdingOpenings,
            conversions,
          });
        } catch (error) {
          if (error instanceof AccountingDetailLimitError)
            throw financialConflict(
              'ACCOUNTING_DETAIL_TOO_LARGE',
              'Request detail summary for complete totals, then retrieve dependency pages at the returned source revision.',
            );
          throw error;
        }
        const response = {
          ...result,
          context: {
            ...result.context,
            environment: accounts[0]!.environment,
            portfolioId,
            portfolioVersion,
          },
        };
        if (Buffer.byteLength(JSON.stringify(response), 'utf8') > 4_194_304)
          throw financialConflict(
            'ACCOUNTING_DETAIL_TOO_LARGE',
            'Request detail summary for complete totals and bounded dependency pages.',
          );
        return response;
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  return { report };
}
