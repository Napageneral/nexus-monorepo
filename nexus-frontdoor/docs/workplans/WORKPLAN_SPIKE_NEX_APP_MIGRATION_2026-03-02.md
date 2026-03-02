# Workplan: Spike Migration to Nex App Package

Date: 2026-03-02
Status: active
Owners: Nexus Platform
Depends on: WORKPLAN_NEX_RUNTIME_APP_LIFECYCLE (runtime must support manifest-driven apps + services)
Scope: Infrastructure impact only. Deep Spike product work deferred.

---

## 1) Purpose

Migrate Spike from a standalone Go server to a nex app package with a TypeScript frontend, Go backend service, and extracted GitHub adapter. This workplan focuses on the **infrastructure and interface decisions** that affect the shared nex platform — not on deep Spike product work.

### Current Architecture

```
┌───────────────────────────────────────┐
│           Spike (Go Binary)            │
│                                        │
│  cmd/spike/serve.go   (~30 endpoints)  │
│  cmd/spike/runtime_app.go (inline UI)  │
│  cmd/spike/control_ui.go  (inline UI)  │
│  cmd/spike/github_connector.go         │
│  internal/prlm/       (core engine)    │
│  Own SQLite, own sessions, own auth    │
└───────────────────────────────────────┘
```

### Target Architecture

```
┌──────────────────────────────────────────┐
│          spike-app/ (Nex App)            │
│                                          │
│  app.nexus.json         (manifest)       │
│                                          │
│  dist/                  (Nex UI)         │
│    TypeScript/React static frontend      │
│                                          │
│  methods/               (TS handlers)    │
│    Thin proxies to Go engine service     │
│                                          │
│  bin/                                    │
│    spike-engine         (Nex Service)    │
│    github-code-adapter  (Nex Adapter)    │
│                                          │
│  hooks/                 (lifecycle)      │
└──────────────────────────────────────────┘
        │
        ▼ discovered by
┌──────────────────────────────────────────┐
│            Nex Runtime                   │
│  (manages Go service + adapter + UI)     │
└──────────────────────────────────────────┘
```

### Three Building Blocks

| Block | Technology | Role |
|-------|-----------|------|
| **Nex UI** | TypeScript/React static export | User-facing frontend served by nex |
| **Nex Service** | Go binary (`spike-engine`) | PRLM engine, hydration, code intelligence — the compute backend |
| **Nex Adapter** | Go binary (`github-code-adapter`) | GitHub connector — external data source |

---

## 2) Gap Inventory

### GAP-S01: Spike is a Monolithic Go Binary

**Current state:** Single Go binary does everything: HTTP server, UI serving, session management, SQLite persistence, PRLM computation, GitHub integration, webhook handling, MCP server mode.

**Target state:** The binary splits into:
- **spike-engine** — Focused Go binary: PRLM engine, hydration pipeline, code intelligence. Exposes HTTP API on localhost for TS handlers to call. No UI serving, no session management (nex handles that).
- **github-code-adapter** — Extracted GitHub connector. Standalone Go binary using Nex Adapter SDK protocol (JSONL stdin/stdout or HTTP).

**What gets removed from the Go binary:**
- HTTP server + routing (nex handles request routing)
- Session management (nex handles auth/sessions via frontdoor)
- UI serving — inline HTML in `runtime_app.go` and `control_ui.go` (replaced by TypeScript frontend)
- Auth/authz logic (nex IAM handles this)

