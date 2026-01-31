# Event Bus Specifications

**Status:** 📋 TODO  
**Priority:** High — Critical integration point  
**Date:** January 30, 2026

---

## ⚠️ Important Distinction

**This is NOT the same as Hooks/Event Handler!**

| System | What It Is | Spec Location |
|--------|------------|---------------|
| **Event Bus** (this spec) | Internal component pub/sub | Here |
| **Event Handler** (hooks) | User-facing automation | `agent-system/EVENT_SYSTEM_DESIGN.md` |

The bus is *internal plumbing* — how components talk to each other.  
Hooks are *user-facing* — how events trigger agent actions.

---

## Overview

The Event Bus is the nervous system of Nexus. It enables:
- **Component decoupling** — Publishers don't know subscribers
- **Event Ledger → Event Handler flow** — New events trigger hook evaluation
- **UI updates via SSE streaming** — Real-time frontend updates
- **Agent Ledger → Index sync** — Turns flow to search indexing

---

## Spec Documents

| Document | Status | Description |
|----------|--------|-------------|
| `BUS_ARCHITECTURE.md` | ✅ DONE | Core bus design, pub/sub model, 41 event types |
| `EVENT_TYPES.md` | 📋 TODO | Detailed Zod schemas for each event |
| `SUBSCRIBERS.md` | 📋 TODO | Who subscribes to what |
| `SSE_STREAMING.md` | 📋 TODO | Server-sent events for UI |
| `MNEMONIC_COMPARISON.md` | ❌ DROPPED | Mnemonic bus stays as audit log, OpenCode bus for real-time |

---

## Key References

### Upstream (OpenCode)
- `packages/opencode/src/bus/` — Core bus implementation
  - `bus-event.ts` — Event definition registry (Zod schemas)
  - `global.ts` — Global EventEmitter for cross-instance
  - `index.ts` — Main bus API (publish/subscribe)

### Current Mnemonic
- `mnemonic/internal/bus/` — Append-only event log
  - `bus_events` table — Sequential events
  - Only 2 event types: `cortex.event.created/updated`
  - No subscribers — audit log only

### Existing Nexus Specs
- `agent-system/EVENT_SYSTEM_DESIGN.md` — **Hook/Event Handler** (user-facing, different system!)
- `core/NEXUS_REQUEST.md` — Request lifecycle
- `UNIFIED_SYSTEM.md` Section 10 — Component Interfaces

---

## Architecture Questions

### 1. Storage Model
- **OpenCode:** In-memory only (no persistence)
- **Mnemonic:** SQL table (`bus_events`) — append-only
- **Nexus:** Hybrid? SQL for audit + in-memory for real-time?

### 2. Instance Scoping
- **OpenCode:** Per-directory instances with global broadcast
- **Nexus:** Single workspace — do we need instance scoping?

### 3. Event Schema
- **OpenCode:** Zod schemas with discriminated union
- **Mnemonic:** Flexible JSON payload
- **Nexus:** Zod for type safety?

### 4. Subscriber Model
- **OpenCode:** Push-based with wildcard support
- **Mnemonic:** Pull-based (manual polling)
- **Nexus:** Push for real-time, pull for batch?

### 5. Job Queue Integration
- **Mnemonic:** Separate `sync_jobs` table (state tracking)
- **OpenCode:** No job queue (scheduler is separate)
- **Nexus:** Integrate job queue with bus? Separate system?

---

## Proposed Nexus Event Categories

| Category | Events | Purpose |
|----------|--------|---------|
| **Ledger** | `event.created`, `identity.updated`, `turn.created`, `turn.completed` | Ledger mutations |
| **ACL** | `acl.decision`, `acl.grant.requested`, `acl.grant.approved` | Access control |
| **Hooks** | `hook.fired`, `hook.context`, `hook.error` | Hook execution |
| **Broker** | `session.routed`, `agent.started`, `agent.completed`, `agent.error` | Agent execution |
| **Adapters** | `adapter.in.received`, `adapter.out.sent`, `adapter.error` | External I/O |
| **Index** | `index.sync.started`, `index.sync.completed`, `index.embedding.queued` | Index operations |
| **System** | `system.startup`, `system.shutdown`, `system.error` | Lifecycle |

---

## Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                        Event Bus                             │
│                                                              │
│   Publishers                          Subscribers            │
│   ──────────                          ───────────            │
│   • In-Adapters ──────┐        ┌────── Event Handler        │
│   • Event Ledger ─────┤        ├────── ACL Evaluator        │
│   • Broker ───────────┼──BUS───┼────── Hooks                │
│   • Agent Executor ───┤        ├────── Out-Adapters         │
│   • Tool Executor ────┤        ├────── Index                │
│   • Credentials ──────┘        └────── UI (SSE)             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Mnemonic → Index Migration

The current mnemonic `bus_events` table should evolve:

**Current:**
```sql
CREATE TABLE bus_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,           -- 'cortex.event.created' | 'cortex.event.updated'
    adapter TEXT,
    cortex_event_id TEXT,
    created_at INTEGER NOT NULL,
    payload_json TEXT
);
```

**Nexus Index:**
```sql
CREATE TABLE bus_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,           -- Full event type taxonomy
    category TEXT NOT NULL,       -- 'ledger' | 'acl' | 'hooks' | 'broker' | etc.
    source TEXT NOT NULL,         -- Component that published
    target_id TEXT,               -- Related entity ID
    created_at INTEGER NOT NULL,
    payload_json TEXT,
    processed_at INTEGER,         -- When subscriber processed (NULL = unprocessed)
    error TEXT                    -- Processing error if any
);

CREATE INDEX idx_bus_events_type ON bus_events(type);
CREATE INDEX idx_bus_events_category ON bus_events(category);
CREATE INDEX idx_bus_events_unprocessed ON bus_events(processed_at) WHERE processed_at IS NULL;
```

---

## Next Steps

1. [ ] Review `agent-system/EVENT_SYSTEM_DESIGN.md` for overlap
2. [ ] Document OpenCode event types we're keeping
3. [ ] Define Nexus-specific event types
4. [ ] Design subscriber registration API
5. [ ] Design SSE streaming endpoint
6. [ ] Decide on job queue integration

---

*This folder will contain comprehensive bus specifications. Start with architecture, then detail each integration.*
