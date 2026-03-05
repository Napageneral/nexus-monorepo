# Spike Nex App — Architecture Spec

> Describes the nex app packaging layer (manifest, directory structure, hooks, binary). For engine internals and data model, see SPIKE_DATA_MODEL.md.

> Long-term target architecture for Spike as a first-class nex app.
> No pragmatic shortcuts — this defines the correct final state.
>
> Last updated: 2026-03-04

## 1. Directory Structure

The current `apps/spike-app/` flat layout is replaced with a monorepo under `apps/spike/`:

```
apps/spike/
├── app/                          # The nex app package (service-routed)
│   ├── app.nexus.json            # Nex app manifest
│   ├── bin/
│   │   └── spike-engine          # Compiled Go binary (built from service/)
│   ├── hooks/                    # Lifecycle hooks (TypeScript, loaded via jiti)
│   │   ├── install.ts
│   │   ├── activate.ts
│   │   ├── deactivate.ts
│   │   ├── upgrade.ts
│   │   └── uninstall.ts
│   ├── ui/                       # Dashboard UI (served by nex runtime)
│   │   ├── index.html            # Runtime workspace (ported from Go embed)
│   │   └── inspector.html        # Ask inspector (ported from Go embed)
│   └── assets/
│       └── icon.svg
├── service/                      # Go source for the spike engine service
│   ├── cmd/
│   │   └── spike-engine/
│   │       └── main.go           # Entrypoint: CLI + nex service mode
│   ├── internal/                 # All internal packages (ported from spike project)
│   │   ├── prlm/                # PRLM oracle core (tree, store, node, history)
│   │   ├── broker/              # Ask broker, orchestrator, ledger, sessions
│   │   ├── control/             # Control plane (jobs, tree-versions, ask-requests)
│   │   ├── git/                 # Git adapter + low-level git ops
│   │   ├── ignore/              # .gitignore / .spikeignore pattern matching
│   │   └── tokenizer/           # Multi-provider tokenizer (anthropic, openai, google)
│   ├── go.mod                    # Module: github.com/Napageneral/spike (unchanged)
│   └── go.sum
├── product/                      # Marketing / landing page (deploys to Vercel)
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── package.json
│   └── vercel.json
└── admin/                        # Admin console nex app (skeleton)
    ├── app.nexus.json
    ├── hooks/
    └── ui/
```

### Why This Structure

- **Single folder per app**: One agent, one folder. Everything Spike lives under `apps/spike/`.
- **`app/` vs `service/` separation**: `app/` is what the nex runtime loads (the built artifact). `service/` is the Go source that produces `app/bin/spike-engine` (the build input). Clean boundary.
- **Go module path stays `github.com/Napageneral/spike`**: No import rewriting across ~100 files. The module path doesn't have to match filesystem location.
- **`product/` deploys independently**: Can be deployed to Vercel from `apps/spike/product/` without touching the nex app.
- **Parallel to GlowBot**: GlowBot uses `consumer/consumer-ui/admin/shared/website`. Spike uses `app/service/admin/product`. Different naming due to different app types (inline-TS vs service-routed) but same monorepo pattern.

### Replace Directives

The `go.mod` has a replace directive for `github.com/badlogic/pi-mono/go-coding-agent` (base agent library, used by Spike and nex runtime). After the move, this path just gets updated to the correct relative location from `apps/spike/service/`. No other changes needed.

## 2. Engine Binary — Nex Service Protocol

### Current State
The engine binary at `bin/spike-engine` is a **Node.js stub** (319 lines) that returns canned placeholder data. The real Spike engine is a Go binary at `~/nexus/home/projects/spike/cmd/spike/`.

### Target State
The Go binary natively speaks the nex service protocol via a thin **compatibility shim** — NOT a rewrite.

### Nex Service Protocol Contract

The runtime dispatches operations to the engine via HTTP:

```
GET  /health                      → { "status": "ok" }
POST /operations/{methodName}     → OperationRequest → OperationResponse
```

**OperationRequest envelope:**
```json
{
  "operation": "spike.ask",
  "payload": { "query": "...", "index_id": "..." },
  "user": { "userId": "...", "email": "...", "role": "..." },
  "account": { "accountId": "...", "displayName": "..." },
  "requestId": "req-uuid"
}
```

**OperationResponse envelope:**
```json
{ "result": { ... } }
// or
{ "error": { "code": "INTERNAL_ERROR", "message": "...", "details": null } }
```

### Shim Architecture

