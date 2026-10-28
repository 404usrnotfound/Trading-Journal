# Installation and startup problems

Reviewed **26 October 2026** for Phase 19 Checkpoint 4 against committed Checkpoint 3 `45ab9db8991af4d714e2bfb3a5a4053cd59dfaf2`; application source remains `5132900a03efabaeb307787531546987228220e7`. Audience: developers and operators installing or starting the full source workspace. These diagnoses are **Source-reviewed**; the [Checkpoint 2 installation rehearsal](../getting-started/verification.md) and [Checkpoint 3 browser rehearsal](../user-guide/verification.md) are **Historically passed** evidence. Fresh failure reproductions, where performed, belong to this checkpoint's [verification record](verification.md). An issue appearing below does not mean it was reproduced during this checkpoint.

Follow the [installation guide](../getting-started/installation.md) for the canonical sequence and [configuration](../getting-started/configuration.md) for variable formats/precedence. Use [diagnostics](diagnostics.md) to collect bounded, sanitized evidence. Commands below use Bash/POSIX syntax and run from the repository root, containing `package.json` and `compose.yaml`. Linux x86_64 is the exercised platform; native compatibility on another OS/CPU/libc is not established by a Node version range. No procedure below requires direct ledger/database edits, disabled security or volume deletion.

## Runtime or dependency installation is rejected

**Problem:** The checkout cannot install or execute its pinned dependency graph.

**Symptoms:** Node/Corepack/pnpm fails before the web application starts, installation rejects engine/peer/lockfile compatibility, or the release verifier prints `The running Node/pnpm versions must exactly match the release pins.` Dependency-tool wording varies; retain the actual classification from your run rather than assuming it is an application error.

**Possible causes:** The intended Node 24.19.0 or pnpm 10.34.6 is not selected; another package manager or an edited lockfile changed the graph; only a workspace subdirectory or production-pruned dependencies were installed. The root engines accept Node `>=24 <25` and pnpm `>=10 <11`, while release verification requires the exact pins. `.npmrc` enables strict engines and peers. Build and operator tooling are part of the supported full checkout.

**Diagnosis:** Check source identity and tools without changing dependencies:

```bash
git status --short --branch
git rev-parse HEAD
node --version
corepack pnpm --version
```

The Corepack invocation can obtain/cache its selected manager if it is not already present; it is not guaranteed to be a network-free check. Compare the outputs privately with [.node-version](../../.node-version), [.nvmrc](../../.nvmrc), [package.json](../../package.json), [workspace configuration](../../pnpm-workspace.yaml) and [.npmrc](../../.npmrc). Inspect Git's changed-file list before assuming the lockfile is pristine. Do not discard existing edits.

**Resolution:**

1. Select the pinned Node runtime and Corepack/pnpm using the environment's approved tooling. Do not edit the repository's version pins to match an accidental local selection.
2. Preserve local work. If the checkout or dependency graph is uncertain, prepare a separate clean source directory using the installation guide instead of resetting or overwriting the existing checkout.
3. **Modifies dependency files/cache:** from that intended repository root run `corepack pnpm install --frozen-lockfile`. This installs the complete graph; it does not authorize a lockfile rewrite or an application upgrade.
4. If frozen installation reports a genuine source/lock mismatch, escalate the exact commit and sanitized tool error. Do not remove `--frozen-lockfile`, disable strict peer checks or add an unreviewed dependency as an ordinary fix.

**Verification:** Tool versions match the intended pins and frozen installation exits 0. Continue the existing installation sequence; dependency installation alone does not establish migration, native-module, startup or login success. A deployment upgrade still needs its reviewed backup/change process.

**Escalation:** Collect OS/architecture, Node/pnpm versions, commit/branch, whether the full graph was installed, changed manifest/lockfile names, and the failing command plus sanitized tool classification. Exclude package-registry tokens, private registry URLs containing credentials and full process environment dumps.

Evidence: [release source verifier](../../scripts/release-check.ts), [installation rehearsal](../getting-started/verification.md) and [release tests](../../tests/unit/release-check.test.ts).

## Dependency downloads or the Corepack cache fail

**Problem:** The selected package manager or package dependencies cannot be obtained or cached.

**Symptoms:** Corepack/pnpm cannot access its cache or download a required package; the command exits before application startup. There is no Trading Journal-specific message for every registry, proxy, DNS, certificate or filesystem failure. Use the real tool's error and exit status.

