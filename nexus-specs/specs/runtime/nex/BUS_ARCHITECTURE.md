# Nexus Event Bus Architecture

**Status:** DESIGN IN PROGRESS  
**Last Updated:** 2026-02-09  
**Related:** NEX.md, automations/AUTOMATION_SYSTEM.md

---

## Overview

The Nexus Event Bus provides real-time pub/sub communication between system components. It is adapted from OpenCode's bus system with Nexus-specific event types.

**Key insight:** The bus is for **real-time coordination**, not permanent storage. Ledgers handle permanence. The bus enables:
- Live UI updates (token streaming, status changes)
- Component decoupling (file edits → format-on-save)
- User interaction (permission prompts, questions)
- SSE streaming to clients

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EVENT BUS                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        In-Memory Pub/Sub                                 ││
│  │                                                                          ││
│  │  Publishers ──────────────────────────────► Subscribers                  ││
│  │                                                                          ││
│  │  • NEX pipeline stages                     • UI (via SSE)               ││
│  │  • Agent executor (streaming)              • Format-on-save             ││
│  │  • Tool executor (file.edited)             • LSP                        ││
│  │  • PTY manager                             • Share sync                 ││
│  │  • File watcher                            • Cortex                      ││
│  │  • Permission/ACL system                   • Logging                    ││
│  │  • Adapters (in/out)                       • Analytics                  ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        SSE Streaming Endpoint                            ││
│  │                                                                          ││
│  │  GET /api/events/stream                                                  ││
│  │                                                                          ││
│  │  • Subscribes to all bus events                                         ││
│  │  • Streams to connected clients (UI, CLI, external)                     ││
│  │  • Heartbeat every 30s to prevent timeout                               ││
│  │  • Filters by event type (optional query param)                         ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions

### 1. In-Memory Primary, Optional Write-Through

The bus is primarily in-memory for speed. Durability is handled by ledgers.

```typescript
// Bus events are ephemeral by default
Bus.publish(Event.StreamingToken, { delta: "Hello" })
// → Pushed to subscribers immediately
// → NOT written to disk (default)

// Permanent data goes to ledgers
await AgentLedger.appendContent(turnId, "Hello")
// → Written to SQLite
// → May trigger bus event for UI
```

**Configuration:**

```yaml
# nex.yaml
bus:
  # Primary: always in-memory for real-time
  mode: 'memory'  # 'memory' | 'write-through'
  
  # Optional: write-through to SQLite for audit/debug
  write_through:
    enabled: false           # Set true to enable
    path: ./data/bus.db      # SQLite database
    retention_days: 7        # Auto-cleanup old events
    
  # Optional: append-only log file (simpler than SQLite)
  audit_log:
    enabled: false
    path: ./logs/bus-events.jsonl
```

**Modes:**

| Mode | Behavior | Use Case |
|------|----------|----------|
| `memory` | In-memory only, no persistence | Default, fastest |
| `write-through` | In-memory + async SQLite write | Debugging, audit |

**Write-through schema:**

```sql
CREATE TABLE bus_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  properties_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_bus_type ON bus_events(type);
CREATE INDEX idx_bus_created ON bus_events(created_at);
```

**Rationale:**
- Most bus events are transient (streaming tokens, status updates)
- Permanent data should be in ledgers (single source of truth)
- In-memory is fast (no I/O latency)
- Crash recovery uses ledgers, not bus replay
- Write-through is opt-in for debugging/audit when needed

### 2. No Instance Scoping

OpenCode has per-directory instances. Nexus has a single `~/nexus/` workspace.

```typescript
// OpenCode: scoped to directory
const state = Instance.state(() => ({ subscriptions: new Map() }))

// Nexus: single global bus
const subscriptions = new Map<EventType, Subscriber[]>()
```

**Rationale:**
- Nexus is personal (one user, one workspace)
- No need to isolate project directories
- Simpler implementation

### 3. Type-Safe Events with Zod

Following OpenCode's pattern:

