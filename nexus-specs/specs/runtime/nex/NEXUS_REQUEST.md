# NexusRequest Lifecycle

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-06

---

## Overview

The `NexusRequest` is the data bus that flows through the entire NEX pipeline. Each of the 8 stages reads from it and writes to it, building up a complete trace of everything that happened for a given event.

**Inspired by:** Ad exchange bid request patterns — a single object that accumulates context as it flows through the system.

**Design Goals:**
1. **Progressive** — Fields are added stage by stage, never removed
2. **Debuggable** — Full trace of every pipeline stage with timing
3. **Auditable** — Complete record persisted to Nexus Ledger
4. **Typed** — Each stage's contribution is a distinct, well-typed section

---

## The 8 Stages

```
NexusRequest created ─────────────────────────────────────────────────
  │
  │  Stage 1: receiveEvent
  │  ├─ Writes: request_id, event, delivery
  │  └─ Side effect: write to Events Ledger (async)
  │
  │  Stage 2: resolveIdentity
  │  ├─ Reads: delivery.sender_id, delivery.channel
  │  ├─ Writes: principal
  │  └─ May exit: unknown sender → deny policy
  │
  │  Stage 3: resolveAccess
  │  ├─ Reads: principal, delivery (channel, peer_kind)
  │  ├─ Writes: access (decision, permissions, session routing)
  │  └─ May exit: access denied
  │
  │  Stage 4: runAutomations
  │  ├─ Reads: event, principal, access
  │  ├─ Writes: triggers (which fired, context enrichment, overrides)
  │  └─ May exit: automation handles event completely
  │
  │  Stage 5: assembleContext
  │  ├─ Reads: event, delivery, principal, access, triggers
  │  ├─ Writes: agent (turn_id, model, token budget, context metadata)
  │  └─ Side effect: builds AssembledContext (NOT stored on NexusRequest)
  │
  │  Stage 6: runAgent
  │  ├─ Reads: (uses AssembledContext from stage 5, not NexusRequest directly)
  │  ├─ Writes: response (content, tool_calls, usage, stop_reason)
  │  └─ Side effects: streams to adapter, writes to Agents Ledger
  │
  │  Stage 7: deliverResponse
  │  ├─ Reads: response, delivery
  │  ├─ Writes: delivery_result (message_ids, success)
  │  └─ Note: may be no-op if streaming already delivered
  │
  │  Stage 8: finalize
  │  ├─ Writes: pipeline (timing trace), status
  │  └─ Side effects: write to Nexus Ledger, emit outbound event to Events Ledger
  │
NexusRequest complete ────────────────────────────────────────────────
```

---

## Full Schema

```typescript
interface NexusRequest {
  // ═══════════════════════════════════════════════════════════════════
  // IDENTITY (immutable after creation)
  // ═══════════════════════════════════════════════════════════════════
  
  request_id: string;                // ULID — unique, sortable
  created_at: number;                // Unix ms — when NEX received the event
  
  // ═══════════════════════════════════════════════════════════════════
  // STAGE 1: receiveEvent
  // ═══════════════════════════════════════════════════════════════════
  
  event: EventContext;
  delivery: DeliveryContext;
  
  // ═══════════════════════════════════════════════════════════════════
  // STAGE 2: resolveIdentity
  // ═══════════════════════════════════════════════════════════════════
  
  principal?: PrincipalContext;       // null until stage 2 runs
  
  // ═══════════════════════════════════════════════════════════════════
  // STAGE 3: resolveAccess
  // ═══════════════════════════════════════════════════════════════════
  
  access?: AccessContext;             // null until stage 3 runs
  
  // ═══════════════════════════════════════════════════════════════════
  // STAGE 4: runAutomations
  // ═══════════════════════════════════════════════════════════════════
  
  triggers?: TriggerContext;          // null until stage 4 runs
  
  // ═══════════════════════════════════════════════════════════════════
  // STAGE 5: assembleContext
  // ═══════════════════════════════════════════════════════════════════
  
  agent?: AgentContext;               // null until stage 5 runs
  
  // ═══════════════════════════════════════════════════════════════════
  // STAGE 6: runAgent
  // ═══════════════════════════════════════════════════════════════════
  
  response?: ResponseContext;         // null until stage 6 completes
  
  // ═══════════════════════════════════════════════════════════════════
  // STAGE 7: deliverResponse
  // ═══════════════════════════════════════════════════════════════════
  
  delivery_result?: DeliveryResult;   // null until stage 7 runs
  
  // ═══════════════════════════════════════════════════════════════════
  // STAGE 8: finalize
  // ═══════════════════════════════════════════════════════════════════
  
  pipeline: PipelineTrace[];          // Grows with each stage
  status: RequestStatus;              // Final outcome
}

type RequestStatus =
  | 'processing'                      // Pipeline in progress
  | 'completed'                       // Normal completion
  | 'denied'                          // ACL denied (exits at stage 2 or 3)
  | 'handled_by_automation'           // Automation handled completely (exits at stage 4)
  | 'failed';                         // Error at any stage
```

