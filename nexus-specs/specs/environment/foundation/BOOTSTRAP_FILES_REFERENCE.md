# Bootstrap Files Reference

**Canonical lifecycle spec:** `specs/environment/foundation/WORKSPACE_LIFECYCLE.md`

**Status:** Quick-reference catalog for workspace file inventory
**Last Updated:** 2026-02-17

---

## Overview

This document catalogs every file and directory in a Nexus workspace, organized by **which phase creates it**. Use this as a checklist when writing or debugging E2E harness assertions.

Three phases create files:

1. **`nexus init`** -- deterministic, no user input
2. **Runtime startup** -- seeds automation workspaces and DB rows
3. **Onboarding conversation** -- interactive, produces identity artifacts

---

## Phase 1: `nexus init`

Init is fully deterministic. Everything below is created eagerly (no lazy creation).

### Root-level

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Workspace behavior contract, read by all agents |
| `skills/` | Flat directory for user-authored skills (empty at init) |
| `home/` | User home directory (empty at init) |

### `state/data/` -- databases (eager, with schema)

| Path | Purpose |
|------|---------|
| `state/data/events.db` | Event log |
| `state/data/agents.db` | Agent registry |
| `state/data/identity.db` | Identity data |
| `state/data/nexus.db` | Core nexus data |

### `state/cortex/` -- memory database (eager, with schema)

| Path | Purpose |
|------|---------|
| `state/cortex/cortex.db` | Derived memory / cortex store |

### `state/agents/` -- bootstrap template

| Path | Purpose |
|------|---------|
| `state/agents/BOOTSTRAP.md` | Permanent first-run identity conversation template (never deleted) |

### `state/` -- config and empty directories

| Path | Purpose |
|------|---------|
| `state/config.json` | Canonical config with generated auth token |
| `state/user/` | Empty dir; populated during onboarding |
| `state/credentials/` | Empty dir; populated by credential flows |
| `state/workspace/` | Empty dir; populated by runtime startup for automation workspaces only |

---

## Phase 2: Runtime Startup

Runtime seeds automation workspaces inside `state/workspace/` and inserts automation table rows. This happens every time the runtime boots (idempotently).

### Automation workspaces

Each automation workspace gets the same internal structure:

```
state/workspace/{automation-name}/
  ROLE.md
  SKILLS.md
  PATTERNS.md
  ERRORS.md
  skills/
```

Seeded automations:

| Workspace | Path |
|-----------|------|
| memory-reader | `state/workspace/memory-reader/` |
| memory-writer | `state/workspace/memory-writer/` |

### Database rows (automations table)

| Row | Purpose |
|-----|---------|
| `memory-reader` | Reads and surfaces relevant memory |
| `memory-writer` | Writes new memories to cortex |
| `command-logger` | Logs commands/events |
| `boot-md` | Boot-time markdown generation |

### Cortex seed

| Row | Purpose |
|-----|---------|
| Owner entity placeholder | Seed entry in cortex for the workspace owner |

---

## Phase 3: Onboarding Conversation

Created interactively during the bootstrap conversation (driven by `BOOTSTRAP.md`). The `{name}` segment is derived from conversation output and normalized for filesystem safety.

| Path | Purpose |
|------|---------|
| `state/agents/{name}/IDENTITY.md` | Agent identity markers |
| `state/agents/{name}/SOUL.md` | Agent behavior and persona boundaries |
| `state/user/IDENTITY.md` | User profile and preferences |

---

## What Does NOT Exist

These are common misconceptions. None of these paths are valid in a Nexus workspace:

| Invalid path | Clarification |
|--------------|---------------|
| `TOOLS.md` | No TOOLS.md anywhere in Nexus |
| `state/workspace/IDENTITY.md` | Identity files live in `state/agents/{name}/`, not workspace |
| `state/workspace/USER.md` | User files live in `state/user/`, not workspace |
| `state/nexus/config.json` | Config is at `state/config.json`, not `state/nexus/` |
| Any lazily-created DB | All databases are created eagerly by init with schema applied |

---

## Notes for E2E Harness Authors

- **BOOTSTRAP.md is permanent.** It is never deleted after onboarding. Assertions should expect it to exist at all times.
- **`state/workspace/` is exclusively for automation workspaces.** No agent identity or user files belong here.
- **All databases exist after init.** Do not wait for runtime to assert DB file existence; assert immediately after init.
- **`state/config.json` contains a generated auth token.** Validate it exists and has a non-empty `auth` field (or equivalent).
- **Phase ordering matters.** Init must complete before runtime startup. Runtime startup must complete before onboarding assertions on automation workspaces.

---

## Frontmatter Convention

Identity files may use YAML frontmatter for machine-readable fields:

```markdown
---
name: Atlas
emoji: "..."
vibe: "direct, pragmatic"
---
```

---

## Related Specifications

- `WORKSPACE_LIFECYCLE.md` -- canonical lifecycle phases
- `INIT_REFERENCE.md` -- init implementation details
- `BOOTSTRAP_ONBOARDING.md` -- onboarding conversation flow
- `WORKSPACE_LAYOUT_REFERENCE.md` -- directory structure reference
