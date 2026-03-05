# API Design: Batch 4 — Agents, Workspaces, Automations, Cron

**Status:** COMPLETE — all decisions locked
**Last Updated:** 2026-03-03

---

## Overview

Batch 4 covers agent entity management, the unified workspace primitive, the automation system (hooks + meeseeks), and cron scheduling. This batch also consolidates four separate hook systems into one.

**Cross-references:**
- Agent sessions, turns, messages, queue: [API_DESIGN_DECISIONS.md](./API_DESIGN_DECISIONS.md) (Batch 1)
- Chat operations: Batch 1
- Workspace primitive: [WORKSPACE_PRIMITIVE.md](./WORKSPACE_PRIMITIVE.md)
- Hook system unification: [HOOK_SYSTEM_UNIFICATION.md](./HOOK_SYSTEM_UNIFICATION.md)
- **SUPERSEDED (Batch 6):** Automations → unified `jobs.*` domain. `cron.*` retained but schedule format simplified. Agent configs added to agents domain. See [WORK_DOMAIN_UNIFICATION.md](./WORK_DOMAIN_UNIFICATION.md) and [API_DESIGN_BATCH_6.md](./API_DESIGN_BATCH_6.md).

---

## Domain: Agents

**Database:** `agents.db`

### Decisions

**Agent CRUD with workspace binding.** Each agent has a `workspace_id` pointing to a registered Workspace. The workspace provides identity (SOUL.md, IDENTITY.md) and behavioral configuration via its manifest.

**`agents.files.*` → `workspaces.files.*`.** Agent file operations move to the workspace domain. To read/write an agent's files, resolve the agent's `workspace_id` then use workspace operations. This generalizes file management to work for any workspace — agent or automation.

**`agent.identity.get` stays.** Convenience read operation that returns the agent's name, avatar, emoji without needing to resolve the workspace. This is a UI-facing summary, not a file read.

**`agent.wait` stays.** Long-poll for an agent run to complete. This is an execution concern, not a workspace concern.

**`workspace_path` on turns → `working_dir`.** The turn-level CWD for agent tool execution is renamed to avoid confusion with the Workspace primitive. This is just a path string, not a managed workspace.

**Persona concept eliminated.** `persona_id` on sessions and threads becomes `workspace_id`. The workspace IS the identity. No separate persona resolution chain. See [WORKSPACE_PRIMITIVE.md](./WORKSPACE_PRIMITIVE.md).

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `agents.list` | read | List all agents with identity summary and workspace reference |
| `agents.get` | read | Get agent details including workspace_id |
| `agents.create` | write | Create new agent (creates workspace, sets up default manifest) |
| `agents.update` | write | Update agent name, avatar, model, workspace binding |
| `agents.delete` | write | Delete agent (optionally delete workspace) |
| `agents.identity.get` | read | Get agent identity summary (name, avatar, emoji) |
| `agents.wait` | read | Long-poll for an agent run to complete (timeout-based) |

**Agent sessions, turns, messages, queue:** Defined in Batch 1. See [API_DESIGN_DECISIONS.md](./API_DESIGN_DECISIONS.md).

| Domain | Operations | Batch |
|--------|-----------|-------|
| `agents.sessions.*` | 11 operations | Batch 1 |
| `agents.turns.*` | 2 operations | Batch 1 |
| `agents.messages.*` | 2 operations | Batch 1 |
| `agents.sessions.queue.*` | 2 operations | Batch 1 |

---

## Domain: Workspaces

**Database:** `nexus.db` (new `workspaces` table)

### Decisions

**Unified primitive.** A Workspace is a registered directory on disk with a manifest that maps files to context injection behavior. Replaces agent config roots, automation workspaces, and the persona concept. See [WORKSPACE_PRIMITIVE.md](./WORKSPACE_PRIMITIVE.md) for the full spec.

**Manifest-driven injection.** The manifest maps filenames to injection levels (`system_prompt` or `turn_message`). Only manifest entries get loaded into context. The workspace can accumulate any number of files; the manifest controls what's active.

**No kind, no owner tracking.** The relationship goes the other direction — agents and automations point TO workspaces via `workspace_id`. No `kind`, `owner_type`, or `owner_id` on the workspace itself.

**Common manifest templates as sugar.** `agent_default` (SOUL.md + IDENTITY.md at system_prompt), `automation_default` (ROLE.md + SKILLS.md + PATTERNS.md + ERRORS.md at turn_message). Templates are convenience for workspace creation, not part of the model.

