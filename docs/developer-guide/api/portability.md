# Portable workspaces and exports API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| GET    | [`/api/v1/workspaces/{workspaceId}/portability/backup`](#get-apiv1workspacesworkspaceidportabilitybackup)    |
| POST   | [`/api/v1/workspaces/{workspaceId}/portability/export`](#post-apiv1workspacesworkspaceidportabilityexport)   |
| POST   | [`/api/v1/workspaces/{workspaceId}/portability/restore`](#post-apiv1workspacesworkspaceidportabilityrestore) |

## GET /api/v1/workspaces/{workspaceId}/portability/backup

**Purpose:** Read portability / backup within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/portability/api.ts); [validation schemas](../../../packages/contracts/src/portability.ts).

**Authentication:** Valid cookie session required.

**Authorization:** owner; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                         |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `PortableArchive`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/portability/backup HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "format": "journal-workspace/1",
  "schemaVersion": 17,
  "calculationManifest": {
    "kernel": "journal-financial-kernel/1",
    "ordinaryLinear": "cash-paid-ordinary-linear/1",
    "lotMatching": "fifo-average-specific/1",
    "allocation": "largest-remainder-scale36-stable-id/1",
    "fxSelection": "explicit-direct-inverse-no-future/1",
    "precision": "decimal160-half-even-numeric78-36/1",
    "schema": "financial-ledger/1"
  },
  "sourceWorkspace": {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Fictional empty workspace specimen",
    "timezone": "UTC",
    "reportingCurrency": "USD",
    "createdAt": "2026-01-01T00:00:00.000000Z"
  },
  "exportedAt": "2026-10-21T13:00:00.000000Z",
  "tables": [],
  "media": [],
  "verification": {
    "sourceRevision": "0",
    "cash": [],
    "inventory": []
  },
  "sha256": "9b0d62995b206eb177cf300ade81870fdff89aa220d1d69e0cd70c33a1a4c82c"
}
```

## POST /api/v1/workspaces/{workspaceId}/portability/export

**Purpose:** Authorized filtered JSON or spreadsheet-safe CSV. Source precision is retained in JSON; CSV is a protected presentation.

**Implementation:** [handler](../../../packages/server/src/portability/api.ts); [validation schemas](../../../packages/contracts/src/portability.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name           | Location | Required | Type / structural validation                                                              |
| -------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`       | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token` | header   | Yes      | `string`; minLength: 1                                                                    |

**Request body:** Required; `application/json`. `PortableExportRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field   | Required | Type / structural validation                                                                         |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| `kind`       | Yes      | `string`; enum: "trades", "executions", "cash", "strategies", "reviews", "analytics"                 |
| `format`     | Yes      | `string`; enum: "json", "csv"                                                                        |
| `accountIds` | No       | `array`; maxItems: 100                                                                               |
| `ids`        | No       | `array`; maxItems: 1000                                                                              |
| `from`       | No       | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `to`         | No       | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `analytics`  | No       | `AnalyticsReportRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `string`; format: binary; Filtered download                            |
| 200         | `text/csv`                 | `string`; format: binary; Filtered download                            |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/portability/export HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Content-Type: application/json

{
  "kind": "trades",
  "format": "json"
}
```

**Example response:**

```http
HTTP/1.1 200
Content-Type: application/json

<authorized download bytes; not a JSON DTO>
```

## POST /api/v1/workspaces/{workspaceId}/portability/restore

**Purpose:** Submit portability / restore within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/portability/api.ts); [validation schemas](../../../packages/contracts/src/portability.ts).

**Authentication:** Valid cookie session required.

**Authorization:** owner; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `PortableRestoreRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field | Required | Type / structural validation                                                                  |
| ---------- | -------- | --------------------------------------------------------------------------------------------- |
| `name`     | Yes      | `string`; minLength: 1; maxLength: 120                                                        |
| `archive`  | Yes      | `PortableArchive`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 67108864 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                 |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 201         | `application/json`         | `PortableRestoreResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/portability/restore HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 2e8d8ae3-b141-400e-8cff-693265ea1167
Content-Type: application/json

{
  "name": "Fictional restored workspace specimen",
  "archive": {
    "format": "journal-workspace/1",
    "schemaVersion": 17,
    "calculationManifest": {
      "kernel": "journal-financial-kernel/1",
      "ordinaryLinear": "cash-paid-ordinary-linear/1",
      "lotMatching": "fifo-average-specific/1",
      "allocation": "largest-remainder-scale36-stable-id/1",
      "fxSelection": "explicit-direct-inverse-no-future/1",
      "precision": "decimal160-half-even-numeric78-36/1",
      "schema": "financial-ledger/1"
    },
    "sourceWorkspace": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Fictional empty workspace specimen",
      "timezone": "UTC",
      "reportingCurrency": "USD",
      "createdAt": "2026-01-01T00:00:00.000000Z"
    },
    "exportedAt": "2026-10-21T13:00:00.000000Z",
    "tables": [],
    "media": [],
    "verification": {
      "sourceRevision": "0",
      "cash": [],
      "inventory": []
    },
    "sha256": "9b0d62995b206eb177cf300ade81870fdff89aa220d1d69e0cd70c33a1a4c82c"
  }
}
```

**Example response:**

HTTP 201; illustrative JSON, not an executed result:

```json
{
  "workspaceId": "22222222-2222-4222-8222-222222222222",
  "name": "Fictional restored workspace specimen",
  "sourceWorkspaceId": "11111111-1111-4111-8111-111111111111",
  "archiveSha256": "9b0d62995b206eb177cf300ade81870fdff89aa220d1d69e0cd70c33a1a4c82c",
  "verified": true
}
```
