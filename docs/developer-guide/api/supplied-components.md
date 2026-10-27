# Reviewed supplied components API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | [`/api/v1/workspaces/{workspaceId}/supplied-components/observations`](#get-apiv1workspacesworkspaceidsupplied-componentsobservations)  |
| POST   | [`/api/v1/workspaces/{workspaceId}/supplied-components/observations`](#post-apiv1workspacesworkspaceidsupplied-componentsobservations) |

## GET /api/v1/workspaces/{workspaceId}/supplied-components/observations

**Purpose:** Read supplied-components / observations within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/supplied/api.ts); [validation schemas](../../../packages/contracts/src/supplied.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`   | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `tradeId`     | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `afterId`     | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `integer`; minimum: 1; maximum: 100                                                       |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                       |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `SuppliedComponentListResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                 |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                 |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                 |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                 |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                 |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                 |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/supplied-components/observations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "sourceRevision": "1",
  "items": [],
  "nextCursor": null
}
```

## POST /api/v1/workspaces/{workspaceId}/supplied-components/observations

**Purpose:** Submit supplied-components / observations within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/supplied/api.ts); [validation schemas](../../../packages/contracts/src/supplied.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `SuppliedComponentCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

**Validation:** JSON transport ceiling 32768 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                   |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `FinancialMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/supplied-components/observations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 8131ff40-b6c6-4b71-8e10-be131c0a27f9
Content-Type: application/json

{
  "amount": "1",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "observedAt": "2026-10-20T09:00:00.000000Z",
  "source": "1",
  "sourceReference": "1",
  "quality": "broker-reported",
  "expectedSourceRevision": "1",
  "kind": "position-equity",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
  "signedQuantity": "1",
  "valueDefinition": "delivered-market-value",
  "cashExcluded": true,
  "collateralExcluded": true,
  "settledPnlExcluded": true,
  "unsettledCashExcluded": true,
  "accrualTreatment": "included-residual-only"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "commandId": "00ac187e-bb1e-48c7-8451-9ff5c4a32086",
  "sourceRevision": "1"
}
```
