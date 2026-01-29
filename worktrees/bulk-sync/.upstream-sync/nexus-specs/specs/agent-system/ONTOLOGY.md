# Agent System Ontology

**Status:** DESIGN SPEC  
**Last Updated:** 2026-01-22

---

## Executive Summary

This document defines the precise terminology and data model for the Nexus agent system. Getting this right is foundational — everything else builds on these primitives.

**Core Insight:** Every turn creates a new addressable state. You can route to any turn, which implicitly includes all ancestor context. This is analogous to git's Merkle tree where commits are turns and branch histories are threads.

---

## Primitives

### Message

The atomic unit of communication. Raw content with metadata.

```typescript
interface Message {
  id: string;
  parentId?: string;        // Previous message in chain
  
  // What type of message
  role: 'user' | 'assistant' | 'system' | 'tool';
  
  // Who/what initiated this message (for non-assistant messages)
  source?: 'human' | 'trigger' | 'agent' | 'webhook' | 'cron' | 'event';
  
  // Content
  content: string;
  timestamp: number;
  
  // Assistant-specific fields
  model?: string;
  thinkingConfig?: ThinkingConfig;
  toolCalls?: ToolCall[];
  
  // Tool-specific fields
  toolResult?: ToolResult;
  toolCallId?: string;      // Links tool result to tool call
}
```

**Role vs Source:**
- `role` = What type of message this is (user input, assistant response, system injection, tool result)
- `source` = Who/what initiated the message (only relevant for non-assistant messages)

