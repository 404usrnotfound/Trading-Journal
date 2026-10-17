# Production deployment

Phase 16 prepares the currently implemented application for deployment from
approved Phase 15 commit `ed901948463a9754f977d576160d8ebcc5eea918`. It does not
publish a service, provision a production host or certify an installation that
has not been exercised. Use the [readiness checklist](production-readiness-checklist.md)
and its recorded evidence before enabling traffic. The [operations guide](operations.md)
and [backup/recovery procedure](backup-and-recovery.md) are part of the release.

## Supported deployment shape

Use Linux, Node **24.19.0**, pnpm **10.34.6**, PostgreSQL **17**, a trusted HTTPS
reverse proxy, the Next.js web/API process, a separate worker and durable private
media. Web and worker must use the same reviewed source release and dependency
lock. No external broker, price feed, SMTP, AI or object-storage subscription is
required for the implemented workflows.

The repository supplies database-only development Compose services. It does not
supply a reviewed production application image, orchestration platform, DNS,
certificate issuance, external monitoring or managed backup service. Do not expose
that development Compose configuration as a production stack. A full versioned
source checkout with frozen-installed dependencies is the verified release form;
copying only `.next/standalone` or `apps/worker/dist` omits required deployment
assets, dependencies or migration tooling.

The implemented private store is local filesystem storage. Keep `STORAGE_ROOT`
on a persistent private mount and use a single web replica unless an equivalent
shared filesystem and its consistency/permission behavior have been verified.
An S3 adapter and portable workspace JSON export/restore remain deferred; the
operational PostgreSQL-plus-media recovery procedure is a separate capability.
The current worker processes infrastructure health probes, not business imports,
outbox dispatch, report offloading or projection rebuilds. Do not base a rollout
on those future workflows.

## Configuration and secrets

Inject secrets through the service manager or an approved secret store. Do not
ship `.env`, `.private`, `work`, dumps, logs, session cookies or test bindings in
a release artifact. `.env.example` describes local setup, not production values.
Tooling loads a repository `.env` if one exists without replacing already
injected variables; absence of that file in a production release prevents
accidental fallback to development bindings. Never print the environment or
place database URLs/passwords in shell arguments, process listings or tickets.

| Binding                                                                                      | Consumer                             | Production requirement                                                                                                                          |
| -------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                   | Web, worker, launchers               | `production`; built-assets HTTP test mode is not a production setting.                                                                          |
| `APP_ORIGIN`                                                                                 | Web/operator tools                   | The single canonical `https://` origin, with no credentials, path, query or fragment. Example non-secret shape: `https://journal.example.com`.  |
| `DATABASE_URL`                                                                               | Web                                  | Dedicated `journal_app` login to the application database.                                                                                      |
| `AUTH_DATABASE_URL`                                                                          | Web                                  | Dedicated `journal_auth` login to that same database.                                                                                           |
| `JOB_DATABASE_URL`                                                                           | Worker; validated web binding        | Dedicated `journal_jobs` login to that same database. The web does not create a job pool.                                                       |
| `MIGRATION_DATABASE_URL`                                                                     | One-shot operator tooling only       | Controlled operator privileges for reviewed application/queue migrations and role provisioning. Never inject into runtime children.             |
| `BETTER_AUTH_SECRET`                                                                         | Web/bootstrap                        | At least 32 nonblank characters of strong random secret material, stable across web instances/restarts and separately protected for recovery.   |
| `STORAGE_ROOT`                                                                               | Web/preflight                        | Absolute path on the durable private media mount, outside source/public/build directories; service-owned with mode `0700`.                      |
| `WEB_HOST`                                                                                   | Web launcher                         | `127.0.0.1` behind a same-host proxy; `0.0.0.0` only inside an explicitly private container/network boundary.                                   |
| `PORT`                                                                                       | Web                                  | Unprivileged internal listen port, for example `3000`, reachable only by the trusted proxy/probes.                                              |
| `WORKER_HEALTH_HOST`                                                                         | Worker                               | Default `127.0.0.1`; any container-network binding requires an equivalent private access boundary.                                              |
| `WORKER_HEALTH_PORT`                                                                         | Worker                               | Private port, default `3101`; not a public API.                                                                                                 |
| `LOG_LEVEL`                                                                                  | Both services                        | Normally `info` or `warn`; send JSON logs to a controlled collector.                                                                            |
| `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`                                       | Supported runtime clients            | Readable trust paths where required; preserve verification and the ordinary trust roots. A path alone does not configure PostgreSQL URL policy. |
| `BOOTSTRAP_PASSWORD`                                                                         | Owner/recovery operator command only | Optional hidden automation input; never a web/worker binding or committed default.                                                              |
| `TEST_*`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `TEST_POSTGRES_PORT`, `COMPOSE_PROJECT_NAME` | Local setup/test infrastructure      | Keep out of deployed service configuration. Test/operator credentials are not runtime fallbacks.                                                |