---

## Stage 1: receiveEvent

**Who:** Adapter Manager (receives JSONL from adapter process)  
**What:** Creates NexusRequest from raw adapter event, writes to Events Ledger.

### Writes

```typescript
interface EventContext {
  // From adapter's JSONL output
  event_id: string;                  // "{channel}:{source_id}" — globally unique
  timestamp: number;                 // When the event occurred (Unix ms)
  
  // Content
  content: string;
  content_type: 'text' | 'image' | 'audio' | 'video' | 'file';
  attachments?: Attachment[];
  
  // Platform metadata (adapter-specific, opaque to pipeline)
  metadata?: Record<string, unknown>;
}

interface DeliveryContext {
  // Where this came from and where the reply goes
  channel: string;                   // "discord", "imessage", "gmail", etc.
  account_id: string;                // Which adapter account received this
  
  // Sender
  sender_id: string;                 // Platform-specific sender identifier
  sender_name?: string;              // Display name if available
  
  // Conversation context
  peer_id: string;                   // Chat/channel/user ID (reply target)
  peer_kind: 'dm' | 'group' | 'channel';
  thread_id?: string;                // Platform thread if applicable
  reply_to_id?: string;              // Message being replied to
  
  // Channel capabilities (from adapter info, cached by Adapter Manager)
  capabilities: ChannelCapabilities;
  
  // Available outbound channels (all active adapters — for agent context)
  available_channels: AvailableChannel[];
}

interface AvailableChannel {
  channel: string;
  accounts: string[];
  capabilities: ChannelCapabilities;
}
```

### Side Effect

```
Events Ledger ← INSERT event (async, fire-and-forget)
  - Idempotent via UNIQUE(source, source_id)
  - Does not block the pipeline
```

### Pipeline Trace Entry

```typescript
{ stage: 'receiveEvent', timestamp: number, duration_ms: number }
```

---

## Stage 2: resolveIdentity

**Who:** IAM  
**What:** Resolves WHO sent this event. Queries Identity Graph.

### Reads

- `delivery.channel` + `delivery.sender_id` — used to look up identity
- `delivery.peer_kind` — context for system principals (timers, webhooks)

### Writes

```typescript
interface PrincipalContext {
  // Classification
  type: 'owner' | 'known' | 'unknown' | 'system' | 'webhook' | 'agent';
  
  // Identity (from Identity Graph — may be null for unknown)
  entity_id?: string;                // entities table primary key
  name?: string;                     // "Mom", "Casey", "Tyler"
  relationship?: string;             // "family", "partner", "work", "friend"
  
  // All known identities for this entity (for cross-channel awareness)
  identities?: { channel: string; identifier: string }[];
  
  // For system/webhook principals
  source?: string;                   // "timer", "stripe", "github"
}
```

### May Exit

If the sender is unknown and the default policy is deny, the pipeline exits here:

```typescript
if (principal.type === 'unknown' && defaultPolicy === 'deny') {
  request.status = 'denied';
  request.pipeline.push({ stage: 'resolveIdentity', ..., exit_reason: 'unknown_sender_denied' });
  goto finalize;
}
```

---

## Stage 3: resolveAccess

**Who:** IAM  
**What:** Evaluates ACL policies to determine WHAT the sender can do and WHERE it routes.

### Reads

- `principal` — who is this?
- `delivery.channel`, `delivery.peer_kind`, `delivery.account_id` — context conditions for policy matching

### Writes

