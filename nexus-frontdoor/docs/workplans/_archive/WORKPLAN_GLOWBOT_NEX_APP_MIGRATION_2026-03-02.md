# Workplan: GlowBot Migration to Nex App Package

Date: 2026-03-02
Status: active
Owners: Nexus Platform
Depends on: WORKPLAN_NEX_RUNTIME_APP_LIFECYCLE (runtime must support manifest-driven apps)

---

## 1) Purpose

Migrate GlowBot from its current state — handlers hardcoded in the nex runtime + Next.js app with API route bridges — to a proper self-contained nex app package driven by `app.nexus.json`.

**Handler mode:** GlowBot uses **inline-TS mode** (not service-routed). GlowBot has no service binary — it's a UI built on top of the base nex runtime adapters. Its TypeScript handlers ARE the implementation, loaded via jiti in-process. This is the correct mode per the architecture spec for lightweight apps without an external compute backend.

### Current Architecture

```
┌────────────────────────────┐    ┌─────────────────────────────┐
│      Nex Runtime Core      │    │     GlowBot (Next.js)       │
│                            │    │                             │
│  server-methods/glowbot.ts │    │  src/app/api/runtime/       │
│  (851 lines, 13 handlers,  │    │    adapter-connections/     │
│   demo data generation)    │    │    (API route bridges)      │
│                            │    │                             │
│  runtime-operations.ts     │    │  src/lib/nex-client.ts      │
│  (glowbot.* IAM entries)   │    │  (WebSocket RPC to runtime) │
│                            │    │                             │
│  server-methods.ts         │    │  src/lib/glowbot/           │
│  (...glowbotHandlers)      │    │    contracts.ts             │
│                            │    │    methods.ts (RPC wrappers)│
│  runtime/nex.glowbot.yaml  │    │                             │
│  (adapter config)          │    │  runtime/bin/               │
│                            │    │    (6 adapter binaries)     │
└────────────────────────────┘    └─────────────────────────────┘
```

### Target Architecture

```
┌──────────────────────────────────────┐
│   apps/glowbot-app/ (Nex App)       │
│                                      │
│  app.nexus.json (manifest)           │
│   → handler: ./methods/index.ts      │
│   → inline-TS mode (no services)     │
│                                      │
│  methods/        (13 handlers)       │
│  pipeline/       (business logic)    │
│  hooks/          (lifecycle)         │
│  bin/            (6 adapter bins)    │
│  dist/           (static UI export)  │
│  assets/         (icon, logo)        │
└──────────────────────────────────────┘
        │
        ▼ discovered by
┌──────────────────────────────────────┐
│          Nex Runtime                 │
│  (zero GlowBot code in core)        │
│  loads TS handlers via jiti          │
└──────────────────────────────────────┘
```

---

## 2) Gap Inventory

### GAP-G01: Method Handlers Live in Nex Core

**Current state:** 13 GlowBot method handlers in `nex/src/nex/control-plane/server-methods/glowbot.ts` (~851 lines). Includes synthetic demo data, pipeline status, adapter connection logic.

**Target state:** These handlers move to `glowbot-app/methods/`. Each handler becomes a `NexAppMethodHandler` that receives `NexAppMethodContext` instead of `RuntimeRequestOptions`.

**Migration approach:**
1. Copy handler logic from `server-methods/glowbot.ts` to `glowbot-app/methods/`
2. Refactor to use `NexAppMethodContext` (ctx.params, ctx.nex.adapters, ctx.app.dataDir)
3. Split into logical files (overview.ts, funnel.ts, modeling.ts, agents.ts, integrations.ts, pipeline.ts)
4. Export handler map from `methods/index.ts`
5. Delete `server-methods/glowbot.ts` from nex core (covered by runtime workplan GAP-R05)

---

### GAP-G02: Next.js API Route Bridges

**Current state:** GlowBot has app-local API routes (e.g., `src/app/api/runtime/adapter-connections/route.ts`) that bridge HTTP requests to nex runtime WebSocket RPC calls. These exist because the method handlers live in the runtime, and the Next.js app needs to reach them.

**Target state:** These bridges are unnecessary. The frontend uses the nex client SDK to call methods directly. Method calls route through the nex runtime to the app's handlers. All API route bridge files get deleted.

**Files to delete:**
- `glowbot/src/app/api/runtime/adapter-connections/route.ts`
- Any other `src/app/api/runtime/` bridges
- `glowbot/src/lib/runtime/frontdoor-ws-rpc.ts` (frontdoor WebSocket bridge)

---

### GAP-G03: Static Export

**Current state:** GlowBot runs as a Next.js dev server or SSR server. It has both client-side and server-side rendering. The app expects a live Node.js server.

**Target state:** GlowBot's UI is statically exported (`next export` / `output: 'export'` in next.config.ts). The result is a `dist/` directory of HTML, JS, CSS files served by the nex runtime's static file server.

**Changes needed:**
- `glowbot/next.config.ts` — Add `output: 'export'`
- Remove any `getServerSideProps` or server components that require a runtime
- Replace any server-side data fetching with client-side nex method calls
- Build: `next build` → produces `out/` (or `dist/`) directory

---

### GAP-G04: Adapter Binaries Packaging

**Current state:** 6 adapter binaries in `glowbot/runtime/bin/`. Adapter config in `glowbot/runtime/nex.glowbot.yaml`.

**Target state:** Adapter binaries move to `glowbot-app/bin/`. The `nex.glowbot.yaml` config is replaced by the manifest's `adapters[]` section. The runtime reads adapter declarations from the manifest and registers them with the adapter manager.

**Migration:**
1. Copy binaries to `glowbot-app/bin/`
2. Map nex.glowbot.yaml entries to manifest adapter declarations
3. Delete `runtime/nex.glowbot.yaml`

