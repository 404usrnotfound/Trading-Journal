# Account accounting and native snapshots API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | [`/api/v1/workspaces/{workspaceId}/accounting/corrections`](#get-apiv1workspacesworkspaceidaccountingcorrections)                                         |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/corrections/{sourceId}/reverse`](#post-apiv1workspacesworkspaceidaccountingcorrectionssourceidreverse)      |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/expenses`](#post-apiv1workspacesworkspaceidaccountingexpenses)                                              |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/income`](#post-apiv1workspacesworkspaceidaccountingincome)                                                  |
| GET    | [`/api/v1/workspaces/{workspaceId}/accounting/native-snapshot`](#get-apiv1workspacesworkspaceidaccountingnative-snapshot)                                 |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/native-snapshot/refresh`](#post-apiv1workspacesworkspaceidaccountingnative-snapshotrefresh)                 |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/performance`](#post-apiv1workspacesworkspaceidaccountingperformance)                                        |
| GET    | [`/api/v1/workspaces/{workspaceId}/accounting/portfolios`](#get-apiv1workspacesworkspaceidaccountingportfolios)                                           |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/portfolios`](#post-apiv1workspacesworkspaceidaccountingportfolios)                                          |
| GET    | [`/api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}`](#get-apiv1workspacesworkspaceidaccountingportfoliosportfolioid)                  |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}`](#post-apiv1workspacesworkspaceidaccountingportfoliosportfolioid)                 |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}/archive`](#post-apiv1workspacesworkspaceidaccountingportfoliosportfolioidarchive)  |
| GET    | [`/api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}/versions`](#get-apiv1workspacesworkspaceidaccountingportfoliosportfolioidversions) |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/reports`](#post-apiv1workspacesworkspaceidaccountingreports)                                                |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/taxes`](#post-apiv1workspacesworkspaceidaccountingtaxes)                                                    |
| GET    | [`/api/v1/workspaces/{workspaceId}/accounting/transfers`](#get-apiv1workspacesworkspaceidaccountingtransfers)                                             |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/transfers`](#post-apiv1workspacesworkspaceidaccountingtransfers)                                            |
| POST   | [`/api/v1/workspaces/{workspaceId}/accounting/transfers/{transferId}/receipt`](#post-apiv1workspacesworkspaceidaccountingtransferstransferidreceipt)      |

## GET /api/v1/workspaces/{workspaceId}/accounting/corrections

**Purpose:** Workspace-scoped immutable portfolio definitions and owned-account cash transfer evidence. Lists are cursor-paginated, at most 100 entries per page. Transfer status can be read at an explicit economic boundary.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `integer`; minimum: 1; maximum: 100                                                       |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                             |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AccountingCorrectionSourcesResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                       |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                       |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                       |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                       |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                       |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                       |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                       |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                       |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                       |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                       |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/corrections HTTP/1.1
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

## POST /api/v1/workspaces/{workspaceId}/accounting/corrections/{sourceId}/reverse

**Purpose:** Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `sourceId`        | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ReverseAccountingSourceRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field               | Required | Type / structural validation                                                                          |
| ------------------------ | -------- | ----------------------------------------------------------------------------------------------------- |
| `sourceType`             | Yes      | `string`; enum: "cash-event", "transfer"                                                              |
| `expectedSourceRevision` | Yes      | `FinancialSourceRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`                 | Yes      | `string`; minLength: 1; maxLength: 2000                                                               |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AccountingMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/corrections/92340ce0-9843-48dc-8014-d7c21c191b23/reverse HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 92d2cd10-fb3f-4f46-8bf1-e50763ce705d
Content-Type: application/json

{
  "sourceType": "cash-event",
  "expectedSourceRevision": "1",
  "reason": "Fictional example"
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

## POST /api/v1/workspaces/{workspaceId}/accounting/expenses

**Purpose:** Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `RecordExpenseRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field     | Required | Type / structural validation                                                                       |
| -------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `economicAt`   | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `orderingKey`  | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`    | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `cashBucketId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `currencyId`   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `amount`       | Yes      | `FinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `kind`         | Yes      | `string`; enum: "financing", "interest", "other"                                                   |
| `description`  | Yes      | `string`; maxLength: 4000                                                                          |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AccountingMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/expenses HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 7123ca47-8104-4c3f-807e-9f0f6cbf3e2d
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "cashBucketId": "66c9fbfc-a672-4154-8f81-37fba5853601",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "amount": "1",
  "kind": "financing",
  "description": "Fictional example"
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

## POST /api/v1/workspaces/{workspaceId}/accounting/income

**Purpose:** Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `RecordIncomeRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field     | Required | Type / structural validation                                                                              |
| -------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `economicAt`   | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)            |
| `orderingKey`  | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `accountId`    | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)                 |
| `cashBucketId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)                 |
| `currencyId`   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)                 |
| `kind`         | Yes      | `string`; enum: "dividend", "interest"                                                                    |
| `amount`       | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `withholding`  | No       | `NonnegativeFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `description`  | No       | `string`; maxLength: 4000                                                                                 |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AccountingMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/income HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 03047a89-abc7-473d-8bf8-0f9911b73adf
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "cashBucketId": "66c9fbfc-a672-4154-8f81-37fba5853601",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "kind": "dividend",
  "amount": "1"
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

## GET /api/v1/workspaces/{workspaceId}/accounting/native-snapshot

**Purpose:** Read-only viewer/editor/owner status for the durable native cash/quantity projection. Compare latest and processed source revisions, attempts and safe failure classifications. The snapshot covers all recorded events, including future-dated sources; it is not NAV or an as-of accounting report.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler. Implemented accounting route misplaced under strategies in pre-CP6 generator

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                              |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `NativeSnapshotStatus`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/native-snapshot HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "state": "current",
  "latestSourceRevision": "1",
  "processedSourceRevision": "1",
  "jobStatus": "idle",
  "attempts": 0,
  "lastErrorCode": "scope-too-large",
  "snapshot": {
    "version": "native-financial-snapshot/1",
    "sourceRevision": "1",
    "economicScope": "all-recorded-events",
    "capturedAt": "2026-10-20T09:00:00.000000Z",
    "cash": [],
    "holdings": []
  }
}
```

## POST /api/v1/workspaces/{workspaceId}/accounting/native-snapshot/refresh

**Purpose:** Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `NativeSnapshotRefreshRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field | Required | Type / structural validation           |
| ---------- | -------- | -------------------------------------- |
| `reason`   | Yes      | `string`; minLength: 1; maxLength: 500 |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AccountingMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/native-snapshot/refresh HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: f2983527-e889-4f9c-84ad-ec4091864cd5
Content-Type: application/json

{
  "reason": "Fictional example"
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

## POST /api/v1/workspaces/{workspaceId}/accounting/performance

**Purpose:** Read-only account performance at explicit valuation checkpoints. Flow-adjusted changes and conditional TWR/MWR retain completeness and uniqueness requirements.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `AccountPerformanceRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field                | Required | Type / structural validation                                                                          |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `suppliedPositionIds`     | No       | `array`; maxItems: 100                                                                                |
| `accountIds`              | No       | `array`; minItems: 1; maxItems: 100                                                                   |
| `portfolioVersionId`      | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `reportingCurrencyId`     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `from`                    | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `to`                      | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `sourceRevision`          | No       | `FinancialSourceRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `fxPolicy`                | Yes      | `AccountingFxPolicy`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `priceMaxAgeMilliseconds` | Yes      | `integer`; minimum: 0; maximum: 9007199254740991                                                      |
| `priceSourcePriority`     | Yes      | `array`; minItems: 1; maxItems: 64                                                                    |
| `detail`                  | No       | `string`; enum: "full", "summary"                                                                     |
| `dependencyPage`          | No       | `object`                                                                                              |
| `checkpoints`             | No       | `array`; maxItems: 24                                                                                 |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AccountPerformanceResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/performance HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Content-Type: application/json

{
  "reportingCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "from": "2026-10-20T09:00:00.000000Z",
  "to": "2026-10-21T13:00:00.000000Z",
  "fxPolicy": {
    "id": "1",
    "maxAgeMilliseconds": 0,
    "sourcePriority": [
      "1"
    ]
  },
  "priceMaxAgeMilliseconds": 0,
  "priceSourcePriority": [
    "1"
  ],
  "accountIds": [
    "11111111-1111-4111-8111-111111111111"
  ]
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "accountIds": ["11111111-1111-4111-8111-111111111111"],
  "reportingCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "sourceRevision": "1",
  "from": "2026-10-20T09:00:00.000000Z",
  "to": "2026-10-21T13:00:00.000000Z",
  "method": "exact-flow-boundaries/act-365/1",
  "valuationPolicy": "report-price-and-fx-policy",
  "twr": {
    "state": "available",
    "value": "0",
    "reasons": []
  },
  "mwr": {
    "state": "available",
    "value": "0",
    "reasons": []
  },
  "maximumDrawdown": {
    "state": "available",
    "value": "0",
    "reasons": []
  },
  "recoveryDurationMilliseconds": null,
  "series": [
    {
      "at": "2026-10-20T09:00:00.000000Z",
      "nav": "100",
      "capitalFlow": "0",
      "unitIndex": "100",
      "drawdown": "0",
      "reasons": []
    },
    {
      "at": "2026-10-21T13:00:00.000000Z",
      "nav": "100",
      "capitalFlow": "0",
      "unitIndex": "100",
      "drawdown": "0",
      "reasons": []
    }
  ]
}
```

## GET /api/v1/workspaces/{workspaceId}/accounting/portfolios

**Purpose:** Workspace-scoped immutable portfolio definitions and owned-account cash transfer evidence. Lists are cursor-paginated, at most 100 entries per page. Transfer status can be read at an explicit economic boundary.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`          | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`           | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                  |
| `includeArchived` | query    | No       | `string`; enum: "true", "false"                                                           |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                               |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `PortfolioListResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/portfolios HTTP/1.1
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

## POST /api/v1/workspaces/{workspaceId}/accounting/portfolios

**Purpose:** Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `CreatePortfolioRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field    | Required | Type / structural validation           |
| ------------- | -------- | -------------------------------------- |
| `name`        | Yes      | `string`; minLength: 1; maxLength: 160 |
| `description` | No       | `string`; maxLength: 4000              |
| `environment` | Yes      | `string`; enum: "live", "paper"        |
| `accountIds`  | Yes      | `array`; minItems: 1; maxItems: 100    |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                   |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PortfolioMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/portfolios HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: a4c3da20-57a4-4cd1-862b-b68a852b7a78
Content-Type: application/json

{
  "name": "Fictional example",
  "environment": "live",
  "accountIds": [
    "5eeec7a2-1167-4185-851c-e61f603a5d2e"
  ]
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "commandId": "00ac187e-bb1e-48c7-8451-9ff5c4a32086",
  "sourceRevision": "1",
  "versionId": "772c657e-ac9c-4550-8ecf-9f77201cbb95",
  "version": 1
}
```

## GET /api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}

**Purpose:** Workspace-scoped immutable portfolio definitions and owned-account cash transfer evidence. Lists are cursor-paginated, at most 100 entries per page. Transfer status can be read at an explicit economic boundary.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `portfolioId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                           |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PortfolioResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/portfolios/c3e1688f-13a1-4fe2-8eb0-c124da7e3ee7 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "workspaceId": "09707fa5-aaae-4493-8a23-827111000f89",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "currentVersion": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "portfolioId": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "version": 1,
    "name": "Fictional example",
    "description": "Fictional example",
    "environment": "live",
    "accountIds": ["5eeec7a2-1167-4185-851c-e61f603a5d2e"],
    "archived": false,
    "reason": "Fictional example",
    "sourceRevision": "1",
    "commandId": "00ac187e-bb1e-48c7-8451-9ff5c4a32086",
    "createdAt": "2026-10-20T09:00:00.000000Z"
  }
}
```

## POST /api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}

**Purpose:** Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `portfolioId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `UpdatePortfolioRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                    |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `name`            | Yes      | `string`; minLength: 1; maxLength: 160                                                          |
| `description`     | No       | `string`; maxLength: 4000                                                                       |
| `environment`     | Yes      | `string`; enum: "live", "paper"                                                                 |
| `accountIds`      | Yes      | `array`; minItems: 1; maxItems: 100                                                             |
| `expectedVersion` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`          | Yes      | `string`; minLength: 1; maxLength: 2000                                                         |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                   |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PortfolioMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/portfolios/c3e1688f-13a1-4fe2-8eb0-c124da7e3ee7 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 86f572d6-8375-40c4-81ff-0bf985a049c4
Content-Type: application/json

{
  "name": "Fictional example",
  "environment": "live",
  "accountIds": [
    "5eeec7a2-1167-4185-851c-e61f603a5d2e"
  ],
  "expectedVersion": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "commandId": "00ac187e-bb1e-48c7-8451-9ff5c4a32086",
  "sourceRevision": "1",
  "versionId": "772c657e-ac9c-4550-8ecf-9f77201cbb95",
  "version": 1
}
```

## POST /api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}/archive

**Purpose:** Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `portfolioId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ArchivePortfolioRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                    |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `expectedVersion` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`          | Yes      | `string`; minLength: 1; maxLength: 2000                                                         |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                   |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PortfolioMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/portfolios/c3e1688f-13a1-4fe2-8eb0-c124da7e3ee7/archive HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: e794c157-d999-4b9c-831b-19761e9d5a80
Content-Type: application/json

{
  "expectedVersion": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "commandId": "00ac187e-bb1e-48c7-8451-9ff5c4a32086",
  "sourceRevision": "1",
  "versionId": "772c657e-ac9c-4550-8ecf-9f77201cbb95",
  "version": 1
}
```

## GET /api/v1/workspaces/{workspaceId}/accounting/portfolios/{portfolioId}/versions

**Purpose:** Workspace-scoped immutable portfolio definitions and owned-account cash transfer evidence. Lists are cursor-paginated, at most 100 entries per page. Transfer status can be read at an explicit economic boundary.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `portfolioId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                  |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                      |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PortfolioVersionListResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/portfolios/c3e1688f-13a1-4fe2-8eb0-c124da7e3ee7/versions HTTP/1.1
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

## POST /api/v1/workspaces/{workspaceId}/accounting/reports

**Purpose:** Read-only accounting report available to viewers. Select exactly one explicit account population or immutable portfolio version and a reporting currency. The period is (from,to], with complete opening and closing boundaries. Source revision, FX policy and price freshness/source priorities are explicit. Monetary amounts are lossless decimal strings. Missing evidence produces null totals with known subtotals and explanations; reconciliation variance is retained rather than relabeled as FX or profit. This POST performs no mutation and requires no mutation CSRF proof or idempotency key.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `AccountingReportRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field                | Required | Type / structural validation                                                                          |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `suppliedPositionIds`     | No       | `array`; maxItems: 100                                                                                |
| `accountIds`              | No       | `array`; minItems: 1; maxItems: 100                                                                   |
| `portfolioVersionId`      | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `reportingCurrencyId`     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `from`                    | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `to`                      | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `sourceRevision`          | No       | `FinancialSourceRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `fxPolicy`                | Yes      | `AccountingFxPolicy`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `priceMaxAgeMilliseconds` | Yes      | `integer`; minimum: 0; maximum: 9007199254740991                                                      |
| `priceSourcePriority`     | Yes      | `array`; minItems: 1; maxItems: 64                                                                    |
| `detail`                  | No       | `string`; enum: "full", "summary"                                                                     |
| `dependencyPage`          | No       | `object`                                                                                              |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                  |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AccountingReportResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/reports HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Content-Type: application/json

{
  "reportingCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "from": "2026-10-20T09:00:00.000000Z",
  "to": "2026-10-21T13:00:00.000000Z",
  "fxPolicy": {
    "id": "1",
    "maxAgeMilliseconds": 0,
    "sourcePriority": [
      "1"
    ]
  },
  "priceMaxAgeMilliseconds": 0,
  "priceSourcePriority": [
    "1"
  ],
  "accountIds": [
    "11111111-1111-4111-8111-111111111111"
  ]
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "context": {
    "accountIds": ["5eeec7a2-1167-4185-851c-e61f603a5d2e"],
    "portfolioId": null,
    "portfolioVersion": null,
    "environment": "live",
    "reportingCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
    "sourceRevision": "1",
    "from": "2026-10-20T09:00:00.000000Z",
    "to": "2026-10-21T13:00:00.000000Z",
    "fxPolicy": {
      "id": "1",
      "maxAgeMilliseconds": 0,
      "sourcePriority": ["1"]
    },
    "pricePolicy": {
      "maxAgeMilliseconds": 0,
      "sourcePriority": ["1"]
    },
    "manifest": {
      "kernel": "1",
      "ordinaryLinear": "1",
      "lotMatching": "1",
      "allocation": "1",
      "fxSelection": "1",
      "precision": "1",
      "schema": "1"
    },
    "accountingVersion": "portfolio-accounting-v1"
  },
  "opening": {
    "asOf": "2026-10-20T09:00:00.000000Z",
    "cashByCurrency": [],
    "cash": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "holdings": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "transit": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "equity": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "netLiquidationValue": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "unrealizedGrossByCurrency": []
  },
  "closing": {
    "asOf": "2026-10-21T13:00:00.000000Z",
    "cashByCurrency": [],
    "cash": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "holdings": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "transit": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "equity": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "netLiquidationValue": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "unrealizedGrossByCurrency": []
  },
  "breakdown": {
    "realizedTradingPnl": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "unrealizedTradingPnlChange": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "tradingPnl": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "holdingFx": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "cashFx": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "transitFx": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "conversionEffects": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "income": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "fees": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "expenses": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "taxes": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "externalCashFlows": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "boundaryTransfers": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "openingAdjustments": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    }
  },
  "native": {
    "realizedGross": [],
    "unrealizedGross": []
  },
  "reconciliation": {
    "navChange": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "netCapitalFlows": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "performance": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "explainedChange": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "variance": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    },
    "roundingResidual": {
      "state": "available",
      "value": "0",
      "knownSubtotal": "0",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "reasons": [],
      "missingReferences": []
    }
  },
  "dependencies": {
    "fx": [],
    "prices": [],
    "sourceIds": []
  }
}
```

## POST /api/v1/workspaces/{workspaceId}/accounting/taxes

**Purpose:** Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `RecordTaxRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                       |
| ----------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `economicAt`      | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `orderingKey`     | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`       | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `cashBucketId`    | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `currencyId`      | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `amount`          | Yes      | `FinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `description`     | Yes      | `string`; maxLength: 4000                                                                          |
| `relatedIncomeId` | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AccountingMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/taxes HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 3f8ccc50-c082-4210-82af-c21317b1bd77
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "cashBucketId": "66c9fbfc-a672-4154-8f81-37fba5853601",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "amount": "1",
  "description": "Fictional example"
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

## GET /api/v1/workspaces/{workspaceId}/accounting/transfers

**Purpose:** Workspace-scoped immutable portfolio definitions and owned-account cash transfer evidence. Lists are cursor-paginated, at most 100 entries per page. Transfer status can be read at an explicit economic boundary.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                                   |
| ------------- | -------- | -------- | ---------------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `limit`       | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                       |
| `asOf`        | query    | No       | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                  |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CashTransferListResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/transfers HTTP/1.1
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

## POST /api/v1/workspaces/{workspaceId}/accounting/transfers

**Purpose:** Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `CreateCashTransferRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                           |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `economicAt`          | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |
| `orderingKey`         | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `sourceBucketId`      | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `destinationBucketId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `amount`              | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `description`         | Yes      | `string`; maxLength: 4000                                                                              |
| `receiptAt`           | No       | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AccountingMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/transfers HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: e07a33e3-482a-4346-8fb0-19532720ecd4
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "sourceBucketId": "d2e828f3-d243-4407-8fd6-724e82954507",
  "destinationBucketId": "a1cc6c3a-b364-4094-8ecb-aff75e25fc00",
  "amount": "1",
  "description": "Fictional example"
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

## POST /api/v1/workspaces/{workspaceId}/accounting/transfers/{transferId}/receipt

**Purpose:** Editor/owner accounting command with durable idempotency. Portfolio edits append complete immutable scope versions. Income records gross dividends or interest and optional withholding as a separate tax posting. Positive expense/tax amounts are charges and negative amounts are refunds. Cash transfers require distinct same-currency owned accounts; omitted receiptAt records departure and an evidenced monetary transit claim. A later receipt is a separate immutable command. Deposits and boundary transfers are capital flows, never trading profit.

**Implementation:** [handler](../../../packages/server/src/accounting/api.ts); [validation schemas](../../../packages/contracts/src/accounting.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `transferId`      | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ReceiveCashTransferRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field    | Required | Type / structural validation                                                                       |
| ------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `economicAt`  | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `orderingKey` | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AccountingMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 429         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/accounting/transfers/8ca05a31-37e1-44f7-88d9-d9beaac820cb/receipt HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 8efed1c1-49c7-407c-8ded-65defa4f23dc
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1"
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
