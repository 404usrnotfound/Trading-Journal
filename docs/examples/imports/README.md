# Import examples

These are documented **application examples**, not exports from a real broker. Use a dedicated paper account and review every dry run. No financial facts are seeded automatically.

The UUID `00000000-0000-4000-8000-000000000002` is a syntactically valid **placeholder**. Replace it in the mapping/CSV with an actual currency ID from the selected workspace's financial catalog before staging. Select an existing account in the Imports screen. Account ID is assigned by the batch. The importer obtains a default settled cash bucket if omitted.

| File                                                       | Use                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [generic-cash.csv](generic-cash.csv)                       | Semicolon-separated, decimal-comma cash source with stable IDs and explicit ordering.                   |
| [generic-cash.mapping.json](generic-cash.mapping.json)     | Complete `generic-csv@1` mapping; paste into Advanced mapping after replacing the currency ID.          |
| [canonical-cash.csv](canonical-cash.csv)                   | Same economics in `canonical-csv@1` with a JSON payload per row. Replace both placeholder currency IDs. |
| [canonical-cash.mapping.json](canonical-cash.mapping.json) | Selects the canonical interchange adapter and comma delimiter.                                          |

Both sources represent a `1000` deposit and a `-100` withdrawal. Under `Europe/Madrid`, their local instants normalize to `2026-10-12T07:30:00.000000Z` and `2026-10-13T12:00:00.000000Z`; net external cash is `900` in the selected currency. These flows are not trading profit. The generic source's Memo column is deliberately retained as an unmapped-column warning; acknowledge it only after review.

Use the same namespace and account for these two sources if testing cross-adapter duplicate detection: their IDs/kinds and normalized payloads match, so committing the second source creates no new financial facts. File and adapter names are not duplicate identities. Use a separate namespace only when the source really represents separate economic events.

Select both groups, preview and inspect exact payloads/errors before commit. To test a changed stable ID, change an amount while retaining its ID, stage again and review the offered correction with a reason. Do not turn a correction into a new event by changing the source namespace. Safe cash reversal is available only before outside financial activity or prior corrections create a blocked dependency; it appends inverse postings rather than deleting history.

See [imports](../../imports.md) for the canonical kinds, mapping options, bounds, API and adapter-extension checklist. These examples contain no credentials or personal data and must not be imported into a real account merely to explore the interface.