The migration runner provisions the fixed runtime role names above from the
passwords in their corresponding URLs. Distinct URL strings alone do not prove
least privilege or that all bindings point at the same physical database.
Configuration parsing checks syntax and production origin, not all live database
privileges or transport properties. Use the live preflight under the intended
runtime identities. The reviewed runtime roles have no memberships in other
roles: `NOINHERIT` alone does not prevent `SET ROLE`. Preflight rejects additional
memberships rather than silently accepting an escalation path. Use URL-encoded credentials where necessary; never weaken
passwords to avoid encoding.

For network PostgreSQL connections, configure `sslmode=verify-full` and the
appropriate trusted CA using each URL's `sslrootcert` option where needed. Keep
hostname validation enabled. Do not use `sslmode=no-verify`, disable TLS
verification or assume `pg_stat_ssl.ssl=true` alone proves certificate identity.
The localhost plaintext allowance in local verification tools is explicitly a
test exception, not a production transport approval. Production database TLS,
the actual certificate chain and rejection of a wrong hostname/CA remain
deployment checks.

## Prepare a release

1. Select the reviewed commit. Create a new versioned release directory; keep the
   previous release for rollback. Do not run `git pull`, rebuild in place or copy
   changing application files over a live instance.
2. Retain the complete workspace layout, exact manifests, `pnpm-lock.yaml`,
   `pnpm-workspace.yaml`, `.npmrc`, migration SQL/journal and operator/startup
   scripts. Exclude private/runtime directories and old build output.
3. Use the pinned toolchain and frozen installation. Do not use `--prod`, prune
   workspace dependencies or discard the `tsx` operator/launcher tooling from
   this full-checkout release form.

   ```sh
   node --version
   corepack pnpm --version
   corepack pnpm install --frozen-lockfile
   corepack pnpm api:check
   corepack pnpm lint
   corepack pnpm typecheck
   corepack pnpm test:unit
   corepack pnpm test:integration
   corepack pnpm security:audit
   NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 corepack pnpm build
   corepack pnpm --silent release:check > release-manifest.json
   ```

   Test commands require their isolated PostgreSQL test bindings, never a
   production operator URL. Build imports are lazy and do not require production
   runtime secrets. Supply any build-network proxy/CA through the build platform;
   do not turn off certificate or package-integrity verification.

4. Retain the release manifest, lock/source/migration hashes, build ID and check
   results with the deployment record. `release:check` verifies declared inputs
   and artifact completeness; by itself it cannot establish that stale outputs
   were built from the recorded inputs. A fresh source-only install/build is the
   corresponding provenance check. Different Next build IDs or non-deterministic
   output do not constitute a byte-identical reproducibility claim.
5. Keep `apps/web/.next`, the complete installed dependency graph, worker/domain
   outputs and all operator sources together. The production launcher copies
   `.next/static` and an optional `apps/web/public` directory into Next's
   standalone layout. Permit that owned initialization and any required cache
   writes; a fully read-only release filesystem has not been established by this
   launch path. Private media belongs on its separate persistent mount.

The source-only rehearsal exposed an implicit Tailwind build input: without Git
metadata, automatic source detection scanned dependencies and generated output
(28,846 files / 136,338 candidates), while the checkout scanned 85 files / 2,383
candidates. Their generated CSS differed despite matching application sources.
`globals.css` now disables automatic detection and explicitly names the web and UI
source directories. The source-only PostCSS regression excludes dependency/output
sentinels; direct scanner checks produce identical 80-file / 2,326-candidate sets
in both contexts. The final build comparison and browser checks are recorded in the
[verification evidence](production-readiness-evidence.json). A release must not
require shipping `.git` metadata or retaining old generated files.

The CI workflow runs locked verification and the production smoke procedures.
Local execution evidence and a configured workflow are distinct from an actual
successful hosted CI run; the latter must be recorded for the approved release.

## Migration and rollout order

1. Finish the [backup procedure](backup-and-recovery.md), verify its manifest and
   recovery credentials, and establish the maintenance/write-quiescence boundary
   required by the planned change. Check disk space and database connection
   headroom. The initial operational targets remain proposed until accepted and
   exercised for the production dataset.
2. Stop admission to old writers and drain their requests/workers when the
   migration is not compatible with both releases. A rolling deployment is safe
   only after explicit expand/backfill/contract compatibility review; do not
   infer compatibility from an additive filename.
