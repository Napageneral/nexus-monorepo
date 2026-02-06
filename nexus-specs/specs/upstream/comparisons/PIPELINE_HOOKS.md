# Pipeline Hooks — OpenClaw vs Nexus Comparison

> **Purpose:** Compare hook architectures between OpenClaw and Nexus, explaining the two-layer model.  
> **Related:** `specs/runtime/nex/NEX.md`, `specs/runtime/nex/PLUGINS.md`, `specs/runtime/nex/upstream/HOOK_LIFECYCLE.md`  
> **Last Updated:** 2026-02-04

---

## Summary: Two Layers of Hooks in Nexus

Nexus introduces a **two-layer hook architecture** that separates concerns more cleanly than OpenClaw:

| Layer | Scope | Hooks | Purpose |
|-------|-------|-------|---------|
| **Pipeline Hooks** | Request lifecycle | 8 stage hooks | Intercept before agent even runs |
| **Agent Hooks** | Agent execution | Tool/message hooks | Modify agent behavior during execution |

**Key insight:** Pipeline hooks operate at a *higher level* than agent execution. You can intercept a request, modify routing, inject context, or skip the agent entirely — all before `runAgent()` is called.

```
Event Arrives
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    PIPELINE HOOKS (NEX layer)                           │
│                                                                          │
│  afterReceiveEvent → afterResolveIdentity → afterResolveAccess →        │
│  afterExecuteTriggers → afterAssembleContext                            │
│                                                                          │
│                              │                                           │
│                              ▼                                           │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                  AGENT HOOKS (Broker layer)                    │     │
│  │                                                                 │     │
│  │  before_agent_start → before_tool_call → after_tool_call →    │     │
│  │  message_sending → agent_end                                   │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                              │                                           │
│                              ▼                                           │
│  afterRunAgent → afterDeliverResponse → onFinalize                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## OpenClaw's Hook Sprawl

OpenClaw has **14+ hook types** that evolved organically to solve specific problems. The result is a mixed bag of semantics, execution models, and registration patterns.

### The Full List

| # | Hook Name | Execution | Can Modify? | Actually Invoked? |
|---|-----------|-----------|-------------|-------------------|
| 1 | `before_agent_start` | Sequential | Yes (systemPrompt, prependContext) | ✅ |
| 2 | `agent_end` | Parallel | No | ✅ |
| 3 | `before_compaction` | Parallel | No | ✅ |
| 4 | `after_compaction` | Parallel | No | ✅ |
| 5 | `message_received` | Parallel | No | ✅ |
| 6 | `message_sending` | Sequential | Yes (content, cancel) | ✅ |
| 7 | `message_sent` | Parallel | No | ✅ |
| 8 | `before_tool_call` | Sequential | Yes (params, block) | ⚠️ Recently added |
| 9 | `after_tool_call` | Parallel | No | ✅ |
| 10 | `tool_result_persist` | Synchronous | Yes (message) | ✅ |
| 11 | `session_start` | Parallel | No | ✅ |
| 12 | `session_end` | Parallel | No | ✅ |
| 13 | `gateway_start` | Parallel | No | ✅ |
| 14 | `gateway_stop` | Parallel | No | ✅ |

**Plus** internal hooks: `command:new`, `command:reset`, `session:start`, `agent:bootstrap`, etc.

### Problems with This Design

1. **Mixed execution models** — Some parallel, some sequential, some synchronous
2. **Mixed semantics** — Some observe, some modify, no consistent pattern
3. **Agent-centric** — All hooks assume an agent is running; no interception before agent
4. **Incomplete coverage** — Not all hooks are consistently invoked (e.g., `before_tool_call` was added recently)
5. **Two registration systems** — Typed hooks (`api.on()`) vs internal hooks (`registerInternalHook()`)
6. **Priority ordering differs** — Higher number = first in OpenClaw; lower = first in NEX

### What OpenClaw Gets Right

- **Typed hook payloads** — Clear contracts for each hook type
- **Priority ordering** — Plugins can control execution order
- **Parallel for observability** — Logging/tracking hooks don't block

---

## Nexus Pipeline Hooks (8 Stages)

NEX introduces **8 pipeline stage hooks** with a consistent model:

```typescript
interface NEXPlugin {
  name: string;
  priority?: number;  // Lower = runs first (default: 100)
  
