# Campaign analytics API

Generated from the [OpenAPI contract](../../../packages/contracts/openapi.json), source-backed [endpoint policy](endpoint-policy.json) and [fictional examples](examples.json). Reviewed application baseline: `5132900a03efabaeb307787531546987228220e7`; documentation baseline: `d9a96d7099a29b08bb7b055a64e17c0b7ab40e1c`.

Read the [shared transport, errors and validation rules](../api-reference.md) first. Examples are independently schema-checked illustrations, not live captures or a connected workflow. Fictional IDs must be replaced by authorized existing identities; session/CSRF placeholders are not credentials. Schema-valid JSON does not establish database references, source evidence, current revisions, hashes or financial eligibility.

| Method | Route                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------- |
| POST   | [`/api/v1/workspaces/{workspaceId}/analytics/reports`](#post-apiv1workspacesworkspaceidanalyticsreports) |

## POST /api/v1/workspaces/{workspaceId}/analytics/reports

**Purpose:** Read-only viewer/editor/owner campaign-attribution analytics. This bounded JSON query never writes financial revisions. Completed behavioral samples and lifetime-as-of monetary populations are explicit. Every metric declares its mathematical definition, unit, currency, sample and missing evidence; campaign drawdown is not an account equity return.

**Implementation:** [handler](../../../packages/server/src/analytics/api.ts); [validation schemas](../../../packages/contracts/src/analytics.ts).

**Authentication:** Valid cookie session required.

**Authorization:** viewer; current workspace membership and tenant context are checked where workspace-scoped. No key-based durable command replay is promised by this operation.

**Request parameters:**

| Name          | Location | Required | Type / structural validation                                                              |
| ------------- | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `workspaceId` | path     | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |

**Request body:** Required; `application/json`. `AnalyticsReportRequest`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)

| JSON field                  | Required | Type / structural validation                                                                          |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `suppliedCampaignResultIds` | No       | `array`; maxItems: 100                                                                                |
| `accountIds`                | Yes      | `array`; minItems: 1; maxItems: 100                                                                   |
| `reportingCurrencyId`       | Yes      | `FinancialId`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)             |
| `from`                      | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `to`                        | Yes      | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `sourceRevision`            | No       | `FinancialSourceRevision`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json) |
| `metadataAsOf`              | No       | `FinancialInstant`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)        |
| `timezone`                  | No       | `string`; minLength: 1; maxLength: 128; pattern: `^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$`  |
| `fxPolicy`                  | Yes      | `AccountingFxPolicy`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json)      |
| `priceMaxAgeMilliseconds`   | Yes      | `integer`; minimum: 0; maximum: 9007199254740991                                                      |
| `priceSourcePriority`       | Yes      | `array`; minItems: 1; maxItems: 64                                                                    |
| `groupBy`                   | No       | `array`; maxItems: 14                                                                                 |

