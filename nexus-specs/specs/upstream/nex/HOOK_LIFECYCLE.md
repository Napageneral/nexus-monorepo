# OpenClaw Hook Lifecycle — Upstream Analysis

> **Purpose:** Document all OpenClaw hook types, execution order, and mapping to NEX pipeline hooks.  
> **Source:** `~/nexus/home/projects/openclaw/src/plugins/`, `~/nexus/home/projects/openclaw/src/hooks/`  
> **Last Updated:** 2026-02-04

---

## Overview

OpenClaw has **two hook systems** that serve different purposes:

| System | Purpose | Registration | Execution |
|--------|---------|--------------|-----------|
| **Internal Hooks** | Event-driven callbacks (`command:new`) | `registerInternalHook()` | Sequential, all matching handlers |
| **Plugin Hooks (Typed)** | Lifecycle hooks with type-safe payloads | `api.on(hookName, handler)` | Priority-ordered, parallel or sequential |

---

## All Hook Types (14+)

### Plugin Hooks (Typed Lifecycle)

| # | Hook Name | Execution | Purpose | Can Modify? |
|---|-----------|-----------|---------|-------------|
| 1 | `before_agent_start` | Sequential | Inject context into system prompt | Yes (systemPrompt, prependContext) |
| 2 | `agent_end` | Parallel | Analyze completed conversations | No |
| 3 | `before_compaction` | Parallel | Pre-compaction notification | No |
| 4 | `after_compaction` | Parallel | Post-compaction notification | No |
| 5 | `message_received` | Parallel | Log/track incoming messages | No |
| 6 | `message_sending` | Sequential | Modify/cancel outgoing messages | Yes (content, cancel) |
| 7 | `message_sent` | Parallel | Track sent messages | No |
| 8 | `before_tool_call` | Sequential | Modify params or block tool calls | Yes (params, block) |
| 9 | `after_tool_call` | Parallel | Track tool execution | No |
| 10 | `tool_result_persist` | Synchronous | Transform tool results before storage | Yes (message) |
| 11 | `session_start` | Parallel | Session initialization | No |
| 12 | `session_end` | Parallel | Session cleanup | No |
| 13 | `gateway_start` | Parallel | Gateway startup initialization | No |
| 14 | `gateway_stop` | Parallel | Gateway shutdown cleanup | No |

### Internal Hooks (Event-Based)

| Type | Actions | Example Keys |
|------|---------|--------------|
| `command` | `new`, `reset`, `stop`, `compact`, `status`, `model` | `command:new`, `command:reset` |
| `session` | `start`, `end` | `session:start`, `session:end` |
| `agent` | `bootstrap` | `agent:bootstrap` |
| `gateway` | `startup`, `shutdown` | `gateway:startup`, `gateway:shutdown` |

---

## Hook Execution Order

### Typed Hooks: Priority-Based

Hooks with higher priority numbers execute first:

```
Priority 100 (highest)  ──→  executes first
Priority 50 (default)   ──→  executes second
Priority 10 (lowest)    ──→  executes last
```

**Default priority:** 50 (if not specified)

### Typed Hooks: Parallel vs Sequential

| Execution Mode | Behavior | Used By |
|----------------|----------|---------|
| **Parallel** | All handlers execute simultaneously | Observability hooks (logging, tracking) |
| **Sequential** | Handlers execute in priority order, results merged | Modifying hooks (inject context, block calls) |

#### Parallel Execution (runVoidHook)

```typescript
async function runVoidHook<K>(hookName: K, event, ctx): Promise<void> {
  const hooks = getHooksForName(registry, hookName);
  await Promise.all(hooks.map(hook => hook.handler(event, ctx)));
}
```

**Used by:** `agent_end`, `before_compaction`, `after_compaction`, `message_received`, `message_sent`, `after_tool_call`, `session_start`, `session_end`, `gateway_start`, `gateway_stop`

#### Sequential Execution (runModifyingHook)

```typescript
async function runModifyingHook<K, TResult>(
  hookName: K, event, ctx, mergeResults?
): Promise<TResult | undefined> {
  const hooks = getHooksForName(registry, hookName);  // Sorted by priority DESC
  let result: TResult | undefined;
  
  for (const hook of hooks) {
    const handlerResult = await hook.handler(event, ctx);
    if (handlerResult != null) {
      result = mergeResults?.(result, handlerResult) ?? handlerResult;
    }
  }
  return result;
}
```

**Used by:** `before_agent_start`, `message_sending`, `before_tool_call`, `tool_result_persist`

---

## Hook Details by Name

### 1. before_agent_start

```typescript
type Event = {
  prompt: string;        // Current system prompt
  messages?: unknown[];  // Conversation history
};

type Result = {
  systemPrompt?: string;   // Override entire system prompt
  prependContext?: string; // Prepend to system prompt
};
```

**Execution:** Sequential
**Priority:** Lower priority = later in chain (can override earlier)
**Use cases:**
- Inject current time/date
- Add user preferences
- Include retrieved context
- Modify persona behavior

