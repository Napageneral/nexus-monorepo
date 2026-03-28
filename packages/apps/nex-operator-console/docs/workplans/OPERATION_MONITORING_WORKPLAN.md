# Operation Monitoring — Workplan

**Status:** ACTIVE
**Spec:** `docs/specs/OPERATION_MONITORING.md`
**Created:** 2026-03-27

---

## Gap Analysis

### What already exists

| Component | Location | Status |
|-----------|----------|--------|
| Bus events `core.operation.started/completed/failed` | `nex/src/api/server-methods.ts` line 178 | ✅ Emitted for all `kind: "core"` operations |
| `InMemoryEventBus` with pub/sub | `nex/src/runtime/bus.ts` | ✅ Working, write-through to SQLite |
| `bus_events` SQLite persistence | `nex/src/runtime/bus.ts` | ✅ 7-day retention |
| Operation taxonomy (method→action/resource/permission) | `nex/src/api/runtime-operations.ts` | ✅ Complete for all methods |
| WebSocket broadcast infrastructure | `nex/src/api/server-broadcast.ts` | ✅ Scope-gated, slow-consumer safe |
| SSE bus→HTTP bridge (precedent) | `nex/src/api/http-runtime-api-handlers.ts` line 265 | ✅ Full `subscribeAll()` bridge |
| `access_log` audit table | `nex/src/runtime/domains/identity/audit.ts` | ✅ 90-day retention |
| Console WebSocket event handling | `operator-console/app/src/ui/runtime.ts` | ✅ `onEvent` callback dispatch |
| Console v2 Monitor page | `operator-console/app/src/v2/pages/monitor.ts` | ⚠️ Exists but shows static mock table |

### What's missing

| Gap | Location | Effort |
|-----|----------|--------|
| Bus→WebSocket bridge for operation events | `nex/src/api/server-broadcast.ts` or startup | Small (~15 lines) |
| `monitor.operations.list` RPC handler | `nex/src/api/handlers/` (new file) | Small (~40 lines) |
| `monitor.operations.stats` RPC handler | Same file | Medium (~60 lines, SQL aggregation) |
| Taxonomy entries for monitor methods | `nex/src/api/runtime-operations.ts` | Trivial (2 entries) |
| Console event listener for `monitor.operation` | `operator-console/app/src/ui/app-runtime.ts` | Small (~10 lines) |
| Console monitor controller | `operator-console/app/src/ui/controllers/monitor.ts` (new) | Small (~30 lines) |
| Console monitor types | `operator-console/app/src/ui/types.ts` | Trivial |
| Console monitor state on AppViewState | `operator-console/app/src/ui/app-view-state.ts` | Small |
| Rebuilt v2 Monitor page (Live + History) | `operator-console/app/src/v2/pages/monitor.ts` | Medium (rewrite) |
| Wire monitor into app-render-v2 | `operator-console/app/src/v2/app-render-v2.ts` | Small |

---

## Implementation Phases

### Phase 1: Runtime — Bus→WebSocket bridge + taxonomy (no new RPC methods yet)

**Goal:** Get operation events flowing to operator console WebSocket clients.

1. In `nex/src/api/server-broadcast.ts` (or the server startup sequence where the broadcast function is created):
   - Subscribe to `core.operation.started`, `core.operation.completed`, `core.operation.failed` on the bus
   - For each, call `broadcast("monitor.operation", { ...event.properties, phase })` scoped to operator connections

2. In `nex/src/api/runtime-operations.ts`:
   - Add taxonomy entries for `monitor.operations.list` and `monitor.operations.stats`

**Validation:** Connect operator console, invoke any RPC (e.g. `agents.list`), confirm `monitor.operation` events arrive in console's WebSocket `onEvent` handler.

### Phase 2: Runtime — Query methods

**Goal:** Enable historical operation queries.

1. Create `nex/src/api/handlers/monitor.ts` (or add to an existing handler module):
   - `monitor.operations.list` — query `bus_events` table with type IN (`core.operation.completed`, `core.operation.failed`), parse properties JSON, apply filters (method prefix, action, status, date range), return paginated results
   - `monitor.operations.stats` — aggregate from `bus_events`: count by status, avg/p95 latency, group by method for top methods, group by error for top errors

2. Register handlers in `server-methods.ts` core handler spread.

**Validation:** Call `monitor.operations.list` and `monitor.operations.stats` via WebSocket, confirm correct filtered results.

### Phase 3: Console — Types, state, controller, event listener

**Goal:** Console can receive and store operation events and query history.

1. Add types to `ui/types.ts`: `MonitorOperation`, `MonitorOperationsListResult`, `MonitorOperationsStatsResult`

2. Create `ui/controllers/monitor.ts`:
   - `loadMonitorHistory(state, filters)` — calls `monitor.operations.list`
   - `loadMonitorStats(state)` — calls `monitor.operations.stats`

3. Add state to `AppViewState`:
   - `monitorLiveOps: MonitorOperation[]` (ring buffer, max 500)
   - `monitorHistoryOps: MonitorOperation[]`
   - `monitorStats: MonitorOperationsStatsResult | null`
   - `monitorHistoryTotal: number`
   - `monitorHistoryLoading: boolean`
   - `monitorPaused: boolean`
   - Filter state fields

4. Add event listener in `app-runtime.ts`:
   - On `monitor.operation` event → push to `monitorLiveOps` ring buffer (unless paused)

**Validation:** With runtime running, confirm `monitorLiveOps` array populates when other console actions trigger RPC calls.

### Phase 4: Console — Rebuilt Monitor page

**Goal:** Fully functional Monitor tab matching the spec.

1. Rewrite `v2/pages/monitor.ts`:
   - Live sub-tab with streaming table, stats cards, filters, pause/resume
   - History sub-tab with search, date range, pagination
   - Row expansion for operation detail

2. Wire into `app-render-v2.ts` with proper state passing and event handlers.

**Validation:** Visual confirmation against spec. Live stream updates, History queries work, filters function, pagination works.

---

## Open Questions

1. **Scope gate naming:** Should the scope be `operator.monitor` (new scope) or should existing operator role be sufficient? Leaning toward: operator role is sufficient, no new scope needed.

2. **Stats aggregation performance:** The `bus_events` table has 7-day retention. If volume is high, the stats query could be slow. Consider: add an index on `(type, timestamp)` if not already present. Or: compute stats in-memory from the ring buffer for the Live view, only use SQL for History.

3. **Protocol operations:** Currently `core.operation.*` events only fire for `kind: "core"` operations (the `if (authz.kind === "core")` guard). Should we also emit for `kind: "protocol"` (the `connect` handshake)? Leaning toward: no, protocol operations are plumbing, not operator-interesting.
