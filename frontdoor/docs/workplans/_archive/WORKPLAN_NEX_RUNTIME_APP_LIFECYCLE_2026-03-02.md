# Workplan: Nex Runtime App Lifecycle System

Date: 2026-03-02
Status: active
Owners: Nexus Platform
Depends on: NEX_APP_MANIFEST_AND_LIFECYCLE spec (confirmed)

---

## 1) Purpose

Build the entire manifest-driven app lifecycle system in the nex runtime. This is the foundational infrastructure that enables all nex apps (GlowBot, Spike, future products) to be self-describing, self-contained packages managed by the runtime via `app.nexus.json` manifests.

### Reference Specs

1. `NEX_APP_MANIFEST_AND_LIFECYCLE_2026-03-02.md` — Full target state for app manifest, lifecycle, SDK, services

### Approach

Hard cutover. The legacy `config.runtime.apps` system for product apps is killed. All product apps are manifest-driven. The Control app stays special-cased (built-in, no manifest).

### Key Decisions (locked)

| Decision | Outcome |
|----------|---------|
| Handler execution | **Two modes**: Service-routed (binary IS the handler, language-agnostic) for apps with services. Inline-TS (jiti, in-process) for lightweight TS-only apps. |
| Control app | Stays special. Not manifest-driven. |
| Config-driven apps | Killed for product apps. Manifest only. Hard cutover. |
| Service-routed mode | Primary model. Runtime dispatches operations directly to service binary via HTTP. No TS proxy layer. See NEX_ARCHITECTURE_AND_SDK_MODEL.md. |
| Inline-TS mode | Optimization for lightweight apps (e.g., GlowBot) that don't need an external process. |
| App package location | `nexus/apps/` — top-level directory, decoupled from runtime repo. |

---

## 2) Gap Inventory

### GAP-R01: No Manifest Parser

**Current state:** No code reads or validates `app.nexus.json`. The runtime has `nexus.plugin.json` for the plugin system — a completely different schema.

**Target state:** A manifest parser that reads `app.nexus.json`, validates all required fields, returns a typed `NexAppManifest` object. Validates: id format, semver version, method namespacing, handler path exists, ui.root exists, adapter binary paths exist, service binary paths exist.

**New file:** `nex/src/apps/manifest.ts`

---

### GAP-R02: No App Discovery

**Current state:** `resolveRuntimeApps()` in `runtime-apps.ts` reads `config.runtime.apps` from YAML config. No filesystem scanning for manifests.

**Target state:** Discovery scans `<appsDir>/` for directories containing `app.nexus.json`. Returns a list of discovered manifest paths. The apps directory is configurable (defaults to `~/.nex/apps/`).

**New file:** `nex/src/apps/discovery.ts`

**Kill:** The `resolveRuntimeApps()` function's product app logic. The function may remain for Control app only, or be replaced entirely.

---

### GAP-R03: No App Registry

**Current state:** No registry of loaded apps. The runtime tracks apps only as `RuntimeAppDescriptor` entries (display name, entry path, kind) — no lifecycle state, no manifest reference.

**Target state:** `AppRegistry` that holds all loaded app manifests, their lifecycle state (installing, active, inactive, failed, uninstalling), and provides lookup by app ID.

**New file:** `nex/src/apps/registry.ts`

---

### GAP-R04: No Method Handler Loading / Routing

**Current state:** All method handlers are statically imported in `server-methods.ts`:
```typescript
import { glowbotHandlers } from "./server-methods/glowbot.js";
export const coreRuntimeHandlers = { ...glowbotHandlers, ...otherHandlers };
```

Method handlers are compiled into the nex binary. No dynamic loading.

**Target state:** Two routing modes based on manifest configuration:

**Service-routed mode** (primary, e.g., Spike): The runtime constructs an HTTP dispatch handler for each declared method. When `spike.ask` arrives, the runtime POSTs the operation request to the service binary at `http://localhost:{port}/operations/spike.ask`. No TypeScript handler loading needed.

**Inline-TS mode** (e.g., GlowBot): Method handler modules loaded dynamically from app packages via `jiti`. The handler file (e.g., `./methods/index.ts`) exports a map of method name → handler function.

**Mode detection:** If manifest has `services` and no `handler` → service-routed. If manifest has `handler` and no `services` → inline-TS.

**New file:** `nex/src/apps/method-loader.ts` (inline-TS mode)
**New file:** `nex/src/apps/service-dispatch.ts` (service-routed mode — constructs HTTP dispatch handlers)