**Example:**
```typescript
api.on("before_agent_start", async (event, ctx) => {
  return {
    prependContext: `Current user: ${ctx.userName}\nTimezone: ${ctx.timezone}`
  };
}, { priority: 100 });
```

---

### 2. agent_end

```typescript
type Event = {
  messages: unknown[];  // Full conversation
  response: string;     // Agent response
  tokens_in: number;
  tokens_out: number;
};
```

**Execution:** Parallel
**Use cases:**
- Analytics/logging
- Cost tracking
- Conversation analysis

---

### 3. before_compaction / after_compaction

```typescript
type Event = {
  sessionId: string;
  messageCount: number;
  tokenCount: number;
};
```

**Execution:** Parallel
**Use cases:**
- Memory hooks (save to long-term storage)
- Analytics
- Cleanup tasks

---

### 4. message_received

```typescript
type Event = {
  channel: string;
  content: string;
  sender: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};
```

**Execution:** Parallel
**Use cases:**
- Logging
- Analytics
- External notifications

---

### 5. message_sending

```typescript
type Event = {
  content: string;
  channel: string;
  recipient: string;
};

type Result = {
  content?: string;  // Modified content
  cancel?: boolean;  // Block sending
};
```

**Execution:** Sequential
**Use cases:**
- Content moderation
- Text transformation
- Blocking sensitive messages

**Example:**
```typescript
api.on("message_sending", async (event, ctx) => {
  if (event.content.includes("REDACTED")) {
    return { cancel: true };
  }
  return { content: event.content.replace(/SECRET/g, "***") };
});
```

---

### 6. message_sent

```typescript
type Event = {
  channel: string;
  content: string;
  recipient: string;
  messageId: string;
  timestamp: number;
};
```

**Execution:** Parallel
**Use cases:**
- Delivery confirmation logging
- Analytics
- External sync

---

### 7. before_tool_call

```typescript
type Event = {
  toolName: string;
  params: Record<string, unknown>;
};

type Result = {
  params?: Record<string, unknown>;  // Modified params
  block?: boolean;                   // Block execution
  blockReason?: string;
};
```

**Execution:** Sequential
**Use cases:**
- Parameter validation/modification
- Security policies
- Rate limiting
- Audit logging

**Example:**
```typescript
api.on("before_tool_call", async (event, ctx) => {
  if (event.toolName === "rm" && event.params.path === "/") {
    return { block: true, blockReason: "Dangerous operation blocked" };
  }
});
```

---

### 8. after_tool_call

```typescript
type Event = {
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
  error?: string;
  latency_ms: number;
};
```

**Execution:** Parallel
**Use cases:**
- Tool usage analytics
- Performance monitoring
- Error tracking

---

### 9. tool_result_persist

```typescript
type Event = {
  toolName: string;
  result: unknown;
  message: unknown;  // Message to persist
};

type Result = {
  message: unknown;  // Transformed message
};
```

**Execution:** Synchronous (blocking)
**Use cases:**
- Transform tool results before storage
- Redact sensitive data
- Format for display

---

### 10-11. session_start / session_end

```typescript
type SessionEvent = {
  sessionId: string;
  sessionKey: string;
  agentId: string;
  timestamp: number;
};
```

**Execution:** Parallel
**Use cases:**
- Session tracking
- Resource initialization/cleanup
- Analytics

---

### 12-13. gateway_start / gateway_stop

```typescript
type GatewayEvent = {
  port: number;
  host: string;
  timestamp: number;
};
```

**Execution:** Parallel
**Use cases:**
- External service initialization
- Health check registration
- Cleanup on shutdown

---

## Internal Hooks (Event-Based)

### Registration

```typescript
// Listen to all command events
registerInternalHook("command", async (event) => {
  console.log("Command:", event.action);
});

// Listen to specific action
registerInternalHook("command:new", async (event) => {
  await saveSessionToMemory(event);
});
```

### Event Structure

```typescript
interface InternalHookEvent {
  type: "command" | "session" | "agent" | "gateway";
  action: string;
  sessionKey: string;
  context: Record<string, unknown>;
  timestamp: Date;
  messages: string[];  // Hooks can push messages to user
}
```

### Execution Order

Internal hooks execute in registration order, sequentially:

```typescript
async function triggerInternalHook(event: InternalHookEvent): Promise<void> {
  const typeHandlers = handlers.get(event.type) ?? [];
  const specificHandlers = handlers.get(`${event.type}:${event.action}`) ?? [];
  
  for (const handler of [...typeHandlers, ...specificHandlers]) {
    await handler(event);  // Sequential
  }
}
```

---

## Mapping to NEX Pipeline Hooks

### NEX After-Stage Hooks

```
receiveEvent()       →  [afterReceiveEvent]
resolveIdentity()    →  [afterResolveIdentity]
resolveAccess()      →  [afterResolveAccess]
executeTriggers()    →  [afterExecuteTriggers]
assembleContext()    →  [afterAssembleContext]
runAgent()           →  [afterRunAgent]
deliverResponse()    →  [afterDeliverResponse]
finalize()           →  [onFinalize]
```