```typescript
interface AccessContext {
  // The decision
  decision: 'allow' | 'deny';
  matched_policy?: string;           // Which policy matched (for audit)
  
  // Permissions (union of all matching allow policies)
  permissions: {
    tools: {
      allow: string[];               // Whitelisted tools
      deny: string[];                // Blacklisted tools (wins over allow)
    };
    credentials: string[];           // Allowed credential services
    data_access: 'none' | 'minimal' | 'contextual' | 'full';
  };
  
  // Session routing (from highest-priority matching policy)
  routing: {
    persona: string;                 // Which agent persona handles this
    session_label: string;           // Session key for routing
    queue_mode?: QueueMode;          // How to handle busy sessions
  };
  
  // Rate limiting
  rate_limited?: boolean;
  rate_limit_remaining?: number;
}

type QueueMode = 'steer' | 'followup' | 'collect' | 'steer-backlog' | 'queue' | 'interrupt';
```

### May Exit

If access is denied:

```typescript
if (access.decision === 'deny') {
  request.status = 'denied';
  goto finalize;
}
```

### Audit Side Effect

```
IAM Audit Log ← INSERT decision record
  - principal, policy matched, decision, timestamp
```

---

## Stage 4: runAutomations

**Who:** Hook Engine (automations are the primary hook type here)  
**What:** Evaluates registered automations against the event. May enrich context, override routing, or handle the event entirely.

### Reads

- `event` — content matching
- `principal` — who-based triggers
- `access.permissions` — what the sender can do (passed to automation context)
- `access.routing.session_label` — current routing target

### Writes

```typescript
interface TriggerContext {
  // What was evaluated
  automations_evaluated: string[];   // All automation IDs checked
  automations_fired: string[];       // Automations that returned fire: true
  
  // Pipeline hooks (non-automation)
  hooks_evaluated?: string[];        // Other pipeline hooks that ran
  
  // Context enrichment (merged into agent context)
  enrichment?: Record<string, unknown>;
  
  // Routing overrides (automation can redirect)
  routing_override?: {
    persona?: string;                // Override persona
    session_label?: string;          // Override session
    agent?: string;                  // Override which agent
  };
  
  // Complete handling (event fully handled by automation, skip agent)
  handled?: boolean;
  handled_by?: string;               // Automation ID that handled it
  
  // Automation-specific data (for debugging)
  automation_results?: {
    id: string;
    fire: boolean;
    duration_ms: number;
    error?: string;
  }[];
}
```

### May Exit

If an automation handles the event completely:

```typescript
if (triggers.handled) {
  request.status = 'handled_by_automation';
  // Automation may have sent a response directly or triggered a different agent
  goto finalize;
}
```

### Routing Merge

If automations provide routing overrides, they're merged with ACL routing:

```typescript
const effectiveRouting = {
  persona: triggers.routing_override?.persona ?? access.routing.persona,
  session_label: triggers.routing_override?.session_label ?? access.routing.session_label,
  queue_mode: access.routing.queue_mode ?? 'followup',
};
```

---

## Stage 5: assembleContext

**Who:** Broker  
**What:** Reads from NexusRequest to build the `AssembledContext` that the agent engine needs. This is the critical NexusRequest → AssembledContext mapping.

### Reads (everything so far)

| NexusRequest field | Used for |
|---|---|
| `event.content`, `event.attachments` | Current message (Layer 3: Event) |
| `event.metadata` | Event-specific context injection |
| `delivery.channel`, `delivery.capabilities` | Channel context for MA (Layer 3: Event) |
| `delivery.available_channels` | Available channels for message tool (Layer 3: Event) |
| `principal.name`, `principal.relationship` | Sender context for MA (Layer 3: Event) |
| `access.permissions` | IAM-filtered tool set |
| `access.routing.persona` | Which persona → which SOUL.md, IDENTITY.md (Layer 1: System Prompt) |
| `access.routing.session_label` | Which session → which thread → conversation history (Layer 2: History) |
| `triggers.enrichment` | Automation-enriched context (Layer 3: Event) |
| `triggers.routing_override` | Overridden persona/session if applicable |

### Produces (internal, NOT on NexusRequest)

The Broker produces an `AssembledContext` object that goes to the agent engine. This is an **internal** object — it does NOT live on the NexusRequest. See `broker/AGENT_ENGINE.md` for the full type.

