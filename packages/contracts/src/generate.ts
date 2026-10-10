import './openapi-setup.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
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

const registry = new OpenAPIRegistry();
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
const response = (schema: z.ZodType) => ({
  description: 'Validated application DTO',
  content: { 'application/json': { schema } },
});
const problem = {
  description: 'Safe problem details; no credentials or database diagnostics',
  content: { 'application/problem+json': { schema: problemResponseSchema } },
};
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
