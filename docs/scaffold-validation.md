# Scaffold validation

The user-authorized Phase 3 scaffold corresponds to the original development plan's Phase 2 platform increment. **All eight required clean-environment gates passed on 2026-10-06.** No financial/product feature implementation was started.

## Clean environment

A separate source directory was populated from versionable repository files, excluding `.git`, `node_modules`, `.next`, `dist`, `.env`, caches and private data. Frozen installation created new dependencies using the verified pnpm package cache; the lockfile remained byte-for-byte unchanged. No application build output or database state was reused.

`env:init` generated new credentials. A unique Compose project created fresh PostgreSQL volumes on ports 55432/55433. Development/built web startup used port 3300, worker health 3311, and the separate browser test server 3302. The temporary database containers/volumes were removed after verification; the development database was preserved. No credential values are recorded here.

| Component                    | Verified version                                  |
| ---------------------------- | ------------------------------------------------- |
| Node.js                      | 24.19.0                                           |
| Corepack-selected pnpm       | 10.34.6                                           |
| Next.js / React / TypeScript | 16.3.8 / 19.3.0 / 5.9.3                           |
| PostgreSQL                   | 17.11, pinned official image digest in Compose    |
| Browser                      | System Chromium 151.0.7922.173, Playwright 1.63.0 |

## Required gates

All commands ran from the fresh source directory using Corepack and the documented configuration.

| Gate                   | Command / observed evidence                                                                                                  | Result |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1. Install             | `corepack pnpm install --frozen-lockfile --store-dir /workspace/.cache/pnpm-store`; unchanged lockfile                       | Passed |
| 2. Start               | `corepack pnpm dev`, then `corepack pnpm start` after build; web and worker health, real sign-in, safe session, scoped reads | Passed |
| 3. Database connection | `corepack pnpm db:up` and `corepack pnpm db:check`; actual restricted application role and current schema                    | Passed |
| 4. Migrations          | `corepack pnpm db:migrate`, integration setup on fresh test DB, `corepack pnpm db:migrate:check`                             | Passed |
| 5. Tests               | `corepack pnpm test`: **24 unit + 24 PostgreSQL integration tests**; `corepack pnpm test:e2e`: **3 tests**                   | Passed |
| 6. Lint                | `corepack pnpm lint`, zero warnings/errors                                                                                   | Passed |
| 7. Type-check          | `corepack pnpm typecheck`, root and all seven workspaces                                                                     | Passed |
| 8. Build               | `corepack pnpm build`, domain, worker and production web artifacts; build required no credentials                            | Passed |

Additional gates passed: `api:check`, `format:check`, secure `user:create`, and two consecutive `db:seed` runs producing exactly one explicitly labeled empty demo workspace. Existing personal/demo workspaces remained readable after stopping the development processes and starting built processes. Both launchers released web/worker ports after SIGTERM, fixing an earlier orphan-process issue.

Unit checks cover environment safety, safe DTOs, origin/CSRF guards, error/log redaction and the private immutable filesystem adapter. Database integration checks exercise real app/auth/job credentials, forced RLS and composite ownership, context reset/rollback, revocation, concurrent owner retention, reviewed migration repeatability, authentication/cookies/rate limits and durable queue restart. They do not substitute for future independent financial fixtures.

Browser tests cover anonymous/blocked routes, real sign-in and safe sessions, reload, authorized empty overview, logout/revocation, responsive layout and automated axe WCAG checks. Sign-in was tested at 1440×1000 and 390×844 in both themes; overview was tested at both sizes. Captured desktop/mobile screens were visually inspected: readable controls, coherent layout, no horizontal overflow and clearly disabled future actions. Automated checks and this inspection do not constitute a complete manual screen-reader/keyboard audit or verification of future product flows.

## Evidence and environment limits

The clean-run logs, sanitized gate results and six screenshots are retained in `/tmp/trading-journal-clean-8aa873410a/` for this session. Screenshots are under `source/test-results/`; E2E tests capture equivalent screenshots on subsequent runs. This temporary evidence directory is not a committed deployment artifact.

The official Playwright Chromium download was blocked by HTTP 403 (`Domain forbidden`). Tests used the installed system browser through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; no TLS/signature verification was bypassed. Local built-web smoke tests use `next start` with development/test configuration; Next emits its standalone-output warning in this mode, while the routes and browser journeys pass. The production launcher selects the standalone artifact with production HTTPS configuration. A public TLS deployment was not performed.

Authentication rate limiting currently uses a conservative database-backed shared gateway bucket, stripping arbitrary forwarded IP headers. Production account/IP throttling and a trusted reverse-proxy client-IP contract remain operational gates. Private storage requires an operator-controlled root/ancestors; its filesystem checks reject existing symlinks and unsafe keys but do not promise protection from a privileged process replacing directories concurrently. File authorization remains the responsibility of future application services; no upload/download HTTP workflow exists.

## Scope and repository review

Created the frontend/API/worker workspace, shared domain/contracts/database/server/UI packages, reviewed platform migration, configuration template and validation, development/bootstrap/seed scripts, and lint/format/type/unit/integration/browser tooling. Updated README and architecture/progress/ADR status records. No files were deleted, and no commit or push was made.

Generated local credentials were checked against all versionable source files and were absent. `.env`, private storage, dependencies, caches, builds and test artifacts are ignored. The authoritative product prompt and requirements-analysis content were preserved.

The overview contains no fabricated financial statistics. Trading/account/broker/instrument/ledger/FX/strategy/risk/analytics/import/journal/attachment/backup workflows remain planned. Branded domain types and platform DTO checks are not an accounting engine. Product `AC-01`–`AC-16` remain planned; these checks provide only foundation evidence for `AC-14` and `AC-16`. Financial schemas, metric definitions and independent fixtures must pass their documented gates before financial writes.