```
NexusRequest ──► Broker.assembleContext() ──► AssembledContext
                                                  │
                                                  ├── systemPrompt (Workspace + Persona layers)
                                                  ├── history[] (Session layer from Agents Ledger)
                                                  ├── currentMessage (Event + Cortex layers)
                                                  ├── tools (IAM-filtered from access.permissions)
                                                  ├── model, provider, modelConfig
                                                  ├── tokenBudget
                                                  └── metadata (session, turn, role — for ledger writes)
```

### Writes (metadata for trace)

```typescript
interface AgentContext {
  // Agent identity
  agent_id: string;                  // e.g., "atlas"
  persona_id: string;                // e.g., "atlas"
  role: 'manager' | 'worker' | 'unified';
  
  // Session/turn routing (resolved from access.routing + triggers.routing_override)
  session_label: string;
  parent_turn_id: string;            // Turn we're appending to
  turn_id: string;                   // New turn ID (ULID, generated here)
  
  // Model
  model: string;                     // e.g., "claude-sonnet-4-20250514"
  provider: string;                  // e.g., "anthropic"
  
  // Token budget snapshot (what was the context budget at assembly time?)
  token_budget: {
    model_limit: number;             // Model's context window
    system_prompt_tokens: number;    // Layer 1 estimate
    history_tokens: number;          // Layer 2 from ledger
    event_tokens: number;            // Layer 3 estimate
    total_used: number;
    remaining: number;
  };
  
  // Context assembly metadata
  system_prompt_hash: string;        // For cache hit debugging
  history_turns_count: number;       // How many turns in history
  compaction_applied: boolean;       // Was compaction needed?
  
  // Tools
  toolset_name: string;              // Named toolset applied
  tools_available: string[];         // After IAM filtering
  permissions_snapshot: string[];    // Permissions at execution time
}
```

### Side Effect: Proactive Compaction

If the token budget doesn't fit, the Broker triggers compaction BEFORE sending to the agent:

```
Check budget → doesn't fit → triggerCompaction() → rebuild history → proceed
```

---

## Stage 6: runAgent

**Who:** Broker (delegates to Agent Engine / pi-coding-agent)  
**What:** Executes the agent with the AssembledContext. Streams tokens to NEX. Writes to Agents Ledger after completion.

### Reads

- Uses `AssembledContext` (internal, from stage 5), not NexusRequest directly
- The agent engine has no knowledge of NexusRequest

### Writes

```typescript
interface ResponseContext {
  // Content
  content: string;                   // Final assistant message text
  
  // Tool calls
  tool_calls: ToolCallSummary[];
  
  // Token usage
  usage: {
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    cache_write_tokens: number;
    reasoning_tokens: number;
    total_tokens: number;
  };
  
  // Execution metadata
  stop_reason: 'end_turn' | 'max_tokens' | 'timeout' | 'aborted' | 'error';
  duration_ms: number;
  
  // Error (if failed)
  error?: {
    kind: string;                    // 'context_overflow', 'auth_failure', etc.
    message: string;
    retryable: boolean;
  };
  
  // Compaction (if triggered during execution — reactive fallback)
  compaction?: {
    triggered: boolean;
    turns_summarized: number;
    tokens_saved: number;
    trigger: 'context_limit' | 'overflow_recovery';
  };
  
  // Subagent spawns
  subagents_spawned?: {
    session_label: string;
    role: string;
  }[];
}

interface ToolCallSummary {
  tool_call_id: string;
  tool_name: string;
  status: 'completed' | 'failed';
  duration_ms: number;
  spawned_session?: string;          // If tool spawned a subagent
}
```

### Side Effects

**Streaming:** During execution, the Broker emits `StreamEvent` objects to NEX via `BrokerStreamHandle`. NEX routes them to the adapter (or block pipeline). See `../STREAMING.md`.

**Agents Ledger write:** After execution completes, the Broker writes the full `AgentResult` to the Agents Ledger in a single transaction:

```
Agents Ledger ← INSERT turn, messages, tool_calls, thread, session pointer update
  - If compaction: also INSERT compactions record
  - All in one transaction
```

---

## Stage 7: deliverResponse

**Who:** NEX + Adapter Manager  
**What:** Ensures the response reached the user. May be a no-op if streaming already delivered.

### Reads

- `response.content` — what to deliver (if not already streamed)
- `delivery.channel`, `delivery.account_id`, `delivery.peer_id` — where to deliver

