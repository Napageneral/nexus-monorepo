# Queue Management

**Status:** SPEC IN PROGRESS  
**Last Updated:** 2026-02-16

---

## Overview

This document covers how the Broker handles message queuing:
- Queue modes (steer, followup, collect, etc.)
- Queue storage and durability
- Steering and delivery

---

## Queue Modes

How messages are delivered when a session is busy:

| Mode | During Active Run | After Run Ends |
|------|-------------------|----------------|
| `steer` | Abort active run (preempt) | Drain backlog into next run |
| `followup` | Queue message | Process FIFO |
| `collect` | Queue message | Batch all into one turn (events-based) |
| `queue` | Simple FIFO | Process FIFO |
| `interrupt` | Abort active run (preempt) | Drain backlog into next run |

### Mode Details

**steer** — Preemptive mode. Aborts the active run and starts a new run that includes the new message plus any queued backlog. There is no in-run message injection.

**followup** — Queues the message for processing after the current run completes. Messages processed one at a time in order.

**collect** — Queues messages and batches them into a single turn when processing begins (represented as `event_ids`, not concatenated text). Good for high-volume inputs (e.g., group chat where multiple people message while agent is busy).

**queue** — Simple FIFO queue, no steering attempts.

**interrupt** — Preemptive mode. Aborts the active run and starts a new run that includes the new message plus any queued backlog. This "clears the queue" by draining it into the next run (it does not drop queued messages by default).

---

## Queue Storage

### Durability

Queues are persisted to SQLite for durability across restarts:

```sql
CREATE TABLE queue_items (
    id TEXT PRIMARY KEY,
    session_label TEXT NOT NULL,
    message_json TEXT NOT NULL,      -- Serialized message
    enqueued_at INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',   -- 'pending' | 'processing' | 'delivered' | 'failed'
    delivered_at INTEGER,
    error TEXT,
    
    FOREIGN KEY (session_label) REFERENCES sessions(label)
);

CREATE INDEX idx_queue_session ON queue_items(session_label, status);
CREATE INDEX idx_queue_pending ON queue_items(status) WHERE status = 'pending';
```

### Write-Through Cache

For performance, queues use a write-through cache pattern:
- In-memory Map for fast access
- SQLite for durability
- On enqueue: write to both
- On startup: load from SQLite
- On delivery: update status in SQLite

---

## Queue Processing

### Drain Loop

```typescript
async function drainQueue(sessionLabel: string): Promise<void> {
  const settings = await getQueueSettings(sessionLabel);
  
  while (hasPendingItems(sessionLabel)) {
    // Wait for debounce period (allows batching for collect mode)
    await waitForDebounce(settings.debounceMs);
    
    if (settings.mode === 'collect') {
      // Batch all pending into single prompt
      const items = await dequeueAll(sessionLabel);
      const batchedPrompt = formatBatch(items);
      await processMessage(sessionLabel, batchedPrompt);
    } else {
      // Process one at a time
      const item = await dequeueOne(sessionLabel);
      await processMessage(sessionLabel, item.message);
    }
  }
}
```

### Queue Settings

Queue behavior can be configured per-session:

```typescript
interface QueueSettings {
  mode: QueueMode;
  debounceMs?: number;      // Wait time before draining (default: 1000)
  cap?: number;             // Max queue size (default: 20)
  dropPolicy?: 'old' | 'new' | 'summarize';  // What to do when cap reached
}
```

### Drop Policies

When queue reaches capacity:
- **old** — Drop oldest messages
- **new** — Reject new messages
- **summarize** — Summarize dropped messages and prepend to next processed message

---

## Preemption (Steer/Interrupt)

`steer` and `interrupt` are **preemptive** queue modes.

- There is **no in-run message injection**.
- Preemption means: **abort the active run**, persist any partial output, and start a **new run** that includes the new message plus the drained backlog.

High-level behavior:

```text
Incoming message (mode=steer/interrupt)
  -> abort active run (if any)
  -> drain queued backlog + this message into ONE next run
  -> context assembly replays drained items as distinct messages
```

## Batched Message Representation (Events-Based)

For `collect` and preemptive runs (`steer`/`interrupt`), NEX does not concatenate multiple inbound messages into one synthetic blob.

Instead, it builds a synthetic event that references the original Events Ledger IDs:

- `event.metadata.collect_batch`: `{ count, event_ids, strategy: "events" }`
- `event.metadata.queue_batch`: `{ mode, count, event_ids, strategy: "events" }`

The synthetic event's `content` is the most recent message (the last event in `event_ids`). Context assembly then:

1. Loads the prior `event_ids` (excluding the last one) from the Events Ledger
2. Appends them as distinct history messages (preserving order)
3. Uses the latest event as the current message

---

## Agent-to-Agent Queuing

Messages between agents (MA ↔ WA) use the same queue system:

```typescript
// When WA sends to MA
agent_send({
  op: "message",
  text: "Task complete. Found 4 issues.",
  target: { session: "manager" },
});

// Routed to MA's session queue
// Processed according to MA's queue settings
```

This enables natural flow of progress updates and results without blocking.

### Worker Result Delivery Invariant

- WA completion always emits a durable `worker_result` event to the caller session.
- If the caller session is busy, the `worker_result` is queued (not dropped) and delivered per queue mode.
- `dispatch_id` and `spawned_session_label` are preserved in metadata for correlation and ledger/cortex lookup.

---

## Open Questions

1. **Priority support:** Should we add priority levels for urgent messages?
2. **Dead letter queue:** Where do failed messages go?
3. **Queue visibility:** How do agents/users see what's queued?

---

## Related Documents

- `OVERVIEW.md` — Broker overview
- `SESSION_LIFECYCLE.md` — How queued messages become turns
- `AGENTS.md` — Agent-to-agent communication patterns

---

*This document defines queue management for the Nexus agent system.*
