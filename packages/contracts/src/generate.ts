import './openapi-setup.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  zodToOpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';
import openapiTS, { astToString } from 'openapi-typescript';
import {
  healthResponseSchema,
  readyResponseSchema,
  sessionResponseSchema,
  workspaceResponseSchema,
  workspaceListResponseSchema,
  workspacePreferencesUpdateSchema,
  signInSchema,
  problemResponseSchema,
  authActionResponseSchema,
  changePasswordSchema,
  revokeSessionSchema,
  safeSessionListResponseSchema,
} from './index.js';
import { z } from 'zod';
import * as financial from './financial.js';
import * as strategies from './strategies.js';
import * as strategyAttachments from './strategy-attachments.js';
import * as journal from './journal.js';
import * as accounting from './accounting.js';
import * as analytics from './analytics.js';
import * as dashboard from './dashboard.js';
import * as imports from './imports.js';
import * as risk from './risk.js';
import * as reconciliation from './reconciliation.js';
import * as portability from './portability.js';
import * as periodReviews from './period-reviews.js';
import * as supplied from './supplied.js';
import * as outbox from './outbox.js';
import * as displayViews from './display-views.js';

const registry = new OpenAPIRegistry();
function registerSharedSchema(name: string, schema: z.ZodType): void {
  const named = registry.register(name, schema);
  // register() clones schemas; retain its naming on the shared source instance too,
  // so nested uses refer to one definition rather than expanding large financial DTOs.
  const metadata = zodToOpenAPIRegistry.get(named);
  if (metadata) zodToOpenAPIRegistry.add(schema, metadata);
}
registry.registerComponent('securitySchemes', 'sessionCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: 'journal.session_token',
  description: 'HttpOnly server session cookie; secure prefix applies in production.',
});
const schemas = {
  HealthResponse: healthResponseSchema,
  ReadyResponse: readyResponseSchema,
  SessionResponse: sessionResponseSchema,
  WorkspaceResponse: workspaceResponseSchema,
  WorkspaceListResponse: workspaceListResponseSchema,
  WorkspacePreferencesUpdateInput: workspacePreferencesUpdateSchema,
  SignInInput: signInSchema,
  Problem: problemResponseSchema,
  AuthActionResponse: authActionResponseSchema,
  ChangePasswordInput: changePasswordSchema,
  RevokeSessionInput: revokeSessionSchema,
  SafeSessionListResponse: safeSessionListResponseSchema,
};
for (const [name, schema] of Object.entries(schemas)) registry.register(name, schema);
registerSharedSchema('FinancialJson', financial.financialJsonSchema);
for (const [name, schema] of Object.entries(financial.financialSchemaComponents))
  registerSharedSchema(name, schema);
for (const [name, schema] of Object.entries(financial)) {
  if (
    name !== 'financialJsonSchema' &&
    name.endsWith('Schema') &&
    schema instanceof z.ZodType &&
    !name.endsWith('QuerySchema')
  )
    registerSharedSchema(
      name.charAt(0).toUpperCase() + name.slice(1).replace(/Schema$/u, ''),
      schema,
    );
}
for (const [name, schema] of Object.entries(strategies.strategySchemaComponents))
  registerSharedSchema(name, schema);
for (const [name, schema] of Object.entries(journal.journalSchemaComponents))
  registerSharedSchema(name, schema);
for (const [name, schema] of Object.entries(accounting.accountingSchemaComponents))
  registerSharedSchema(name, schema);
for (const collection of [
  strategies,
  strategyAttachments,
  journal,
  accounting,
  risk,
  periodReviews,
  supplied,
  outbox,
  displayViews,
  reconciliation,
  portability,
])
  for (const [name, schema] of Object.entries(collection)) {
    if (name.endsWith('Schema') && schema instanceof z.ZodType && !name.endsWith('QuerySchema'))
      registerSharedSchema(
        name.charAt(0).toUpperCase() + name.slice(1).replace(/Schema$/u, ''),
        schema,
      );
  }
for (const [name, schema] of Object.entries(analytics.analyticsSchemaComponents))
  registerSharedSchema(name, schema);
for (const [name, schema] of Object.entries(analytics))
  if (name.endsWith('Schema') && schema instanceof z.ZodType)
    registerSharedSchema(
      name.charAt(0).toUpperCase() + name.slice(1).replace(/Schema$/u, ''),
      schema,
    );
for (const [name, schema] of Object.entries(imports))
  if (name.endsWith('Schema') && schema instanceof z.ZodType)
    registerSharedSchema(
      name.charAt(0).toUpperCase() + name.slice(1).replace(/Schema$/u, ''),
      schema,
    );
