# Health, sessions and workspaces API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                   |
| ------ | ----------------------------------------------------------------------- |
| GET    | [`/api/v1/health/live`](#get-apiv1healthlive)                           |
| GET    | [`/api/v1/health/ready`](#get-apiv1healthready)                         |
| GET    | [`/api/v1/session`](#get-apiv1session)                                  |
| GET    | [`/api/v1/workspaces`](#get-apiv1workspaces)                            |
| GET    | [`/api/v1/workspaces/{workspaceId}`](#get-apiv1workspacesworkspaceid)   |
| PATCH  | [`/api/v1/workspaces/{workspaceId}`](#patch-apiv1workspacesworkspaceid) |

## GET /api/v1/health/live

**Purpose:** Read public web process liveness; no database, queue or media check.

**Implementation:** [handler](../../../apps/web/src/app/api/v1/health/live/route.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** No authenticated session required; session-read operations may return null.

**Authorization:** none; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name | Location | Required | Type / structural validation                                                   |
| ---- | -------- | -------- | ------------------------------------------------------------------------------ |
| None | —        | —        | No declared path/query/header parameter; shared HTTP/cookie rules still apply. |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type         | Schema / meaning                    |
| ----------- | ------------------ | ----------------------------------- |
| 200         | `application/json` | `object`; Validated application DTO |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/health/live HTTP/1.1
Host: journal.example.test
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "status": "ok",
  "service": "web"
}
```

## GET /api/v1/health/ready

**Purpose:** Read authenticated schema/PostgreSQL/auth-database readiness.

**Implementation:** [handler](../../../apps/web/src/app/api/v1/health/ready/route.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** Valid cookie session required.

**Authorization:** authenticated user; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name | Location | Required | Type / structural validation                                                   |
| ---- | -------- | -------- | ------------------------------------------------------------------------------ |
| None | —        | —        | No declared path/query/header parameter; shared HTTP/cookie rules still apply. |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `object`; Validated application DTO                                    |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 503         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/health/ready HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "status": "ready",
  "database": "connected",
  "schema": "current"
}
```

## GET /api/v1/session

**Purpose:** Read the safe current session DTO, or null when unauthenticated.

**Implementation:** [handler](../../../apps/web/src/app/api/v1/session/route.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** No authenticated session required; session-read operations may return null.

**Authorization:** none; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name | Location | Required | Type / structural validation                                                   |
| ---- | -------- | -------- | ------------------------------------------------------------------------------ |
| None | —        | —        | No declared path/query/header parameter; shared HTTP/cookie rules still apply. |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `object or null`; Validated application DTO                            |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/session HTTP/1.1
Host: journal.example.test
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "user": {
    "id": "1",
    "name": "Fictional example",
    "email": "developer@example.test"
  },
  "expiresAt": "2026-10-21T13:00:00.000000Z"
}
```

## GET /api/v1/workspaces

**Purpose:** List workspaces accessible to the current session.

**Implementation:** [handler](../../../apps/web/src/app/api/v1/workspaces/route.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** Valid cookie session required.

**Authorization:** authenticated user; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name | Location | Required | Type / structural validation                                                   |
| ---- | -------- | -------- | ------------------------------------------------------------------------------ |
| None | —        | —        | No declared path/query/header parameter; shared HTTP/cookie rules still apply. |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `object`; Validated application DTO                                    |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "workspaces": []
}
```

## GET /api/v1/workspaces/{workspaceId}

**Purpose:** Read v1 / workspaces within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/services.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation |
| ------------- | -------- | -------- | ---------------------------- |
| `workspaceId` | path     | Yes      | `string`; format: uuid       |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `object`; Validated application DTO                                    |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "name": "Fictional example",
  "role": "owner",
  "isDemo": false,
  "timezone": "UTC",
  "reportingCurrency": "USD",
  "revision": 1
}
```

## PATCH /api/v1/workspaces/{workspaceId}

**Purpose:** Update v1 / workspaces within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/services.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** Valid cookie session required.

**Authorization:** owner; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name           | Location | Required | Type / structural validation |
| -------------- | -------- | -------- | ---------------------------- |
| `workspaceId`  | path     | Yes      | `string`; format: uuid       |
| `Origin`       | header   | Yes      | `string`; format: uri        |
| `X-CSRF-Token` | header   | Yes      | `string`; minLength: 1       |

**Request body:** Required; `application/json`. `object`

| JSON field          | Required | Type / structural validation                                                                         |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `timezone`          | No       | `string`; minLength: 1; maxLength: 128; pattern: `^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$` |
| `reportingCurrency` | No       | `string or null`; pattern: `^[A-Z][A-Z0-9]{1,15}$`                                                   |
| `expectedRevision`  | Yes      | `integer`; minimum: 1                                                                                |

**Validation:** JSON transport ceiling 16384 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `object`; Validated application DTO                                    |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
PATCH /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Content-Type: application/json

{
  "expectedRevision": 1,
  "timezone": "UTC"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "name": "Fictional example",
  "role": "owner",
  "isDemo": false,
  "timezone": "UTC",
  "reportingCurrency": "USD",
  "revision": 1
}
```