---

### GAP-G05: Lifecycle Hooks Missing

**Current state:** No lifecycle hooks exist for GlowBot. Database schema creation, pipeline scheduling, and adapter reconnection happen ad-hoc or via the runtime's initialization.

**Target state:**
- `onInstall` — Create GlowBot SQLite database, seed schema, seed initial data
- `onActivate` — Start pipeline scheduler, reconnect adapter monitors
- `onDeactivate` — Stop pipeline scheduler, flush pending state
- `onUpgrade` — Run SQL migrations for new version
- `onUninstall` — Archive data directory, stop all adapter processes

**New files:** `glowbot-app/hooks/install.ts`, `activate.ts`, `deactivate.ts`, `upgrade.ts`, `uninstall.ts`

---

### GAP-G06: Frontend Connection Pattern

**Current state:** GlowBot frontend uses:
- `src/lib/nex-client.ts` — RPC client that calls methods via the frontdoor WebSocket bridge
- `src/lib/glowbot/contracts.ts` — Method name constants and typed params

**Target state:** Frontend uses a standard nex client SDK for method calls. The SDK connects to the nex runtime WebSocket and calls methods by name. This is essentially what `nex-client.ts` already does — it just needs to be standardized.

**Approach:** For V1, keep the existing `nex-client.ts` with minor refactoring to match the nex client SDK interface. Replace with the official `@nexus/client-sdk` npm package when it exists.

---

### GAP-G07: Manifest Creation

**Current state:** No `app.nexus.json` exists for GlowBot.

**Target state:** Full manifest per the spec. This is already fully defined in the NEX_APP_MANIFEST spec — the GlowBot example manifest is the canonical reference.

**File:** `glowbot-app/app.nexus.json`

---

## 3) Implementation Phases

### Phase 1: Create App Package Structure

| Task | Gap | Estimate |
|------|-----|----------|
| Create `apps/glowbot-app/` directory structure | — | 0.5 day |
| Write `app.nexus.json` manifest | GAP-G07 | 0.5 day |
| Copy adapter binaries to `bin/` | GAP-G04 | 0.5 day |
| Create `assets/` with icon and logo | — | 0.5 day |

### Phase 2: Migrate Method Handlers

| Task | Gap | Estimate |
|------|-----|----------|
| Copy handler logic from `server-methods/glowbot.ts` | GAP-G01 | 1 day |
| Refactor to `NexAppMethodHandler` signature | GAP-G01 | 1 day |
| Split into logical files (overview, funnel, pipeline, etc.) | GAP-G01 | 0.5 day |
| Write `methods/index.ts` handler map export | GAP-G01 | 0.5 day |
| Move pipeline business logic to `pipeline/` | GAP-G01 | 0.5 day |

### Phase 3: Static Export + Frontend Cleanup

| Task | Gap | Estimate |
|------|-----|----------|
| Configure Next.js for static export | GAP-G03 | 0.5 day |
| Remove server-side rendering dependencies | GAP-G03 | 1 day |
| Delete API route bridges | GAP-G02 | 0.5 day |
| Verify client-side method calls work with nex client | GAP-G06 | 0.5 day |
| Build and verify static export produces valid dist/ | GAP-G03 | 0.5 day |

### Phase 4: Lifecycle Hooks

| Task | Gap | Estimate |
|------|-----|----------|
| Write onInstall (schema creation, seed data) | GAP-G05 | 0.5 day |
| Write onActivate (pipeline scheduler, adapter monitors) | GAP-G05 | 0.5 day |
| Write onDeactivate (stop scheduler, flush state) | GAP-G05 | 0.5 day |
| Write onUpgrade (SQL migration runner) | GAP-G05 | 0.5 day |
| Write onUninstall (archive data) | GAP-G05 | 0.5 day |

### Phase 5: Integration Test

| Task | Gap | Estimate |
|------|-----|----------|
| Install GlowBot app via management API | — | 0.5 day |
| Verify all 13 methods callable through nex | — | 0.5 day |
| Verify static UI served at /app/glowbot/ | — | 0.5 day |
| Verify adapters registered and manageable | — | 0.5 day |
| Verify lifecycle hooks execute correctly | — | 0.5 day |
| Verify frontdoor app frame injection works | — | 0.5 day |

---

## 4) Phase Dependencies

```
Phase 1: Package Structure
    ↓
Phase 2: Method Handlers ←── (needs runtime app lifecycle Phase 2 complete)
    ↓
Phase 3: Static Export ←── (can parallel with Phase 2)
    ↓
Phase 4: Lifecycle Hooks ←── (needs runtime app lifecycle Phase 5 complete)
    ↓
Phase 5: Integration Test ←── (needs runtime app lifecycle Phase 6 complete)
```

**External dependency:** This workplan requires the nex runtime app lifecycle system (WORKPLAN_NEX_RUNTIME_APP_LIFECYCLE) to be built first. Specifically:
- Phase 2 needs runtime Phases 1-2 (manifest parsing, method loading)
- Phase 4 needs runtime Phase 5 (lifecycle hooks)
- Phase 5 needs runtime Phase 6 (management API)

---

## 5) Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Static export breaks dynamic features | Medium | Audit all pages for server-side dependencies before export. Replace with client-side equivalents. |
| Demo/synthetic data logic is tightly coupled to runtime internals | Low | The demo data is self-contained in glowbot.ts. Copy as-is, refactor to use app context. |
| Adapter binary paths change | Low | Manifest declares relative paths. Just ensure binaries are in the right directory. |
| Pipeline scheduler needs runtime access | Low | Pipeline scheduler uses nex SDK (adapters, events). Available via hook/handler context. |