```typescript
// Event definition
export const StreamingToken = BusEvent.define(
  "agent.streaming.token",
  z.object({
    turn_id: z.string(),
    delta: z.string(),
    index: z.number(),
  })
)

// Type-safe publish
Bus.publish(StreamingToken, { 
  turn_id: "turn_123", 
  delta: "Hello", 
  index: 0 
})

// Type-safe subscribe
Bus.subscribe(StreamingToken, (event) => {
  console.log(event.properties.delta)  // Typed as string
})
```

### 4. Wildcard Subscriptions

For SSE streaming and logging:

```typescript
// Subscribe to everything
Bus.subscribeAll((event) => {
  sseStream.write(JSON.stringify(event))
})
```

---

## Event Taxonomy

### Category 1: Agent Execution (streaming, status)

| Event | Properties | Purpose |
|-------|------------|---------|
| `agent.streaming.token` | `turn_id`, `delta`, `index` | Live token output |
| `agent.streaming.start` | `turn_id`, `model` | Streaming began |
| `agent.streaming.end` | `turn_id`, `finish_reason` | Streaming complete |
| `agent.status.changed` | `turn_id`, `status` | "thinking", "executing", "idle" |
| `agent.tool.started` | `turn_id`, `tool_call_id`, `name` | Tool execution began |
| `agent.tool.completed` | `turn_id`, `tool_call_id`, `result` | Tool finished |
| `agent.error` | `turn_id`, `error` | Execution error |

### Category 2: Session/Turn Lifecycle

| Event | Properties | Purpose |
|-------|------------|---------|
| `session.created` | `session_label`, `persona` | New session |
| `session.updated` | `session_label`, `changes` | Session modified |
| `turn.created` | `turn_id`, `session_label` | New turn started |
| `turn.completed` | `turn_id`, `usage` | Turn finished |

### Category 3: File & Workspace

| Event | Properties | Purpose |
|-------|------------|---------|
| `file.edited` | `path`, `tool_call_id` | File written by tool |
| `file.watcher.changed` | `path`, `event_type` | File system change |
| `vcs.branch.changed` | `branch`, `previous` | Git branch switch |

### Category 4: PTY/Terminal

| Event | Properties | Purpose |
|-------|------------|---------|
| `pty.created` | `id`, `command`, `cwd` | Terminal started |
| `pty.output` | `id`, `data` | Terminal output chunk |
| `pty.exited` | `id`, `exit_code` | Terminal finished |

### Category 5: Permissions & Questions

| Event | Properties | Purpose |
|-------|------------|---------|
| `permission.requested` | `request_id`, `tool`, `args` | Needs approval |
| `permission.resolved` | `request_id`, `granted`, `scope` | User responded |
| `question.asked` | `request_id`, `question`, `options` | Agent question |
| `question.answered` | `request_id`, `answer` | User answer |

### Category 6: NEX Pipeline

| Event | Properties | Purpose |
|-------|------------|---------|
| `nex.request.started` | `request_id`, `event_id` | Pipeline began |
| `nex.request.stage` | `request_id`, `stage` | Stage transition |
| `nex.request.completed` | `request_id`, `duration_ms` | Pipeline done |
| `nex.request.error` | `request_id`, `error` | Pipeline failed |

### Category 7: ACL & Hooks

| Event | Properties | Purpose |
|-------|------------|---------|
| `acl.decision` | `request_id`, `principal`, `allowed` | Access decision |
| `acl.grant.requested` | `grant_id`, `permission` | Needs user grant |
| `acl.grant.resolved` | `grant_id`, `granted` | User responded |
| `hook.fired` | `hook_id`, `event_id`, `result` | Hook triggered |
| `hook.error` | `hook_id`, `error` | Hook failed |

### Category 8: Adapters

| Event | Properties | Purpose |
|-------|------------|---------|
| `adapter.in.received` | `adapter`, `event_id` | Inbound event |
| `adapter.out.sending` | `adapter`, `target` | Sending response |
| `adapter.out.sent` | `adapter`, `delivery_id` | Response delivered |
| `adapter.out.error` | `adapter`, `error` | Delivery failed |

### Category 9: System