  // After each stage
  afterReceiveEvent?(req: NexusRequest): Promise<void | 'skip'>;
  afterResolveIdentity?(req: NexusRequest): Promise<void | 'skip'>;
  afterResolveAccess?(req: NexusRequest): Promise<void | 'skip'>;
  afterExecuteTriggers?(req: NexusRequest): Promise<void | 'skip'>;
  afterAssembleContext?(req: NexusRequest): Promise<void | 'skip'>;
  afterRunAgent?(req: NexusRequest): Promise<void | 'skip'>;
  afterDeliverResponse?(req: NexusRequest): Promise<void | 'skip'>;
  
  onFinalize?(req: NexusRequest): Promise<void>;
  onError?(req: NexusRequest, error: Error): Promise<void>;
}
```

### Consistent Execution Model

Every hook can:
- **Read** the NexusRequest
- **Modify** the NexusRequest
- **Skip** remaining pipeline (return `'skip'`)

No hooks are "observe-only" at the interface level — the power is always there if needed.

### Stage-by-Stage

| Stage | Hook | What You Can Do |
|-------|------|-----------------|
| `receiveEvent()` | `afterReceiveEvent` | Log, validate, tag early |
| `resolveIdentity()` | `afterResolveIdentity` | Enrich identity, add metadata from external systems |
| `resolveAccess()` | `afterResolveAccess` | Adjust permissions, add capabilities |
| `executeTriggers()` | `afterExecuteTriggers` | Override session/routing, inject context |
| `assembleContext()` | `afterAssembleContext` | Modify assembled context before agent runs |
| `runAgent()` | `afterRunAgent` | Post-process response, add analytics |
| `deliverResponse()` | `afterDeliverResponse` | Track delivery, handle failures |
| `finalize()` | `onFinalize` | Final cleanup, emit to external systems |

### Why This Matters

**Before agent runs, you can:**
- Intercept based on identity (`afterResolveIdentity`)
- Block based on permissions (`afterResolveAccess`)
- Route to a different agent (`afterExecuteTriggers`)
- Inject context (`afterAssembleContext`)
- Skip the agent entirely (return `'skip'` from any hook)

OpenClaw can't do this. By the time `before_agent_start` fires, you're already committed to running an agent.

---

## Nexus Agent Hooks (via pi-coding-agent)

The agent layer (Broker/pi-coding-agent) retains hooks for agent-specific behavior:

| Hook | Purpose | Execution |
|------|---------|-----------|
| `before_agent_start` | Inject system prompt context | Sequential |
| `before_tool_call` | Validate/modify tool params, block calls | Sequential |
| `after_tool_call` | Track tool usage | Parallel |
| `tool_result_persist` | Transform results before storage | Synchronous |
| `message_sending` | Modify/cancel outgoing messages | Sequential |
| `agent_end` | Analytics, conversation analysis | Parallel |

These hooks are **internal to agent execution**. They run inside `runAgent()` and are the appropriate place for:
- Tool interception and sandboxing
- Agent-level content moderation
- Token/cost tracking per agent
- Agent-specific behavior modifications

---

## When to Use Which

| Goal | Use | Why |
|------|-----|-----|
| Route to different agent based on content | `afterExecuteTriggers` | Before agent selection |
| Block requests from unknown senders | `afterResolveIdentity` | Before access check |
| Inject time/date into system prompt | `afterAssembleContext` | Context assembly phase |
| Inject time/date into system prompt | `before_agent_start` | Also works (agent layer) |
| Block dangerous tool calls | `before_tool_call` | Inside agent execution |
| Track token usage | `afterRunAgent` or `agent_end` | After completion |
| Log all incoming events | `afterReceiveEvent` | First pipeline stage |
| Handle event without agent | `afterResolveAccess` + `'skip'` | Skip to finalize |

### Decision Tree

```
Is this about request routing, identity, or access?
  └── Yes → Pipeline hook (afterResolve*, afterExecuteTriggers)
  └── No ↓

