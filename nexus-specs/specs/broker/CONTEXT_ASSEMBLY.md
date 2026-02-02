# Context Assembly

**Status:** TODO  
**Last Updated:** 2026-02-02

---

## Overview

Context assembly is how the Broker builds the full context for agent execution. This is a critical piece that significantly impacts agent performance.

**TODO:** This document needs a deep dive after other spec folders are cleaned up.

---

## Context Layers

The Broker assembles context from multiple layers:

### 1. Workspace Layer

- `AGENTS.md` — System behavior rules
- Identity files — Who the user is
- Workspace rules and configuration

### 2. Persona Layer

- Agent identity (SOUL.md, IDENTITY.md)
- Permissions and constraints
- Default model configuration

### 3. Session Layer

- History from thread ancestry (via Agents Ledger)
- Previous turns in the conversation
- Compaction summaries if present

### 4. Cortex Layer

- Relevant context from derived layer
- Episodes related to current topic
- Facets (entities, topics) that apply
- Semantic search results

### 5. Event Layer

- The triggering event
- Hook-injected context
- Any extracted metadata

---

## Context Assembly Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONTEXT ASSEMBLY                             │
│                                                                  │
│  1. Load workspace context (AGENTS.md, identity)                │
│     ↓                                                            │
│  2. Load persona context (SOUL.md, permissions)                 │
│     ↓                                                            │
│  3. Load session history from Agents Ledger                     │
│     - Walk thread ancestry                                       │
│     - Apply compaction summaries if present                     │
│     ↓                                                            │
│  4. Query Cortex for relevant context                           │
│     - Semantic search based on event content                    │
│     - Filter by identity/permissions                            │
│     ↓                                                            │
│  5. Add event context and hook injections                       │
│     ↓                                                            │
│  6. Assemble final prompt                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Compaction Summary Integration

When a session has compaction turns, context assembly uses summaries:

```typescript
function buildSessionContext(turnId: string): Message[] {
  const turn = getTurn(turnId);
  const compaction = findLatestCompaction(turn);
  
  if (!compaction) {
    // No compaction, use full thread history
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

## Cortex Integration

**TODO:** Define exact interface with Cortex.

### What We Query

- Episodes related to current topic
- Entities mentioned in the event
- Recent relevant context
- User preferences and patterns

### How Results Are Injected

```typescript
// TODO: Define injection strategy
interface CortexInjection {
  // Where in the prompt?
  position: 'system' | 'before_history' | 'after_history';
  
  // What format?
  format: 'summary' | 'raw' | 'structured';
  
  // Token budget?
  maxTokens: number;
}
```

---

## Token Budget Management

**TODO:** Define token allocation strategy.

Context assembly must fit within the model's context window minus:
- Reserve for agent response
- Reserve for tool calls

```typescript
interface TokenBudget {
  total: number;           // Model's context window
  reserveResponse: number; // Reserved for output
  reserveTools: number;    // Reserved for tool calls
  available: number;       // Available for context
  
  // Allocation
  workspace: number;
  persona: number;
  history: number;
  cortex: number;
  event: number;
}
```

---

## Open Questions

1. **Layer priority:** When tokens are limited, which layers get cut first?
2. **Cortex query strategy:** What makes a good Cortex query?
3. **Caching:** Can assembled context be cached/reused?
4. **MA vs WA context:** Different assembly strategies for different agent roles?

---

## Related Documents

- `DATA_MODEL.md` — Turn, Thread, Session concepts
- `SESSION_LIFECYCLE.md` — Compaction details
- `INTERFACES.md` — Cortex interface
- `../cortex/` — Cortex system

---

*This document defines context assembly for the Nexus agent system.*
