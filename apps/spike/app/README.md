# Spike Nex App Package

AI-powered code intelligence and repository analysis.

See SPIKE_DATA_MODEL.md for the complete data model and SPIKE_FRONTDOOR_INTEGRATION.md for credential/callback routing.

## Architecture: Service-Routed Mode

Spike uses **service-routed mode** per `NEX_ARCHITECTURE_AND_SDK_MODEL.md`. The Go engine binary IS the handler. The runtime dispatches all `spike.*` operations directly to the engine via HTTP. **No TypeScript proxy handlers.**

**Note**: The GitHub connector is implemented inline in the engine binary. There is no separate adapter binary. All connector operations are handled directly by `spike-engine`.

```
Runtime receives spike.ask
  → Pipeline: auth → IAM → validate params
  → POST http://localhost:{port}/operations/spike.ask
  → Go engine processes request
  → Response flows back through pipeline to caller
```

### Service: spike-engine (`bin/spike-engine`)

Core Go binary that handles ALL operations directly:

- **Core**: `spike.ask`, `spike.status`, `spike.sync`
- **Index Management**: `spike.indexes.*` (create, list, get, delete)
- **Jobs**: `spike.jobs.*` (get, list)
- **Repositories**: `spike.repositories.*` (get, list)
- **Refs**: `spike.repo-refs.*` (get, list)
- **Git Tracking**: `spike.mirrors.list`, `spike.worktrees.list`
- **Ask Requests**: `spike.ask-requests.*` (get, list, inspect, timeline)
- **Sessions**: `spike.sessions.*` (list, resolve, preview, patch, reset, delete, compact, import, import-chunk)
- **GitHub Connector**: `spike.connectors.github.*` (bind, get, install, repos, branches, commits, remove, setup)
- **GitHub Integration**: `spike.github.installations`, `spike.github.webhook`
- **Configuration**: `spike.config.*` (defaults, get, update)

## Lifecycle Hooks (TypeScript)

Hooks remain TypeScript (loaded via jiti at install/activate time):

- **install.ts** — Verify binaries exist
- **activate.ts** — Log activation
- **deactivate.ts** — Log deactivation
- **upgrade.ts** — Log upgrade (Go engine handles schema migrations internally)
- **uninstall.ts** — Archive data directory

## Environment Variables

Provided by runtime to the engine binary:
- `NEX_APP_DATA_DIR` — Persistent data directory for the engine's database
- `NEX_SERVICE_PORT` — Dynamic port assignment

## Product & Entitlements

### Plans
- **Free**: 3 repositories, 10 asks/day, 30-day retention
- **Pro**: Unlimited repositories, unlimited asks, 365-day retention

### Entitlements
- `repositories_max` — Maximum number of repositories
- `asks_per_day` — Daily ask request limit
- `retention_days` — Data retention period

**Note**: Product entitlements are defined but not yet enforced. All features are currently available during testing.