**Existing infrastructure:** `plugins/loader.ts` already uses jiti for dynamic TypeScript loading. Reuse for inline-TS mode.

---

### GAP-R05: GlowBot Handlers Hardcoded in Core

**Current state:**
- `server-methods/glowbot.ts` — 851 lines, 13 method handlers with full business logic and demo data generation
- `server-methods.ts` — `...glowbotHandlers` spread into `coreRuntimeHandlers`
- `runtime-operations.ts` — GlowBot operations hardcoded in `STATIC_RUNTIME_OPERATION_TAXONOMY` (lines 201-265)

All GlowBot logic is compiled into the nex core runtime.

**Target state:** Zero GlowBot code in nex core. GlowBot handlers live in the GlowBot app package (see WORKPLAN_GLOWBOT_NEX_APP_MIGRATION). The runtime dynamically loads them from the manifest.

**Files to modify:**
- `nex/src/nex/control-plane/server-methods.ts` — Remove `import { glowbotHandlers }` and the `...glowbotHandlers` spread
- `nex/src/nex/control-plane/server-methods/glowbot.ts` — Delete entirely (move to GlowBot app package)
- `nex/src/nex/control-plane/runtime-operations.ts` — Remove all `glowbot.*` entries from `STATIC_RUNTIME_OPERATION_TAXONOMY`

---

### GAP-R06: No IAM Auto-Generation

**Current state:** IAM entries are manually declared in `STATIC_RUNTIME_OPERATION_TAXONOMY`:
```typescript
"glowbot.overview": { kind: "control", action: "read", resource: "apps.glowbot.overview" },
"glowbot.funnel": { kind: "control", action: "read", resource: "apps.glowbot.funnel" },
// ... 13 more entries
```

Every new method requires a manual taxonomy entry.

**Target state:** IAM entries auto-generated from manifest:
```
For method "glowbot.overview" with action "read":
  → { kind: "control", action: "read", resource: "apps.glowbot.overview" }
```

The `STATIC_RUNTIME_OPERATION_TAXONOMY` contains only core runtime operations. App operations are generated at app load time and merged into the taxonomy.

**New file:** `nex/src/apps/iam-generator.ts`
**Modify:** `nex/src/nex/control-plane/runtime-operations.ts` — Support dynamic operation registration alongside static taxonomy
**Modify:** `nex/src/nex/control-plane/authz-taxonomy.ts` — Look up app operations in the dynamic registry

---

### GAP-R07: No UI Route Registration from Manifest

**Current state:** `http-control-browser-apps.ts` resolves app roots from config:
```typescript
const appRoot = resolveRuntimeAppRoot({ cfg, appId });
// serves static files from appRoot
```

Config-driven. The function looks up `config.runtime.apps[appId].root`.

**Target state:** UI routes registered from manifest's `ui.root` and `ui.entryPath`. The static file server (`handleStaticRuntimeAppHttpRequest`) stays — it's clean code — but it's driven by manifest data from the AppRegistry instead of config data.

**New file:** `nex/src/apps/ui-registrar.ts`
**Modify:** `nex/src/nex/control-plane/http-control-browser-apps.ts` — Use AppRegistry for app root lookup instead of config

---

### GAP-R08: No Adapter Registration from Manifest

**Current state:** Adapters loaded from `~/.nex.yaml` adapter config. No connection between app manifests and adapter registration.

**Target state:** For each adapter in the manifest's `adapters[]`:
1. Resolve binary path relative to app package
2. Register with the runtime's adapter manager
3. Adapter lifecycle tied to app lifecycle (start on activate, stop on deactivate)

**New file:** `nex/src/apps/adapter-registrar.ts`
**Modify:** `nex/src/nex/adapters/manager.ts` — Support registration from app manifests alongside config

---

### GAP-R09: No Service Management + Operation Dispatch

**Current state:** No concept of app-managed services anywhere in the runtime. No process management for app backend binaries. No operation dispatch to external processes.

**Target state:** Full service lifecycle management AND operation dispatch routing:

**Process management:**
- Spawn service process on app activate
- Port assignment and `{{port}}`/`{{dataDir}}` substitution
- Health check monitoring (periodic HTTP GET)
- Automatic restart on crash (3 retries)
- Graceful shutdown on app deactivate

**Operation dispatch (service-routed mode):**
- For each method in a service-routed app, construct an HTTP dispatch handler
- Dispatch format: `POST http://localhost:{port}/operations/{method.name}` with operation request body
- Standard request envelope: `{ operation, payload, user, account, requestId }`
- Standard response envelope: `{ result }` or `{ error }`
- Timeout handling (default 30s, configurable per method)