| Event | Properties | Purpose |
|-------|------------|---------|
| `system.started` | `version` | NEX started |
| `system.stopping` | `reason` | NEX shutting down |
| `system.error` | `error`, `fatal` | System error |

### Category 10: LSP & Tools

| Event | Properties | Purpose |
|-------|------------|---------|
| `lsp.diagnostics` | `path`, `diagnostics` | LSP errors/warnings |
| `tools.registry.changed` | `added`, `removed` | Tool list changed |
| `mcp.server.connected` | `server_id`, `tools` | MCP server online |
| `mcp.server.disconnected` | `server_id` | MCP server offline |

---

## Total: ~40 Event Types

| Category | Count |
|----------|-------|
| Agent Execution | 7 |
| Session/Turn | 4 |
| File & Workspace | 3 |
| PTY/Terminal | 3 |
| Permissions & Questions | 4 |
| NEX Pipeline | 4 |
| ACL & Hooks | 5 |
| Adapters | 4 |
| System | 3 |
| LSP & Tools | 4 |
| **Total** | **41** |

---

## Event Consumers

Who subscribes to what:

| Consumer | Events | Purpose |
|----------|--------|---------|
| **UI (SSE)** | All via `subscribeAll()` | Real-time updates, streaming |
| **Format-on-save** | `file.edited` | Auto-format after tool writes |
| **LSP** | `file.edited`, `file.watcher.changed` | Refresh diagnostics |
| **Share sync** | `session.*`, `turn.*` | Sync to share server |
| **Logging** | All via `subscribeAll()` | Debug logs |
| **Analytics** | `nex.request.*`, `agent.*` | Metrics, latency tracking |
| **Permission UI** | `permission.requested` | Show approval dialog |
| **Agent executor** | `permission.resolved` | Unblock on user response |
| **Tool registry** | `mcp.server.*`, `tools.*` | Update available tools |

**Subscription patterns:**

```typescript
// UI: subscribe to everything, filter client-side
Bus.subscribeAll((event) => sseStream.write(event))

// Format-on-save: single event type
Bus.subscribe(Event.File.Edited, async ({ path }) => {
  await formatFile(path)
})

// Permission flow: request/response pair
Bus.subscribe(Event.Permission.Resolved, ({ request_id, granted }) => {
  pendingRequests.get(request_id)?.resolve(granted)
})
```

---

## API

### Publishing

```typescript
import { Bus, Event } from '@nexus/bus'

// Type-safe publish
await Bus.publish(Event.Agent.StreamingToken, {
  turn_id: "turn_123",
  delta: "Hello",
  index: 0
})
```

### Subscribing

```typescript
// Single event type
const unsub = Bus.subscribe(Event.Agent.StreamingToken, (event) => {
  console.log(event.properties.delta)
})

// Wildcard (all events)
const unsub = Bus.subscribeAll((event) => {
  logger.info(event.type, event.properties)
})

// One-shot (auto-unsubscribe after match)
Bus.once(Event.Permission.Resolved, (event) => {
  if (event.properties.request_id === myRequestId) {
    return "done"  // Unsubscribe
  }
})

// Cleanup
unsub()
```

### SSE Endpoint

```typescript
// Server setup (Hono example)
app.get('/api/events/stream', async (c) => {
  return streamSSE(c, async (stream) => {
    const unsub = Bus.subscribeAll((event) => {
      stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event.properties)
      })
    })
    
    // Heartbeat
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: 'heartbeat', data: '' })
    }, 30_000)
    
    stream.onAbort(() => {
      clearInterval(heartbeat)
      unsub()
    })
  })
})
```

### Client Usage

```typescript
// Browser/Node client
const events = new EventSource('/api/events/stream')

events.addEventListener('agent.streaming.token', (e) => {
  const { delta } = JSON.parse(e.data)
  appendToOutput(delta)
})

events.addEventListener('permission.requested', (e) => {
  showApprovalDialog(JSON.parse(e.data))
})
```

---

## Comparison with Hooks

**Bus events ≠ Hooks**

