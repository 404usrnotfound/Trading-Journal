# Private display views API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| GET    | [`/api/v1/workspaces/{workspaceId}/display-views/{screen}`](#get-apiv1workspacesworkspaceiddisplay-viewsscreen)  |
| POST   | [`/api/v1/workspaces/{workspaceId}/display-views/{screen}`](#post-apiv1workspacesworkspaceiddisplay-viewsscreen) |

## GET /api/v1/workspaces/{workspaceId}/display-views/{screen}

**Purpose:** Private per-member saved filters and column preferences. Workspace viewers may edit their own preferences. Optimistic revisions prevent overwriting another session.

**Implementation:** [handler](../../../packages/server/src/display-views/api.ts); [validation schemas](../../../packages/contracts/src/display-views.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                                    |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `screen`      | path     | Yes      | `DisplayViewScreen`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `DisplayViewResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/display-views/dashboard HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "revision": 0,
  "settings": {
    "screen": "dashboard",
    "columns": ["title"],
    "views": []
  }
}
```

## POST /api/v1/workspaces/{workspaceId}/display-views/{screen}

**Purpose:** Private per-member saved filters and column preferences. Workspace viewers may edit their own preferences. Optimistic revisions prevent overwriting another session.

**Implementation:** [handler](../../../packages/server/src/display-views/api.ts); [validation schemas](../../../packages/contracts/src/display-views.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name           | Location | Required | Type / structural validation                                                                    |
| -------------- | -------- | -------- | ----------------------------------------------------------------------------------------------- |
| `workspaceId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)       |
| `screen`       | path     | Yes      | `DisplayViewScreen`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`       | header   | Yes      | `string`; format: uri                                                                           |
| `X-CSRF-Token` | header   | Yes      | `string`; minLength: 1                                                                          |

**Request body:** Required; `application/json`. `DisplayViewWrite`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                                      |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `integer`; minimum: 0; maximum: 2147483646                                                        |
| `settings`         | Yes      | `DisplayViewSettings`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `DisplayViewResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/display-views/dashboard HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Content-Type: application/json

{
  "expectedRevision": 0,
  "settings": {
    "screen": "dashboard",
    "columns": [
      "title"
    ],
    "views": []
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "revision": 0,
  "settings": {
    "screen": "dashboard",
    "columns": ["title"],
    "views": []
  }
}
```
