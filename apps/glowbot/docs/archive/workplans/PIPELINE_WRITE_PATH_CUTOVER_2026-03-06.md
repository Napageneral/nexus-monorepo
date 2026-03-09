# GlowBot Pipeline Write-Path Cutover

**Status:** ACTIVE
**Last Updated:** 2026-03-06
**Depends On:** `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/DATA_PIPELINE.md`, `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/workplans/WORKPLAN.md`

---

## Goal

Make the first real GlowBot pipeline path run through nex primitives instead of
the local SQLite pipeline.

This workstream exists to preserve the intended clinic experience:

1. a clinic connects shared adapters through runtime-owned connection flows
2. adapter monitors emit metric events
3. GlowBot ingests those events into nex memory as canonical `metric` elements
4. every stored metric retains connection-based provenance
5. downstream funnel/trend/dropoff/recommendation work can build on those
   elements without re-owning local storage

This is the first hard-cutover implementation tranche. It does not try to
finish every GlowBot read surface. It makes the write path real first.

---

## Current Code Reality

Confirmed from code:

- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/app/hooks/install.ts`
  still creates `glowbot.db` and seeds legacy tables
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/app/hooks/activate.ts`
  is still TODO-only for pipeline activation
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/app/pipeline/store.ts`
  still owns local storage, scheduler state, and pipeline orchestration
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/app/pipeline/funnel.ts`,
  `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/app/pipeline/trends.ts`,
  and `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/app/pipeline/dropoffs.ts`
  are already separated as app-owned computation modules

Confirmed from `nex`:

- jobs now execute through the runtime work scheduler in
  `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-work.ts`
- cron schedules are evaluated enough to create pending job runs in the same
  work scheduler
- DAG advancement still does not appear to exist yet as a real execution engine
- app adapter events are already exposed as `AdapterEvent { type, connectionId, data }`
- job scripts do **not** currently receive a runtime caller or SDK surface

That last point matters. A job script cannot yet call `memory.elements.create`
through nex unless the runtime work context is extended to provide a constrained
runtime caller.

---

## Locked Decisions

### 1. Hard cutover applies immediately to the write path

`install.ts` stops creating `glowbot.db`.

GlowBot does not maintain a second write path during transition. The nex-backed
write path is the write path.

### 2. `metric_extract` is the first operational job

The full pipeline DAG remains part of the canonical target state and should be
registered during install. But because DAG advancement is not yet a real engine,
the first operational write path centers on the `metric_extract` job itself.

Operationally:

- install registers all GlowBot jobs
- install registers the canonical DAG definition
- activate/event ingress invokes `metric_extract` directly first
- W5 is where the full DAG becomes the real execution path

### 3. GlowBot treats runtime `connectionId` as an opaque `connection_id`

GlowBot does not parse, synthesize, or otherwise reinterpret connection
identity.

The runtime-provided `event.connectionId` is passed through as the GlowBot
metric element `connection_id`.

This keeps GlowBot aligned to the connection-based canonical model without
baking provider/account parsing or adapter-singleton assumptions into app code.

### 4. `adapter_id` remains source classification, not canonical provenance

The write path requires:

- `connection_id` for provenance and dedup
- `adapter_id` for source classification
- `metric_name`
- `metric_value`
- `date`

When available, the write path also preserves:

- `connection_profile_id`
- `auth_method_id`
- `connection_scope`
- `source_app_id`
- `clinic_id`
- `metadata_key`

### 5. Job scripts stay on the SDK-only path

GlowBot job scripts must not import SQLite internals or write directly to nex
ledgers.

The correct fix is to extend the `nex` work runner so job scripts receive a
constrained `runtime.callMethod(...)` capability backed by the runtime’s own
control-plane dispatcher.

That preserves the active GlowBot spec rule: SDK only, no direct DB access.

### 6. The first normalization layer stays thin

Current adapters already emit metric-shaped metadata:

- `adapter_id`
- `metric_name`
- `metric_value`
- `date`

