# NEX — Nexus Event Exchange

**Status:** ACTIVE  
**Last Updated:** 2026-02-04

---

## Overview

This folder contains the core NEX orchestrator specifications — the central pipeline that processes all events in Nexus.

---

## Documents

| Spec | Status | Description |
|------|--------|-------------|
| **`NEX.md`** | ✅ Complete | **START HERE** — Central orchestrator (8-stage pipeline) |
| `NEXUS_REQUEST.md` | ✅ Complete | The data bus that accumulates context through pipeline |
| `INTERFACES.md` | ✅ Complete | All component interface contracts |
| `PLUGINS.md` | ✅ Complete | NEX plugin system (hook points) |
| `STREAMING.md` | ✅ Complete | Token streaming flow |
| `BUS_ARCHITECTURE.md` | ✅ Complete | Internal real-time pub/sub |
| `automations/` | ✅ Complete | Automation system (proactive/reactive agent invocations) |

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
- `../iam/` — IAM that resolves identity and permissions
- `../broker/` — Broker that executes agents
