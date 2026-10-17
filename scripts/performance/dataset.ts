import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { createDatabase } from '@journal/database';
import { migrateDatabase, provisionRuntimeRoles } from '@journal/database/migrate';
import { migrateJobs } from '@journal/worker/migrate';
import { createServerServices, parseServerConfig } from '@journal/server';
import {
  decimalValue,
  quantizeDecimal,
  replayInventory,
  INVENTORY_CALCULATION_MANIFEST,
  type InventorySource,
} from '@journal/domain';
import { createCatalogServices } from '../../packages/server/src/financial/catalog.js';
import { createFinancialLedger } from '../../packages/server/src/financial/ledger.js';
import { createFinancialObservations } from '../../packages/server/src/financial/observations.js';
import { financialFingerprint } from '../../packages/server/src/financial/repository.js';
import { sanitizePlan } from './instrument.js';
import {
  databasePassword,
  loadEnvironment,
  repositoryRoot,
  testDatabaseUrls,
} from '../environment.js';

/** Public fixture metadata. Credentials are kept in the separately ignored private file. */
export type PerformanceManifest = {
  schemaVersion: 1;
  seed: string;
  databaseName: string;
  distribution: 'distributed' | 'concentrated';
  trades: number;
  executions: number;
  setupMilliseconds: number;
  workspaceId: string;
  actorId: string;
  email: string;
  accountIds: string[];
  boundedAccountId: string;
  reportingCurrencyId: string;
  executionCurrencyId: string;
  from: string;
  to: string;
  metadataAsOf: string;
  sourceRevision: string;
  timezone: 'UTC';
  tradeIds: string[];
  counts: Record<string, number>;
  distributionCounts: { accountId: string; trades: number; executions: number; books: number }[];
  fxPolicy: { id: string; maxAgeMilliseconds: number; sourcePriority: string[] };
  priceSourcePriority: string[];
  priceMaxAgeMilliseconds: number;
  privateBindingsPath: string;
  validation: {
    runtimeRole: string;
    disabledApplicationTriggers: number;
    expectedNativeRealizedNet: string;
    projectedNativeRealizedNet: string;
    expectedNativeCash: string;
    actualNativeCash: string;
    remainingPreparationIndexes: number;
  };
  preparationOnlyIndexes: string[];
  preparationPlans: { stage: string; operation: string; plan: unknown }[];
  omissions: string[];
};

export type PerformanceBindings = {
  DATABASE_URL: string;
  AUTH_DATABASE_URL: string;
  JOB_DATABASE_URL: string;
  MIGRATION_DATABASE_URL: string;
  password: string;
  email: string;
  APP_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
};

export async function loadPerformanceBindings(manifest: PerformanceManifest) {
  if (
    manifest.schemaVersion !== 1 ||
    !/^journal_perf_[0-9a-f]{32}_test$/.test(manifest.databaseName)
  )
    throw new Error('Only generated, isolated performance test databases are supported');
  try {
    const parsed: unknown = JSON.parse(await readFile(manifest.privateBindingsPath, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    const fields = parsed as Record<string, unknown>;
    for (const name of [
      'DATABASE_URL',
      'AUTH_DATABASE_URL',
      'JOB_DATABASE_URL',
      'MIGRATION_DATABASE_URL',
      'password',
      'email',
      'APP_ORIGIN',
      'BETTER_AUTH_SECRET',
    ])
      if (typeof fields[name] !== 'string' || !fields[name]) throw new Error();
    const bindings = fields as PerformanceBindings;
    for (const name of [
      'DATABASE_URL',
      'AUTH_DATABASE_URL',
      'JOB_DATABASE_URL',
      'MIGRATION_DATABASE_URL',
    ] as const) {
      const url = new URL(bindings[name]);
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !url.hostname ||
        !url.username ||
        !url.password ||
        url.pathname !== `/${manifest.databaseName}` ||
        url.search ||
        url.hash
      )
        throw new Error();
    }
    const origin = new URL(bindings.APP_ORIGIN);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      bindings.password.length < 12 ||
      bindings.password.length > 128 ||
      bindings.BETTER_AUTH_SECRET.trim().length < 32
    )
      throw new Error();
    return bindings;
  } catch {
    // Parser/URL/filesystem errors can retain the private source in messages or
    // properties. Replace the entire error, including its stack and cause.
    throw new Error('Performance private bindings are invalid or inaccessible');
  }
}

