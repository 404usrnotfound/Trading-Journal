# Period reviews API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------- |
| GET    | [`/api/v1/workspaces/{workspaceId}/reviews/catalog`](#get-apiv1workspacesworkspaceidreviewscatalog)                       |
| GET    | [`/api/v1/workspaces/{workspaceId}/reviews/entries`](#get-apiv1workspacesworkspaceidreviewsentries)                       |
| POST   | [`/api/v1/workspaces/{workspaceId}/reviews/entries`](#post-apiv1workspacesworkspaceidreviewsentries)                      |
| GET    | [`/api/v1/workspaces/{workspaceId}/reviews/entries/{id}`](#get-apiv1workspacesworkspaceidreviewsentriesid)                |
| POST   | [`/api/v1/workspaces/{workspaceId}/reviews/entries/{id}`](#post-apiv1workspacesworkspaceidreviewsentriesid)               |
| GET    | [`/api/v1/workspaces/{workspaceId}/reviews/entries/{id}/history`](#get-apiv1workspacesworkspaceidreviewsentriesidhistory) |
| GET    | [`/api/v1/workspaces/{workspaceId}/reviews/entries/{id}/summary`](#get-apiv1workspacesworkspaceidreviewsentriesidsummary) |
| GET    | [`/api/v1/workspaces/{workspaceId}/reviews/templates`](#get-apiv1workspacesworkspaceidreviewstemplates)                   |
| POST   | [`/api/v1/workspaces/{workspaceId}/reviews/templates`](#post-apiv1workspacesworkspaceidreviewstemplates)                  |
| POST   | [`/api/v1/workspaces/{workspaceId}/reviews/templates/{id}`](#post-apiv1workspacesworkspaceidreviewstemplatesid)           |

## GET /api/v1/workspaces/{workspaceId}/reviews/catalog

**Purpose:** Read reviews / catalog within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reviews/api.ts); [validation schemas](../../../packages/contracts/src/period-reviews.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `collection`  | query    | Yes      | `string`; enum: "trades", "strategy-versions"                                             |
| `after`       | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `search`      | query    | No       | `string`; maxLength: 160                                                                  |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PeriodReviewCatalog`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reviews/catalog?collection=trades HTTP/1.1
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

## GET /api/v1/workspaces/{workspaceId}/reviews/entries

**Purpose:** Read reviews / entries within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reviews/api.ts); [validation schemas](../../../packages/contracts/src/period-reviews.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                                   |
| ------------- | -------- | -------- | ---------------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `after`       | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `kind`        | query    | No       | `PeriodReviewKind`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `search`      | query    | No       | `string`; maxLength: 160                                                                       |
| `status`      | query    | No       | `string`; enum: "draft", "final"                                                               |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                          |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PeriodReviewList`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                    |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reviews/entries HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "entries": [],
  "nextCursor": null
}
```

## POST /api/v1/workspaces/{workspaceId}/reviews/entries

**Purpose:** Submit reviews / entries within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reviews/api.ts); [validation schemas](../../../packages/contracts/src/period-reviews.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `PeriodReviewWrite`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                         |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `expectedVersion` | Yes      | `integer`; minimum: 0; maximum: 2147483646                                                           |
| `reason`          | Yes      | `string`; minLength: 1; maxLength: 2000                                                              |
| `definition`      | Yes      | `PeriodReviewDefinition`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PeriodReviewVersion`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reviews/entries HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 13f668ab-cd3d-4c15-8fc3-1560f13b1824
Content-Type: application/json

{
  "expectedVersion": 0,
  "reason": "Fictional example",
  "definition": {
    "title": "Fictional example",
    "kind": "daily",
    "from": "2026-10-20T09:00:00.000000Z",
    "to": "2026-10-21T13:00:00.000000Z",
    "timezone": "UTC",
    "status": "draft",
    "notes": "Fictional example",
    "goals": [],
    "recurringMistakes": [],
    "emotions": [],
    "improvementActions": [],
    "templateVersionId": "b0e6cc2e-477a-4b6c-8452-0d0c3f615dfb",
    "answers": [],
    "tradeIds": [],
    "strategyVersionIds": []
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "entryId": "f9aa9ee2-cbdf-4966-87bb-a812dbfb80c7",
  "version": 1,
  "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "reason": "Fictional example",
  "definition": {
    "title": "Fictional example",
    "kind": "daily",
    "from": "2026-10-20T09:00:00.000000Z",
    "to": "2026-10-21T13:00:00.000000Z",
    "timezone": "UTC",
    "status": "draft",
    "notes": "Fictional example",
    "goals": [],
    "recurringMistakes": [],
    "emotions": [],
    "improvementActions": [],
    "templateVersionId": "b0e6cc2e-477a-4b6c-8452-0d0c3f615dfb",
    "answers": [],
    "tradeIds": [],
    "strategyVersionIds": []
  },
  "template": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "templateId": "9238906e-5e24-4687-8a7a-15dd8b3a51a9",
    "version": 1,
    "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
    "createdAt": "2026-10-20T09:00:00.000000Z",
    "reason": "Fictional example",
    "definition": {
      "name": "Fictional example",
      "instructions": "1",
      "status": "active",
      "fields": []
    }
  }
}
```

## GET /api/v1/workspaces/{workspaceId}/reviews/entries/{id}

**Purpose:** Read reviews / entries within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reviews/api.ts); [validation schemas](../../../packages/contracts/src/period-reviews.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PeriodReviewVersion`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reviews/entries/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "entryId": "f9aa9ee2-cbdf-4966-87bb-a812dbfb80c7",
  "version": 1,
  "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "reason": "Fictional example",
  "definition": {
    "title": "Fictional example",
    "kind": "daily",
    "from": "2026-10-20T09:00:00.000000Z",
    "to": "2026-10-21T13:00:00.000000Z",
    "timezone": "UTC",
    "status": "draft",
    "notes": "Fictional example",
    "goals": [],
    "recurringMistakes": [],
    "emotions": [],
    "improvementActions": [],
    "templateVersionId": "b0e6cc2e-477a-4b6c-8452-0d0c3f615dfb",
    "answers": [],
    "tradeIds": [],
    "strategyVersionIds": []
  },
  "template": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "templateId": "9238906e-5e24-4687-8a7a-15dd8b3a51a9",
    "version": 1,
    "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
    "createdAt": "2026-10-20T09:00:00.000000Z",
    "reason": "Fictional example",
    "definition": {
      "name": "Fictional example",
      "instructions": "1",
      "status": "active",
      "fields": []
    }
  }
}
```

## POST /api/v1/workspaces/{workspaceId}/reviews/entries/{id}

**Purpose:** Submit reviews / entries within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reviews/api.ts); [validation schemas](../../../packages/contracts/src/period-reviews.ts).

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

**Request body:** Required; `application/json`. `PeriodReviewWrite`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                         |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `expectedVersion` | Yes      | `integer`; minimum: 0; maximum: 2147483646                                                           |
| `reason`          | Yes      | `string`; minLength: 1; maxLength: 2000                                                              |
| `definition`      | Yes      | `PeriodReviewDefinition`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PeriodReviewVersion`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reviews/entries/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 397f0ba5-37b8-4365-8da1-050d9fc76614
Content-Type: application/json

{
  "expectedVersion": 0,
  "reason": "Fictional example",
  "definition": {
    "title": "Fictional example",
    "kind": "daily",
    "from": "2026-10-20T09:00:00.000000Z",
    "to": "2026-10-21T13:00:00.000000Z",
    "timezone": "UTC",
    "status": "draft",
    "notes": "Fictional example",
    "goals": [],
    "recurringMistakes": [],
    "emotions": [],
    "improvementActions": [],
    "templateVersionId": "b0e6cc2e-477a-4b6c-8452-0d0c3f615dfb",
    "answers": [],
    "tradeIds": [],
    "strategyVersionIds": []
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "entryId": "f9aa9ee2-cbdf-4966-87bb-a812dbfb80c7",
  "version": 1,
  "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "reason": "Fictional example",
  "definition": {
    "title": "Fictional example",
    "kind": "daily",
    "from": "2026-10-20T09:00:00.000000Z",
    "to": "2026-10-21T13:00:00.000000Z",
    "timezone": "UTC",
    "status": "draft",
    "notes": "Fictional example",
    "goals": [],
    "recurringMistakes": [],
    "emotions": [],
    "improvementActions": [],
    "templateVersionId": "b0e6cc2e-477a-4b6c-8452-0d0c3f615dfb",
    "answers": [],
    "tradeIds": [],
    "strategyVersionIds": []
  },
  "template": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "templateId": "9238906e-5e24-4687-8a7a-15dd8b3a51a9",
    "version": 1,
    "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
    "createdAt": "2026-10-20T09:00:00.000000Z",
    "reason": "Fictional example",
    "definition": {
      "name": "Fictional example",
      "instructions": "1",
      "status": "active",
      "fields": []
    }
  }
}
```

## GET /api/v1/workspaces/{workspaceId}/reviews/entries/{id}/history

**Purpose:** Read entries / history within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reviews/api.ts); [validation schemas](../../../packages/contracts/src/period-reviews.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `id`          | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `after`       | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PeriodReviewHistory`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reviews/entries/a5614527-0ce6-43be-8d1d-d012b7394867/history HTTP/1.1
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

## GET /api/v1/workspaces/{workspaceId}/reviews/entries/{id}/summary

**Purpose:** Read entries / summary within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reviews/api.ts); [validation schemas](../../../packages/contracts/src/period-reviews.ts).

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

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PeriodReviewSummary`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                       |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reviews/entries/a5614527-0ce6-43be-8d1d-d012b7394867/summary HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "entryVersionId": "94e49b0f-1f8d-4ee1-8c74-a433c4b5232f",
  "sourceRevision": "1",
  "generatedAt": "2026-10-20T09:00:00.000000Z",
  "linkedTradeCount": 0,
  "reviewedTradeCount": 0,
  "statusCounts": {},
  "missingTradeReviewIds": [],
  "recurringMistakes": [],
  "openActionCount": 0,
  "goalCount": 0,
  "sourceRecords": [],
  "explanation": "1"
}
```

## GET /api/v1/workspaces/{workspaceId}/reviews/templates

**Purpose:** Read reviews / templates within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reviews/api.ts); [validation schemas](../../../packages/contracts/src/period-reviews.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `after`       | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                  |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `PeriodReviewTemplateList`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                            |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reviews/templates HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "templates": [],
  "nextCursor": null
}
```

## POST /api/v1/workspaces/{workspaceId}/reviews/templates

**Purpose:** Submit reviews / templates within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reviews/api.ts); [validation schemas](../../../packages/contracts/src/period-reviews.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `PeriodReviewTemplateWrite`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                                 |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `expectedVersion` | Yes      | `integer`; minimum: 0; maximum: 2147483646                                                                   |
| `reason`          | Yes      | `string`; minLength: 1; maxLength: 2000                                                                      |
| `definition`      | Yes      | `PeriodReviewTemplateDefinition`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                     |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `PeriodReviewTemplateVersion`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reviews/templates HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 1986e047-c6e6-4b8f-81b9-fdbe4c25088e
Content-Type: application/json

{
  "expectedVersion": 0,
  "reason": "Fictional example",
  "definition": {
    "name": "Fictional example",
    "instructions": "1",
    "status": "active",
    "fields": []
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "templateId": "9238906e-5e24-4687-8a7a-15dd8b3a51a9",
  "version": 1,
  "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "reason": "Fictional example",
  "definition": {
    "name": "Fictional example",
    "instructions": "1",
    "status": "active",
    "fields": []
  }
}
```

## POST /api/v1/workspaces/{workspaceId}/reviews/templates/{id}

**Purpose:** Submit reviews / templates within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/reviews/api.ts); [validation schemas](../../../packages/contracts/src/period-reviews.ts).

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

**Request body:** Required; `application/json`. `PeriodReviewTemplateWrite`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                                 |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `expectedVersion` | Yes      | `integer`; minimum: 0; maximum: 2147483646                                                                   |
| `reason`          | Yes      | `string`; minLength: 1; maxLength: 2000                                                                      |
| `definition`      | Yes      | `PeriodReviewTemplateDefinition`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                     |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `PeriodReviewTemplateVersion`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                               |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/reviews/templates/a5614527-0ce6-43be-8d1d-d012b7394867 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 39d1aa31-2ddf-48c3-8958-aa9195ddeaed
Content-Type: application/json

{
  "expectedVersion": 0,
  "reason": "Fictional example",
  "definition": {
    "name": "Fictional example",
    "instructions": "1",
    "status": "active",
    "fields": []
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "templateId": "9238906e-5e24-4687-8a7a-15dd8b3a51a9",
  "version": 1,
  "actorId": "db3a4f11-a05a-4313-823f-c9e9017521d5",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "reason": "Fictional example",
  "definition": {
    "name": "Fictional example",
    "instructions": "1",
    "status": "active",
    "fields": []
  }
}
```
