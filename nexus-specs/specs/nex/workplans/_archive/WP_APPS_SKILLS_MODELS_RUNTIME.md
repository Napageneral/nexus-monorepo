# Workplan: Apps, Skills, Models, Runtime, PubSub, Events & Chat

**Status:** COMPLETED — commit f27b7d8c0
**Created:** 2026-03-04
**Spec References:**
- [API_DESIGN_BATCH_5.md](../API_DESIGN_BATCH_5.md) (Apps 9 ops, Skills 3 ops, Models 2 ops, Runtime 2 ops)
- [API_DESIGN_DECISIONS.md](../API_DESIGN_DECISIONS.md) (Batch 1 -- Events 5 ops, PubSub 3 ops, Chat 3 ops)
- [RESOLVED_DECISIONS.md](../RESOLVED_DECISIONS.md) (pubsub.publish client-facing, events.emit dropped, plural naming)

**Dependencies:**
- WP_CREDENTIAL_SYSTEM -- models.list computed from active credentials
- WP_WORK_DOMAIN_UNIFICATION -- status output shape includes jobs/cron/DAGs

---

## Goal

Expose 7 platform domains through 29 control-plane operations: Apps (9), Skills (3), Models (2), Core Runtime (2), PubSub (3), Events (5), Chat (3 -- already exist). Move apps management from HTTP-only to WS (RPC). Rename all operations to plural form. Drop legacy operations (system-presence, usage.*, capabilities.*, packs.*, skills.install/update). Wire PubSub as the client-facing event subscription mechanism replacing the current `events.stream` SSE endpoint.

---

## Current State

### Apps Domain

**HTTP-only management API:**
- `src/apps/management-api.ts` -- 5 HTTP handlers (`handleListApps`, `handleInstallApp`, `handleUninstallApp`, `handleUpgradeApp`, `handleAppHealth`)
- Exposed via `GET /api/apps`, `POST /api/apps/install`, `POST /api/apps/uninstall`, `POST /api/apps/upgrade`, `GET /api/apps/:appId/health`
- Listed in `STATIC_HTTP_CONTROL_ROUTES` as `apps.list` (GET /api/apps)

**App infrastructure (mature, no changes needed):**
- `src/apps/registry.ts` -- `AppRegistry` with `register()`, `unregister()`, `has()`, `get()`, `getAll()`, `setState()`
- `src/apps/service-manager.ts` -- `ServiceManager` with `startServices()`, `stopServices()`, `getServices()`
- `src/apps/manifest.ts` -- `parseManifest()`, `validateManifest()`, `NexAppManifest` type
- `src/apps/method-loader.ts` -- `loadMethodHandlers()` (jiti-based inline TS loading)
- `src/apps/iam-generator.ts` -- `generateAppOperations()` (auto IAM entries from manifest)
- `src/apps/hooks.ts` -- `executeLifecycleHook()` (onInstall, onActivate, onDeactivate, onUninstall, onUpgrade)
- `src/apps/service-dispatch.ts` -- Service-routed handler dispatch
- `src/apps/ui-registrar.ts` -- Static SPA route resolution
- `src/apps/adapter-registrar.ts` -- Adapter registration from app manifests

**No WS/RPC operations exist.** Apps management is exclusively HTTP. No `apps.start`, `apps.stop`, `apps.logs`, `apps.operations`, `apps.get`, or `apps.status` operations exist on the control plane.

### Skills Domain

**3 existing handlers** in `src/nex/control-plane/server-methods/skills.ts`:
- `skills.status` -- builds workspace skill status report (`buildWorkspaceSkillStatus()`)
- `skills.install` -- installs a skill (`installSkill()`)
- `skills.update` -- updates skill config in nexus config file

**Target mismatch:** Current operations do not align with Batch 5 spec. `skills.status` maps roughly to `skills.list`. `skills.install` and `skills.update` are DROPPED in the target. `skills.use` (SKILL.md content) and `skills.search` are MISSING.

### Models Domain

**1 existing handler** in `src/nex/control-plane/server-methods/models.ts`:
- `models.list` -- calls `context.loadRuntimeModelCatalog()`

**Missing:** `models.get` (single model detail lookup with context window, capabilities, pricing).

### Core Runtime

**2 existing handlers** in `src/nex/control-plane/server-methods/health.ts`:
- `health` -- health snapshot with caching + background refresh
- `status` -- calls `getStatusSummary()` from `src/commands/status.ts`

**Naming mismatch:** `health` needs rename to `runtime.health`. `status` stays bare top-level (correct).

