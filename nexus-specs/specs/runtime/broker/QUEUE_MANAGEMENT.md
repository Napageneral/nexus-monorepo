# Queue Management

**Status:** SPEC IN PROGRESS  
**Last Updated:** 2026-02-02

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
| `steer` | Inject message into active context | Run normally |
| `followup` | Queue message | Process FIFO |
| `collect` | Queue message | Batch all into one prompt |
| `steer-backlog` | Try steer, queue if fails | Process queue |
| `queue` | Simple FIFO | Process FIFO |
| `interrupt` | Abort active run | Run new message |

### Mode Details

**steer** — Injects a message into an actively streaming agent run. The agent sees the new message mid-response and can adjust. Best for urgent updates or clarifications.

**followup** — Queues the message for processing after the current run completes. Messages processed one at a time in order.

**collect** — Queues messages and batches them into a single prompt when processing begins. Good for high-volume inputs (e.g., group chat where multiple people message while agent is busy).

**steer-backlog** — Attempts to steer; if agent is not in a steerable state, queues instead.

**queue** — Simple FIFO queue, no steering attempts.

**interrupt** — Aborts current run immediately, clears queue, processes this message. Use for urgent cancellation or priority messages.

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

## Steering

### How Steering Works

Steering injects a message into an actively running agent:

```typescript
async function steer(sessionLabel: string, message: Message): Promise<boolean> {
  const runState = getRunState(sessionLabel);
  
  // Can only steer during active streaming
  if (runState !== 'streaming') {
    return false;  // Fall back to queue
  }
  
  // Inject message into agent's message queue
  await injectMessage(sessionLabel, message);
  return true;
}
```

### When Steering Fails

Steering fails when:
- No active run
- Run is compacting (not accepting input)
- Run just finished (race condition)

On failure, the message is queued for followup processing.

---

## Agent-to-Agent Queuing

Messages between agents (MA ↔ WA) use the same queue system:

```typescript
// When WA sends to MA
broker.send({
  from: "code-worker",
  to: "manager",
  content: "Task complete. Found 4 issues.",
});

// Routed to MA's session queue
// Processed according to MA's queue settings
```

This enables natural flow of progress updates and results without blocking.

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
