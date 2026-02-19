# Agent System Data Model (Ontology)

**Status:** CONCEPTUAL REFERENCE  
**Last Updated:** 2026-02-06

---

## Overview

This document defines the core terminology and conceptual model for the Nexus agent system. These are the abstractions everything else builds on.

**Core Insight:** Every turn creates a new addressable state. You can route to any turn, which implicitly includes all ancestor context. This is analogous to git's Merkle tree where commits are turns and branch histories are threads.

**Implementation:** See `../../data/ledgers/AGENTS_LEDGER.md` for the concrete SQLite schema.

---

## Primitives

### Message

The atomic unit of communication. Raw content with metadata.

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  source?: 'human' | 'trigger' | 'agent' | 'webhook' | 'cron' | 'event';
  content: string;
  timestamp: number;
  
  // Assistant-specific
  thinking?: string;         // Extended thinking content
  
  // Tool-specific
  toolCallId?: string;       // Links tool result to tool call
}
```

**Role vs Source:**
- `role` = What type of message this is (user input, assistant response, system injection, tool result)
- `source` = Who/what initiated the message (only relevant for non-assistant messages)

A trigger-initiated message has `role: 'user'` (it's input to the assistant) but `source: 'trigger'` (it came from the trigger system, not a human).

---

### Turn

A query + response exchange. **The key addressable unit.**

A turn completes when the assistant finishes responding. It includes:
- The triggering message(s) (query) — could be user, trigger, agent, webhook, cron, event
- All tool calls made during the response
- All agent thinking
- The final assistant response

**Key principles:**
- Multiple input messages can be grouped into one turn (e.g., user sends several messages before assistant responds)
- Turn ID is a ULID — independent, unique, sortable
- Turns link to their parent turn via `parent_turn_id`, forming a tree
- Tool calls are **part of** a turn, not separate turns
- **Compaction turns** are special turns that summarize prior context (see Compaction section)

**Types:** `'normal'` | `'compaction'`

---

### Thread

**A turn viewed with all its ancestry.** The cumulative context up to that point.

```
Thread at Turn 5 = [Turn 1, Turn 2, Turn 3, Turn 4, Turn 5]
```

**Critical insight: # threads = # turns**

Every turn IS a thread (the thread ending at that turn). They're two views of the same thing:
- **Turn:** The independent data for that specific exchange
- **Thread:** The cumulative context including all ancestors

The thread table pre-computes ancestry and total token counts for fast routing and context assembly.

---

### Session

**A named, stable pointer to a thread head.** Sessions give human-readable labels to moving targets.

```
Session "main" → currently points to Turn 47 (the latest turn)
Session "code-worker" → currently points to Turn 12
```

Sessions are first-class entities with their own metadata:
- `label` — Stable identifier (e.g., "main", "code-worker-abc")
- `thread_id` — Current thread head (moves forward as new turns are added)
- `origin` — How the session was created ('user', 'system', 'subagent', 'fork')
- `agent_id` — Which agent this session belongs to

**Session pointer management is critical.** When multiple messages queue for a session, they must be processed serially, with the session pointer updated after each turn. Otherwise you get unintended forks.

**Conceptually** sessions are like git branch tips — they point to the latest commit (turn). Unlike git, the pointer moves automatically as new turns are added.

---

### Head

**The turn a session or thread points to.** Every thread has exactly one head (its turn).

- **Session head:** The turn a session currently points to (active, routeable endpoint)
- **Historical head:** A turn that has been forked from (still routeable, but has children)

---

### Compaction

**A special turn that summarizes prior context.** Used to manage context window limits.

When conversation history approaches the model's context window:
1. Select turns to summarize vs keep
2. Generate an LLM summary of the summarized turns
3. Create a compaction turn with the summary
4. Future context assembly uses: `[summary] + [kept turns] + [new query]`

**Key properties:**
- Compaction IS a turn — it lives in the turn tree like any other turn
- Full history is preserved — compaction doesn't delete anything, just marks a context boundary
- Summary includes prior summaries — recursive compaction works
- Rich metadata is captured in a dedicated compactions table (model used, token impact, duration, trigger reason)

```
Before: Turn 1 → Turn 2 → Turn 3 → Turn 4 → Turn 5 (session head)

Compaction: Summarize 1-3, keep 4-5.

After:  Turn 1 → Turn 2 → Turn 3 → Turn 4 → Turn 5 → CompactionTurn (session head)
                                                            ↑
                                                  summary of 1-3
                                                  kept: 4, 5
