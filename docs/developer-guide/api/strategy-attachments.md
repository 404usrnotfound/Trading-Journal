# Strategy attachments API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | [`/api/v1/workspaces/{workspaceId}/strategy-attachments`](#get-apiv1workspacesworkspaceidstrategy-attachments)                               |
| POST   | [`/api/v1/workspaces/{workspaceId}/strategy-attachments`](#post-apiv1workspacesworkspaceidstrategy-attachments)                              |
| DELETE | [`/api/v1/workspaces/{workspaceId}/strategy-attachments/{attachmentId}`](#delete-apiv1workspacesworkspaceidstrategy-attachmentsattachmentid) |
| GET    | [`/api/v1/workspaces/{workspaceId}/strategy-attachments/{attachmentId}`](#get-apiv1workspacesworkspaceidstrategy-attachmentsattachmentid)    |

## GET /api/v1/workspaces/{workspaceId}/strategy-attachments

**Purpose:** Read workspaces / strategy-attachments within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/strategies/attachment-api.ts); [validation schemas](../../../packages/contracts/src/strategy-attachments.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `limit`       | query    | No       | `string`; pattern: `^(?:[1-9][0-9]?\|100)$`                                               |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                        |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `StrategyAttachmentListResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                  |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                  |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                  |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                  |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                  |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                  |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                  |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                  |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                  |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategy-attachments HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
[]
```

## POST /api/v1/workspaces/{workspaceId}/strategy-attachments

**Purpose:** Upload immutable workspace-owned PNG, JPEG, WebP or PDF content, at most 10485760 bytes. X-File-Name is URI-component encoded. Repeated identical Idempotency-Key returns the original metadata; different contents conflict.

**Implementation:** [handler](../../../packages/server/src/strategies/attachment-api.ts); [validation schemas](../../../packages/contracts/src/strategy-attachments.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `X-File-Name`     | header   | Yes      | `string`; minLength: 1; maxLength: 1440                                                   |

**Request body:** Required; `image/png`, `image/jpeg`, `image/webp`, `application/pdf`. Raw file bytes; do not wrap binary content in JSON or base64.

**Validation:** Raw upload ceiling 10485760 bytes; magic/type and private lifecycle checks apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 201         | `application/json`         | `StrategyAttachmentResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategy-attachments HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 2fc745b3-b585-4b31-8bdc-78cfccd6a4c4
X-File-Name: fictional.png
Content-Type: image/png

<raw bytes of a fictional valid PNG file>
```

**Example response:**

HTTP 201; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "workspaceId": "09707fa5-aaae-4493-8a23-827111000f89",
  "name": "Fictional example",
  "mediaType": "image/png",
  "size": 1,
  "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "createdAt": "2026-10-20T09:00:00.000000Z"
}
```

## DELETE /api/v1/workspaces/{workspaceId}/strategy-attachments/{attachmentId}

**Purpose:** Delete only unreferenced attachment content. Any immutable strategy version, journal revision or published plan reference returns 409, including archived trades and strategies.

**Implementation:** [handler](../../../packages/server/src/strategies/attachment-api.ts); [validation schemas](../../../packages/contracts/src/strategy-attachments.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name           | Location | Required | Type / structural validation                                                              |
| -------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `attachmentId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`       | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token` | header   | Yes      | `string`; minLength: 1                                                                    |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                       |
| ----------- | -------------------------- | ---------------------------------------------------------------------- |
| 204         | No body                    | Unreferenced attachment deleted.                                       |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
DELETE /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategy-attachments/1c5a14b0-bc12-4a06-862f-677d0fb45a2c HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
```

**Example response:**

```http
HTTP/1.1 204 No Content
```

## GET /api/v1/workspaces/{workspaceId}/strategy-attachments/{attachmentId}

**Purpose:** Authenticated immutable attachment read. Images may be displayed inline; PDF files are always downloaded. Content is private, uncached, sandboxed and protected from MIME sniffing.

**Implementation:** [handler](../../../packages/server/src/strategies/attachment-api.ts); [validation schemas](../../../packages/contracts/src/strategy-attachments.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name           | Location | Required | Type / structural validation                                                              |
| -------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`  | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `attachmentId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                   |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------- |
| 200         | `image/png`                | `string`; format: binary; Original uploaded content after workspace authorization. |
| 200         | `image/jpeg`               | `string`; format: binary; Original uploaded content after workspace authorization. |
| 200         | `image/webp`               | `string`; format: binary; Original uploaded content after workspace authorization. |
| 200         | `application/pdf`          | `string`; format: binary; Original uploaded content after workspace authorization. |
| 400         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics             |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics             |
| 403         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics             |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics             |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics             |
| 413         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics             |
| 415         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics             |
| 422         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics             |
| 500         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics             |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/strategy-attachments/1c5a14b0-bc12-4a06-862f-677d0fb45a2c HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

```http
HTTP/1.1 200
Content-Type: image/png

<authorized download bytes; not a JSON DTO>
```
