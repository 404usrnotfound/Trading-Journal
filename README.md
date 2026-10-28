# Trading Journal

A broker-independent trading journal with an exact-decimal ledger, versioned instruments and strategies, trade journals, account accounting and campaign analytics. It preserves source evidence and makes unsupported or incomplete financial results explicit.

## Implemented capabilities

- Provisioned-user authentication, isolated workspaces and owner/editor/viewer permissions.
- Broker/account/instrument setup, orders, executions, cash movements, actual FX conversions, fees, positions/lots and source corrections.
- Immutable strategy versions, plans, journals, private attachments, risk assessments, period reviews and statement reconciliation.
- Account/portfolio reporting, Dashboard analytics, reviewed CSV imports, duplicate checks, typed JSON/CSV exports and portable workspace backup/restore.
- Advanced explicit source entry, selected supplied analysis and a durable worker projection of native cash/quantity.

Browser and API availability differ. The [feature inventory](docs/feature-inventory.md), [user manual](docs/user-guide/README.md) and [financial capability reference](docs/instrument-capabilities.md) define the delivered scope. A family name or stored value does not establish automatic asset economics.

## Stack and requirements

TypeScript, Next.js/React, Node.js, PostgreSQL/Drizzle, Zod contracts, decimal financial kernels, pg-boss and Pino. The repository pins **Node 24.19.0** and **pnpm 10.34.6**; use Corepack and the full frozen dependency graph. PostgreSQL **17**, private local media and separate web/worker processes are required. Docker Engine/Compose v2 supplies local database services; it does not package the application.

Linux x86_64 has execution evidence. Other OS/CPU combinations and production hosts need separate verification. Default loopback ports are web **3000**, worker health **3101**, development database **5432** and disposable test database **5433**. See [system requirements](docs/getting-started/system-requirements.md) and [configuration](docs/getting-started/configuration.md) for permissions, network access and overrides.

## Quick installation and first launch

For a **new local Linux installation**, after installing prerequisites, run from a new parent directory:

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

Use your identity and enter a private password at the hidden prompt. Keep the last command running and open **http://localhost:3000/sign-in**. The initial workspace is empty. Follow [first run](docs/getting-started/first-run.md) and the [guided fictional example](docs/user-guide/guided-example.md). Ctrl+C stops the owned application launcher and preserves database records.

The [quick start](docs/getting-started/quick-start.md) and [installation guide](docs/getting-started/installation.md) own the detailed sequence, health checks, existing-checkout precautions and external PostgreSQL variant. Preserve existing configuration/data; `env:init` does not overwrite `.env`. This documentation branch is a review target, not an automatically approved production release. Production requires the separate [deployment procedure](docs/deployment.md).

## Development and testing

Run from repository root after setup. Database-backed tests require the four guarded `TEST_*` bindings targeting a separate, explicitly disposable database. Browser tests also require built assets and Chromium; see [testing](docs/developer-guide/testing.md) before running them.

| Task                             | Command                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Development web and worker       | `corepack pnpm dev`                                                                                                                   |
| Build application artifacts      | `corepack pnpm build`                                                                                                                 |
| API, style and types             | `corepack pnpm api:check`, `corepack pnpm format:check`, `corepack pnpm lint`, `corepack pnpm typecheck`                              |
| Unit, property and UI tests      | `corepack pnpm test:unit`                                                                                                             |
| PostgreSQL integration tests     | `corepack pnpm test:integration`                                                                                                      |
| Browser/accessibility tests      | `corepack pnpm test:e2e`                                                                                                              |
| Dependency advisory gate         | `corepack pnpm security:audit`                                                                                                        |
| Documentation links and examples | `node scripts/documentation/validate-documentation.mjs`; `node --import tsx scripts/documentation/generate-api-reference.mjs --check` |

Use [local development](docs/developer-guide/local-development.md) and [contributing](docs/developer-guide/contributing.md) for change boundaries. The [final documentation validation](docs/documentation-validation.md) records exact executions and limits; command availability alone is not a passing result.

## Documentation

Start at the [documentation index](docs/README.md): [getting started](docs/getting-started/quick-start.md), [user manual](docs/user-guide/README.md), [troubleshooting](docs/troubleshooting/README.md), [operations](docs/operations/README.md), [developer guide](docs/developer-guide/README.md), [API reference](docs/developer-guide/api-reference.md) and [glossary](docs/reference/glossary.md). The index also links financial definitions, architecture/ADRs, requirements and historical evidence.

## Security and known limitations

Keep `.env`, credentials, cookies, private media and broker/account data out of Git and shared logs. There is no public signup or default login. Preserve tenant authorization, Origin/CSRF, TLS and restricted database identities. Use [security operations](docs/operations/security-operations.md), [safe diagnostics](docs/troubleshooting/diagnostics.md) and tested backup/restore procedures before upgrades or recovery.

The locked graph has a documented **seven-advisory audit failure, including two critical findings**; **FA-04 production capacity remains open**. See [current validation and release decision](docs/documentation-validation.md) and the dated [security audit](docs/operations/verification.md#dependency-audit-failure). Passing functional tests does not clear these gates.

Live broker/feed/AI integrations, arbitrary runtime plugins, automatic advanced-asset lifecycle economics, a populated demo seed and universal database downgrade are unavailable. Selected campaign lifecycle/portfolio/correction tasks are API-only. Production TLS, offsite recovery, host compatibility and workload capacity require deployment-specific evidence.

## License

No license file or package license declaration is included in the reviewed repository.
