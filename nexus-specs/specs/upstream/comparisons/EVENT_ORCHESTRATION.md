# Event Orchestration: OpenClaw vs Nexus

**Status:** COMPLETE  
**Last Updated:** 2026-02-04

---

## Summary

OpenClaw and Nexus take fundamentally different approaches to event orchestration:

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Architecture** | Decentralized dispatch chain | Centralized NEX pipeline |
| **Orchestration** | Emergent from function calls | Explicit 8-stage pipeline |
| **Entry points** | Each channel monitor calls dispatch independently | All events enter through NEX |
| **Hook model** | Event-based (`message_received`, etc.) | After-stage plugins at each point |
| **Observability** | Scattered logs | Full request trace persisted |
| **Identity/Access** | Implicit in channel config | Dedicated stages |

**The core difference:** OpenClaw's "pipeline" emerges from a chain of function calls. NEX formalizes this into explicit stages with defined inputs, outputs, and hook points between each.

---

## OpenClaw: Decentralized Dispatch Chain

### How It Works

Each channel monitor independently calls `dispatchInboundMessage()` when a message arrives. There's no single orchestrator — the "pipeline" emerges from function call chains.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OPENCLAW DISPATCH CHAIN                               │
│                                                                              │
│   Channel Monitor                                                            │
│        │                                                                     │
│        │  Each channel independently calls dispatch                          │
│        ▼                                                                     │
│   dispatchInboundMessage()                      ← Entry point                │
│        │                                                                     │
│        ├── finalizeInboundContext()             ← Normalize message          │
│        │                                                                     │
│        ▼                                                                     │
│   dispatchReplyFromConfig()                     ← Main orchestration         │
│        │                                                                     │
│        ├── shouldSkipDuplicateInbound()         ← Dedupe check               │
│        ├── runHook("message_received")          ← Hook notification          │
│        ├── tryFastAbortFromMsg()                ← Early exit                 │
│        │                                                                     │
│        ▼                                                                     │
│   getReplyFromConfig()                          ← Reply generation           │
│        │                                                                     │
│        ├── Resolve agent ID, model              ← Agent selection            │
│        ├── Apply media/link understanding       ← Context enrichment         │
│        ├── resolveReplyDirectives()             ← Parse inline overrides     │
│        ├── handleInlineActions()                ← Execute /commands          │
│        │                                                                     │
│        ▼                                                                     │
│   runReplyAgent()                               ← Agent execution            │
│        │                                                                     │
│        ├── Queue steering                       ← Rate limiting              │
│        ├── Memory flush (compaction)            ← Context management         │
│        ├── runAgentTurnWithFallback()           ← LLM call                   │
│        ├── buildReplyPayloads()                 ← Response construction      │
│        │                                                                     │
│        ▼                                                                     │
│   ReplyDispatcher                               ← Outbound delivery          │
│        │                                                                     │
│        ├── normalizeReplyPayload()              ← Strip tokens, sanitize     │
│        ├── Human delay (800-2500ms)             ← Natural pacing             │
│        ├── deliver()                            ← Send via adapter           │
│        │                                                                     │
│        ▼                                                                     │
│   Channel Response                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Characteristics

1. **No single orchestrator** — Each function calls the next; orchestration is implicit
2. **Channel monitors are autonomous** — Discord, WhatsApp, Telegram each handle their own dispatch
3. **Gateway handles RPC** — WebSocket/HTTP interface, but doesn't orchestrate message processing
4. **Hooks are event-based** — `message_received`, `before_agent_start`, `message_sent` fired at specific points
5. **State scattered** — Context built up across multiple function calls, no unified request object

### Key Files

| Stage | File |
|-------|------|
| Entry | `src/auto-reply/dispatch.ts` |
| Orchestration | `src/auto-reply/reply/dispatch-from-config.ts` |
| Reply Generation | `src/auto-reply/reply/get-reply.ts` |
| Agent Execution | `src/auto-reply/reply/agent-runner.ts` |
| Outbound | `src/auto-reply/reply/reply-dispatcher.ts` |

---

## Nexus: Centralized NEX Pipeline

### How It Works

