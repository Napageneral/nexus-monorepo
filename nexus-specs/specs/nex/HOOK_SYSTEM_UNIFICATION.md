# Hook System Unification

**Status:** DESIGN
**Last Updated:** 2026-03-03

---

## Overview

The Nexus codebase currently has **four separate hook systems** with **44 distinct hook point names** across different naming conventions and execution models. This spec defines the target: one unified system with one canonical list of hook points and one naming convention.

---

## The Three Concepts

### Hook Points

A **hook point** is a named moment in the system's execution where external code can run. It's the "where." Hook points are emitted by the runtime at specific moments — pipeline stages completing, episodes closing, agents starting, the runtime booting up.

A hook point is not an automation, not an event — it's the **location** where things happen.

### Automations

An **automation** is a managed, tracked, durable unit of work that runs at a hook point. It's the "what runs." Automations range from lightweight loggers (no workspace, fire-and-forget) to full meeseeks agents (workspace, self-improvement, blocking execution).

All code that runs at hook points is an automation. One system, one table, one set of operations.

### Events (PubSub)

An **event** is a notification broadcast about something that happened. Events are for **observation**, not execution. Consumers: UI (WebSocket push), external integrations, logging/analytics.

When a hook point fires, both automations execute AND an event broadcasts. They serve different purposes:

| | Automations | Events (PubSub) |
|---|---|---|
| Purpose | Execute code | Notify observers |
| Tracking | Full invocation telemetry | Fire-and-forget |
| Can block? | Yes (if blocking=true) | Never |
| Has workspace? | Optional | No |
| Circuit breaker? | Yes | No |
| Audience | Internal runtime code | External subscribers (UI, integrations) |

The relationship:

```
Hook Point fires
    |-- Automations execute (managed, tracked, can block)
    +-- Event broadcasts (notification to external subscribers)
```

---

## Current State: Four Systems

### System 1: Automations (DB-backed, target system)

The `automations` table in nexus.db. Automations register at a `hook_point` string. Evaluated by `evaluateAutomationsAtHook()`.

**Hook points used today:** `worker:pre_execution`, `episode-created`, `episode-retained`, `command:execute`, `runtime:startup`, `runAutomations` (legacy)

### System 2: Internal Hooks (in-process callbacks)

Registered via `registerInternalHook()`, fired by `triggerInternalHook()`. Uses `type:action` naming.

**Hook points:** `command:new`, `command:reset`, `command:stop`, `command:compact`, `command:status`, `command:model`, `session:start`, `session:end`, `agent:bootstrap`, `runtime:startup`

### System 3: NEXPlugin (pipeline stage methods)

Typed plugin interface methods called by `runAfterStagePlugins()` in the pipeline. CamelCase method names.

**Hook points:** `afterAcceptRequest`, `afterResolvePrincipals`, `afterResolveAccess`, `afterExecuteOperation`, `onFinalize`, `onError`

### System 4: OpenClaw Plugin (upstream inherited)

Snake_case hook names from the OpenClaw plugin system.

**Hook points:** `before_agent_start`, `agent_end`, `before_compaction`, `after_compaction`, `message_received`, `message_sending`, `message_sent`, `before_tool_call`, `after_tool_call`, `tool_result_persist`, `session_start`, `session_end`, `runtime_start`, `runtime_stop`

---

## Target State: One System

All four systems collapse into the **automations system** (System 1). The `automations` table and `evaluateAutomationsAtHook()` are the only hook execution path. Internal hooks, NEXPlugin methods, and OpenClaw plugin hooks are absorbed or eliminated.

### Naming Convention

Consistent colon-delimited, lowercase. The prefix indicates the category.

### Canonical Hook Point List

**Pipeline hooks** (run during request processing):

| Hook Point | Blocking? | Description |
|---|---|---|
| `after:acceptRequest` | yes | After event parsing and request creation |
| `after:resolvePrincipals` | yes | After entity resolution |
| `after:resolveAccess` | yes | After IAM policy evaluation |
| `before:executeOperation` | yes | Before operation dispatch |
| `after:executeOperation` | yes | After operation completes |
| `after:finalizeRequest` | no | After persistence and cleanup |

**Broker hooks** (run during agent dispatch):

| Hook Point | Blocking? | Description |
|---|---|---|
| `worker:pre_execution` | yes | Before agent LLM execution. Memory injection runs here. |

**Memory hooks** (run during memory pipeline):

| Hook Point | Blocking? | Description |
|---|---|---|
| `episode:created` | no | Episode clipped, ready for retention. Memory writer runs here. |
| `episode:retained` | no | Writer completed, facts extracted. Memory consolidator runs here. |

**Lifecycle hooks** (run during system events):

| Hook Point | Blocking? | Description |
|---|---|---|
| `runtime:startup` | no | Daemon has started. Boot-md runs here. |
| `runtime:shutdown` | no | Daemon is shutting down. |
| `session:start` | no | Session created or resumed. |
| `session:end` | no | Session archived or closed. |
| `agent:bootstrap` | yes | Agent first-run initialization. Bootstrap file handlers run here. |

