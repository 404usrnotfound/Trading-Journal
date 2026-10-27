# API reference and transport rules

Reviewed **26 October 2026** against committed Checkpoint 5 `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c` and application baseline `5132900a03efabaeb307787531546987228220e7`. The documented implementation has **154 web operations across 119 paths**, plus **2 private worker health GETs**. Start with the [operation catalog](api/catalog.md); each family page documents every method/route, purpose, guards, request parameters/body, validation, response/errors and fictional examples.

## Contract and implementation authority

| Source                                                                                                                                | Responsibility                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Zod contracts](../../packages/contracts/src/index.ts) and family modules                                                             | Accepted field types, bounds, refinements/transforms and validated DTOs. Financial/service/SQL invariants remain additional requirements.                                               |
| [OpenAPI generator](../../packages/contracts/src/generate.ts)                                                                         | Registers implemented routes and schemas; produces [OpenAPI 3.1](../../packages/contracts/openapi.json) and [TypeScript declarations](../../packages/contracts/src/generated/api.d.ts). |
| [Web routes](../../apps/web/src/app/api) and linked family handlers                                                                   | Actual method/path dispatch, transport limits, authorization and request handling. A generated path alone does not implement an endpoint.                                               |
| [Source-reviewed endpoint policy](api/endpoint-policy.json)                                                                           | Per-operation handler source, role/session/freshness, Origin/CSRF/key and byte-limit annotations not fully expressible in JSON Schema. Keep these synchronized with handlers.           |
| [Documentation generator](../../scripts/documentation/generate-api-reference.mjs) and [example overrides](api/example-overrides.json) | Deterministically render the per-operation pages and [fictional example data](api/examples.json); validate example shape/refinements where represented. They do not issue HTTP writes.  |

The catalog is exhaustive for explicit application operations, including the implemented `GET strategies/{strategyId}/trade-links` alias and the actual `GET accounting/native-snapshot` location. Framework-generated HEAD/OPTIONS handling and method rejection do not add new domain operations. Unknown public Better Auth routes are deliberately unavailable; do not infer signup/reset/social/bearer endpoints from the underlying library. Private worker health is separately documented and has a different origin/error envelope.

## Authentication, authorization and mutation proofs

Web authentication uses the server-managed HttpOnly cookie from normal sign-in. Use the actual `Set-Cookie` name/prefix returned in the configured environment; production cookie security differs from local HTTP. A bearer-token API, public signup, invitation system and browser API-key administration are not delivered.

- `GET /api/auth/session` returns the safe session DTO or null and supplies `X-CSRF-Token` for an authenticated session. `GET /api/v1/session` is a safe DTO read, not a credential/token export.
- Exact workspace membership/role is checked by the server and rechecked inside the workspace transaction. Viewer/editor/owner are minimum operation-specific requirements; a visible UUID never grants access. Foreign/unavailable resources can be concealed with `NOT_FOUND`.
- The policy and parameter tables identify exact canonical **Origin**, session-bound **X-CSRF-Token**, recent sign-in and UUIDv4 **Idempotency-Key** requirements. A plain POST is not automatically a mutation: bounded report/analytics/risk-sizing reads do not acquire write privileges.
- Conversely, `POST portability/export` is a viewer read with Origin/CSRF requirements and no parsed idempotency key. Private display-view writes require viewer membership and CSRF but no key-based durable command. Attachment deletion is a guarded bodyless/keyless operation.
- Imports preview requires the shared UUID header at the API boundary, but that preview is not stored as a keyed durable financial command. Do not promise command replay solely from the presence of a header. Exact private-view setting replay is another service-specific behavior, not a universal key protocol.
- For a durable command, use a fresh UUIDv4 for a new logical write; retain the original key and frozen payload for its supported retry. A changed retry can conflict. An interrupted HTTP response does not prove rollback; inspect the authoritative result before creating another command.

Source authorities: [services](../../packages/server/src/services.ts), [security guards](../../packages/server/src/security.ts), [auth gateway](../../packages/server/src/auth-gateway.ts), [financial API](../../packages/server/src/financial/api.ts), [portability API](../../packages/server/src/portability/api.ts), [imports API](../../packages/server/src/imports/api.ts) and [private views](../../packages/server/src/display-views/api.ts). Do not disable a guard to test a payload or publish a real cookie/CSRF proof in examples.

## Validation and financial boundaries

Use `Content-Type: application/json` for JSON requests; raw attachment uploads send actual supported file bytes with their media type. The per-operation byte ceilings and strict source schemas apply before domain execution; bounded JSON nesting is also enforced. Request path/query/header values and body fields have distinct parsers. Optional cursors must come from the relevant response; a fictional token is not a usable pagination cursor.

Money/quantity/revision/order keys are exact strings where declared, not JavaScript floating-point numbers. UUID versions, effective ISO instants with offsets/microseconds, integer optimistic revisions, currency identities and immutable instrument/portfolio/strategy versions matter. Source Zod refinements can enforce mutually exclusive scopes, positive/complete risk, metric units/definition IDs, parent/version relationships or coherent report currency/boundaries beyond what OpenAPI structurally expresses.

Schema validation does not establish referenced records, current revision, live membership, known historical basis, cost completeness, eligible marks/FX, closed campaign membership, balanced source cash or archive checksums. Services and PostgreSQL enforce those conditions. Follow [domain/financial invariants](domain-and-financial-model.md), [database boundaries](database-migrations.md) and the linked handler rather than duplicating or bypassing them in an API client. A deposited amount is not campaign profit, an actual conversion is not a reporting observation, a source fill is not a completed campaign and a native worker snapshot is not NAV.

