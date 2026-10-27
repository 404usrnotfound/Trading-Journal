# Authentication gateway API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                       |
| ------ | ----------------------------------------------------------- |
| POST   | [`/api/auth/change-password`](#post-apiauthchange-password) |
| POST   | [`/api/auth/revoke-session`](#post-apiauthrevoke-session)   |
| GET    | [`/api/auth/session`](#get-apiauthsession)                  |
| GET    | [`/api/auth/sessions`](#get-apiauthsessions)                |
| POST   | [`/api/auth/sign-in/email`](#post-apiauthsign-inemail)      |
| POST   | [`/api/auth/sign-out`](#post-apiauthsign-out)               |

## POST /api/auth/change-password

**Purpose:** Submit auth / change-password within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/auth-gateway.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** Valid cookie session required. Sign-in must be less than five minutes old.

**Authorization:** authenticated user; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name           | Location | Required | Type / structural validation |
| -------------- | -------- | -------- | ---------------------------- |
| `Origin`       | header   | Yes      | `string`; format: uri        |
| `X-CSRF-Token` | header   | Yes      | `string`; minLength: 1       |

**Request body:** Required; `application/json`. `object`

| JSON field        | Required | Type / structural validation            |
| ----------------- | -------- | --------------------------------------- |
| `currentPassword` | Yes      | `string`; minLength: 1; maxLength: 128  |
| `newPassword`     | Yes      | `string`; minLength: 12; maxLength: 128 |

**Validation:** JSON transport ceiling 16384 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `object`; Validated application DTO                                    |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/auth/change-password HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Content-Type: application/json

{
  "currentPassword": "Fictional-password-2026!",
  "newPassword": "Fictional-password-2026!"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "ok": true
}
```

## POST /api/auth/revoke-session

**Purpose:** Submit auth / revoke-session within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/auth-gateway.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** Valid cookie session required. Sign-in must be less than five minutes old.

**Authorization:** authenticated user; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name           | Location | Required | Type / structural validation |
| -------------- | -------- | -------- | ---------------------------- |
| `Origin`       | header   | Yes      | `string`; format: uri        |
| `X-CSRF-Token` | header   | Yes      | `string`; minLength: 1       |

**Request body:** Required; `application/json`. `object`

| JSON field  | Required | Type / structural validation           |
| ----------- | -------- | -------------------------------------- |
| `sessionId` | Yes      | `string`; minLength: 1; maxLength: 128 |

**Validation:** JSON transport ceiling 16384 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `object`; Validated application DTO                                    |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/auth/revoke-session HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Content-Type: application/json

{
  "sessionId": "09724085-1664-4183-8554-bacab2816579"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "ok": true
}
```

## GET /api/auth/session

**Purpose:** Read the safe current session DTO, or null when unauthenticated.

**Implementation:** [handler](../../../packages/server/src/auth-gateway.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** No authenticated session required; session-read operations may return null.

**Authorization:** none; nullable session read or public credential exchange; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

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
GET /api/auth/session HTTP/1.1
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

## GET /api/auth/sessions

**Purpose:** List safe session identifiers after authentication within the past five minutes.

**Implementation:** [handler](../../../packages/server/src/auth-gateway.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** Valid cookie session required. Sign-in must be less than five minutes old.

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
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/auth/sessions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "sessions": []
}
```

## POST /api/auth/sign-in/email

**Purpose:** Authenticate an existing provisioned user with email/password; no public signup.

**Implementation:** [handler](../../../packages/server/src/auth-gateway.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** No authenticated session required; session-read operations may return null.

**Authorization:** none; nullable session read or public credential exchange; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name     | Location | Required | Type / structural validation |
| -------- | -------- | -------- | ---------------------------- |
| `Origin` | header   | Yes      | `string`; format: uri        |

**Request body:** Required; `application/json`. `object`

| JSON field | Required | Type / structural validation           |
| ---------- | -------- | -------------------------------------- |
| `email`    | Yes      | `string`; format: email                |
| `password` | Yes      | `string`; minLength: 1; maxLength: 128 |

**Validation:** JSON transport ceiling 16384 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `object`; Validated application DTO                                    |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/auth/sign-in/email HTTP/1.1
Host: journal.example.test
Origin: https://journal.example.test
Content-Type: application/json

{
  "email": "developer@example.test",
  "password": "Fictional-password-2026!"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "ok": true
}
```

## POST /api/auth/sign-out

**Purpose:** Revoke the current authenticated session and clear its cookie.

**Implementation:** [handler](../../../packages/server/src/auth-gateway.ts); [validation schemas](../../../packages/contracts/src/index.ts).

**Authentication:** Valid cookie session required.

**Authorization:** authenticated user; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name           | Location | Required | Type / structural validation |
| -------------- | -------- | -------- | ---------------------------- |
| `Origin`       | header   | Yes      | `string`; format: uri        |
| `X-CSRF-Token` | header   | Yes      | `string`; minLength: 1       |

**Request body:** Required; `application/json`. `object`

| JSON field | Required | Type / structural validation |
| ---------- | -------- | ---------------------------- |

**Validation:** JSON transport ceiling 16384 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `object`; Validated application DTO                                    |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/auth/sign-out HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Content-Type: application/json

{}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "ok": true
}
```
