# System requirements

Reviewed on **25 October 2026** against documentation baseline
`d7e5637f5c1619f8f7acc2f73f72adba41a43212` and application baseline
`5132900a03efabaeb307787531546987228220e7`. This reference explains which
environment the local setup needs. The [environment inventory](../environment-inventory.md)
owns the complete version, variable and command inventory; the
[feature inventory](../feature-inventory.md) owns current application capabilities.

## Supported and verified platforms

| Platform                                                 | Status and installation boundary                                                                                                                                                                                               | Evidence                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux x86_64                                             | **Freshly passed** for the Checkpoint 2 source/Compose installation, local development and built assets on Linux x86_64; older release/application evidence remains historical. An actual production host is still unverified. | [Checkpoint 2 verification](verification.md), [retained local readiness evidence](../production-readiness-evidence.json), [deployment shape](../deployment.md#supported-deployment-shape), [Phase 18 remediation results](../final-audit.md#remediation-outcome--24-october-2026) |
| Ubuntu 24.04 CI                                          | **Source-reviewed** configured runner with pinned Node, Corepack/pnpm, Compose databases and Chromium. Configuration alone does not establish a successful hosted run.                                                         | [CI workflow](../../.github/workflows/ci.yml)                                                                                                                                                                                                                                     |
| macOS                                                    | Claimed as a development option in the earlier README, but **Not run** in the retained platform evidence. No macOS version, architecture or full setup acceptance is established.                                              | [Checkpoint 1 platform inventory](../environment-inventory.md#operating-systems-and-installation-forms)                                                                                                                                                                           |
| Native Windows                                           | **Not run**; a complete supported installation is not established. The launcher has Windows process cleanup, while web package scripts use POSIX shell expansion and the private store requires POSIX filesystem behavior.     | [Process handling](../../scripts/processes.ts), [web manifest](../../apps/web/package.json), [private store](../../packages/server/src/storage.ts)                                                                                                                                |
| Other architectures or Windows-hosted Linux environments | **Not run** as complete installations. A dependency offering a platform binary is not evidence that the application, storage and database workflows passed on that platform.                                                   | [Locked dependencies](../../pnpm-lock.yaml), [retained environment evidence](../production-readiness-evidence.json)                                                                                                                                                               |

Use the tested Linux path when choosing an environment for these instructions.
The platform distinctions above also apply to installation troubleshooting and
browser checks; they are not a cross-platform certification.

## Toolchain and software

| Requirement                         | Version or condition                                                                                                                                                                                                                                                           | Source                                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source checkout                     | Complete workspace, including `apps`, `packages`, `scripts`, migration files and root manifests. Git access is needed to obtain the repository; no Git client version is pinned.                                                                                               | [Workspace layout](../../pnpm-workspace.yaml), [release source checks](../../scripts/release-check.ts)                                                                                                                              |
| Node.js                             | **24.19.0** for the documented and release-verified path. The manifest admits `>=24 <25`, but the release verifier requires the exact pin.                                                                                                                                     | [.node-version](../../.node-version), [.nvmrc](../../.nvmrc), [root manifest](../../package.json), `inspectReleaseSources` in [release checks](../../scripts/release-check.ts)                                                      |
| Corepack and pnpm                   | Corepack must be available; it selects **pnpm 10.34.6** from `packageManager`. The declared pnpm engine is `>=10 <11`; other versions and npm/Yarn installations are not the verified path.                                                                                    | [Root manifest](../../package.json), [CI package-manager setup](../../.github/workflows/ci.yml)                                                                                                                                     |
| Locked workspace dependencies       | Install the complete frozen dependency graph. Operator/startup scripts use `tsx` and workspace sources, so the documented source release also retains development dependencies. Native dependencies must load on the selected platform.                                        | [Lockfile](../../pnpm-lock.yaml), [.npmrc](../../.npmrc), [launchers](../../scripts/run.ts), [deployment release requirements](../deployment.md#prepare-a-release)                                                                  |
| PostgreSQL                          | **Major 17 only**. Migration and readiness code reject earlier/later majors. Current application schema is **17**, with reviewed migrations `0000`–`0016`. PostgreSQL **17.11** appears in retained local readiness evidence; the Compose image digest is the image authority. | [Migration runner](../../packages/database/src/migrate.ts), [readiness checks](../../packages/database/src/readiness.ts), [migration journal](../../packages/database/migrations/meta/_journal.json), [Compose](../../compose.yaml) |
| Docker Engine and Docker Compose    | Required for the repository's database startup commands, with the daemon running and accessible to the current user. Compose **v2** is the documented interface; no exact Engine/Compose version is pinned.                                                                    | [Database scripts](../../package.json), [Compose services](../../compose.yaml), [repository prerequisites](../../README.md)                                                                                                         |
| Chromium and its platform libraries | Required for Playwright browser tests, not for starting the local web/worker processes. CI installs the browser associated with the locked Playwright version; a system executable override exists but does not establish compatibility for arbitrary browsers.                | [Playwright configuration](../../playwright.config.ts), [CI browser setup](../../.github/workflows/ci.yml)                                                                                                                          |

The delivered application is a TypeScript workspace with a Next.js/React web and
API process, a separate Node worker and PostgreSQL. Framework/library pins belong
in the [environment inventory](../environment-inventory.md#languages-frameworks-and-dependency-management)
and the manifests; they are not separate system-wide installations. Python, Redis,
a broker API, a market-data subscription, SMTP, an AI provider and an object-store
subscription are not requirements for implemented local workflows.

The supplied Compose file runs **database services only**. Both use the
digest-pinned `postgres:17-bookworm` image. There is no supplied application
Dockerfile, reviewed production application image or complete application Compose
stack. The supported source release includes the full installed workspace and its
build outputs; the Next standalone directory or worker output alone is not a
complete installation. See [deployment](../deployment.md#supported-deployment-shape).

An already provisioned PostgreSQL 17 service can supply the configured database
URLs; the application driver is not tied to Docker. Its migration privileges,
runtime identities and schema must meet the same checks. The repository does not
provide a native PostgreSQL installer or validate every external service's
defaults. The local Compose path supplies the development and separate test
instances described below.

## Services, ports and network access

These are the defaults from the [configuration template](../../.env.example),
[initializer](../../scripts/env-init.ts), [Compose](../../compose.yaml) and
[Playwright configuration](../../playwright.config.ts). Reserve them before using
the default local setup. Port changes must keep the application origin and service
bindings consistent.

| Listener               | Default                                                          | Access and purpose                                                                                                      |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Web/API                | `127.0.0.1:3000`; canonical local origin `http://localhost:3000` | Browser/application requests. The browser origin and `APP_ORIGIN` must agree for authentication and Origin/CSRF checks. |
| Worker health          | `127.0.0.1:3101`                                                 | Separate worker liveness/readiness, not a public API.                                                                   |
| Development PostgreSQL | `127.0.0.1:5432`                                                 | Compose publishes container port `5432`; the development database uses a named volume.                                  |
| Test PostgreSQL        | `127.0.0.1:5433`                                                 | Separate Compose service, also using container port `5432`; test data uses `tmpfs`.                                     |
| Browser-test web/API   | `localhost:3002`                                                 | Dedicated Playwright server; configurable through `E2E_PORT`. It must not reuse an existing server.                     |

Installation needs network access to the repository, package-manager/dependency
downloads and the pinned container image. Browser setup additionally needs the
Playwright browser download and its platform packages. An existing verified cache
can reduce downloads; an offline installation is not guaranteed simply because a
previous check used a package cache. Keep normal certificate and package-integrity
verification enabled; corporate proxy/CA settings belong to the host environment.
Sources: [CI setup](../../.github/workflows/ci.yml), [lockfile](../../pnpm-lock.yaml)
and [Compose image](../../compose.yaml).

Once installed, core local workflows communicate with the local web/API,
PostgreSQL and private filesystem. They do not require live broker or pricing
services. Dependency advisory checks, Git operations and optional browser/package
installation can still require outbound network access.

Public hosting adds a trusted HTTPS reverse proxy, a canonical HTTPS
`APP_ORIGIN`, supervised web/worker processes and private database/health
listeners. The production configuration parser requires HTTPS. Actual public
DNS, certificates, proxy behavior and database TLS require host-specific
verification; local loopback HTTP is not production approval. See the
[deployment requirements](../deployment.md#configuration-and-secrets).

## Filesystem, permissions and database identities

The account running the local setup needs permission to create the checkout's
dependency/build/cache files, its ignored private configuration and its private
media directory. The repository initializer creates a new `.env` with mode `0600`
and `.private/storage` with mode `0700`; it preserves an existing `.env`. Docker
access is required for the Compose path, and browser platform-package installation
may require host administrator privileges. An elevated application runtime is not
required by these documented paths. Sources: [initializer](../../scripts/env-init.ts),
[CI](../../.github/workflows/ci.yml) and [default ports](../../.env.example).

The private store requires a persistent POSIX filesystem that supports restrictive
file/directory modes, no-follow opens, hard-link publication on the same volume
and file/directory synchronization. Its root and ancestors must be controlled by
the operator. Storage beneath public/build paths, a filesystem root or an
existing symlink is rejected. A network/shared filesystem, a read-only release
filesystem and multiple web replicas are not certified by the local checks.
The [private-store implementation](../../packages/server/src/storage.ts) and
[deployment storage boundary](../deployment.md#supported-deployment-shape) define
these constraints. PostgreSQL data and private media both need durable storage
for normal development; the test database is deliberately disposable.

Migration uses a separate operator connection. Runtime uses the distinct
`journal_app`, `journal_auth` and `journal_jobs` identities provisioned by the
[migration tooling](../../packages/database/src/migrate.ts). Their URLs must refer
to the intended database with the required restricted grants; an arbitrary
administrator URL is not a runtime substitute. Tests require separate `TEST_*`
bindings targeting a database ending `_test`, distinct from development. The
[test binding validator](../../scripts/environment.ts) enforces that separation.
Secrets and their variable names are covered by the
[environment inventory](../environment-inventory.md#environment-variables).

## Hardware and storage planning

**No validated universal CPU, RAM, free-disk or concurrent-user minimum is
published.** The application can reject bounded scopes, and production capacity
remains open under [FA-04](../final-audit.md#remediation-outcome--24-october-2026).
The workload-specific [performance measurements](../performance.md) are evidence
for their stated datasets and machines, not an installation sizing guarantee.

Estimate capacity from the actual work to be retained:

- Allow space for the source, pnpm store/dependency graph, production builds and
  any retained browser binaries, traces and test reports. These are separate
  consumers; the repository defines no stable combined byte count.
- Include PostgreSQL tables, indexes and transaction logs, private attachment
  bytes, and space for backups or parallel release directories when used. Media
  grows independently of the database. The per-object **10 MiB** attachment limit
  in the [attachment contract](../../packages/contracts/src/strategy-attachments.ts)
  is an input bound, not a total storage allowance.
- Account for the web process, separate worker, PostgreSQL, concurrent build/test
  processes and the test service's memory-backed data. The Compose file supplies
  no application resource reservation or tested host-memory minimum.
- Measure representative report and media workloads before selecting production
  hardware or accepting concurrent-reader and recovery targets. Request/archive
  limits and small-fixture test success do not establish those budgets.

## Verification scope

**Source-reviewed:** versions, platform boundaries, ports, filesystem conditions
and permissions above come from the linked files at the reviewed baseline.
**Historically passed:** the retained Linux readiness rehearsal and Phase 18
results support their stated local build/application scope. These results do not
verify macOS, native Windows, every Linux distribution, actual production hosting
or the FA-04 capacity targets.

Fresh Checkpoint 2 outcomes are recorded in [installation verification](verification.md):
a clean source checkout, isolated Compose databases, migrations and owner setup,
local development, production build/release checks and local built-asset startup.
Only the stated Linux host and scoped workflows were exercised. Other commands
and environments remain **Not run** unless individually recorded there.