**Legacy system-presence** in `src/nex/control-plane/server-methods/system.ts`:
- `system-presence` -- read-only presence list (DROPPED in target)
- `system.presence` -- write presence update + event dispatch (DROPPED in target -- folded into adapter health)

### PubSub

**InMemoryEventBus** in `src/nex/bus.ts`:
- Full publish/subscribe implementation with typed events
- `publish()`, `subscribe()`, `unsubscribe()` methods
- Optional write-through to SQLite `bus_events` table
- Used internally by all bus event producers

**Event type registry** in `src/nex/events.ts`:
- `NEXBusEvents` -- 35+ event types (agent streaming, session lifecycle, file changes, PTY, permissions, ACL, adapters, system)
- `NEXBusEventSchemas` -- Zod schemas for each event type

**SSE endpoint** in `src/nex/control-plane/http-control-handlers.ts`:
- `events.stream` at `GET /api/events/stream` -- SSE stream with optional type filtering
- Registered in `STATIC_HTTP_CONTROL_ROUTES`

**No RPC surface.** The bus is used internally but has no control-plane operations. The SSE endpoint is the only external interface.

### Events Domain

**Event ingestion** in `src/nex/control-plane/server-methods/event-ingest.ts`:
- `event.ingest` -- delegates to `handleEventIngest()` from `agent.ts`

**Event database** in `src/db/events.ts`:
- `events` table with FTS5 search (`events_fts`)
- `attachments` and `attachment_interpretations` tables
- Mature schema, used by ingestion pipeline

**Missing operations:** `events.list`, `events.get`, `events.search`, `events.backfill` have NO RPC handlers. Some HTTP routes exist in `http-control-handlers.ts` and `work.ts` but are not proper RPC operations.

**Naming:** `event.ingest` needs plural rename to `events.ingest`.

### Chat Domain

**3 existing handlers** in `src/nex/control-plane/server-methods/chat.ts`:
- `chat.send` -- full implementation (sync streaming, async fire-and-forget, 5 queue modes, role-based injection)
- `chat.history` -- reads session messages with byte-size capping
- `chat.abort` -- aborts in-progress agent run
- `chat.inject` -- legacy separate injection handler (merged into chat.send in target)

**Chat is complete.** Only cleanup needed: remove `chat.inject` (functionality subsumed by `chat.send` with `role: "assistant"`).

### Usage Domain (TO BE DROPPED)

**Extensive handlers** in `src/nex/control-plane/server-methods/usage.ts` (1144+ lines):
- `usage.status`, `usage.cost`, `sessions.usage`, `sessions.usage.timeseries`, `sessions.usage.logs`
- All DROPPED in target -- usage tracking moves to per-turn token counts in agents.db

### Handler Registration

All handlers are spread-merged into `coreRuntimeHandlers` in `src/nex/control-plane/server-methods.ts`. This is the single registration point.

---

## Target State

### 29 Operations Across 7 Domains

#### apps.* (9 operations -- NEW as RPC, currently HTTP-only)

| Operation | Verb | Description |
|-----------|------|-------------|
| `apps.list` | read | List installed apps with status |
| `apps.get` | read | Get app details (manifest, registered operations, service state) |
| `apps.install` | admin | Install app from package (wraps existing install flow) |
| `apps.uninstall` | admin | Remove app (runs onUninstall hook, cleans up) |
| `apps.start` | admin | Start app services |
| `apps.stop` | admin | Stop app services |
| `apps.status` | read | App health + service state |
| `apps.logs` | read | App-specific logs (service stdout/stderr) |
| `apps.operations` | read | List registered operations from this app |

#### skills.* (3 operations -- REPLACE existing 3)

| Operation | Verb | Description |
|-----------|------|-------------|
| `skills.list` | read | List installed skills with status, requirements, capabilities (replaces `skills.status`) |
| `skills.use` | read | Get SKILL.md content for agent consumption (NEW) |
| `skills.search` | read | Search local skills by name, capability, or domain (NEW) |

#### models.* (2 operations -- 1 exists, 1 new)

| Operation | Verb | Description |
|-----------|------|-------------|
| `models.list` | read | List available models computed from active LLM credentials (EXISTS) |
| `models.get` | read | Get model details -- context window, capabilities, pricing (NEW) |

#### Core Runtime (2 operations -- RENAME)

| Operation | Verb | Description |
|-----------|------|-------------|
| `status` | read | The agent sitrep -- full orientation summary (EXISTS, no rename) |
| `runtime.health` | read | Lightweight liveness probe (EXISTS as `health`, RENAME) |

