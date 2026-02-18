# Manager-Worker Pattern (MWP)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-16  
**Related:** DATA_MODEL.md, OVERVIEW.md

---

## Overview

The Manager-Worker Pattern (MWP) defines how Nexus orchestrates multiple agents to handle complex tasks.

**Core insight:** A single user-facing agent (Manager) maintains conversation continuity while delegating context-heavy execution to specialized agents (Workers).

In Nexus MWP:
- The MA is communication-only (decide what to say, when to wait, and what to dispatch).
- The MA aggressively parallelizes work via async dispatch to WAs.
- The MA may write to a scratchpad workspace, but does not do project/tool work directly.

---

## Terminology

| Term | Role | Description |
|------|------|-------------|
| **Manager Agent (MA)** | Interaction | Talks to user, delegates tasks, maintains conversation |
| **Worker Agent (WA)** | Execution | Task-focused, heavy context, specialized tools |
| **Agent Broker** | Orchestration | Routes messages between agents, manages queues |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         NEX Pipeline                                │
│                    (triggers broker at runAgent stage)             │
└────────────────────────────────────────┬───────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────┐
│                        AGENT BROKER                                 │
│                                                                     │
│  • Routes messages to appropriate agent sessions                   │
│  • Manages message queues (durable, priority-based)               │
│  • Tracks agent relationships (who spawned whom)                  │
│  • Handles trigger → session routing                               │
│  • Writes sessions/turns to Agents Ledger                         │
│                                                                     │
└────────────────┬──────────────────────────────────┬────────────────┘
                 │                                   │
                 ▼                                   ▼
┌────────────────────────────┐   ┌────────────────────────────────────┐
│     Manager Agent (MA)     │   │      Worker Agent (WA)             │
│                            │   │                                    │
│  • User conversation       │   │  • Task execution                  │
│  • Intent understanding    │   │  • Heavy project context           │
│  • Delegation decisions    │   │  • Specialized tools               │
│  • Communication learning  │   │  • Can spawn sub-workers           │
│                            │   │                                    │
│  Tools:                    │   │  Can message back to MA:           │
│  - agent_send              │   │  - Progress updates                │
│  - get_agent_status        │   │  - Clarifying questions            │
│  - ledger/cortex inspection│   │  - Partial results                 │
│  - wait                    │   │                                    │
│  - send_message            │   │  Final result always returns:      │
│  (scratchpad-only file     │   │  - worker_result → caller session  │
│   tools, sandboxed)        │   │                                    │
└────────────────────────────┘   └────────────────────────────────────┘
                                             │
                                             │ nested spawn
                                             ▼
                              ┌────────────────────────────────────────┐
                              │      Sub-Worker Agent                  │
                              │      (WAs can spawn their own WAs)     │
                              │      Depth limit: 3 (configurable)     │
                              └────────────────────────────────────────┘
```

---

## Key Properties

### 1. All Agents Persistent

Every agent session is persisted to the Agents Ledger. There are no "ephemeral" agents. Any session can be resumed with its full context.

### 2. Nested Spawning Allowed

Workers can spawn their own sub-workers. Use cases:
- Complex tasks requiring specialization
- Parallel sub-task execution
- Vision/browser workers spawning analysis workers

Broker tracks spawn depth. Default maximum: 3 levels.

### 3. Bidirectional Communication

Workers can message the Manager at any time, not just at completion:
- Progress updates during long tasks
- Clarifying questions that need user input
- Early results before full completion

### 4. Persona Is Separate From Session Keys

Session keys identify the conversation/thread target (dm/group/worker/etc). Persona is a routing decorator that can be swapped without changing the session key.

- Workers default to the caller's persona (same identity + permissions).
- A dispatch may explicitly request a different `personaId`/persona (still subject to IAM).

---

## Communication Patterns

### MA → WA: Task Delegation

```
MA decides to delegate: "This requires deep code analysis"
  │
  ▼
MA calls: agent_send({ op: "dispatch", text: "...", target: { session: "worker:code-worker" } })
  │
  ▼
