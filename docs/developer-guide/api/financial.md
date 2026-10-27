# Financial catalog and source ledger API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/account-valuations`](#get-apiv1workspacesworkspaceidfinancialaccount-valuations)                |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/account-valuations`](#post-apiv1workspacesworkspaceidfinancialaccount-valuations)               |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/accounts`](#get-apiv1workspacesworkspaceidfinancialaccounts)                                    |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/accounts`](#post-apiv1workspacesworkspaceidfinancialaccounts)                                   |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/accounts/{id}`](#get-apiv1workspacesworkspaceidfinancialaccountsid)                             |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/accounts/{id}/archive`](#post-apiv1workspacesworkspaceidfinancialaccountsidarchive)             |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/accounts/{id}/settings`](#post-apiv1workspacesworkspaceidfinancialaccountsidsettings)           |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/brokers`](#get-apiv1workspacesworkspaceidfinancialbrokers)                                      |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/brokers`](#post-apiv1workspacesworkspaceidfinancialbrokers)                                     |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/brokers/{id}/archive`](#post-apiv1workspacesworkspaceidfinancialbrokersidarchive)               |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/bucket-movements`](#post-apiv1workspacesworkspaceidfinancialbucket-movements)                   |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/campaign-inventory`](#get-apiv1workspacesworkspaceidfinancialcampaign-inventory)                |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/cash-balances`](#get-apiv1workspacesworkspaceidfinancialcash-balances)                          |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/cash-buckets`](#post-apiv1workspacesworkspaceidfinancialcash-buckets)                           |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/cash-movements`](#post-apiv1workspacesworkspaceidfinancialcash-movements)                       |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/currencies`](#get-apiv1workspacesworkspaceidfinancialcurrencies)                                |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/currencies`](#post-apiv1workspacesworkspaceidfinancialcurrencies)                               |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/currencies/{id}`](#get-apiv1workspacesworkspaceidfinancialcurrenciesid)                         |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/currencies/{id}/archive`](#post-apiv1workspacesworkspaceidfinancialcurrenciesidarchive)         |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/currencies/{id}/conventions`](#post-apiv1workspacesworkspaceidfinancialcurrenciesidconventions) |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/execution-allocations`](#post-apiv1workspacesworkspaceidfinancialexecution-allocations)         |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/execution-corrections`](#post-apiv1workspacesworkspaceidfinancialexecution-corrections)         |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/executions`](#get-apiv1workspacesworkspaceidfinancialexecutions)                                |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/executions`](#post-apiv1workspacesworkspaceidfinancialexecutions)                               |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/executions/{id}/allocations`](#get-apiv1workspacesworkspaceidfinancialexecutionsidallocations)  |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/fee-attributions`](#post-apiv1workspacesworkspaceidfinancialfee-attributions)                   |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/fees`](#get-apiv1workspacesworkspaceidfinancialfees)                                            |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/fees`](#post-apiv1workspacesworkspaceidfinancialfees)                                           |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/fx-conversions`](#post-apiv1workspacesworkspaceidfinancialfx-conversions)                       |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/fx-observations`](#post-apiv1workspacesworkspaceidfinancialfx-observations)                     |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/holding-transfers`](#post-apiv1workspacesworkspaceidfinancialholding-transfers)                 |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/instrument-versions/{id}`](#get-apiv1workspacesworkspaceidfinancialinstrument-versionsid)       |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/instruments`](#get-apiv1workspacesworkspaceidfinancialinstruments)                              |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/instruments`](#post-apiv1workspacesworkspaceidfinancialinstruments)                             |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/instruments/{id}`](#get-apiv1workspacesworkspaceidfinancialinstrumentsid)                       |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/instruments/{id}/archive`](#post-apiv1workspacesworkspaceidfinancialinstrumentsidarchive)       |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/instruments/{id}/versions`](#post-apiv1workspacesworkspaceidfinancialinstrumentsidversions)     |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/opening-lots`](#post-apiv1workspacesworkspaceidfinancialopening-lots)                           |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/orders`](#get-apiv1workspacesworkspaceidfinancialorders)                                        |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/orders`](#post-apiv1workspacesworkspaceidfinancialorders)                                       |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/orders/{id}`](#get-apiv1workspacesworkspaceidfinancialordersid)                                 |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/orders/{id}/amendments`](#post-apiv1workspacesworkspaceidfinancialordersidamendments)           |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/positions`](#get-apiv1workspacesworkspaceidfinancialpositions)                                  |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/price-observations`](#post-apiv1workspacesworkspaceidfinancialprice-observations)               |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/trade-legs`](#post-apiv1workspacesworkspaceidfinancialtrade-legs)                               |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/trades`](#get-apiv1workspacesworkspaceidfinancialtrades)                                        |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/trades`](#post-apiv1workspacesworkspaceidfinancialtrades)                                       |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/trades/{id}`](#get-apiv1workspacesworkspaceidfinancialtradesid)                                 |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/trades/{id}/archive`](#post-apiv1workspacesworkspaceidfinancialtradesidarchive)                 |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/trades/{id}/cancellations`](#post-apiv1workspacesworkspaceidfinancialtradesidcancellations)     |
| POST   | [`/api/v1/workspaces/{workspaceId}/financial/trades/{id}/closures`](#post-apiv1workspacesworkspaceidfinancialtradesidclosures)               |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/trades/{id}/legs`](#get-apiv1workspacesworkspaceidfinancialtradesidlegs)                        |
| GET    | [`/api/v1/workspaces/{workspaceId}/financial/valuation`](#get-apiv1workspacesworkspaceidfinancialvaluation)                                  |

## GET /api/v1/workspaces/{workspaceId}/financial/account-valuations

**Purpose:** Read financial / account-valuations within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name                | Location | Required | Type / structural validation                                                                   |
| ------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------- |
| `workspaceId`       | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `accountId`         | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `asOf`              | query    | No       | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `includeSuperseded` | query    | No       | `string`; enum: "true", "false"                                                                |
| `limit`             | query    | No       | `integer`; minimum: 1; maximum: 200                                                            |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/account-valuations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/account-valuations

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `AccountValuationObservationCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field     | Required | Type / structural validation                                                                   |
| -------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `accountId`    | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `currencyId`   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `amount`       | Yes      | `FinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `observedAt`   | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `definition`   | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `source`       | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `supersedesId` | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `reason`       | No       | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

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
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/account-valuations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: a9933d3b-cdcf-4f1d-8150-9faee66699c4
Content-Type: application/json

{
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "amount": "1",
  "observedAt": "2026-10-20T09:00:00.000000Z",
  "definition": "1",
  "source": "1"
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

## GET /api/v1/workspaces/{workspaceId}/financial/accounts

**Purpose:** Read financial / accounts within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `includeArchived` | query    | No       | `string`; enum: "true", "false"                                                           |
| `limit`           | query    | No       | `integer`; minimum: 1; maximum: 200                                                       |
| `afterId`         | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `search`          | query    | No       | `string`; minLength: 1; maxLength: 160                                                    |
| `environment`     | query    | No       | `string`; enum: "live", "paper"                                                           |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/accounts HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/accounts

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `AccountCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                   |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `name`            | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `brokerId`        | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `environment`     | Yes      | `string`; enum: "live", "paper"                                                                |
| `accountType`     | Yes      | `string`; enum: "cash", "margin", "other"                                                      |
| `baseCurrencyId`  | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `inventoryMethod` | Yes      | `string`; enum: "fifo", "specific", "average"                                                  |
| `allowShort`      | Yes      | `boolean`                                                                                      |
| `holdingMode`     | Yes      | `string`; enum: "netted", "segregated"                                                         |
| `effectiveAt`     | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                         |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `AccountResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/accounts HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: e0de98c0-3f74-4a98-86a1-49d6be4bb2d2
Content-Type: application/json

{
  "name": "Fictional example",
  "environment": "live",
  "accountType": "cash",
  "baseCurrencyId": "c782450f-2e97-4d8f-848a-cdf142da652f",
  "inventoryMethod": "fifo",
  "allowShort": false,
  "holdingMode": "netted",
  "effectiveAt": "2026-01-01T00:00:00.000000Z"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "name": "Fictional example",
  "brokerId": "b2928b57-2cef-4365-83fd-674212a922a7",
  "environment": "live",
  "accountType": "cash",
  "baseCurrencyId": "c782450f-2e97-4d8f-848a-cdf142da652f",
  "inventoryMethod": "fifo",
  "allowShort": false,
  "holdingMode": "netted",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "settingsId": "2d9c930e-0d11-4d69-8ab3-256ae62ddac5",
  "settingsVersion": 1,
  "status": "active"
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/accounts/{id}

**Purpose:** Read financial / accounts within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                                                                         |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `AccountResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/accounts/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "name": "Fictional example",
  "brokerId": "b2928b57-2cef-4365-83fd-674212a922a7",
  "environment": "live",
  "accountType": "cash",
  "baseCurrencyId": "c782450f-2e97-4d8f-848a-cdf142da652f",
  "inventoryMethod": "fifo",
  "allowShort": false,
  "holdingMode": "netted",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "settingsId": "2d9c930e-0d11-4d69-8ab3-256ae62ddac5",
  "settingsVersion": 1,
  "status": "active"
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/accounts/{id}/archive

**Purpose:** Submit accounts / archive within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `ArchiveFinancial`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                    |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`           | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CatalogArchiveResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/accounts/a5614527-0ce6-43be-8d1d-d012b7394867/archive HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 14592b4f-1638-493a-8778-771b6174acf7
Content-Type: application/json

{
  "expectedRevision": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z"
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/accounts/{id}/settings

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `AccountSettingsCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                    |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `baseCurrencyId`   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `inventoryMethod`  | Yes      | `string`; enum: "fifo", "specific", "average"                                                   |
| `allowShort`       | Yes      | `boolean`                                                                                       |
| `holdingMode`      | Yes      | `string`; enum: "netted", "segregated"                                                          |
| `effectiveAt`      | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)  |
| `expectedRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`           | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                         |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `AccountResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                   |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/accounts/a5614527-0ce6-43be-8d1d-d012b7394867/settings HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: ba68ff4f-c444-48b7-8f4c-4afcd8ef8531
Content-Type: application/json

{
  "baseCurrencyId": "c782450f-2e97-4d8f-848a-cdf142da652f",
  "inventoryMethod": "fifo",
  "allowShort": false,
  "holdingMode": "netted",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "expectedRevision": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "name": "Fictional example",
  "brokerId": "b2928b57-2cef-4365-83fd-674212a922a7",
  "environment": "live",
  "accountType": "cash",
  "baseCurrencyId": "c782450f-2e97-4d8f-848a-cdf142da652f",
  "inventoryMethod": "fifo",
  "allowShort": false,
  "holdingMode": "netted",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "settingsId": "2d9c930e-0d11-4d69-8ab3-256ae62ddac5",
  "settingsVersion": 1,
  "status": "active"
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/brokers

**Purpose:** Read financial / brokers within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `includeArchived` | query    | No       | `string`; enum: "true", "false"                                                           |
| `limit`           | query    | No       | `integer`; minimum: 1; maximum: 200                                                       |
| `afterId`         | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `search`          | query    | No       | `string`; minLength: 1; maxLength: 160                                                    |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/brokers HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/brokers

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `BrokerCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                 |
| ----------------- | -------- | -------------------------------------------------------------------------------------------- |
| `name`            | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `sourceNamespace` | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                        |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `BrokerResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/brokers HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 9c174567-ec54-40bc-8dd3-d48b67769b87
Content-Type: application/json

{
  "name": "Fictional example",
  "sourceNamespace": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "name": "Fictional example",
  "sourceNamespace": "Fictional example",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z"
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/brokers/{id}/archive

**Purpose:** Submit brokers / archive within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `ArchiveFinancial`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                    |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`           | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CatalogArchiveResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/brokers/a5614527-0ce6-43be-8d1d-d012b7394867/archive HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: b6ff139a-e2cf-4ac3-8c62-e86a9bcea65c
Content-Type: application/json

{
  "expectedRevision": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z"
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/bucket-movements

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `BucketMovementCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                           |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `economicAt`          | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |
| `orderingKey`         | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `sourceBucketId`      | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `destinationBucketId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `amount`              | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `kind`                | Yes      | `string`; enum: "settlement", "reclassification", "internal-transfer"                                  |
| `executionId`         | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

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
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/bucket-movements HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 3e7c6fd7-12bc-4243-8071-6e2baf1d6514
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "sourceBucketId": "d2e828f3-d243-4407-8fd6-724e82954507",
  "destinationBucketId": "a1cc6c3a-b364-4094-8ecb-aff75e25fc00",
  "amount": "1",
  "kind": "settlement"
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

## GET /api/v1/workspaces/{workspaceId}/financial/campaign-inventory

**Purpose:** Read financial / campaign-inventory within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name           | Location | Required | Type / structural validation                                                              |
| -------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`    | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `instrumentId` | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `tradeId`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                   |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CampaignInventoryResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/campaign-inventory HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "sourceRevision": "1",
  "populations": [],
  "bridges": []
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/cash-balances

**Purpose:** Read financial / cash-balances within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name             | Location | Required | Type / structural validation                                                                          |
| ---------------- | -------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `workspaceId`    | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `accountId`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `asOf`           | query    | No       | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `sourceRevision` | query    | No       | `FinancialSourceRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/cash-balances HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/cash-buckets

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `CashBucketCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field   | Required | Type / structural validation                                                                 |
| ------------ | -------- | -------------------------------------------------------------------------------------------- |
| `accountId`  | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `currencyId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `kind`       | Yes      | `string`; enum: "settled", "unsettled", "restricted", "collateral_cash"                      |
| `custodyKey` | No       | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                            |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CashBucketResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/cash-buckets HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 807dadfe-fe2e-4ebb-82af-6db730d6ffd7
Content-Type: application/json

{
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "kind": "settled"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "commandId": "00ac187e-bb1e-48c7-8451-9ff5c4a32086",
  "sourceRevision": "1",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "kind": "settled"
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/cash-movements

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `CashMovementCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field       | Required | Type / structural validation                                                                          |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `economicAt`     | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `orderingKey`    | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `accountId`      | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `cashBucketId`   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `currencyId`     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `amount`         | Yes      | `FinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `kind`           | Yes      | `string`; enum: "deposit", "withdrawal", "opening", "income", "unresolved"                            |
| `sourceIdentity` | No       | `FinancialSourceIdentity`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

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
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/cash-movements HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 6df8e8e8-f359-45df-81c0-eb232566a641
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "cashBucketId": "66c9fbfc-a672-4154-8f81-37fba5853601",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "amount": "1",
  "kind": "deposit"
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

## GET /api/v1/workspaces/{workspaceId}/financial/currencies

**Purpose:** Read financial / currencies within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `includeArchived` | query    | No       | `string`; enum: "true", "false"                                                           |
| `limit`           | query    | No       | `integer`; minimum: 1; maximum: 200                                                       |
| `afterId`         | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `search`          | query    | No       | `string`; minLength: 1; maxLength: 160                                                    |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/currencies HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/currencies

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `CurrencyCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                           |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `namespace`           | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)           |
| `code`                | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)           |
| `kind`                | Yes      | `string`; enum: "fiat", "digital", "custom"                                                            |
| `unitIdentity`        | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)           |
| `name`                | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)           |
| `displayScale`        | Yes      | `integer`; minimum: 0; maximum: 36                                                                     |
| `settlementIncrement` | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `effectiveAt`         | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                          |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CurrencyResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/currencies HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 84717e8e-c9d4-44de-8b20-6dc5a4e31a0b
Content-Type: application/json

{
  "namespace": "Fictional example",
  "code": "1",
  "kind": "fiat",
  "unitIdentity": "1",
  "name": "Fictional example",
  "displayScale": 0,
  "settlementIncrement": "1",
  "effectiveAt": "2026-01-01T00:00:00.000000Z"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "namespace": "Fictional example",
  "code": "1",
  "kind": "fiat",
  "unitIdentity": "1",
  "name": "Fictional example",
  "displayScale": 0,
  "settlementIncrement": "1",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "conventionId": "42b3b6cd-c439-45dc-8faf-795c335e5e03",
  "version": 1
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/currencies/{id}

**Purpose:** Read financial / currencies within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                                                                          |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CurrencyResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/currencies/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "namespace": "Fictional example",
  "code": "1",
  "kind": "fiat",
  "unitIdentity": "1",
  "name": "Fictional example",
  "displayScale": 0,
  "settlementIncrement": "1",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "conventionId": "42b3b6cd-c439-45dc-8faf-795c335e5e03",
  "version": 1
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/currencies/{id}/archive

**Purpose:** Submit currencies / archive within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `ArchiveFinancial`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                    |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`           | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CatalogArchiveResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/currencies/a5614527-0ce6-43be-8d1d-d012b7394867/archive HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 59553fb9-62d4-4aa3-8d51-831d7ed89bb3
Content-Type: application/json

{
  "expectedRevision": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z"
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/currencies/{id}/conventions

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `CurrencyConventionCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                           |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `displayScale`        | Yes      | `integer`; minimum: 0; maximum: 36                                                                     |
| `settlementIncrement` | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `effectiveAt`         | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |
| `expectedRevision`    | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `reason`              | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)           |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                          |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CurrencyResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/currencies/a5614527-0ce6-43be-8d1d-d012b7394867/conventions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 09075a30-1363-43ec-8a6f-34678d4df69d
Content-Type: application/json

{
  "displayScale": 0,
  "settlementIncrement": "1",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "expectedRevision": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "namespace": "Fictional example",
  "code": "1",
  "kind": "fiat",
  "unitIdentity": "1",
  "name": "Fictional example",
  "displayScale": 0,
  "settlementIncrement": "1",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "conventionId": "42b3b6cd-c439-45dc-8faf-795c335e5e03",
  "version": 1
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/execution-allocations

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ExecutionAllocation`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                    |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `executionId`     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `reason`          | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `expectedVersion` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `allocations`     | Yes      | `array`; maxItems: 1000                                                                         |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AllocationMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/execution-allocations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 6ccb5a7a-5a53-462a-8ff3-f6cb0a51b74e
Content-Type: application/json

{
  "executionId": "0f8d90c9-a139-457a-8f0a-dffc972a3f17",
  "reason": "Fictional example",
  "expectedVersion": 1,
  "allocations": []
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "commandId": "00ac187e-bb1e-48c7-8451-9ff5c4a32086",
  "sourceRevision": "1",
  "version": 1
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/execution-corrections

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ExecutionCorrection`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field               | Required | Type / structural validation                                                                  |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------- |
| `originalExecutionId`    | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `reason`                 | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)  |
| `replacement`            | Yes      | `ExecutionCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `replacementAllocations` | No       | `array`; maxItems: 1000                                                                       |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                           |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `ExecutionResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/execution-corrections HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: f6e45df0-338a-4260-8ca2-1bb025ffaee1
Content-Type: application/json

{
  "originalExecutionId": "9aa5ed11-c7fc-4713-8a9a-ddbebce50069",
  "reason": "Fictional example",
  "replacement": {
    "economicAt": "2026-10-20T09:00:00.000000Z",
    "orderingKey": "1",
    "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
    "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
    "side": "buy",
    "quantity": "1",
    "price": "1"
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "commandId": "00ac187e-bb1e-48c7-8451-9ff5c4a32086",
  "sourceRevision": "1",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
  "side": "buy",
  "quantity": "1",
  "price": "1",
  "bookedPrincipal": "1",
  "principalCurrencyId": "f414901b-ba6d-469d-8e91-e21636fd93a9",
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "supersedesId": "18beb209-19f7-4429-8af0-b175d77eb694",
  "payload": {
    "economicAt": "2026-10-20T09:00:00.000000Z",
    "orderingKey": "1",
    "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
    "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
    "side": "buy",
    "quantity": "1",
    "price": "1",
    "sourceInput": {
      "economicAt": "2026-10-20T09:00:00.000000Z",
      "orderingKey": "1",
      "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
      "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
      "side": "buy",
      "quantity": "1",
      "price": "1"
    }
  }
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/executions

**Purpose:** Read financial / executions within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name                | Location | Required | Type / structural validation                                                              |
| ------------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`       | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`         | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `afterId`           | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `includeSuperseded` | query    | No       | `string`; enum: "true", "false"                                                           |
| `limit`             | query    | No       | `integer`; minimum: 1; maximum: 200                                                       |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/executions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/executions

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ExecutionCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                           |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `economicAt`          | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |
| `orderingKey`         | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `accountId`           | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `instrumentVersionId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `orderLegId`          | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `side`                | Yes      | `string`; enum: "buy", "sell"                                                                          |
| `quantity`            | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `price`               | Yes      | `FinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |
| `bookedPrincipal`     | No       | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `principalCurrencyId` | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `cashBucketId`        | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `sourceIdentity`      | No       | `FinancialSourceIdentity`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)  |
| `fees`                | No       | `array`; maxItems: 64                                                                                  |
| `closeOnly`           | No       | `boolean`                                                                                              |
| `costsComplete`       | No       | `boolean`                                                                                              |
| `specificLots`        | No       | `array`; maxItems: 1000                                                                                |
| `basisReportingFx`    | No       | `FinancialPinnedRate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `principalReview`     | No       | `object`                                                                                               |
| `manualCashEffects`   | No       | `array`; maxItems: 64                                                                                  |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                           |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `ExecutionResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/executions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 4b3834ab-0980-4080-84b2-ac858529dad6
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
  "side": "buy",
  "quantity": "1",
  "price": "1"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "commandId": "00ac187e-bb1e-48c7-8451-9ff5c4a32086",
  "sourceRevision": "1",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
  "side": "buy",
  "quantity": "1",
  "price": "1",
  "bookedPrincipal": "1",
  "principalCurrencyId": "f414901b-ba6d-469d-8e91-e21636fd93a9",
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "supersedesId": "18beb209-19f7-4429-8af0-b175d77eb694",
  "payload": {
    "economicAt": "2026-10-20T09:00:00.000000Z",
    "orderingKey": "1",
    "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
    "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
    "side": "buy",
    "quantity": "1",
    "price": "1",
    "sourceInput": {
      "economicAt": "2026-10-20T09:00:00.000000Z",
      "orderingKey": "1",
      "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
      "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
      "side": "buy",
      "quantity": "1",
      "price": "1"
    }
  }
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/executions/{id}/allocations

**Purpose:** Read executions / allocations within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                                                                                     |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `ExecutionAllocationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/executions/a5614527-0ce6-43be-8d1d-d012b7394867/allocations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "executionId": "0f8d90c9-a139-457a-8f0a-dffc972a3f17",
  "version": 1,
  "allocations": []
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/fee-attributions

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `FeeAttributionCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                       |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `economicAt`          | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `orderingKey`         | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `feeId`               | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `instrumentVersionId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `reason`              | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `expectedVersion`     | Yes      | `integer`; minimum: 0                                                                              |
| `allocations`         | Yes      | `array`; minItems: 1; maxItems: 1000                                                               |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AllocationMutationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/fee-attributions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 8bbdecf8-1c06-459e-899d-a586f33b28df
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "feeId": "eac7b9b8-4943-41d9-80f7-3f4cff1286ef",
  "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
  "reason": "Fictional example",
  "expectedVersion": 0,
  "allocations": [
    {
      "target": "lot",
      "amount": "1"
    }
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
  "version": 1
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/fees

**Purpose:** Read financial / fees within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`   | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/fees HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/fees

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `FeeCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field     | Required | Type / structural validation                                                                       |
| -------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `cashBucketId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `currencyId`   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `amount`       | Yes      | `FinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `kind`         | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `economicAt`   | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `nativeFx`     | No       | `FinancialPinnedRate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)  |
| `reportingFx`  | No       | `FinancialPinnedRate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)  |
| `orderingKey`  | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`    | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `executionId`  | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

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
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/fees HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: f7a79afa-e29c-4554-8311-f6cfe0f49193
Content-Type: application/json

{
  "cashBucketId": "66c9fbfc-a672-4154-8f81-37fba5853601",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "amount": "1",
  "kind": "1",
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221"
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

## POST /api/v1/workspaces/{workspaceId}/financial/fx-conversions

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `FxConversionCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                           |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `economicAt`          | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |
| `orderingKey`         | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `sourceBucketId`      | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `destinationBucketId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `sourceAmount`        | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `destinationAmount`   | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `rate`                | No       | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `rateReview`          | No       | `object`                                                                                               |
| `fees`                | No       | `array`; maxItems: 64                                                                                  |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                              |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `FxConversionResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/fx-conversions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 7b86d78f-97de-4262-86f3-dc2cbcf9dc43
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "sourceBucketId": "d2e828f3-d243-4407-8fd6-724e82954507",
  "destinationBucketId": "a1cc6c3a-b364-4094-8ecb-aff75e25fc00",
  "sourceAmount": "1",
  "destinationAmount": "1"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "commandId": "00ac187e-bb1e-48c7-8451-9ff5c4a32086",
  "sourceRevision": "1",
  "actualRate": "1"
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/fx-observations

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `FxObservationCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                           |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `baseCurrencyId`  | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `quoteCurrencyId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `rate`            | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `observedAt`      | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |
| `source`          | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)           |
| `supersedesId`    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `reason`          | No       | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)           |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

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
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/fx-observations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: e139684a-8303-468e-8f4b-517d4463d91f
Content-Type: application/json

{
  "baseCurrencyId": "c782450f-2e97-4d8f-848a-cdf142da652f",
  "quoteCurrencyId": "1ddbe5ea-6a8e-4e76-8df5-54f06c041443",
  "rate": "1",
  "observedAt": "2026-10-20T09:00:00.000000Z",
  "source": "1"
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

## POST /api/v1/workspaces/{workspaceId}/financial/holding-transfers

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `HoldingTransferCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field             | Required | Type / structural validation                                                                       |
| ---------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `economicAt`           | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `orderingKey`          | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `sourceAccountId`      | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `destinationAccountId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `instrumentVersionId`  | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `reason`               | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `selections`           | Yes      | `array`; minItems: 1; maxItems: 1000                                                               |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

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
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/holding-transfers HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: a7bcd7c1-9251-45b4-8399-467a411c327d
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "sourceAccountId": "b51c8abe-514f-4e4c-8a45-ca1a434f6ef5",
  "destinationAccountId": "b799d607-fb30-4da8-847b-58695893d658",
  "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
  "reason": "Fictional example",
  "selections": [
    {
      "lotId": "e4ad6c0d-5f64-424e-88e7-457b60e90bb2",
      "quantity": "1"
    }
  ]
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

## GET /api/v1/workspaces/{workspaceId}/financial/instrument-versions/{id}

**Purpose:** Read financial / instrument-versions within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                                                                            |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `InstrumentResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/instrument-versions/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "name": "Fictional ordinary share",
  "family": "stock",
  "subtype": "ordinary-share",
  "economicIdentity": "docs:fictional-ordinary-share",
  "quantityUnit": "share",
  "quoteCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "settlementCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "multiplier": "1",
  "quantityIncrement": "1",
  "priceIncrement": "0.01",
  "capability": "native-linear",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "metadata": {
    "priceConvention": "unit-price",
    "settlementStyle": "delivered"
  },
  "id": "44444444-4444-4444-8444-444444444444",
  "revision": 1,
  "archivedAt": null,
  "versionId": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "version": 1
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/instruments

**Purpose:** Read financial / instruments within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `includeArchived` | query    | No       | `string`; enum: "true", "false"                                                           |
| `limit`           | query    | No       | `integer`; minimum: 1; maximum: 200                                                       |
| `afterId`         | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `search`          | query    | No       | `string`; minLength: 1; maxLength: 160                                                    |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/instruments HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/instruments

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `InstrumentCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field             | Required | Type / structural validation                                                                   |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `name`                 | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `family`               | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `subtype`              | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `economicIdentity`     | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `quantityUnit`         | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `quoteCurrencyId`      | Yes      | `anyOf`                                                                                        |
| `settlementCurrencyId` | Yes      | `anyOf`                                                                                        |
| `multiplier`           | Yes      | `anyOf`                                                                                        |
| `quantityIncrement`    | Yes      | `anyOf`                                                                                        |
| `priceIncrement`       | Yes      | `anyOf`                                                                                        |
| `capability`           | Yes      | `string`; enum: "native-linear", "manual"                                                      |
| `effectiveAt`          | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `metadata`             | No       | `object`                                                                                       |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                            |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `InstrumentResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/instruments HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 33903b11-9696-44a8-8851-3818be1ff26c
Content-Type: application/json

{
  "name": "Fictional ordinary share",
  "family": "stock",
  "subtype": "ordinary-share",
  "economicIdentity": "docs:fictional-ordinary-share",
  "quantityUnit": "share",
  "quoteCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "settlementCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "multiplier": "1",
  "quantityIncrement": "1",
  "priceIncrement": "0.01",
  "capability": "native-linear",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "metadata": {
    "priceConvention": "unit-price",
    "settlementStyle": "delivered"
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "name": "Fictional ordinary share",
  "family": "stock",
  "subtype": "ordinary-share",
  "economicIdentity": "docs:fictional-ordinary-share",
  "quantityUnit": "share",
  "quoteCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "settlementCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "multiplier": "1",
  "quantityIncrement": "1",
  "priceIncrement": "0.01",
  "capability": "native-linear",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "metadata": {
    "priceConvention": "unit-price",
    "settlementStyle": "delivered"
  },
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": null,
  "versionId": "33333333-3333-4333-8333-333333333333",
  "version": 1
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/instruments/{id}

**Purpose:** Read financial / instruments within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                                                                            |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `InstrumentResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/instruments/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "name": "Fictional ordinary share",
  "family": "stock",
  "subtype": "ordinary-share",
  "economicIdentity": "docs:fictional-ordinary-share",
  "quantityUnit": "share",
  "quoteCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "settlementCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "multiplier": "1",
  "quantityIncrement": "1",
  "priceIncrement": "0.01",
  "capability": "native-linear",
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "metadata": {
    "priceConvention": "unit-price",
    "settlementStyle": "delivered"
  },
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": null,
  "versionId": "33333333-3333-4333-8333-333333333333",
  "version": 1
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/instruments/{id}/archive

**Purpose:** Submit instruments / archive within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `ArchiveFinancial`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                    |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`           | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CatalogArchiveResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/instruments/a5614527-0ce6-43be-8d1d-d012b7394867/archive HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: f526c77d-0c51-4d0e-8bad-0670ed57f480
Content-Type: application/json

{
  "expectedRevision": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z"
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/instruments/{id}/versions

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `InstrumentVersionCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field             | Required | Type / structural validation                                                                    |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `quantityUnit`         | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `quoteCurrencyId`      | Yes      | `anyOf`                                                                                         |
| `settlementCurrencyId` | Yes      | `anyOf`                                                                                         |
| `multiplier`           | Yes      | `anyOf`                                                                                         |
| `quantityIncrement`    | Yes      | `anyOf`                                                                                         |
| `priceIncrement`       | Yes      | `anyOf`                                                                                         |
| `capability`           | Yes      | `string`; enum: "native-linear", "manual"                                                       |
| `effectiveAt`          | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)  |
| `metadata`             | No       | `object`                                                                                        |
| `expectedRevision`     | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`               | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                            |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `InstrumentResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/instruments/a5614527-0ce6-43be-8d1d-d012b7394867/versions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: a7c40b1d-babc-435a-87e8-8675a2b05ca1
Content-Type: application/json

{
  "quantityUnit": "share",
  "quoteCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "settlementCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "multiplier": "1",
  "quantityIncrement": "1",
  "priceIncrement": "0.01",
  "capability": "native-linear",
  "effectiveAt": "2026-10-20T09:00:00.000000Z",
  "expectedRevision": 1,
  "reason": "Retain reviewed fictional convention version",
  "metadata": {
    "priceConvention": "unit-price",
    "settlementStyle": "delivered"
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "name": "Fictional ordinary share",
  "family": "stock",
  "subtype": "ordinary-share",
  "economicIdentity": "docs:fictional-ordinary-share",
  "quantityUnit": "share",
  "quoteCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "settlementCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "multiplier": "1",
  "quantityIncrement": "1",
  "priceIncrement": "0.01",
  "capability": "native-linear",
  "effectiveAt": "2026-10-20T09:00:00.000000Z",
  "metadata": {
    "priceConvention": "unit-price",
    "settlementStyle": "delivered"
  },
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 2,
  "archivedAt": null,
  "versionId": "55555555-5555-4555-8555-555555555555",
  "version": 2
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/opening-lots

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `OpeningLotCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                           |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `economicAt`          | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |
| `orderingKey`         | Yes      | `FinancialOrderingKey`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `accountId`           | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `instrumentVersionId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `direction`           | Yes      | `string`; enum: "long", "short"                                                                        |
| `quantity`            | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `entryPrice`          | No       | `FinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |
| `bookedPrincipal`     | No       | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`              | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)           |
| `costsComplete`       | No       | `boolean`                                                                                              |
| `basisReportingFx`    | No       | `FinancialPinnedRate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

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
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/opening-lots HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: db6bc829-9ffb-4dbd-8bd9-c532323a7305
Content-Type: application/json

{
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "orderingKey": "1",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
  "direction": "long",
  "quantity": "1",
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

## GET /api/v1/workspaces/{workspaceId}/financial/orders

**Purpose:** Read financial / orders within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `includeArchived` | query    | No       | `string`; enum: "true", "false"                                                           |
| `limit`           | query    | No       | `integer`; minimum: 1; maximum: 200                                                       |
| `afterId`         | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `search`          | query    | No       | `string`; minLength: 1; maxLength: 160                                                    |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/orders HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/orders

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `OrderCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                   |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `accountId`       | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `kind`            | Yes      | `string`; enum: "single", "package"                                                            |
| `sourceNamespace` | No       | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `sourceId`        | No       | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `legs`            | Yes      | `array`; minItems: 1; maxItems: 32                                                             |
| `instruction`     | Yes      | `OrderInstruction`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `economicAt`      | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `OrderResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/orders HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: d0a77ee5-a063-4083-8769-ba0e672cc83c
Content-Type: application/json

{
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "kind": "single",
  "legs": [
    {
      "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
      "side": "buy",
      "ratio": "1"
    }
  ],
  "instruction": {
    "status": "recorded",
    "quantity": "1",
    "orderType": "market",
    "timeInForce": "1"
  },
  "economicAt": "2026-10-20T09:00:00.000000Z"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "kind": "single",
  "instruction": {
    "status": "recorded",
    "quantity": "1",
    "orderType": "market",
    "timeInForce": "1"
  },
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "sourceNamespace": "Fictional example",
  "sourceId": "92340ce0-9843-48dc-8014-d7c21c191b23",
  "fillStatus": "unfilled",
  "discrepancies": [],
  "legs": []
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/orders/{id}

**Purpose:** Read financial / orders within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `OrderResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/orders/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "kind": "single",
  "instruction": {
    "status": "recorded",
    "quantity": "1",
    "orderType": "market",
    "timeInForce": "1"
  },
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "sourceNamespace": "Fictional example",
  "sourceId": "92340ce0-9843-48dc-8014-d7c21c191b23",
  "fillStatus": "unfilled",
  "discrepancies": [],
  "legs": []
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/orders/{id}/amendments

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `OrderAmend`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                    |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `instruction`      | Yes      | `OrderInstruction`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)  |
| `economicAt`       | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)  |
| `reason`           | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `OrderResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                 |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/orders/a5614527-0ce6-43be-8d1d-d012b7394867/amendments HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: c55c7d5d-df9c-450a-8d2d-d54ce63d3445
Content-Type: application/json

{
  "expectedRevision": 1,
  "instruction": {
    "status": "recorded",
    "quantity": "1",
    "orderType": "market",
    "timeInForce": "1"
  },
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "kind": "single",
  "instruction": {
    "status": "recorded",
    "quantity": "1",
    "orderType": "market",
    "timeInForce": "1"
  },
  "economicAt": "2026-10-20T09:00:00.000000Z",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "sourceNamespace": "Fictional example",
  "sourceId": "92340ce0-9843-48dc-8014-d7c21c191b23",
  "fillStatus": "unfilled",
  "discrepancies": [],
  "legs": []
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/positions

**Purpose:** Read financial / positions within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name           | Location | Required | Type / structural validation                                                              |
| -------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`    | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `instrumentId` | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/positions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/price-observations

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `PriceObservationCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                   |
| --------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `instrumentVersionId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `currencyId`          | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `price`               | Yes      | `FinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `observedAt`          | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `source`              | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `supersedesId`        | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `reason`              | No       | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

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
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/price-observations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 90aa2328-f651-4723-880a-d0dcc6053866
Content-Type: application/json

{
  "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "price": "1",
  "observedAt": "2026-10-20T09:00:00.000000Z",
  "source": "1"
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

## POST /api/v1/workspaces/{workspaceId}/financial/trade-legs

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `TradeLegCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                    |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `tradeId`             | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `expectedRevision`    | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`           | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `instrumentVersionId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `direction`           | Yes      | `string`; enum: "long", "short"                                                                 |
| `label`               | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                          |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `TradeLegResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/trade-legs HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: bdc7a40e-7632-4553-86f3-529e7a3844d1
Content-Type: application/json

{
  "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
  "expectedRevision": 1,
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
  "direction": "long",
  "label": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
  "direction": "long",
  "label": "Fictional example",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867"
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/trades

**Purpose:** Read financial / trades within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `includeArchived` | query    | No       | `string`; enum: "true", "false"                                                           |
| `limit`           | query    | No       | `integer`; minimum: 1; maximum: 200                                                       |
| `afterId`         | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `search`          | query    | No       | `string`; minLength: 1; maxLength: 160                                                    |
| `unclassified`    | query    | No       | `string`; enum: "true", "false"                                                           |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/trades HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/financial/trades

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `TradeCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field          | Required | Type / structural validation                                                                 |
| ------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `title`             | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `classification`    | Yes      | `string`; enum: "active-trading", "investing"                                                |
| `strategyVersionId` | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                   |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyTradeLinkResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/trades HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 36c2e5e2-22f1-4bb6-8d85-1bed978d96d5
Content-Type: application/json

{
  "title": "Fictional example",
  "classification": "active-trading"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "title": "Fictional example",
  "classification": "active-trading",
  "strategyVersionId": "a739987e-7a15-4a56-8284-bf5c7b95d22f",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "strategyId": "00e4973c-52ce-4fb7-8df2-f685a3763600",
  "strategyLinkTiming": "recorded-with-trade",
  "status": "planned",
  "closureReviewRequired": false
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/trades/{id}

**Purpose:** Read financial / trades within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                                                                                   |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyTradeLinkResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/trades/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "title": "Fictional example",
  "classification": "active-trading",
  "strategyVersionId": "a739987e-7a15-4a56-8284-bf5c7b95d22f",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "strategyId": "00e4973c-52ce-4fb7-8df2-f685a3763600",
  "strategyLinkTiming": "recorded-with-trade",
  "status": "planned",
  "closureReviewRequired": false
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/trades/{id}/archive

**Purpose:** Submit trades / archive within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `ArchiveFinancial`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                    |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`           | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `CatalogArchiveResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/trades/a5614527-0ce6-43be-8d1d-d012b7394867/archive HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 2c1170ae-c2fd-4c9a-825d-3c4175e3bae5
Content-Type: application/json

{
  "expectedRevision": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z"
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/trades/{id}/cancellations

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `ArchiveFinancial`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                    |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`           | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                   |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyTradeLinkResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/trades/a5614527-0ce6-43be-8d1d-d012b7394867/cancellations HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: c9bb6915-54d1-4b7e-8516-65ee0bc4361e
Content-Type: application/json

{
  "expectedRevision": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "title": "Fictional example",
  "classification": "active-trading",
  "strategyVersionId": "a739987e-7a15-4a56-8284-bf5c7b95d22f",
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "strategyId": "00e4973c-52ce-4fb7-8df2-f685a3763600",
  "strategyLinkTiming": "recorded-with-trade",
  "status": "planned",
  "closureReviewRequired": false
}
```

## POST /api/v1/workspaces/{workspaceId}/financial/trades/{id}/closures

**Purpose:** Editor/owner financial command. A repeated Idempotency-Key with identical contents returns the committed result; changed contents conflict. Financial scalars are decimal strings.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

**Request body:** Required; `application/json`. `TradeClosureCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field           | Required | Type / structural validation                                                                    |
| -------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `expectedRevision`   | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`             | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `obligationEvidence` | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                              |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `TradeClosureResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                        |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/trades/a5614527-0ce6-43be-8d1d-d012b7394867/closures HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: b059ffe7-c3e5-458c-8878-11344f406e74
Content-Type: application/json

{
  "expectedRevision": 1,
  "reason": "Fictional example",
  "obligationEvidence": "1"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
  "sourceRevision": "1",
  "revision": 1,
  "confirmedAt": "2026-10-20T09:00:00.000000Z",
  "definitionVersion": "campaign-closure/1",
  "status": "closed"
}
```

## GET /api/v1/workspaces/{workspaceId}/financial/trades/{id}/legs

**Purpose:** Read trades / legs within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 200         | `application/json`         | `array`; Validated application DTO                                     |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/trades/a5614527-0ce6-43be-8d1d-d012b7394867/legs HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## GET /api/v1/workspaces/{workspaceId}/financial/valuation

**Purpose:** Read financial / valuation within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/financial/api.ts); [validation schemas](../../../packages/contracts/src/financial.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name                      | Location | Required | Type / structural validation                                                                   |
| ------------------------- | -------- | -------- | ---------------------------------------------------------------------------------------------- |
| `workspaceId`             | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `suppliedPositionIds`     | query    | No       | `string`                                                                                       |
| `accountIds`              | query    | Yes      | `string`                                                                                       |
| `reportingCurrencyId`     | query    | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `asOf`                    | query    | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `fxPolicyId`              | query    | Yes      | `FinancialLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `fxMaxAgeMilliseconds`    | query    | No       | `integer or null`; minimum: 0; maximum: 9007199254740991                                       |
| `fxSourcePriority`        | query    | Yes      | `string`                                                                                       |
| `priceMaxAgeMilliseconds` | query    | No       | `integer or null`; minimum: 0; maximum: 9007199254740991                                       |
| `priceSourcePriority`     | query    | Yes      | `string`                                                                                       |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `FinancialValuationResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                              |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/financial/valuation?accountIds=1&reportingCurrencyId=cf2fbc4b-be8f-4ac3-8819-186cf25a6142&asOf=2026-10-20T09%3A00%3A00.000000Z&fxPolicyId=6f058e4a-6158-4e4b-8456-c8327d22bc09&fxSourcePriority=1&priceSourcePriority=1 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "accountIds": [],
  "environment": "live",
  "reportingCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "asOf": "2026-10-20T09:00:00.000000Z",
  "sourceRevision": "1",
  "fxPolicy": {
    "id": "1",
    "maxAgeMilliseconds": 0,
    "sourcePriority": ["1"]
  },
  "pricePolicy": {
    "maxAgeMilliseconds": 0,
    "sourcePriority": ["1"]
  },
  "positions": [],
  "nav": {
    "asOf": "2026-10-20T09:00:00.000000Z",
    "sourceRevision": "1",
    "manifest": {
      "kernel": "1",
      "ordinaryLinear": "1",
      "lotMatching": "1",
      "allocation": "1",
      "fxSelection": "1",
      "precision": "1",
      "schema": "1"
    },
    "state": "available",
    "value": {
      "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
      "amount": "1"
    },
    "components": [],
    "roundingResidual": "1"
  },
  "priceDependencies": [],
  "fxDependencies": []
}
```