### Mapping Table

| OpenClaw Hook | NEX Stage Hook | Notes |
|---------------|----------------|-------|
| `gateway_start` | Pre-startup | Outside pipeline |
| `gateway_stop` | Post-shutdown | Outside pipeline |
| `message_received` | `afterReceiveEvent` | Logging/tracking |
| `before_agent_start` | `afterAssembleContext` | Context injection |
| `before_tool_call` | `afterRunAgent` (sub-hook) | Tool interception |
| `after_tool_call` | `afterRunAgent` (sub-hook) | Tool tracking |
| `tool_result_persist` | `afterRunAgent` (sub-hook) | Tool result transform |
| `agent_end` | `afterRunAgent` | Conversation analysis |
| `message_sending` | `afterDeliverResponse` (pre-send) | Message modification |
| `message_sent` | `afterDeliverResponse` | Delivery confirmation |
| `session_start` | `afterResolveAccess` | Session init |
| `session_end` | `onFinalize` | Session cleanup |
| `before_compaction` | Plugin pattern | Memory management |
| `after_compaction` | Plugin pattern | Memory management |
| `command:*` | `executeTriggers` | Commands as triggers |

---

## Hook Registration Comparison

### OpenClaw Plugin API

```typescript
// Typed hooks (preferred)
api.on("before_agent_start", async (event, ctx) => {
  return { prependContext: "..." };
}, { priority: 100 });

// Internal hooks (legacy)
api.registerHook("command:new", async (event) => {
  // Handle event
}, { name: "my-hook", register: true });
```

### NEX Plugin Interface

```typescript
interface NEXPlugin {
  name: string;
  priority?: number;  // Lower = runs first
  
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

---

## Execution Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Hook Execution Flow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PARALLEL (runVoidHook)                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐                               │
│  │Handler1│ │Handler2│ │Handler3│  ← All execute simultaneously │
│  └────────┘ └────────┘ └────────┘                               │
│       │          │          │                                    │
│       └──────────┴──────────┘                                    │
│                  │                                               │
│                  ▼                                               │
│              (no result needed)                                  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SEQUENTIAL (runModifyingHook)                                   │
│  ┌────────┐    ┌────────┐    ┌────────┐                         │
│  │Handler1│ -> │Handler2│ -> │Handler3│  ← Priority order       │
│  │ p=100  │    │ p=50   │    │ p=10   │                         │
│  └────────┘    └────────┘    └────────┘                         │
│       │            │             │                               │
│       ↓            ↓             ↓                               │
│    Result1  ->  Merge   ->   Final Result                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Priority Guidelines

### OpenClaw Conventions

| Priority | Purpose | Examples |
|----------|---------|----------|
| 100+ | Early processing, critical | Security checks, rate limiting |
| 50 | Default | Most hooks |
| 10-40 | Late processing | Final transformations |
| 1-10 | Last resort | Fallback handlers |

### NEX Conventions (Proposed)

| Priority | Purpose |
|----------|---------|
| 10 | Earliest (security, validation) |
| 50 | Default |
| 90 | Latest (logging, finalization) |

**Note:** NEX uses lower = earlier, opposite of OpenClaw.

---

## Error Handling

### OpenClaw Approach

```typescript
// Hook runner wraps handlers in try/catch
for (const hook of hooks) {
  try {
    await hook.handler(event, ctx);
  } catch (err) {
    console.error(`Hook error [${hookName}]:`, err);
    // Continue to next hook
  }
}
```

- Errors are logged but don't stop execution
- Other hooks continue running
- No error result propagation

### NEX Approach

```typescript
// onError hook for error handling
onError?(req: NexusRequest, error: Error): Promise<void>;
```

- Dedicated error hook for all plugins
- Pipeline can abort on critical errors
- Error state persisted to NexusRequest

---

## Implementation Recommendations

### 1. Preserve Typed Hook Pattern

The typed hook system provides:
- Type-safe event/result contracts
- Clear parallel vs sequential semantics
- Priority ordering

### 2. Consolidate to Stage Hooks

Instead of scattered event hooks, use NEX stage hooks:
- `before_agent_start` → `afterAssembleContext`
- `message_received` → `afterReceiveEvent`
- Tool hooks → Sub-hooks within `runAgent`

### 3. Keep Priority Ordering

Allow plugins to specify execution order:
```typescript
api.on("afterAssembleContext", handler, { priority: 10 });
```

### 4. Support Both Parallel and Sequential

Some hooks need parallel (logging), others need sequential (modification).
NEX should support both patterns per hook type.

---

## Related Documents

- `README.md` — Overview and architecture gap analysis
- `DISPATCH_FLOW.md` — Where hooks are triggered in dispatch
- `UPSTREAM_PLUGINS.md` — Plugin registration details
- `../../upstream/PLUGINS_AND_HOOKS.md` — Full OpenClaw source analysis
