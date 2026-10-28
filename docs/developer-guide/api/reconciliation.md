# Independent reconciliation API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | [`/api/v1/workspaces/{workspaceId}/reconciliation/evaluations/{id}`](#get-apiv1workspacesworkspaceidreconciliationevaluationsid)                       |
| GET    | [`/api/v1/workspaces/{workspaceId}/reconciliation/statements`](#get-apiv1workspacesworkspaceidreconciliationstatements)                                |
| POST   | [`/api/v1/workspaces/{workspaceId}/reconciliation/statements`](#post-apiv1workspacesworkspaceidreconciliationstatements)                               |
| GET    | [`/api/v1/workspaces/{workspaceId}/reconciliation/statements/{id}`](#get-apiv1workspacesworkspaceidreconciliationstatementsid)                         |
| GET    | [`/api/v1/workspaces/{workspaceId}/reconciliation/statements/{id}/evaluations`](#get-apiv1workspacesworkspaceidreconciliationstatementsidevaluations)  |
| POST   | [`/api/v1/workspaces/{workspaceId}/reconciliation/statements/{id}/evaluations`](#post-apiv1workspacesworkspaceidreconciliationstatementsidevaluations) |

## GET /api/v1/workspaces/{workspaceId}/reconciliation/evaluations/{id}

**Purpose:** Read reconciliation / evaluations within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reconciliation/api.ts); [validation schemas](../../../packages/contracts/src/reconciliation.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `id`          | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                         |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StatementReconciliationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reconciliation/evaluations/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "statementId": "7b90e51e-caf6-435b-8293-0bc916a18579",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "asOf": "2026-10-20T09:00:00.000000Z",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "sourceRevision": "1",
  "comparedRevision": "1",
  "currentRevision": "1",
  "stale": false,
  "status": "matched",
  "accepted": false,
  "reviewNote": "1",
  "rows": []
}
```

## GET /api/v1/workspaces/{workspaceId}/reconciliation/statements

**Purpose:** Read reconciliation / statements within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reconciliation/api.ts); [validation schemas](../../../packages/contracts/src/reconciliation.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`   | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `integer`; minimum: 1; maximum: 100                                                       |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                               |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `StatementListResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reconciliation/statements HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "items": [],
  "nextCursor": null
}
```

## POST /api/v1/workspaces/{workspaceId}/reconciliation/statements

**Purpose:** Submit reconciliation / statements within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reconciliation/api.ts); [validation schemas](../../../packages/contracts/src/reconciliation.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `CreateStatementRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field           | Required | Type / structural validation                                                                   |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `accountId`          | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `asOf`               | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `sourceName`         | Yes      | `string`; minLength: 1; maxLength: 160                                                         |
| `sourceReference`    | Yes      | `string`; minLength: 1; maxLength: 500                                                         |
| `sourceHash`         | No       | `string`; pattern: `^[a-f0-9]{64}$`                                                            |
| `cashDefinition`     | Yes      | `string`; enum: "all-owned-cash/1"                                                             |
| `holdingsDefinition` | Yes      | `string`; enum: "netted-account-inventory/1"                                                   |
| `completeCash`       | Yes      | `boolean`                                                                                      |
| `completeHoldings`   | Yes      | `boolean`                                                                                      |
| `cash`               | Yes      | `array`; maxItems: 100                                                                         |
| `holdings`           | Yes      | `array`; maxItems: 100                                                                         |
| `equity`             | No       | `object`                                                                                       |
| `notes`              | No       | `string`; maxLength: 4000                                                                      |

**Validation:** JSON transport ceiling 131072 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                           |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StatementResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reconciliation/statements HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: f7db4276-abce-4b76-8644-152d9a65591e
Content-Type: application/json

{
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "asOf": "2026-10-20T09:00:00.000000Z",
  "sourceName": "Fictional example",
  "sourceReference": "1",
  "cashDefinition": "all-owned-cash/1",
  "holdingsDefinition": "netted-account-inventory/1",
  "completeCash": true,
  "completeHoldings": false,
  "cash": [],
  "holdings": []
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "asOf": "2026-10-20T09:00:00.000000Z",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "sourceRevision": "1",
  "document": {
    "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
    "asOf": "2026-10-20T09:00:00.000000Z",
    "sourceName": "Fictional example",
    "sourceReference": "1",
    "cashDefinition": "all-owned-cash/1",
    "holdingsDefinition": "netted-account-inventory/1",
    "completeCash": true,
    "completeHoldings": false,
    "cash": [],
    "holdings": []
  }
}
```

## GET /api/v1/workspaces/{workspaceId}/reconciliation/statements/{id}

**Purpose:** Read reconciliation / statements within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reconciliation/api.ts); [validation schemas](../../../packages/contracts/src/reconciliation.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `id`          | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                           |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StatementResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reconciliation/statements/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "asOf": "2026-10-20T09:00:00.000000Z",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "sourceRevision": "1",
  "document": {
    "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
    "asOf": "2026-10-20T09:00:00.000000Z",
    "sourceName": "Fictional example",
    "sourceReference": "1",
    "cashDefinition": "all-owned-cash/1",
    "holdingsDefinition": "netted-account-inventory/1",
    "completeCash": true,
    "completeHoldings": false,
    "cash": [],
    "holdings": []
  }
}
```

## GET /api/v1/workspaces/{workspaceId}/reconciliation/statements/{id}/evaluations

**Purpose:** Read statements / evaluations within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reconciliation/api.ts); [validation schemas](../../../packages/contracts/src/reconciliation.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `id`          | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`   | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `integer`; minimum: 1; maximum: 100                                                       |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                         |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StatementEvaluationListResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reconciliation/statements/a5614527-0ce6-43be-8d1d-d012b7394867/evaluations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "items": [],
  "nextCursor": null
}
```

## POST /api/v1/workspaces/{workspaceId}/reconciliation/statements/{id}/evaluations

**Purpose:** Submit statements / evaluations within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reconciliation/api.ts); [validation schemas](../../../packages/contracts/src/reconciliation.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `id`              | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `EvaluateStatementRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                          |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `sourceRevision`  | No       | `FinancialSourceRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `valuationPolicy` | No       | `ReconciliationPolicy`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `accept`          | No       | `boolean`                                                                                             |
| `reviewNote`      | Yes      | `string`; minLength: 1; maxLength: 2000                                                               |

**Validation:** JSON transport ceiling 131072 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                         |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StatementReconciliationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                   |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reconciliation/statements/a5614527-0ce6-43be-8d1d-d012b7394867/evaluations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 09b136c8-f541-41a9-8ae1-80293dc1686e
Content-Type: application/json

{
  "reviewNote": "1"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "statementId": "7b90e51e-caf6-435b-8293-0bc916a18579",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "asOf": "2026-10-20T09:00:00.000000Z",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "sourceRevision": "1",
  "comparedRevision": "1",
  "currentRevision": "1",
  "stale": false,
  "status": "matched",
  "accepted": false,
  "reviewNote": "1",
  "rows": []
}
```