A trigger-initiated message would have `role: 'user'` (it's input to the assistant) but `source: 'trigger'` (it came from the trigger system, not a human).

---

### Turn

A query + response exchange. **The key addressable unit.**

```typescript
interface Turn {
  id: string;               // Same as the final assistant message ID
  parentTurnId?: string;    // Previous turn (null if root)
  
  // The exchange
  queryMessages: Message[]; // Input: could be user, trigger, agent, system injection
  responseMessage: Message; // Output: the assistant's complete response
  
  // Turn-level metadata (independent, stored per-turn)
  model: string;            // Model used for this turn
  thinkingConfig?: ThinkingConfig;
  toolCalls: ToolCall[];    // Tools invoked during this turn
  tokenCount: number;       // Tokens for just this turn
  timestamp: number;
  
  // Tree structure
  hasChildren: boolean;     // Has this turn been forked from?
}
```

**Key principles:**
- A turn completes when the assistant finishes responding to the query
- A turn can be initiated by: user, trigger, agent message, webhook, cron, event — anything
- Multiple input messages can be grouped into one turn (e.g., user sends several messages before assistant responds)
- Turn ID = final assistant message ID (clean, unambiguous)

---

### Thread

**A turn viewed with all its ancestry.** The cumulative context up to that point.

```typescript
interface Thread {
  id: string;               // Same as the turn ID it represents
  turnId: string;           // The turn this thread points to
  
  // Accumulated data (denormalized for fast queries)
  ancestry: string[];       // Turn IDs from root to this turn
  totalTokens: number;      // Sum of all ancestor turn tokens
  depth: number;            // How many turns deep
  
  // Thread-level config (can be inherited or overridden)
  personaId?: string;       // Identity & permissions
  systemPrompt?: string;    // Base prompt for this thread
  
  // Routing
  threadKey: string;        // Structured key for addressing
}
```

**Critical insight: # threads = # turns**

Every turn IS a thread (the thread ending at that turn). They're two views of the same thing:
- **Turn:** The independent data for that specific exchange
- **Thread:** The cumulative context including all ancestors

This enables:
- Efficient storage (turn data stored once)
- Fast routing (thread data pre-computed)
- Flexible forking (any turn is addressable)

---

### Session

**A thread whose head has no children.** An "active" thread — the tip of the tree.

```typescript
// Session is not a separate data structure.
// It's a QUERY over threads: threads where hasChildren(turnId) == false

type Session = Thread & { hasChildren: false };

function getSessions(): Session[] {
  return threads.filter(t => !getTurn(t.turnId).hasChildren);
}
```

**Sessions are like git branch tips** — they point to the latest commit (turn) that hasn't been forked from.

```
Turn 1 → Turn 2 → Turn 3 (session A - no children)
              ↘
               Turn 4 → Turn 5 (session B - no children)
```

- Thread at Turn 3 = Session A (active)
- Thread at Turn 5 = Session B (active)
- Thread at Turn 2 = NOT a session (has children: Turn 3 and Turn 4)

**Session Manager:**

Sessions need stable identifiers that track the moving head:

```typescript
interface SessionManager {
  // Maps stable session labels to current thread head
  sessions: Map<string, string>;  // label → threadId
  
  // When a new turn is added to a session, update the mapping
  updateSession(label: string, newThreadId: string): void;
  
  // Get current thread for a session
  getSessionThread(label: string): string;
}
```

This is critical for routing — when multiple messages queue for a session, they should all go to the current head, not fork off each other.

---

### Head

**The turn a thread points to.** Every thread has exactly one head (its turn).

- **Session head:** A turn with no children (active, routeable endpoint)
- **Non-session head:** A turn that has been forked from (historical, still routeable)

---

## Configuration

Configuration is layered, not bundled:

### Identity

Who the agent is. Applies to threads.

```typescript
interface Identity {
  soul: string;             // SOUL.md content
  name: string;             // Display name
  emoji?: string;           // Visual identifier
}
```

### Permissions

What the agent can do. Applies to threads.

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
  
  // Defaults (can be overridden per-turn)
  defaultModelConfig?: ModelConfig;
}
```

**Note:** Persona does NOT include model config as a core property. Model config is separate and can vary per-turn. Persona provides defaults.

**Inheritance:** Worker Agents (WAs) inherit their Manager Agent's (MA) persona. They share identity and permissions for cohesive behavior.

---

## Storage Strategy

Dual storage for efficiency:

### Turn Table (Independent Data)

```sql
CREATE TABLE turns (
  id TEXT PRIMARY KEY,
  parent_turn_id TEXT REFERENCES turns(id),
  
  -- The exchange
  query_messages_json TEXT,   -- Input messages
  response_message_json TEXT, -- Assistant response
  
  -- Turn-specific metadata
  model TEXT,
  thinking_config_json TEXT,
  tool_calls_json TEXT,
  token_count INTEGER,
  timestamp INTEGER,
  
  -- Tree structure
  has_children BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_turns_parent ON turns(parent_turn_id);
CREATE INDEX idx_turns_has_children ON turns(has_children);
```

### Thread Table (Accumulated Data)

```sql
CREATE TABLE threads (
  turn_id TEXT PRIMARY KEY REFERENCES turns(id),
  
  -- Accumulated (denormalized for fast queries)
  ancestry_json TEXT,         -- JSON array of turn IDs from root
  total_tokens INTEGER,
  depth INTEGER,
  
  -- Config
  persona_id TEXT,
  system_prompt TEXT,
  
  -- Routing
  thread_key TEXT UNIQUE
);

CREATE INDEX idx_threads_key ON threads(thread_key);
```

### Session Table (Stable Identifiers)

```sql
CREATE TABLE sessions (
  label TEXT PRIMARY KEY,     -- Stable identifier (e.g., "main", "code-worker")
  thread_id TEXT REFERENCES threads(turn_id),
  persona_id TEXT,
  updated_at INTEGER
);
```

**On every new turn:**
1. Insert turn record (independent data)
2. Insert thread record (accumulated from parent + this turn)
3. Update parent turn's `has_children = TRUE`
4. Update session mapping if this extends a labeled session

---

## Routing

### The Primitive

**Route to thread ID.** Everything else builds on this.

```typescript
interface RoutingTarget {
  threadId: string;         // Required: which thread to append to
  
  // Optional config overrides
  modelConfig?: ModelConfig;
  permissions?: Permissions;
}

function routeToThread(target: RoutingTarget, message: Message): Turn {
  const thread = getThread(target.threadId);
  const config = mergeConfig(thread, target);
  const newTurn = createTurn(thread.turnId, message, config);
  const newThread = createThread(newTurn, thread);
  return newTurn;
}
```

### Layers Built on Thread Routing

```typescript
// Route to session (stable label → current thread head)
function routeToSession(sessionLabel: string, message: Message): Turn {
  const threadId = sessionManager.getSessionThread(sessionLabel);
  return routeToThread({ threadId }, message);
}

// Route to persona (persona's main session)
function routeToPersona(personaId: string, message: Message): Turn {
  const mainSession = getMainSession(personaId);  // e.g., "atlas:main"
  return routeToSession(mainSession, message);
}

// Smart routing (find best thread via content matching)
function routeSmart(message: Message): Turn {
  const bestThread = cortex.findBestThread(message.content);
  return routeToThread({ threadId: bestThread.id }, message);
}
```

### Routing Targets Summary

| Target | What You Specify | Resolution |
|--------|------------------|------------|
| **Thread** | Thread ID | Direct routing to that turn's cumulative context |
| **Session** | Session label | Resolves to session's current thread head |
| **Persona** | Persona ID | Resolves to persona's main session |
| **Smart** | Just content | Cortex finds best matching thread |

**All resolve to thread ID.** Thread routing is the primitive.

---

## Trigger Routing

Triggers need to specify where their messages go:

```typescript
interface TriggerRouting {
  mode: 'persona' | 'session' | 'thread';
  
  target?: string;          // Session label or thread ID (not needed for persona)
}

// Default: route to MA via persona
const defaultTriggerRouting: TriggerRouting = {
  mode: 'persona'
};
```

**Why default to persona (MA)?**
- Safest option — MA can decide appropriate routing
- Avoids stale context issues with long-lived triggers
- MA can fork or route to current WA as appropriate

**Future options:**
- `mode: 'session'` — Route to specific WA session
- `mode: 'thread'` — Fork from specific turn (advanced)

For v1, only expose persona routing. Other modes are internal/future.

---

## Git Analogy Summary

| Concept | Git Equivalent | Description |
|---------|---------------|-------------|
| Message | File change | Atomic content unit |
| Turn | Commit | Complete exchange, addressable |
| Thread | Branch history | Cumulative context to a point |
| Session | Branch tip | Active thread (no forks from head) |
| Forking | Branch creation | New thread from existing turn |
| Persona | Repo/org permissions | Identity + access control |

**Key insight:** Just as git allows you to checkout any commit and branch from there, we allow routing to any turn and continuing from there. The thread is the accumulated state at that point.

---

## Open Questions

1. **Subagent parent-child tracking:** Cursor stores this via `toolCallId` linking. Do we want explicit `parentThreadId` or similar in our model?

2. **Thread pruning:** With # threads = # turns, old threads could accumulate. Archival/pruning strategy needed?

3. **Cross-persona forking:** Can a thread be forked with a different persona? (Permission escalation/restriction scenarios)

4. **System message handling:** Store in message chain or inject at context assembly time?

---

## Related Documents

- `TERMINOLOGY.md` — Quick reference for terms
- `BROKER.md` — Agent Broker routing implementation
- `UNIFIED_TRIGGERS.md` — Trigger system using this routing model
- `UPSTREAM_AGENT_SYSTEM.md` — How upstream handles sessions

---

*This document is the canonical reference for agent system data model. All other specs should use these definitions.*