const response = (schema: z.ZodType) => ({
  description: 'Validated application DTO',
  content: { 'application/json': { schema } },
});
const problem = {
  description: 'Safe problem details; no credentials or database diagnostics',
  content: { 'application/problem+json': { schema: problemResponseSchema } },
};
const strategyPrefix = '/api/v1/workspaces/{workspaceId}/strategies';
const strategyCollectionParams = z.strictObject({ workspaceId: financial.financialIdSchema });
registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{workspaceId}/dashboard/catalog',
  security: [{ sessionCookie: [] }],
  request: { params: strategyCollectionParams },
  responses: {
    200: response(dashboard.dashboardCatalogSchema),
    400: problem,
    401: problem,
    404: problem,
    409: problem,
    500: problem,
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{workspaceId}/dashboard/reports',
  security: [{ sessionCookie: [] }],
  description:
    'Coherent read-only dashboard: campaign filters apply to every trade metric; account equity is unavailable under trade-only filters. Raw equity and capital-adjusted monetary performance are separate.',
  request: {
    params: strategyCollectionParams,
    body: {
      required: true,
      content: { 'application/json': { schema: dashboard.dashboardRequestSchema } },
    },
  },
  responses: {
    200: response(dashboard.dashboardResponseSchema),
    400: problem,
    401: problem,
    404: problem,
    409: problem,
    413: problem,
    415: problem,
    422: problem,
    500: problem,
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{workspaceId}/analytics/reports',
  security: [{ sessionCookie: [] }],
  description:
    'Read-only viewer/editor/owner campaign-attribution analytics. This bounded JSON query never writes financial revisions. Completed behavioral samples and lifetime-as-of monetary populations are explicit. Every metric declares its mathematical definition, unit, currency, sample and missing evidence; campaign drawdown is not an account equity return.',
  request: {
    params: strategyCollectionParams,
    body: {
      required: true,
      content: { 'application/json': { schema: analytics.analyticsReportRequestSchema } },
    },
  },
  responses: {
    200: response(analytics.analyticsReportResponseSchema),
    400: problem,
    401: problem,
    403: problem,
    404: problem,
    409: problem,
    413: problem,
    415: problem,
    422: problem,
    500: problem,
  },
});
const strategyIdentityParams = strategyCollectionParams.extend({
  strategyId: financial.financialIdSchema,
});
const strategyVersionParams = strategyIdentityParams.extend({
  versionId: financial.financialIdSchema,
});
const strategyMutationHeaders = z.object({
  Origin: z.url(),
  'X-CSRF-Token': z.string().min(1),
});
const strategyProblems = {
  400: problem,
  401: problem,
  403: problem,
  404: problem,
  409: problem,
  413: problem,
  415: problem,
  422: problem,
  500: problem,
};
for (const [suffix, params, query, output] of [
  ['/native-snapshot', strategyCollectionParams, undefined, outbox.nativeSnapshotStatusSchema],
  [
    '',
    strategyCollectionParams,
    strategies.strategyListQuerySchema,
    strategies.strategyListResponseSchema,
  ],
  ['/{strategyId}', strategyIdentityParams, undefined, strategies.strategyResponseSchema],
  [
    '/{strategyId}/versions',
    strategyIdentityParams,
    strategies.strategyVersionsQuerySchema,
    strategies.strategyVersionListResponseSchema,
  ],
  [
    '/{strategyId}/versions/{versionId}',
    strategyVersionParams,
    undefined,
    strategies.strategyVersionResponseSchema,
  ],
  [
    '/{strategyId}/trades',
    strategyIdentityParams,
    strategies.strategyTradesQuerySchema,
    strategies.strategyTradesResponseSchema,
  ],
] as const)
  registry.registerPath({
    method: 'get',
    path: strategyPrefix + suffix,
    security: [{ sessionCookie: [] }],
    description:
      'Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page.',
    request: { params, ...(query ? { query } : {}) },
    responses: { 200: response(output), ...strategyProblems },
  });
for (const [method, suffix, params, input, output] of [
  [
    'post',
    '',
    strategyCollectionParams,
    strategies.strategyCreateSchema,
    strategies.strategyResponseSchema,
  ],
  [
    'put',
    '/{strategyId}',
    strategyIdentityParams,
    strategies.strategyUpdateSchema,
    strategies.strategyResponseSchema,
  ],
  [
    'delete',
    '/{strategyId}',
    strategyIdentityParams,
    strategies.strategyArchiveSchema,
    strategies.strategyResponseSchema,
  ],
  [
    'post',
    '/{strategyId}/trade-links',
    strategyIdentityParams,
    strategies.strategyTradeLinkCreateSchema,
    strategies.strategyTradeLinkResponseSchema,
  ],
] as const)
  registry.registerPath({
    method,
    path: strategyPrefix + suffix,
    security: [{ sessionCookie: [] }],
    description:
      'Editor/owner strategy command. Definitions are complete immutable snapshots, bounded to 196608 UTF-8 bytes; JSON request bodies are bounded to 262144 bytes. Changes append a version and never rewrite historical trade references. Deletion archives the identity. Late trade classification is explicitly retrospective.',
    request: {
      params,
      headers: strategyMutationHeaders,
      body: { required: true, content: { 'application/json': { schema: input } } },
    },
    responses: { 200: response(output), ...strategyProblems },
  });