Broker enqueues a durable worker request (fire-and-forget)
  │
  ▼
WA executes (may take minutes, can use tools)
  │
  ▼
WA completion enqueues a `worker_result` event back to the caller session (MA)
```

### Dispatch Targeting (v1 + v2 Shape)

Canonical interface (tool-level shape):

```typescript
type AgentSendInput =
  | {
      op: "dispatch";
      text: string;
      // v1:
      // - target.session provided => route to existing session
      // - target omitted => spawn new worker session
      // v2:
      // - smart/forked routing may resolve from historical checkpoints
      target?: DispatchTarget;
      deliveryMode?: "queue" | "interrupt";
      metadata?: Record<string, unknown>;
    }
  | {
      op: "message";
      text: string;
      target: { session: string };
      deliveryMode?: "queue" | "interrupt";
      metadata?: Record<string, unknown>;
    };

type DispatchTarget =
  | { kind: "session"; session: string }                      // v1 explicit routing
  | { kind: "new_session"; labelHint?: string }               // v1 explicit spawn
  | { kind: "fork"; fromTurnId: string; labelHint?: string }  // v2 smart/explicit fork
```

LLM shorthand contract for v1 (what MA thinks in prompts):
- `agent_send("task", "worker:label")` -> dispatch to existing session
- `agent_send("task")` -> spawn a new worker session

### Dispatch Handles and History Lookup

- Every `agent_send(op=dispatch)` returns a `dispatch_id` (the tool call id) and `spawned_session_label`.
- The spawned worker session persists a backlink: `spawn_tool_call_id = dispatch_id`.
- Worker results include `broker.dispatched_tool_call_id = dispatch_id` for correlation.
- Long-term: no special "get agent logs" tool is required. MA/WA inspection should use existing ledger + Cortex APIs with `dispatch_id` and `spawned_session_label` as the lookup handles.

### WA → MA: Mid-Task Communication

```
WA encounters ambiguity during execution
  │
  ▼
WA calls: agent_send({ op: "message", text: "Need clarification...", target: { session: "parent" } })
  │
  ▼
Broker routes to MA session
  │
  ▼
MA asks user for clarification
  │
  ▼
MA responds to WA with answer
  │
  ▼
WA continues execution
```

### User → MA: Status Query

```
User: "How's that code review going?"
  │
  ▼
MA receives via NEX pipeline
  │
  ▼
MA inspects worker history via ledger/cortex using dispatch_id/session_label
  │
  ▼
MA summarizes for user
```

---

## Tool Interface

### Manager Tools

| Tool | Purpose |
|------|---------|
| `agent_send` | Unified inter-agent send: dispatch work (`op=dispatch`) or message (`op=message`) |
| `get_agent_status` | Check session status + queue snapshot |
| `wait` | End turn without sending a user-facing reply |
| `send_message` | Send explicit user-facing messages to any channel/target (multi-channel) |

### Worker Tools

| Tool | Purpose |
|------|---------|
| `agent_send` | Message the manager/parent or other agents; can also dispatch sub-workers |
| Full tool access | File ops, shell, web, etc. (per permissions), but no direct end-user messaging |
| (implicit) `worker_result` | Worker completion is always routed upstream to the caller session |

---

## Open Questions

1. **MA sandboxing:** How hard should we sandbox MA scratchpad-only file access (tool-level path allowlist vs stronger OS/container sandbox)?

2. **Spawn depth limit:** Is 3 levels sufficient? Should it be per-workspace configurable?

3. **Cross-persona workers:** Can a WA be spawned with a different persona than MA? (Permission escalation/restriction scenarios)

4. **Worker cleanup:** When should completed worker sessions be archived vs kept active?

---

## Related Documents

- `DATA_MODEL.md` — Core data model (Session, Turn, Thread)
- `OVERVIEW.md` — Broker folder overview
- `QUEUE_MANAGEMENT.md` — How messages are queued and delivered
- `INTERFACES.md` — Inter-agent communication contracts
- `../iam/` — Permissions and access control

---

*This document defines the Manager-Worker Pattern for Nexus agent orchestration.*