`status` output shape (target):
```typescript
{
  ts: EpochMs;
  identity: {
    user: { name: string; entity_id: string };
    agent: { name: string; agent_id: string; emoji?: string; avatar?: string };
  };
  adapters: Array<{
    name: string;
    platform: string;
    status: "connected" | "disconnected" | "error" | "expired";
    channels: number;
  }>;
  channels: {
    total: number;
    active: number;
    byPlatform: Record<string, number>;
  };
  credentials: {
    total: number;
    active: number;
    broken: number;
    byService: Record<string, number>;
  };
  skills: {
    total: number;
    active: number;
    needsSetup: number;
  };
  memory: {
    entities: number;
    facts: number;
    lastRetainAt: EpochMs | null;
  };
  cron: {
    enabled: boolean;
    jobs: number;
    nextRunAt: EpochMs | null;
  };
  apps: {
    installed: number;
    running: number;
  };
  capabilities: Array<{
    name: string;
    status: "active" | "ready" | "needs-setup" | "unavailable";
    providers: string[];
  }>;
  suggestedActions: Array<{
    action: string;
    description: string;
    unlocks?: string[];
  }>;
}
```

#### pubsub.* (3 operations -- NEW as RPC)

| Operation | Verb | Description |
|-----------|------|-------------|
| `pubsub.subscribe` | read | Subscribe to event stream (replaces `events.stream` SSE endpoint) |
| `pubsub.publish` | write | Publish event to bus (client-facing per RESOLVED_DECISIONS.md) |
| `pubsub.unsubscribe` | write | Remove subscription |

#### events.* (5 operations -- 1 RENAME, 4 NEW)

| Operation | Verb | Description |
|-----------|------|-------------|
| `events.ingest` | write | Accept and process inbound event (EXISTS as `event.ingest`, RENAME to plural) |
| `events.list` | read | List events with filters (platform, sender, container, time range) (NEW) |
| `events.get` | read | Get single event by ID (NEW) |
| `events.search` | read | Full-text search across event content via FTS5 (NEW) |
| `events.backfill` | write | Trigger historical backfill from adapter (NEW) |

#### chat.* (3 operations -- EXIST, cleanup only)

| Operation | Verb | Description |
|-----------|------|-------------|
| `chat.send` | write | Send a message (sync streaming, async fire-and-forget, assistant injection via role param) |
| `chat.history` | read | Read recent messages (optimized for chat UI, capped, byte-size limited) |
| `chat.abort` | write | Abort an in-progress agent run |

### Dropped Operations

| Current Operation | Disposition |
|-------------------|-------------|
| `skills.status` | REPLACED by `skills.list` |
| `skills.install` | DROPPED (adapters/apps are distribution mechanism) |
| `skills.update` | DROPPED (skill config moves to credential/workspace system) |
| `chat.inject` | MERGED into `chat.send` with `role: "assistant"` |
| `health` | RENAMED to `runtime.health` |
| `system-presence` | DROPPED (folded into adapter health) |
| `system.presence` | DROPPED (folded into adapter health) |
| `usage.status` | DROPPED (provider usage is a credential concern) |
| `usage.cost` | DROPPED (derived from turn data in agents.db) |
| `sessions.usage` | DROPPED (derived from turn data) |
| `sessions.usage.timeseries` | DROPPED (derived from turn data) |
| `sessions.usage.logs` | DROPPED (derived from turn data) |
| `event.ingest` | RENAMED to `events.ingest` (plural) |
| `events.stream` (HTTP SSE) | REPLACED by `pubsub.subscribe` (WS RPC) |

---

## Changes Required

### New Code

**File:** `src/nex/control-plane/server-methods/apps.ts` (NEW)

9 RPC handlers wrapping existing `AppRegistry` and `ServiceManager`:

```typescript
export const appsRpcHandlers: RuntimeRequestHandlers = {
  "apps.list": async ({ respond, context }) => {
    // Wrap registry.getAll() + serializeApp()
    // Same logic as management-api.ts handleListApps but via RPC
  },
  "apps.get": async ({ params, respond, context }) => {
    // registry.get(appId) → full manifest + registered operations + service state
  },
  "apps.install": async ({ params, respond, context }) => {
    // Wrap management-api install flow:
    // parseManifest → validateManifest → registry.register → loadMethodHandlers
    // → generateAppOperations → resolveAppUIRoute → resolveAppAdapters
    // → lifecycle hooks (onInstall, onActivate) → startServices
  },
  "apps.uninstall": async ({ params, respond, context }) => {
    // Wrap management-api uninstall flow:
    // stopServices → lifecycle hooks (onDeactivate, onUninstall)
    // → unregisterOperations → registry.unregister
  },
  "apps.start": async ({ params, respond, context }) => {
    // serviceManager.startServices(manifest, packageDir)
  },
  "apps.stop": async ({ params, respond, context }) => {
    // serviceManager.stopServices(appId)
  },
  "apps.status": async ({ params, respond, context }) => {
    // registry.get(appId).state + serviceManager.getServices(appId) health
  },
  "apps.logs": async ({ params, respond, context }) => {
    // Read service stdout/stderr from ServiceManager log buffers
    // ServiceManager needs a getLogs(appId, serviceName?) method
  },
  "apps.operations": async ({ params, respond, context }) => {
    // generateAppOperations(manifest) → list of registered operation IDs
  },
};
```

