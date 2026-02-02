# NEX — Nexus Event Exchange

**Status:** ACTIVE  
**Last Updated:** 2026-02-02

---

## Overview

This folder contains the NEX orchestrator specification and the core data schemas that flow through the Nexus system. NEX is the central event exchange — the 8-stage pipeline that processes all events from adapters through to agent execution and response delivery.

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| **`NEX.md`** | ✅ New | **START HERE** — Central orchestrator (Nexus Event Exchange) |
| `NEXUS_REQUEST.md` | ✅ Done | The data bus that accumulates context through pipeline |
| `INTERFACE_WORKPLAN.md` | ✅ Active | Tracks all component interfaces |
| `CHANNEL_CAPABILITIES.md` | — | Covered in `adapters/channels/` per-channel docs |

---

## Core Concept: NexusRequest

The `NexusRequest` is an accumulating context object that flows through the entire pipeline. Each stage adds its context, and by the end we have a complete record of everything that happened.

```
Event Arrives
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  NEXUS REQUEST (accumulates through pipeline)                           │
│                                                                          │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐  │
│  │   EVENT     │ → │    ACL      │ → │   HOOKS     │ → │   BROKER    │  │
│  │             │   │             │   │             │   │             │  │
│  │ + delivery  │   │ + principal │   │ + fired     │   │ + agent_id  │  │
│  │ + channel   │   │ + perms     │   │ + context   │   │ + turn_id   │  │
│  │ + thread    │   │ + session   │   │             │   │             │  │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘  │
│                                                                          │
│                              ↓                                           │
│                                                                          │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                    │
│  │   AGENT     │ → │  DELIVERY   │ → │   LEDGER    │                    │
│  │             │   │             │   │             │                    │
│  │ + response  │   │ + result    │   │ (persisted) │                    │
│  │ + tools     │   │ + msg_ids   │   │             │                    │
│  └─────────────┘   └─────────────┘   └─────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Benefits

1. **Debuggable** — Full trace of what happened at each stage
2. **Auditable** — Complete record persisted to ledger
3. **Contextual** — Agent sees everything accumulated so far
4. **Cacheable** — System prompt stays static, context passed per-turn

---

## Design Principles

### 1. Accumulate, Don't Replace

Each pipeline stage ADDS to the request, doesn't replace. Previous stages' context remains available.

### 2. Static System Prompt

The system prompt should be static and cacheable. Dynamic context (channel, capabilities, etc.) is passed in the turn, not the system prompt.

### 3. On-Demand Guidance

Instead of bloating the system prompt with all possible formatting rules, provide guidance on-demand when specific tools are called.

### 4. Full Persistence

The complete `NexusRequest` (including all accumulated context) is persisted to the Nexus Ledger for debugging and audit.

---

## Related Specs

- `../adapters/` — Channel adapters that populate delivery context
- `../acl/` — ACL that populates identity context
- `../agent-system/` — Broker and hooks that process the request