**What stays in the Go binary (spike-engine):**
- `internal/prlm/` — Core PRLM engine (the product's IP)
- Hydration pipeline
- Code intelligence and analysis
- SQLite persistence for indexed data
- HTTP API surface for method handlers to call

---

### GAP-S02: Inline HTML UIs → TypeScript Frontend

**Current state:** Two UIs embedded as Go string literals:
- `runtime_app.go` (~810 lines) — Main workspace UI
- `control_ui.go` (~824 lines) — Ask inspector UI

**Target state:** A proper TypeScript/React static frontend in `dist/`. The UI connects to Spike's methods via the nex client SDK, not via direct HTTP to the Go binary.

**Migration approach:**
1. Extract the UI designs from the Go string literals
2. Rebuild as a React/Next.js static app
3. Use nex client SDK for all method calls (spike.ask, spike.repos.list, etc.)
4. Static export to `dist/`

---

### GAP-S03: ~30 HTTP Endpoints → Nex Methods

**Current state:** `serve.go` defines ~30 REST endpoints (GET/POST/PUT/DELETE) for repos, hydration, ask, profiles, sessions, etc.

**Target state:** Each endpoint becomes a nex method declared in the manifest. TypeScript method handlers are thin proxies that call the Go engine service:

```typescript
// methods/ask.ts
export const handle: NexAppMethodHandler = async (ctx) => {
  return ctx.app.service("engine").post("/ask", ctx.params);
};
```

**Why nex methods (not direct HTTP)?** Every method gets IAM, audit logging, entitlement checking, JSON Schema validation, MCP tool exposure, CLI access — for free. The thin proxy cost is minimal (3-5 lines per handler).

---

### GAP-S04: GitHub Connector Extraction

**Current state:** GitHub connector is `github_connector.go` — compiled into the main Spike binary. Handles repo cloning, webhook listening, PR event processing.

**Target state:** Extracted as a standalone Nex Adapter binary (`github-code-adapter`). Uses the Nex Adapter SDK for Go. Communicates with the runtime via the standard adapter protocol.

**Extraction approach:**
1. Move GitHub connector logic to a new `cmd/github-code-adapter/` directory
2. Implement the Nex Adapter SDK interface (info, health, connect, events, etc.)
3. Spike's method handlers use `ctx.nex.adapters` to interact with the GitHub adapter
4. The manifest's `adapters[]` section declares the github-code-adapter binary

---

### GAP-S05: Session/Auth Delegation to Nex

**Current state:** Spike manages its own sessions, auth tokens, and user profiles.

**Target state:** Authentication and session management are handled by nex (via frontdoor OIDC). Spike's method handlers receive user context via `ctx.user` and `ctx.account`. Spike's user profile becomes account-scoped configuration, not a separate auth system.

---

### GAP-S06: Manifest Creation

**Current state:** No `app.nexus.json` exists.

**Target state:** Full manifest with:
- ~30 method declarations
- 1 service (spike-engine)
- 1 adapter (github-code-adapter)
- Lifecycle hooks
- Product registry (plans, pricing, branding)
- Entitlement definitions

---

## 3) Implementation Phases

### Phase 1: Manifest + Package Structure

| Task | Gap | Estimate |
|------|-----|----------|
| Create `spike-app/` directory structure | — | 0.5 day |
| Write `app.nexus.json` manifest (~30 methods, 1 service, 1 adapter) | GAP-S06 | 1 day |
| Define entitlements and product plans | GAP-S06 | 0.5 day |

### Phase 2: Shrink the Go Binary → spike-engine

| Task | Gap | Estimate |
|------|-----|----------|
| Create `cmd/spike-engine/` focused binary | GAP-S01 | 2 days |
| Remove UI serving, session management, auth from engine | GAP-S01 | 1 day |
| Define HTTP API surface for TS handlers | GAP-S01 | 1 day |
| Add `/health` endpoint for service monitoring | GAP-S01 | 0.5 day |
| Remove GitHub connector from main binary | GAP-S04 | 0.5 day |

### Phase 3: Extract GitHub Adapter

| Task | Gap | Estimate |
|------|-----|----------|
| Create `cmd/github-code-adapter/` | GAP-S04 | 1 day |
| Implement Nex Adapter SDK interface | GAP-S04 | 2 days |
| Migrate cloning, webhook, PR event logic | GAP-S04 | 1 day |
| Integration test: adapter connects, events flow | GAP-S04 | 0.5 day |

### Phase 4: TypeScript Method Handlers

| Task | Gap | Estimate |
|------|-----|----------|
| Write thin proxy handlers for all ~30 methods | GAP-S03 | 1.5 days |
| Write `methods/index.ts` handler map | GAP-S03 | 0.5 day |
| Add entitlement checks to appropriate handlers | GAP-S03 | 0.5 day |

### Phase 5: TypeScript Frontend

| Task | Gap | Estimate |
|------|-----|----------|
| Extract UI designs from Go string literals | GAP-S02 | 1 day |
| Rebuild as React static app with nex client SDK | GAP-S02 | 3-5 days |
| Static export to dist/ | GAP-S02 | 0.5 day |

### Phase 6: Lifecycle Hooks + Integration

| Task | Gap | Estimate |
|------|-----|----------|
| Write lifecycle hooks (install, activate, deactivate, upgrade) | — | 1 day |
| End-to-end test: install Spike app, verify service starts, methods work | — | 1 day |
| Verify frontdoor app frame works with Spike UI | — | 0.5 day |
| Verify GitHub adapter registered and manageable | — | 0.5 day |

---

## 4) Infrastructure Implications

These are the aspects of Spike migration that directly affect the shared nex platform:

### 4.1 Service Manager Requirements

Spike's Go engine is the primary use case for the Nex Service concept. The runtime service manager (built in WORKPLAN_NEX_RUNTIME_APP_LIFECYCLE Phase 4) must support:
- Spawning a Go binary as a managed process
- Port assignment and health check monitoring
- Graceful shutdown (SIGTERM → wait → SIGKILL)
- Service client in app context (`ctx.app.service("engine")`)

### 4.2 Adapter SDK for Go

The GitHub adapter extraction requires a Go implementation of the Nex Adapter SDK. This may already exist (the current adapter binaries in GlowBot are Go). If not, this is a shared infrastructure deliverable.

### 4.3 Method Count Scale

Spike has ~30 methods — significantly more than GlowBot's 13. The manifest parser, IAM generator, and method loader must handle this scale without performance issues. (Should be trivial, but worth testing.)

### 4.4 Data Directory for Go Service

The Go engine needs persistent storage (SQLite databases for indexed code data). This maps to `ctx.app.dataDir` — the runtime provides a persistent data directory per app. The engine binary needs to know where this directory is (passed via command-line arg or environment variable).

Recommended: Add env var `NEX_APP_DATA_DIR` to the service's environment, set by the runtime.

---

## 5) What This Workplan Does NOT Cover (Deferred)

- **Deep Spike product work** — UI design, PRLM algorithm improvements, new features
- **MCP server mode** — Spike as an MCP tool provider (separate distribution concern)
- **Multi-language adapter SDK** — Go Adapter SDK is needed but is a shared concern
- **Performance optimization** — Baseline first, optimize later

---

## 6) Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Go engine binary is complex to extract from monolith | High | Incremental extraction. Start with core PRLM, add endpoints iteratively. |
| GitHub connector has tight coupling to Spike internals | Medium | Define clean interface boundary. Adapter communicates via events, not internal APIs. |
| TypeScript frontend rebuild is significant work | Medium | Can be phased. Start with basic UI, iterate. |
| 30 thin proxy handlers feel like boilerplate | Low | Worth it for IAM, audit, entitlements. Could code-gen from manifest later. |
| Go engine needs runtime env vars (data dir, port) | Low | Standard pattern: NEX_APP_DATA_DIR, NEX_SERVICE_PORT env vars. |
