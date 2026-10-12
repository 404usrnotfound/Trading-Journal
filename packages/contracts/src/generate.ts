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
for (const collection of [strategies, strategyAttachments, journal])
  for (const [name, schema] of Object.entries(collection)) {
    if (name.endsWith('Schema') && schema instanceof z.ZodType && !name.endsWith('QuerySchema'))
      registerSharedSchema(
        name.charAt(0).toUpperCase() + name.slice(1).replace(/Schema$/u, ''),
        schema,
      );
  }
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
  'orders/{id}': financial.orderResponseSchema,
  'trades/{id}/legs': financial.tradeLegResponseSchema.array(),
  'trades/{id}': financial.tradeResponseSchema,
  'campaign-inventory': financial.campaignInventoryResponseSchema,
  'account-valuations': financial.accountValuationObservationResponseSchema.array(),
};
const financialReadQueries: Record<string, z.ZodObject> = {
  currencies: financial.financialCatalogQuerySchema,
  brokers: financial.financialCatalogQuerySchema,
  accounts: financial.financialAccountQuerySchema,
  instruments: financial.financialCatalogQuerySchema,
  orders: financial.financialCatalogQuerySchema,
  trades: financial.financialCatalogQuerySchema,
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