**Command hooks** (run during user commands):

| Hook Point | Blocking? | Description |
|---|---|---|
| `command:new` | no | User started a new session (`/new` command). |
| `command:execute` | no | Command executed. Command logger runs here. |
| `command:reset` | no | Session reset. |
| `command:stop` | no | Agent execution stopped. |
| `command:compact` | no | Manual compaction triggered. |

**Total: 19 canonical hook points.**

---

## Migration: What Happens to Each System

### System 2 (Internal Hooks) → Absorbed

Internal hooks become automations. The `registerInternalHook()` / `triggerInternalHook()` API is removed. Any code that registered internal hooks becomes a bundled automation instead.

| Internal Hook | Becomes |
|---|---|
| `command:new` | Hook point `command:new`, existing handlers become automations |
| `command:reset` | Hook point `command:reset` |
| `command:stop` | Hook point `command:stop` |
| `command:compact` | Hook point `command:compact` |
| `command:status` | Dropped — no handlers exist |
| `command:model` | Dropped — no handlers exist |
| `session:start` | Hook point `session:start` |
| `session:end` | Hook point `session:end` |
| `agent:bootstrap` | Hook point `agent:bootstrap` |
| `runtime:startup` | Hook point `runtime:startup` (already exists in automations) |

### System 3 (NEXPlugin) → Becomes Implementation

NEXPlugin methods become the internal implementation behind pipeline hook points. `afterAcceptRequest()` is how the runtime emits the `after:acceptRequest` hook point — it's the mechanism, not a separate system.

| NEXPlugin Method | Becomes |
|---|---|
| `afterAcceptRequest` | Emits hook point `after:acceptRequest` |
| `afterResolvePrincipals` | Emits hook point `after:resolvePrincipals` |
| `afterResolveAccess` | Emits hook point `after:resolveAccess` |
| `afterExecuteOperation` | Emits hook point `after:executeOperation` |
| `onFinalize` | Emits hook point `after:finalizeRequest` |
| `onError` | Error handling — not a hook point, stays as internal error handler |

### System 4 (OpenClaw Plugins) → Mapped or Dropped

OpenClaw plugin hooks map to canonical hook points where there's semantic overlap. The rest are dropped.

| OpenClaw Hook | Maps To | Notes |
|---|---|---|
| `before_agent_start` | `worker:pre_execution` | Same semantic moment |
| `agent_end` | `after:executeOperation` | Closest match |
| `before_compaction` | `command:compact` | Or a new hook if needed |
| `after_compaction` | (dropped) | No consumers |
| `message_received` | (dropped) | Covered by pipeline hooks |
| `message_sending` | (dropped) | Covered by pipeline hooks |
| `message_sent` | (dropped) | Covered by pipeline hooks |
| `before_tool_call` | (dropped) | Can be added later if needed |
| `after_tool_call` | (dropped) | Can be added later if needed |
| `tool_result_persist` | (dropped) | Can be added later if needed |
| `session_start` | `session:start` | Direct rename |
| `session_end` | `session:end` | Direct rename |
| `runtime_start` | `runtime:startup` | Direct rename |
| `runtime_stop` | `runtime:shutdown` | Direct rename |

Tool-level hooks (`before_tool_call`, `after_tool_call`, `tool_result_persist`) are not included in the initial 19 hook points. They can be added later as `tool:before_call`, `tool:after_call` etc. if there's a concrete need.

---

## Naming Divergences Resolved

| Old Name(s) | Canonical Name | Resolution |
|---|---|---|
| `nex:startup` (spec) / `runtime:startup` (code) | `runtime:startup` | Code wins — "runtime" is more accurate than "nex" |
| `afterAcceptRequest` (NEXPlugin) / `after:acceptRequest` (MEESEEKS spec) | `after:acceptRequest` | Colon-delimited wins — consistent with all other hook points |
| `command:new` (internal hook) / `command:execute` (automation) | Both kept | Different semantics — `new` is "/new command", `execute` is "any command" |
| `episode-created` (hyphenated) | `episode:created` | Colon-delimited for consistency |
| `episode-retained` (hyphenated) | `episode:retained` | Colon-delimited for consistency |
| `runAutomations` (legacy) | Dropped | Was a catch-all for legacy durable hooks with no specific hook_point |
| `gateway_start` / `gateway_stop` (upstream spec) | `runtime:startup` / `runtime:shutdown` | Upstream names never used in code |

---

## Bundled Automations (Updated)

| Name | Hook Point | Blocking | Workspace | Description |
|---|---|---|---|---|
| memory-reader | `worker:pre_execution` | yes | workspace/memory-reader | Pre-execution memory context injection |
| memory-writer | `episode:created` | no | workspace/memory-writer | Extract facts and entities from episodes |
| memory-consolidator | `episode:retained` | no | workspace/memory-consolidator | Build observations, detect causal links |
| command-logger | `command:execute` | no | (none) | Log command execution |
| boot-md | `runtime:startup` | no | (none) | Run BOOT.md on daemon start |