All events enter through NEX (Nexus Event Exchange). NEX owns the entire request lifecycle through 8 explicit stages.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEX PIPELINE                                    │
│                                                                              │
│   Adapters (eve, gog, discord, webhooks, timers)                            │
│        │                                                                     │
│        │  All events enter through single orchestrator                       │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     NexusRequest Created                             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                     │
│        ▼                                                                     │
│   1. receiveEvent()                                                          │
│        │ • Create NexusRequest from AdapterEvent                            │
│        │ • Populate: request_id, event_id, timestamp, event, delivery       │
│        │                                                                     │
│        │ [plugin: afterReceiveEvent]                                        │
│        ▼                                                                     │
│   2. resolveIdentity()                                                       │
│        │ • WHO sent this?                                                   │
│        │ • Lookup sender in Identity Ledger                                 │
│        │ • Populate: principal.identity                                     │
│        │ • May exit: unknown sender                                         │
│        │                                                                     │
│        │ [plugin: afterResolveIdentity]                                     │
│        ▼                                                                     │
│   3. resolveAccess()                                                         │
│        │ • WHAT can they do?                                                │
│        │ • Evaluate ACL policies                                            │
│        │ • Populate: principal.permissions, session (BASE)                  │
│        │ • May exit: access denied                                          │
│        │                                                                     │
│        │ [plugin: afterResolveAccess]                                       │
│        ▼                                                                     │
│   4. executeTriggers()                                                       │
│        │ • Match triggers, execute hooks (parallel)                         │
│        │ • May override session (smart routing)                             │
│        │ • Populate: hooks.*, session (FINAL)                               │
│        │ • May exit: hook handles completely                                │
│        │                                                                     │
│        │ [plugin: afterExecuteTriggers]                                     │
│        ▼                                                                     │
│   5. assembleContext()                                                       │
│        │ • Gather history, Cortex context, agent config, formatting         │
│        │ • Create turn in Agents Ledger                                     │
│        │ • Populate: agent.context, agent.turn_id, agent.thread_id          │
│        │                                                                     │
│        │ [plugin: afterAssembleContext]                                     │
│        ▼                                                                     │
│   6. runAgent()                                                              │
│        │ • Execute agent with assembled context                             │
│        │ • Streaming tokens flow directly to adapter                        │
│        │ • Populate: response.content, response.tool_calls, response.tokens │
│        │                                                                     │
│        │ [plugin: afterRunAgent]                                            │
│        ▼                                                                     │
│   7. deliverResponse()                                                       │
│        │ • Format response for channel                                      │
│        │ • Chunk if necessary                                               │
│        │ • Send via out-adapter                                             │
│        │ • Populate: delivery_result                                        │
│        │                                                                     │
│        │ [plugin: afterDeliverResponse]                                     │
│        ▼                                                                     │
│   8. finalize()                                                              │
│        │ • Finalize NexusRequest                                            │
│        │ • Write full trace to Nexus Ledger                                 │
│        │ • Emit to Cortex for analysis                                      │
│        │                                                                     │
│        │ [plugin: onFinalize]                                               │
│        ▼                                                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     Request Complete                                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Characteristics

1. **Central orchestration** — NEX owns the pipeline, not a chain of services
2. **In-process stages** — All stages are functions in one process; no network hops
3. **Unified request object** — `NexusRequest` accumulates context at each stage
4. **Plugin-friendly** — Before/after hooks at each stage with defined interface
5. **Observable** — Full trace of every request persisted to Nexus Ledger
6. **Each stage has verb naming** — `receiveEvent`, `resolveIdentity`, etc. — no ambiguity

### Stage Responsibilities

| Stage | Input | Output | May Exit Pipeline? |
|-------|-------|--------|-------------------|
| `receiveEvent()` | AdapterEvent | NexusRequest created | No |
| `resolveIdentity()` | NexusRequest | `principal.identity` populated | Yes (unknown sender) |
| `resolveAccess()` | NexusRequest | `permissions`, `session` (base) | Yes (access denied) |
| `executeTriggers()` | NexusRequest | `hooks.*`, `session` (final) | Yes (hook handles) |
| `assembleContext()` | NexusRequest | `agent.context` assembled | No |
| `runAgent()` | NexusRequest | `response.*` populated | No |
| `deliverResponse()` | NexusRequest | `delivery_result` | No |
| `finalize()` | NexusRequest | `pipeline` trace complete | No |

---

## Side-by-Side Comparison

### Flow Comparison

