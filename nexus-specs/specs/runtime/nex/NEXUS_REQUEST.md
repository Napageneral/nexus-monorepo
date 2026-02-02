# NexusRequest Specification

**Status:** DESIGN IN PROGRESS  
**Last Updated:** 2026-01-30

---

## Overview

The `NexusRequest` is the core data object that flows through the entire Nexus pipeline. Each stage accumulates its context onto this object, creating a complete trace of everything that happened for a given event.

**Inspired by:** Ad exchange bid request patterns — a single object that accumulates context as it flows through the system.

---

## Design Goals

1. **Debuggable** — Full trace of what happened at each pipeline stage
2. **Auditable** — Complete record persisted to Nexus Ledger
3. **Contextual** — Agent sees everything accumulated so far
4. **Cacheable** — Enables static system prompts by passing context per-turn

---

## Pipeline Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         NEXUS REQUEST PIPELINE                                │
│                                                                               │
│  ┌─────────────┐                                                              │
│  │   ADAPTER   │  Creates NexusRequest from platform event                   │
│  │             │  + event_id, timestamp, content                              │
│  │             │  + delivery context (channel, thread, reply_to)              │
│  └──────┬──────┘                                                              │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────┐                                                              │
│  │    ACL      │  Resolves identity and permissions                          │
│  │             │  + principal (who sent this)                                 │
│  │             │  + permissions (what they can do)                            │
│  │             │  + session (where it routes)                                 │
│  └──────┬──────┘                                                              │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────┐                                                              │
│  │   HOOKS     │  Evaluates hooks, may enrich context                        │
│  │             │  + fired_hooks (which hooks matched)                         │
│  │             │  + hook_context (extracted data)                             │
│  │             │  + agent override (if hook specifies)                        │
│  └──────┬──────┘                                                              │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────┐                                                              │
│  │   BROKER    │  Prepares agent execution                                   │
│  │             │  + agent_id, persona                                         │
│  │             │  + turn_id, thread_id                                        │
│  │             │  + context assembly                                          │
│  └──────┬──────┘                                                              │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────┐                                                              │
│  │   AGENT     │  Executes agent, captures response                          │
│  │             │  + response content                                          │
│  │             │  + tool_calls made                                           │
│  │             │  + tokens used                                               │
│  └──────┬──────┘                                                              │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────┐                                                              │
│  │  DELIVERY   │  Sends response to platform                                 │
│  │             │  + delivery_result                                           │
│  │             │  + message_ids                                               │
│  │             │  + chunks sent                                               │
│  └──────┬──────┘                                                              │
│         │                                                                     │
│         ▼                                                                     │
│  ┌─────────────┐                                                              │
│  │   LEDGER    │  Persists complete request                                  │
│  │             │  Events Ledger: inbound + outbound events                   │
│  │             │  Agents Ledger: turn/session data                           │
│  │             │  Nexus Ledger: full NexusRequest trace                      │
│  └─────────────┘                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Schema

### NexusRequest

