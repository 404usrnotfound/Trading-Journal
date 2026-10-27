# Trade journals API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | [`/api/v1/workspaces/{workspaceId}/journals`](#get-apiv1workspacesworkspaceidjournals)                                                            |
| POST   | [`/api/v1/workspaces/{workspaceId}/journals`](#post-apiv1workspacesworkspaceidjournals)                                                           |
| GET    | [`/api/v1/workspaces/{workspaceId}/journals/{tradeId}`](#get-apiv1workspacesworkspaceidjournalstradeid)                                           |
| PUT    | [`/api/v1/workspaces/{workspaceId}/journals/{tradeId}`](#put-apiv1workspacesworkspaceidjournalstradeid)                                           |
| GET    | [`/api/v1/workspaces/{workspaceId}/journals/{tradeId}/plans`](#get-apiv1workspacesworkspaceidjournalstradeidplans)                                |
| POST   | [`/api/v1/workspaces/{workspaceId}/journals/{tradeId}/plans`](#post-apiv1workspacesworkspaceidjournalstradeidplans)                               |
| GET    | [`/api/v1/workspaces/{workspaceId}/journals/{tradeId}/revisions`](#get-apiv1workspacesworkspaceidjournalstradeidrevisions)                        |
| GET    | [`/api/v1/workspaces/{workspaceId}/journals/{tradeId}/revisions/{revisionId}`](#get-apiv1workspacesworkspaceidjournalstradeidrevisionsrevisionid) |
| GET    | [`/api/v1/workspaces/{workspaceId}/journals/{tradeId}/risk-additions`](#get-apiv1workspacesworkspaceidjournalstradeidrisk-additions)              |
| POST   | [`/api/v1/workspaces/{workspaceId}/journals/{tradeId}/risk-additions`](#post-apiv1workspacesworkspaceidjournalstradeidrisk-additions)             |

## GET /api/v1/workspaces/{workspaceId}/journals

**Purpose:** Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/journal/api.ts); [validation schemas](../../../packages/contracts/src/journal.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                                         |
| ----------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)            |
| `cursor`          | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)            |
| `limit`           | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                             |
| `includeArchived` | query    | No       | `string`; enum: "true", "false"                                                                      |
| `status`          | query    | No       | `string`; enum: "planned", "open", "partially_closed", "closed", "canceled"                          |
| `search`          | query    | No       | `string`; minLength: 1; maxLength: 160                                                               |
| `accountId`       | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)            |
| `from`            | query    | No       | `JournalActivityInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `to`              | query    | No       | `JournalActivityInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `JournalListResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/journals HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "trades": [],
  "nextCursor": null
}
```

## POST /api/v1/workspaces/{workspaceId}/journals

**Purpose:** Editor/owner journal command with optimistic revision checks. Identical retries with the same Idempotency-Key return the committed command response; changed contents conflict. Complete journal documents are bounded to 131072 UTF-8 bytes and JSON requests to 262144 bytes. Saves append immutable revisions without changing ledger balances. Publication freezes the original server-timed plan and risk; later plans and separate risk additions never rewrite the historical R denominator.

**Implementation:** [handler](../../../packages/server/src/journal/api.ts); [validation schemas](../../../packages/contracts/src/journal.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `JournalCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field          | Required | Type / structural validation                                                               |
| ------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `title`             | Yes      | `JournalLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `classification`    | Yes      | `string`; enum: "active-trading", "investing"                                              |
| `strategyVersionId` | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)  |
| `legs`              | No       | `array`; maxItems: 20                                                                      |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                               |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `JournalDetailResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/journals HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: bcd8beb7-c3da-4262-8ae6-6d21b6b57903
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
  "trade": {
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
  },
  "journal": {
    "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
    "revision": 0,
    "document": {},
    "updatedAt": "2026-10-20T09:00:00.000000Z",
    "updatedBy": "1"
  },
  "strategy": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "workspaceId": "09707fa5-aaae-4493-8a23-827111000f89",
    "strategyId": "00e4973c-52ce-4fb7-8df2-f685a3763600",
    "version": 1,
    "effectiveAt": "2026-01-01T00:00:00.000000Z",
    "definition": {
      "name": "Fictional example"
    },
    "definitionHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "changeReason": "Fictional example",
    "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
    "createdAt": "2026-10-20T09:00:00.000000Z"
  },
  "originalPlan": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
    "version": 1,
    "definition": {
      "strategyVersionId": null,
      "setupId": null,
      "thesis": "",
      "marketConditions": "",
      "timeframe": "",
      "legs": [],
      "initialRisk": null,
      "attachmentIds": []
    },
    "definitionHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "createdAt": "2026-10-20T09:00:00.000000Z",
    "createdBy": "1",
    "changeReason": "Fictional example"
  },
  "currentPlan": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
    "version": 1,
    "definition": {
      "strategyVersionId": null,
      "setupId": null,
      "thesis": "",
      "marketConditions": "",
      "timeframe": "",
      "legs": [],
      "initialRisk": null,
      "attachmentIds": []
    },
    "definitionHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "createdAt": "2026-10-20T09:00:00.000000Z",
    "createdBy": "1",
    "changeReason": "Fictional example"
  },
  "commitment": {
    "originalPlanId": "60c52606-cd37-4318-8ec9-7bf5fb0f76f9",
    "committedAt": "2026-10-20T09:00:00.000000Z",
    "financialSourceRevision": "1",
    "timing": "pre-trade",
    "createdBy": "1"
  },
  "financial": {
    "sourceRevision": "1",
    "definitionVersion": "trade-journal-financial/1",
    "manifest": {
      "kernelVersion": "1",
      "instrumentModuleVersion": "1",
      "lotPolicyVersion": "1",
      "allocationPolicyVersion": "1",
      "fxPolicyVersion": "1",
      "roundingPolicyVersion": "1"
    },
    "legs": [],
    "timeline": [],
    "rMultiple": {
      "status": "available",
      "value": "1",
      "reasons": [],
      "unit": "R",
      "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
      "source": "calculated-ledger",
      "originalPlanId": "60c52606-cd37-4318-8ec9-7bf5fb0f76f9",
      "definitionVersion": "original-risk-r/1",
      "financialSourceRevision": "1"
    }
  },
  "recentHistory": []
}
```

## GET /api/v1/workspaces/{workspaceId}/journals/{tradeId}

**Purpose:** Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/journal/api.ts); [validation schemas](../../../packages/contracts/src/journal.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `tradeId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                               |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `JournalDetailResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/journals/bf722ab9-bd97-43fe-8ec5-aefbef503beb HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "trade": {
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
  },
  "journal": {
    "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
    "revision": 0,
    "document": {},
    "updatedAt": "2026-10-20T09:00:00.000000Z",
    "updatedBy": "1"
  },
  "strategy": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "workspaceId": "09707fa5-aaae-4493-8a23-827111000f89",
    "strategyId": "00e4973c-52ce-4fb7-8df2-f685a3763600",
    "version": 1,
    "effectiveAt": "2026-01-01T00:00:00.000000Z",
    "definition": {
      "name": "Fictional example"
    },
    "definitionHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "changeReason": "Fictional example",
    "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
    "createdAt": "2026-10-20T09:00:00.000000Z"
  },
  "originalPlan": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
    "version": 1,
    "definition": {
      "strategyVersionId": null,
      "setupId": null,
      "thesis": "",
      "marketConditions": "",
      "timeframe": "",
      "legs": [],
      "initialRisk": null,
      "attachmentIds": []
    },
    "definitionHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "createdAt": "2026-10-20T09:00:00.000000Z",
    "createdBy": "1",
    "changeReason": "Fictional example"
  },
  "currentPlan": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
    "version": 1,
    "definition": {
      "strategyVersionId": null,
      "setupId": null,
      "thesis": "",
      "marketConditions": "",
      "timeframe": "",
      "legs": [],
      "initialRisk": null,
      "attachmentIds": []
    },
    "definitionHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "createdAt": "2026-10-20T09:00:00.000000Z",
    "createdBy": "1",
    "changeReason": "Fictional example"
  },
  "commitment": {
    "originalPlanId": "60c52606-cd37-4318-8ec9-7bf5fb0f76f9",
    "committedAt": "2026-10-20T09:00:00.000000Z",
    "financialSourceRevision": "1",
    "timing": "pre-trade",
    "createdBy": "1"
  },
  "financial": {
    "sourceRevision": "1",
    "definitionVersion": "trade-journal-financial/1",
    "manifest": {
      "kernelVersion": "1",
      "instrumentModuleVersion": "1",
      "lotPolicyVersion": "1",
      "allocationPolicyVersion": "1",
      "fxPolicyVersion": "1",
      "roundingPolicyVersion": "1"
    },
    "legs": [],
    "timeline": [],
    "rMultiple": {
      "status": "available",
      "value": "1",
      "reasons": [],
      "unit": "R",
      "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
      "source": "calculated-ledger",
      "originalPlanId": "60c52606-cd37-4318-8ec9-7bf5fb0f76f9",
      "definitionVersion": "original-risk-r/1",
      "financialSourceRevision": "1"
    }
  },
  "recentHistory": []
}
```

## PUT /api/v1/workspaces/{workspaceId}/journals/{tradeId}

**Purpose:** Editor/owner journal command with optimistic revision checks. Identical retries with the same Idempotency-Key return the committed command response; changed contents conflict. Complete journal documents are bounded to 131072 UTF-8 bytes and JSON requests to 262144 bytes. Saves append immutable revisions without changing ledger balances. Publication freezes the original server-timed plan and risk; later plans and separate risk additions never rewrite the historical R denominator.

**Implementation:** [handler](../../../packages/server/src/journal/api.ts); [validation schemas](../../../packages/contracts/src/journal.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `tradeId`         | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `JournalSave`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                  |
| ------------------ | -------- | --------------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `integer`; minimum: 0; maximum: 2147483646                                                    |
| `document`         | Yes      | `JournalDocument`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                              |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `JournalEntryResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
PUT /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/journals/bf722ab9-bd97-43fe-8ec5-aefbef503beb HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 8178d8d3-a848-4173-820e-a2a0dd1a5cd8
Content-Type: application/json

{
  "expectedRevision": 0,
  "document": {}
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
  "revision": 0,
  "document": {},
  "updatedAt": "2026-10-20T09:00:00.000000Z",
  "updatedBy": "1"
}
```

## GET /api/v1/workspaces/{workspaceId}/journals/{tradeId}/plans

**Purpose:** Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/journal/api.ts); [validation schemas](../../../packages/contracts/src/journal.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `tradeId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                  |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                              |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `JournalPlansResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/journals/bf722ab9-bd97-43fe-8ec5-aefbef503beb/plans HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "plans": [],
  "nextCursor": null
}
```

## POST /api/v1/workspaces/{workspaceId}/journals/{tradeId}/plans

**Purpose:** Editor/owner journal command with optimistic revision checks. Identical retries with the same Idempotency-Key return the committed command response; changed contents conflict. Complete journal documents are bounded to 131072 UTF-8 bytes and JSON requests to 262144 bytes. Saves append immutable revisions without changing ledger balances. Publication freezes the original server-timed plan and risk; later plans and separate risk additions never rewrite the historical R denominator.

**Implementation:** [handler](../../../packages/server/src/journal/api.ts); [validation schemas](../../../packages/contracts/src/journal.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `tradeId`         | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `JournalPublishPlan`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field              | Required | Type / structural validation                                                                    |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `expectedRevision`      | Yes      | `integer`; minimum: 0; maximum: 2147483646                                                      |
| `expectedTradeRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `reason`                | Yes      | `JournalReason`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `JournalPlanVersionResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/journals/bf722ab9-bd97-43fe-8ec5-aefbef503beb/plans HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 8322c49a-320e-4ba2-8a06-1ea237e34b50
Content-Type: application/json

{
  "expectedRevision": 0,
  "expectedTradeRevision": 1,
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
  "version": 1,
  "definition": {
    "strategyVersionId": null,
    "setupId": null,
    "thesis": "",
    "marketConditions": "",
    "timeframe": "",
    "legs": [],
    "initialRisk": null,
    "attachmentIds": []
  },
  "definitionHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "createdBy": "1",
  "changeReason": "Fictional example"
}
```

## GET /api/v1/workspaces/{workspaceId}/journals/{tradeId}/revisions

**Purpose:** Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/journal/api.ts); [validation schemas](../../../packages/contracts/src/journal.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `tradeId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                  |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                  |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `JournalRevisionsResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/journals/bf722ab9-bd97-43fe-8ec5-aefbef503beb/revisions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "revisions": [],
  "nextCursor": null
}
```

## GET /api/v1/workspaces/{workspaceId}/journals/{tradeId}/revisions/{revisionId}

**Purpose:** Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/journal/api.ts); [validation schemas](../../../packages/contracts/src/journal.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `tradeId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `revisionId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                 |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `JournalRevisionResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/journals/bf722ab9-bd97-43fe-8ec5-aefbef503beb/revisions/6c46ebd8-7931-46f0-89ba-6f4dd75fd707 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "revision": 1,
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "createdBy": "1",
  "changeReason": "Fictional example",
  "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
  "document": {},
  "documentHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

## GET /api/v1/workspaces/{workspaceId}/journals/{tradeId}/risk-additions

**Purpose:** Workspace-scoped trade journal. Detail is a coherent snapshot of immutable financial sources, historical strategy rules and manual journal entries. Financial information is calculated independently of manually reported observations. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/journal/api.ts); [validation schemas](../../../packages/contracts/src/journal.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `tradeId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                  |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                      |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `JournalRiskAdditionsResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/journals/bf722ab9-bd97-43fe-8ec5-aefbef503beb/risk-additions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "riskAdditions": [],
  "nextCursor": null
}
```

## POST /api/v1/workspaces/{workspaceId}/journals/{tradeId}/risk-additions

**Purpose:** Editor/owner journal command with optimistic revision checks. Identical retries with the same Idempotency-Key return the committed command response; changed contents conflict. Complete journal documents are bounded to 131072 UTF-8 bytes and JSON requests to 262144 bytes. Saves append immutable revisions without changing ledger balances. Publication freezes the original server-timed plan and risk; later plans and separate risk additions never rewrite the historical R denominator.

**Implementation:** [handler](../../../packages/server/src/journal/api.ts); [validation schemas](../../../packages/contracts/src/journal.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `tradeId`         | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `JournalRiskAddition`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                           |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| `expectedRevision` | Yes      | `integer`; minimum: 0; maximum: 2147483646                                                             |
| `amount`           | Yes      | `PositiveFinancialDecimal`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `currencyId`       | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)              |
| `method`           | Yes      | `JournalLabel`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `methodNotes`      | No       | `JournalNarrative`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)         |
| `reason`           | Yes      | `JournalReason`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)            |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                     |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `JournalRiskAdditionResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/journals/bf722ab9-bd97-43fe-8ec5-aefbef503beb/risk-additions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 1347bc7d-6b95-4e08-8e68-df77b321c4a8
Content-Type: application/json

{
  "expectedRevision": 0,
  "amount": "1",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "method": "1",
  "reason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
  "amount": "1",
  "currencyId": "3fd55412-a43c-4f96-8556-8ee9489a0b25",
  "method": "1",
  "methodNotes": "Fictional example",
  "reason": "Fictional example",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "createdBy": "1"
}
```