### Writes

```typescript
interface DeliveryResult {
  success: boolean;
  message_ids: string[];             // Platform message IDs
  chunks_sent: number;               // How many blocks/messages
  streamed: boolean;                 // Was this delivered via streaming?
  error?: string;
}
```

### Delivery Paths

```
Was response streamed during stage 6?
  │
  YES → delivery_result = { success: true, streamed: true, message_ids: [from stream status] }
  │
  NO → NEX calls adapter send command
       delivery_result = { success: ..., streamed: false, message_ids: [...] }
```

---

## Stage 8: finalize

**Who:** NEX  
**What:** Writes the complete pipeline trace, emits outbound event, sets final status.

### Writes

```typescript
interface PipelineTrace {
  stage: string;                     // Stage name
  started_at: number;                // Unix ms
  duration_ms: number;               // How long this stage took
  exit_reason?: string;              // If pipeline exited at this stage
  error?: string;                    // If this stage errored
}
```

### Final Status

```typescript
// Determined by what happened during the pipeline
if (stage2_denied || stage3_denied) → 'denied'
if (stage4_handled)                 → 'handled_by_automation'
if (any_stage_errored)              → 'failed'
else                                → 'completed'
```

### Side Effects

**Nexus Ledger:** The complete NexusRequest (all stages populated) is written as a trace record:

```
Nexus Ledger ← INSERT nex_traces (request_id, event_id, status, request_json, timing)
```

**Events Ledger (outbound):** If a response was generated and delivered, the outbound message is written as an event too (closes the loop):

```
Events Ledger ← INSERT outbound event
  - source: 'nexus'
  - direction: 'outbound'
  - Links back to request_id
```

---

## NexusRequest → AssembledContext Mapping

This is the critical interface between NEX (pipeline) and Broker (agent execution).

```
┌──────────────────────────────────┐         ┌──────────────────────────────────┐
│         NexusRequest              │         │        AssembledContext           │
│                                   │         │                                  │
│  event.content ──────────────────────────►  currentMessage.content            │
│  event.attachments ──────────────────────►  currentMessage.attachments        │
│  delivery.channel ───────────────────────►  currentMessage (channel context)  │
│  delivery.capabilities ──────────────────►  currentMessage (channel context)  │
│  principal.name/relationship ────────────►  currentMessage (sender context)   │
│  triggers.enrichment ────────────────────►  currentMessage (enriched context) │
│                                   │         │                                  │
│  access.routing.persona ─────────────────►  systemPrompt (persona lookup)     │
│  access.routing.session_label ───────────►  history (session → thread → turns)│
│                                   │         │                                  │
│  access.permissions.tools ───────────────►  tools (IAM-filtered)              │
│  access.permissions.credentials ─────────►  (credential access during exec)   │
│                                   │         │                                  │
│  (from config/defaults) ─────────────────►  model, provider, modelConfig      │
│  (computed) ─────────────────────────────►  tokenBudget                       │
│  (generated) ────────────────────────────►  turn_id, run_id                   │
│                                   │         │                                  │
│  request_id ─────────────────────────────►  sourceEventId (metadata)          │
│  access.routing.* ───────────────────────►  sessionLabel, role (metadata)     │
└──────────────────────────────────┘         └──────────────────────────────────┘
```

**What the Broker adds that isn't on NexusRequest:**
- System prompt (assembled from workspace files + persona files)
- Conversation history (read from Agents Ledger)
- Nexus environment snapshot (from CLI internals)
- Token budget calculation
- Parent turn resolution (from session pointer lookup)

---

## AgentResult → NexusRequest Mapping

After agent execution, the Broker maps the `AgentResult` back onto the NexusRequest:

```
┌──────────────────────────────────┐         ┌──────────────────────────────────┐
│          AgentResult              │         │   NexusRequest.response          │
│                                   │         │                                  │
│  messages (final assistant) ─────────────►  content                           │
│  toolCalls ──────────────────────────────►  tool_calls (summarized)           │
│  usage ──────────────────────────────────►  usage                             │
│  stopReason ─────────────────────────────►  stop_reason                       │
│  durationMs ─────────────────────────────►  duration_ms                       │
│  error ──────────────────────────────────►  error                             │
│  compaction ─────────────────────────────►  compaction                        │
└──────────────────────────────────┘         └──────────────────────────────────┘
```