**New files:**
- `nex/src/apps/service-manager.ts` — Process spawning, health checking, restart logic
- `nex/src/apps/service-client.ts` — HTTP client for runtime → service communication
- `nex/src/apps/service-dispatch.ts` — Constructs operation dispatch handlers for service-routed methods

---

### GAP-R10: No Lifecycle Hooks

**Current state:** The plugin system has hooks (`plugins/hooks.ts`) but these are agent/message/tool/session/runtime hooks — NOT app lifecycle hooks. No `onInstall`, `onActivate`, `onUpgrade`, `onDeactivate`, `onUninstall`.

**Target state:** Lifecycle hook execution engine that:
1. Resolves hook module path from manifest
2. Loads the module via jiti
3. Calls the default export with a `NexAppHookContext`
4. Handles errors (hook failure → app marked as failed, not activated)

**New file:** `nex/src/apps/hooks.ts`

---

### GAP-R11: No App Context Construction

**Current state:** No `NexAppMethodContext` or `NexAppHookContext`. Method handlers receive `RuntimeRequestOptions` which is a generic runtime-level context.

**Target state:** Construct the typed app SDK context for each method call:
- `ctx.params` — validated request params
- `ctx.user` — caller identity (from frontdoor auth)
- `ctx.account` — account context
- `ctx.app` — app metadata (id, version, dataDir, packageDir, config, service client)
- `ctx.nex` — platform SDK (adapters, identity, entitlements, events, audit, runtime)

**New file:** `nex/src/apps/context.ts`

---

### GAP-R12: No Schema Validation for Method Params