**Implementation details:**
- Extract the core install/uninstall/upgrade logic from `management-api.ts` into shared functions
- `apps.ts` RPC handlers and `management-api.ts` HTTP handlers both call the shared functions
- Eventually deprecate and remove HTTP routes (but not in this workplan -- dual surface until UI migrates)

**File:** `src/nex/control-plane/server-methods/skills.ts` (REWRITE)

Replace existing 3 handlers with target 3:

```typescript
export const skillsHandlers: RuntimeRequestHandlers = {
  "skills.list": ({ params, respond }) => {
    // Wrap buildWorkspaceSkillStatus() but return in new shape:
    // Array<{ name, version, status, requirements[], capabilities[], description }>
    // Replace skills.status semantics
  },
  "skills.use": ({ params, respond }) => {
    // Read SKILL.md from skill directory
    // Returns { name, content: string } where content is raw SKILL.md markdown
    // Resolves skill directory from workspace skills path
  },
  "skills.search": ({ params, respond }) => {
    // Search local skills by name (substring match), capability, or domain
    // Returns filtered subset of skills.list output
  },
};
```

**File:** `src/nex/control-plane/server-methods/models.ts` (ADD models.get)

```typescript
export const modelsHandlers: RuntimeRequestHandlers = {
  "models.list": async ({ params, respond, context }) => {
    // EXISTS -- no changes needed
  },
  "models.get": async ({ params, respond, context }) => {
    // NEW -- get single model details
    // Calls context.loadRuntimeModelCatalog(), filters to params.model_id
    // Returns { id, name, provider, context_window, capabilities, pricing, ... }
  },
};
```

**File:** `src/nex/control-plane/server-methods/pubsub.ts` (NEW)

```typescript
export const pubsubHandlers: RuntimeRequestHandlers = {
  "pubsub.subscribe": async ({ params, respond, context }) => {
    // Subscribe to bus events via InMemoryEventBus.subscribe()
    // params.types?: string[] -- optional event type filter
    // Returns subscription_id
    // Events pushed via context.broadcast() or WS push channel
  },
  "pubsub.publish": async ({ params, respond, context }) => {
    // Publish event via InMemoryEventBus.publish()
    // params.type: string, params.properties: Record<string, unknown>
    // Client-facing per RESOLVED_DECISIONS.md
  },
  "pubsub.unsubscribe": async ({ params, respond, context }) => {
    // Remove subscription by subscription_id
    // Calls InMemoryEventBus.unsubscribe()
  },
};
```

**File:** `src/nex/control-plane/server-methods/events.ts` (NEW)

```typescript
export const eventsHandlers: RuntimeRequestHandlers = {
  "events.ingest": async (opts) => {
    // Delegate to existing handleEventIngest() from agent.ts
    // Same implementation as current event.ingest, just renamed
  },
  "events.list": async ({ params, respond }) => {
    // Query events.db events table with filters
    // params: { platform?, sender_id?, container_id?, after?, before?, limit?, offset? }
    // Returns { events: EventRow[], total: number }
  },
  "events.get": async ({ params, respond }) => {
    // Query events.db by event ID
    // Returns full EventRow with attachments
  },
  "events.search": async ({ params, respond }) => {
    // Full-text search via events_fts table
    // params: { query: string, platform?, after?, before?, limit? }
    // Returns { events: EventRow[], total: number }
  },
  "events.backfill": async ({ params, respond, context }) => {
    // Trigger adapter-driven historical backfill
    // params: { adapter: string, since?: EpochMs, until?: EpochMs }
    // Spawns adapter binary with event.backfill SDK verb
    // Returns { job_id: string, status: "started" }
  },
};
```

**File:** `src/apps/management-api-shared.ts` (NEW)

Extract shared install/uninstall/upgrade/health logic from `management-api.ts`:

```typescript
export async function installApp(opts: {
  registry: AppRegistry;
  serviceManager: ServiceManager;
  appId: string;
  packageDir: string;
  dataDir: string;
  registerOperations: RegisterOperationsCallback;
}): Promise<{ app: RegisteredApp; methods: number; operations: number }>;

export async function uninstallApp(opts: {
  registry: AppRegistry;
  serviceManager: ServiceManager;
  appId: string;
  dataDir: string;
  unregisterOperations: UnregisterOperationsCallback;
}): Promise<void>;

export async function getAppHealth(opts: {
  registry: AppRegistry;
  serviceManager: ServiceManager;
  appId: string;
}): Promise<{ healthy: boolean; state: string; services: ServiceHealth[] }>;
```

### Modified Files

**File:** `src/nex/control-plane/server-methods.ts`

```diff
- import { eventIngestHandlers } from "./server-methods/event-ingest.js";
+ import { eventsHandlers } from "./server-methods/events.js";
+ import { appsRpcHandlers } from "./server-methods/apps.js";
+ import { pubsubHandlers } from "./server-methods/pubsub.js";
- import { systemHandlers } from "./server-methods/system.js";
- import { usageHandlers } from "./server-methods/usage.js";

  export const coreRuntimeHandlers: RuntimeRequestHandlers = {
    ...connectHandlers,
    ...authUsersHandlers,
    ...logsHandlers,
    ...voicewakeHandlers,
    ...healthHandlers,          // health → runtime.health rename happens inside health.ts
    ...ingressCredentialsHandlers,
    ...chatHandlers,            // chat.inject removed inside chat.ts
    ...deviceHandlers,
    ...deviceHostHandlers,
    ...aclRequestsHandlers,
    ...modelsHandlers,          // models.get added inside models.ts
    ...memoryReviewHandlers,
    ...configHandlers,
    ...wizardHandlers,
    ...talkHandlers,
    ...ttsHandlers,
    ...skillsHandlers,          // rewritten: skills.list, skills.use, skills.search
    ...sessionsHandlers,
    ...clockScheduleHandlers,
-   ...systemHandlers,          // REMOVED: system-presence, system.presence dropped
-   ...usageHandlers,           // REMOVED: usage.*, sessions.usage.* dropped
    ...updateHandlers,
    ...agentHandlers,
    ...agentsHandlers,
    ...browserHandlers,
    ...adapterCapabilityHandlers,
    ...adapterConnectionsHandlers,
    ...workHandlers,
-   ...eventIngestHandlers,     // REMOVED: replaced by eventsHandlers
+   ...eventsHandlers,          // events.ingest (plural), events.list, events.get, events.search, events.backfill
+   ...appsRpcHandlers,         // apps.list, apps.get, apps.install, apps.uninstall, apps.start, apps.stop, apps.status, apps.logs, apps.operations
+   ...pubsubHandlers,          // pubsub.subscribe, pubsub.publish, pubsub.unsubscribe
  };
```

**File:** `src/nex/control-plane/server-methods/health.ts`

```diff
  export const healthHandlers: RuntimeRequestHandlers = {
-   health: async ({ respond, context, params }) => {
+   "runtime.health": async ({ respond, context, params }) => {
      // ... existing implementation unchanged
    },
    status: async ({ respond }) => {
      // ... existing implementation unchanged
    },
  };
```

**File:** `src/nex/control-plane/server-methods/chat.ts`

```diff
  const chatHandlerTable: RuntimeRequestHandlers = {
    "chat.history": async ({ params, respond, context }) => { /* ... */ },
    "chat.send": async ({ params, respond, context }) => { /* ... */ },
    "chat.abort": async ({ params, respond, context }) => { /* ... */ },
-   "chat.inject": async ({ params, respond, context }) => { /* ... */ },
  };
```

**File:** `src/nex/control-plane/server-methods/skills.ts`

Full rewrite -- see New Code section above. Remove `skills.status`, `skills.install`, `skills.update`. Replace with `skills.list`, `skills.use`, `skills.search`.

**File:** `src/nex/control-plane/server-methods/models.ts`

Add `models.get` handler alongside existing `models.list`.

**File:** `src/nex/control-plane/http-control-routes.ts`

```diff
  export const STATIC_HTTP_CONTROL_ROUTES: readonly StaticHttpControlRoute[] = [
    { method: "POST", pathname: "/api/auth/login", operation: "auth.login", kind: "protocol" },
-   { method: "GET", pathname: "/health", operation: "health", kind: "control" },
+   { method: "GET", pathname: "/health", operation: "runtime.health", kind: "control" },
-   { method: "GET", pathname: "/api/events/stream", operation: "events.stream", kind: "control" },
+   { method: "GET", pathname: "/api/events/stream", operation: "pubsub.subscribe", kind: "control" },
    { method: "GET", pathname: "/api/apps", operation: "apps.list", kind: "control" },
    { method: "POST", pathname: "/tools/invoke", operation: "tools.invoke", kind: "control" },
  ];
```