3. Run exactly one deployment-controlled migration job using the same release:

   ```sh
   corepack pnpm db:migrate
   ```

   Application migrations check that applied history is the exact reviewed
   journal prefix, including hashes/order/timestamps, and wait at most 30 seconds
   for their advisory lock. Queue migrations have their own bounded pg-boss lock.
   Runtime-password provisioning follows. These are separate phases, not one
   global advisory lock or an atomic all-schema release transaction. The release
   controller must serialize the complete job. On failure, keep traffic gated,
   investigate sanitized diagnostics and rerun the reviewed command; do not
   start replicas on a partially completed release.

4. Do not edit applied SQL, use Drizzle `push`, auto-migrate in a replica or use
   a destructive down migration to roll back financial history. Current runtime
   compatibility is application schema **9** and PostgreSQL **17**. A schema
   readiness check is not a substitute for migration-history verification.
5. Run the live operational preflight from the intended service environment:

   ```sh
   corepack pnpm ops:preflight
   corepack pnpm db:check
   ```

   Read its individual results and pending gates. The preflight's owned storage
   probe is temporary and removed; a successful probe proves current access,
   not persistence, free-space policy, redundancy or backup coverage. Deployment
   identity, database transport and certificate checks must apply to the real
   target rather than the local drill.

6. Start separate supervised processes from the same release:

   ```sh
   corepack pnpm start:web
   corepack pnpm start:worker
   ```

   `corepack pnpm start` is the combined launcher if the supervisor intentionally
   manages both as one unit. Use a non-root service account, explicit working
   directory and private environment injection. Configure restart backoff and at
   least a **30-second** outer termination window. Launchers allow 15 seconds,
   exceeding the worker's 10-second drain; larger/custom work requires a reviewed
   shutdown budget. Stop only processes owned by that service instance.

7. Check public liveness, authenticated web readiness, private worker readiness,
   storage preflight and application/session behavior before admitting traffic.
   Web readiness is authenticated: an anonymous 401 is not a healthy 200 probe.
   Follow the [monitoring procedure](operations.md) for safely retained probe
   sessions and their expiry/rate-limit handling.
8. Run sign-in/out, CSRF-denial, tenant-isolation, private-media and financial
   reconciliation smoke checks through the actual HTTPS endpoint. Retain safe
   results without cookies, passwords, source bodies or financial payloads.
   Enable traffic only after the checklist's deployment gates have evidence.

## HTTPS and edge assumptions

The reverse proxy terminates TLS using a certificate valid for `APP_ORIGIN`.
Redirect plain HTTP to the canonical HTTPS origin, reject unknown hosts, strip
untrusted forwarding headers and prevent clients from bypassing the proxy to
the standalone server. Do not derive trusted origin or client identity from
arbitrary inbound `X-Forwarded-*` headers. Configure connection/body deadlines,
reasonable request/concurrency limits and a private PostgreSQL network boundary.
Tune them against [measured capacity](performance.md), not an assumed fast
dashboard for every dataset.

Preserve every `Set-Cookie`, nonce CSP, HSTS and private/no-store response header.
Do not cache private HTML, RSC, API, auth or attachment responses at an edge;
public immutable assets have a separate cache policy. Configure safe upstream
error pages without revealing internal addresses. HSTS does not create a
certificate or implement an HTTP redirect. The application does not supply the
edge redirect or protect an incorrectly public standalone listener.

Production authentication configures Secure, HttpOnly, SameSite=Lax, host-only
cookies and exact same-origin mutation/CSRF checks. Keep the auth secret stable
across replicas and retain appropriate recovery access. Do not disable secure
cookies or switch to test mode to make an HTTP production deployment work.
The local trusted-CA HTTPS smoke verifies the application path in a controlled
environment; it does not verify production DNS, a public certificate, renewal,
load balancer behavior or an operator's actual proxy configuration.

## Rollback and release boundaries

Remove traffic, drain owned services and diagnose the failure before switching
releases. Reuse the prior application only when it is compatible with the now
applied schema and source/calculation versions. Otherwise execute the tested
database-plus-media recovery procedure under a write fence; restoring an older
backup discards subsequent committed changes and requires an explicit recovery
decision. Never delete volumes or replace media alone as a rollback shortcut.

Operational backups include authentication/session material and private media,
so protect them as secrets. A portable workspace export would have different
identity and credential semantics and is not implemented here. Production
approval, certificate/backup/alert ownership, accepted RPO/RTO, capacity for the
actual workload and a real deployment rehearsal remain explicit checklist gates.
