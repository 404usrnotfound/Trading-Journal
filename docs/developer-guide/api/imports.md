# Reviewed imports API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | [`/api/v1/workspaces/{workspaceId}/imports/batches`](#get-apiv1workspacesworkspaceidimportsbatches)                                              |
| POST   | [`/api/v1/workspaces/{workspaceId}/imports/batches`](#post-apiv1workspacesworkspaceidimportsbatches)                                             |
| GET    | [`/api/v1/workspaces/{workspaceId}/imports/batches/{batchId}`](#get-apiv1workspacesworkspaceidimportsbatchesbatchid)                             |
| POST   | [`/api/v1/workspaces/{workspaceId}/imports/batches/{batchId}/commit`](#post-apiv1workspacesworkspaceidimportsbatchesbatchidcommit)               |
| POST   | [`/api/v1/workspaces/{workspaceId}/imports/batches/{batchId}/preview`](#post-apiv1workspacesworkspaceidimportsbatchesbatchidpreview)             |
| POST   | [`/api/v1/workspaces/{workspaceId}/imports/batches/{batchId}/reverse`](#post-apiv1workspacesworkspaceidimportsbatchesbatchidreverse)             |
| GET    | [`/api/v1/workspaces/{workspaceId}/imports/batches/{batchId}/source`](#get-apiv1workspacesworkspaceidimportsbatchesbatchidsource)                |
| GET    | [`/api/v1/workspaces/{workspaceId}/imports/catalog`](#get-apiv1workspacesworkspaceidimportscatalog)                                              |
| GET    | [`/api/v1/workspaces/{workspaceId}/imports/templates`](#get-apiv1workspacesworkspaceidimportstemplates)                                          |
| POST   | [`/api/v1/workspaces/{workspaceId}/imports/templates`](#post-apiv1workspacesworkspaceidimportstemplates)                                         |
| POST   | [`/api/v1/workspaces/{workspaceId}/imports/templates/{templateId}/versions`](#post-apiv1workspacesworkspaceidimportstemplatestemplateidversions) |

## GET /api/v1/workspaces/{workspaceId}/imports/batches

**Purpose:** Read imports / batches within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                               |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `ImportHistoryResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/batches HTTP/1.1
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

## POST /api/v1/workspaces/{workspaceId}/imports/batches

**Purpose:** Submit imports / batches within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ImportStage`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field          | Required | Type / structural validation                                                                |
| ------------------- | -------- | ------------------------------------------------------------------------------------------- |
| `accountId`         | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `namespace`         | Yes      | `string`; minLength: 1; maxLength: 160                                                      |
| `filename`          | Yes      | `string`; minLength: 1; maxLength: 160                                                      |
| `content`           | Yes      | `string`; minLength: 1; maxLength: 2097152                                                  |
| `templateVersionId` | No       | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)   |
| `mapping`           | No       | `ImportMapping`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Validation:** JSON transport ceiling 4194304 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `ImportBatchResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/batches HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 2e472b5c-400f-4a06-8e62-522047b00032
Content-Type: application/json

{
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "namespace": "docs:api-fictional",
  "filename": "fictional-cash.csv",
  "content": "ID;Sequence;Date;Type;Amount;Memo\nCASH-001;1;12/10/2026 09:30:00;Deposit;1.000,00;Initial funding\nCASH-002;2;13/10/2026 14:00:00;Withdrawal;-100,00;External withdrawal\n",
  "mapping": {
    "version": "canonical-import/1",
    "adapterId": "generic-csv",
    "adapterVersion": "1",
    "conventions": {
      "delimiter": ";",
      "decimalSeparator": ",",
      "thousandsSeparator": ".",
      "dateFormat": "dmy",
      "timezone": "Europe/Madrid"
    },
    "kind": "cash_movement",
    "sourceIdColumn": "ID",
    "fields": [
      {
        "target": "orderingKey",
        "column": "Sequence",
        "transform": "text"
      },
      {
        "target": "economicAt",
        "column": "Date",
        "transform": "instant",
        "empty": "error"
      },
      {
        "target": "amount",
        "column": "Amount",
        "transform": "decimal",
        "empty": "error"
      },
      {
        "target": "currencyId",
        "constant": "00000000-0000-4000-8000-000000000002"
      },
      {
        "target": "kind",
        "column": "Type",
        "values": {
          "Deposit": "deposit",
          "Withdrawal": "withdrawal"
        },
        "empty": "error"
      }
    ]
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "namespace": "Fictional example",
  "filename": "Fictional example",
  "fileHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "adapterId": "113639b8-30d7-45c3-8d6e-6dd4e968a434",
  "adapterVersion": "1",
  "revision": 1,
  "state": "staged",
  "rowCount": 0,
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "preview": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "batchRevision": 1,
    "sourceRevision": "1",
    "groups": ["1"],
    "committable": false,
    "rows": [],
    "corrections": {}
  }
}
```

## GET /api/v1/workspaces/{workspaceId}/imports/batches/{batchId}

**Purpose:** Read imports / batches within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `batchId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `cursor`      | query    | No       | `integer or null`; minimum: 0                                                             |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                           |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `ImportBatchDetail`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                     |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/batches/c57e2ee3-0652-4096-8e32-5498ffbef671 HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "batch": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
    "namespace": "Fictional example",
    "filename": "Fictional example",
    "fileHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "adapterId": "113639b8-30d7-45c3-8d6e-6dd4e968a434",
    "adapterVersion": "1",
    "revision": 1,
    "state": "staged",
    "rowCount": 0,
    "createdAt": "2026-10-20T09:00:00.000000Z",
    "preview": {
      "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
      "batchRevision": 1,
      "sourceRevision": "1",
      "groups": ["1"],
      "committable": false,
      "rows": [],
      "corrections": {}
    }
  },
  "rows": [],
  "nextCursor": null,
  "groups": [],
  "history": []
}
```

## POST /api/v1/workspaces/{workspaceId}/imports/batches/{batchId}/commit

**Purpose:** Submit batches / commit within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `batchId`         | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ImportCommitRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation                                                              |
| ------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `expectedRevision` | Yes      | `integer`                                                                                 |
| `previewId`        | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `acceptWarnings`   | No       | `boolean`                                                                                 |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `ImportBatchResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/batches/c57e2ee3-0652-4096-8e32-5498ffbef671/commit HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 69135f97-4353-4ecb-8320-d5960c49e472
Content-Type: application/json

{
  "expectedRevision": 1,
  "previewId": "6cd690d2-cc8b-4765-8594-49fe0c43c3d7"
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "namespace": "Fictional example",
  "filename": "Fictional example",
  "fileHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "adapterId": "113639b8-30d7-45c3-8d6e-6dd4e968a434",
  "adapterVersion": "1",
  "revision": 1,
  "state": "staged",
  "rowCount": 0,
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "preview": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "batchRevision": 1,
    "sourceRevision": "1",
    "groups": ["1"],
    "committable": false,
    "rows": [],
    "corrections": {}
  }
}
```

## POST /api/v1/workspaces/{workspaceId}/imports/batches/{batchId}/preview

**Purpose:** Submit batches / preview within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `batchId`         | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ImportPreviewRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation        |
| ------------------ | -------- | ----------------------------------- |
| `expectedRevision` | Yes      | `integer`                           |
| `groups`           | Yes      | `array`; minItems: 1; maxItems: 100 |
| `corrections`      | No       | `object`                            |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler. UUID Idempotency-Key parsed by API but preview service does not receive/use it; do not promise durable replay

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                               |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `ImportPreviewResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/batches/c57e2ee3-0652-4096-8e32-5498ffbef671/preview HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: b24f65a6-18dd-456c-89a7-94059193e949
Content-Type: application/json

{
  "expectedRevision": 1,
  "groups": [
    "1"
  ]
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "batchRevision": 1,
  "sourceRevision": "1",
  "groups": ["1"],
  "committable": false,
  "rows": [],
  "corrections": {}
}
```

## POST /api/v1/workspaces/{workspaceId}/imports/batches/{batchId}/reverse

**Purpose:** Submit batches / reverse within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `batchId`         | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ImportReverseRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field         | Required | Type / structural validation           |
| ------------------ | -------- | -------------------------------------- |
| `expectedRevision` | Yes      | `integer`                              |
| `reason`           | Yes      | `string`; minLength: 1; maxLength: 160 |

**Validation:** JSON transport ceiling 65536 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                             |
| ----------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `ImportBatchResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/batches/c57e2ee3-0652-4096-8e32-5498ffbef671/reverse HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 5d2f714c-402f-4977-822d-5c18fa27e508
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
  "accountId": "e05f5218-c402-42bc-8b94-6406eae60221",
  "namespace": "Fictional example",
  "filename": "Fictional example",
  "fileHash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "adapterId": "113639b8-30d7-45c3-8d6e-6dd4e968a434",
  "adapterVersion": "1",
  "revision": 1,
  "state": "staged",
  "rowCount": 0,
  "createdAt": "2026-10-20T09:00:00.000000Z",
  "preview": {
    "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
    "batchRevision": 1,
    "sourceRevision": "1",
    "groups": ["1"],
    "committable": false,
    "rows": [],
    "corrections": {}
  }
}
```

## GET /api/v1/workspaces/{workspaceId}/imports/batches/{batchId}/source

**Purpose:** Read batches / source within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `batchId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                                                                                                                                                      |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `text/plain`               | `string`; format: binary; Authorized original UTF-8 source bytes, including any untrusted formulas; private plain-text attachment with an inert .source.txt filename. Original filename and source hash remain in batch metadata. Not a sanitized spreadsheet export. |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                                                                                                                                                |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                                                                                                                                                                |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/batches/c57e2ee3-0652-4096-8e32-5498ffbef671/source HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

```http
HTTP/1.1 200
Content-Type: text/plain

<authorized download bytes; not a JSON DTO>
```

## GET /api/v1/workspaces/{workspaceId}/imports/catalog

**Purpose:** Read imports / catalog within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                               |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 200         | `application/json`         | `ImportCatalogResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                         |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/catalog HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "accounts": [],
  "currencies": [],
  "instruments": [],
  "adapters": []
}
```

## GET /api/v1/workspaces/{workspaceId}/imports/templates

**Purpose:** Read imports / templates within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** None.

**Validation:** The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                 |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `ImportTemplatesResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
| 401         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 404         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |
| 409         | `application/problem+json` | `object`; Safe problem details; no credentials or database diagnostics                                                           |

Problem responses use the [common error envelope and guard semantics](../api-reference.md#errors). Declared statuses do not enumerate every business error code; fixed source codes and HTTP guards remain authoritative.

**Example request:**

```http
GET /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/templates HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "items": []
}
```

## POST /api/v1/workspaces/{workspaceId}/imports/templates

**Purpose:** Submit imports / templates within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ImportTemplateCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                |
| ----------------- | -------- | ------------------------------------------------------------------------------------------- |
| `name`            | Yes      | `string`; minLength: 1; maxLength: 160                                                      |
| `mapping`         | Yes      | `ImportMapping`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `archived`        | No       | `boolean`                                                                                   |
| `expectedVersion` | No       | `integer`; minimum: 0                                                                       |

**Validation:** JSON transport ceiling 131072 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `ImportTemplateResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/templates HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 20e2d3a3-d883-475b-8fe4-a075db91b636
Content-Type: application/json

{
  "name": "Fictional example",
  "mapping": {
    "version": "canonical-import/1",
    "adapterId": "generic-csv",
    "adapterVersion": "1",
    "conventions": {
      "delimiter": ";",
      "decimalSeparator": ",",
      "thousandsSeparator": ".",
      "dateFormat": "dmy",
      "timezone": "Europe/Madrid"
    },
    "kind": "cash_movement",
    "sourceIdColumn": "ID",
    "fields": [
      {
        "target": "orderingKey",
        "column": "Sequence",
        "transform": "text"
      },
      {
        "target": "economicAt",
        "column": "Date",
        "transform": "instant",
        "empty": "error"
      },
      {
        "target": "amount",
        "column": "Amount",
        "transform": "decimal",
        "empty": "error"
      },
      {
        "target": "currencyId",
        "constant": "00000000-0000-4000-8000-000000000002"
      },
      {
        "target": "kind",
        "column": "Type",
        "values": {
          "Deposit": "deposit",
          "Withdrawal": "withdrawal"
        },
        "empty": "error"
      }
    ]
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "templateId": "9238906e-5e24-4687-8a7a-15dd8b3a51a9",
  "name": "Fictional example",
  "version": 1,
  "mapping": {
    "version": "canonical-import/1",
    "adapterId": "generic-csv",
    "adapterVersion": "1",
    "conventions": {
      "delimiter": ";",
      "decimalSeparator": ",",
      "thousandsSeparator": ".",
      "dateFormat": "dmy",
      "timezone": "Europe/Madrid"
    },
    "kind": "cash_movement",
    "sourceIdColumn": "ID",
    "fields": [
      {
        "target": "orderingKey",
        "column": "Sequence",
        "transform": "text"
      },
      {
        "target": "economicAt",
        "column": "Date",
        "transform": "instant",
        "empty": "error"
      },
      {
        "target": "amount",
        "column": "Amount",
        "transform": "decimal",
        "empty": "error"
      },
      {
        "target": "currencyId",
        "constant": "00000000-0000-4000-8000-000000000002"
      },
      {
        "target": "kind",
        "column": "Type",
        "values": {
          "Deposit": "deposit",
          "Withdrawal": "withdrawal"
        },
        "empty": "error"
      }
    ]
  },
  "archived": false
}
```

## POST /api/v1/workspaces/{workspaceId}/imports/templates/{templateId}/versions

**Purpose:** Submit templates / versions within the authorized scope. See the linked handler for business semantics.

**Implementation:** [handler](../../../packages/server/src/imports/api.ts); [validation schemas](../../../packages/contracts/src/imports.ts).

**Authentication:** Valid cookie session required.

**Authorization:** editor; current workspace membership and tenant context are checked where workspace-scoped. Exact canonical Origin required. Session-bound X-CSRF-Token required. UUIDv4 Idempotency-Key required. Retain the same key and payload only for the same command retry.

**Request parameters:**

| Name              | Location | Required | Type / structural validation                                                              |
| ----------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId`     | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `templateId`      | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `Origin`          | header   | Yes      | `string`; format: uri                                                                     |
| `X-CSRF-Token`    | header   | Yes      | `string`; minLength: 1                                                                    |
| `Idempotency-Key` | header   | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `ImportTemplateCreate`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field        | Required | Type / structural validation                                                                |
| ----------------- | -------- | ------------------------------------------------------------------------------------------- |
| `name`            | Yes      | `string`; minLength: 1; maxLength: 160                                                      |
| `mapping`         | Yes      | `ImportMapping`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `archived`        | No       | `boolean`                                                                                   |
| `expectedVersion` | No       | `integer`; minimum: 0                                                                       |

**Validation:** JSON transport ceiling 131072 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `ImportTemplateResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/imports/templates/9238906e-5e24-4687-8a7a-15dd8b3a51a9/versions HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Origin: https://journal.example.test
X-CSRF-Token: <session-bound CSRF proof>
Idempotency-Key: 50dce108-7ca2-48f4-8dc0-9137aaefdcf9
Content-Type: application/json

{
  "name": "Fictional example",
  "mapping": {
    "version": "canonical-import/1",
    "adapterId": "generic-csv",
    "adapterVersion": "1",
    "conventions": {
      "delimiter": ";",
      "decimalSeparator": ",",
      "thousandsSeparator": ".",
      "dateFormat": "dmy",
      "timezone": "Europe/Madrid"
    },
    "kind": "cash_movement",
    "sourceIdColumn": "ID",
    "fields": [
      {
        "target": "orderingKey",
        "column": "Sequence",
        "transform": "text"
      },
      {
        "target": "economicAt",
        "column": "Date",
        "transform": "instant",
        "empty": "error"
      },
      {
        "target": "amount",
        "column": "Amount",
        "transform": "decimal",
        "empty": "error"
      },
      {
        "target": "currencyId",
        "constant": "00000000-0000-4000-8000-000000000002"
      },
      {
        "target": "kind",
        "column": "Type",
        "values": {
          "Deposit": "deposit",
          "Withdrawal": "withdrawal"
        },
        "empty": "error"
      }
    ]
  }
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "id": "a5614527-0ce6-43be-8d1d-d012b7394867",
  "templateId": "9238906e-5e24-4687-8a7a-15dd8b3a51a9",
  "name": "Fictional example",
  "version": 1,
  "mapping": {
    "version": "canonical-import/1",
    "adapterId": "generic-csv",
    "adapterVersion": "1",
    "conventions": {
      "delimiter": ";",
      "decimalSeparator": ",",
      "thousandsSeparator": ".",
      "dateFormat": "dmy",
      "timezone": "Europe/Madrid"
    },
    "kind": "cash_movement",
    "sourceIdColumn": "ID",
    "fields": [
      {
        "target": "orderingKey",
        "column": "Sequence",
        "transform": "text"
      },
      {
        "target": "economicAt",
        "column": "Date",
        "transform": "instant",
        "empty": "error"
      },
      {
        "target": "amount",
        "column": "Amount",
        "transform": "decimal",
        "empty": "error"
      },
      {
        "target": "currencyId",
        "constant": "00000000-0000-4000-8000-000000000002"
      },
      {
        "target": "kind",
        "column": "Type",
        "values": {
          "Deposit": "deposit",
          "Withdrawal": "withdrawal"
        },
        "empty": "error"
      }
    ]
  },
  "archived": false
}
```
