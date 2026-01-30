# Compaction in Agent System

**Status:** DESIGN SPEC  
**Last Updated:** 2026-01-29  
**Related:** ONTOLOGY.md, SESSION_FORMAT.md

---

## Executive Summary

Compaction is how we manage context window limits while preserving full history. This document defines compaction as a **special turn type** that:
1. Summarizes prior conversation
2. Maintains thread lineage for smart forking
3. Allows full history traversal through Mnemonic

**Key insight:** Compaction is a turn, not a separate entity. This keeps the data model clean and leverages existing turn→parent relationships.

---

## The Problem

Agent context windows have limits (e.g., 200k tokens). As conversations grow:
- Context fills up
- Agent performance degrades
- Eventually context overflow errors occur

We need to:
1. **Compress old context** into summaries
2. **Preserve recent context** for continuity
3. **Maintain full history** for search and forking
4. **Track lineage** so we can traverse back through compactions

---

## Compaction as a Special Turn

### Core Concept

A compaction is a turn where:
- **Query:** System-initiated summarization request (not user message)
- **Response:** The generated summary
- **Parent:** Points to the last normal turn before compaction
- **Children:** Subsequent turns point to the compaction as parent

### Turn Schema Extension

```typescript
interface Turn {
  id: string;
  parentTurnId?: string;
  
  // Standard turn fields
  queryMessages: Message[];
  responseMessage: Message;
  model: string;
  tokenCount: number;
  timestamp: number;
  hasChildren: boolean;
  toolCalls: ToolCall[];
  
  // Compaction-specific fields (null for normal turns)
  turnType: 'normal' | 'compaction';
  summary?: string;                    // The compaction summary text
  summarizedThroughTurnId?: string;    // Last turn included in summary
  firstKeptTurnId?: string;            // First turn kept in context
  tokensBefore?: number;               // Context size before compaction
  tokensAfter?: number;                // Context size after compaction
}
```

### Database Schema

```sql
CREATE TABLE agent_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES agent_sessions(id),
  parent_turn_id TEXT REFERENCES agent_turns(id),
  
  -- Standard fields
  query_message_ids TEXT,
  response_message_id TEXT,
  model TEXT,
  token_count INTEGER,
  timestamp INTEGER,
  has_children INTEGER DEFAULT 0,
  tool_call_count INTEGER,
  
  -- Compaction fields (null for normal turns)
  turn_type TEXT DEFAULT 'normal',
  summary TEXT,
  summarized_through_turn_id TEXT REFERENCES agent_turns(id),
  first_kept_turn_id TEXT REFERENCES agent_turns(id),
  tokens_before INTEGER,
  tokens_after INTEGER
);

CREATE INDEX idx_turns_compaction ON agent_turns(turn_type) WHERE turn_type = 'compaction';
```

---

## Compaction Scenarios

### First Compaction

**Before:**
```
Turn 1 → Turn 2 → Turn 3 → Turn 4 → Turn 5 (session head)
```

**Trigger:** Context approaching limit. Summarize turns 1-3, keep 4-5.

**After:**
```
Turn 1 → Turn 2 → Turn 3 → Turn 4 → Turn 5 → CompactionTurn1 (session head)
```

**CompactionTurn1 data:**
```json
{
  "id": "compact-001",
  "parentTurnId": "turn-005",
  "turnType": "compaction",
  "summary": "User discussed project setup, decided on TypeScript...",
  "summarizedThroughTurnId": "turn-003",
  "firstKeptTurnId": "turn-004",
  "tokensBefore": 150000,
  "tokensAfter": 45000
}
```

**Agent context for next turn:**
```
[System: Summary of turns 1-3]
[Turn 4 content]
[Turn 5 content]
[New user query]
```

### Second Compaction

**Before:**
```
... → Turn 5 → CompactionTurn1 → Turn 6 → Turn 7 → Turn 8 (session head)
```

**Trigger:** Context filling again. Summarize CompactionTurn1 through Turn 6, keep 7-8.

**After:**
```
... → Turn 8 → CompactionTurn2 (session head)
```

**CompactionTurn2 data:**
```json
{
  "id": "compact-002",
  "parentTurnId": "turn-008",
  "turnType": "compaction",
  "summary": "Previously summarized: [summary of 1-3]. Then user worked on auth...",
  "summarizedThroughTurnId": "turn-006",
  "firstKeptTurnId": "turn-007",
  "tokensBefore": 160000,
  "tokensAfter": 50000
}
```

**Key insight:** The new summary INCLUDES the previous compaction's summary. You get a recursive summary (summary of summary) as the conversation continues.

### Nth Compaction

Pattern continues indefinitely:

```
Turn 1 → ... → Turn 5 → Compact1 → Turn 6 → ... → Turn 10 → Compact2 → Turn 11 → ...
                   ↑                                   ↑
           summarized 1-3                      summarized C1-8
           kept 4-5                            kept 9-10
```

Each compaction:
1. Points to previous turn as parent (maintaining chain)
2. Summarizes everything through `summarizedThroughTurnId`
3. Keeps turns from `firstKeptTurnId` onward
4. Becomes parent for subsequent turns

---

## Context Assembly

When building context for an agent run:

```typescript
function buildContext(turnId: string): Context {
  const turn = getTurn(turnId);
  
  // Find the most recent compaction in ancestry
  const compaction = findLatestCompaction(turn);
  
  if (!compaction) {
    // No compaction yet, use full thread
    return buildFullThreadContext(turn);
  }
  
  // Start with compaction summary
  const context = [{ role: 'system', content: compaction.summary }];
  
  // Add kept turns (from firstKeptTurnId to current)
  const keptTurns = getTurnsAfter(compaction.firstKeptTurnId);
  for (const t of keptTurns) {
    context.push(...t.queryMessages);
    context.push(t.responseMessage);
  }
  
  return context;
}
```

---

## Thread Traversal

Full history is always preserved. To traverse back through compactions:

```typescript
function getFullHistory(turnId: string): Turn[] {
  const history: Turn[] = [];
  let current = getTurn(turnId);
  
  while (current) {
    history.unshift(current);
    current = current.parentTurnId ? getTurn(current.parentTurnId) : null;
  }
  
  return history;  // Includes all turns AND compaction turns
}
```

To find what was summarized in a compaction:

```typescript
function getSummarizedTurns(compactionTurn: Turn): Turn[] {
  // Walk back from summarizedThroughTurnId
  const turns: Turn[] = [];
  let current = getTurn(compactionTurn.summarizedThroughTurnId);
  
  while (current) {
    turns.unshift(current);
    
    // Stop at previous compaction (it contains its own summary)
    if (current.turnType === 'compaction') break;
    
    current = current.parentTurnId ? getTurn(current.parentTurnId) : null;
  }
  
  return turns;
}
```

---

## Events Ledger vs Agents Ledger

**Important distinction:**

| Ledger | What's Stored | Compaction? |
|--------|---------------|-------------|
| **Events Ledger** | External channel events (iMessage, Discord, etc.) | NEVER compacted |
| **Agents Ledger** | Agent sessions, turns, compactions | Subject to compaction |

External events persist forever in the Events Ledger. Compaction only affects how the agent's working context is managed in the Agents Ledger.

This separation means:
1. You can always search full message history in Events Ledger
2. Agent sessions can be compacted without losing external history
3. Smart forking can access both summarized and full history

---

## Smart Forking with Compactions

To fork from a historical point (before compactions):

```typescript
function forkFrom(turnId: string): Session {
  const turn = getTurn(turnId);
  
  // Check if this turn was summarized
  const compaction = findCompactionThatSummarized(turnId);
  
  if (compaction) {
    // This turn was summarized. Options:
    // 1. Fork with summary context (lossy but efficient)
    // 2. Fork with full reconstruction (expensive but complete)
    
    // Default: Use summary + turns from fork point forward
    return createFork(turnId, { includeCompactionSummary: true });
  }
  
  // No compaction yet, simple fork
  return createFork(turnId);
}
```

---

## Compaction Trigger Conditions

Compaction triggers when:

1. **Context overflow error** — Agent run fails due to context limit
2. **Threshold reached** — `contextTokens > contextWindow - reserveTokens`
3. **Manual trigger** — User or system explicitly requests compaction

### Reserve Tokens

Always leave headroom for the next turn:

```typescript
const RESERVE_TOKENS = 20000;  // Configurable

function shouldCompact(session: Session): boolean {
  return session.contextTokensUsed > session.contextTokenLimit - RESERVE_TOKENS;
}
```

---

## Compaction Process

```typescript
async function performCompaction(session: Session): Promise<CompactionTurn> {
  const currentHead = getSessionHead(session);
  
  // 1. Determine what to summarize vs keep
  const { toSummarize, toKeep } = partitionTurns(currentHead, {
    keepTokens: 30000,  // Keep ~30k tokens of recent context
  });
  
  // 2. Generate summary
  const summary = await generateSummary(toSummarize);
  
  // 3. Create compaction turn
  const compactionTurn: Turn = {
    id: generateId(),
    parentTurnId: currentHead.id,
    turnType: 'compaction',
    summary: summary,
    summarizedThroughTurnId: toSummarize.at(-1)?.id,
    firstKeptTurnId: toKeep[0]?.id,
    tokensBefore: calculateTokens(currentHead),
    tokensAfter: calculateTokens(summary) + calculateTokens(toKeep),
    timestamp: Date.now(),
    hasChildren: false,
  };
  
  // 4. Insert into Agents Ledger
  await insertTurn(compactionTurn);
  
  // 5. Update session to point to compaction turn
  await updateSessionHead(session.label, compactionTurn.id);
  
  return compactionTurn;
}
```

---

## Open Questions

1. **Summary generation model:** Use same model as conversation, or specialized summarizer?

2. **Summary length:** Fixed token count, or dynamic based on conversation length?

3. **Kept turns heuristic:** Last N turns, or last X tokens, or importance-based?

4. **Cross-compaction search:** How to efficiently search across compacted sessions in Mnemonic?

---

## Related Documents

- `ONTOLOGY.md` — Core data model (Message, Turn, Thread, Session)
- `SESSION_FORMAT.md` — How sessions are stored
- `AGENTS_LEDGER_SCHEMA.md` — Full Mnemonic agents ledger schema
- `EVENT_SYSTEM_DESIGN.md` — Events vs Agents ledger separation

---

*This document defines compaction behavior for the Nexus agent system.*