**Agents can update their own manifest.** This is how meeseeks self-improvement works — the agent writes to SKILLS.md and it's already in the manifest, so it loads next time. Agents can add new files to the manifest, change injection levels, or remove entries.

### Schema

```sql
CREATE TABLE workspaces (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    path          TEXT NOT NULL,
    manifest_json TEXT,
    created_at    INTEGER NOT NULL
);
```

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `workspaces.list` | read | List workspaces (filter by name pattern) |
| `workspaces.get` | read | Get workspace metadata + manifest |
| `workspaces.create` | write | Create workspace (path, optional manifest template name) |
| `workspaces.delete` | write | Delete workspace registration (does not delete files on disk) |
| `workspaces.manifest.get` | read | Get the manifest for a workspace |
| `workspaces.manifest.update` | write | Update the manifest (add/remove/modify file entries) |
| `workspaces.files.list` | read | List files in the workspace directory |
| `workspaces.files.get` | read | Read a file from the workspace |
| `workspaces.files.set` | write | Write/update a file in the workspace |
| `workspaces.files.delete` | write | Delete a file from the workspace |

---

## Domain: Automations

**Database:** `nexus.db` — `automations` table + `hook_invocations` table

### Decisions

**First-class API surface.** Automations have a full spec (MEESEEKS_PATTERN.md), full DB schema, full runtime implementation, and 5 bundled automations — but previously had zero API operations. This batch adds full CRUD + introspection.

**Hook system unification.** Four separate hook systems (automations DB, internal hooks, NEXPlugin, OpenClaw plugins) collapse into one. The `automations` table and `evaluateAutomationsAtHook()` are the only hook execution path. See [HOOK_SYSTEM_UNIFICATION.md](./HOOK_SYSTEM_UNIFICATION.md).

**19 canonical hook points.** Colon-delimited naming. Pipeline hooks (`after:acceptRequest`, etc.), broker hooks (`worker:pre_execution`), memory hooks (`episode:created`, `episode:retained`), lifecycle hooks (`runtime:startup`, etc.), command hooks (`command:new`, etc.).

**Workspace binding via `workspace_id`.** Automations with workspaces (meeseeks) bind to a registered Workspace via `workspace_id` instead of a raw `workspace_dir` path. The workspace's manifest determines what files get loaded. Non-workspace automations (loggers, simple handlers) have `workspace_id = NULL`.

**Self-improvement is workspace-driven.** When `self_improvement = 1`, the runtime chains a reflection turn after the primary task. The agent updates files in its workspace (SKILLS.md, PATTERNS.md, ERRORS.md). Because these files are in the manifest, they load automatically next time.

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `automations.list` | read | List automations (filter by status, hook_point, blocking, has_workspace) |
| `automations.get` | read | Get automation with config, triggers, invocation stats |
| `automations.create` | write | Register a new automation (script_path, hook_point, config) |
| `automations.update` | write | Update automation config, triggers, script, hook_point binding |
| `automations.enable` | write | Enable a disabled/paused automation |
| `automations.disable` | write | Disable an automation (with reason) |
| `automations.delete` | write | Delete an automation |
| `automations.invoke` | write | Manually trigger an automation (for testing/debugging) |
| `automations.invocations.list` | read | List invocations for an automation (timing, tokens, errors) |
| `automations.invocations.get` | read | Get single invocation with full telemetry |
| `automations.hookpoints.list` | read | List available hook points (pipeline, broker, memory, lifecycle, command) |

### Bundled Automations

5 automations ship with the runtime:

| Name | Hook Point | Blocking | Workspace | Description |
|------|-----------|----------|-----------|-------------|
| memory-reader | `worker:pre_execution` | yes | workspace/memory-reader | Pre-execution memory context injection |
| memory-writer | `episode:created` | no | workspace/memory-writer | Extract facts and entities from episodes |
| memory-consolidator | `episode:retained` | no | workspace/memory-consolidator | Build observations, detect causal links |
| command-logger | `command:execute` | no | (none) | Log command execution |
| boot-md | `runtime:startup` | no | (none) | Run BOOT.md on daemon start |

---

## Domain: Cron

**Database:** `nexus.db` — `cron_jobs` table (migrated from file-based JSON, hard cutover)

### Decisions

**Renamed from `clock.schedule.*` to `cron.*`.** The `clock.schedule` namespace was indirect. `cron` is clear and universally understood.

**DB-backed storage.** Cron jobs live in the `cron_jobs` table in nexus.db. The old JSON file store is dead. No migration logic — hard cutover only. The new system doesn't concern itself with the old format.

**`cron.wake` dropped.** Was "send a message to an agent immediately." This is just `chat.send` (Batch 1) with the right queue mode. Cron jobs internally use `chat.send` to deliver their payloads. No separate wake operation needed.

