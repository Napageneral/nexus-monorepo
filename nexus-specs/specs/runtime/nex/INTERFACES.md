# NEX Component Interfaces

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-02  
**Related:** NEX.md, NEXUS_REQUEST.md

---

## Overview

This document defines the contracts between NEX pipeline components. Each interface specifies what data flows, in what format, and who is responsible for what.

**Note:** In the centralized NEX model, all data flows through the `NexusRequest` data bus. These interfaces describe what each stage adds to or reads from the NexusRequest, rather than direct component-to-component calls.

---

## Interface Map

```
┌───────────────┐                           ┌──────────────────────────────────────┐
│  IN-ADAPTERS  │──── (1) NormalizedEvent ─►│         SYSTEM OF RECORD             │
└───────────────┘                           │         (Events Ledger)              │
                                            └──────────────────┬───────────────────┘
                                                               │
                                                     (2) EventTrigger
                                                               │
                                                               ▼
                                            ┌──────────────────────────────────────┐
                                            │              NEX PIPELINE            │
                                            │                                      │
                                            │  ┌─────────────┐                     │
                                            │  │     IAM     │◄─(8)─ Cortex        │
                                            │  │ (Identity)  │       enrichment    │
                                            │  └──────┬──────┘                     │
                                            │         │                            │
                                            │  (3) IdentityLookup                  │
                                            │         │                            │
                                            │         ▼                            │
                                            │  ┌─────────────┐                     │
                                            │  │     IAM     │                     │
                                            │  │   (Access)  │                     │
                                            │  └──────┬──────┘                     │
                                            │         │                            │
                                            │  (4) ACLResult                       │
                                            │         │ (allow/deny + permissions) │
                                            │         ▼                            │
                                            │  ┌─────────────┐                     │
                                            │  │   HOOKS     │                     │
                                            │  │   ENGINE    │                     │
                                            │  └──────┬──────┘                     │
                                            │         │                            │
                                            └─────────┼────────────────────────────┘
                                                      │
                                            (5) BrokerDispatch
                                                      │
                                                      ▼
                                            ┌──────────────────┐
                                            │      BROKER      │
                                            └────────┬─────────┘
                                                     │
                         ┌───────────────────────────┼───────────────────────────┐
                         │                           │                           │
               (6) AgentInvoke               (7) LedgerWrite             (9) OutAdapterSend
                         │                           │                           │
                         ▼                           ▼                           ▼
                  ┌────────────┐            ┌──────────────┐            ┌──────────────┐
                  │   AGENTS   │            │ SYSTEM OF    │            │ OUT-ADAPTERS │
                  │  (MA/WAs)  │            │ RECORD       │            └──────┬───────┘
                  └─────┬──────┘            │ (Agents)     │                   │
                        │                   └──────────────┘                   │
                        │                                                      │
                        └──────────────────────────────────────────────────────┤
                                                                               │
                                                               (10) ResponseEvent
                                                                               │
                                                                               ▼
                                                               SYSTEM OF RECORD
                                                               (Events Ledger)
                                                               (closes loop)

┌───────────────────────────────────────────────────────────────────────────────────┐
│                                    CORTEX                                          │
│                               (Derived Layer)                                      │
│                                                                                   │
│   Reads from: System of Record (Events, Identity, Agents ledgers)                 │
│   Writes to: Identity enrichment, Cortex tables (episodes, facets, embeddings)   │
│                                                                                   │
│   Read by: Hooks (context), Broker (smart forking), CLI (search), Agents (RAG)    │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## Interface Contracts

### (1) In-Adapter → Events Ledger: `NormalizedEvent`

The adapter normalizes external data into a canonical event format.

```typescript
interface NormalizedEvent {
  // Identity
  id: string;                      // Deterministic: "{source}:{source_id}"
  source: AdapterSource;           // 'imessage' | 'gmail' | 'discord' | ...
  source_id: string;               // Original ID from source
  
  // Classification
  type: EventType;                 // 'message' | 'email' | 'reaction' | ...
  thread_id?: string;              // Thread grouping
  
  // Content
  content: string;                 // Normalized text content
  content_type: 'text' | 'html';
  attachments?: Attachment[];
  
  // Participants
  from: ParticipantRef;            // { channel, identifier }
  to?: ParticipantRef[];
  
  // Timing
  timestamp: number;               // Unix ms
  
