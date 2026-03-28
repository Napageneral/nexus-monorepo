# Operation Monitoring

**Status:** CANONICAL
**Domain:** Operator Console — Monitor Tab
**Depends on:** nex runtime bus, runtime operations taxonomy, WebSocket broadcast

---

## Customer Experience

The operator opens the Monitor tab in the operator console and sees a live stream of every operation being invoked on the nex runtime. Each operation appears as a row in a real-time table showing what method was called, who called it, whether it succeeded or failed, and how long it took.

The operator can:

- Watch operations stream in live as agents, adapters, and other clients interact with the runtime
- Filter by method name, action type, resource domain, caller identity, or status
- Pause the live stream to inspect a specific operation without it scrolling away
- Click an operation to see its full context: caller identity, auth decision, permissions, timing breakdown
- Switch to a History sub-tab to search and browse persisted operations with date range filtering
- See aggregate stats: operations per minute, error rate, slowest methods

The experience feels like a structured, domain-aware `tail -f` for the runtime's control plane — not a raw log viewer, but a typed operation audit trail.

---

## Conceptual Model

### Operation

An **operation** is a single RPC method invocation on the nex runtime surface. Every operation has:

| Field | Type | Description |
|-------|------|-------------|
| `requestId` | string | Unique ID for this invocation |
| `method` | string | The RPC method name (e.g. `agents.list`, `chat.send`, `adapters.connections.list`) |
| `action` | string | The operation's action classification: `read`, `write`, `admin`, `approve`, `pair` |
| `resource` | string | The resource domain (e.g. `agents`, `agents.sessions`, `adapters.connections`) |
| `permission` | string | The required permission (e.g. `agents.read`, `chat.write`) |
| `callerEntityId` | string \| null | The sender's resolved entity ID from IAM |
| `callerRole` | string \| null | The caller's role (e.g. `operator`, `agent`, `user`) |
| `callerConnId` | string | The WebSocket connection ID |
| `phase` | `"started"` \| `"completed"` \| `"failed"` | Lifecycle phase |
| `startedAt` | number | Epoch milliseconds when the operation began |
| `latencyMs` | number \| null | Duration in milliseconds (null while in-progress) |
| `error` | string \| null | Error message if failed |

Operations progress through phases: `started` → `completed` or `started` → `failed`. The console receives an event for each phase transition.

### Operation Event

The runtime emits operation events over the WebSocket broadcast channel. The console subscribes to these events and maintains an in-memory ring buffer of recent operations for the Live view.

### Operation History

The runtime persists operation records to storage (the existing `bus_events` SQLite table with write-through, plus the `access_log` audit table). The console queries persisted history via the `monitor.operations.list` RPC method.

---

## Runtime API

### Event: `monitor.operation`

Broadcast over WebSocket to all connected operator console clients whenever an operation completes or fails.

```typescript
{
  type: "event",
  event: "monitor.operation",
  payload: {
    requestId: string,
    method: string,
    action: string,        // "read" | "write" | "admin" | "approve" | "pair"
    resource: string,
    permission: string,
    callerEntityId: string | null,
    phase: "started" | "completed" | "failed",
    startedAt: number,     // epoch ms
    latencyMs: number | null,
    error: string | null
  }
}
```

**Scope gate:** Requires `operator.monitor` scope or operator role. Non-operator connections do not receive these events.

**Emission:** The existing `core.operation.started`, `core.operation.completed`, and `core.operation.failed` bus events are bridged to WebSocket broadcast as `monitor.operation` events. This bridge is established during server startup alongside other bus-to-broadcast subscriptions.

### Method: `monitor.operations.list`

Query persisted operation history.

```typescript
// Request
{
  method: "monitor.operations.list",
  params: {
    limit?: number,          // default 100, max 500
    offset?: number,         // default 0
    method?: string,         // filter by method name (prefix match)
    action?: string,         // filter by action type
    resource?: string,       // filter by resource domain
    status?: "completed" | "failed",  // filter by outcome
    since?: number,          // epoch ms — operations after this time
    until?: number           // epoch ms — operations before this time
  }
}

// Response
{
  operations: Array<{
    requestId: string,
    method: string,
    action: string,
    resource: string,
    permission: string,
    callerEntityId: string | null,
    phase: "completed" | "failed",
    startedAt: number,
    latencyMs: number,
    error: string | null
  }>,
  total: number,
  hasMore: boolean
}
```

