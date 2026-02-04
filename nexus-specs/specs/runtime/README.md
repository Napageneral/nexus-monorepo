# Runtime Infrastructure

The event processing engine that powers Nexus.

---

## What This Is

Runtime infrastructure handles **what happens when an event arrives**. It's the "engine" — event-driven, processing things in real-time.

```
Event → Adapters → NEX Pipeline → Broker → Adapters → External
                      │
                      ├── IAM (who is this? what can they do?)
                      ├── Hooks (custom behavior)
                      └── Broker (run the agent)
```

---

## Components

| Folder | Purpose |
|--------|---------|
| `nex/` | Pipeline orchestrator — the 8-stage event processing pipeline |
| `adapters/` | External connections — how Nexus talks to Discord, iMessage, etc. |
| `iam/` | Identity & Access Management — who can do what |
| `nex/automations/` | Automation system — proactive/reactive agent invocations |
| `broker/` | Agent execution — context assembly, routing, session management |

---

## The NEX Pipeline

NEX (Nexus Event Exchange) is the central orchestrator:

```
receiveEvent → resolveIdentity → resolveAccess → executeTriggers
                                                        │
                                                        ▼
              finalize ← deliverResponse ← runAgent ← assembleContext
```

| Stage | Owner |
|-------|-------|
| `receiveEvent` | Adapters |
| `resolveIdentity`, `resolveAccess` | IAM |
| `executeTriggers` | Hooks |
| `assembleContext`, `runAgent` | Broker |
| `deliverResponse` | NEX + Adapters |
| `finalize` | NEX |

---

## See Also

- `../OVERVIEW.md` — System overview
- `../data/` — Where state lives (ledgers, cortex)
- `../environment/` — Agent working context

---

*This directory contains specifications for Nexus runtime infrastructure.*