Spike already has 35+ HTTP endpoints, all `POST /path` with JSON request/response. The shim is a single Go HTTP handler (~100-150 lines) that:

1. Listens on `POST /operations/{methodName}`
2. Parses the `OperationRequest` envelope
3. Extracts `payload` and maps `methodName` → existing internal handler function
4. Calls the existing handler (same code path as current `POST /api/...` routes)
5. Wraps result in `OperationResponse` envelope
6. Adds `GET /health` (Spike already has health-check logic)

The existing `spike serve` mode with flat REST routes remains for local dev / backward compat. Nex mode is activated via:

```
spike-engine serve --nex --port {{port}}
```

Or detected automatically when `NEX_SERVICE_PORT` is set.

### Root Handler Fix (Prerequisite)

The nex proxy strips `/app/spike` and forwards bare `/` to the engine. Spike's Go mux currently has no handler for `/`, only `/app/` and `/app/spike/`. This causes a 404 in production right now.

**Fix**: Add root `/` handler that serves the runtime app HTML. Also update the SPA `apiPath()` to detect nex proxy mode (`window.location.pathname.match(/^(\/app\/[^/]+)/)`) and prefix API calls with `/app/spike/` instead of `/runtime/`.

### Method → Endpoint Mapping

| Nex Method | Current Spike Endpoint | Handler Location |
|---|---|---|
| `spike.ask` | `POST /ask` | `serve.go: handleAsk` |
| `spike.status` | `GET /status` | `serve.go: handleStatus` |
| `spike.sync` | `POST /sync` | `serve.go: handleSync` |
| `spike.indexes.create` | `POST /indexes/create` | `serve.go: handleIndexCreate` |
| `spike.indexes.list` | `POST /indexes/list` | `serve.go: handleIndexList` |
| `spike.indexes.get` | `POST /indexes/get` | `serve.go: handleIndexGet` |
| `spike.indexes.delete` | `POST /indexes/delete` | `serve.go: handleIndexDelete` |
| `spike.jobs.get` | `POST /jobs/get` | `serve.go: handleJobsGet` |
| `spike.jobs.list` | `POST /jobs/list` | `serve.go: handleJobsList` |
| `spike.repositories.get` | `POST /repositories/get` | `serve.go: handleRepoGet` |
| `spike.repositories.list` | `POST /repositories/list` | `serve.go: handleReposList` |
| `spike.repo-refs.get` | `POST /repo_refs/get` | `serve.go: handleRepoRefGet` |
| `spike.repo-refs.list` | `POST /repo_refs/list` | `serve.go: handleRepoRefsList` |
| `spike.mirrors.list` | `POST /mirrors/list` | `serve.go: handleMirrorsList` |
| `spike.worktrees.list` | `POST /worktrees/list` | `serve.go: handleWorktreesList` |
| `spike.ask-requests.get` | `POST /ask_requests/get` | `serve.go: handleAskRequestsGet` |
| `spike.ask-requests.list` | `POST /ask_requests/list` | `serve.go: handleAskRequestsList` |
| `spike.ask-requests.inspect` | `POST /ask_requests/inspect` | `serve.go: handleAskRequestsInspect` |
| `spike.ask-requests.timeline` | `POST /ask_requests/timeline` | `serve.go: handleAskRequestsTimeline` |
| `spike.sessions.*` | `POST /sessions/*` | `serve.go: handleSessions*` |
| `spike.connectors.github.*` | `POST /connectors/github/*` | `serve.go + github_connector.go` |
| `spike.github.installations` | `POST /github/installations` | `serve.go: handleGitHubInstallations` |
| `spike.github.webhook` | `POST /github/webhook` | `serve.go: handleGitHubWebhook` |
| `spike.config.defaults` | `POST /config/defaults` | `serve.go: handleConfigDefaults` |
| `spike.config.get` | `POST /config/get` | `serve.go: handleConfigGet` |
| `spike.config.update` | `POST /config/update` | `serve.go: handleConfigUpdate` |

## 3. Manifest (app.nexus.json)

The existing manifest is well-structured. Changes needed:

- **UI root**: Change from `dist` to `ui`
- **Service command**: `bin/spike-engine` with args `["serve", "--nex", "--port", "{{port}}"]`
- **Storage**: The engine uses a unified `spike.db` database (not per-index store.db files). All metadata, indexes, sessions, and git tracking in one SQLite file with WAL mode enabled.

The 30+ method definitions are already correct and match Go handlers 1:1. No changes needed.