**File:** `src/nex/control-plane/http-control-handlers.ts`

Update the SSE handler function to reference `pubsub.subscribe` instead of `events.stream`. The actual SSE implementation stays until WS pubsub is fully wired -- this is just an alias rename.

**File:** `src/nex/control-plane/runtime-operations.ts`

```diff
  export const HTTP_INGRESS_OPERATION_IDS = [
-   "event.ingest",
+   "events.ingest",
  ] as const;
```

**File:** `src/apps/management-api.ts`

Refactor to call shared functions from `management-api-shared.ts` instead of inlining all logic. Keep HTTP routes working for backward compatibility until UI migrates to WS.

**File:** `src/nex/control-plane/server-methods/agent.ts`

Update any references from `event.ingest` to `events.ingest` in the `handleEventIngest` function and callers.

### Deleted Files/Code

**File:** `src/nex/control-plane/server-methods/event-ingest.ts` -- DELETE entirely
- Replaced by `events.ts` which includes `events.ingest` plus 4 new operations

**File:** `src/nex/control-plane/server-methods/system.ts` -- DELETE entirely
- `system-presence` (read) -- DROPPED (folded into adapter health)
- `system.presence` (write) -- DROPPED (folded into adapter health)
- `handleEventIngestSystem` export -- DROPPED

**File:** `src/nex/control-plane/server-methods/usage.ts` -- DELETE entirely
- `usage.status` -- DROPPED
- `usage.cost` -- DROPPED
- `sessions.usage` -- DROPPED
- `sessions.usage.timeseries` -- DROPPED
- `sessions.usage.logs` -- DROPPED
- All 1144+ lines of usage computation code -- DROPPED (usage derived from per-turn data in agents.db)

### Protocol Schemas

**File:** `src/nex/control-plane/protocol/schema/apps.ts` (NEW)

TypeBox schemas for all 9 apps operations:
- `AppsListParams`, `AppsGetParams`, `AppsInstallParams`, `AppsUninstallParams`
- `AppsStartParams`, `AppsStopParams`, `AppsStatusParams`, `AppsLogsParams`, `AppsOperationsParams`

**File:** `src/nex/control-plane/protocol/schema/pubsub.ts` (NEW)

TypeBox schemas for 3 pubsub operations:
- `PubsubSubscribeParams` -- `{ types?: string[] }`
- `PubsubPublishParams` -- `{ type: string, properties: Record<string, unknown> }`
- `PubsubUnsubscribeParams` -- `{ subscription_id: string }`

**File:** `src/nex/control-plane/protocol/schema/events.ts` (NEW)

TypeBox schemas for 5 events operations:
- `EventsIngestParams` -- existing schema, just renamed
- `EventsListParams` -- `{ platform?, sender_id?, container_id?, after?, before?, limit?, offset? }`
- `EventsGetParams` -- `{ id: string }`
- `EventsSearchParams` -- `{ query: string, platform?, after?, before?, limit? }`
- `EventsBackfillParams` -- `{ adapter: string, since?: number, until?: number }`

**Update:** `src/nex/control-plane/protocol/index.ts` -- export new validators, remove old ones (`validateSkillsInstallParams`, `validateSkillsUpdateParams`, `validateSkillsStatusParams`, `validateSessionsUsageParams`)

### Operations to Register

**29 total operations:**

```
# Apps (9) -- NEW
apps.list
apps.get
apps.install
apps.uninstall
apps.start
apps.stop
apps.status
apps.logs
apps.operations

# Skills (3) -- REWRITTEN
skills.list         (replaces skills.status)
skills.use          (NEW)
skills.search       (NEW)

# Models (2) -- 1 exists, 1 new
models.list         (EXISTS)
models.get          (NEW)

# Core Runtime (2) -- RENAMED
status              (EXISTS, no rename)
runtime.health      (RENAMED from health)

# PubSub (3) -- NEW
pubsub.subscribe    (replaces events.stream SSE)
pubsub.publish      (NEW, client-facing)
pubsub.unsubscribe  (NEW)

# Events (5) -- 1 RENAMED, 4 NEW
events.ingest       (RENAMED from event.ingest)
events.list         (NEW)
events.get          (NEW)
events.search       (NEW)
events.backfill     (NEW)

# Chat (3) -- EXIST, cleanup only
chat.send           (EXISTS)
chat.history        (EXISTS)
chat.abort          (EXISTS)
```