```
         OPENCLAW                                    NEXUS
         ────────                                    ─────
                                                     
Channel Monitor                              Adapter
    │                                           │
    ▼                                           ▼
dispatchInboundMessage()                   receiveEvent()
    │                                           │
    ├── finalizeInboundContext()               [afterReceiveEvent]
    │                                           │
    ▼                                           ▼
dispatchReplyFromConfig()                  resolveIdentity()
    │                                           │
    ├── shouldSkipDuplicateInbound()           [afterResolveIdentity]
    ├── runHook("message_received")             │
    ├── tryFastAbortFromMsg()                   ▼
    │                                      resolveAccess()
    ▼                                           │
getReplyFromConfig()                           [afterResolveAccess]
    │                                           │
    ├── Resolve agent, model                    ▼
    ├── Apply understanding                executeTriggers()
    ├── resolveReplyDirectives()                │
    ├── handleInlineActions()                  [afterExecuteTriggers]
    │                                           │
    ▼                                           ▼
runReplyAgent()                            assembleContext()
    │                                           │
    ├── Queue steering                         [afterAssembleContext]
    ├── Memory flush                            │
    ├── runAgentTurnWithFallback()              ▼
    ├── buildReplyPayloads()               runAgent()
    │                                           │
    ▼                                          [afterRunAgent]
ReplyDispatcher                                 │
    │                                           ▼
    ├── normalizeReplyPayload()            deliverResponse()
    ├── Human delay                             │
    ├── deliver()                              [afterDeliverResponse]
    │                                           │
    ▼                                           ▼
Channel Response                           finalize()
                                               │
                                              [onFinalize]
                                               │
                                               ▼
                                          Complete
```

### Feature Matrix

| Feature | OpenClaw | Nexus |
|---------|----------|-------|
| **Central orchestrator** | ❌ Call chain | ✅ 8-stage pipeline |
| **Identity resolution** | ❌ Uses channel-provided sender | ✅ Dedicated `resolveIdentity` stage |
| **Access control** | ❌ Implicit in config | ✅ Dedicated `resolveAccess` stage |
| **Unified request object** | ❌ Multiple contexts (`MsgContext`, etc.) | ✅ Single `NexusRequest` |
| **Stage hooks** | ❌ Event-based (`message_received`) | ✅ After-stage plugins with `'skip'` |
| **Pipeline tracing** | ❌ Scattered logs | ✅ `pipeline[]` trace persisted |
| **Audit persistence** | ❌ Partial, scattered | ✅ Full request in Nexus Ledger |
| **Early exit points** | ⚠️ Implicit returns | ✅ Explicit `'skip'` from plugins |
| **Finalization stage** | ❌ None | ✅ Dedicated `finalize()` |
| **Plugin interface** | ⚠️ Hook registration | ✅ Typed `NEXPlugin` interface |

### Stage Mapping

| NEX Stage | OpenClaw Equivalent |
|-----------|---------------------|
| `receiveEvent()` | `dispatchInboundMessage()` + `finalizeInboundContext()` |
| `resolveIdentity()` | **NONE** — uses channel-provided sender |
| `resolveAccess()` | **NONE** — permissions implicit in config |
| `executeTriggers()` | `message_received` hook + `handleInlineActions()` |
| `assembleContext()` | `getReplyFromConfig()` context gathering |
| `runAgent()` | `runReplyAgent()` + `runAgentTurnWithFallback()` |
| `deliverResponse()` | `ReplyDispatcher` + `normalizeReplyPayload()` |
| `finalize()` | **NONE** — writes scattered throughout |

---

## Why Nexus Made This Choice

### 1. Predictability

**OpenClaw problem:** The "pipeline" emerges from function call chains. Understanding the flow requires reading through multiple files and following call chains.

**Nexus solution:** Eight explicit stages with defined inputs and outputs. You can look at the stage list and immediately understand what happens where.

### 2. Debuggability

**OpenClaw problem:** When something goes wrong, logs are scattered across functions. No unified view of what happened to a specific request.

**Nexus solution:** Every `NexusRequest` is traced. The `pipeline[]` array shows exactly which stages ran, how long each took, and what changed. Full request persisted to Nexus Ledger.

```typescript
// NEX trace example
{
  request_id: "req_abc123",
  pipeline: [
    { stage: "receiveEvent", duration_ms: 2, status: "ok" },
    { stage: "resolveIdentity", duration_ms: 15, status: "ok" },
    { stage: "resolveAccess", duration_ms: 8, status: "ok" },
    { stage: "executeTriggers", duration_ms: 45, status: "ok" },
    { stage: "assembleContext", duration_ms: 120, status: "ok" },
    { stage: "runAgent", duration_ms: 2340, status: "ok" },
    { stage: "deliverResponse", duration_ms: 89, status: "ok" },
    { stage: "finalize", duration_ms: 12, status: "ok" }
  ],
  total_duration_ms: 2631
}
```

### 3. Clear Hook Points

**OpenClaw problem:** Hooks are event-based (`message_received`, `before_agent_start`). It's not always clear when they fire in the flow, or what state is available.

**Nexus solution:** Plugins have explicit `afterXxx` hooks at each stage boundary. The plugin interface defines exactly what's available:

```typescript
interface NEXPlugin {
  afterReceiveEvent?(req: NexusRequest): Promise<void | 'skip'>;
  afterResolveIdentity?(req: NexusRequest): Promise<void | 'skip'>;
  afterResolveAccess?(req: NexusRequest): Promise<void | 'skip'>;
  afterExecuteTriggers?(req: NexusRequest): Promise<void | 'skip'>;
  afterAssembleContext?(req: NexusRequest): Promise<void | 'skip'>;
  afterRunAgent?(req: NexusRequest): Promise<void | 'skip'>;
  afterDeliverResponse?(req: NexusRequest): Promise<void | 'skip'>;
  onFinalize?(req: NexusRequest): Promise<void>;
}
```

### 4. Observable Pipeline

**OpenClaw problem:** To understand what happened to a message, you need to grep logs, correlate timestamps, and piece together the story.

**Nexus solution:** Trace built into the pipeline. Metrics, spans, and logs all tied to the `NexusRequest`. Easy integration with OpenTelemetry or any observability stack.

### 5. Formal Identity and Access

**OpenClaw problem:** No identity resolution — trusts what the channel provides. Permissions scattered in config, not enforced programmatically.

**Nexus solution:** Dedicated stages for identity (`resolveIdentity`) and access (`resolveAccess`). Every request goes through formal IAM evaluation.

### 6. Single Request Object

**OpenClaw problem:** State is scattered across `MsgContext`, `FinalizedMsgContext`, `GetReplyOptions`, function parameters, and local variables.

**Nexus solution:** One `NexusRequest` object flows through the entire pipeline, accumulating state at each stage. Everything in one place.

---

## What to Preserve from OpenClaw

Despite the architectural differences, OpenClaw has battle-tested patterns worth preserving:

| Pattern | Why Keep |
|---------|----------|
| **Deduplication logic** | Well-tested composite key approach (provider\|account\|session\|peer\|thread\|messageId) |
| **Block streaming pipeline** | Elegant coalescing with min/max chars, idle timeout, paragraph boundaries |
| **Human delay system** | 800-2500ms between blocks creates natural conversation feel |
| **Reply normalization** | Handles edge cases (silent tokens, heartbeat stripping, sanitization) |
| **Typing controller** | Good UX pattern for managing typing indicators |
| **Cross-provider routing** | Route replies back to originating channel |

### Implementation Notes

**Deduplication:** Implement as `afterReceiveEvent` plugin with same key structure and TTL (20 min).

**Human delays:** Could be part of `deliverResponse()` stage or a configurable plugin.

**Block streaming:** Integrate with NEX's `StreamingContext` for real-time token delivery.

---

## Migration Considerations

### For OpenClaw Users

1. **Channel monitors → Adapters**: Your channel integrations become NEX adapters. Same inbound/outbound logic, different registration.

2. **Hooks → Plugins**: `message_received` hooks become `afterReceiveEvent` or `afterExecuteTriggers` plugins. Typed interface replaces event strings.

3. **Access control**: You'll need to define IAM policies. OpenClaw's implicit permissions become explicit `resolveAccess` policies.

4. **Commands**: `/status`, `/new`, `/model` can be triggers in `executeTriggers` or a separate command system.

5. **Session state**: OpenClaw's scattered session management consolidates into `NexusRequest.session`.

### Breaking Changes

| OpenClaw | Nexus | Migration |
|----------|-------|-----------|
| `MsgContext` | `NexusRequest.event` | Map fields |
| `runHook("message_received")` | `afterExecuteTriggers` plugin | Rewrite hook |
| Implicit permissions | `resolveAccess` policies | Define policies |
| Scattered session state | `NexusRequest.session` | Consolidate |
| No finalization | `finalize()` stage | Automatic |

### Compatibility Layer

For gradual migration, OpenClaw's dispatch functions could be wrapped as NEX adapters:

```typescript
// Compatibility shim
const openclawAdapter: NEXAdapter = {
  name: 'openclaw-compat',
  channel: 'legacy',
  
  onEvent(callback) {
    // Hook into existing dispatchInboundMessage
    legacyDispatch.onInbound((ctx) => {
      callback(convertToAdapterEvent(ctx));
    });
  }
};
```

---

## Related Documents

| Document | Purpose |
|----------|---------|
| `../runtime/nex/NEX.md` | Full NEX specification |
| `../runtime/nex/NEXUS_REQUEST.md` | NexusRequest schema |
| `../runtime/nex/PLUGINS.md` | Plugin system |
| `../runtime/nex/upstream/DISPATCH_FLOW.md` | Detailed stage mapping |
| `../runtime/upstream/AUTO_REPLY_PIPELINE.md` | OpenClaw source analysis |
| `ARCHITECTURAL_PHILOSOPHY.md` | High-level design differences |

---

*This document captures the fundamental difference in event orchestration between OpenClaw's emergent dispatch chain and Nexus's explicit NEX pipeline.*
