# Risk policies and sizing API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| POST   | [`/api/v1/workspaces/{workspaceId}/risk/assessments`](#post-apiv1workspacesworkspaceidriskassessments)       |
| GET    | [`/api/v1/workspaces/{workspaceId}/risk/assessments/{id}`](#get-apiv1workspacesworkspaceidriskassessmentsid) |
| GET    | [`/api/v1/workspaces/{workspaceId}/risk/catalog`](#get-apiv1workspacesworkspaceidriskcatalog)                |
| GET    | [`/api/v1/workspaces/{workspaceId}/risk/policies`](#get-apiv1workspacesworkspaceidriskpolicies)              |
| POST   | [`/api/v1/workspaces/{workspaceId}/risk/policies`](#post-apiv1workspacesworkspaceidriskpolicies)             |
| POST   | [`/api/v1/workspaces/{workspaceId}/risk/sizing`](#post-apiv1workspacesworkspaceidrisksizing)                 |

## POST /api/v1/workspaces/{workspaceId}/risk/assessments

**Purpose:** Submit risk / assessments within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/risk/api.ts); [validation schemas](../../../packages/contracts/src/risk.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `RiskAssessmentRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field          | Required | Type / structural validation                                                                   |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `accountId`         | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `strategyVersionId` | Yes      | `anyOf`                                                                                        |
| `asOf`              | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `proposal`          | Yes      | `RiskProposal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |

**Validation:** JSON transport ceiling 16384 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `RiskAssessmentResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/risk/assessments HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 4deaa415-be35-4f75-8623-e96a462d5a64
Content-Type: application/json

{
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "strategyVersionId": "a739987e-7a15-4a56-8284-bf5c7b95d22f",
  "asOf": "2026-10-20T09:00:00.000000Z",
  "proposal": {
    "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
    "side": "long",
    "quantity": "1",
    "riskAmount": "1",
    "riskCurrencyId": "f5ee0dc2-3130-4f53-8663-81f48a5aa4d6",
    "riskMethod": "1",
    "entry": "1",
    "intendedExitAt": "2026-10-21T13:00:00.000000Z"
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "strategyVersionId": "a739987e-7a15-4a56-8284-bf5c7b95d22f",
  "asOf": "2026-10-20T09:00:00.000000Z",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
  "sourceRevision": "1",
  "definitionVersion": "risk-assessment/1",
  "state": "passed",
  "policies": [],
  "results": [],
  "proposal": {
    "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
    "side": "long",
    "quantity": "1",
    "riskAmount": "1",
    "riskCurrencyId": "f5ee0dc2-3130-4f53-8663-81f48a5aa4d6",
    "riskMethod": "1",
    "entry": "1",
    "intendedExitAt": "2026-10-21T13:00:00.000000Z"
  }
}
```

## GET /api/v1/workspaces/{workspaceId}/risk/assessments/{id}

**Purpose:** Read risk / assessments within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/risk/api.ts); [validation schemas](../../../packages/contracts/src/risk.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `RiskAssessmentResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                          |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/risk/assessments/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "strategyVersionId": "a739987e-7a15-4a56-8284-bf5c7b95d22f",
  "asOf": "2026-10-20T09:00:00.000000Z",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
  "sourceRevision": "1",
  "definitionVersion": "risk-assessment/1",
  "state": "passed",
  "policies": [],
  "results": [],
  "proposal": {
    "instrumentVersionId": "7b4c1f23-e668-4497-8761-839930b8c259",
    "side": "long",
    "quantity": "1",
    "riskAmount": "1",
    "riskCurrencyId": "f5ee0dc2-3130-4f53-8663-81f48a5aa4d6",
    "riskMethod": "1",
    "entry": "1",
    "intendedExitAt": "2026-10-21T13:00:00.000000Z"
  }
}
```

## GET /api/v1/workspaces/{workspaceId}/risk/catalog

**Purpose:** Read risk / catalog within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/risk/api.ts); [validation schemas](../../../packages/contracts/src/risk.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                                                  |
| ------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)                     |
| `collection`  | query    | Yes      | `string`; enum: "accounts", "strategies", "instruments", "currencies", "strategy-versions", "fx-observations" |
| `after`       | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)                     |
| `search`      | query    | No       | `string`; maxLength: 160                                                                                      |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `RiskCatalogResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/risk/catalog?collection=accounts HTTP/1.1
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

## GET /api/v1/workspaces/{workspaceId}/risk/policies

**Purpose:** Read risk / policies within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/risk/api.ts); [validation schemas](../../../packages/contracts/src/risk.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `after`       | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `accountId`   | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `strategyId`  | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                        |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `RiskPolicyList`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                  |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/risk/policies HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "versions": [],
  "nextCursor": null
}
```

## POST /api/v1/workspaces/{workspaceId}/risk/policies

**Purpose:** Submit risk / policies within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/risk/api.ts); [validation schemas](../../../packages/contracts/src/risk.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `RiskPolicyWrite`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                   |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `policyId`        | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `expectedVersion` | Yes      | `integer`; minimum: 0; maximum: 2147483646                                                     |
| `accountId`       | Yes      | `anyOf`                                                                                        |
| `strategyId`      | Yes      | `anyOf`                                                                                        |
| `effectiveAt`     | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`          | Yes      | `string`; minLength: 1; maxLength: 2000                                                        |
| `definition`      | Yes      | `RiskDefinition`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |

**Validation:** JSON transport ceiling 131072 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                           |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `RiskPolicyVersion`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/risk/policies HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: ca981b5d-f025-4934-836c-e11d7f33746a
Content-Type: application/json

{
  "expectedVersion": 0,
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "strategyId": null,
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "reason": "Fictional example",
  "definition": {
    "name": "Fictional example",
    "limits": [],
    "maxAgeMilliseconds": 0,
    "priceSources": [
      "1"
    ],
    "fxSources": [
      "1"
    ]
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "policyId": "473914bc-cdab-40ce-86d4-1e34d5720e57",
  "workspaceId": "09707fa5-aaae-4493-8a23-827111000f89",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "strategyId": "00e4973c-52ce-4fb7-8df2-f685a3763600",
  "version": 1,
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
  "reason": "Fictional example",
  "definition": {
    "name": "Fictional example",
    "limits": [],
    "maxAgeMilliseconds": 0,
    "priceSources": ["1"],
    "fxSources": ["1"]
  }
}
```

## POST /api/v1/workspaces/{workspaceId}/risk/sizing

**Purpose:** Submit risk / sizing within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/risk/api.ts); [validation schemas](../../../packages/contracts/src/risk.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `RiskSizingRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field            | Required | Type / structural validation                                                                              |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `accountId`           | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)                 |
| `instrumentVersionId` | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)                 |
| `asOf`                | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)            |
| `side`                | Yes      | `string`; enum: "long", "short"                                                                           |
| `mode`                | Yes      | `string`; enum: "linear", "manual"                                                                        |
| `currencyId`          | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)                 |
| `budget`              | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `entry`               | Yes      | `anyOf`                                                                                                   |
| `stop`                | Yes      | `anyOf`                                                                                                   |
| `fixedCosts`          | Yes      | `NonnegativeFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `perUnitCosts`        | Yes      | `NonnegativeFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `fxObservationId`     | Yes      | `anyOf`                                                                                                   |
| `maxAgeMilliseconds`  | Yes      | `integer`; minimum: 0; maximum: 9007199254740991                                                          |
| `manualRisk`          | Yes      | `anyOf`                                                                                                   |
| `manualQuantity`      | Yes      | `anyOf`                                                                                                   |
| `method`              | Yes      | `string`; maxLength: 2000                                                                                 |

**Validation:** JSON transport ceiling 16384 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                            |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `RiskSizingResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                      |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/risk/sizing HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Content-Type: application/json

{
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "instrumentVersionId": "33333333-3333-4333-8333-333333333333",
  "asOf": "2026-10-20T09:00:00.000000Z",
  "side": "long",
  "mode": "linear",
  "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "budget": "100",
  "entry": "100",
  "stop": "95",
  "fixedCosts": "1",
  "perUnitCosts": "0",
  "fxObservationId": null,
  "maxAgeMilliseconds": 86400000,
  "manualRisk": null,
  "manualQuantity": null,
  "method": "Fictional unit-price stop scenario"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "budget": "100",
  "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
  "state": "available",
  "quantity": "19",
  "plannedRisk": "96",
  "riskPerUnit": "5",
  "reasons": [],
  "mode": "linear",
  "definitionVersion": "planned-stop-risk/1",
  "references": ["66666666-6666-4666-8666-666666666666", "33333333-3333-4333-8333-333333333333"],
  "warning": "Planned stop risk does not guarantee the realized loss. This calculation neither places a trade nor changes original committed risk."
}
```