  // Source-specific
  metadata?: Record<string, any>;  // Platform-specific extras
}
```

**Contract:**
- Adapter MUST generate deterministic `id` (enables idempotent sync)
- Adapter MUST normalize content to text (strip platform-specific formatting)
- Adapter MUST provide `from` participant reference

---

### (2) Events Ledger → NEX: `EventTrigger`

New events trigger the NEX pipeline (via DB trigger, polling, or push).

```typescript
interface EventTrigger {
  event_id: string;
  event: NormalizedEvent;          // Full event data
  thread_context?: ThreadContext;  // Previous events in thread
}
```

**Contract:**
- Ledger MUST trigger NEX for each new event
- Ledger MAY batch triggers for efficiency
- NEX MUST process each trigger exactly once (idempotent)

---

### (3) IAM (internal): `IdentityLookup`

NEX queries Identity Graph to resolve the sender.

```typescript
interface IdentityLookupRequest {
  channel: string;                 // 'imessage', 'discord', etc.
  identifier: string;              // '+15551234567', 'user#1234', etc.
}

interface IdentityLookupResult {
  // Contact info (always present after first interaction)
  contact: {
    channel: string;
    identifier: string;
    first_seen: number;
    last_seen: number;
    message_count: number;
    display_name?: string;         // From platform if available
  };
  
  // Identity mapping (may or may not exist)
  mapping?: {
    entity_id: string;
    mapping_type: 'confirmed' | 'inferred' | 'pending' | 'unknown';
    confidence?: number;           // For inferred/pending
  };
  
  // Resolved entity (only if mapping exists and is confirmed/inferred)
  entity?: {
    id: string;
    type: 'person' | 'persona';
    name?: string;
    is_user: boolean;
    relationship?: string;
    tags: string[];
  };
}
```

**Contract:**
- Lookup MUST upsert contact (update last_seen, message_count)
- Lookup MUST return entity only if mapping_type is 'confirmed' or 'inferred'
- NEX MUST proceed with unknown principal if no resolved entity

---

### (4) IAM (internal): `ACLResult`

ACL evaluates policies and returns access decision + permissions.

```typescript
interface ACLResult {
  decision: 'allow' | 'deny';
  
  // Only present if allowed
  principal?: Principal;
  permissions?: {
    tools: { allow: string[]; deny: string[] };
    credentials: { allow: string[]; deny: string[] };
    data: { allow: string[]; deny: string[] };
  };
  session?: {
    persona: string;
    key: string;
    label?: string;
  };
  
  // Audit
  matched_policy?: string;
  reason?: string;
}
```

**Contract:**
- IAM MUST return decision for every event
- If `deny`, pipeline MUST NOT proceed to hooks or broker
- If `allow`, pipeline MUST pass permissions to broker

---

### (5) Hooks Engine → Broker: `BrokerDispatch`

Fired hooks dispatch to the Broker with routing and context.

```typescript
interface BrokerDispatch {
  // Routing
  persona: string;                 // Target agent persona
  session_key: string;             // Session routing key
  queue_mode: 'steer' | 'followup' | 'collect' | 'interrupt';
  
  // Original event
  event_id: string;
  event: NormalizedEvent;
  
  // Access control
  principal: Principal;
  permissions: Permissions;
  
  // Hook context
  hook_context?: {
    prompt?: string;               // System prompt injection
    extracted?: Record<string, any>;
  };
  
  // Reply target (for out-adapter)
  reply_to?: {
    channel: string;
    thread_id?: string;
    recipient?: ParticipantRef;
  };
}
```

**Contract:**
- Hook MUST provide `persona` and `session_key` for routing
- Hook MAY provide `hook_context` for prompt injection
- Broker MUST respect `permissions` during agent execution

---

### (6) Broker → Agent: `AgentInvoke`

Broker invokes the agent with session context and message.

```typescript
interface AgentInvoke {
  // Session
  session_id: string;
  turn_id: string;                 // New turn being created
  parent_turn_id?: string;         // Parent in tree (for forking)
  
  // Agent config
  persona: string;
  model_config: ModelConfig;
  
  // Message
  messages: Message[];             // Conversation history
  new_message: Message;            // The incoming message
  
  // Permissions (agent must respect)
  permissions: Permissions;
  
  // Context from Cortex
  context?: CortexContext;
  
  // Reply target
  reply_to?: ReplyTarget;
}
```

**Contract:**
- Broker MUST provide conversation history (from Agents Ledger)
- Agent MUST respect `permissions` (tool/credential access)
- Agent MUST return structured response for ledger storage

---

### (7) Broker → Agents Ledger: `LedgerWrite`

Broker writes session/turn/message data directly to Agents Ledger.

```typescript
// All writes are direct SQL inserts/updates
interface TurnWrite {
  id: string;
  session_id: string;
  parent_turn_id?: string;
  started_at: number;
  completed_at?: number;
  status: 'pending' | 'streaming' | 'completed' | 'failed';
}