**Possible causes:** A managed host's default cache is unavailable or unwritable; required registry access is blocked; the configured proxy/CA trust is missing for that tool; a partial download is mistaken for a complete install. These are infrastructure prerequisites, not a reason to bypass TLS or authentication.

**Diagnosis:** Record which command failed, whether the failure occurred obtaining pnpm or installing a dependency, and the host's approved proxy/certificate/cache configuration. Check the [network and permission requirements](../getting-started/system-requirements.md). Inspect directory existence/ownership privately; do not post proxy authentication values, registry tokens, `.npmrc` secrets from a user-level file or the contents of `.env`.

**Resolution:**

1. Restore the host's approved registry route, proxy and trusted CA configuration. A policy-blocked destination requires the environment owner to correct policy; changing application settings cannot grant access.
2. If only the default Corepack cache is unavailable, choose an ignored writable cache in this checkout before invoking Corepack. **Changes the current shell and may create cache files on subsequent commands:**

   ```bash
   export COREPACK_HOME="$PWD/work/cache/corepack"
   ```

3. Retry `corepack pnpm --version`, then the canonical frozen install. Do not repurpose `HOME`, bypass package-manager integrity checks, set `NODE_TLS_REJECT_UNAUTHORIZED=0` or make cache directories world-writable.
4. If access still fails, preserve the error and ask the host/network owner to investigate its actual destination and certificate chain. Keep the source/lockfile unchanged.

**Verification:** The selected pinned manager runs and frozen installation completes. A cache fix does not verify network access from an independently deployed production host. The writable-cache route has historical installation evidence; unrelated proxy/certificate remedies remain **Source-reviewed / Not run** unless the checkpoint verification record states otherwise.

**Escalation:** Share the tool/version, sanitized destination hostname, failure time, cache path category and sanitized error code. Share certificate issuer/expiry metadata where relevant, never private keys, authorization headers or complete signed download URLs.

Evidence: [installation cache alternative](../getting-started/installation.md), [allowed child environment](../../scripts/processes.ts), [environment inventory](../environment-inventory.md).

## Local configuration is preserved or initialization is rejected

**Problem:** `env:init` does not apply the overrides you expected, or refuses local setup.

**Symptoms:** The initializer prints `.env already exists; preserved it.`; or rejects input with `APP_ORIGIN must be a local HTTP(S) origin.`, `Invalid local database port.`, `Development and test database ports must differ.` or `COMPOSE_PROJECT_NAME must be a valid local Compose project name.` These are exact messages in the [initializer](../../scripts/env-init.ts).

**Possible causes:** Exclusive file creation deliberately preserves an existing repository-root `.env`; rerunning with different shell overrides does not merge them. Invalid initializer inputs are checked before the existing-file preservation branch. The initializer accepts only loopback HTTP(S) origins without credentials/path/query/fragment. Its database and worker health ports must be integers 1024–65535, development/test database ports must differ, and project names must match its lowercase name convention.

