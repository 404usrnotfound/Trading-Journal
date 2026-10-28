# Quick start

For a **new local Linux source installation**, with Node **24.19.0**, Corepack/pnpm **10.34.6**, Git and an accessible Docker Engine/Compose v2 already available. Default loopback ports 3000, 3101, 5432 and 5433 must be free. Reviewed source: Checkpoint 1 `d7e5637f5c1619f8f7acc2f73f72adba41a43212`, 25 October 2026. See [requirements](system-requirements.md) and [verification scope](verification.md).

## Start a fresh local workspace

From a new parent directory:

```bash
git clone --branch docs/phase-19-complete-documentation --single-branch https://github.com/404usrnotfound/Trading-Journal.git Trading-Journal
cd Trading-Journal
corepack pnpm install --frozen-lockfile
corepack pnpm env:init
corepack pnpm db:up
corepack pnpm db:migrate
corepack pnpm db:check
corepack pnpm user:create --email owner@example.test --name 'Example Owner'
corepack pnpm dev
```

Use your identity and enter a private 12–128-character password at the hidden prompt. Keep the last command running. Open **http://localhost:3000/sign-in**, sign in and continue with [first run](first-run.md). The personal workspace is empty; no demo trades or starting capital are invented.

From another terminal, check:

```bash
curl --fail --silent --show-error http://localhost:3000/api/v1/health/live
curl --fail --silent --show-error http://127.0.0.1:3101/health/ready
```

After sign-in, opening `/api/v1/health/ready` in the same browser should return HTTP 200. Without authentication, HTTP 401 is expected. Ctrl+C in the application terminal stops web/worker; records remain in the database volume.

## Before adapting the commands

- An existing checkout/configuration is not a fresh install. Preserve its edits, `.env` and database volume. `env:init` does not replace or update existing configuration.
- For occupied ports, another Compose project, readonly caches, external PostgreSQL or built assets, follow the exact alternatives in [installation](installation.md).
- Existing shell variables take precedence over `.env`; keep origin, listener port and connection roles consistent. See [configuration](configuration.md).
- Docker here runs databases only. Production requires the separate [production source installation](installation.md#production-source-installation), trusted HTTPS and host validation; local HTTP is not that deployment.

The [verification record](verification.md) identifies the exact commands and isolated port/project overrides exercised. A short example does not expand platform support or close the production capacity gate.