**Validation:** JSON transport ceiling 262144 bytes; application/json and the bounded nesting guard apply. The named source Zod schemas enforce refinements/transforms beyond these structural tables. Service/SQL checks additionally enforce authorized references, optimistic revisions, effective conventions and domain invariants; use the [shared rules](../api-reference.md#validation-and-financial-boundaries) and linked handler.

**Responses and errors:**

| HTTP status | Media type                 | Schema / meaning                                                                                                                 |
| ----------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 200         | `application/json`         | `AnalyticsReportResponse`; canonical component in [OpenAPI](../../../packages/contracts/openapi.json); Validated application DTO |
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
POST /api/v1/workspaces/09707fa5-aaae-4493-8a23-827111000f89/analytics/reports HTTP/1.1
Host: journal.example.test
Cookie: <session cookie returned by sign-in>
Content-Type: application/json

{
  "accountIds": [
    "5eeec7a2-1167-4185-851c-e61f603a5d2e"
  ],
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
  ]
}
```

**Example response:**

HTTP 200; illustrative JSON, not an executed result:

```json
{
  "context": {
    "accountIds": ["5eeec7a2-1167-4185-851c-e61f603a5d2e"],
    "reportingCurrencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
    "from": "2026-10-20T09:00:00.000000Z",
    "to": "2026-10-21T13:00:00.000000Z",
    "sourceRevision": "1",
    "recordedAt": "2026-10-20T09:00:00.000000Z",
    "metadataAsOf": "2026-01-01T00:00:00.000000Z",
    "timezone": "UTC",
    "workspaceRevision": 1,
    "environment": "live",
    "fxPolicy": {
      "id": "1",
      "maxAgeMilliseconds": 0,
      "sourcePriority": ["1"]
    },
    "priceMaxAgeMilliseconds": 0,
    "priceSourcePriority": ["1"],
    "population": "campaign-attribution",
    "moneyPopulation": "selected-completed-and-open-lifetime-asof",
    "manifest": {
      "kernelVersion": "1",
      "instrumentModuleVersion": "1",
      "lotPolicyVersion": "1",
      "allocationPolicyVersion": "1",
      "fxPolicyVersion": "1",
      "roundingPolicyVersion": "1"
    }
  },
  "records": [],
  "summary": {
    "population": {
      "campaignIds": [],
      "completedIds": [],
      "openIds": [],
      "excludedIds": [],
      "eligibleOutcomeIds": [],
      "eligibleRIds": [],
      "eligibleDurationIds": []
    },
    "metrics": {
      "grossPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/grossPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "netPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/netPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "realizedPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/realizedPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "unrealizedPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/unrealizedPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "fees": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/fees/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "winRate": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/winRate/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "lossRate": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/lossRate/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageWinner": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/averageWinner/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageLoser": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/averageLoser/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "payoffRatio": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/payoffRatio/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "profitFactor": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/profitFactor/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "expectancy": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/expectancy/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "expectancyR": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "R",
        "currencyId": null,
        "definitionId": "campaign-analytics/expectancyR/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageR": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "R",
        "currencyId": null,
        "definitionId": "campaign-analytics/averageR/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "cumulativeR": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "R",
        "currencyId": null,
        "definitionId": "campaign-analytics/cumulativeR/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageHoldingDuration": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "seconds",
        "currencyId": null,
        "definitionId": "campaign-analytics/averageHoldingDuration/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "maximumDrawdown": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/maximumDrawdown/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "currentDrawdown": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/currentDrawdown/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "longestWinStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/longestWinStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "longestLossStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/longestLossStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "currentWinStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/currentWinStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "currentLossStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/currentLossStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      }
    },
    "counts": {
      "selected": 0,
      "completed": 0,
      "open": 0,
      "excluded": 0,
      "eligibleOutcomes": 0,
      "wins": 0,
      "losses": 0,
      "breakevens": 0,
      "eligibleR": 0,
      "eligibleDuration": 0
    },
    "curve": {
      "state": "available",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "definitionId": "campaign-cumulative-net-pnl/1",
      "points": [
        {
          "campaignId": null,
          "economicAt": "2026-10-20T08:59:59.999999Z",
          "cumulativePnl": "0",
          "peak": "0",
          "drawdown": "0"
        }
      ],
      "reasons": [],
      "excludedIds": []
    },
    "recovery": {
      "state": "no-drawdown",
      "peakAt": null,
      "troughAt": null,
      "recoveredAt": null,
      "peakCampaignId": null,
      "troughCampaignId": null,
      "recoveredCampaignId": null,
      "durationSeconds": null,
      "elapsedSeconds": null,
      "tradesToRecovery": null,
      "reasons": []
    }
  },
  "completedOnly": {
    "population": {
      "campaignIds": [],
      "completedIds": [],
      "openIds": [],
      "excludedIds": [],
      "eligibleOutcomeIds": [],
      "eligibleRIds": [],
      "eligibleDurationIds": []
    },
    "metrics": {
      "grossPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/grossPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "netPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/netPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "realizedPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/realizedPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "unrealizedPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/unrealizedPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "fees": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/fees/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "winRate": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/winRate/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "lossRate": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/lossRate/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageWinner": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/averageWinner/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageLoser": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/averageLoser/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "payoffRatio": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/payoffRatio/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "profitFactor": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/profitFactor/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "expectancy": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/expectancy/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "expectancyR": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "R",
        "currencyId": null,
        "definitionId": "campaign-analytics/expectancyR/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageR": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "R",
        "currencyId": null,
        "definitionId": "campaign-analytics/averageR/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "cumulativeR": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "R",
        "currencyId": null,
        "definitionId": "campaign-analytics/cumulativeR/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageHoldingDuration": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "seconds",
        "currencyId": null,
        "definitionId": "campaign-analytics/averageHoldingDuration/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "maximumDrawdown": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/maximumDrawdown/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "currentDrawdown": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/currentDrawdown/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "longestWinStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/longestWinStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "longestLossStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/longestLossStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "currentWinStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/currentWinStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "currentLossStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/currentLossStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      }
    },
    "counts": {
      "selected": 0,
      "completed": 0,
      "open": 0,
      "excluded": 0,
      "eligibleOutcomes": 0,
      "wins": 0,
      "losses": 0,
      "breakevens": 0,
      "eligibleR": 0,
      "eligibleDuration": 0
    },
    "curve": {
      "state": "available",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "definitionId": "campaign-cumulative-net-pnl/1",
      "points": [
        {
          "campaignId": null,
          "economicAt": "2026-10-20T08:59:59.999999Z",
          "cumulativePnl": "0",
          "peak": "0",
          "drawdown": "0"
        }
      ],
      "reasons": [],
      "excludedIds": []
    },
    "recovery": {
      "state": "no-drawdown",
      "peakAt": null,
      "troughAt": null,
      "recoveredAt": null,
      "peakCampaignId": null,
      "troughCampaignId": null,
      "recoveredCampaignId": null,
      "durationSeconds": null,
      "elapsedSeconds": null,
      "tradesToRecovery": null,
      "reasons": []
    }
  },
  "openOnly": {
    "population": {
      "campaignIds": [],
      "completedIds": [],
      "openIds": [],
      "excludedIds": [],
      "eligibleOutcomeIds": [],
      "eligibleRIds": [],
      "eligibleDurationIds": []
    },
    "metrics": {
      "grossPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/grossPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "netPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/netPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "realizedPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/realizedPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "unrealizedPnl": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/unrealizedPnl/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "fees": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/fees/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "winRate": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/winRate/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "lossRate": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/lossRate/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageWinner": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/averageWinner/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageLoser": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/averageLoser/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "payoffRatio": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/payoffRatio/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "profitFactor": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "ratio",
        "currencyId": null,
        "definitionId": "campaign-analytics/profitFactor/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "expectancy": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/expectancy/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "expectancyR": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "R",
        "currencyId": null,
        "definitionId": "campaign-analytics/expectancyR/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageR": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "R",
        "currencyId": null,
        "definitionId": "campaign-analytics/averageR/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "cumulativeR": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "R",
        "currencyId": null,
        "definitionId": "campaign-analytics/cumulativeR/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "averageHoldingDuration": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "seconds",
        "currencyId": null,
        "definitionId": "campaign-analytics/averageHoldingDuration/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "maximumDrawdown": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/maximumDrawdown/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "currentDrawdown": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "money",
        "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
        "definitionId": "campaign-analytics/currentDrawdown/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "longestWinStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/longestWinStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "longestLossStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/longestLossStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "currentWinStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/currentWinStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      },
      "currentLossStreak": {
        "state": "unavailable",
        "value": null,
        "knownSubtotal": null,
        "unit": "count",
        "currencyId": null,
        "definitionId": "campaign-analytics/currentLossStreak/1",
        "sampleSize": 0,
        "eligibleIds": [],
        "excludedIds": [],
        "reasons": ["empty_eligible_population"],
        "missingReferences": []
      }
    },
    "counts": {
      "selected": 0,
      "completed": 0,
      "open": 0,
      "excluded": 0,
      "eligibleOutcomes": 0,
      "wins": 0,
      "losses": 0,
      "breakevens": 0,
      "eligibleR": 0,
      "eligibleDuration": 0
    },
    "curve": {
      "state": "available",
      "currencyId": "cf2fbc4b-be8f-4ac3-8819-186cf25a6142",
      "definitionId": "campaign-cumulative-net-pnl/1",
      "points": [
        {
          "campaignId": null,
          "economicAt": "2026-10-20T08:59:59.999999Z",
          "cumulativePnl": "0",
          "peak": "0",
          "drawdown": "0"
        }
      ],
      "reasons": [],
      "excludedIds": []
    },
    "recovery": {
      "state": "no-drawdown",
      "peakAt": null,
      "troughAt": null,
      "recoveredAt": null,
      "peakCampaignId": null,
      "troughCampaignId": null,
      "recoveredCampaignId": null,
      "durationSeconds": null,
      "elapsedSeconds": null,
      "tradesToRecovery": null,
      "reasons": []
    }
  },
  "groups": [],
  "definitionVersion": "campaign-analytics/1"
}
```