So the first `metric_extract` implementation should stay thin:

- validate required metadata
- normalize connection provenance
- derive `metadata_key` deterministically from non-core metadata when adapters
  do not provide one explicitly
- write metric elements
- deduplicate

Do not introduce a large adapter-specific transformation framework in W4.

---

## End State For W4

After this cutover:

- install registers GlowBot element definitions, job definitions, DAG
  definition, and cron schedule
- activate subscribes to adapter events
- adapter events can trigger `metric_extract`
- `metric_extract` persists `metric` elements through nex primitives
- metric elements carry connection-based provenance
- repeated runs do not duplicate the same metric element for the same
  connection/date/key
- no active GlowBot write path uses `glowbot.db`

W4 does **not** require:

- the full DAG to advance automatically
- overview/funnel/modeling methods to stop reading old data yet
- live clinic credentials

---

## Implementation Scope

### A. Add write-path registry/bootstrap modules in GlowBot

Create app-owned modules for:

- GlowBot element definition registration
- GlowBot job definition registration
- GlowBot DAG definition registration
- GlowBot cron registration

These modules should be idempotent and safe for re-entry.

### B. Add `metric_extract` job script and helpers

Create a file-backed job handler for `metric_extract`.

Expected responsibilities:

1. accept one or more adapter events as input
2. validate the event shape
3. require non-empty `connection_id`
4. require `adapter_id`, `metric_name`, `metric_value`, and `date`
5. derive `content` and `as_of`
6. look for an existing metric element using the canonical dedup key
7. create a new element when needed
8. create a version successor when the same key exists with a changed value

Canonical dedup key:

- `connection_id`
- `clinic_id`
- `metric_name`
- `date`
- `metadata_key`

### C. Extend `nex` job scripts with a constrained runtime caller

Extend the work-runner job context so job scripts can call runtime operations
without importing DB internals directly.

Minimum required capability:

- `runtime.callMethod(method, params)`

Initial GlowBot usage should be limited to:

- `memory.elements.list`
- `memory.elements.create`
- `memory.elements.update`
- `memory.elements.links.create`

This is an internal runtime execution capability, not a new product-specific
GlowBot API.

### D. Rewrite `install.ts`

Replace the legacy SQLite setup with:

- element-definition registration
- job registration
- DAG registration
- cron registration

`install.ts` must not create `glowbot.db`.

### E. Rewrite `activate.ts`

Replace TODO logging with:

- adapter event subscription via `ctx.nex.adapters.onEvent()`
- direct invocation of `metric_extract` for incoming events
- no local scheduler startup

Important:

- do not parse `event.connectionId`
- do not infer one connection per adapter
- do not write directly to SQLite

### F. Keep current read surfaces untouched for this tranche

Overview/funnel/modeling methods may continue reading old store-backed data
until W5.

This workstream is about making the first nex-backed write path real, not about
finishing the full product cutover in one patch.

---

## Validation Plan

### Repository-level validation

- install hook no longer references `better-sqlite3` or `glowbot.db`
- activate hook no longer references local scheduler startup
- no new write-path module imports `node:sqlite` or `better-sqlite3`

### Unit validation

Add fixture-driven tests covering:

- valid adapter event -> metric element payload
- missing `connection_id` rejected
- missing required metric metadata rejected
- dedup lookup key uses `connection_id`, not `adapter_id`
- changed metric value produces version/update behavior
- distinct same-adapter connections remain distinct

### Runtime-adjacent validation

Add targeted tests for the `nex` work runner extension:

- job scripts can call runtime methods through the constrained runtime caller
- job scripts do not need direct DB imports for memory/work operations

---

## Explicit Non-Goals

- no backwards compatibility bridge for the old SQLite write path
- no adapter-specific transformation framework in W4
- no full read-path cutover in this patch
- no attempt to fake DAG advancement inside GlowBot app code
- no app-local workaround for adapter lifecycle plumbing