const attachmentPrefixes = [
  '/api/v1/workspaces/{workspaceId}/strategy-attachments',
  '/api/v1/workspaces/{workspaceId}/journal-attachments',
];
const attachmentIdentityParams = strategyCollectionParams.extend({
  attachmentId: financial.financialIdSchema,
});
const binarySchema = z.string().openapi({ format: 'binary' });
const attachmentBinaryContent = Object.fromEntries(
  ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].map((mediaType) => [
    mediaType,
    { schema: binarySchema },
  ]),
);
for (const attachmentPrefix of attachmentPrefixes) {
  registry.registerPath({
    method: 'post',
    path: attachmentPrefix,
    security: [{ sessionCookie: [] }],
    description:
      'Upload immutable workspace-owned PNG, JPEG, WebP or PDF content, at most 10485760 bytes. X-File-Name is URI-component encoded. Repeated identical Idempotency-Key returns the original metadata; different contents conflict.',
    request: {
      params: strategyCollectionParams,
      headers: strategyMutationHeaders.extend({
        'Idempotency-Key': financial.financialIdSchema,
        'X-File-Name': z.string().min(1).max(1440),
      }),
      body: { required: true, content: attachmentBinaryContent },
    },
    responses: {
      201: response(strategyAttachments.strategyAttachmentResponseSchema),
      ...strategyProblems,
    },
  });
  registry.registerPath({
    method: 'get',
    path: attachmentPrefix,
    security: [{ sessionCookie: [] }],
    request: {
      params: strategyCollectionParams,
      query: strategyAttachments.strategyAttachmentListQuerySchema,
    },
    responses: {
      200: response(strategyAttachments.strategyAttachmentListResponseSchema),
      ...strategyProblems,
    },
  });
  registry.registerPath({
    method: 'get',
    path: attachmentPrefix + '/{attachmentId}',
    security: [{ sessionCookie: [] }],
    description:
      'Authenticated immutable attachment read. Images may be displayed inline; PDF files are always downloaded. Content is private, uncached, sandboxed and protected from MIME sniffing.',
    request: { params: attachmentIdentityParams },
    responses: {
      200: {
        description: 'Original uploaded content after workspace authorization.',
        content: attachmentBinaryContent,
        headers: {
          'Content-Disposition': {
            schema: { type: 'string' },
            description: 'Safe inline image or attachment download filename.',
          },
          'Content-Security-Policy': {
            schema: { type: 'string' },
            description: 'Sandboxed untrusted content.',
          },
          'X-Content-Type-Options': { schema: { type: 'string', const: 'nosniff' } },
          'Cache-Control': { schema: { type: 'string', const: 'private, no-store' } },
        },
      },
      ...strategyProblems,
    },
  });
  registry.registerPath({
    method: 'delete',
    path: attachmentPrefix + '/{attachmentId}',
    security: [{ sessionCookie: [] }],
    description:
      'Delete only unreferenced attachment content. Any immutable strategy version, journal revision or published plan reference returns 409, including archived trades and strategies.',
    request: { params: attachmentIdentityParams, headers: strategyMutationHeaders },
    responses: { 204: { description: 'Unreferenced attachment deleted.' }, ...strategyProblems },
  });
}
const journalPrefix = '/api/v1/workspaces/{workspaceId}/journals';
const journalIdentityParams = strategyCollectionParams.extend({
  tradeId: financial.financialIdSchema,
});
const journalRevisionParams = journalIdentityParams.extend({
  revisionId: financial.financialIdSchema,
});
for (const [suffix, params, query, output] of [
  ['', strategyCollectionParams, journal.journalListQuerySchema, journal.journalListResponseSchema],
  ['/{tradeId}', journalIdentityParams, undefined, journal.journalDetailResponseSchema],
  [
    '/{tradeId}/plans',
    journalIdentityParams,
    journal.journalPlansQuerySchema,
    journal.journalPlansResponseSchema,
  ],
  [
    '/{tradeId}/risk-additions',
    journalIdentityParams,
    journal.journalRiskAdditionsQuerySchema,
    journal.journalRiskAdditionsResponseSchema,
  ],
  [
    '/{tradeId}/revisions',
    journalIdentityParams,
    journal.journalRevisionsQuerySchema,
    journal.journalRevisionsResponseSchema,
  ],
  [
    '/{tradeId}/revisions/{revisionId}',
    journalRevisionParams,
    undefined,
    journal.journalRevisionResponseSchema,
  ],
] as const)
  registry.registerPath({
    method: 'get',
    path: journalPrefix + suffix,
    security: [{ sessionCookie: [] }],
    description:
      'Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page.',
    request: { params, ...(query ? { query } : {}) },
    responses: { 200: response(output), ...strategyProblems },
  });
for (const [method, suffix, params, input, output] of [
  [
    'post',
    '',
    strategyCollectionParams,
    journal.journalCreateSchema,
    journal.journalDetailResponseSchema,
  ],
  [
    'put',
    '/{tradeId}',
    journalIdentityParams,
    journal.journalSaveSchema,
    journal.journalEntryResponseSchema,
  ],
  [
    'post',
    '/{tradeId}/plans',
    journalIdentityParams,
    journal.journalPublishPlanSchema,
    journal.journalPlanVersionResponseSchema,
  ],
  [
    'post',
    '/{tradeId}/risk-additions',
    journalIdentityParams,
    journal.journalRiskAdditionSchema,
    journal.journalRiskAdditionResponseSchema,
  ],
] as const)
  registry.registerPath({
    method,
    path: journalPrefix + suffix,
    security: [{ sessionCookie: [] }],
    description:
      'Editor/owner journal command with optimistic revision checks. Identical retries with the same Idempotency-Key return the committed command response; changed contents conflict. Complete journal documents are bounded to 131072 UTF-8 bytes and JSON requests to 262144 bytes. Saves append immutable revisions without changing ledger balances. Publication freezes the original server-timed plan and risk; later plans and separate risk additions never rewrite the historical R denominator.',
    request: {
      params,
      headers: strategyMutationHeaders.extend({
        'Idempotency-Key': financial.financialIdSchema,
      }),
      body: { required: true, content: { 'application/json': { schema: input } } },
    },
    responses: { 200: response(output), ...strategyProblems },
  });
