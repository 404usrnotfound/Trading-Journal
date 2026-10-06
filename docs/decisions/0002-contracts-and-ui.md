# ADR 0002: Explicit HTTP contracts and bounded browser state

- Status: Accepted in Phase 1; documentation baseline, not currently implemented
- Date: 2026-10-06
- Resolves: requirements-analysis D-01 API/UI portions, D-16 query contract, D-18

## Context

The journal needs typed interactions, import/backup interoperability, traceable financial reports, consistent filtering and accessible charts. Database types are not safe public payloads: they contain tenant/internal fields and numeric values that must retain decimal precision. UI state must not become a parallel accounting engine.

## Decision

### API and validation

Use versioned **REST-style JSON over HTTPS**, served by Next Node route handlers under `/api/v1`. Authentication routes stay in the auth library's namespace. Route handlers perform protocol/session parsing and delegate to application commands/queries; they contain no accounting logic. Server-rendered pages may call the same authorized query services directly, using identical schemas and context, without loopback HTTP.

- Zod 4 defines strict input/output schemas in `packages/contracts`. Unknown write fields are rejected. Validate bodies, parameters, query filters, pagination, files, external provider results, and environment config at trust boundaries. Validate semantic invariants in domain/services and enforce persistent invariants in PostgreSQL as well.
- Monetary amounts, prices, quantities, rates and ratios travel as **canonical decimal strings**, never JSON numbers. IDs are opaque UUID strings; timestamps are offset-explicit RFC 3339 strings with separately retained source metadata. Missing metrics use a discriminated result with reason and provenance; no `NaN`/`Infinity` JSON values or zero substitutes.
- Generate OpenAPI 3.1 using `@asteasolutions/zod-to-openapi` 9 and typed client definitions using `openapi-typescript` 7; use `openapi-fetch` for the browser's small API client. These lines support Zod 4 and TypeScript 5.x. Keep schemas/operations authoritative and fail CI on generated-contract drift.
- Response bodies expose allowlisted DTOs, not raw Drizzle rows, auth objects or source-file internals. Public errors follow RFC 9457 problem details with stable domain code, safe message, field issues and request ID; never include SQL or secrets.
- Namespace operations by workspace (`/api/v1/workspaces/{workspaceId}/...`). The server checks authenticated membership, action capability and object ownership; a URL does not grant access.
- Use cursor/keyset pagination with stable sort plus ID tie-breaker, explicit allowlisted filters/sort fields and a maximum page size of 200 (default 50). Opaque cursors encode validated filter/sort context; they never substitute for authorization. Bounded date-series endpoints return aggregation resolution and source coverage, not all fills.
- Financial commands require a client-generated idempotency key. Store a unique workspace/actor/operation/key record and normalized request hash in the same database transaction as the outcome. Same key/body returns the original outcome; changed body returns conflict. Non-financial editable drafts use a revision/ETag and `If-Match`; stale updates return 409 or 412 instead of losing another edit.
- Synchronous committed commands return 200/201 only after financial invariants hold. Heavy jobs return 202 plus a tenant-authorized job resource; progress polling must distinguish queued/running/failed/canceled/completed. A job accepted is not a financial activity committed.

### Frontend

Use React server components for authenticated page composition and initial bounded reads. Use client components only for interactive tables, forms, dialogs, filters and charts. Disable cross-user caching of private route data; if caching is introduced, key it by workspace, permission scope, filters and source/calculation revisions.

Choose Tailwind CSS 4 and Radix primitives for a small application-owned design system, Lucide icons, React Hook Form with a Zod-compatible resolver, and TanStack Table's compatible stable line (currently 9). Do not turn every product screen into a bespoke component library. Audit focus management, dialog labels, keyboard navigation, responsive layouts, light/dark tokens and non-color status indicators against core WCAG 2.2 AA journeys.

Use **TanStack Query 5** for remote state, mutation completion and invalidation. A request-scoped server query client may dehydrate only authorized data; a browser query client is cleared on logout/workspace switch. Query keys include workspace, account/date/reporting-currency filters, metric population and source/calculation revision. The URL is authoritative for shareable filters; PostgreSQL preferences store views/theme/timezone/columns. Local React state holds transient controls, React Hook Form holds drafts, and journal autosave persists server-side with optimistic concurrency. No Redux/Zustand/global client financial store is initially needed.

Never optimistically fabricate posted balances, P&L or completed fills. Optimistic feedback is limited to reversible non-financial drafts/preferences with rollback/conflict UI. Financial commands invalidate/refetch their dependent state after commit, and show stale/rebuilding projections explicitly.

### Charts and numerical presentation

Choose **Recharts 3** for React/SVG analytics charts. Series come from bounded server queries with shared filters, units, metric definitions, source/coverage/status and observation/record drill-down IDs. Each chart has an accessible table alternative and useful empty/loading/error states. Recharts' accessibility features do not replace keyboard/manual WCAG verification.

The render adapter may convert decimals to finite JavaScript numbers only for chart geometry, checking representability; financial values/tooltips/tables retain the original decimal strings. Where geometry cannot represent a value safely, return a labeled unsupported plotting state or documented rescaling, never recompute authoritative metrics with floats. Format exact monetary text without first converting it to a lossy number. Dates use locale-aware formatting and the chosen IANA timezone.

## Alternatives considered

- **tRPC only:** excellent TypeScript inference, but a documented HTTP/OpenAPI contract is clearer for import tooling, backup clients and future consumers outside the TS frontend.
- **GraphQL:** unnecessary resolver/query-complexity overhead for the initially bounded UI/query contracts.
- **Server actions for durable writes:** avoid multiple command transport paths and framework-specific idempotency/error semantics. Server actions may be added later only as thin clients of the same command services.
- **Redux/global entity cache:** duplicates server-derived accounting state and complicates stale/correction handling without a current need.
- **Canvas-first/custom chart engine:** more rendering/accessibility work than current histories require; revisit only on measured plotting limits.

## Consequences

Contract generation adds a checked build step but makes requests and documentation independently inspectable. REST typed clients provide compile-time help, while runtime validation remains mandatory. Keyset pagination restricts arbitrary page jumps; exports handle whole datasets as jobs. Libraries aid interaction but the application owns currency correctness, provenance and accessibility.

## Validation required

Contract round trips for extreme decimal inputs, unknown fields and unavailable/infinite metrics; no generated-schema drift; cross-workspace cache and API authorization tests; duplicate/conflicting commands; concurrent journal autosaves; filter consistency across tables/charts/exports; keyboard/axe checks and manual desktop/mobile inspection. Verify chart values never feed financial calculations.

## References

- [Requirements analysis](../requirements-analysis.md), OE, FX, AN, UX and D-01/D-16/D-18
- [Zod documentation](https://zod.dev/)
- [Zod-to-OpenAPI official repository](https://github.com/asteasolutions/zod-to-openapi)
- [OpenAPI TypeScript/client repository](https://github.com/openapi-ts/openapi-typescript)
- [TanStack Query documentation](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Table documentation](https://tanstack.com/table/latest)
- [Recharts documentation](https://recharts.org/)
- [Radix primitives](https://www.radix-ui.com/primitives)