**Note:** The full `AgentResult` goes to the Agents Ledger (all messages, full tool call details). The NexusRequest.response is a **summary** for the pipeline trace, not the complete record.

---

## Early Exit Paths

```
Stage 2 exit (unknown sender denied):
  principal: populated
  access: null
  triggers: null
  agent: null
  response: null
  status: 'denied'

Stage 3 exit (ACL denied):
  principal: populated
  access: { decision: 'deny', ... }
  triggers: null
  agent: null
  response: null
  status: 'denied'

Stage 4 exit (automation handled):
  principal: populated
  access: populated
  triggers: { handled: true, handled_by: '...' }
  agent: null (or populated if automation invoked a different agent)
  response: null (or populated if automation generated a response)
  status: 'handled_by_automation'
```

---

## Persistence Summary

| When | Where | What |
|------|-------|------|
| Stage 1 (async) | Events Ledger | Inbound event |
| Stage 3 | IAM Audit | ACL decision record |
| Stage 6 (after exec) | Agents Ledger | Turn, messages, tool calls, thread, session pointer |
| Stage 8 | Nexus Ledger | Complete NexusRequest trace |
| Stage 8 | Events Ledger | Outbound event (response as event, closes the loop) |

---

## Nexus Ledger Schema

The Nexus Ledger stores the complete NexusRequest for every pipeline execution:

```sql
CREATE TABLE nex_traces (
    request_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    
    -- Outcome
    status TEXT NOT NULL,                -- 'completed', 'denied', 'handled_by_automation', 'failed'
    
    -- Timing
    created_at INTEGER NOT NULL,         -- Unix ms
    completed_at INTEGER,                -- Unix ms
    total_duration_ms INTEGER,
    
    -- The complete request (JSON)
    request_json TEXT NOT NULL,          -- Full NexusRequest serialized
    
    -- Denormalized for fast queries
    channel TEXT,                        -- delivery.channel
    sender_entity_id TEXT,              -- principal.entity_id
    agent_id TEXT,                      -- agent.agent_id
    session_label TEXT,                 -- agent.session_label
    turn_id TEXT,                       -- agent.turn_id
    
    -- Error (if failed)
    error_stage TEXT,                   -- Which stage failed
    error_message TEXT
);

CREATE INDEX idx_nex_traces_event ON nex_traces(event_id);
CREATE INDEX idx_nex_traces_status ON nex_traces(status);
CREATE INDEX idx_nex_traces_channel ON nex_traces(channel);
CREATE INDEX idx_nex_traces_agent ON nex_traces(agent_id, session_label);
CREATE INDEX idx_nex_traces_created ON nex_traces(created_at);
```

---

## Open Questions

1. **Retention policy for nex_traces?** Full request JSON is large. Options: keep N days, keep last N per session, keep only non-completed (errors + denials).

2. **Response mutability during delivery?** If the adapter chunks the content, does that update `delivery_result.chunks_sent` or also `response.content`? (Proposal: content stays as-is, chunks_sent reflects what happened.)

3. **Multiple responses per request?** If the agent sends multiple messages (e.g., text + image), how is that captured? (Proposal: `response.content` is the primary response. Multiple delivery results captured as array.)

4. **Webhook/timer events that skip most stages?** Timer ticks may not need identity resolution. Should there be a fast path? (Proposal: system principals get pre-resolved identity, skip stage 2.)

---

## Related Documents

- `NEX.md` — Pipeline architecture and stage definitions
- `INTERFACES.md` — Component interface contracts (being aligned to this spec)
- `../broker/AGENT_ENGINE.md` — AssembledContext and AgentResult types
- `../broker/CONTEXT_ASSEMBLY.md` — How AssembledContext is built from NexusRequest
- `../STREAMING.md` — StreamEvent protocol during stage 6
- `../../data/ledgers/NEXUS_LEDGER.md` — Nexus Ledger schema (trace storage)
- `../iam/ACCESS_CONTROL_SYSTEM.md` — ACL policies evaluated at stage 3
- `../nex/automations/AUTOMATION_SYSTEM.md` — Automations evaluated at stage 4

---

*This document defines the NexusRequest lifecycle — the central data bus that ties the entire NEX pipeline together. Each stage's contribution is typed and traced.*
