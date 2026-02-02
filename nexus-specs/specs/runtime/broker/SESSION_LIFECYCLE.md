# Session Lifecycle Management

**Status:** SPEC IN PROGRESS  
**Last Updated:** 2026-02-02

---

## Overview

This document covers the complete lifecycle of agent sessions:
- Reading and writing to the Agents Ledger
- Writing relevant events to the Events Ledger
- Compaction implementation
- Session pointer management
- Forking behavior

---

## Ledger Writes

The Broker writes directly to the **Agents Ledger** (SQLite, not JSONL files):

| Table | Purpose |
|-------|---------|
| `sessions` | Session metadata, routing key, current turn pointer |
| `turns` | Turn records with parent relationships (tree structure) |
| `messages` | Individual messages within turns |
| `tool_calls` | Tool invocations and results |

**See:** `../ledgers/AGENTS_LEDGER.md` for full schema.

### Events Ledger Writes

The Broker also writes to the **Events Ledger** when:
- An agent response is generated (outbound event)
- This closes the loop: inbound event → agent processing → outbound event

**See:** `../ledgers/EVENTS_LEDGER.md` for schema.

---

## Session Pointer Management

Sessions maintain a `current_turn_id` pointer to the active leaf turn.

### Serial Processing

When multiple messages queue for a session, the broker processes them **serially** and updates the pointer after each turn:

```
WRONG (parallel routing creates unintended forks):
  Session "main" → Turn X
  Route msg1 to X → creates Turn Y
  Route msg2 to X → creates Turn Z  ← Should have routed to Y!

CORRECT (serial with pointer update):
  Session "main" → Turn X
  Route msg1 to X → creates Turn Y → Update session → Turn Y
  Route msg2 to Y → creates Turn Z → Update session → Turn Z
```

### Key Invariants

1. **One message at a time per session** — Processing lock prevents parallel execution
2. **Fresh lookup each message** — Always read session pointer from Agents Ledger
3. **Update after completion** — Pointer moves only after turn finishes
4. **Session table is source of truth** — Route via session lookup, not cached turn IDs

### Implementation

```typescript
class SessionManager {
  private processing = new Set<string>();
  
  async processQueue(sessionLabel: string): Promise<void> {
    if (this.processing.has(sessionLabel)) return;
    this.processing.add(sessionLabel);
    
    try {
      while (this.hasQueuedMessages(sessionLabel)) {
        const message = this.dequeueMessage(sessionLabel);
        
        // Fresh lookup each iteration
        const session = await this.db.getSession(sessionLabel);
        const currentHead = session.current_turn_id;
        
        // Create new turn as child of current head
        const newTurn = await this.createTurn({
          parentTurnId: currentHead,
          message: message,
        });
        
        // Wait for agent to complete
        await this.waitForTurnCompletion(newTurn.id);
        
        // Update session pointer AFTER turn completes
        await this.db.updateSession(sessionLabel, {
          current_turn_id: newTurn.id,
          updated_at: Date.now(),
        });
      }
    } finally {
      this.processing.delete(sessionLabel);
    }
  }
}
```

---

## Forking

### Explicit Forking

To fork from a turn that already has children (resuming from historical context):

```typescript
async forkFromTurn(turnId: string, message: Message): Promise<Session> {
  const turn = await this.db.getTurn(turnId);
  if (!turn) throw new Error(`Turn not found: ${turnId}`);
  
  const newSessionLabel = `fork-${uuid()}`;
  
  // Create session pointing to the fork point
  await this.db.createSession({
    label: newSessionLabel,
    current_turn_id: turnId,  // Points to existing turn
    created_at: Date.now(),
  });
  
  // Route the initial message - creates first turn of fork
  await this.routeToSession(newSessionLabel, message);
  
  return this.db.getSession(newSessionLabel);
}
```

### Result

```
Turn A → Turn B → Turn X → Turn Y (session "main")
                  └──→ Turn Z (session "fork-abc" - forked from X)
```

Multiple sessions can fork from the same turn. The turn tree grows, session pointers track active heads.

---

## Compaction

### The Problem

Agent context windows have limits (e.g., 200k tokens). As conversations grow:
- Context fills up
- Agent performance degrades
- Eventually context overflow errors occur

### Solution: Compaction as a Special Turn

A compaction is a turn where:
- **Query:** System-initiated summarization request
- **Response:** The generated summary
- **Parent:** Points to the last normal turn before compaction
- **Effect:** Subsequent context assembly uses summary instead of full history

### Compaction Flow

```
Before: Turn 1 → Turn 2 → Turn 3 → Turn 4 → Turn 5 (session head)

Trigger: Context approaching limit. Summarize 1-3, keep 4-5.

After:  Turn 1 → Turn 2 → Turn 3 → Turn 4 → Turn 5 → CompactionTurn (session head)
                                                            ↑
                                                  summary of 1-3
                                                  kept: 4, 5
```

### Compaction Turn Schema

```sql
-- Compaction-specific fields on turns table
turn_type TEXT DEFAULT 'normal',        -- 'normal' | 'compaction'
summary TEXT,                            -- The compaction summary
summarized_through_turn_id TEXT,         -- Last turn included in summary
first_kept_turn_id TEXT,                 -- First turn kept in fresh context
tokens_before INTEGER,                   -- Context size before compaction
tokens_after INTEGER                     -- Context size after compaction
```

### Trigger Conditions

Compaction triggers when:
1. **Context overflow error** — Agent run fails due to context limit
2. **Threshold reached** — `contextTokens > contextWindow - reserveTokens`
3. **Manual trigger** — System explicitly requests compaction

### Compaction Process

```typescript
async function performCompaction(session: Session): Promise<Turn> {
  const currentHead = await getSessionHead(session);
  
  // 1. Partition: what to summarize vs keep
  const { toSummarize, toKeep } = partitionTurns(currentHead, {
    keepTokens: 30000,  // Keep ~30k tokens of recent context
  });
  
  // 2. Generate summary via LLM
  const summary = await generateSummary(toSummarize);
  
  // 3. Create compaction turn
  const compactionTurn = await insertTurn({
    parentTurnId: currentHead.id,
    turnType: 'compaction',
    summary: summary,
    summarizedThroughTurnId: toSummarize.at(-1)?.id,
    firstKeptTurnId: toKeep[0]?.id,
    tokensBefore: calculateTokens(currentHead),
    tokensAfter: calculateTokens(summary) + calculateTokens(toKeep),
  });
  
  // 4. Update session pointer
  await updateSessionHead(session.label, compactionTurn.id);
  
  return compactionTurn;
}
```

### Key Properties

1. **Full history preserved** — Compaction doesn't delete turns, just marks context boundary
2. **Summary includes prior summaries** — Recursive summarization as conversation grows
3. **Thread traversal works** — Can walk back through compactions to full history
4. **Events Ledger unaffected** — External events persist forever, only agent context is compacted

### Context Assembly After Compaction

See `CONTEXT_ASSEMBLY.md` for how compaction summaries are used during context building.

---

## Open Questions

1. **Summary generation model:** Use same model as conversation, or specialized summarizer?
2. **Summary length:** Fixed token count, or dynamic based on conversation length?
3. **Kept turns heuristic:** Last N turns, last X tokens, or importance-based?

---

## Related Documents

- `DATA_MODEL.md` — Core concepts (Turn, Thread, Session)
- `CONTEXT_ASSEMBLY.md` — How compaction summaries are used
- `../ledgers/AGENTS_LEDGER.md` — Full schema
- `../ledgers/EVENTS_LEDGER.md` — Events schema

---

*This document defines session lifecycle management for the Nexus agent system.*