Component names and JSON pointers refer to the canonical OpenAPI file; source Zod remains authoritative for refinements/transformations that JSON Schema cannot fully represent. The field tables are generated projections, not a second handwritten DTO definition. Binary/archive/download contracts have additional source/media/integrity rules; a structural JSON specimen is not a verified recovery set.

The registry also normalizes two known serializer artifacts: anchored JavaScript Unicode regex flags are removed from the emitted pattern text, and the serializer's exact reference-plus-nullable-type intersection becomes a reference-or-null union. These narrow projection corrections preserve the existing source validators; they do not loosen runtime validation. Other intersections remain intact.

## Errors

Web failures use a safe `application/problem+json` envelope from [the serializer](../../packages/server/src/errors.ts). A source-backed example of a structural validation rejection is:

```json
{
  "type": "about:blank",
  "status": 400,
  "code": "INVALID_REQUEST",
  "title": "Invalid request",
  "detail": "The request does not match the expected format.",
  "requestId": "11111111-1111-4111-8111-111111111111"
}
```

The matching `x-request-id` header supports correlation with safe `web.request.failed` logs. No raw SQL, credential, body or stack belongs in the response. Per-operation tables list declared response media/schemas/statuses; they do not enumerate every business code or promise that all failures are the same condition.

| Typical source boundary                                            | Interpretation                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 400 `INVALID_REQUEST`, `INVALID_JSON`                              | Invalid DTO or malformed JSON; preserve the actual code and correct input.                                     |
| 401 `UNAUTHENTICATED`                                              | Sign in required; not an empty report.                                                                         |
| 403 `UNTRUSTED_ORIGIN`, `INVALID_CSRF` or role/freshness rejection | Restore the correct authorized origin/session/proof; do not bypass controls.                                   |
| 404 `NOT_FOUND`                                                    | Unknown, concealed or inaccessible resource/public auth route.                                                 |
| 405 method rejection                                               | Only the implemented methods are supported.                                                                    |
| 409 `INVENTORY_CONFLICT` or guarded revision/idempotency conflicts | Inspect persisted/current state and exact command identity before retrying.                                    |
| 413/415 input limit or media rejection                             | Use supported bounded content; do not raise the guard to hide the failure.                                     |
| 422 `INVALID_FINANCIAL_INPUT` or specific domain rejection         | Correct evidenced inputs/eligibility; unavailable values are not zero.                                         |
| 429 admission/rate/scope rejection                                 | Follow the actual response and Retry-After where supplied; do not loop credentials or bypass safe report caps. |
| 503 `NOT_READY`                                                    | Protected readiness dependency failure; public liveness can still be healthy.                                  |
| 500 `INTERNAL_ERROR`                                               | Safe generic failure; retain request correlation and sanitized evidence.                                       |

The private worker instead returns small `{ "status": ... }` objects and no cookie-authenticated Problem envelope. See [worker health](api/worker-health.md) and [troubleshooting](../troubleshooting/README.md).

## Read the examples correctly

Every operation has a fictional request/response illustration. Generated UUIDs, timestamps, currencies and narrative data are not existing records or live captures. Request examples show required transport fields; optional parameters remain documented in tables. Cookie/CSRF/binary placeholders must be supplied by a normal authorized workflow, not copied as credentials. JSON examples are independently schema-checked; they are not all executed 2xx HTTP workflows and are not a connected sequence of economic activity.

The generator uses actual exported source Zod validators where named/available and a pinned Zod JSON-Schema conversion for remaining projections. Curated overrides satisfy additional source refinements and use coherent empty/flat reporting scenarios. [Verification](verification.md) gives counts, representative executed API tests and remaining limits. Full portable archives and export bytes require their actual integrity/fidelity workflow; sample generic archive fields/checksums are not an instruction to fabricate a restorable backup.

The [browser-safe typed client](../../packages/contracts/src/client.ts) uses the generated paths and same-origin credentials. Its browser-oriented generated types leave the browser-managed Origin argument optional, while OpenAPI still requires the wire header. Browsers supply Origin on guarded writes; nonbrowser clients must explicitly supply the canonical origin. It does not establish a session, attach CSRF/idempotency proofs or make a service reference valid:

```typescript
import { createApiClient } from '@journal/contracts/client';

const client = createApiClient();
const { data, response } = await client.GET('/api/v1/health/live');
if (!response.ok) throw new Error(`Health request failed (${response.status})`);
// data is the generated safe health DTO; no database/queue/media inference.
```

## Regenerate the reference

From repository root with the full frozen installation and pinned Node/pnpm:

```bash
corepack pnpm api:generate
node --import tsx scripts/documentation/generate-api-reference.mjs
corepack pnpm api:check
node --import tsx scripts/documentation/generate-api-reference.mjs --check
```

The first command writes OpenAPI/client declarations from the existing registry. The documentation command writes the generated API family pages, catalog, worker page and fictional examples; both documentation modes write a sanitized validation summary under ignored `work/phase-19-cp6`. The check mode compares generated output without changing tracked documents. No command starts a server, connects a database, posts financial activity or installs a provider.

When changing a route/schema, update the actual handler and [registry](../../packages/contracts/src/generate.ts), review [endpoint policy](api/endpoint-policy.json) against source, adjust fictional overrides only when source refinements require it, and regenerate/check both artifacts and pages. Never hand-edit generated pages/OpenAPI/client declarations or add a policy entry as a substitute for an implemented endpoint. Recheck guards, binary/error responses, source-linked examples and tests. The [contribution](contributing.md), [testing](testing.md) and [extension](extensions-and-broker-adapters.md) guides describe the required change boundaries.
