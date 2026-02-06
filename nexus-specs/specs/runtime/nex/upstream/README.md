# OpenClaw Upstream Analysis — NEX Context

> **Purpose:** Reference documentation for understanding OpenClaw's architecture and how it informs NEX design.  
> **Last Updated:** 2026-02-04

---

## Overview

OpenClaw is the open-source runtime that Nexus NEX builds upon. This folder documents OpenClaw's approach, identifies architectural gaps, and maps concepts to NEX.

**Critical insight:** OpenClaw does NOT have a central orchestrator like NEX. Instead, it uses a **scattered dispatch model** where message handling flows through multiple loosely-coupled components:

```
OpenClaw: Scattered Dispatch               NEX: Central Orchestrator
─────────────────────────                   ─────────────────────────

Gateway → dispatchInboundMessage()          Gateway → NEX.receiveEvent()
            ↓                                            ↓
        finalizeContext()                   NEX orchestrates 8 stages:
            ↓                                 • resolveIdentity
        dispatchReplyFromConfig()             • resolveAccess
            ↓                                 • executeTriggers
        getReplyFromConfig()                  • assembleContext
            ↓                                 • runAgent
        runReplyAgent()                       • deliverResponse
            ↓                                 • finalize
        ReplyDispatcher                               ↓
            ↓                               Single NexusRequest object
        Multiple callbacks                  accumulates through pipeline
        scattered across modules
```

---

## What OpenClaw LACKS (That NEX Provides)

### 1. Central Pipeline Ownership

**OpenClaw:** Dispatch flows through `dispatchInboundMessage()` → `dispatchReplyFromConfig()` → `getReplyFromConfig()` → `runReplyAgent()`, but each function is its own module with callbacks scattered throughout.

**NEX:** Single 8-stage pipeline with clear stage boundaries and a `NexusRequest` data bus that accumulates context.

### 2. Unified Request Object

**OpenClaw:** Uses `MsgContext` for inbound messages and `ReplyPayload` for outbound, with separate tracking for hooks, permissions, session state, etc.

**NEX:** Single `NexusRequest` object carries everything: event, identity, permissions, session, hooks, agent context, response, and pipeline trace.

### 3. Explicit Stage Hooks

**OpenClaw:** Hooks are event-driven (`command:new`, `message_received`) or lifecycle-based (`before_agent_start`), but not tied to pipeline stages.

**NEX:** Plugins attach to explicit stage boundaries: `afterReceiveEvent`, `afterResolveIdentity`, `afterResolveAccess`, etc.

### 4. Identity/ACL Integration

**OpenClaw:** No built-in identity resolution. Relies on channel-provided sender info.

**NEX:** Dedicated `resolveIdentity()` and `resolveAccess()` stages that lookup identities and evaluate policies.

### 5. Session Resolution Separation

**OpenClaw:** Session resolution happens during reply generation (`getReplyFromConfig`).

**NEX:** Session resolution is explicit in `resolveAccess()` (base session) and can be overridden by `executeTriggers()`.

---

## OpenClaw Component → NEX Mapping

| OpenClaw Component | NEX Equivalent | Notes |
|--------------------|----------------|-------|
| Gateway Server | Adapters + NEX entry | Gateway handles WebSocket; NEX handles pipeline |
| `dispatchInboundMessage()` | `receiveEvent()` | Event normalization |
| `finalizeInboundContext()` | `receiveEvent()` | Context normalization |
| `dispatchReplyFromConfig()` | Multiple stages | Scattered across NEX stages |
| Deduplication | Plugin pattern | Could be `afterReceiveEvent` plugin |
| Hook runner | `executeTriggers()` | Unified hook execution stage |
| `getReplyFromConfig()` | `assembleContext()` | Context gathering |
| `runReplyAgent()` | `runAgent()` | Agent execution |
| `ReplyDispatcher` | `deliverResponse()` | Response delivery |
| Block streaming | Streaming subsystem | NEX provides StreamingContext |
| Gateway broadcast | Adapter outbound | Events pushed to clients |

---

## Documents in This Folder

| Document | Description |
|----------|-------------|
| **README.md** | This file — overview and mapping |
| **DISPATCH_FLOW.md** | OpenClaw's dispatch pipeline, mapping to NEX stages |
| **HOOK_LIFECYCLE.md** | All OpenClaw hook types, execution order, NEX mapping |
| **STREAMING_ARCHITECTURE.md** | OpenClaw streaming, gateway broadcast, informing NEX |
| **UPSTREAM_PLUGINS.md** | Plugin system analysis, slot system, tool registration |

---

## Comprehensive Reference Docs

For detailed OpenClaw internals, see:

- `../../upstream/GATEWAY_SERVER.md` — Gateway server, RPC methods, events
- `../../upstream/AUTO_REPLY_PIPELINE.md` — Full dispatch flow documentation
- `../../upstream/PLUGINS_AND_HOOKS.md` — Plugin system, hook registration

---

## Key Architectural Insights

### 1. OpenClaw's Strengths to Preserve

- **Plugin system flexibility** — Multiple registration methods, factory pattern
- **Typed hooks** — Type-safe event/result contracts
- **Streaming architecture** — Well-designed partial delivery
- **Gateway protocol** — Clean WebSocket frame design

### 2. OpenClaw's Weaknesses to Address

- **No central orchestrator** — Pipeline scattered across modules
- **No request tracing** — No unified audit trail
- **No identity layer** — Relies on channel-provided info
- **Session/hooks intertwined** — Hard to reason about
- **Callbacks everywhere** — Difficult to debug/trace

### 3. NEX Design Decisions Informed by OpenClaw

| OpenClaw Observation | NEX Decision |
|---------------------|--------------|
| Dispatch is scattered | 8-stage central pipeline |
| Multiple context objects | Single NexusRequest data bus |
| Hooks fire at various points | Explicit after-stage hooks |
| No identity resolution | resolveIdentity + resolveAccess stages |
| Session resolved late | Session resolved early, overridable |
| Streaming is separate | Streaming integrated into runAgent |
| Plugins register callbacks | Plugins implement stage hooks |

---

## Migration Considerations

When adapting OpenClaw components for NEX:

1. **Preserve plugin API compatibility** where sensible
2. **Map existing hooks** to NEX pipeline stages
3. **Unify context objects** into NexusRequest
4. **Add identity/ACL stages** that OpenClaw lacks
5. **Keep streaming architecture** but integrate with pipeline

---

## Related NEX Specs

- `../NEX.md` — Central orchestrator specification
- `../NEXUS_REQUEST.md` — Data bus schema
- `../PLUGINS.md` — NEX plugin system
- `../STREAMING.md` — NEX streaming architecture