const accountingPrefix = '/api/v1/workspaces/{workspaceId}/accounting';
const portfolioIdentityParams = strategyCollectionParams.extend({
  portfolioId: financial.financialIdSchema,
});
const cashTransferIdentityParams = strategyCollectionParams.extend({
  transferId: financial.financialIdSchema,
});
const accountingSourceIdentityParams = strategyCollectionParams.extend({
  sourceId: financial.financialIdSchema,
});
for (const [suffix, params, query, output] of [
  [
    '/portfolios',
    strategyCollectionParams,
    accounting.portfolioListQuerySchema,
    accounting.portfolioListResponseSchema,
  ],
  [
    '/portfolios/{portfolioId}',
    portfolioIdentityParams,
    undefined,
    accounting.portfolioResponseSchema,
  ],
  [
    '/portfolios/{portfolioId}/versions',
    portfolioIdentityParams,
    accounting.portfolioVersionsQuerySchema,
    accounting.portfolioVersionListResponseSchema,
  ],
  [
    '/transfers',
    strategyCollectionParams,
    accounting.cashTransferListQuerySchema,
    accounting.cashTransferListResponseSchema,
  ],
  [
    '/corrections',
    strategyCollectionParams,
    accounting.accountingCorrectionSourcesQuerySchema,
    accounting.accountingCorrectionSourcesResponseSchema,
  ],
] as const)
  registry.registerPath({
    method: 'get',
    path: accountingPrefix + suffix,
    security: [{ sessionCookie: [] }],
    description:
      'Workspace-scoped immutable portfolio definitions and owned-account cash transfer evidence. Lists are cursor-paginated, at most 100 entries per page. Transfer status can be read at an explicit economic boundary.',
    request: { params, ...(query ? { query } : {}) },
    responses: { 200: response(output), ...strategyProblems, 429: problem },
  });
for (const [suffix, params, input, output] of [
  [
    '/native-snapshot/refresh',
    strategyCollectionParams,
    outbox.nativeSnapshotRefreshRequestSchema,
    accounting.accountingMutationResponseSchema,
  ],
  [
    '/corrections/{sourceId}/reverse',
    accountingSourceIdentityParams,
    accounting.reverseAccountingSourceRequestSchema,
    accounting.accountingMutationResponseSchema,
  ],
  [
    '/portfolios',
    strategyCollectionParams,
    accounting.createPortfolioRequestSchema,
    accounting.portfolioMutationResponseSchema,
  ],
  [
    '/portfolios/{portfolioId}',
    portfolioIdentityParams,
    accounting.updatePortfolioRequestSchema,
    accounting.portfolioMutationResponseSchema,
  ],
  [
    '/portfolios/{portfolioId}/archive',
    portfolioIdentityParams,
    accounting.archivePortfolioRequestSchema,
    accounting.portfolioMutationResponseSchema,
  ],
  [
    '/income',
    strategyCollectionParams,
    accounting.recordIncomeRequestSchema,
    accounting.accountingMutationResponseSchema,
  ],
  [
    '/taxes',
    strategyCollectionParams,
    accounting.recordTaxRequestSchema,
    accounting.accountingMutationResponseSchema,
  ],
  [
    '/expenses',
    strategyCollectionParams,
    accounting.recordExpenseRequestSchema,
    accounting.accountingMutationResponseSchema,
  ],
  [
    '/transfers',
    strategyCollectionParams,
    accounting.createCashTransferRequestSchema,
    accounting.accountingMutationResponseSchema,
  ],
  [
    '/transfers/{transferId}/receipt',
    cashTransferIdentityParams,
    accounting.receiveCashTransferRequestSchema,
    accounting.accountingMutationResponseSchema,
  ],
] as const)
  registry.registerPath({
    method: 'post',
    path: accountingPrefix + suffix,
    security: [{ sessionCookie: [] }],
    description:
      'Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.',
    request: {
      params,
      headers: strategyMutationHeaders.extend({
        'Idempotency-Key': financial.financialIdSchema,
      }),
      body: { required: true, content: { 'application/json': { schema: input } } },
    },
    responses: { 200: response(output), ...strategyProblems, 429: problem },
  });
registry.registerPath({
  method: 'post',
  path: accountingPrefix + '/reports',
  security: [{ sessionCookie: [] }],
  description:
    'Read-only accounting report available to viewers. Select exactly one explicit account population or immutable portfolio version and a reporting currency. The period is (from,to], with complete opening and closing boundaries. Source revision, FX policy and price freshness/source priorities are explicit. Monetary amounts are lossless decimal strings. Missing evidence produces null totals with known subtotals and explanations; reconciliation variance is retained rather than relabeled as FX or profit. This POST performs no mutation and requires no mutation CSRF proof or idempotency key.',
  request: {
    params: strategyCollectionParams,
    body: {
      required: true,
      content: { 'application/json': { schema: accounting.accountingReportRequestSchema } },
    },
  },
  responses: {
    200: response(accounting.accountingReportResponseSchema),
    ...strategyProblems,
    429: problem,
  },
});
registry.registerPath({
  method: 'post',
  path: accountingPrefix + '/performance',
  security: [{ sessionCookie: [] }],
  description:
    'Read-only account performance at explicit valuation checkpoints. Flow-adjusted changes and conditional TWR/MWR retain completeness and uniqueness requirements.',
  request: {
    params: strategyCollectionParams,
    body: {
      required: true,
      content: { 'application/json': { schema: accounting.accountPerformanceRequestSchema } },
    },
  },
  responses: {
    200: response(accounting.accountPerformanceResponseSchema),
    ...strategyProblems,
    429: problem,
  },
});
for (const method of ['get', 'post'] as const)
  registry.registerPath({
    method,
    path: '/api/v1/workspaces/{workspaceId}/display-views/{screen}',
    security: [{ sessionCookie: [] }],
    description:
      'Private per-member saved filters and column preferences. Workspace viewers may edit their own preferences. Optimistic revisions prevent overwriting another session.',
    request: {
      params: z.object({
        workspaceId: financial.financialIdSchema,
        screen: displayViews.displayViewScreenSchema,
      }),
      ...(method === 'post'
        ? {
            headers: z.object({ Origin: z.url(), 'X-CSRF-Token': z.string().min(1) }),
            body: {
              required: true,
              content: { 'application/json': { schema: displayViews.displayViewWriteSchema } },
            },
          }
        : {}),
    },
    responses: { 200: response(displayViews.displayViewResponseSchema), ...strategyProblems },
  });