**Note**: The GitHub connector is implemented inline in the engine binary. There is no separate `github-code-adapter` binary. Extraction into a modular adapter system is deferred for future work.

### Plans & Entitlements

Kept in manifest for structural reference. Enforcement is a **no-op** — everything free while testing. Fully deferred.

## 4. Dashboard UI (app/ui/)

### Current State
`dist/` contains a copy of the marketing landing page. This is NOT a dashboard.

### Target State
Two existing UIs extracted from Go binary embedded HTML strings:

1. **Runtime Workspace** (`runtime_app.go` → `runtimeAppHTML`) → `ui/index.html`
   - GitHub App connection flow
   - Repository / branch / commit selection
   - Hydrate orchestration (start, poll, status)
   - Ask oracle interface
   - Request timeline viewer

2. **Ask Inspector** (`control_ui.go` → `controlAskInspectorHTML`) → `ui/inspector.html`
   - Request-level forensic view
   - Root synthesis artifacts
   - Node timeline
   - Navigator (repos, refs, tree versions, ask requests)

### UI API Routing

When served by the nex runtime behind the frontdoor proxy, the SPA detects it's running under `/app/spike/` via `window.location.pathname` and prefixes API calls accordingly. The nex proxy strips `/app/spike` and forwards to the engine. The SPA `apiPath()` function needs to handle both modes:

- **Direct access** (local dev): `fetch("/status")`
- **Nex proxy mode**: `fetch("/app/spike/status")`

Detection: `window.location.pathname.match(/^(\/app\/[^/]+)/)`

## 5. Product Page (product/)

Ported from `spike/web/` to `apps/spike/product/`:
- Static HTML/CSS/JS marketing page
- Pricing display (Free/Pro plans — not enforced yet)
- Google OAuth redirect to frontdoor for sign-up
- Deploys independently to Vercel

## 6. Admin Console (admin/)

Skeleton for now:
- Minimal `app.nexus.json` with placeholder `admin.spike.*` methods
- Placeholder UI
- Built out once core app is stable

## 7. GitHub Connector — Inline First, Extract Later

The GitHub connector code (`spike.connectors.github.*` methods, ~800+ lines Go) stays **inline in the engine** during the initial port. This includes GitHub App auth, token minting, repo listing, branch/commit listing, webhook handling, and connector bindings.

Extraction into the `adapters/git/` adapter with platform modules (GitHub, GitLab, Bitbucket) is a follow-up step after the core restructure is complete.

## 8. Git Adapter (Deferred — Seed Spec)

Target: Single modular adapter at `adapters/git/` with:
- `core/` — Platform-agnostic git operations (mirror, worktree, diff)
- `platforms/github/` — GitHub App auth, webhooks, repo discovery
- `platforms/gitlab/` — (future)
- `platforms/bitbucket/` — (future)

Uses `nexadapter.Run()` SDK pattern. Platform modules register at startup. Generic git operations work with any remote URL.

**Implementation fully deferred until after core Spike restructure.**

## 9. Lifecycle Hooks

Existing hooks are correct. Minor updates:

- **install.ts**: Remove the `github-code-adapter` binary check (connector is inline in engine). Keep engine binary check.
- **Import paths**: Currently use relative `../../../nex/src/apps/context.js`. Will need updating when directory moves. Acceptable for now.

## 10. Adapter Renames

All adapters in `adapters/` drop the `nexus-adapter-` prefix:

| Current | Target |
|---|---|
| `adapters/nexus-adapter-github/` | `adapters/github/` |
| `adapters/nexus-adapter-gog/` | `adapters/gog/` |
| (future) | `adapters/git/` |

## 11. Tests

Full test suite carried over from `home/projects/spike/` into `service/`. Includes integration, security, session, webhook, and unit tests. Some path updates needed but logic is identical. The `eval/` directory (benchmark data) is not carried over.

## 12. What Gets Deleted After Port

Once everything is verified in `apps/spike/`:

```
~/nexus/home/projects/spike/                    # Entire original project
~/nexus/home/projects/nexus/apps/spike-app/     # Current flat layout
```

## 13. Non-Goals (Explicitly Deferred)

- **Pricing/billing enforcement** — Everything free while testing
- **UI polish** — Architecture and functionality first
- **Git adapter implementation** — Seed spec captured, build later
- **Next.js conversion** — Existing HTML/JS UIs work fine
- **Streaming/WebSocket** — POST/JSON is sufficient for now