Is this about what context the agent sees?
  └── Yes → Pipeline hook (afterAssembleContext) or Agent hook (before_agent_start)
  └── No ↓

Is this about tool behavior?
  └── Yes → Agent hook (before_tool_call, after_tool_call)
  └── No ↓

Is this about message formatting/delivery?
  └── Yes → Agent hook (message_sending) or Pipeline hook (afterDeliverResponse)
  └── No ↓

Is this about logging/analytics?
  └── Yes → Either layer works — pick based on what data you need
```

---

## Mapping OpenClaw Hooks to Nexus

| OpenClaw Hook | Nexus Equivalent | Notes |
|---------------|------------------|-------|
| `gateway_start` | Pre-startup | Outside pipeline |
| `gateway_stop` | Post-shutdown | Outside pipeline |
| `message_received` | `afterReceiveEvent` | Now a pipeline hook |
| `before_agent_start` | `afterAssembleContext` OR agent hook | Both options available |
| `before_tool_call` | Agent hook (unchanged) | Inside runAgent |
| `after_tool_call` | Agent hook (unchanged) | Inside runAgent |
| `tool_result_persist` | Agent hook (unchanged) | Inside runAgent |
| `agent_end` | `afterRunAgent` OR agent hook | Both options |
| `message_sending` | Agent hook (unchanged) | Inside agent/delivery |
| `message_sent` | `afterDeliverResponse` | Now a pipeline hook |
| `session_start` | `afterResolveAccess` | After session created |
| `session_end` | `onFinalize` | Request complete |
| `before_compaction` | Agent hook pattern | Memory management |
| `after_compaction` | Agent hook pattern | Memory management |
| `command:*` | `executeTriggers` | Commands become triggers |

### Priority Convention Difference

| System | Convention | Example |
|--------|------------|---------|
| **OpenClaw** | Higher = runs first | Priority 100 runs before 50 |
| **NEX** | Lower = runs first | Priority 10 runs before 50 |

---

## Key Differences Summarized

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Hook layers** | 1 (agent-centric) | 2 (pipeline + agent) |
| **Hook count** | 14+ scattered | 8 pipeline + agent hooks |
| **Execution model** | Mixed (parallel/sequential/sync) | Consistent per layer |
| **Can modify?** | Some hooks, not others | All pipeline hooks can modify |
| **Can skip pipeline?** | No | Yes (return `'skip'`) |
| **Pre-agent interception** | Limited | Full (5 hooks before runAgent) |
| **Registration** | Two systems (typed + internal) | One interface |
| **Priority order** | Higher = first | Lower = first |

---

## Migration Strategy

When porting OpenClaw plugins to Nexus:

1. **Identify the purpose** — Is it pre-agent or during-agent?
2. **Map to appropriate layer** — Pipeline hook or agent hook?
3. **Adjust priority numbers** — Flip the convention (high→low for early)
4. **Consider the new capabilities** — Can you skip earlier? Route differently?

### Example: Context Injection Plugin

**OpenClaw:**
```typescript
api.on("before_agent_start", async (event, ctx) => {
  return { prependContext: `Current time: ${new Date().toISOString()}` };
}, { priority: 100 });
```

**Nexus (pipeline hook):**
```typescript
const timePlugin: NEXPlugin = {
  name: 'time-context',
  priority: 50,  // Lower = runs earlier
  
  afterAssembleContext: async (req) => {
    req.agent.context.system += `\nCurrent time: ${new Date().toISOString()}`;
  },
};
```

**Nexus (agent hook):**
```typescript
// Also valid — depends on where you want to intervene
broker.on("before_agent_start", async (event) => {
  return { prependContext: `Current time: ${new Date().toISOString()}` };
});
```

---

## Conclusion

Nexus's two-layer hook architecture provides:

1. **Clear separation** — Pipeline concerns vs agent concerns
2. **Earlier interception** — 5 hooks before agent runs
3. **Consistent model** — Same interface at each stage
4. **Skip capability** — Exit pipeline early when appropriate
5. **Cleaner semantics** — No mixed parallel/sequential/sync confusion

OpenClaw's hooks remain useful inside the agent layer. The pipeline layer is the new addition that enables request-level orchestration.