interface MessageWrite {
  id: string;
  turn_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: number;
}

interface ToolCallWrite {
  id: string;
  turn_id: string;
  tool_name: string;
  parameters: string;              // JSON
  result?: string;                 // JSON
  started_at: number;
  completed_at?: number;
  status: 'pending' | 'completed' | 'failed';
}
```

**Contract:**
- Broker MUST write turn on start (status='pending')
- Broker MUST update turn on completion
- Broker MUST update session pointer after turn completes

---

### (8) Cortex → Identity Ledger: `IdentityEnrichment`

Cortex can write back learned relationships to Identity Ledger.

```typescript
interface IdentityEnrichment {
  entity_id: string;
  
  // Updates (all optional)
  relationship?: string;           // Learned from conversation patterns
  tags_add?: string[];
  tags_remove?: string[];
  
  // New identities discovered
  new_identities?: {
    channel: string;
    identifier: string;
  }[];
  
  // Confidence
  confidence: number;              // 0-1, for review thresholds
  source: 'cortex_analysis';
}
```

**Contract:**
- Cortex SHOULD only write high-confidence enrichments
- Cortex MUST NOT overwrite user-set values (relationship, name)
- Low-confidence enrichments SHOULD queue for human review

---

### (9) Broker/Agent → Out-Adapter: `OutAdapterSend`

Agent responses are formatted and sent via out-adapters.

```typescript
interface OutAdapterSend {
  // Target
  channel: string;                 // 'discord', 'telegram', etc.
  thread_id?: string;
  recipient?: ParticipantRef;
  
  // Content
  content: string;                 // Markdown
  attachments?: Attachment[];
  
  // Platform hints
  format_hints?: {
    use_embed?: boolean;           // Discord
    use_blocks?: boolean;          // Slack
    suppress_link_previews?: boolean;
  };
  
  // Source (for event capture)
  source_turn_id: string;
  source_persona: string;
}
```

**Contract:**
- Out-Adapter MUST format content per platform rules
- Out-Adapter MUST handle platform limits (truncation, splitting)
- Out-Adapter MUST capture response as event (interface 10)

---

### (10) Out-Adapter → Events Ledger: `ResponseEvent`

Sent responses become events in the ledger (closes the loop).

```typescript
interface ResponseEvent extends NormalizedEvent {
  type: 'message';
  source: 'nexus';                 // Self-generated
  
  // Link to originating turn
  metadata: {
    turn_id: string;
    persona: string;
    in_reply_to?: string;          // Original event_id
  };
}
```

**Contract:**
- Out-Adapter MUST write response event after successful send
- Response event MUST link to originating turn
- This enables "what did the agent say?" queries

---

## Cortex Interfaces (Passive)

Cortex is primarily a passive consumer that reads from System of Record and is queried by other components.

### Cortex Reads From:

| Ledger | What | Trigger |
|--------|------|---------|
| Events Ledger | New events | On insert (trigger/poll) |
| Identity Ledger | Entity data | On demand (join) |
| Agents Ledger | Turns, messages | On insert (trigger/poll) |

### Cortex Is Queried By:

| Component | Query Type | Purpose |
|-----------|------------|---------|
| Hooks | Semantic search | Context for hook evaluation |
| Broker | Smart forking | Find best fork point |
| Broker | Context enrichment | RAG for agent context |
| Agents | Tool calls | `cortex_search` tool |
| CLI | `nexus search` | User semantic search |

### Cortex Query Interface:

```typescript
interface CortexQuery {
  query: string;                   // Natural language or semantic
  filters?: {
    sources?: string[];            // Limit to adapters
    time_range?: { start: number; end: number };
    entity_ids?: string[];         // Limit to participants
  };
  limit?: number;
  include_embeddings?: boolean;
}

interface CortexResult {
  hits: {
    episode_id: string;
    score: number;
    content_preview: string;
    source_event_ids: string[];
    facets: Facet[];
  }[];
  total_hits: number;
}
```

---

## Related Documents

- **NEX.md** — Pipeline orchestration details
- **NEXUS_REQUEST.md** — Data bus schema
- **../broker/** — Broker implementation
- **../iam/** — IAM policies and grants
- **../hooks/** — Hooks Engine specification