**Authorization:** `operator.monitor` scope or operator role required.

**Data source:** Queries the `bus_events` table filtered to `core.operation.completed` and `core.operation.failed` event types, with 7-day retention matching the bus persistence window.

### Method: `monitor.operations.stats`

Aggregate operation statistics for dashboard cards.

```typescript
// Request
{
  method: "monitor.operations.stats",
  params: {
    since?: number,    // epoch ms, default: last 24 hours
    until?: number     // epoch ms, default: now
  }
}

// Response
{
  totalOperations: number,
  completedCount: number,
  failedCount: number,
  avgLatencyMs: number,
  p95LatencyMs: number,
  operationsPerMinute: number,
  topMethods: Array<{ method: string, count: number, avgLatencyMs: number }>,
  topErrors: Array<{ method: string, error: string, count: number }>
}
```

---

## Console UI

### Monitor Tab

The Monitor tab has two sub-tabs: **Live** and **History**.

#### Live Sub-Tab

A real-time streaming table of operations as they occur.

**Header:**
- Title: "Monitor"
- Subtitle: "Live operation stream from the runtime surface."
- Controls: Pause/Resume toggle, Clear button, filter inputs

**Stats row:**
- 4 compact stat cards: Ops/min, Total (session), Failed, Avg latency

**Filter bar:**
- Method name search (text input, prefix match)
- Action filter pills: All | Read | Write | Admin
- Status filter pills: All | Completed | Failed

**Table columns:**
| Column | Content |
|--------|---------|
| Time | HH:MM:SS.mmm timestamp |
| Method | RPC method name, mono font |
| Action | Action badge (read=neutral, write=info, admin=warning) |
| Resource | Resource domain |
| Caller | Entity ID or connection ID, truncated |
| Status | Completed (success badge) or Failed (danger badge) |
| Latency | Duration in ms, colored by threshold (<100ms green, <500ms neutral, >500ms warning, >2000ms danger) |

**Behavior:**
- New operations appear at the top (newest first)
- Auto-scrolls unless paused
- Ring buffer of 500 most recent operations in memory
- Clicking a row expands inline detail: full caller context, permission, auth decision
- Failed operations are visually highlighted (subtle red left border)

#### History Sub-Tab

A searchable, paginated view of persisted operation history.

**Controls:**
- Search by method name
- Date range picker (since/until)
- Action and status filters (same as Live)
- Refresh button

**Table:** Same columns as Live, plus pagination at bottom.

**Behavior:**
- Calls `monitor.operations.list` on load and filter change
- Paginated: 50 per page, Prev/Next buttons, "Showing X-Y of Z" label
- Click row to expand detail (same as Live)

---

## Implementation Boundary

### Runtime changes (nex)

1. **Bus-to-WebSocket bridge** — In server startup, subscribe to `core.operation.started`, `core.operation.completed`, `core.operation.failed` bus events and broadcast them as `monitor.operation` WebSocket events to operator-scoped connections.

2. **`monitor.operations.list` handler** — New RPC method that queries `bus_events` table filtered to operation event types, with the filtering parameters described above.

3. **`monitor.operations.stats` handler** — New RPC method that aggregates operation data from `bus_events` for the stats cards.

4. **Operation taxonomy entry** — Register `monitor.operations.list` and `monitor.operations.stats` in the runtime operations taxonomy with `kind: "core"`, `action: "read"`, `resource: "monitor"`, `permission: "monitor.read"`.

### Console changes (operator console)

1. **Event listener** — Subscribe to `monitor.operation` WebSocket events in the runtime client, accumulate in a ring buffer on `AppViewState`.

2. **Monitor controller** — New controller with `loadMonitorHistory(state)`, `loadMonitorStats(state)` functions calling the new RPC methods.

3. **Monitor page** — Rebuild `v2/pages/monitor.ts` with Live and History sub-tabs as described above.

4. **Types** — Add `MonitorOperation`, `MonitorOperationsListResult`, `MonitorOperationsStatsResult` to `ui/types.ts`.