**Current state:** No JSON Schema validation. Method handlers receive raw params and validate (or don't) themselves.

**Target state:** If a method declares `params` or `response` JSON Schema in the manifest, the runtime validates incoming params before calling the handler and optionally validates the response. Uses a standard JSON Schema validator (ajv).

**New file:** `nex/src/apps/schema-validator.ts`

---

### GAP-R13: No App Management API

**Current state:** No HTTP API for installing, uninstalling, upgrading, or listing apps. Frontdoor has no way to tell the runtime to install an app.

**Target state:** HTTP API endpoints on the runtime:
- `GET /api/apps` — List installed apps with state
- `POST /api/apps/install` — Install an app from a package reference
- `POST /api/apps/uninstall` — Uninstall an app
- `POST /api/apps/upgrade` — Upgrade an app to a new version
- `GET /api/apps/:appId/health` — App health status (including service health)

**New file:** `nex/src/apps/management-api.ts`

---

### GAP-R14: Config-Driven App System Still Alive

**Current state:** `config/types.runtime.ts` defines `RuntimeAppConfig` type. `runtime-apps.ts` reads from `config.runtime.apps`. This entire system needs to die for product apps.

**Target state:** `RuntimeAppConfig` type deleted. `config.runtime.apps` config section ignored for product apps. `resolveRuntimeApps()` either deleted or reduced to Control-app-only logic.

**Files to modify:**
- `nex/src/config/types.runtime.ts` — Remove `RuntimeAppConfig` or restrict to Control only
- `nex/src/nex/control-plane/runtime-apps.ts` — Rewrite or delete. Control app handling stays.
- All call sites that reference `config.runtime.apps` for product apps — update to use AppRegistry

---

## 3) Implementation Phases

### Phase 1: Foundation — Manifest + Discovery + Registry

**Goal:** The runtime can discover, parse, and track app manifests.

| Task | Gap | Estimate |
|------|-----|----------|
| Write manifest parser with full validation | GAP-R01 | 1 day |
| Write app discovery (scan appsDir for manifests) | GAP-R02 | 0.5 day |
| Write AppRegistry (state machine: installing → active → inactive → etc.) | GAP-R03 | 1 day |
| Write schema validator (ajv-based JSON Schema validation) | GAP-R12 | 0.5 day |
| Write app context constructor | GAP-R11 | 1 day |
| Unit tests for manifest parsing, discovery, registry | — | 1 day |

**Exit criteria:**
- Can scan a directory and parse valid manifests
- Registry tracks app state
- Invalid manifests produce clear error messages
- App context can be constructed from manifest + runtime state

### Phase 2: Method Routing + IAM

**Goal:** App methods are routed (service-routed OR inline-TS) and have auto-generated IAM.

| Task | Gap | Estimate |
|------|-----|----------|
| Write method handler loader for inline-TS mode (jiti-based dynamic import) | GAP-R04 | 1 day |
| Write service-dispatch module for service-routed mode (HTTP dispatch handler construction) | GAP-R04, R09 | 1 day |
| Write handler mode detection logic (services vs handler field) | GAP-R04 | 0.5 day |
| Write IAM auto-generator from manifest methods | GAP-R06 | 1 day |
| Wire both routing modes into runtime request router | GAP-R04 | 1 day |
| Support dynamic operation registration in taxonomy | GAP-R06 | 0.5 day |
| Integration test: inline-TS app method call with IAM check | — | 0.5 day |
| Integration test: service-routed app method dispatch with IAM check | — | 0.5 day |

**Exit criteria:**
- Inline-TS handlers loaded dynamically from TypeScript modules (GlowBot path)
- Service-routed operations dispatched to service binary via HTTP (Spike path)
- Handler mode correctly detected from manifest
- IAM entries auto-generated from manifest
- Method calls go through standard authz pipeline
- Namespace collision with core methods is rejected

### Phase 3: UI Serving + Adapter Registration

**Goal:** App UIs and adapters are registered from manifest.

| Task | Gap | Estimate |
|------|-----|----------|
| Write UI route registrar (manifest → static file server) | GAP-R07 | 0.5 day |
| Modify http-control-browser-apps to use AppRegistry lookup | GAP-R07 | 1 day |
| Write adapter registrar (manifest → adapter manager) | GAP-R08 | 1 day |
| Integration test: serve static UI from manifest, register adapters | — | 0.5 day |

**Exit criteria:**
- Static UI served at manifest's entryPath from manifest's ui.root
- SPA fallback works
- Adapters registered and manageable through runtime adapter system
- `/_next/` asset rewriting works for Next.js apps

### Phase 4: Service Management + Dispatch

**Goal:** App backend services are managed by the runtime. Service-routed operations dispatch to them.

| Task | Gap | Estimate |
|------|-----|----------|
| Write service manager (spawn, health check, restart, shutdown) | GAP-R09 | 2 days |
| Write service client (HTTP client for runtime → service communication) | GAP-R09 | 0.5 day |
| Port assignment, {{port}} and {{dataDir}} substitution | GAP-R09 | 0.5 day |
| Define operation request/response envelope format | GAP-R09 | 0.5 day |
| Wire service-dispatch handlers into method router for service-routed apps | GAP-R04, R09 | 1 day |
| Wire service client into app context for inline-TS apps (`ctx.app.service()`) | GAP-R09, R11 | 0.5 day |
| Integration test: start service, health check, dispatch operation, get response | — | 0.5 day |

**Exit criteria:**
- Services spawned on app activate, stopped on deactivate
- Health checks running on configured interval
- Automatic restart on crash (with retry limit)
- Service-routed operations dispatched to service binary and response returned to caller
- Inline-TS apps can still call services via `ctx.app.service()` (GlowBot future-proofing)
- Unhealthy service returns ServiceUnavailable to callers
- Standard operation envelope documented and implemented

### Phase 5: Lifecycle Hooks

**Goal:** Apps can run code at install, upgrade, activate, deactivate, uninstall.

| Task | Gap | Estimate |
|------|-----|----------|
| Write lifecycle hook executor (jiti load + call with context) | GAP-R10 | 1 day |
| Wire hooks into app install/upgrade/activate/deactivate/uninstall flows | GAP-R10 | 1 day |
| Error handling: hook failure → app marked as failed | GAP-R10 | 0.5 day |
| Integration test: install with hook, activate with hook, upgrade with hook | — | 0.5 day |

**Exit criteria:**
- All 5 lifecycle hooks execute at correct times
- Hook context provides full SDK access
- Hook failures prevent app from activating
- Hook errors are logged with clear diagnostics

### Phase 6: Management API + Bleach Core

**Goal:** Frontdoor can manage apps via API. GlowBot code removed from core.

| Task | Gap | Estimate |
|------|-----|----------|
| Write management API (install/uninstall/upgrade/list/health) | GAP-R13 | 1.5 days |
| Delete `server-methods/glowbot.ts` from nex core | GAP-R05 | 0.5 day |
| Remove glowbot entries from `STATIC_RUNTIME_OPERATION_TAXONOMY` | GAP-R05 | 0.5 day |
| Remove `...glowbotHandlers` from `coreRuntimeHandlers` | GAP-R05 | 0.5 day |
| Kill config-driven app registration for product apps | GAP-R14 | 1 day |
| Remove or restrict `RuntimeAppConfig` type | GAP-R14 | 0.5 day |
| End-to-end test: install app via API, verify methods work, uninstall | — | 1 day |

**Exit criteria:**
- Frontdoor can install/uninstall/upgrade apps via HTTP API
- Zero GlowBot code in nex core runtime
- `config.runtime.apps` no longer used for product apps
- Control app still works (special-cased)
- Full app lifecycle works end-to-end

---

## 4) Phase Dependencies

```
Phase 1: Foundation (manifest, discovery, registry, context)
    ↓
Phase 2: Method Loading + IAM
    ↓
Phase 3: UI Serving + Adapters ←── (can start after Phase 1, parallel with Phase 2)
    ↓
Phase 4: Service Management ←── (can start after Phase 1, parallel with Phase 2/3)
    ↓
Phase 5: Lifecycle Hooks ←── (needs Phase 1 + context; can parallel with Phase 3/4)
    ↓
Phase 6: Management API + Bleach Core ←── (needs all previous phases)
```

Critical path: Phase 1 → Phase 2 → Phase 6

Phases 3, 4, 5 can be developed in parallel after Phase 1 is complete.

---

## 5) New Files Summary

All new files live under `nex/src/apps/`:

| File | Purpose | Phase |
|------|---------|-------|
| `manifest.ts` | Parse and validate `app.nexus.json` (including handler mode detection) | 1 |
| `discovery.ts` | Scan appsDir for manifests | 1 |
| `registry.ts` | App registry with lifecycle state | 1 |
| `context.ts` | Construct `NexAppMethodContext` and `NexAppHookContext` | 1 |
| `schema-validator.ts` | JSON Schema validation for method params | 1 |
| `method-loader.ts` | Dynamic TypeScript module loading via jiti (inline-TS mode) | 2 |
| `service-dispatch.ts` | Construct HTTP dispatch handlers for service-routed methods | 2 |
| `iam-generator.ts` | Auto-generate IAM entries from manifest | 2 |
| `ui-registrar.ts` | Register static file serving routes | 3 |
| `adapter-registrar.ts` | Register adapters from manifest | 3 |
| `service-manager.ts` | Spawn, health-check, restart services | 4 |
| `service-client.ts` | HTTP client for runtime → service communication | 4 |
| `hooks.ts` | Lifecycle hook execution | 5 |
| `management-api.ts` | HTTP API for install/uninstall/upgrade/list | 6 |

---

## 6) Files Modified

| File | Change | Phase |
|------|--------|-------|
| `server-methods.ts` | Remove `glowbotHandlers` import and spread | 6 |
| `server-methods/glowbot.ts` | **Delete** (move to GlowBot app package) | 6 |
| `runtime-operations.ts` | Remove glowbot entries, support dynamic registration | 2, 6 |
| `authz-taxonomy.ts` | Look up app operations in dynamic registry | 2 |
| `http-control-browser-apps.ts` | Use AppRegistry for app root/proxy lookup | 3 |
| `runtime-apps.ts` | Rewrite: manifest-driven + Control-only special case | 6 |
| `config/types.runtime.ts` | Remove or restrict `RuntimeAppConfig` | 6 |
| `nex/adapters/manager.ts` | Support registration from app manifests | 3 |

---

## 7) Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| jiti dynamic import breaks on some handler modules | Medium | Pin jiti version, test with various module styles. Fallback: require() |
| Service process management complexity (zombies, port conflicts) | Medium | Use process groups, kill on deactivate. Port conflict detection at startup. |
| Removing glowbot from core breaks existing runtime users | None | Hard cutover. No one is using this yet. Clean break. |
| App manifest schema evolution (adding fields later) | Low | `requires.nex` version gating. Ignore unknown fields. |
| Circular dependency: app context needs runtime, runtime needs app | Medium | Dependency injection. App context constructed by runtime, passed to handlers. |

---

## 8) What This Workplan Does NOT Cover

- **GlowBot app package creation** — Covered by WORKPLAN_GLOWBOT_NEX_APP_MIGRATION
- **Spike app package creation** — Covered by WORKPLAN_SPIKE_NEX_APP_MIGRATION
- **Product registry sync** — Covered by WORKPLAN_PRODUCT_REGISTRY_SYNC
- **Frontdoor changes** — Covered by WORKPLAN_FRONTDOOR_ARCHITECTURE_GAPS
- **App version rollout / blue-green** — Separate spec pending
- **App sandboxing** — Future concern (V2)
- **Nex App SDK npm package** — Deferred until after core architecture