```typescript
interface NexusRequest {
  // ─────────────────────────────────────────────────────────────────────────
  // IDENTITY
  // ─────────────────────────────────────────────────────────────────────────
  
  request_id: string;            // UUID for this request
  event_id: string;              // Original event ID (adapter:source_id)
  timestamp: number;             // Unix ms when event arrived
  
  // ─────────────────────────────────────────────────────────────────────────
  // EVENT CONTEXT (from Adapter)
  // ─────────────────────────────────────────────────────────────────────────
  
  event: {
    content: string;             // Message content
    content_type: string;        // "text", "image", "audio", etc.
    direction: 'received' | 'sent';
    metadata?: Record<string, any>;
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // DELIVERY CONTEXT (from Adapter)
  // ─────────────────────────────────────────────────────────────────────────
  
  delivery: {
    channel: string;             // "discord", "telegram", "imessage", etc.
    account_id?: string;         // Which bot account received this
    thread_id?: string;          // Thread/topic ID
    reply_to_id?: string;        // Message ID to reply to
    peer_id: string;             // Who/where this came from
    peer_kind: 'dm' | 'group' | 'channel';
    
    // Channel capabilities (for agent context)
    capabilities: ChannelCapabilities;
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // IDENTITY CONTEXT (from ACL)
  // ─────────────────────────────────────────────────────────────────────────
  
  principal: {
    type: 'owner' | 'known' | 'unknown' | 'system' | 'webhook' | 'agent';
    entity_id?: string;          // From entities table
    name?: string;               // "Mom", "Casey", etc.
    relationship?: string;       // "family", "partner", "work"
  };
  
  permissions: {
    tools: string[];             // Allowed tools
    credentials: string[];       // Allowed credentials
    data_access: 'none' | 'minimal' | 'contextual' | 'full';
    personas: string[];          // Allowed personas
    rate_limit?: number;
  };
  
  session: {
    session_key: string;         // e.g., "atlas:dm:casey"
    persona: string;             // Which persona handles this
    thread_id?: string;          // If continuing a thread
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // HOOK CONTEXT (from Hooks)
  // ─────────────────────────────────────────────────────────────────────────
  
  hooks: {
    evaluated: string[];         // All hooks that were evaluated
    fired: string[];             // Hooks that returned fire: true
    context?: Record<string, any>;  // Extracted data from hooks
    agent_override?: string;     // If hook specified a different agent
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // AGENT CONTEXT (from Broker)
  // ─────────────────────────────────────────────────────────────────────────
  
  agent: {
    agent_id: string;
    persona: string;
    turn_id: string;
    thread_id: string;
    model: string;
    
    // What the agent received
    system_prompt_hash?: string;  // For cache debugging
    context_tokens?: number;
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // RESPONSE (from Agent)
  // ─────────────────────────────────────────────────────────────────────────
  
  response?: {
    content: string;
    tool_calls: ToolCallRecord[];
    tokens_in: number;
    tokens_out: number;
    latency_ms: number;
    model: string;
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // DELIVERY RESULT (from Out-Adapter)
  // ─────────────────────────────────────────────────────────────────────────
  
  delivery_result?: {
    success: boolean;
    message_ids: string[];       // Platform message IDs
    chunks_sent: number;
    error?: string;
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // PIPELINE TRACE (for debugging)
  // ─────────────────────────────────────────────────────────────────────────
  
  pipeline: PipelineStep[];
}
```

### Supporting Types

```typescript
interface ChannelCapabilities {
  text_limit: number;            // Discord: 2000, Telegram: 4096
  caption_limit?: number;        // Telegram: 1024
  supports_markdown: boolean;
  supports_embeds: boolean;
  supports_threads: boolean;
  supports_reactions: boolean;
  supports_polls: boolean;
  supports_buttons: boolean;
  supports_ptt: boolean;         // Push-to-talk audio
}

interface ToolCallRecord {
  tool_call_id: string;
  tool_name: string;
  params: Record<string, any>;
  result?: any;
  error?: string;
  latency_ms: number;
}

interface PipelineStep {
  stage: 'adapter' | 'acl' | 'hooks' | 'broker' | 'agent' | 'delivery' | 'ledger';
  timestamp: number;
  latency_ms: number;
  data?: Record<string, any>;    // Stage-specific debug data
  error?: string;
}
```

---

## How Each Stage Uses NexusRequest

### 1. Adapter (Creates)

```typescript
// In-adapter creates the initial request
const request: NexusRequest = {
  request_id: uuid(),
  event_id: `${adapter}:${source_id}`,
  timestamp: Date.now(),
  
  event: {
    content: rawMessage.text,
    content_type: 'text',
    direction: 'received',
  },
  
  delivery: {
    channel: 'discord',
    account_id: 'bot123',
    thread_id: rawMessage.thread_id,
    reply_to_id: rawMessage.id,
    peer_id: rawMessage.channel_id,
    peer_kind: rawMessage.is_dm ? 'dm' : 'group',
    capabilities: DISCORD_CAPABILITIES,
  },
  
  pipeline: [{
    stage: 'adapter',
    timestamp: Date.now(),
    latency_ms: 0,
  }],
};
```

### 2. ACL (Adds identity)

```typescript
// ACL resolves identity and adds to request
request.principal = {
  type: 'known',
  entity_id: 'person_123',
  name: 'Mom',
  relationship: 'family',
};

request.permissions = evaluatePermissions(request.principal);
request.session = resolveSession(request);

request.pipeline.push({
  stage: 'acl',
  timestamp: Date.now(),
  latency_ms: elapsed,
});
```