### Operations to Unregister

```
# Removed (13 operations)
health              (renamed to runtime.health)
event.ingest        (renamed to events.ingest)
events.stream       (replaced by pubsub.subscribe)
skills.status       (replaced by skills.list)
skills.install      (DROPPED)
skills.update       (DROPPED)
chat.inject         (merged into chat.send)
system-presence     (DROPPED)
system.presence     (DROPPED)
usage.status        (DROPPED)
usage.cost          (DROPPED)
sessions.usage      (DROPPED)
sessions.usage.timeseries  (DROPPED)
sessions.usage.logs (DROPPED)
```

---

## Execution Order

### Phase 1: Infrastructure Extraction (No Dependencies)

1. **Extract shared app management logic** -- Create `src/apps/management-api-shared.ts`
   - Move install/uninstall/upgrade/health core logic from `management-api.ts`
   - `management-api.ts` HTTP handlers become thin wrappers calling shared functions
   - Verify existing HTTP routes still work after refactor

2. **Add ServiceManager.getLogs()** -- If not present, add log buffering to `ServiceManager`
   - Capture service stdout/stderr into ring buffers
   - Expose `getLogs(appId, serviceName?, tail?)` method

### Phase 2: New RPC Handlers (Depends on Phase 1 for apps)

3. **Write apps RPC handlers** -- `src/nex/control-plane/server-methods/apps.ts`
   - 9 operations calling shared functions from Phase 1
   - Validate params with TypeBox schemas

4. **Rewrite skills handlers** -- `src/nex/control-plane/server-methods/skills.ts`
   - Remove `skills.status`, `skills.install`, `skills.update`
   - Add `skills.list` (wraps `buildWorkspaceSkillStatus()` with new return shape)
   - Add `skills.use` (reads SKILL.md from skill directory)
   - Add `skills.search` (filters skills by name/capability/domain)

5. **Add models.get** -- `src/nex/control-plane/server-methods/models.ts`
   - Filter model catalog to single model by ID
   - Return context window, capabilities, pricing metadata

6. **Rename health to runtime.health** -- `src/nex/control-plane/server-methods/health.ts`
   - Change key from `health` to `runtime.health`
   - `status` stays unchanged

7. **Write events handlers** -- `src/nex/control-plane/server-methods/events.ts`
   - `events.ingest` -- delegate to existing `handleEventIngest()`
   - `events.list` -- query events.db with filters
   - `events.get` -- query events.db by ID
   - `events.search` -- FTS5 search on events_fts
   - `events.backfill` -- spawn adapter binary with event.backfill verb

8. **Write pubsub handlers** -- `src/nex/control-plane/server-methods/pubsub.ts`
   - `pubsub.subscribe` -- WS subscription to `InMemoryEventBus` with type filtering
   - `pubsub.publish` -- publish to bus (client-facing)
   - `pubsub.unsubscribe` -- remove subscription by ID

### Phase 3: Cleanup (Depends on Phase 2)

9. **Remove chat.inject** -- `src/nex/control-plane/server-methods/chat.ts`
   - Delete `chat.inject` handler
   - Verify `chat.send` with `role: "assistant"` covers all inject use cases

10. **Delete system.ts** -- `src/nex/control-plane/server-methods/system.ts`
    - Remove `system-presence` and `system.presence` handlers
    - Remove `handleEventIngestSystem` export
    - Update any internal callers (presence version tracking in context)

11. **Delete usage.ts** -- `src/nex/control-plane/server-methods/usage.ts`
    - Remove all 5 usage operations
    - Remove the 1144+ lines of usage computation code
    - Delete associated test file `usage.sessions-usage.test.ts`

12. **Delete event-ingest.ts** -- `src/nex/control-plane/server-methods/event-ingest.ts`
    - Fully replaced by `events.ts`

### Phase 4: Wiring (Depends on Phase 2 + 3)

13. **Update server-methods.ts** -- Central handler registration
    - Add new imports: `eventsHandlers`, `appsRpcHandlers`, `pubsubHandlers`
    - Remove old imports: `eventIngestHandlers`, `systemHandlers`, `usageHandlers`
    - Update spread merge in `coreRuntimeHandlers`

14. **Update http-control-routes.ts** -- HTTP route registry
    - `health` -> `runtime.health`
    - `events.stream` -> `pubsub.subscribe`

15. **Update http-control-handlers.ts** -- SSE handler
    - Rename internal references from `events.stream` to `pubsub.subscribe`

16. **Update runtime-operations.ts** -- Operation ID constants
    - `event.ingest` -> `events.ingest` in `HTTP_INGRESS_OPERATION_IDS`

