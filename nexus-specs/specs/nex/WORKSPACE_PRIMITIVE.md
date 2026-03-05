# Workspace Primitive

**Status:** DESIGN
**Last Updated:** 2026-03-03

---

## Overview

A **Workspace** is a registered, managed directory on disk with structured files that get loaded into agent context via a manifest. Workspaces provide the identity, knowledge, and behavioral configuration for agents and automations.

Workspaces replace three previously separate concepts:
- **Agent config root** (`state/agents/{name}/` — SOUL.md, IDENTITY.md, etc.)
- **Automation workspace** (`state/workspace/{name}/` — ROLE.md, SKILLS.md, etc.)
- **Persona** (logical identity binding — now just "which workspace does this session use?")

The **turn-level working directory** (`working_dir`, previously `workspace_path` on the turns table) is NOT a Workspace. It's just the CWD for the agent's tools during execution (e.g., `/Users/tyler/project-a`). Different concept, different lifecycle.

---

## Schema

```sql
CREATE TABLE workspaces (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    path          TEXT NOT NULL,           -- absolute path on disk
    manifest_json TEXT,                    -- maps files to injection behavior
    created_at    INTEGER NOT NULL
);
```

Deliberately minimal:
- **No `kind`** — the manifest determines behavior, not a type discriminator. An "agent workspace" and an "automation workspace" are the same primitive with different manifests.
- **No `owner_type` / `owner_id`** — agents and automations point TO workspaces, not the other way around. To find all workspaces used by automations, query the automations table.
- **No `updated_at`** — the workspace row is stable metadata. Files inside the workspace change frequently but the workspace registration itself doesn't.

---

## The Manifest

The manifest maps filenames in the workspace directory to how they get injected into context when an agent uses that workspace.

```json
{
  "SOUL.md": { "inject": "system_prompt", "required": true },
  "IDENTITY.md": { "inject": "system_prompt", "required": true },
  "ROLE.md": { "inject": "turn_message", "required": false },
  "SKILLS.md": { "inject": "turn_message", "required": false },
  "PATTERNS.md": { "inject": "turn_message", "required": false },
  "ERRORS.md": { "inject": "turn_message", "required": false }
}
```

### Injection Levels

| Level | When | How |
|---|---|---|
| `system_prompt` | Assembled once when building context | Concatenated into the system prompt. Cached across turns. Stable identity content. |
| `turn_message` | Loaded fresh each turn | Injected as message-level context. Reflects latest state. Ideal for evolving knowledge. |

### Rules

- Only files listed in the manifest get loaded into context.
- The workspace directory can contain any number of files — research notes, scripts, data, logs — but only manifest entries are injected.
- `required: true` means the runtime warns (or errors) if the file is missing.
- `required: false` means the file is loaded if present, silently skipped if absent.
- Agents can update their own workspace's manifest — adding files, removing entries, changing injection levels. This is how meeseeks self-improvement works: the agent writes a new SKILLS.md, and it's already in the manifest, so it loads next time.

### Common Manifest Templates

These are sugar for workspace creation, defined outside the model. When creating a workspace, you can optionally pass a template name to pre-populate the manifest.

**`agent_default`:**
```json
{
  "SOUL.md": { "inject": "system_prompt", "required": true },
  "IDENTITY.md": { "inject": "system_prompt", "required": true }
}
```

**`automation_default`:**
```json
{
  "ROLE.md": { "inject": "turn_message", "required": true },
  "SKILLS.md": { "inject": "turn_message", "required": false },
  "PATTERNS.md": { "inject": "turn_message", "required": false },
  "ERRORS.md": { "inject": "turn_message", "required": false }
}
```

Templates are convenience — the workspace doesn't track which template was used. Once created, the manifest is fully mutable by the owning agent.

---

## How Agents and Automations Bind

### Agents

Each agent has a `workspace_id` pointing to their workspace:

```sql
-- On the agents table (or equivalent agent registration)
workspace_id TEXT REFERENCES workspaces(id)
```

When a session is created for an agent, it inherits the agent's workspace. The session's `workspace_id` determines what gets loaded into context.

### Automations

Each automation has a `workspace_id`:

```sql
-- On the automations table
workspace_id TEXT REFERENCES workspaces(id)
```

When a meeseeks automation is dispatched, its session binds to this workspace. The manifest determines what files get loaded as the meeseeks' identity and knowledge.

### Sessions

Sessions bind to workspaces:

```sql
-- On the sessions table (replaces persona_id)
workspace_id TEXT REFERENCES workspaces(id)
```

This replaces `persona_id`. The workspace IS the persona — it contains the identity files (SOUL.md, IDENTITY.md) that define who the agent is in this session.

### Threads

Threads also track workspace for context assembly:

```sql
-- On the threads table (replaces persona_id)
workspace_id TEXT REFERENCES workspaces(id)
```

---

## Persona Concept Elimination

The "persona" was previously a logical concept that resolved through several layers:

```
persona_id → persona_ref (folder name) → persona_path (absolute path) → load files
```

This collapses to:

```
workspace_id → workspaces.path → load files per manifest
```

One hop. The workspace IS the identity. No separate persona resolution.

**Migration:** `persona_id` columns on sessions and threads become `workspace_id`. The DB column rename is a hard cutover — no migration logic.

---

## Working Directory Rename

The `workspace_path` column on the `turns` table is renamed to `working_dir`. This is the CWD for agent tool execution during a turn — completely separate from the Workspace primitive.

| Concept | Old Name | New Name | What It Is |
|---|---|---|---|
| Agent identity/knowledge directory | persona_id / workspace_dir | `workspace_id` → workspaces table | Registered, managed, manifest-driven |
| Agent tool execution CWD | workspace_path (on turns) | `working_dir` (on turns) | Just a path string, not a managed primitive |

---

## Operations

Workspace operations live under `workspaces.*`:

| Operation | Verb | Description |
|---|---|---|
| `workspaces.list` | read | List workspaces (filter by name pattern) |
| `workspaces.get` | read | Get workspace metadata + manifest |
| `workspaces.create` | write | Create workspace (path, optional manifest template) |
| `workspaces.delete` | write | Delete workspace registration (does not delete files on disk) |
| `workspaces.manifest.get` | read | Get the manifest for a workspace |
| `workspaces.manifest.update` | write | Update the manifest (add/remove/modify file entries) |
| `workspaces.files.list` | read | List files in the workspace directory |
| `workspaces.files.get` | read | Read a file from the workspace |
| `workspaces.files.set` | write | Write/update a file in the workspace |
| `workspaces.files.delete` | write | Delete a file from the workspace |

The files operations are what `agents.files.*` (now `agents.workspace.*` in the taxonomy) used to be, but generalized to work on any workspace — agent or automation.

---

## Design Decisions

### Why no `kind` field?

The manifest determines behavior. An "agent workspace" has SOUL.md + IDENTITY.md in its manifest. An "automation workspace" has ROLE.md + SKILLS.md. But the underlying primitive is identical. A workspace could have both SOUL.md and ROLE.md if needed — the manifest is flexible.

If you need to find "all agent workspaces," query `SELECT w.* FROM workspaces w JOIN agents a ON a.workspace_id = w.id`. The relationship comes from who points to the workspace, not from a type field on the workspace itself.

### Why no owner tracking?

Ownership is implicit in the FK relationship. Agents own their workspace via `agents.workspace_id`. Automations own theirs via `automations.workspace_id`. A workspace with no references is orphaned (queryable via LEFT JOIN).

This also enables sharing: two automations could point to the same workspace if they need the same identity/knowledge. No ownership conflict — it's just a shared resource.

### Why manifest on the workspace, not on the binding?

The manifest is an intrinsic property of the workspace — "this workspace provides these files for context injection." If two agents share a workspace, they get the same manifest, which is correct because they're sharing the same identity.

If you need different injection behavior for the same files, create a separate workspace with a different manifest pointing to the same path (or a different path with symlinks). This is an edge case that doesn't justify complicating the common case.

### Why no `updated_at`?

The workspace registration row changes rarely (name change, path change, manifest update). The files inside change frequently but that's filesystem state, not DB state. Adding `updated_at` would require updating it every time the manifest changes, which is low-value bookkeeping. The `created_at` tells you when it was registered. File modification times tell you when contents changed.
