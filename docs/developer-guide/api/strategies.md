# Strategy playbooks API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | [`/api/v1/workspaces/{workspaceId}/strategies`](#get-apiv1workspacesworkspaceidstrategies)                                                              |
| POST   | [`/api/v1/workspaces/{workspaceId}/strategies`](#post-apiv1workspacesworkspaceidstrategies)                                                             |
| DELETE | [`/api/v1/workspaces/{workspaceId}/strategies/{strategyId}`](#delete-apiv1workspacesworkspaceidstrategiesstrategyid)                                    |
| GET    | [`/api/v1/workspaces/{workspaceId}/strategies/{strategyId}`](#get-apiv1workspacesworkspaceidstrategiesstrategyid)                                       |
| PUT    | [`/api/v1/workspaces/{workspaceId}/strategies/{strategyId}`](#put-apiv1workspacesworkspaceidstrategiesstrategyid)                                       |
| GET    | [`/api/v1/workspaces/{workspaceId}/strategies/{strategyId}/trade-links`](#get-apiv1workspacesworkspaceidstrategiesstrategyidtrade-links)                |
| POST   | [`/api/v1/workspaces/{workspaceId}/strategies/{strategyId}/trade-links`](#post-apiv1workspacesworkspaceidstrategiesstrategyidtrade-links)               |
| GET    | [`/api/v1/workspaces/{workspaceId}/strategies/{strategyId}/trades`](#get-apiv1workspacesworkspaceidstrategiesstrategyidtrades)                          |
| GET    | [`/api/v1/workspaces/{workspaceId}/strategies/{strategyId}/versions`](#get-apiv1workspacesworkspaceidstrategiesstrategyidversions)                      |
| GET    | [`/api/v1/workspaces/{workspaceId}/strategies/{strategyId}/versions/{versionId}`](#get-apiv1workspacesworkspaceidstrategiesstrategyidversionsversionid) |

## GET /api/v1/workspaces/{workspaceId}/strategies

**Purpose:** Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/strategies/api.ts); [validation schemas](../../../packages/contracts/src/strategies.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                                 |
| ----------------- | -------- | -------- | -------------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `cursor`          | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `limit`           | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                     |
| `includeArchived` | query    | No       | `string`; enum: "true", "false"                                                              |
| `status`          | query    | No       | `StrategyStatus`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `search`          | query    | No       | `string`; minLength: 1; maxLength: 160                                                       |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                              |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyListResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategies HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "strategies": [],
  "nextCursor": null
}
```

## POST /api/v1/workspaces/{workspaceId}/strategies

**Purpose:** Editor/owner strategy command. Definitions are complete immutable snapshots, bounded to 196608 UTF-8 bytes; JSON request bodies are bounded to 262144 bytes. Changes append a version and never rewrite historical trade references. Deletion archives the identity. Late trade classification is explicitly retrospective.

**Implementation:** [handler](../../../packages/server/src/strategies/api.ts); [validation schemas](../../../packages/contracts/src/strategies.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `StrategyCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field     | Required | Type / structural validation                                                                       |
| -------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `definition`   | Yes      | `StrategyDefinition`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `effectiveAt`  | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `changeReason` | No       | `StrategyChangeReason`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                          |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategies HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: a0a562ef-f72c-4234-8b18-d9e3ac4b920a
Content-Type: application/json

{
  "definition": {
    "name": "Fictional example"
  },
  "effectiveAt": "2026-01-01T00:00:00.000000Z"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "workspaceId": "09707fa5-aaae-4493-8a23-827111000f89",
  "revision": 1,
  "currentVersionId": "8fcd55ae-22e2-4295-8114-b1167be118ef",
  "currentVersion": {
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
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "archiveReason": "Fictional example",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "updatedAt": "2026-10-20T09:00:00.000000Z"
}
```

## DELETE /api/v1/workspaces/{workspaceId}/strategies/{strategyId}

**Purpose:** Editor/owner strategy command. Definitions are complete immutable snapshots, bounded to 196608 UTF-8 bytes; JSON request bodies are bounded to 262144 bytes. Changes append a version and never rewrite historical trade references. Deletion archives the identity. Late trade classification is explicitly retrospective.

**Implementation:** [handler](../../../packages/server/src/strategies/api.ts); [validation schemas](../../../packages/contracts/src/strategies.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `strategyId`      | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `StrategyArchive`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                       |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `reason`           | Yes      | `StrategyChangeReason`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                          |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
DELETE /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategies/00e4973c-52ce-4fb7-8df2-f685a3763600 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: a201ee59-f8fb-49b0-8364-2dba2791f98d
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
  "workspaceId": "09707fa5-aaae-4493-8a23-827111000f89",
  "revision": 1,
  "currentVersionId": "8fcd55ae-22e2-4295-8114-b1167be118ef",
  "currentVersion": {
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
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "archiveReason": "Fictional example",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "updatedAt": "2026-10-20T09:00:00.000000Z"
}
```

## GET /api/v1/workspaces/{workspaceId}/strategies/{strategyId}

**Purpose:** Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/strategies/api.ts); [validation schemas](../../../packages/contracts/src/strategies.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `strategyId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                          |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategies/00e4973c-52ce-4fb7-8df2-f685a3763600 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "workspaceId": "09707fa5-aaae-4493-8a23-827111000f89",
  "revision": 1,
  "currentVersionId": "8fcd55ae-22e2-4295-8114-b1167be118ef",
  "currentVersion": {
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
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "archiveReason": "Fictional example",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "updatedAt": "2026-10-20T09:00:00.000000Z"
}
```

## PUT /api/v1/workspaces/{workspaceId}/strategies/{strategyId}

**Purpose:** Editor/owner strategy command. Definitions are complete immutable snapshots, bounded to 196608 UTF-8 bytes; JSON request bodies are bounded to 262144 bytes. Changes append a version and never rewrite historical trade references. Deletion archives the identity. Late trade classification is explicitly retrospective.

**Implementation:** [handler](../../../packages/server/src/strategies/api.ts); [validation schemas](../../../packages/contracts/src/strategies.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `strategyId`      | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `StrategyUpdate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                       |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------- |
| `definition`       | Yes      | `StrategyDefinition`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `effectiveAt`      | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)     |
| `expectedRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `changeReason`     | Yes      | `StrategyChangeReason`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                          |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
PUT /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategies/00e4973c-52ce-4fb7-8df2-f685a3763600 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 0a28bf3c-0393-401d-8604-46de4e74fc30
Content-Type: application/json

{
  "definition": {
    "name": "Fictional example"
  },
  "effectiveAt": "2026-01-01T00:00:00.000000Z",
  "expectedRevision": 1,
  "changeReason": "Fictional example"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "workspaceId": "09707fa5-aaae-4493-8a23-827111000f89",
  "revision": 1,
  "currentVersionId": "8fcd55ae-22e2-4295-8114-b1167be118ef",
  "currentVersion": {
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
  "archivedAt": "2026-10-20T09:00:00.000000Z",
  "archiveReason": "Fictional example",
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "updatedAt": "2026-10-20T09:00:00.000000Z"
}
```

## GET /api/v1/workspaces/{workspaceId}/strategies/{strategyId}/trade-links

**Purpose:** Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/strategies/api.ts); [validation schemas](../../../packages/contracts/src/strategies.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `strategyId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                  |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler. Implemented GET alias absent from pre-CP6 OpenAPI

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyTradesResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategies/00e4973c-52ce-4fb7-8df2-f685a3763600/trade-links HTTP/1.1
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

## POST /api/v1/workspaces/{workspaceId}/strategies/{strategyId}/trade-links

**Purpose:** Editor/owner strategy command. Definitions are complete immutable snapshots, bounded to 196608 UTF-8 bytes; JSON request bodies are bounded to 262144 bytes. Changes append a version and never rewrite historical trade references. Deletion archives the identity. Late trade classification is explicitly retrospective.

**Implementation:** [handler](../../../packages/server/src/strategies/api.ts); [validation schemas](../../../packages/contracts/src/strategies.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `strategyId`      | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `StrategyTradeLinkCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field              | Required | Type / structural validation                                                                       |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `tradeId`               | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `versionId`             | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)          |
| `expectedTradeRevision` | Yes      | `FinancialRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)    |
| `reason`                | Yes      | `StrategyChangeReason`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategies/00e4973c-52ce-4fb7-8df2-f685a3763600/trade-links HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 35d60368-656b-431f-8cce-046c06a69e4c
Content-Type: application/json

{
  "tradeId": "bf722ab9-bd97-43fe-8ec5-aefbef503beb",
  "versionId": "772c657e-ac9c-4550-8ecf-9f77201cbb95",
  "expectedTradeRevision": 1,
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

## GET /api/v1/workspaces/{workspaceId}/strategies/{strategyId}/trades

**Purpose:** Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/strategies/api.ts); [validation schemas](../../../packages/contracts/src/strategies.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `strategyId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                  |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyTradesResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategies/00e4973c-52ce-4fb7-8df2-f685a3763600/trades HTTP/1.1
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

## GET /api/v1/workspaces/{workspaceId}/strategies/{strategyId}/versions

**Purpose:** Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/strategies/api.ts); [validation schemas](../../../packages/contracts/src/strategies.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `strategyId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `string`; pattern: `^(?:[1-9]\d?\|100)$`                                                  |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                     |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `StrategyVersionListResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategies/00e4973c-52ce-4fb7-8df2-f685a3763600/versions HTTP/1.1
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

## GET /api/v1/workspaces/{workspaceId}/strategies/{strategyId}/versions/{versionId}

**Purpose:** Workspace-scoped strategy and immutable version history. Lists are cursor-paginated, at most 100 entries per page.

**Implementation:** [handler](../../../packages/server/src/strategies/api.ts); [validation schemas](../../../packages/contracts/src/strategies.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `strategyId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `versionId`   | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                 |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyVersionResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategies/00e4973c-52ce-4fb7-8df2-f685a3763600/versions/772c657e-ac9c-4550-8ecf-9f77201cbb95 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
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
}
```