| Aspect | Bus Events | Hooks |
|--------|------------|-------|
| **Purpose** | Internal coordination | User automation |
| **Trigger** | System state changes | Ledger events |
| **Subscribers** | Components (UI, LSP...) | User scripts |
| **Author** | System (hardcoded) | Agent/user (dynamic) |
| **Persistence** | Ephemeral | Stored in `hooks/` |

**Example distinction:**
- `file.edited` bus event → Triggers format-on-save subscriber
- `event.created` hook trigger → User's "notify me about emails" hook

The bus is **plumbing**. Hooks are **automation**.

---

## Comparison with NEX Plugins

| Aspect | Bus | NEX Plugins |
|--------|-----|-------------|
| **Timing** | Anytime (publish/subscribe) | During request pipeline |
| **Pattern** | Fan-out (one-to-many) | Sequential (stage by stage) |
| **Coupling** | Loose (publisher doesn't know subscribers) | Tight (plugin modifies request) |

**NEX plugins CAN publish bus events:**
```typescript
const analyticsPlugin: NEXPlugin = {
  onFinalize: async (req) => {
    await Bus.publish(Event.Nex.RequestCompleted, {
      request_id: req.request_id,
      duration_ms: req.pipeline.duration_ms
    })
  }
}
```

---

## Integration Points

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEXUS SYSTEM                                    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                           NEX Pipeline                                │   │
│  │                                                                       │   │
│  │  Each stage can publish:                                             │   │
│  │  • Receive → adapter.in.received, nex.request.started               │   │
│  │  • ACL → acl.decision, acl.grant.requested                          │   │
│  │  • Hooks → hook.fired, hook.error                                   │   │
│  │  • Broker → session.created, turn.created                           │   │
│  │  • Agent → agent.streaming.*, agent.status.*, agent.tool.*          │   │
│  │  • Deliver → adapter.out.*                                          │   │
│  │  • Complete → nex.request.completed                                 │   │
│  │                                                                       │   │
│  └───────────────────────────────────┬──────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                           Event Bus                                   │   │
│  │                                                                       │   │
│  │  Subscribers:                                                        │   │
│  │  • UI (SSE) ← All streaming/status events                           │   │
│  │  • Format-on-save ← file.edited                                     │   │
│  │  • LSP ← file.edited, file.watcher.changed                          │   │
│  │  • Share sync ← session.*, turn.*                                   │   │
│  │  • Logging ← All (via subscribeAll)                                 │   │
│  │  • Analytics ← nex.request.*, agent.*                               │   │
│  │                                                                       │   │
│  └───────────────────────────────────┬──────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        SSE Streaming                                  │   │
│  │                                                                       │   │
│  │  GET /api/events/stream                                              │   │
│  │                                                                       │   │
│  │  Clients:                                                            │   │
│  │  • Web UI (desktop app, browser)                                    │   │
│  │  • CLI (real-time output)                                           │   │
│  │  • External integrations                                            │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Location

```
packages/core/src/
├── bus/
│   ├── bus.ts          # Main pub/sub API
│   ├── events.ts       # Event type definitions (Zod)
│   ├── sse.ts          # SSE streaming endpoint
│   └── types.ts        # TypeScript types
```

---

## Migration from OpenCode

| OpenCode | Nexus | Notes |
|----------|-------|-------|
| `bus/index.ts` | `bus/bus.ts` | Remove instance scoping |
| `bus/bus-event.ts` | `bus/events.ts` | Nexus event types |
| `bus/global.ts` | DROP | No cross-instance needed |
| `server/routes/global.ts` (SSE) | `bus/sse.ts` | Keep SSE pattern |

**Events mapping:**
- TUI events (4) → DROP
- IDE events (1) → DROP  
- Worktree events (2) → DROP
- Session/message events → Adapt to turn-based
- Permission/question → Keep
- File/PTY/LSP → Keep
- Add NEX/ACL/Hook/Adapter events

---

## Open Questions

1. **Audit logging** — Do we want optional file logging of bus events?
2. **Event filtering** — Should SSE endpoint support query param filters?
3. **Backpressure** — What if subscriber is slow? Drop events? Buffer?

---

*This spec defines the Nexus Event Bus. For event-triggered automation, see `automations/AUTOMATION_SYSTEM.md`.*