### 3. Hooks (Adds hook context)

```typescript
// Hooks evaluate and add context
request.hooks = {
  evaluated: ['mom-2fa-helper', 'heartbeat', 'safety-check'],
  fired: ['mom-2fa-helper'],
  context: {
    service: 'Amazon',
    is_2fa: true,
  },
};

request.pipeline.push({
  stage: 'hooks',
  timestamp: Date.now(),
  latency_ms: elapsed,
});
```

### 4. Broker (Adds agent context)

```typescript
// Broker prepares agent execution
request.agent = {
  agent_id: 'atlas',
  persona: 'atlas',
  turn_id: uuid(),
  thread_id: resolveThread(request.session),
  model: 'claude-sonnet-4',
};

request.pipeline.push({
  stage: 'broker',
  timestamp: Date.now(),
  latency_ms: elapsed,
});
```

### 5. Agent (Adds response)

```typescript
// Agent executes, broker captures response
request.response = {
  content: "Here's the Amazon 2FA code: 123456",
  tool_calls: [],
  tokens_in: 1500,
  tokens_out: 50,
  latency_ms: 2300,
  model: 'claude-sonnet-4',
};

request.pipeline.push({
  stage: 'agent',
  timestamp: Date.now(),
  latency_ms: elapsed,
});
```

### 6. Delivery (Adds result)

```typescript
// Out-adapter delivers and records result
request.delivery_result = {
  success: true,
  message_ids: ['discord:msg_789'],
  chunks_sent: 1,
};

request.pipeline.push({
  stage: 'delivery',
  timestamp: Date.now(),
  latency_ms: elapsed,
});
```

### 7. Ledger (Persists)

```typescript
// Complete request persisted
await nexusLedger.insert(request);
await eventsLedger.insert(request.event);
await agentsLedger.insertTurn(request.agent, request.response);

request.pipeline.push({
  stage: 'ledger',
  timestamp: Date.now(),
  latency_ms: elapsed,
});
```

---

## Agent Context

The agent receives a subset of NexusRequest in its turn context:

```typescript
// What the agent sees
{
  // The message
  content: request.event.content,
  
  // Who sent it
  sender: {
    name: request.principal.name,
    relationship: request.principal.relationship,
  },
  
  // Where to respond
  channel: request.delivery.channel,
  capabilities: request.delivery.capabilities,
  
  // Their permissions
  permissions: request.permissions,
  
  // Any hook-extracted context
  context: request.hooks.context,
}
```

**Key:** This is passed per-turn, NOT in the system prompt. System prompt stays static and cacheable.

---

## Tool Hooks for On-Demand Guidance

When the agent calls the `message` tool, a `before_tool_call` hook can inject formatting guidance:

```typescript
// Tool hook for message tool
async function beforeMessageTool(
  event: ToolCallEvent,
  request: NexusRequest,
): Promise<ToolCallResult> {
  const channel = request.delivery.channel;
  const capabilities = request.delivery.capabilities;
  
  // Load channel-specific formatting skill
  const formatGuide = await loadSkill(`channel-format-${channel}`);
  
  // Inject guidance into the tool call context
  return {
    params: {
      ...event.params,
      _formatting_guidance: formatGuide.summary,
      _capabilities: capabilities,
    },
  };
}
```

This provides formatting guidance **on-demand** without bloating the system prompt.

---

## Persistence

### Events Ledger
- Inbound event (the message received)
- Outbound event (the response sent)

### Agents Ledger
- Turn record (request + response as a turn)
- Session state

### Nexus Ledger (NEW)
- Complete `NexusRequest` with full pipeline trace
- For debugging, audit, analytics

---

## Open Questions

1. **How much of NexusRequest does the agent see?**
   - Full object? Curated subset? Depends on permissions?

2. **Should response be mutable during delivery?**
   - Chunking modifies content — does that update the request?

3. **How do we handle multiple responses?**
   - Agent sends multiple messages — multiple delivery_results?

4. **Retention policy for Nexus Ledger?**
   - Full trace is large — how long do we keep?

---

## Related Specs

- `../adapters/` — Creates initial NexusRequest
- `../iam/` — Adds identity context
- `../agent-system/` — Broker and hooks process request