17. **Update protocol/index.ts** -- Validators
    - Remove old validators: `validateSkillsInstallParams`, `validateSkillsUpdateParams`, `validateSkillsStatusParams`, `validateSessionsUsageParams`
    - Add new validators for apps, pubsub, events operations

### Phase 5: Protocol Schemas (Parallelizable with Phase 2)

18. **Write TypeBox schemas** -- `protocol/schema/apps.ts`, `protocol/schema/pubsub.ts`, `protocol/schema/events.ts`
    - Input validation schemas for all 29 operations
    - Response type definitions
    - Export from protocol barrel

### Phase 6: Testing (Depends on Phase 4)

19. **Smoke tests -- Apps domain**
    - `apps.list` -> verify returns installed apps
    - `apps.install` -> verify installs via RPC, runs hooks, starts services
    - `apps.uninstall` -> verify uninstalls, cleans up
    - `apps.status` -> verify health reporting
    - `apps.operations` -> verify lists registered operations

20. **Smoke tests -- Skills domain**
    - `skills.list` -> verify returns skills with status
    - `skills.use` -> verify returns SKILL.md content
    - `skills.search` -> verify filters by name/capability

21. **Smoke tests -- Models, Runtime, PubSub, Events**
    - `models.get` -> verify returns single model details
    - `runtime.health` -> verify responds (renamed from `health`)
    - `pubsub.subscribe` + `pubsub.publish` -> verify event delivery
    - `events.list` -> verify queries events.db
    - `events.search` -> verify FTS5 search
    - `events.ingest` -> verify ingestion (renamed from `event.ingest`)

22. **Verify dropped operations return proper errors**
    - Confirm `health`, `event.ingest`, `skills.status`, `skills.install`, `skills.update`, `chat.inject`, `system-presence`, `system.presence`, `usage.status`, `usage.cost`, `sessions.usage`, `sessions.usage.timeseries`, `sessions.usage.logs` all return "unknown method" errors

---

## Notes

**Hard cutover.** No backwards compatibility. Old operation names stop working immediately. All clients (UI, CLI, apps, agents) must use new names. The HTTP routes in `http-control-routes.ts` get updated in the same commit.

**Apps dual surface.** The HTTP management API (`management-api.ts`) stays alive temporarily alongside the new RPC surface. Both call the same shared functions. The HTTP routes will be deprecated once the control panel UI migrates to WS operations. Do not prematurely remove HTTP routes.

**PubSub subscription model.** `pubsub.subscribe` over WS returns a `subscription_id`. Subsequent events matching the type filter are pushed to the client as WS messages tagged with the subscription_id. `pubsub.subscribe` over HTTP falls back to SSE (same as current `events.stream`). The `InMemoryEventBus` already has the full subscribe/unsubscribe/publish API -- this is wiring, not new logic.

**events.backfill coordination.** The backfill operation spawns an adapter binary with the `event.backfill` SDK verb. The adapter streams historical events via stdout JSONL. The runtime feeds each event through `events.ingest`. This is a long-running operation -- consider returning a job_id and tracking progress via the work/jobs system (depends on WP_WORK_DOMAIN_UNIFICATION).

**status output alignment deferred.** The `status` output shape from Batch 5 references `cron.jobs` (old naming) and does not include DAGs or the full work domain shape. Alignment with WP_WORK_DOMAIN_UNIFICATION output happens during implementation, not in this workplan.

**System presence callers.** Before deleting `system.ts`, audit all internal callers of `system.presence` and `handleEventIngestSystem`. Known callers:
- Device host pairing (device-host.ts) -- may call system.presence for heartbeats
- Node presence reporting from remote nodes
- These need to be redirected to adapter health or removed.

**Usage data migration.** The usage computation code (1144+ lines) is being deleted, not migrated. Usage data already exists in agents.db as per-turn token counts. Any analytics UI that consumed `usage.status`, `usage.cost`, or `sessions.usage.*` must be rewritten to query agents.db turn records directly. This is a UI concern, not a backend concern.

**Skills SKILL.md resolution.** `skills.use` needs to resolve the skill directory from the workspace. Current flow: workspace dir -> skills/ subdirectory -> skill name -> SKILL.md. The skill directory structure is established by `installSkill()` and read by `buildWorkspaceSkillStatus()`. Reuse existing path resolution.

**Models credential dependency.** `models.list` already calls `context.loadRuntimeModelCatalog()` which computes available models from active credentials. After WP_CREDENTIAL_SYSTEM lands, this function will query the credentials table instead of file-based credential stores. No changes needed in this workplan -- the dependency is one-directional.