```

---

## Configuration

Configuration is layered, not bundled:

### Identity

Who the agent is.

```typescript
interface Identity {
  soul: string;             // SOUL.md content
  name: string;             // Display name
  emoji?: string;           // Visual identifier
}
```

### Permissions

What the agent can do.

```typescript
interface Permissions {
  tools: {
    allow?: string[];       // Whitelist
    deny?: string[];        // Blacklist (wins over allow)
  };
  sandbox?: SandboxConfig;
  credentials?: string[];   // Credential IDs accessible
}
```

### Model Config

How the agent thinks. Can vary per-turn.

```typescript
interface ModelConfig {
  model: string;            // e.g., "claude-sonnet-4-20250514"
  thinking?: ThinkingConfig;
  maxTokens?: number;
  temperature?: number;
}
```

### Persona

Identity + Permissions bundled. A thread decorator.

```typescript
interface Persona {
  id: string;
  identity: Identity;
  permissions: Permissions;
  defaultModelConfig?: ModelConfig;
}
```

**Note:** Persona does NOT include model config as a core property. Model config is separate and can vary per-turn. Persona provides defaults.

**Inheritance:** Worker Agents inherit their Manager Agent's persona. They share identity and permissions for cohesive behavior.

---

## Agent Roles

| Role | Purpose | Spawned By |
|------|---------|------------|
| **Manager (MA)** | Conversation-facing, delegates tasks, manages messaging | NEX pipeline (event arrival) |
| **Worker (WA)** | Task-focused, executes delegated work, reports back | MA (or other WA) via spawn tool |
| **Unified** | Single agent handling both roles (simple deployments) | NEX pipeline |

Workers can spawn nested workers. There is no depth limit.

---

## Routing

### The Primitive

**Route to thread ID.** Everything else builds on this.

### Routing Hierarchy

```
┌─────────────────────────────────────────┐
│           Persona Routing               │  → maps persona → main session
├─────────────────────────────────────────┤
│           Session Routing               │  → maps label → current thread head
├─────────────────────────────────────────┤
│         Turn/Thread Routing             │  → routes to specific turn ID
│            (BEDROCK)                    │
└─────────────────────────────────────────┘
```

| Target | What You Specify | Resolution |
|--------|------------------|------------|
| **Thread** | Thread/Turn ID | Direct routing to that turn's cumulative context |
| **Session** | Session label | Resolves to session's current thread head |
| **Persona** | Persona ID | Resolves to persona's main session |
| **Smart** | Just content | Memory System finds best matching thread |

**All resolve to thread ID.** Thread routing is the primitive.

### Trigger/Automation Routing

Triggers and automations default to persona routing (safest — MA decides where to put things). Session and thread routing are available for advanced use.

---

## Git Analogy

| Concept | Git Equivalent | Description |
|---------|---------------|-------------|
| Message | File change | Atomic content unit |
| Turn | Commit | Complete exchange, addressable |
| Thread | Branch history | Cumulative context to a point |
| Session | Branch tip | Named pointer to latest turn |
| Forking | Branch creation | New thread from existing turn |
| Compaction | Squash commit | Summarize old history, keep recent |
| Persona | Repo/org permissions | Identity + access control |

**Key insight:** Just as git allows you to checkout any commit and branch from there, we allow routing to any turn and continuing from there. The thread is the accumulated state at that point.

---

## Entity Relationships

```
Persona
  └── Session(s) — named pointers, each with a label
        └── Thread — the accumulated turn chain
              └── Turn(s) — individual exchanges in the chain
                    ├── Message(s) — query messages + response message
                    ├── ToolCall(s) — tools invoked during the turn
                    └── Compaction? — if this is a compaction turn
```

---

## Open Questions

1. **Cross-persona forking:** Can a thread be forked with a different persona? (Permission escalation/restriction scenarios)
2. **Thread pruning:** With # threads = # turns, old threads could accumulate. Archival/pruning strategy?
3. **System message handling:** Stored in message chain or injected at context assembly time? (Current answer: injected at assembly time, not stored.)

---

## Related Documents

- `../../data/ledgers/AGENTS_LEDGER.md` — Concrete SQLite schema implementing these concepts
- `OVERVIEW.md` — Broker overview and architecture
- `CONTEXT_ASSEMBLY.md` — How context is built from these primitives
- `AGENT_ENGINE.md` — Agent execution interface
- `../../runtime/iam/` — Identity and access management

---

*This document defines the conceptual model. See `AGENTS_LEDGER.md` for the implementation schema.*