const financialCommands = {
  currencies: [financial.currencyCreateSchema, financial.currencyResponseSchema],
  brokers: [financial.brokerCreateSchema, financial.brokerResponseSchema],
  accounts: [financial.accountCreateSchema, financial.accountResponseSchema],
  instruments: [financial.instrumentCreateSchema, financial.instrumentResponseSchema],
  orders: [financial.orderCreateSchema, financial.orderResponseSchema],
  trades: [financial.tradeCreateSchema, financial.tradeResponseSchema],
  'trade-legs': [financial.tradeLegCreateSchema, financial.tradeLegResponseSchema],
  'cash-buckets': [financial.cashBucketCreateSchema, financial.cashBucketResponseSchema],
  'cash-movements': [financial.cashMovementCreateSchema, financial.financialMutationResponseSchema],
  fees: [financial.feeCreateSchema, financial.financialMutationResponseSchema],
  'fx-conversions': [financial.fxConversionCreateSchema, financial.fxConversionResponseSchema],
  'bucket-movements': [
    financial.bucketMovementCreateSchema,
    financial.financialMutationResponseSchema,
  ],
  executions: [financial.executionCreateSchema, financial.executionResponseSchema],
  'opening-lots': [financial.openingLotCreateSchema, financial.financialMutationResponseSchema],
  'execution-corrections': [financial.executionCorrectionSchema, financial.executionResponseSchema],
  'execution-allocations': [
    financial.executionAllocationSchema,
    financial.allocationMutationResponseSchema,
  ],
  'fx-observations': [
    financial.fxObservationCreateSchema,
    financial.financialMutationResponseSchema,
  ],
  'price-observations': [
    financial.priceObservationCreateSchema,
    financial.financialMutationResponseSchema,
  ],
  'account-valuations': [
    financial.accountValuationObservationCreateSchema,
    financial.financialMutationResponseSchema,
  ],
  'holding-transfers': [
    financial.holdingTransferCreateSchema,
    financial.financialMutationResponseSchema,
  ],
  'fee-attributions': [
    financial.feeAttributionCreateSchema,
    financial.allocationMutationResponseSchema,
  ],
  'trades/{id}/closures': [
    financial.tradeClosureCreateSchema,
    financial.tradeClosureResponseSchema,
  ],
  'trades/{id}/cancellations': [financial.archiveFinancialSchema, financial.tradeResponseSchema],
  'currencies/{id}/conventions': [
    financial.currencyConventionCreateSchema,
    financial.currencyResponseSchema,
  ],
  'accounts/{id}/settings': [
    financial.accountSettingsCreateSchema,
    financial.accountResponseSchema,
  ],
  'instruments/{id}/versions': [
    financial.instrumentVersionCreateSchema,
    financial.instrumentResponseSchema,
  ],
  'orders/{id}/amendments': [financial.orderAmendSchema, financial.orderResponseSchema],
} as const;
for (const resource of ['currencies', 'brokers', 'accounts', 'instruments', 'trades']) {
  registry.registerPath({
    method: 'post',
    path: `/api/v1/workspaces/{workspaceId}/financial/${resource}/{id}/archive`,
    security: [{ sessionCookie: [] }],
    request: {
      params: z.object({
        workspaceId: financial.financialIdSchema,
        id: financial.financialIdSchema,
      }),
      headers: z.object({
        Origin: z.url(),
        'X-CSRF-Token': z.string().min(1),
        'Idempotency-Key': financial.financialIdSchema,
      }),
      body: {
        required: true,
        content: { 'application/json': { schema: financial.archiveFinancialSchema } },
      },
    },
    responses: {
      200: response(financial.catalogArchiveResponseSchema),
      400: problem,
      401: problem,
      403: problem,
      404: problem,
      409: problem,
      413: problem,
      415: problem,
      422: problem,
      500: problem,
    },
  });
}
for (const [resource, [input, output]] of Object.entries(financialCommands)) {
  registry.registerPath({
    method: 'post',
    path: `/api/v1/workspaces/{workspaceId}/financial/${resource}`,
    security: [{ sessionCookie: [] }],
    description:
      'Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.',
    request: {
      params: resource.includes('{id}')
        ? z.object({ workspaceId: financial.financialIdSchema, id: financial.financialIdSchema })
        : z.object({ workspaceId: financial.financialIdSchema }),
      headers: z.object({
        Origin: z.url(),
        'X-CSRF-Token': z.string().min(1),
        'Idempotency-Key': financial.financialIdSchema,
      }),
      body: { required: true, content: { 'application/json': { schema: input } } },
    },
    responses: {
      200: response(output),
      400: problem,
      401: problem,
      403: problem,
      404: problem,
      409: problem,
      413: problem,
      415: problem,
      422: problem,
      500: problem,
    },
  });
}
const financialReads = {
  currencies: financial.currencyResponseSchema.array(),
  brokers: financial.brokerResponseSchema.array(),
  accounts: financial.accountResponseSchema.array(),
  instruments: financial.instrumentResponseSchema.array(),
  orders: financial.orderResponseSchema.array(),
  trades: financial.tradeResponseSchema.array(),
  executions: financial.executionResponseSchema.array(),
  positions: financial.positionResponseSchema.array(),
  'cash-balances': financial.cashBalanceResponseSchema.array(),
  fees: financial.currencyAmountResponseSchema.array(),
  valuation: financial.financialValuationResponseSchema,
  'currencies/{id}': financial.currencyResponseSchema,
  'accounts/{id}': financial.accountResponseSchema,
  'instruments/{id}': financial.instrumentResponseSchema,
  'instrument-versions/{id}': financial.instrumentResponseSchema,
  'orders/{id}': financial.orderResponseSchema,
  'trades/{id}/legs': financial.tradeLegResponseSchema.array(),
  'trades/{id}': financial.tradeResponseSchema,
  'executions/{id}/allocations': financial.executionAllocationResponseSchema,
  'campaign-inventory': financial.campaignInventoryResponseSchema,
  'account-valuations': financial.accountValuationObservationResponseSchema.array(),
};
const financialReadQueries: Record<string, z.ZodObject> = {
  currencies: financial.financialCatalogQuerySchema,
  brokers: financial.financialCatalogQuerySchema,
  accounts: financial.financialAccountQuerySchema,
  instruments: financial.financialCatalogQuerySchema,
  orders: financial.financialCatalogQuerySchema,
  trades: financial.financialTradeQuerySchema,
  executions: financial.financialExecutionsQuerySchema,
  positions: financial.financialPositionsQuerySchema,
  'cash-balances': financial.financialCashBalancesQuerySchema,
  fees: financial.financialFeesQuerySchema,
  valuation: financial.financialValuationQuerySchema,
  'campaign-inventory': financial.financialCampaignInventoryQuerySchema,
  'account-valuations': financial.financialAccountValuationsQuerySchema,
};
for (const [resource, output] of Object.entries(financialReads)) {
  registry.registerPath({
    method: 'get',
    path: `/api/v1/workspaces/{workspaceId}/financial/${resource}`,
    security: [{ sessionCookie: [] }],
    request: {
      ...(financialReadQueries[resource] ? { query: financialReadQueries[resource] } : {}),
      params: resource.includes('{id}')
        ? z.object({ workspaceId: financial.financialIdSchema, id: financial.financialIdSchema })
        : z.object({ workspaceId: financial.financialIdSchema }),
    },
    responses: {
      200: response(output),
      400: problem,
      401: problem,
      403: problem,
      404: problem,
      409: problem,
      422: problem,
      500: problem,
    },
  });
}
for (const [path, schema, secured] of [
  ['/api/v1/health/live', healthResponseSchema, false],
  ['/api/v1/health/ready', readyResponseSchema, true],
  ['/api/v1/session', sessionResponseSchema, false],
  ['/api/v1/workspaces', workspaceListResponseSchema, true],
] as const) {
  registry.registerPath({
    method: 'get',
    path,
    ...(secured ? { security: [{ sessionCookie: [] }] } : {}),
    responses: { 200: response(schema), 401: problem, 503: problem },
  });
}
registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{workspaceId}',
  security: [{ sessionCookie: [] }],
  request: { params: z.object({ workspaceId: z.uuid() }) },
  responses: { 200: response(workspaceResponseSchema), 401: problem, 404: problem },
});
registry.registerPath({
  method: 'patch',
  path: '/api/v1/workspaces/{workspaceId}',
  security: [{ sessionCookie: [] }],
  request: {
    params: z.object({ workspaceId: z.uuid() }),
    headers: z.object({ 'X-CSRF-Token': z.string().min(1) }),
    body: {
      required: true,
      content: { 'application/json': { schema: workspacePreferencesUpdateSchema } },
    },
  },
  responses: {
    200: response(workspaceResponseSchema),
    400: problem,
    401: problem,
    403: problem,
    404: problem,
    409: problem,
    413: problem,
    415: problem,
    500: problem,
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/auth/session',
  responses: {
    200: {
      ...response(sessionResponseSchema),
      headers: {
        'X-CSRF-Token': {
          description: 'Session-bound mutation proof, present only for authenticated sessions.',
          schema: { type: 'string' },
        },
      },
    },
    500: problem,
  },
});
registry.registerPath({
  method: 'get',
  path: '/api/auth/sessions',
  description: 'List safe session identifiers after authentication within the past five minutes.',
  security: [{ sessionCookie: [] }],
  responses: {
    200: response(safeSessionListResponseSchema),
    401: problem,
    403: problem,
    500: problem,
  },
});
for (const [path, schema] of [
  ['/api/auth/change-password', changePasswordSchema],
  ['/api/auth/revoke-session', revokeSessionSchema],
] as const) {
  registry.registerPath({
    method: 'post',
    path,
    security: [{ sessionCookie: [] }],
    request: {
      headers: z.object({ 'X-CSRF-Token': z.string().min(1) }),
      body: { required: true, content: { 'application/json': { schema } } },
    },
    responses: {
      200: response(authActionResponseSchema),
      400: problem,
      401: problem,
      403: problem,
      404: problem,
      413: problem,
      415: problem,
      429: problem,
      500: problem,
    },
  });
}
registry.registerPath({
  method: 'post',
  path: '/api/auth/sign-in/email',
  request: { body: { content: { 'application/json': { schema: signInSchema } } } },
  responses: {
    200: response(authActionResponseSchema),
    400: problem,
    401: problem,
    403: problem,
    413: problem,
    415: problem,
    429: problem,
    500: problem,
  },
});
registry.registerPath({
  method: 'post',
  path: '/api/auth/sign-out',
  security: [{ sessionCookie: [] }],
  request: {
    headers: z.object({ 'X-CSRF-Token': z.string().min(1) }),
    body: { required: true, content: { 'application/json': { schema: z.object({}).strict() } } },
  },
  responses: {
    200: response(authActionResponseSchema),
    400: problem,
    401: problem,
    403: problem,
    413: problem,
    415: problem,
    429: problem,
    500: problem,
  },
});
const importPrefix = '/api/v1/workspaces/{workspaceId}/imports';
const importParams = z.strictObject({ workspaceId: financial.financialIdSchema });
for (const [suffix, schema] of [
  ['catalog', imports.importCatalogResponseSchema],
  ['templates', imports.importTemplatesResponseSchema],
  ['batches', imports.importHistoryResponseSchema],
] as const)
  registry.registerPath({
    method: 'get',
    path: `${importPrefix}/${suffix}`,
    security: [{ sessionCookie: [] }],
    request: {
      params: importParams,
      query: z.object({ cursor: financial.financialIdSchema.optional() }),
    },
    responses: { 200: response(schema), 401: problem, 404: problem, 409: problem },
  });
registry.registerPath({
  method: 'get',
  path: `${importPrefix}/batches/{batchId}`,
  security: [{ sessionCookie: [] }],
  request: {
    params: importParams.extend({ batchId: financial.financialIdSchema }),
    query: z.object({ cursor: z.coerce.number().int().nonnegative().optional() }),
  },
  responses: { 200: response(imports.importBatchDetailSchema), 401: problem, 404: problem },
});
registry.registerPath({
  method: 'get',
  path: `${importPrefix}/batches/{batchId}/source`,
  security: [{ sessionCookie: [] }],
  request: { params: importParams.extend({ batchId: financial.financialIdSchema }) },
  responses: {
    200: {
      description:
        'Authorized original UTF-8 source bytes, including any untrusted formulas; private plain-text attachment with an inert .source.txt filename. Original filename and source hash remain in batch metadata. Not a sanitized spreadsheet export.',
      content: { 'text/plain': { schema: { type: 'string', format: 'binary' } } },
    },
    401: problem,
    404: problem,
  },
});
for (const [suffix, input, output, params] of [
  [
    'templates',
    imports.importTemplateCreateSchema,
    imports.importTemplateResponseSchema,
    importParams,
  ],
  [
    'templates/{templateId}/versions',
    imports.importTemplateCreateSchema,
    imports.importTemplateResponseSchema,
    importParams.extend({ templateId: financial.financialIdSchema }),
  ],
  ['batches', imports.importStageSchema, imports.importBatchResponseSchema, importParams],
  [
    'batches/{batchId}/preview',
    imports.importPreviewRequestSchema,
    imports.importPreviewResponseSchema,
    importParams.extend({ batchId: financial.financialIdSchema }),
  ],
  [
    'batches/{batchId}/commit',
    imports.importCommitRequestSchema,
    imports.importBatchResponseSchema,
    importParams.extend({ batchId: financial.financialIdSchema }),
  ],
  [
    'batches/{batchId}/reverse',
    imports.importReverseRequestSchema,
    imports.importBatchResponseSchema,
    importParams.extend({ batchId: financial.financialIdSchema }),
  ],
] as const)
  registry.registerPath({
    method: 'post',
    path: `${importPrefix}/${suffix}`,
    security: [{ sessionCookie: [] }],
    request: {
      params,
      headers: z.object({
        'X-CSRF-Token': z.string().min(1),
        'Idempotency-Key': financial.financialIdSchema,
      }),
      body: { required: true, content: { 'application/json': { schema: input } } },
    },
    responses: {
      200: response(output),
      400: problem,
      401: problem,
      403: problem,
      404: problem,
      409: problem,
      413: problem,
      415: problem,
      422: problem,
      500: problem,
    },
  });

const remediationParams = z.object({ workspaceId: financial.financialIdSchema });
const remediationIdParams = remediationParams.extend({ id: financial.financialIdSchema });
const commandHeaders = z.object({
  Origin: z.url(),
  'X-CSRF-Token': z.string().min(1),
  'Idempotency-Key': financial.financialIdSchema,
});
for (const [path, input, output, writing] of [
  [
    '/supplied-components/observations',
    supplied.suppliedComponentCreateSchema,
    financial.financialMutationResponseSchema,
    true,
  ],
  [
    '/reviews/entries',
    periodReviews.periodReviewWriteSchema,
    periodReviews.periodReviewVersionSchema,
    true,
  ],
  [
    '/reviews/entries/{id}',
    periodReviews.periodReviewWriteSchema,
    periodReviews.periodReviewVersionSchema,
    true,
  ],
  [
    '/reviews/templates',
    periodReviews.periodReviewTemplateWriteSchema,
    periodReviews.periodReviewTemplateVersionSchema,
    true,
  ],
  [
    '/reviews/templates/{id}',
    periodReviews.periodReviewTemplateWriteSchema,
    periodReviews.periodReviewTemplateVersionSchema,
    true,
  ],
  ['/risk/policies', risk.riskPolicyWriteSchema, risk.riskPolicyVersionSchema, true],
  ['/risk/assessments', risk.riskAssessmentRequestSchema, risk.riskAssessmentResponseSchema, true],
  ['/risk/sizing', risk.riskSizingRequestSchema, risk.riskSizingResponseSchema, false],
  [
    '/reconciliation/statements',
    reconciliation.createStatementRequestSchema,
    reconciliation.statementResponseSchema,
    true,
  ],
  [
    '/reconciliation/statements/{id}/evaluations',
    reconciliation.evaluateStatementRequestSchema,
    reconciliation.statementReconciliationResponseSchema,
    true,
  ],
  [
    '/portability/restore',
    portability.portableRestoreRequestSchema,
    portability.portableRestoreResponseSchema,
    true,
  ],
] as const)
  registry.registerPath({
    method: 'post',
    path: '/api/v1/workspaces/{workspaceId}' + path,
    security: [{ sessionCookie: [] }],
    request: {
      params: path.includes('{id}') ? remediationIdParams : remediationParams,
      ...(writing ? { headers: commandHeaders } : {}),
      body: { required: true, content: { 'application/json': { schema: input } } },
    },
    responses: {
      [path === '/portability/restore' ? 201 : 200]: response(output),
      400: problem,
      401: problem,
      403: problem,
      404: problem,
      409: problem,
      413: problem,
      422: problem,
      500: problem,
    },
  });
for (const [path, output, query] of [
  [
    '/supplied-components/observations',
    supplied.suppliedComponentListResponseSchema,
    supplied.suppliedComponentListQuerySchema,
  ],
  [
    '/reviews/entries',
    periodReviews.periodReviewListSchema,
    periodReviews.periodReviewListQuerySchema,
  ],
  ['/reviews/entries/{id}', periodReviews.periodReviewVersionSchema, z.object({})],
  [
    '/reviews/entries/{id}/history',
    periodReviews.periodReviewHistorySchema,
    z.object({ after: financial.financialIdSchema.optional() }),
  ],
  ['/reviews/entries/{id}/summary', periodReviews.periodReviewSummarySchema, z.object({})],
  [
    '/reviews/templates',
    periodReviews.periodReviewTemplateListSchema,
    z.object({ after: financial.financialIdSchema.optional() }),
  ],
  [
    '/reviews/catalog',
    periodReviews.periodReviewCatalogSchema,
    periodReviews.periodReviewCatalogQuerySchema,
  ],
  [
    '/risk/policies',
    risk.riskPolicyListSchema,
    z.object({
      after: financial.financialIdSchema.optional(),
      accountId: financial.financialIdSchema.optional(),
      strategyId: financial.financialIdSchema.optional(),
    }),
  ],
  ['/risk/catalog', risk.riskCatalogResponseSchema, risk.riskCatalogQuerySchema],
  ['/risk/assessments/{id}', risk.riskAssessmentResponseSchema, z.object({})],
  [
    '/reconciliation/statements',
    reconciliation.statementListResponseSchema,
    reconciliation.statementListQuerySchema,
  ],
  ['/reconciliation/statements/{id}', reconciliation.statementResponseSchema, z.object({})],
  [
    '/reconciliation/statements/{id}/evaluations',
    reconciliation.statementEvaluationListResponseSchema,
    reconciliation.statementListQuerySchema,
  ],
  [
    '/reconciliation/evaluations/{id}',
    reconciliation.statementReconciliationResponseSchema,
    z.object({}),
  ],
  ['/portability/backup', portability.portableArchiveSchema, z.object({})],
] as const)
  registry.registerPath({
    method: 'get',
    path: '/api/v1/workspaces/{workspaceId}' + path,
    security: [{ sessionCookie: [] }],
    request: { params: path.includes('{id}') ? remediationIdParams : remediationParams, query },
    responses: {
      200: response(output),
      400: problem,
      401: problem,
      403: problem,
      404: problem,
      409: problem,
      500: problem,
    },
  });
registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{workspaceId}/portability/export',
  security: [{ sessionCookie: [] }],
  description:
    'Authorized filtered JSON or spreadsheet-safe CSV. Source precision is retained in JSON; CSV is a protected presentation.',
  request: {
    params: remediationParams,
    headers: commandHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: portability.portableExportRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Filtered download',
      content: {
        'application/json': { schema: { type: 'string', format: 'binary' } },
        'text/csv': { schema: { type: 'string', format: 'binary' } },
      },
    },
    400: problem,
    401: problem,
    403: problem,
    404: problem,
    413: problem,
    500: problem,
  },
});

const document = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: '3.1.0',
  info: { title: 'Trading Journal Foundation API', version: '0.1.0' },
});
const json = JSON.stringify(document, null, 2) + '\n';
const types = astToString(await openapiTS(document as Parameters<typeof openapiTS>[0]));
const target = fileURLToPath(new URL('../openapi.json', import.meta.url));
const generated = fileURLToPath(new URL('./generated/api.d.ts', import.meta.url));
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== json || (await readFile(generated, 'utf8')) !== types) {
    throw new Error('Generated API contract differs. Run pnpm api:generate.');
  }
  console.log('API schema and typed client are current.');
} else {
  await mkdir(fileURLToPath(new URL('./generated', import.meta.url)), { recursive: true });
  await writeFile(target, json);
  await writeFile(generated, types);
  console.log('Generated OpenAPI 3.1 and typed client definitions.');
}
