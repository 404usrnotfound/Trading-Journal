/** Generate developer HTTP reference from the checked-in contract and reviewed handler policy. */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import * as contracts from '@journal/contracts';
import { format, resolveConfig } from 'prettier';

const root = fileURLToPath(new URL('../../', import.meta.url));
const requireContracts = createRequire(
  new URL('../../packages/contracts/package.json', import.meta.url),
);
const { fromJSONSchema } = requireContracts('zod');
const readJson = async (path) => JSON.parse(await readFile(root + path, 'utf8'));
const spec = await readJson('packages/contracts/openapi.json');
// Catch projection regressions even when an example uses its source Zod parser.
function validatePatterns(value) {
  if (Array.isArray(value)) return value.forEach(validatePatterns);
  if (!value || typeof value !== 'object') return;
  if (typeof value.pattern === 'string') {
    if (value.pattern.endsWith('$/u'))
      throw new Error('OpenAPI pattern contains a serialized JavaScript Unicode flag.');
    new RegExp(value.pattern, 'u');
  }
  Object.values(value).forEach(validatePatterns);
}
validatePatterns(spec);
const policy = await readJson('docs/developer-guide/api/endpoint-policy.json');
const diagnosisOnly = process.argv.includes('--diagnose');
const checking = process.argv.includes('--check');
const schemaMap = new Map();
const isParser = (value) => value && typeof value.safeParse === 'function';
for (const [name, value] of Object.entries(contracts)) {
  if (name.endsWith('Schema') && isParser(value))
    schemaMap.set(name[0].toUpperCase() + name.slice(1, -6), value);
  if (name.endsWith('SchemaComponents'))
    for (const [key, parser] of Object.entries(value))
      if (isParser(parser)) schemaMap.set(key, parser);
}
for (const [name, exported] of Object.entries({
  HealthResponse: 'healthResponseSchema',
  ReadyResponse: 'readyResponseSchema',
  SessionResponse: 'sessionResponseSchema',
  WorkspaceResponse: 'workspaceResponseSchema',
  WorkspaceListResponse: 'workspaceListResponseSchema',
  WorkspacePreferencesUpdateInput: 'workspacePreferencesUpdateSchema',
  SignInInput: 'signInSchema',
  Problem: 'problemResponseSchema',
  AuthActionResponse: 'authActionResponseSchema',
  ChangePasswordInput: 'changePasswordSchema',
  RevokeSessionInput: 'revokeSessionSchema',
  SafeSessionListResponse: 'safeSessionListResponseSchema',
}))
  schemaMap.set(name, contracts[exported]);

const componentName = (schema) => schema?.$ref?.split('/').at(-1);
const dereference = (schema) =>
  schema?.$ref ? spec.components.schemas[componentName(schema)] : schema;
const parsers = new Map();
function parserFor(schema) {
  const name = componentName(schema);
  if (name && schemaMap.has(name)) return { parser: schemaMap.get(name), source: 'source-zod' };
  const key = JSON.stringify(schema);
  if (!parsers.has(key)) {
    const selected = {};
    function refs(value) {
      if (!value || typeof value !== 'object') return;
      if (value.$ref) {
        const ref = componentName(value);
        if (!Object.hasOwn(selected, ref)) {
          selected[ref] = spec.components.schemas[ref];
          refs(selected[ref]);
        }
      }
      for (const child of Object.values(value)) refs(child);
    }
    refs(schema);
    const rewrite = (value) => {
      if (Array.isArray(value)) return value.map(rewrite);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          k === '$ref' ? v.replace('#/components/schemas/', '#/$defs/') : rewrite(v),
        ]),
      );
    };
    parsers.set(key, fromJSONSchema({ ...rewrite(schema), $defs: rewrite(selected) }));
  }
  return { parser: parsers.get(key), source: 'generated-json-schema' };
}

