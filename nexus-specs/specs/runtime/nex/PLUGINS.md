# NEX Plugin System

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-02-09  
**Related:** NEX.md, automations/AUTOMATION_SYSTEM.md

---

## Overview

NEX exposes **hook points** throughout its pipeline where code can plug in to observe or modify the `NexusRequest`. Plugins are the mechanism; specific uses (like automations) are patterns built on top.

**Key terminology:**
- **Hooks** — Injection points in the NEX pipeline
- **Plugins** — Code that attaches to hooks
- **Automations** — A specific plugin pattern for proactive/reactive agent invocations

---

## Hook Points

NEX fires hooks after each pipeline stage:

```
Event Arrives
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          NEX PIPELINE                                    │
│                                                                          │
│  1. receiveEvent()         →  [afterReceiveEvent]                       │
│  2. resolveIdentity()      →  [afterResolveIdentity]                    │
│  3. resolveAccess()        →  [afterResolveAccess]                      │
│  4. runAutomations()       →  [afterRunAutomations]  ← AUTOMATIONS     │
│  5. assembleContext()      →  [afterAssembleContext]                    │
│  6. runAgent()             →  [afterRunAgent]                           │
│  7. deliverResponse()      →  [afterDeliverResponse]                    │
│  8. finalize()             →  [onFinalize]                              │
│                                                                          │
│  Error at any stage        →  [onError]                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Plugin Interface

```typescript
interface NEXPlugin {
  name: string;
  priority?: number;  // Lower runs first (default: 100)
  
  // Lifecycle hooks (after each stage)
  afterReceiveEvent?(req: NexusRequest): Promise<void | 'skip'>;
  afterResolveIdentity?(req: NexusRequest): Promise<void | 'skip'>;
  afterResolveAccess?(req: NexusRequest): Promise<void | 'skip'>;
  afterRunAutomations?(req: NexusRequest): Promise<void | 'skip'>;
  afterAssembleContext?(req: NexusRequest): Promise<void | 'skip'>;
  afterRunAgent?(req: NexusRequest): Promise<void | 'skip'>;
  afterDeliverResponse?(req: NexusRequest): Promise<void | 'skip'>;
  
  onFinalize?(req: NexusRequest): Promise<void>;
  onError?(req: NexusRequest, error: Error): Promise<void>;
}
```

### Plugin Capabilities

Plugins can:
- **Read** the NexusRequest at any point
- **Modify** the NexusRequest (add context, adjust routing, etc.)
- **Skip** remaining pipeline (return `'skip'`)
- **Log/observe** the flow
- **Emit** bus events

---

## Built-in Plugins

| Plugin | Hook Point | Purpose |
|--------|------------|---------|
| **Logging** | All | Log request flow for debugging |
| **Analytics** | onFinalize | Track latency, token usage, costs |
| **Automations** | afterRunAutomations | Evaluate automation triggers (stage 4) |

---

## Automations

Automations are a specific plugin pattern that plugs into the `runAutomations` stage (stage 4 — after IAM resolves identity/permissions, before context assembly).

Automations:
- Evaluate user/agent-created scripts against events
- Can invoke specific agents with custom context
- Can enrich the request for normal flow
- Support proactive (timer-based) and reactive (event-based) patterns

See `automations/AUTOMATION_SYSTEM.md` for the full automation specification.

---

## Example Plugins

### Logging Plugin

```typescript
const loggingPlugin: NEXPlugin = {
  name: 'logging',
  
  afterReceiveEvent: async (req) => {
    console.log(`[NEX] Received: ${req.event.event_id}`);
  },
  
  onFinalize: async (req) => {
    console.log(`[NEX] Complete: ${req.request_id} in ${req.pipeline.duration_ms}ms`);
  },
  
  onError: async (req, error) => {
    console.error(`[NEX] Error: ${error.message}`);
  },
};
```

### Analytics Plugin

```typescript
const analyticsPlugin: NEXPlugin = {
  name: 'analytics',
  
  onFinalize: async (req) => {
    await analytics.track('request_complete', {
      channel: req.delivery.channel,
      persona: req.access?.routing.persona,
      duration_ms: req.pipeline.duration_ms,
      input_tokens: req.response?.usage?.input_tokens,
      output_tokens: req.response?.usage?.output_tokens,
    });
  },
};
```

### Context Enrichment Plugin

```typescript
const urgentFlagPlugin: NEXPlugin = {
  name: 'urgent-flag',
  
  afterRunAutomations: async (req) => {
    if (req.event.content.match(/urgent|asap|emergency/i)) {
      req.triggers.enrichment = {
        ...req.triggers.enrichment,
        priority: 'urgent',
      };
    }
  },
};
```

---

## Configuration

Plugins are loaded from configuration:

```yaml
# nex.yaml
plugins:
  directory: ./plugins
  enabled:
    - logging
    - analytics
```

---

## Related Specs

- `NEX.md` — Pipeline architecture
- `NEXUS_REQUEST.md` — NexusRequest schema (field paths used in plugins)
- `automations/AUTOMATION_SYSTEM.md` — Automation specification
- `BUS_ARCHITECTURE.md` — Bus events plugins can emit
