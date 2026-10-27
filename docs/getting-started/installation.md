# Installation

Reviewed 25 October 2026 against Checkpoint 1 commit `d7e5637f5c1619f8f7acc2f73f72adba41a43212` (application baseline `5132900a03efabaeb307787531546987228220e7`). Audience: developers and operators preparing a first installation. See [system requirements](system-requirements.md), [configuration](configuration.md) and the [executed verification record](verification.md) before choosing a path.

## Supported installation model

Install the **complete source workspace**, its frozen dependencies, reviewed migrations and build outputs. Run the web/API and worker as Node processes with PostgreSQL 17 and private filesystem media. The repository supplies a convenient **database-only Compose setup for local development**. An independently provisioned PostgreSQL 17 instance can supply the same database boundary, including production; its provisioning and host setup require operator verification.

There is no supported application Docker image, one-container installer, production Compose stack, standalone-only bundle, dependency-pruned installation or desktop installer. Copying only `apps/web/.next/standalone` or `apps/worker/dist` omits required dependencies and operator tooling. Installing with another package manager can change the dependency graph.

The Linux source/Compose path and local built-asset path have fresh Checkpoint 2 evidence in [verification](verification.md). Production HTTPS deployment and other OS/platform variants must be assessed separately; a successful local build is not production acceptance. [FA-04](../final-audit.md) remains open.

## 1. Obtain and select the source

Use a new parent directory for a new installation. The commands below use Bash/POSIX shell syntax and require access to the GitHub repository:

```bash
git clone --branch docs/phase-19-complete-documentation --single-branch https://github.com/404usrnotfound/Trading-Journal.git Trading-Journal
cd Trading-Journal
git status --short --branch
git log -1 --oneline
git merge-base --is-ancestor d7e5637f5c1619f8f7acc2f73f72adba41a43212 HEAD
```

This branch contains the Phase 19 documentation and reviewed post-Phase-18 application. The ancestry command exits zero when the committed Checkpoint 1 baseline is present. The exact clean source rehearsed for these guides is `d7e5637f5c1619f8f7acc2f73f72adba41a43212`; later documentation commits may change the displayed head. No tagged production release is certified here. Production operators must pin and approve their actual release commit rather than automatically deploy the tip of a documentation branch.

If you already have a checkout, preserve its edits and inspect its branch/commit before selecting another ref. Do not clone into it, reset it, or replace its configuration to follow a first-install example.

**All subsequent commands run from the repository root**, the directory containing `package.json` and `compose.yaml`, unless a section explicitly says otherwise.

## 2. Verify tools and install dependencies

Install Node **24.19.0** and make Corepack available using your platform's supported tooling. The version files and root manifest select pnpm **10.34.6**. Verify:

```bash
node --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
```

For the **Compose database path only**, also check:

```bash
docker --version
docker compose version
docker info
```

Expect Node `v24.19.0`, pnpm `10.34.6`, working Compose v2 and a reachable intended local Docker daemon. Docker is needed for the Compose path; it is not needed when a verified external PostgreSQL service already exists. Do not silently use a remote Docker context for local installation. Docker daemon access is a powerful permission; use the existing approved local daemon, not a blanket socket-permission change.

Install the full dependency graph, including build/operator dependencies. Keep `pnpm-lock.yaml` unchanged. Native Argon2 must match the platform; Linux x86_64 was exercised. No compiler toolchain is established as universally required for platforms with working prebuilt native packages.

If a managed environment has an unavailable default Corepack cache, choose an ignored writable cache **before** invoking Corepack, without changing `HOME`:

```bash
export COREPACK_HOME="$PWD/work/cache/corepack"
```

Use the environment's configured proxy and CA trust for downloads. Do not disable TLS or package-manager integrity checks. A blocked download or unsupported native module is not a successful installation; see [network and permission requirements](system-requirements.md).

## 3. Prepare private local configuration

For the default ports and a new local database volume:

```bash
corepack pnpm env:init
```

The initializer creates an ignored repository-root `.env` with independently generated administrator/application/authentication/queue credentials and authentication secret. It creates `.private/storage`; file mode is `0600`, storage-directory mode `0700`. The [template](../../.env.example) contains unusable placeholders, not a shared default login. Do not print or commit the generated file.

Defaults are `http://localhost:3000`, web loopback binding `127.0.0.1`, worker health port `3101`, development PostgreSQL `5432` and isolated test PostgreSQL `5433`. Use `localhost` consistently in the browser for the default canonical origin.

If those ports or the default Compose project are already in use, choose unused ports and a unique project **before the first initialization**. This is an alternative to the command above:

```bash
COMPOSE_PROJECT_NAME=journal-local-isolated APP_ORIGIN=http://localhost:4300 POSTGRES_PORT=55432 TEST_POSTGRES_PORT=55433 WORKER_HEALTH_PORT=4401 corepack pnpm env:init
```

The generated file stores the override values, derives `PORT` from `APP_ORIGIN` and constructs matching database URLs. The rehearsal used the same port assignments with its own unique project name. Choose different free values for another concurrent installation.

> **Important:** `env:init` preserves an existing `.env`; rerunning it does not apply new overrides, rotate secrets, repair credentials or recreate an existing database. Existing shell/service bindings override `.env` values. Check [configuration precedence](configuration.md#configuration-precedence) before diagnosing mismatched origins, roles or ports.

Do not generate replacement passwords for a PostgreSQL volume initialized with different administrator credentials. Preserve that installation's `.env` and volume together. Changing `APP_ORIGIN` later does not automatically update `PORT`.

## 4. Start PostgreSQL and initialize the database

For the local Compose method:

```bash
corepack pnpm db:up
```

This starts and waits for two PostgreSQL 17 services. On first initialization, the image creates `trading_journal` in the project's persistent development volume and `trading_journal_test` in the separate temporary test service. The services publish only loopback ports. The application does not need financial seed data to start.

The test service is not production infrastructure. Its temporary data may disappear when the container is removed. No application migration is performed merely by starting a database container.

For an **existing independently provisioned PostgreSQL 17 service**, skip `db:up`. Supply an empty intended application database and an operator connection authorized to apply the reviewed migrations, create/provision roles and initialize pg-boss. Set the operator/application/authentication/queue URLs securely as described in [configuration](configuration.md). Database creation, network/TLS and operator privileges are provisioning prerequisites; the application's migration command does not create the database itself. PostgreSQL TLS and host permissions must be verified for that service. This external-service variant was source-reviewed, not freshly provisioned in this checkpoint.

## 5. Apply migrations and verify schema

After PostgreSQL is healthy:

```bash
corepack pnpm db:migrate
corepack pnpm db:check
```

`db:migrate` applies reviewed application migrations `0000`–`0016`, checks the applied history, initializes the queue and provisions the restricted `journal_app`, `journal_auth` and `journal_jobs` roles from the configured passwords. It reports `Database and queue migrations applied; least-privilege runtime roles provisioned.` Application schema readiness is **17**. `db:check` uses the application role and checks PostgreSQL/schema compatibility.

Migration, queue setup and role provisioning are separate phases; investigate a failed phase before starting services. Re-running the declared migration command is supported, but never edit published SQL, use an unreviewed schema-push command, or substitute runtime/operator roles. The web and worker do not auto-migrate.

For an upgrade of an existing installation, first use that release's reviewed backup/change process. These first-install commands do not constitute a production upgrade or rollback procedure. Older Phase 16 operational evidence referring to nine migrations records history; current source requires schema 17.

## 6. Provision the initial owner

In an interactive terminal:

```bash
corepack pnpm user:create --email owner@example.test --name 'Example Owner'
```

Replace the example identity with your own. Enter a new private password of **12–128 characters** at the hidden prompt. There is no default password or public signup. The command creates the owner and an empty personal workspace. It preserves existing credentials on retry; password recovery is a distinct action.

For automation, inject `BOOTSTRAP_PASSWORD` through a secure child-process environment binding. Do not put a literal password in shell arguments/history, a tracked file, `.env.example` or the verification record. The disposable rehearsal used a generated private binding and the same CLI command.

The optional `db:seed` command creates another labeled **empty** demo workspace. It is not needed for installation and does not populate example trades.

## 7. Start local development

```bash
corepack pnpm dev
```

Keep the terminal running. This starts the web/API and worker together, using validated `.env`/process bindings. Open `http://localhost:3000/sign-in`, or your configured canonical origin. Ctrl+C stops the managed children; it does not drop data or stop the databases. First compilation can take longer than later page loads.

The local development method uses `NODE_ENV=development` and a loopback origin. It is not suitable for public traffic. Continue with [first run](first-run.md) to sign in, set preferences and create explicit synthetic activity.

## 8. Optionally run built assets locally

Stop the development launcher before reusing its ports. From the same repository root and configuration:

```bash
NODE_ENV=production corepack pnpm build
corepack pnpm start
```

The first command builds domain, worker and web outputs. The inline environment setting affects **the build command only**; it does not rewrite `.env`. With the generated development configuration, `start` runs the built app over local HTTP and starts the built worker. This is the tested local built-asset rehearsal, not production HTTPS mode. Next.js emits nonstandard-environment and standalone-output warnings on this local `next start` path; health, login and persistence were checked despite those warnings. The production launcher instead uses the standalone server when `NODE_ENV=production` and the required HTTPS configuration are supplied. Do not leave a shell-wide `NODE_ENV=production` combined with a development HTTP origin and expect startup to pass.

## 9. Verify installation

With default ports, from another terminal:

```bash
curl --fail --silent --show-error http://localhost:3000/api/v1/health/live
curl --fail --silent --show-error http://127.0.0.1:3101/health/live
curl --fail --silent --show-error http://127.0.0.1:3101/health/ready
```

Replace ports with your stored overrides if applicable. Healthy liveness responses report an available process; worker readiness additionally verifies the queue round trip. Respect local proxy exclusions for loopback. Readiness may take a few seconds after startup; retry after initialization rather than accepting a failed response as success.

Web `/api/v1/health/ready` requires authentication. An unauthenticated HTTP **401 is expected**, not proof of a schema outage. After signing in, open that URL in the same browser and expect HTTP 200/readiness data. Never copy a session cookie into public command history or documentation to perform the check.

Confirm that `/sign-in` loads, the provisioned identity reaches Overview, preferences survive reload, and the [first-run example](first-run.md) records the expected native cash/quantity. A healthy process alone does not establish financial workflow correctness or that every background projection is current. Fresh results and limits are recorded in [verification](verification.md).

## Production source installation

**Status: Source-reviewed; actual production host/HTTPS deployment not verified here.** Use a separately approved, pinned full source release, Linux/native-compatible dependencies and PostgreSQL 17. Do not publish the development Compose stack or use generated development credentials as production configuration.

> **Important:** The [Checkpoint 5 dependency audit](../operations/verification.md#dependency-audit-failure) reported seven advisories, including two critical, on 26 October 2026. A passing build or release-source check does not clear that failed audit gate. Review the current security findings and [release controls](../operations/upgrades-and-rollback.md) before selecting a production release.

Before starting, provision the intended empty database, private persistent media mount, a service identity with appropriate filesystem permissions, supervised web/worker processes and a trusted HTTPS reverse proxy/canonical origin. Inject the [production bindings](configuration.md#production-boundary) through the service manager/secret store; keep development/test/operator bindings out of long-running services. An HTTPS `APP_ORIGIN` declares the external URL; it does not create certificates or a TLS listener.

From the approved full source checkout, with the appropriate secure operator bindings for one-shot commands:

```bash
corepack pnpm install --frozen-lockfile
NODE_ENV=production corepack pnpm build
corepack pnpm release:check
corepack pnpm db:migrate
corepack pnpm db:check
corepack pnpm user:create --email owner@example.test --name 'Example Owner'
```

Run each step only after its prerequisites pass. Migration and bootstrap use operator/authentication configuration; service launchers allowlist runtime bindings. Provisioning is not permission to grant the application superuser/bypass-RLS access. The migration command needs the three intended runtime passwords as well as the operator URL.

Run these as separate supervised services with complete production runtime bindings:

```bash
corepack pnpm start:web
```

```bash
corepack pnpm start:worker
```

The supervisor must set `NODE_ENV=production` and canonical HTTPS `APP_ORIGIN` for web startup. That path uses the generated standalone server and copies its assets, while retaining the full source/dependency release. Worker receives queue/health/log bindings. Verify readiness internally, then trusted-proxy HTTPS, login/logout/session behavior, media persistence and recovery on the real host before enabling traffic.

Use existing [deployment](../deployment.md), [operations](../operations.md), [backup/recovery](../backup-and-recovery.md) and [readiness checklist](../production-readiness-checklist.md) for their operational scope. Their Phase 16 measurements remain historical; current schema/worker/portability behavior is established by the [environment inventory](../environment-inventory.md) and [remediation evidence](../audit-remediation.md). Production capacity and host-specific acceptance remain open; these guides do not close them.

## Restarting and stopping a local installation

Keep the original `.env` and development volume. After stopping the app with Ctrl+C, starting `dev` or `start` again uses the same records. After stopping database services, restart the same project with `db:up`, verify migrations/schema, then launch the app.

To stop the intended local project's databases from its repository root:

```bash
corepack pnpm db:down
```

This preserves the persistent development volume but removes the temporary test container/data. Confirm the intended project before running it. Do not add `-v` as routine cleanup: that deletes persistent data. Avoid deleting `.env`, regenerating credentials or resetting a database to resolve an ordinary startup error.