function uuid(label) {
  const h = createHash('sha256').update(label).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function sample(schema, path = 'example', depth = 0) {
  if (depth > 30) return null;
  if (!schema || schema === true) return {};
  if (schema === false) throw new Error(`No example can satisfy false schema: ${path}`);
  const field = path.split('.').at(-1);
  if (
    field === 'nextCursor' &&
    (schema.type?.includes?.('null') || schema.anyOf?.some((part) => part.type === 'null'))
  )
    return null;
  const name = componentName(schema);
  if (name === 'FinancialJson') return {};
  if (name) return sample(dereference(schema), path, depth + 1);
  if ('const' in schema) return schema.const;
  if (schema.enum) return schema.enum[0];
  if ('default' in schema) return structuredClone(schema.default);
  if (schema.oneOf || schema.anyOf)
    return sample((schema.oneOf ?? schema.anyOf)[0], path, depth + 1);
  if (schema.allOf) {
    const values = schema.allOf.map((part) => sample(part, path, depth + 1));
    if (values.every((v) => v && typeof v === 'object' && !Array.isArray(v)))
      return Object.assign({}, ...values);
    return values.find((v) => v !== null) ?? null;
  }
  const type = Array.isArray(schema.type)
    ? (schema.type.find((x) => x !== 'null') ?? 'null')
    : schema.type;
  if (type === 'null') return null;
  if (type === 'object' || schema.properties) {
    return Object.fromEntries(
      (schema.required ?? []).map((key) => [
        key,
        sample(schema.properties[key], path + '.' + key, depth + 1),
      ]),
    );
  }
  if (type === 'array')
    return Array.from({ length: schema.minItems ?? 0 }, (_, i) =>
      sample(schema.items ?? {}, `${path}[${i}]`, depth + 1),
    );
  if (type === 'boolean') return false;
  if (type === 'number' || type === 'integer') {
    let value =
      schema.minimum ??
      (typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum + 1 : 1);
    if (schema.maximum !== undefined) value = Math.min(value, schema.maximum);
    return value;
  }
  if (schema.format === 'uuid' || /Id$/.test(field)) return uuid(field);
  if (schema.format === 'date-time') {
    if (/effective|metadata/i.test(field)) return '2026-01-01T00:00:00.000000Z';
    return /to$|through|end|expires|closed/i.test(field)
      ? '2026-10-21T13:00:00.000000Z'
      : '2026-10-20T09:00:00.000000Z';
  }
  if (schema.format === 'date') return '2026-10-20';
  if (schema.format === 'email') return 'developer@example.test';
  if (schema.format === 'uri' || schema.format === 'url') return 'https://journal.example.test';
  if (/timezone/i.test(field)) return 'UTC';
  if (/password/i.test(field)) return 'Fictional-password-2026!';
  let candidates = ['1', '0', 'USD', 'UTC', 'fictional', 'a'.repeat(64), uuid(field), '2026-10-20'];
  if (/sha256|hash|fingerprint/i.test(field)) candidates = ['a'.repeat(64), ...candidates];
  if (/name|title|reason|label|description|notes/i.test(field))
    candidates = ['Fictional example', ...candidates];
  const value = candidates.find(
    (candidate) =>
      candidate.length >= (schema.minLength ?? 0) &&
      candidate.length <= (schema.maxLength ?? Infinity) &&
      (!schema.pattern || new RegExp(schema.pattern).test(candidate)),
  );
  return value ?? 'x'.repeat(schema.minLength ?? 1);
}

const special = {
  'PATCH /api/v1/workspaces/{workspaceId}': { expectedRevision: 1, timezone: 'UTC' },
};
const overridesPath = root + 'docs/developer-guide/api/example-overrides.json';
let overrides = {};
try {
  overrides = JSON.parse(await readFile(overridesPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const failures = [];
const counts = { operations: 0, examples: 0, sourceZod: 0, generatedSchema: 0 };
function verified(schema, value, label, sourceParser) {
  const { parser, source } = sourceParser
    ? { parser: sourceParser, source: 'source-zod' }
    : parserFor(schema);
  const result = parser.safeParse(value);
  counts.examples++;
  counts[source === 'source-zod' ? 'sourceZod' : 'generatedSchema']++;
  if (!result.success) failures.push({ label, value, issues: result.error.issues });
  return value;
}

const examples = [];
for (const rule of policy.operations) {
  const operation = spec.paths[rule.route]?.[rule.method.toLowerCase()];
  if (!operation)
    throw new Error(`Implemented operation absent from contract: ${rule.method} ${rule.route}`);
  for (const [name, expected] of Object.entries({
    Origin: Boolean(rule.originRequired || rule.originCsrfRequired),
    'X-CSRF-Token': Boolean(rule.originCsrfRequired),
    'Idempotency-Key': Boolean(rule.idempotencyHeaderRequired),
  })) {
    const actual = (operation.parameters ?? []).some(
      (p) => p.in === 'header' && p.name.toLowerCase() === name.toLowerCase() && p.required,
    );
    if (actual !== expected)
      throw new Error(`Handler-policy/header mismatch: ${rule.method} ${rule.route} ${name}`);
  }
  if (
    Boolean(operation.security?.some((s) => Object.hasOwn(s, 'sessionCookie'))) !==
    rule.sessionRequired
  )
    throw new Error(`Handler-policy/session mismatch: ${rule.method} ${rule.route}`);
  counts.operations++;
  const key = `${rule.method} ${rule.route}`;
  const item = { ...rule, parameters: {}, requestBody: null, responses: {} };
  for (const parameter of operation.parameters ?? []) {
    const value =
      parameter.name === 'Idempotency-Key'
        ? uuid(key + ':command')
        : sample(parameter.schema, parameter.name);
    item.parameters[parameter.name] = verified(
      parameter.schema,
      value,
      `${key} parameter ${parameter.name}`,
    );
  }
  const body = operation.requestBody?.content?.['application/json'];
  if (body) {
    const value = overrides[key]?.request ?? special[key] ?? sample(body.schema);
    let sourceParser;
    if (key.endsWith('/dashboard/reports')) sourceParser = contracts.dashboardRequestSchema;
    if (key.startsWith('PATCH /api/v1/workspaces/'))
      sourceParser = contracts.workspacePreferencesUpdateSchema;
    if (key === 'POST /api/auth/change-password') sourceParser = contracts.changePasswordSchema;
    if (key === 'POST /api/auth/revoke-session') sourceParser = contracts.revokeSessionSchema;
    if (key === 'POST /api/auth/sign-in/email') sourceParser = contracts.signInSchema;
    item.requestBody = verified(body.schema, value, key + ' request', sourceParser);
  }
  for (const [status, response] of Object.entries(operation.responses)) {
    if (Number(status) >= 300) continue;
    const body = response.content?.['application/json'];
    if (!body || body.schema.format === 'binary') continue;
    const value = overrides[key]?.responses?.[status] ?? sample(body.schema);
    const sourceParser = key.endsWith('/dashboard/reports')
      ? contracts.dashboardResponseSchema
      : key.endsWith('/dashboard/catalog')
        ? contracts.dashboardCatalogSchema
        : undefined;
    item.responses[status] = verified(
      body.schema,
      value,
      key + ' response ' + status,
      sourceParser,
    );
  }
  examples.push(item);
}
const actual = new Set(policy.operations.map((x) => `${x.method} ${x.route}`));
if (actual.size !== policy.operations.length)
  throw new Error('Duplicate endpoint policy operation.');
for (const [route, methods] of Object.entries(spec.paths))
  for (const method of Object.keys(methods))
    if (
      ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method) &&
      !actual.has(`${method.toUpperCase()} ${route}`)
    )
      throw new Error(`Contract operation lacks implemented-handler policy: ${method} ${route}`);

const report = { ...counts, failures };
await mkdir(root + 'work/phase-19-cp6', { recursive: true });
await writeFile(
  root + 'work/phase-19-cp6/api-example-validation.json',
  JSON.stringify(report, null, 2) + '\n',
);
if (diagnosisOnly || failures.length) {
  process.stdout.write(
    JSON.stringify(
      { ...counts, failures: failures.map((f) => ({ label: f.label, issues: f.issues })) },
      null,
      2,
    ) + '\n',
  );
  process.exitCode = failures.length ? 1 : 0;
} else {
  const config = await resolveConfig(root + 'README.md');
  async function output(path, contents) {
    const rendered = await format(contents, { ...config, filepath: root + path });
    if (checking) {
      if ((await readFile(root + path, 'utf8')) !== rendered)
        throw new Error(`Generated developer API reference differs: ${path}`);
    } else await writeFile(root + path, rendered);
  }
  await output(
    'docs/developer-guide/api/examples.json',
    JSON.stringify({
      fictional: true,
      validationScope:
        'Source Zod or generated JSON Schema; independent illustrations, not live captures or preseeded identities',
      examples,
    }),
  );
  const escape = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  function describe(schema) {
    if (!schema) return 'No body';
    const name = componentName(schema);
    if (name)
      return `\`${name}\`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)`;
    const type = Array.isArray(schema.type)
      ? schema.type.join(' or ')
      : (schema.type ?? (schema.oneOf ? 'oneOf' : schema.anyOf ? 'anyOf' : 'schema'));
    const limits = [
      'format',
      'minimum',
      'maximum',
      'minLength',
      'maxLength',
      'minItems',
      'maxItems',
    ]
      .filter((key) => schema[key] !== undefined)
      .map((key) => `${key}: ${schema[key]}`);
    if (schema.enum) limits.push('enum: ' + schema.enum.map((x) => JSON.stringify(x)).join(', '));
    if (schema.pattern) limits.push('pattern: `' + schema.pattern + '`');
    return `\`${type}\`${limits.length ? '; ' + limits.join('; ') : ''}`;
  }
  function fields(schema) {
    const definition = dereference(schema);
    if (!definition?.properties) return '';
    return (
      '\n| JSON field | Required | Type / structural validation |\n| --- | --- | --- |\n' +
      Object.entries(definition.properties)
        .map(
          ([key, s]) =>
            `| \`${key}\` | ${(definition.required ?? []).includes(key) ? 'Yes' : 'No'} | ${escape(describe(s))} |`,
        )
        .join('\n') +
      '\n'
    );
  }
  const titles = {
    financial: 'Financial catalog and source ledger',
    accounting: 'Account accounting and native snapshots',
    analytics: 'Campaign analytics',
    auth: 'Authentication gateway',
    platform: 'Health, sessions and workspaces',
    dashboard: 'Dashboard',
    'display-views': 'Private display views',
    imports: 'Reviewed imports',
    journals: 'Trade journals',
    'journal-attachments': 'Journal attachments',
    strategies: 'Strategy playbooks',
    'strategy-attachments': 'Strategy attachments',
    portability: 'Portable workspaces and exports',
    reconciliation: 'Independent reconciliation',
    reviews: 'Period reviews',
    risk: 'Risk policies and sizing',
    'supplied-components': 'Reviewed supplied components',
  };
  const contractsFiles = {
    platform: 'index',
    auth: 'index',
    'journal-attachments': 'strategy-attachments',
    journals: 'journal',
    'supplied-components': 'supplied',
    reviews: 'period-reviews',
    'display-views': 'display-views',
  };
  const verb = {
    GET: 'Read',
    POST: 'Submit',
    PUT: 'Append a reviewed replacement for',
    PATCH: 'Update',
    DELETE: 'Archive or remove the permitted reference to',
  };
  function purpose(rule, operation) {
    if (operation.description) return operation.description;
    if (rule.route === '/api/auth/sign-in/email')
      return 'Authenticate an existing provisioned user with email/password; no public signup.';
    if (rule.route === '/api/auth/session' || rule.route === '/api/v1/session')
      return 'Read the safe current session DTO, or null when unauthenticated.';
    if (rule.route.endsWith('/sign-out'))
      return 'Revoke the current authenticated session and clear its cookie.';
    if (rule.route.endsWith('/health/live'))
      return 'Read public web process liveness; no database, queue or media check.';
    if (rule.route.endsWith('/health/ready'))
      return 'Read authenticated schema/PostgreSQL/auth-database readiness.';
    if (rule.route.endsWith('/workspaces'))
      return 'List workspaces accessible to the current session.';
    return `${verb[rule.method]} ${rule.route
      .split('/')
      .filter((x) => x && !x.startsWith('{'))
      .slice(-2)
      .join(' / ')} within the authorized scope. See the linked handler for business semantics.`;
  }
  const index = [];
  for (const family of [...new Set(examples.map((x) => x.family))].sort()) {
    const group = examples.filter((x) => x.family === family);
    index.push(`| [${titles[family]}](api/${family}.md) | ${group.length} |`);
    let md = `# ${titles[family]} API\n\nGenerated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: \`5132900a03efabaeb307787531546987228220e7\`; documentation baseline: \`${policy.reviewedCommit}\`.\n\n`;
    md +=
      'Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.\n\n';
    md +=
      '| Method | Route |\n| --- | --- |\n' +
      group
        .map((item) => {
          const heading = `${item.method} ${item.route}`;
          const slug = heading
            .toLowerCase()
            .replace(/[^a-z0-9 _-]/g, '')
            .replaceAll(' ', '-');
          return `| ${item.method} | [\`${item.route}\`](#${slug}) |`;
        })
        .join('\n') +
      '\n\n';
    for (const item of group) {
      const operation = spec.paths[item.route][item.method.toLowerCase()];
      md += `## ${item.method} ${item.route}\n\n**Purpose:** ${purpose(item, operation)}\n\n`;
      md += `**Implementation:** [handler](../../../${item.source}); [validation schemas](../../../packages/contracts/src/${contractsFiles[family] ?? family}.ts).\n\n`;
      md += `**Authentication:** ${item.sessionRequired ? 'Valid cookie session required.' : 'No authenticated session required; session-read operations may return null.'}${item.recentSignInRequired ? ' Sign-in must be less than five minutes old.' : ''}\n\n`;
      md += `**Authorization:** ${item.role}; current workspace membership and tenant context are checked where workspace-scoped. ${item.originRequired ? 'Exact canonical Origin required. ' : ''}${item.originCsrfRequired ? 'Session-bound X-CSRF-Token required. ' : ''}${item.idempotencyHeaderRequired ? 'UUIDv4 Idempotency-Key required. ' : ''}${item.durableIdempotency ? 'Retain the same key and payload only for the same command retry.' : 'No key-based durable command replay is promised by this operation.'}\n\n`;
      md +=
        '**Request parameters:**\n\n| Name | Location | Required | Type / structural validation |\n| --- | --- | --- | --- |\n';
      if (!operation.parameters?.length)
        md +=
          '| None | — | — | No declared path/query/header parameter; shared HTTP/cookie rules still apply. |\n';
      for (const p of operation.parameters ?? [])
        md += `| \`${p.name}\` | ${p.in} | ${p.required ? 'Yes' : 'No'} | ${escape(describe(p.schema))} |\n`;
      const request = operation.requestBody;
      const bodySchema = request?.content?.['application/json']?.schema;
      md += `\n**Request body:** ${
        request
          ? `${request.required ? 'Required' : 'Optional'}; ${Object.keys(request.content)
              .map((x) => '\`' + x + '\`')
              .join(
                ', ',
              )}. ${bodySchema ? describe(bodySchema) : 'Raw file bytes; do not wrap binary content in JSON or base64.'}`
          : 'None.'
      }\n`;
      if (bodySchema) md += fields(bodySchema);
      md += `\n**Validation:** ${item.jsonBodyMaximumBytes ? `JSON transport ceiling ${item.jsonBodyMaximumBytes} bytes; application/json and the bounded nesting guard apply. ` : ''}${item.binaryMaximumBytes ? `Raw upload ceiling ${item.binaryMaximumBytes} bytes; magic/type and private lifecycle checks apply. ` : ''}The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler. ${item.auditNote ?? ''}\n\n`;
      md +=
        '**Responses and errors:**\n\n| HTTP status | Media type | Schema / meaning |\n| --- | --- | --- |\n';
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!response.content) md += `| ${status} | No body | ${escape(response.description)} |\n`;
        for (const [media, content] of Object.entries(response.content ?? {}))
          md += `| ${status} | \`${media}\` | ${escape(describe(content.schema))}; ${escape(response.description)} |\n`;
      }
      md +=
        '\nProblem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.\n\n';
      let url = item.route;
      const query = new URLSearchParams();
      const headers = ['Host: journal.example.test'];
      if (item.sessionRequired) headers.push('Cookie: <session cookie returned by sign-in>');
      for (const p of operation.parameters ?? []) {
        if (!p.required) continue;
        const value = item.parameters[p.name];
        if (p.in === 'path') url = url.replace(`{${p.name}}`, encodeURIComponent(String(value)));
        if (p.in === 'query') query.append(p.name, String(value));
        if (p.in === 'header')
          headers.push(
            `${p.name}: ${p.name.toLowerCase() === 'x-csrf-token' ? '<session-bound CSRF proof>' : p.name === 'X-File-Name' ? 'fictional.png' : value}`,
          );
      }
      if (query.size) url += '?' + query.toString();
      if (request) headers.push(`Content-Type: ${Object.keys(request.content)[0]}`);
      md += `**Example request:**\n\n\`\`\`http\n${item.method} ${url} HTTP/1.1\n${headers.join('\n')}${request ? '\n\n' + (bodySchema ? JSON.stringify(item.requestBody, null, 2) : '<raw bytes of a fictional valid PNG file>') : ''}\n\`\`\`\n\n`;
      const success = Object.entries(operation.responses).find(([status]) => Number(status) < 300);
      md += '**Example response:**\n\n';
      if (Object.hasOwn(item.responses, success[0]))
        md += `HTTP ${success[0]}; illustrative JSON, not an executed result:\n\n\`\`\`json\n${JSON.stringify(item.responses[success[0]], null, 2)}\n\`\`\`\n\n`;
      else
        md += `\`\`\`http\nHTTP/1.1 ${success[0]}${success[1].content ? '\nContent-Type: ' + Object.keys(success[1].content)[0] + '\n\n<authorized download bytes; not a JSON DTO>' : ' No Content'}\n\`\`\`\n\n`;
    }
    await output(`docs/developer-guide/api/${family}.md`, md);
  }
  let worker =
    '# Private worker health API\n\nThese two GETs belong to the private worker listener, default `127.0.0.1:3101`, not the web origin or cookie-authenticated OpenAPI surface. Source: [worker](../../../apps/worker/src/index.ts). Do not expose the listener publicly.\n\n';
  for (const op of policy.privateWorkerOperations)
    worker += `## GET ${op.route}\n\n**Purpose:** ${op.route.endsWith('ready') ? 'Report the latest infrastructure queue round-trip readiness; not every native outbox generation.' : 'Report worker process liveness/shutdown state.'}\n\n**Authentication and authorization:** no cookie authentication; private configured host/network access is the boundary.\n\n**Parameters/body/validation:** no path or query parameters and no body. GET only; other methods return 405 with Allow: GET and status method-not-allowed. Unknown paths return 404 with status not-found.\n\n**Response schema/errors:** 200 JSON \`{"status":"ok"}\`; 503 JSON \`{"status":"unavailable"}\`. Worker errors use this small status object, not the web Problem envelope. Listener startup/queue failure can instead cause connection refusal.\n\n**Example request and response:**\n\n\`\`\`http\nGET ${op.route} HTTP/1.1\nHost: 127.0.0.1:3101\n\nHTTP/1.1 200\nContent-Type: application/json; charset=utf-8\n\n{"status":"ok"}\n\`\`\`\n\n`;
  worker +=
    'See [operations](../../operations.md#health-checks) and [verification](../verification.md) for actual execution and production limits.\n';
  await output('docs/developer-guide/api/worker-health.md', worker);
  await output(
    'docs/developer-guide/api/catalog.md',
    '# API operation catalog\n\nGenerated from the canonical OpenAPI plus source-reviewed endpoint policy. There are **154 web operations across 119 paths**, plus **2 private worker health GETs**.\n\n| Family | Web operations |\n| --- | --- |\n' +
      index.join('\n').replaceAll('](api/', '](') +
      '\n\n[Private worker health](worker-health.md) has two additional private operations. [Shared API reference](../api-reference.md) owns transport, error, generation and example interpretation.\n',
  );
  process.stdout.write(JSON.stringify(counts) + '\n');
}
