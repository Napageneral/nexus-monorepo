# NEX Plugin System

**Status:** ARCHIVED — hook/automation model superseded by `NEXUS_REQUEST_TARGET.md`
**Last Updated:** 2026-02-26
**Archived:** 2026-02-27 — Automation hookpoints, AutomationContext, and agent_overrides are now canonical in `NEXUS_REQUEST_TARGET.md`.
**Related:** `UNIFIED_RUNTIME_OPERATION_MODEL.md`, `NEX.md`, `../_archive/AUTOMATION_SYSTEM.md`

---

## Supersession Note

Canonical runtime operation semantics live in `UNIFIED_RUNTIME_OPERATION_MODEL.md`.

This document is retained for plugin/hook context only. If hook or stage naming conflicts with runtime code, runtime code and the unified model win.

## Overview

NEX exposes **hook points** throughout its pipeline where code can plug in to observe or modify the `NexusRequest`. Plugins are the mechanism; specific uses (like automations) are patterns built on top.

**Key terminology:**
- **Hooks** — Injection points in the NEX pipeline
- **Plugins** — Code that attaches to hooks
- **Automations** — A specific plugin pattern for proactive/reactive agent invocations

---

## Hook Points

NEX fires hooks at defined pipeline boundaries:

```
Event Arrives
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          NEX PIPELINE                                    │
│                                                                          │
│  receiveEvent()            → [afterReceiveEvent]                        │
│  resolvePrincipals()       → [afterResolvePrincipals]                   │
│  resolveAccess()           → [afterResolveAccess]                       │
│  runAutomations()          → [afterRunAutomations]                      │
│  assembleContext()         → [afterAssembleContext]                     │
│  runAgent()                → [afterRunAgent]                            │
│  deliverResponse()         → [afterDeliverResponse]                     │
│  finalize()                → [onFinalize]                               │
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
  afterResolvePrincipals?(req: NexusRequest): Promise<void | 'skip'>;
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
| **Automations** | afterRunAutomations | Evaluate automation triggers (stage 5) |

---

## Automations

Automations are a specific plugin pattern that plugs into the `runAutomations` stage (stage 5 — after IAM resolves identity/permissions, before session routing).

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
      platform: req.delivery.platform,
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
# config.json — plugins section
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