**`internalEvent` payload kind documented.** Cron jobs support `payload.kind = 'internalEvent'` for internal coordination (e.g., episode detection timeout timers). These emit internal events rather than sending messages to agents.

**Explicit enable/disable operations.** Rather than folding into `update`, `cron.jobs.enable` and `cron.jobs.disable` are explicit operations matching the automations pattern.

### Schema

```sql
CREATE TABLE cron_jobs (
    id                TEXT PRIMARY KEY,
    agent_id          TEXT,
    name              TEXT NOT NULL,
    description       TEXT,
    enabled           INTEGER NOT NULL DEFAULT 1,
    delete_after_run  INTEGER NOT NULL DEFAULT 0,
    created_at_ms     INTEGER NOT NULL,
    updated_at_ms     INTEGER NOT NULL,
    schedule_json     TEXT NOT NULL,        -- cron expression or interval config
    session_target    TEXT NOT NULL,        -- 'main' or 'isolated'
    wake_mode         TEXT NOT NULL,        -- 'queued' or 'now'
    payload_json      TEXT NOT NULL,        -- { kind: 'text'|'internalEvent', ... }
    delivery_json     TEXT,                 -- optional delivery context
    next_run_at_ms    INTEGER,
    running_at_ms     INTEGER,
    last_run_at_ms    INTEGER,
    last_status       TEXT,
    last_error        TEXT,
    last_duration_ms  INTEGER,
    consecutive_errors INTEGER DEFAULT 0
);
```

### Operations

| Operation | Verb | Description |
|-----------|------|-------------|
| `cron.status` | read | Service status (enabled, job count, next fire time) |
| `cron.jobs.list` | read | List cron jobs (sorted by next run time) |
| `cron.jobs.get` | read | Get a single cron job by ID |
| `cron.jobs.create` | write | Create a new cron job |
| `cron.jobs.update` | write | Update cron job (partial patch: schedule, payload, delivery, etc.) |
| `cron.jobs.delete` | write | Remove a cron job |
| `cron.jobs.enable` | write | Enable a disabled cron job |
| `cron.jobs.disable` | write | Disable a cron job |
| `cron.jobs.run` | write | Manually trigger a cron job (force or due-only) |
| `cron.jobs.runs` | read | Get execution history for a cron job |

---

## Operation Count Summary

| Domain | Operations | Notes |
|--------|-----------|-------|
| `agents.*` (CRUD + identity + wait) | 7 | New in Batch 4 |
| `agents.sessions.*` + turns + messages + queue | 17 | From Batch 1 |
| `workspaces.*` | 10 | New primitive |
| `automations.*` | 11 | Entirely new |
| `cron.*` | 10 | Renamed from clock.schedule, +3 new |
| **Total Batch 4 new** | **38** | |
| **Total including Batch 1 agents** | **55** | |

---

## Related Spec Documents

| Document | Scope |
|----------|-------|
| [API_DESIGN_DECISIONS.md](./API_DESIGN_DECISIONS.md) | Batch 1: Events, PubSub, Sessions, Chat, System |
| [WORKSPACE_PRIMITIVE.md](./WORKSPACE_PRIMITIVE.md) | Workspace schema, manifest system, persona elimination |
| [HOOK_SYSTEM_UNIFICATION.md](./HOOK_SYSTEM_UNIFICATION.md) | 4 hook systems → 1, 19 canonical hook points |
| [MEESEEKS_PATTERN.md](../../agents/MEESEEKS_PATTERN.md) | Meeseeks automation architecture (canonical spec) |
| [SESSION_LIFECYCLE.md](../../agents/SESSION_LIFECYCLE.md) | Session lifecycle, key formats, queue modes |
| [BROKER.md](../../agents/BROKER.md) | Agent broker: routing, context assembly |

---

## Naming Changes Summary

| Old Name | New Name | Reason |
|----------|----------|--------|
| `persona_id` (sessions, threads) | `workspace_id` | Persona → workspace binding |
| `workspace_path` (turns) | `working_dir` | Avoid confusion with Workspace primitive |
| `workspace_dir` (automations) | `workspace_id` | FK to workspaces table |
| `agents.files.*` | `workspaces.files.*` | Generalized to any workspace |
| `clock.schedule.*` | `cron.*` | Clearer naming |
| `episode-created` | `episode:created` | Colon-delimited consistency |
| `episode-retained` | `episode:retained` | Colon-delimited consistency |
| `nex:startup` | `runtime:startup` | Code already uses this |