type Row = Record<string, unknown>;
type Client = PoolClient;
const source = 'performance-fixture';
const effectiveAt = '2029-01-01T00:00:00.000001Z';
const from = '2030-01-01T00:00:00.000000Z';
const to = '2030-12-31T23:59:59.999999Z';
const canonical = (value: ReturnType<typeof decimalValue>) => quantizeDecimal(value);
const uuid = (seed: string, name: string) => {
  const bytes = createHash('sha256').update(`${seed}:${name}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** Fixed, reviewed table/column identifiers only; values remain bound JSON parameters. */
async function insert(
  client: Client,
  workspaceId: string,
  table: string,
  types: Record<string, string>,
  rows: Row[],
) {
  if (!rows.length) return;
  if (!/^[a-z_]+$/.test(table) || Object.keys(types).some((key) => !/^[a-z_]+$/.test(key)))
    throw new Error('Unsafe fixture SQL identifier');
  const columns = Object.keys(types);
  const values = columns.map((column) =>
    types[column] === 'jsonb' ? `(r->'${column}')` : `(r->>'${column}')::${types[column]}`,
  );
  for (let offset = 0; offset < rows.length; offset += 250)
    await client.query(
      `INSERT INTO app.${table}(workspace_id,${columns.join(',')}) SELECT $1::uuid,${values.join(',')} FROM jsonb_array_elements($2::jsonb) r`,
      [workspaceId, JSON.stringify(rows.slice(offset, offset + 250))],
    );
}

export async function createPerformanceDataset(options: {
  trades: number;
  executions: number;
  distribution: 'distributed' | 'concentrated';
  instrumentCount?: number;
  seed?: string;
  outputPath?: string;
}): Promise<PerformanceManifest> {
  loadEnvironment();
  if (
    !Number.isSafeInteger(options.trades) ||
    options.trades < 1 ||
    options.trades > 10000 ||
    !Number.isSafeInteger(options.executions) ||
    options.executions < options.trades * 2 ||
    options.executions > 100000 ||
    options.executions % (options.trades * 2) !== 0
  )
    throw new Error(
      'Use 1–10,000 trades and an even equal number of fills per trade, up to 100,000 fills',
    );
  if (12500n % BigInt(options.executions / options.trades / 2) !== 0n)
    throw new Error('Fill partitions must preserve the pinned 0.0001 share increment exactly');
  const instrumentCount =
    options.instrumentCount ?? (options.distribution === 'concentrated' ? 1 : 5);
  if (
    !Number.isSafeInteger(instrumentCount) ||
    instrumentCount < 1 ||
    instrumentCount > 100 ||
    (options.distribution === 'concentrated' && instrumentCount !== 1)
  )
    throw new Error('Use 1–100 distributed instruments, or one concentrated instrument');
  const start = performance.now();
  const seed = options.seed ?? 'phase-15-v1';
  const test = testDatabaseUrls();
  const databaseName = `journal_perf_${randomUUID().replaceAll('-', '')}_test`;
  const rewrite = (value: string) => {
    const url = new URL(value);
    url.pathname = `/${databaseName}`;
    return url.toString();
  };
  const bindings: PerformanceBindings = {
    DATABASE_URL: rewrite(test.TEST_APP_DATABASE_URL),
    AUTH_DATABASE_URL: rewrite(test.TEST_AUTH_DATABASE_URL),
    JOB_DATABASE_URL: rewrite(test.TEST_JOB_DATABASE_URL),
    MIGRATION_DATABASE_URL: rewrite(test.TEST_DATABASE_URL),
    password: randomBytes(30).toString('base64url'),
    email: `perf-${databaseName}@example.test`,
    APP_ORIGIN: 'http://localhost:3000',
    BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
  };
  const privateBindingsPath = resolve(
    repositoryRoot,
    '.private/performance',
    `${databaseName}.json`,
  );
  await mkdir(dirname(privateBindingsPath), { recursive: true, mode: 0o700 });
  await writeFile(privateBindingsPath, JSON.stringify(bindings), { mode: 0o600, flag: 'wx' });
  const operator = createDatabase(test.TEST_DATABASE_URL, { max: 1 });
  try {
    // Database identifier contains only the fixed prefix, UUID hex and fixed suffix.
    await operator.pool.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await operator.close();
  }
  await migrateDatabase(bindings.MIGRATION_DATABASE_URL);
  await migrateJobs(bindings.MIGRATION_DATABASE_URL);
  // Reuse existing private role passwords; never rotate shared PostgreSQL roles for a fixture.
  await provisionRuntimeRoles(bindings.MIGRATION_DATABASE_URL, {
    appPassword: databasePassword(bindings.DATABASE_URL),
    authPassword: databasePassword(bindings.AUTH_DATABASE_URL),
    jobsPassword: databasePassword(bindings.JOB_DATABASE_URL),
  });
  const services = createServerServices(
    parseServerConfig({
      ...bindings,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      STORAGE_ROOT: resolve(repositoryRoot, '.private/performance/storage'),
    }),
  );
  const runtime = createDatabase(bindings.DATABASE_URL, { max: 1 });
  const admin = createDatabase(bindings.MIGRATION_DATABASE_URL, { max: 1 });
  const preparationPlans: PerformanceManifest['preparationPlans'] = [];
  // These ordinary indexes make per-row conservation checks practical during
  // controlled bulk preparation. They are removed before ANY measured read;
  // production schema/index plans are exactly those of the reviewed migrations.
  const preparationIndexes =
    options.trades >= 10000 || options.distribution === 'concentrated'
      ? [
          ['allocation_items', 'workspace_id,allocation_set_id,id'],
          ['cost_allocations', 'workspace_id,attribution_set_id,id'],
          ['trade_legs', 'workspace_id,trade_id,id'],
          ['lots', 'workspace_id,holding_book_id,id'],
          ['lot_matches', 'workspace_id,holding_book_id,id'],
          ['lot_matches', 'workspace_id,opening_lot_id,id'],
        ].map(([table, columns], index) => ({ name: `performance_seed_${index}`, table, columns }))
      : [];
  try {
    for (const index of preparationIndexes)
      await admin.pool.query(`CREATE INDEX ${index.name} ON app.${index.table}(${index.columns})`);
    const person = await services.bootstrapOwner({
      email: bindings.email,
      name: 'Performance fixture owner',
      password: bindings.password,
    });
    const login = await services.handleAuthRequest(
      new Request(`${bindings.APP_ORIGIN}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin: bindings.APP_ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ email: bindings.email, password: bindings.password }),
      }),
    );
    if (!login.ok) throw new Error('Performance owner authentication failed');
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const context = await services.authorizeWorkspace(
      new Request(`${bindings.APP_ORIGIN}/api/workspaces`, { headers: { cookie } }),
      person.workspace.id,
      'editor',
    );
    const workspaceId = person.workspace.id;
    const catalog = createCatalogServices(services);
    const ledger = createFinancialLedger(services);
    const currencies: string[] = [];
    for (const code of ['EUR', 'USD'])
      currencies.push(
        (
          await catalog.createCurrency(
            context,
            {
              namespace: 'iso:4217',
              code,
              kind: 'fiat',
              unitIdentity: `iso:${code}`,
              name: code,
              displayScale: 2,
              settlementIncrement: '0.01',
              effectiveAt,
            },
            randomUUID(),
          )
        ).id,
      );
    const eur = currencies[0]!;
    const usd = currencies[1]!;
    const usdConventionId = (await catalog.getCurrency(context, usd)).conventionId;
    const brokers = [];
    for (let index = 0; index < 2; index++)
      brokers.push(
        (
          await catalog.createBroker(
            context,
            { name: `Performance broker ${index}`, sourceNamespace: `${source}:${index}` },
            randomUUID(),
          )
        ).id,
      );
    const instruments: { id: string; versionId: string; family: 'stock' | 'etf' }[] = [];
    for (let index = 0; index < instrumentCount; index++) {
      const family = index % 2 === 0 ? 'stock' : 'etf';
      const instrument = await catalog.createInstrument(
        context,
        {
          name: `Performance ${family} ${index}`,
          family,
          subtype: family === 'stock' ? 'ordinary-share' : 'ordinary-etf',
          economicIdentity: `${source}:${index}`,
          quantityUnit: 'share',
          quoteCurrencyId: usd,
          settlementCurrencyId: usd,
          multiplier: '1',
          quantityIncrement: '0.0001',
          priceIncrement: '0.0001',
          capability: 'native-linear',
          effectiveAt,
          metadata: { priceConvention: 'unit-price', settlementStyle: 'delivered' },
        },
        randomUUID(),
      );
      instruments.push({ id: instrument.id, versionId: instrument.versionId, family });
    }
    const accountCount =
      options.distribution === 'concentrated'
        ? 1
        : Math.min(100, Math.max(1, Math.floor(options.trades / 10)));
    const accounts: { id: string; bucket: string; settingsId: string }[] = [];
    for (let index = 0; index < accountCount; index++) {
      const account = await catalog.createAccount(
        context,
        {
          name: `Performance account ${index}`,
          brokerId: brokers[index % 2]!,
          environment: 'paper',
          accountType: 'cash',
          baseCurrencyId: eur,
          inventoryMethod: 'fifo',
          allowShort: false,
          holdingMode: 'netted',
          effectiveAt,
        },
        randomUUID(),
      );
      const bucket = await ledger.createCashBucket(context, {
        commandId: randomUUID(),
        accountId: account.id,
        currencyId: usd,
        kind: 'settled',
      });
      await ledger.recordCashMovement(context, {
        commandId: randomUUID(),
        accountId: account.id,
        cashBucketId: bucket.id,
        currencyId: usd,
        amount: '100000',
        kind: 'deposit',
        economicAt: '2030-01-01T00:00:00.000001Z',
        orderingKey: '0',
      });
      accounts.push({ id: account.id, bucket: bucket.id, settingsId: account.settingsId });
    }
    const fillsPerTrade = options.executions / options.trades;
    const sampleTradeIds: string[] = [];
    const distributionCounts = accounts.map((account) => ({
      accountId: account.id,
      trades: 0,
      executions: 0,
      books: 0,
    }));
    for (let accountIndex = 0; accountIndex < accounts.length; accountIndex++) {
      const account = accounts[accountIndex]!;
      for (let instrumentIndex = 0; instrumentIndex < instruments.length; instrumentIndex++) {
        const campaignIndexes = Array.from({ length: options.trades }, (_, index) => index).filter(
          (index) =>
            index % accounts.length === accountIndex &&
            Math.floor(index / accounts.length) % instruments.length === instrumentIndex,
        );
        if (!campaignIndexes.length) continue;
        const instrument = instruments[instrumentIndex]!;
        const client = await runtime.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
            [context.actorId, workspaceId],
          );
          const state = await client.query<{ revision: number }>(
            'UPDATE app.financial_state SET revision=revision+1 WHERE workspace_id=$1::uuid RETURNING revision',
            [workspaceId],
          );
          const revision = state.rows[0]!.revision;
          const commandId = randomUUID();
          const auditId = randomUUID();
          const bookId = randomUUID();
          const executionRows: Row[] = [];
          const feeRows: Row[] = [];
          const eventRows: Row[] = [];
          const postingRows: Row[] = [];
          const allocationRows: Row[] = [];
          const itemRows: Row[] = [];
          const costSetRows: Row[] = [];
          const costRows: Row[] = [];
          const tradeRows: Row[] = [];
          const legRows: Row[] = [];
          const closureRows: Row[] = [];
          const sources: InventorySource[] = [];
          for (const index of campaignIndexes) {
            const tradeId = uuid(seed, `trade:${index}`);
            const legId = uuid(seed, `leg:${index}`);
            if (sampleTradeIds.length < 100) sampleTradeIds.push(tradeId);
            const closureId = uuid(seed, `closure:${index}`);
            tradeRows.push({
              id: tradeId,
              title: `Performance trade ${String(index).padStart(5, '0')}`,
              classification: 'active-trading',
              status: 'closed',
              revision: 1,
            });
            legRows.push({
              id: legId,
              trade_id: tradeId,
              label: 'Main fractional-share leg',
              account_id: account.id,
              instrument_version_id: instrument.versionId,
              direction: 'long',
            });
            closureRows.push({
              id: closureId,
              command_id: commandId,
              source_revision: revision,
              trade_id: tradeId,
              definition_version: 'campaign-closure/1',
              confirmed_at: new Date().toISOString(),
              payload: {
                reason: 'Complete benchmark fills are flat',
                obligationEvidence: 'All principal and fees booked in the source cash bucket',
                assignedQuantities: [{ tradeLegId: legId, quantity: '0' }],
                actorId: context.actorId,
                tradeRevision: 1,
              },
            });
            for (let fill = 0; fill < fillsPerTrade; fill++) {
              const id = uuid(seed, `execution:${index}:${fill}`);
              const feeId = uuid(seed, `fee:${index}:${fill}`);
              const allocationId = uuid(seed, `allocation:${index}:${fill}`);
              const costSetId = uuid(seed, `cost:${index}:${fill}`);
              const side = fill < fillsPerTrade / 2 ? 'buy' : 'sell';
              const quantity = canonical(decimalValue('1.25').dividedBy(String(fillsPerTrade / 2)));
              const price = side === 'buy' ? '100.125' : index % 3 === 0 ? '90.875' : '120.375';
              const principal = canonical(decimalValue(quantity).times(price));
              const derivedPrincipal = canonical(decimalValue(principal).toNearest('0.01', 6));
              const booking = {
                conventionId: usdConventionId,
                theoreticalNotional: principal,
                derivedPrincipal,
                principalVariance: canonical(decimalValue(principal).minus(derivedPrincipal)),
              };
              const economicAt = new Date(Date.UTC(2030, 0, 1, 1) + index * 1200000 + fill * 60000)
                .toISOString()
                .replace('.000Z', '.000001Z');
              const feeInput = {
                amount: '0.0125',
                currencyId: usd,
                cashBucketId: account.bucket,
                kind: 'commission',
              };
              const sourceInput = {
                accountId: account.id,
                instrumentVersionId: instrument.versionId,
                side,
                quantity,
                price,
                bookedPrincipal: principal,
                principalCurrencyId: usd,
                cashBucketId: account.bucket,
                economicAt,
                orderingKey: String(index * fillsPerTrade + fill + 1),
                costsComplete: true,
                closeOnly: side === 'sell',
                fees: [feeInput],
                sourceIdentity: { namespace: source, id: `${index}:${fill}` },
                principalReview: {
                  reason:
                    'Synthetic source explicitly books exact fractional principal beyond the usual cent estimate',
                  source: 'performance-fixture deterministic actual booking policy',
                },
              };
              executionRows.push({
                id,
                command_id: commandId,
                source_revision: revision,
                account_id: account.id,
                instrument_version_id: instrument.versionId,
                side,
                quantity_raw: quantity,
                price_raw: price,
                principal_raw: principal,
                principal_currency_id: usd,
                economic_at: economicAt,
                ordering_key: String(index * fillsPerTrade + fill + 1),
                payload: {
                  ...sourceInput,
                  sourceInput,
                  sourceFingerprint: financialFingerprint(sourceInput),
                  booking,
                  accountSettingsId: account.settingsId,
                },
                source_namespace: source,
                source_id: `${index}:${fill}`,
              });
              feeRows.push({
                id: feeId,
                command_id: commandId,
                source_revision: revision,
                account_id: account.id,
                execution_id: id,
                currency_id: usd,
                amount_raw: '0.0125',
                kind: 'commission',
                economic_at: economicAt,
                payload: { ...feeInput, economicAt, sourceInput: feeInput },
              });
              for (const kind of ['execution-principal', 'fee']) {
                const eventId = uuid(seed, `event:${index}:${fill}:${kind}`);
                const amount =
                  kind === 'fee' ? '-0.0125' : side === 'buy' ? `-${principal}` : principal;
                eventRows.push({
                  id: eventId,
                  command_id: commandId,
                  source_revision: revision,
                  effect_key: kind === 'fee' ? `fee:${feeId}` : `execution:${id}:principal`,
                  currency_id: usd,
                  kind,
                  economic_at: economicAt,
                  execution_id: kind === 'execution-principal' ? id : null,
                  fee_id: kind === 'fee' ? feeId : null,
                  payload:
                    kind === 'fee' ? { feeId, executionId: id } : { executionId: id, booking },
                });
                postingRows.push(
                  {
                    id: uuid(seed, `posting:${eventId}:cash`),
                    ledger_event_id: eventId,
                    currency_id: usd,
                    cash_bucket_id: account.bucket,
                    control_key: null,
                    amount_raw: amount,
                  },
                  {
                    id: uuid(seed, `posting:${eventId}:control`),
                    ledger_event_id: eventId,
                    currency_id: usd,
                    cash_bucket_id: null,
                    control_key: kind === 'fee' ? 'expense:commission' : 'trade-principal',
                    amount_raw: canonical(decimalValue(amount).negated()),
                  },
                );
              }
              allocationRows.push({
                id: allocationId,
                command_id: commandId,
                source_revision: revision,
                execution_id: id,
                version: 1,
                reason: 'Conserved performance fixture allocation',
              });
              itemRows.push(
                {
                  id: uuid(seed, `allocation-item:${index}:${fill}:assigned`),
                  allocation_set_id: allocationId,
                  trade_leg_id: legId,
                  quantity_raw: quantity,
                  payload: {},
                },
                {
                  id: uuid(seed, `allocation-item:${index}:${fill}:residual`),
                  allocation_set_id: allocationId,
                  trade_leg_id: null,
                  quantity_raw: '0',
                  payload: {},
                },
              );
              costSetRows.push({
                id: costSetId,
                command_id: commandId,
                source_revision: revision,
                fee_id: feeId,
                axis: 'campaign',
                version: 1,
                reason: 'Conserved execution commission',
              });
              costRows.push(
                {
                  id: uuid(seed, `cost-item:${index}:${fill}:assigned`),
                  attribution_set_id: costSetId,
                  trade_leg_id: legId,
                  currency_id: usd,
                  amount_raw: '0.0125',
                  payload: { target: 'campaign' },
                },
                {
                  id: uuid(seed, `cost-item:${index}:${fill}:residual`),
                  attribution_set_id: costSetId,
                  trade_leg_id: null,
                  currency_id: usd,
                  amount_raw: '0',
                  payload: { target: 'unassigned' },
                },
              );
              sources.push({
                kind: 'fill',
                id,
                effectId: id,
                sourceRevision: String(revision),
                economicOrder: {
                  instant: economicAt,
                  sequence: String(index * fillsPerTrade + fill + 1),
                },
                side,
                quantity,
                price,
                multiplier: '1',
                bookedPrincipal: principal,
                costs: [{ id: feeId, currencyId: usd, amount: '0.0125', chargedAt: economicAt }],
                costsComplete: true,
                closeOnly: side === 'sell',
              });
            }
          }
          await insert(
            client,
            workspaceId,
            'trades',
            {
              id: 'uuid',
              title: 'text',
              classification: 'text',
              status: 'text',
              revision: 'integer',
            },
            tradeRows,
          );
          await insert(
            client,
            workspaceId,
            'trade_legs',
            {
              id: 'uuid',
              trade_id: 'uuid',
              label: 'text',
              account_id: 'uuid',
              instrument_version_id: 'uuid',
              direction: 'text',
            },
            legRows,
          );
          await insert(
            client,
            workspaceId,
            'executions',
            {
              id: 'uuid',
              command_id: 'uuid',
              source_revision: 'integer',
              account_id: 'uuid',
              instrument_version_id: 'uuid',
              side: 'text',
              quantity_raw: 'text',
              price_raw: 'text',
              principal_raw: 'text',
              principal_currency_id: 'uuid',
              economic_at: 'timestamptz',
              ordering_key: 'text',
              payload: 'jsonb',
              source_namespace: 'text',
              source_id: 'text',
            },
            executionRows,
          );
          await insert(
            client,
            workspaceId,
            'fees',
            {
              id: 'uuid',
              command_id: 'uuid',
              source_revision: 'integer',
              account_id: 'uuid',
              execution_id: 'uuid',
              currency_id: 'uuid',
              amount_raw: 'text',
              kind: 'text',
              economic_at: 'timestamptz',
              payload: 'jsonb',
            },
            feeRows,
          );
          await insert(
            client,
            workspaceId,
            'ledger_events',
            {
              id: 'uuid',
              command_id: 'uuid',
              source_revision: 'integer',
              effect_key: 'text',
              currency_id: 'uuid',
              kind: 'text',
              economic_at: 'timestamptz',
              execution_id: 'uuid',
              fee_id: 'uuid',
              payload: 'jsonb',
            },
            eventRows,
          );
          await insert(
            client,
            workspaceId,
            'postings',
            {
              id: 'uuid',
              ledger_event_id: 'uuid',
              currency_id: 'uuid',
              cash_bucket_id: 'uuid',
              control_key: 'text',
              amount_raw: 'text',
            },
            postingRows,
          );
          await insert(
            client,
            workspaceId,
            'allocation_sets',
            {
              id: 'uuid',
              command_id: 'uuid',
              source_revision: 'integer',
              execution_id: 'uuid',
              version: 'integer',
              reason: 'text',
            },
            allocationRows,
          );
          await insert(
            client,
            workspaceId,
            'allocation_items',
            {
              id: 'uuid',
              allocation_set_id: 'uuid',
              trade_leg_id: 'uuid',
              quantity_raw: 'text',
              payload: 'jsonb',
            },
            itemRows,
          );
          await insert(
            client,
            workspaceId,
            'cost_attribution_sets',
            {
              id: 'uuid',
              command_id: 'uuid',
              source_revision: 'integer',
              fee_id: 'uuid',
              axis: 'text',
              version: 'integer',
              reason: 'text',
            },
            costSetRows,
          );
          await insert(
            client,
            workspaceId,
            'cost_allocations',
            {
              id: 'uuid',
              attribution_set_id: 'uuid',
              trade_leg_id: 'uuid',
              currency_id: 'uuid',
              amount_raw: 'text',
              payload: 'jsonb',
            },
            costRows,
          );
          const inventory = replayInventory({
            scope: {
              workspaceId,
              accountId: account.id,
              instrumentId: instrument.id,
              instrumentVersionId: instrument.versionId,
              unitVersionId: 'share',
              settlementCurrencyId: usd,
            },
            manifest: { ...INVENTORY_CALCULATION_MANIFEST, lotPolicyVersion: 'fifo-v1' },
            policy: 'fifo',
            capability: {
              subtype: instrument.family === 'stock' ? 'ordinary-share' : 'ordinary-etf',
              nativeInventory: true,
              shortSupported: false,
              averageCostSupported: true,
            },
            sources,
            sourceRevision: String(revision),
          });
          if (inventory.openQuantity.value !== '0' || inventory.status !== 'available')
            throw new Error('Fixture inventory replay is incomplete or non-flat');
          await insert(
            client,
            workspaceId,
            'holding_books',
            {
              id: 'uuid',
              account_id: 'uuid',
              instrument_id: 'uuid',
              instrument_version_id: 'uuid',
              inventory_method: 'text',
              source_revision: 'integer',
              state: 'jsonb',
            },
            [
              {
                id: bookId,
                account_id: account.id,
                instrument_id: instrument.id,
                instrument_version_id: instrument.versionId,
                inventory_method: 'fifo',
                source_revision: revision,
                state: inventory,
              },
            ],
          );
          await insert(
            client,
            workspaceId,
            'positions',
            {
              id: 'uuid',
              holding_book_id: 'uuid',
              quantity_raw: 'text',
              basis_raw: 'text',
              source_revision: 'integer',
              state: 'jsonb',
            },
            [
              {
                id: bookId,
                holding_book_id: bookId,
                quantity_raw: inventory.openQuantity.value,
                basis_raw: inventory.grossBasis.value,
                source_revision: revision,
                state: inventory,
              },
            ],
          );
          await insert(
            client,
            workspaceId,
            'lots',
            {
              id: 'uuid',
              holding_book_id: 'uuid',
              execution_id: 'uuid',
              direction: 'text',
              remaining_quantity_raw: 'text',
              source_revision: 'integer',
              state: 'jsonb',
            },
            inventory.lots.map((lot) => ({
              id: lot.id,
              holding_book_id: bookId,
              execution_id: lot.sourceId,
              direction: lot.direction,
              remaining_quantity_raw: lot.remainingQuantity,
              source_revision: revision,
              state: lot,
            })),
          );
          await insert(
            client,
            workspaceId,
            'lot_matches',
            {
              id: 'uuid',
              holding_book_id: 'uuid',
              opening_lot_id: 'uuid',
              closing_execution_id: 'uuid',
              quantity_raw: 'text',
              source_revision: 'integer',
              payload: 'jsonb',
            },
            inventory.matches.map((match) => ({
              id: randomUUID(),
              holding_book_id: bookId,
              opening_lot_id: match.lotId,
              closing_execution_id: match.closingSourceId,
              quantity_raw: match.quantity,
              source_revision: revision,
              payload: match,
            })),
          );
          await insert(
            client,
            workspaceId,
            'trade_closures',
            {
              id: 'uuid',
              command_id: 'uuid',
              source_revision: 'integer',
              trade_id: 'uuid',
              definition_version: 'text',
              confirmed_at: 'timestamptz',
              payload: 'jsonb',
            },
            closureRows,
          );
          await insert(
            client,
            workspaceId,
            'audit_events',
            { id: 'uuid', actor_id: 'text', action: 'text' },
            [{ id: auditId, actor_id: context.actorId, action: 'financial.performance-fixture' }],
          );
          await insert(
            client,
            workspaceId,
            'outbox_events',
            {
              id: 'uuid',
              command_id: 'uuid',
              source_revision: 'integer',
              event_kind: 'text',
              payload: 'jsonb',
            },
            [
              {
                id: randomUUID(),
                command_id: commandId,
                source_revision: revision,
                event_kind: 'financial.performance-fixture',
                payload: {},
              },
            ],
          );
          await insert(
            client,
            workspaceId,
            'financial_commands',
            {
              id: 'uuid',
              audit_event_id: 'uuid',
              idempotency_key: 'text',
              request_hash: 'text',
              kind: 'text',
              result: 'jsonb',
              source_revision: 'integer',
            },
            [
              {
                id: commandId,
                audit_event_id: auditId,
                idempotency_key: commandId,
                request_hash: createHash('sha256')
                  .update(JSON.stringify(executionRows))
                  .digest('hex'),
                kind: 'performance-fixture',
                result: { executions: executionRows.length },
                source_revision: revision,
              },
            ],
          );
          // Validate the expensive independent inventory trigger populations in
          // separate statements, preserving the normal 10-second timeout on
          // each statement. All sources/projections are complete at this point.
          for (const constraint of [
            'holding_books_quantity_conservation',
            'positions_quantity_conservation',
            'lots_quantity_conservation',
            'lot_matches_quantity_conservation',
          ])
            await client.query(`SET CONSTRAINTS app.${constraint} IMMEDIATE`);
          await client.query('SET CONSTRAINTS ALL IMMEDIATE');
          await client.query('COMMIT');
          const count = distributionCounts[accountIndex]!;
          count.trades += campaignIndexes.length;
          count.executions += executionRows.length;
          count.books++;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
      if (accountIndex % 10 === 0)
        console.log(
          JSON.stringify({
            event: 'performance.fixture.progress',
            databaseName,
            completedAccounts: accountIndex + 1,
            accounts: accounts.length,
          }),
        );
      if (accountIndex === 0 && preparationIndexes.length) {
        const planClient = await runtime.pool.connect();
        try {
          const queries = [
            {
              operation: 'constraint-allocation-set-conservation',
              text: 'SELECT sum(quantity),count(*) FILTER(WHERE trade_leg_id IS NULL) FROM app.allocation_items WHERE workspace_id=$1::uuid AND allocation_set_id=$2::uuid',
              id: uuid(seed, 'allocation:0:0'),
            },
            {
              operation: 'constraint-cost-set-conservation',
              text: "SELECT sum(amount),count(*) FILTER(WHERE trade_leg_id IS NULL AND lot_id IS NULL AND coalesce(payload->>'target','unassigned')='unassigned') FROM app.cost_allocations WHERE workspace_id=$1::uuid AND attribution_set_id=$2::uuid",
              id: uuid(seed, 'cost:0:0'),
            },
            {
              operation: 'constraint-fee-monetary-effect',
              text: 'SELECT count(DISTINCT e.id),sum(p.amount) FROM app.ledger_events e LEFT JOIN app.postings p ON p.workspace_id=e.workspace_id AND p.ledger_event_id=e.id AND p.cash_bucket_id IS NOT NULL WHERE e.workspace_id=$1::uuid AND e.fee_id=$2::uuid',
              id: uuid(seed, 'fee:0:0'),
            },
          ];
          for (const stage of ['before-preparation-analyze', 'after-preparation-analyze']) {
            if (stage === 'after-preparation-analyze')
              for (const table of [
                'executions',
                'fees',
                'ledger_events',
                'postings',
                'allocation_sets',
                'allocation_items',
                'cost_attribution_sets',
                'cost_allocations',
                'lots',
                'lot_matches',
                'trade_legs',
              ])
                await admin.pool.query(`ANALYZE app.${table}`);
            await planClient.query('BEGIN READ ONLY');
            await planClient.query(
              "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
              [context.actorId, workspaceId],
            );
            for (const query of queries) {
              const result = await planClient.query(
                `EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${query.text}`,
                [workspaceId, query.id],
              );
              preparationPlans.push({
                stage,
                operation: query.operation,
                plan: sanitizePlan(result.rows),
              });
            }
            await planClient.query('COMMIT');
          }
        } catch (error) {
          await planClient.query('ROLLBACK');
          throw error;
        } finally {
          planClient.release();
        }
      }
    }
    // Market observations use normal financial commands so revision-pinned reads
    // retain the same provenance and visibility as application-created sources.
    const observations = createFinancialObservations(services);
    for (let day = 0; day < 365; day++)
      await observations.recordFxObservation(context, {
        commandId: randomUUID(),
        baseCurrencyId: usd,
        quoteCurrencyId: eur,
        rate: canonical(decimalValue('0.9').plus(decimalValue(String(day % 17)).dividedBy('1000'))),
        observedAt: new Date(Date.UTC(2030, 0, 1 + day)).toISOString().replace('.000Z', '.000001Z'),
        source,
      });
    for (const instrument of instruments)
      await observations.recordPriceObservation(context, {
        commandId: randomUUID(),
        instrumentVersionId: instrument.versionId,
        currencyId: usd,
        price: '110.25',
        observedAt: '2030-01-01T00:00:00.000001Z',
        source,
      });
    for (const index of preparationIndexes) await admin.pool.query(`DROP INDEX app.${index.name}`);
    await admin.pool.query('ANALYZE');
    const counts: Record<string, number> = {};
    for (const table of [
      'accounts',
      'instruments',
      'trades',
      'trade_legs',
      'executions',
      'fees',
      'ledger_events',
      'postings',
      'allocation_sets',
      'allocation_items',
      'cost_attribution_sets',
      'cost_allocations',
      'holding_books',
      'positions',
      'lots',
      'lot_matches',
      'trade_closures',
      'financial_commands',
      'outbox_events',
      'fx_observations',
      'price_observations',
    ]) {
      const result = await admin.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM app.${table} WHERE workspace_id=$1::uuid`,
        [workspaceId],
      );
      counts[table] = Number(result.rows[0]!.count);
    }
    if (
      counts.trades !== options.trades ||
      counts.executions !== options.executions ||
      counts.fees !== options.executions ||
      counts.postings !== options.executions * 4 + accounts.length * 2 ||
      counts.lots !== options.executions / 2 ||
      counts.lot_matches !== options.executions / 2
    )
      throw new Error(
        'Performance fixture SQL counts do not match the requested complete projections',
      );
    // Independent fixed-unit oracle: 1.25 units at 100.125, sold at 90.875 or
    // 120.375, minus one exact 0.0125 commission per fill. No production arithmetic
    // helper generates the expected P&L; all sources fit units of USD 0.0001.
    let expectedUnits = 0n;
    for (let index = 0; index < options.trades; index++)
      expectedUnits += (index % 3 === 0 ? -115625n : 253125n) - BigInt(fillsPerTrade) * 125n;
    const fixedText = (units: bigint) => {
      const negative = units < 0n;
      const magnitude = negative ? -units : units;
      const fraction = String(magnitude % 10000n)
        .padStart(4, '0')
        .replace(/0+$/, '');
      return `${negative ? '-' : ''}${magnitude / 10000n}${fraction ? `.${fraction}` : ''}`;
    };
    const expectedNativeRealizedNet = fixedText(expectedUnits);
    const expectedNativeCash = fixedText(BigInt(accounts.length) * 1000000000n + expectedUnits);
    const validationClient = await runtime.pool.connect();
    let validation: PerformanceManifest['validation'];
    try {
      await validationClient.query('BEGIN READ ONLY');
      await validationClient.query(
        "SELECT set_config('app.user_id',$1,true),set_config('app.workspace_id',$2,true)",
        [context.actorId, workspaceId],
      );
      const checked = await validationClient.query<{
        role: string;
        superuser: boolean;
        bypassrls: boolean;
        projected: string;
        cash: string;
        pnl_matches: boolean;
        cash_matches: boolean;
        disabled: number;
        remaining_indexes: number;
      }>(
        `SELECT current_user AS role,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,
          (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypassrls,
          projection.total::text AS projected,cash.total::text AS cash,
          projection.total=$2::numeric AS pnl_matches,cash.total=$3::numeric AS cash_matches,
          (SELECT count(*)::integer FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND NOT t.tgisinternal AND t.tgenabled='D') AS disabled,
          (SELECT count(*)::integer FROM pg_indexes WHERE schemaname='app' AND indexname LIKE 'performance_seed_%') AS remaining_indexes
        FROM (SELECT sum((state->'realizedNet'->>'value')::numeric) AS total FROM app.holding_books WHERE workspace_id=$1::uuid) projection,
          (SELECT sum(amount) AS total FROM app.postings WHERE workspace_id=$1::uuid AND cash_bucket_id IS NOT NULL) cash`,
        [workspaceId, expectedNativeRealizedNet, expectedNativeCash],
      );
      const row = checked.rows[0]!;
      if (
        row.role !== 'journal_app' ||
        row.superuser ||
        row.bypassrls ||
        row.disabled !== 0 ||
        !row.pnl_matches ||
        !row.cash_matches ||
        row.remaining_indexes !== 0
      )
        throw new Error('Fixture restricted-role independent cash/P&L/trigger validation failed');
      validation = {
        runtimeRole: row.role,
        disabledApplicationTriggers: row.disabled,
        expectedNativeRealizedNet,
        projectedNativeRealizedNet: row.projected,
        expectedNativeCash,
        actualNativeCash: row.cash,
        remainingPreparationIndexes: row.remaining_indexes,
      };
      await validationClient.query('COMMIT');
    } catch (error) {
      await validationClient.query('ROLLBACK');
      throw error;
    } finally {
      validationClient.release();
    }
    const observed = await admin.pool.query<{ revision: number; recorded_at: string }>(
      `SELECT revision,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recorded_at FROM app.financial_state WHERE workspace_id=$1::uuid`,
      [workspaceId],
    );
    const manifest: PerformanceManifest = {
      schemaVersion: 1,
      seed,
      databaseName,
      distribution: options.distribution,
      trades: options.trades,
      executions: options.executions,
      setupMilliseconds: performance.now() - start,
      workspaceId,
      actorId: context.actorId,
      email: bindings.email,
      accountIds: accounts.map((account) => account.id),
      boundedAccountId: accounts[0]!.id,
      reportingCurrencyId: eur,
      executionCurrencyId: usd,
      from,
      to,
      metadataAsOf: observed.rows[0]!.recorded_at,
      sourceRevision: String(observed.rows[0]!.revision),
      timezone: 'UTC',
      tradeIds: sampleTradeIds,
      counts,
      distributionCounts,
      fxPolicy: {
        id: 'performance-fixture-v1',
        maxAgeMilliseconds: 31_536_000_000,
        sourcePriority: [source],
      },
      priceSourcePriority: [source],
      priceMaxAgeMilliseconds: 31_536_000_000,
      privateBindingsPath,
      validation,
      preparationOnlyIndexes: preparationIndexes.map(
        (index) => `app.${index.table}(${index.columns})`,
      ),
      preparationPlans,
      omissions: [
        'No imports, attachments, strategy versions, original-risk plans, corrections, transfers, orders, income or withholding in bulk history; those paths retain correctness-suite coverage, not large-fixture performance claims.',
        'Controlled bulk SQL prepares consistent source facts and actual domain projections; setup duration is not application command/import write throughput.',
        'Each book batch records trades, legs, fills, allocations and reviewed flat closures in one synthetic atomic command; it does not reproduce separate UI command history. The final population is long, fully allocated, closed and settled. Historical as-of cutoffs can replay actual open/partial phases; separate ongoing campaigns, short inventory, late costs and fees in another currency are absent.',
        'Synthetic source evidence explicitly books exact quantity-times-price principal beyond the normal cent estimate, retaining the reviewed actual principal, currency convention, derived cent principal and variance.',
        'Large/concentrated fixture preparation may temporarily create ordinary helper indexes for active conservation triggers; every helper index is dropped and its absence verified before ANALYZE and benchmark readiness. Preparation time is separate and all measured requests use only the migration-defined indexes.',
        'Allocation items intentionally retain the supported legacy empty principal payload; current read services reconstruct principal using the complete conserved weights. This shape is consistent across the dataset matrix and exercises historical-read fallback, not current allocation-write throughput.',
      ],
    };
    if (options.outputPath) {
      await mkdir(dirname(resolve(options.outputPath)), { recursive: true });
      await writeFile(options.outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    return manifest;
  } finally {
    await Promise.all([services.close(), runtime.close(), admin.close()]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = (name: string) => {
    const at = process.argv.indexOf(`--${name}`);
    return at < 0 ? undefined : process.argv[at + 1];
  };
  try {
    const distribution = value('distribution') ?? 'distributed';
    if (distribution !== 'distributed' && distribution !== 'concentrated')
      throw new Error('Invalid fixture distribution');
    const seed = value('seed');
    const outputPath = value('output');
    const instrumentCount = value('instruments');
    const manifest = await createPerformanceDataset({
      trades: Number(value('trades') ?? 1000),
      executions: Number(value('executions') ?? 2000),
      distribution,
      ...(seed ? { seed } : {}),
      ...(outputPath ? { outputPath } : {}),
      ...(instrumentCount ? { instrumentCount: Number(instrumentCount) } : {}),
    });
    console.log(
      JSON.stringify({
        event: 'performance.fixture.ready',
        databaseName: manifest.databaseName,
        counts: manifest.counts,
        setupMilliseconds: manifest.setupMilliseconds,
      }),
    );
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error ? String(error.code) : 'ERROR';
    console.error(
      JSON.stringify({
        event: 'performance.fixture.failed',
        code,
        message:
          error instanceof Error && !('code' in error)
            ? error.message
            : 'Fixture construction failed; database retained for isolated diagnosis.',
      }),
    );
    process.exitCode = 1;
  }
}