**Diagnosis:** Determine whether the intended checkout already has `.env`; inspect its ownership and the non-secret settings privately. Compare variable names and precedence in [configuration](../getting-started/configuration.md#configuration-precedence). Do not print its contents or generate replacement credentials to test whether the existing database accepts them.

**Resolution:**

1. For an existing installation, preserve its private configuration and corresponding database/media. Back up the private configuration securely before any deliberate edit. Do not delete `.env` and regenerate random credentials for an existing volume.
2. Correct only the identified non-secret initializer input for a genuinely new installation. Select unused, matching ports and a unique intended Compose project before first initialization; follow the installation guide's supported alternative.
3. If `.env` already exists, use a reviewed configuration change rather than expecting the initializer to update it. Remember that changing `APP_ORIGIN` later does not derive a new `PORT` automatically.
4. Restart affected services after an approved runtime configuration change. Changing a local file does not rotate database-role passwords, migrate a database or move private media.

**Verification:** A new installation prints the documented creation message and creates private configuration; an existing installation retains its intended values. Confirm the effective non-secret origin/ports and then use the normal database/startup checks. A preservation message is successful preservation, not proof that the existing configuration is valid.

**Escalation:** Collect the exact initializer message, whether `.env` pre-existed, the names of overridden inputs, and sanitized non-secret origin/port/project metadata. Never send the generated credentials or authentication secret.

Evidence: [initializer](../../scripts/env-init.ts), [configuration precedence](../getting-started/configuration.md#configuration-precedence), [installation verification](../getting-started/verification.md).

## Web or worker configuration is rejected before listening

**Problem:** A launcher refuses a missing or invalid runtime binding.

**Symptoms:** Web configuration raises `Invalid server configuration: ` followed by invalid field names; its code is `INVALID_SERVER_CONFIGURATION`. Worker configuration raises `INVALID_WORKER_CONFIGURATION` and retains invalid field names. Operator tools can report `Required configuration is missing: ` followed by a binding name. These messages intentionally omit values.

**Possible causes:** Required application/authentication/queue PostgreSQL URLs are absent or malformed; `BETTER_AUTH_SECRET` is too short; `APP_ORIGIN` is not an allowed canonical origin; `STORAGE_ROOT` is blank, a filesystem root or under a forbidden `public`, `.next`, `dist` or `build` path component; worker host/port or logging level is invalid. Production requires HTTPS. Development/test authentication must use loopback HTTP(S). Existing process/service values override `.env`; empty strings are not defaults.

**Diagnosis:** Record only the invalid field names and code. Compare those names with the [runtime variable reference](../getting-started/configuration.md#runtime-bindings). Use the safe configuration checks in [diagnostics](diagnostics.md). A parser acceptance checks syntax/policy, not database connectivity, filesystem permissions or certificate trust.

**Resolution:**

1. Correct the named binding in the actual launching service/shell or repository-root private configuration, following precedence. Do not dump the environment to find it.
2. Use the intended least-privilege application/authentication/queue roles on the intended database. Do not substitute an administrator URL to make startup pass.
3. Preserve the authentication secret across ordinary restarts. Coordinate credential changes; do not fabricate credentials or rotate secrets as a generic error-clearing step.
4. For production, configure the intended HTTPS edge/canonical origin and explicit `NODE_ENV=production`. The `start` command's production flag selects built processes but does not rewrite `NODE_ENV`. Do not change production mode or disable security to evade an HTTPS rejection.
5. Restart affected processes through the existing launcher/supervisor, then check liveness, authenticated readiness and login separately.

**Verification:** The configuration rejection disappears, the intended listeners start, and the subsequent readiness/authentication checks pass. Clearing one field can expose another underlying database or storage problem; do not treat liveness alone as full readiness.

**Escalation:** Collect error class/code, field names, commit, intended mode and non-secret origin, plus whether bindings came from the service environment or `.env`. Never include connection URLs, secret values or copied terminal stacks without review.

Evidence: [server parser](../../packages/server/src/config.ts), [worker parser](../../apps/worker/src/config.ts), [environment loader](../../scripts/environment.ts), [server configuration tests](../../tests/unit/server-config.test.ts), [worker configuration tests](../../tests/unit/worker-config.test.ts).

## Docker services cannot start or the intended database is absent

**Problem:** The optional local database-only Compose prerequisite is unavailable.

**Symptoms:** Docker/Compose exits before PostgreSQL becomes healthy; the expected database service is absent or bound to an unintended project/port. Exact daemon, permissions and port-conflict messages depend on Docker and the host. Trading Journal does not supply a web/worker Docker service.

**Possible causes:** Docker Engine or Compose v2 is unavailable; the current context points to another daemon; access to the intended local daemon is missing; another service owns a published loopback port; the wrong project/configuration was selected. An independently provisioned PostgreSQL installation does not use this Compose path.

**Diagnosis:** On the intended local-development host, run these read-only inspections from repository root:

```bash
docker --version
docker compose version
docker context show
docker compose ps
```

Inspect the intended daemon with `docker info` if needed; review its infrastructure metadata before sharing. Compare the selected project and non-secret ports privately with configuration. `docker compose ps` reports only the current project's database services, not separately launched Node processes. Avoid `docker compose config` in shared diagnostics because rendered configuration can expose secret values.

**Resolution:**

1. Restore the approved intended Docker daemon/context and normal authorized access. Do not make its socket world-writable or restart an unrelated daemon.
2. If the intended service has not been created, follow installation's `corepack pnpm db:up` step. **Modifies state:** this creates/starts the configured development/test database services; it is not appropriate against an unknown remote Docker context.
3. For a port conflict, identify the owning service through the host's normal service tools. Preserve existing services/data; choose an unused configuration for a new isolated installation or perform a coordinated listener change for an existing one.
4. After service health, continue [database diagnostics](diagnostics.md). Do not delete a volume to remedy a connection or password error; preserve the configuration that initialized it.

**Verification:** The intended Compose project's PostgreSQL services are healthy, expected loopback bindings match the configured URLs, and the declared schema/connectivity check passes. Container health alone does not establish application migrations, runtime-role privileges or login.

**Escalation:** Collect Docker/Compose versions, the selected context category, sanitized project/service state, non-secret published ports and a bounded sanitized PostgreSQL error window. Exclude rendered environment/configuration and connection strings.

Evidence: [Compose services](../../compose.yaml), [root scripts](../../package.json), [local installation](../getting-started/installation.md).

## A built application or native dependency is missing

**Problem:** Built-mode startup or release verification cannot load the complete approved build and its native/runtime dependencies.

**Symptoms:** Release verification can print `Required release file is missing or empty: ` followed by a path, `Next static assets are missing.`, `Standalone dependency is missing: ` followed by a dependency name, `Standalone native Argon2 dependency cannot load on this host.`, `No standalone native Argon2 binary was loaded.` or `Full-checkout runtime dependency is missing: ` followed by a dependency name. These are exact verifier messages, not claims that every startup path prints them.

**Possible causes:** No successful build exists; only the Next standalone directory or worker `dist` was copied; source and build outputs come from different releases; the runtime graph was pruned; a native Argon2 binary does not match the deployed OS/CPU/libc. The supported model is a complete source checkout with dependencies, migrations, tooling and domain/worker/web build outputs.

**Diagnosis:** Confirm the exact source/runtime pins and the successful build log. The [release checker](../../scripts/release-check.ts) validates the named assets, dependency closure and current-host native loading. **Writes a local JSON report:** the deployment guide's `corepack pnpm release:check` invocation inspects release assets; use its intended reviewed output handling rather than publishing the entire report. It is not a substitute for a deployment-host smoke check or proof that existing outputs were built from current inputs.

**Resolution:**

1. Preserve the current deployed release and private data. Before an upgrade, retain tested database/media backups and follow the reviewed change/rollback process; do not rebuild over a running release as an ad hoc repair.
2. Prepare the full intended source/dependency graph on a supported build/runtime host. Do not copy `node_modules` or a native binary from another platform or force an unsupported native override.
3. **Modifies build outputs:** in the prepared release directory run `corepack pnpm build`, then the declared release check. The build orders domain, worker and web artifacts.
4. Start through the documented root `start` or separate `start:web`/`start:worker` processes with the intended configuration. The production web launcher copies the required static/public assets beside its standalone server.
5. Verify the actual deployment host and edge before directing users to it. Linux local success does not certify a different native platform or production HTTPS host.

**Verification:** Build and release check exit 0; the report confirms current-host native loading and required assets. Then confirm web liveness, authenticated readiness, worker readiness and a normal authorized login. `release:check` does not certify source-to-artifact provenance, migrations, HTTPS or production capacity.

**Escalation:** Collect the exact missing relative path/dependency classification, toolchain, OS/CPU/libc metadata, approved source/build identity, full-versus-pruned installation decision and sanitized build/release-check result. Do not share private source paths or report content wholesale without review.

Evidence: [release checker](../../scripts/release-check.ts), [standalone asset copying](../../scripts/standalone-assets.ts), [service launcher](../../scripts/run.ts), [release tests](../../tests/unit/release-check.test.ts), [deployment](../deployment.md).

## Browser access fails although a process appears running

**Problem:** The browser cannot reach the intended web listener, or a health response is mistaken for complete application readiness.

**Symptoms:** No browser response, connection refusal, a different application at the expected port, or successful public liveness while authenticated use/readiness still fails. Do not replace an actual listener error with an invented application message.

**Possible causes:** The process exited, `WEB_HOST`/`PORT` differs from the expected address, another process owns the port, a loopback listener is accessed from another machine, the browser uses a different canonical origin, or an HTTPS edge is missing. Database/queue/authentication problems can coexist with web liveness.

**Diagnosis:** Check the owned service's launcher/supervisor output and actual non-secret bindings. For an unchanged default local installation, these HTTP GETs are read-only:

```bash
curl --fail --silent --show-error http://localhost:3000/api/v1/health/live
curl --fail --silent --show-error http://127.0.0.1:3101/health/ready
```

Use the actual configured non-secret origin/private worker port if defaults differ. Do not send an authenticated cookie to a guessed origin. Web liveness returns the implemented web status; worker readiness depends on its queue probe and is separate. Web readiness is authenticated; use the normal signed-in path in [diagnostics](diagnostics.md), not a public-readiness bypass.

**Resolution:**

1. Read the earliest failure in the owned launcher's output before repeatedly restarting. Resolve configuration/database/build prerequisites in that order where their messages identify the failure.
2. Start the intended process through the installation guide or existing supervisor. **Changes running services:** `corepack pnpm dev` starts development web/worker; `corepack pnpm start` starts their built equivalents. Do not run a second copy on occupied ports.
3. Align the browser origin, listener, canonical `APP_ORIGIN` and any approved edge. Use `localhost` consistently for the default local browser origin; `127.0.0.1` is a different origin.
4. For remote production access, retain the approved network/HTTPS boundary. Do not expose private worker health or change a production security policy just to make a test URL return 200.

**Verification:** The intended listener responds at the configured origin, authenticated readiness succeeds and a normal user can access the correct workspace. A public liveness response alone is not verification of database, queue, permissions or projection currency.

**Escalation:** Collect exact time, non-secret requested URL path/origin, HTTP status or tool error classification, service identity, commit, launcher exit status and bounded sanitized logs. Exclude cookies, CSRF tokens, full request headers and unreviewed browser network archives.

Evidence: [public web liveness](../../apps/web/src/app/api/v1/health/live/route.ts), [protected readiness](../../apps/web/src/app/api/v1/health/ready/route.ts), [worker health server](../../apps/worker/src/index.ts), [configuration](../getting-started/configuration.md).

## A child service fails and the combined launcher stops

**Problem:** One managed service exits and the root development/built launcher stops its sibling.

**Symptoms:** Web and worker both disappear after an initial single-service failure, or child package-manager logs show termination during an intentional shutdown. Launcher cleanup can report `Unable to stop every development service cleanly.`; a separate service wrapper can report `Unable to stop the managed service cleanly.`

**Possible causes:** The combined launcher deliberately treats a child error/exit as a failure and shuts down its owned children. A database/queue/listener/build failure in one child can therefore end both processes. SIGINT/SIGTERM also initiates controlled shutdown. Worker `worker.stopping`/`worker.stopped` events and child SIGTERM lines during that path are different from an unexplained initial crash.

**Diagnosis:** Inspect the earliest event preceding shutdown, not only the final package-manager lifecycle line. The worker's structured events include `worker.starting`, `worker.ready`, `worker.queue.error`, `worker.heartbeat.failed`, `worker.stopping`, `worker.stopped` and `worker.shutdown.failed`. The repository does not supply a universal on-disk log file; use the existing terminal or supervisor capture and [logging diagnostics](diagnostics.md). Preserve time order across both children.

**Resolution:**

1. Determine whether shutdown was requested by the owner/supervisor or caused by a child exit. For planned shutdown, confirm that owned children stopped before starting another copy.
2. For an unexpected exit, fix the first reported configuration, database/queue, build or listener problem through the relevant guide. Do not treat the sibling's expected termination as an independent data-loss event.
3. Restart only the intended application through its established launcher/supervisor. Do not use broad process-kill commands, arbitrary PID groups or a daemon restart to clear unrelated services.
4. If clean shutdown repeatedly fails, collect the scoped process/service evidence for the operator instead of forcibly terminating unknown processes.

**Verification:** The intended managed web/worker reach their separate readiness conditions and remain running. During the next controlled stop, the owned processes drain/exit without an unexpected cleanup error. Normal worker readiness does not prove every financial projection is current.

**Escalation:** Collect the first failure event, later shutdown events, service names, status/exit code, correlation time and whether the supervisor sent a signal. Keep request bodies, private SQL and credential-bearing process arguments out of shared evidence.

Evidence: [combined launcher](../../scripts/dev.ts), [single-service wrapper](../../scripts/run.ts), [process-group cleanup](../../scripts/processes.ts), [worker lifecycle](../../apps/worker/src/index.ts), [safe logger](../../packages/server/src/logging.ts), [process environment tests](../../tests/unit/process-environment.test.ts).

## Command evidence and limits

The [root manifest](../../package.json) defines install-adjacent application commands; Corepack/pnpm version selection, Docker inspections, Git inspection and curl GETs are host tools rather than Trading Journal API commands. All modifying commands above are explicitly identified and link their canonical procedure. None deletes data or changes the authoritative ledger. Commands that may create cache/output files are not described as pure read-only checks.

The existing [installation verification](../getting-started/verification.md) records exact historical frozen install, environment initialization, build, release check, startup and health commands, including successful nondefault ports/cache paths. The [current verification record](verification.md) owns new failures and recoveries; unlisted platform/network/native remedies and production-host changes are **Not run**. Do not relabel a successful local check as production deployment, full accessibility conformance or resolution of the open [FA-04 capacity gate](../final-audit.md).
