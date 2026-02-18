# Workspace Layout Reference

**Canonical lifecycle spec:** `specs/environment/foundation/WORKSPACE_LIFECYCLE.md`

**Status:** CANONICAL
**Last Updated:** 2026-02-17

---

## Root Layout

```text
{workspace_root}/
├── AGENTS.md                          # Workspace behavior contract
├── skills/                            # Flat skills directory (no subdirs)
├── home/                              # User personal workspace
└── state/
    ├── data/
    │   ├── events.db                  # Events ledger
    │   ├── agents.db                  # Agents ledger
    │   ├── identity.db                # Identity mappings
    │   └── nexus.db                   # Request traces + automations table
    ├── cortex/
    │   └── cortex.db                  # Cortex memory store
    ├── agents/
    │   ├── BOOTSTRAP.md               # Permanent onboarding template (NEVER deleted)
    │   └── {name}/                    # Agent persona directories
    │       ├── IDENTITY.md            # Agent identity
    │       └── SOUL.md                # Agent persona, values, boundaries
    ├── user/
    │   └── IDENTITY.md                # User profile and preferences
    ├── credentials/                   # Credential index + storage pointers
    ├── workspace/                     # Automation workspaces (meeseeks pattern)
    │   └── {name}/                    # Accumulated knowledge per workspace
    │       ├── ROLE.md                # Workspace role definition
    │       ├── SKILLS.md              # Workspace skill manifest
    │       ├── PATTERNS.md            # Learned patterns
    │       ├── ERRORS.md              # Known failure modes
    │       └── skills/               # Workspace-specific skills
    └── config.json                    # Runtime config with generated auth token
```

---

## Key Directories

### `{workspace_root}/`

Workspace root. Contains only `AGENTS.md`, `skills/`, `home/`, and `state/`.

### `skills/`

Flat directory of skill definitions. Skill type is tracked in metadata, not directory structure. No `tools/`, `connectors/`, or `guides/` subdirectories.

### `home/`

User personal workspace and primary sync surface.

### `state/`

All runtime state, visible and inspectable.

| Path | Purpose |
|------|---------|
| `state/data/` | Split system-of-record ledger DBs (created eagerly by init) |
| `state/cortex/` | Cortex memory store |
| `state/agents/` | Agent bootstrap template + per-agent persona directories |
| `state/user/` | User identity and preferences |
| `state/credentials/` | Credential index and storage pointers |
| `state/workspace/` | Automation workspaces with accumulated knowledge |
| `state/config.json` | Standalone runtime config |

---

## Agents vs Workspaces

Agent persona directories (`state/agents/{name}/`) and automation workspaces (`state/workspace/{name}/`) are hierarchical: a persona is applied ON TOP of a workspace. They serve distinct purposes:

- **`state/agents/{name}/`** -- Identity. Who the agent is (IDENTITY.md, SOUL.md).
- **`state/workspace/{name}/`** -- Knowledge. What the workspace has learned (ROLE.md, SKILLS.md, PATTERNS.md, ERRORS.md, skills/).

---

## File Locations Reference

| Data | Canonical Location |
|------|--------------------|
| Workspace behavior contract | `AGENTS.md` |
| Runtime config | `state/config.json` |
| User profile | `state/user/IDENTITY.md` |
| Agent bootstrap template | `state/agents/BOOTSTRAP.md` |
| Agent identity | `state/agents/{name}/IDENTITY.md` |
| Agent persona | `state/agents/{name}/SOUL.md` |
| Events ledger | `state/data/events.db` |
| Agents ledger | `state/data/agents.db` |
| Identity mappings | `state/data/identity.db` |
| Request traces + automations | `state/data/nexus.db` |
| Cortex memory store | `state/cortex/cortex.db` |
| Credential storage | `state/credentials/` |
| Workspace role | `state/workspace/{name}/ROLE.md` |
| Workspace skills | `state/workspace/{name}/SKILLS.md` |
| Workspace patterns | `state/workspace/{name}/PATTERNS.md` |
| Workspace errors | `state/workspace/{name}/ERRORS.md` |

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXUS_ROOT` | Workspace root | `~/nexus` |
| `NEXUS_STATE_DIR` | State directory | `{root}/state` |
| `NEXUS_HOME` | User home directory | `{root}/home` |
| `NEXUS_CONFIG_PATH` | Config file override | `{root}/state/config.json` |
| `NEXUS_PROFILE` | Named profile | unset |

---

## Design Decisions

- **DBs created eagerly** -- All ledger databases under `state/data/` are created by `nexus init`, not lazily on first use.
- **Flat skills directory** -- `skills/` has no subdirectories. Skill type (tool, connector, guide) is tracked in metadata.
- **Standalone config** -- `state/config.json` is a standalone file, not nested under a `nexus/` subdirectory.
- **BOOTSTRAP.md is permanent** -- `state/agents/BOOTSTRAP.md` is the onboarding template and is NEVER deleted.
- **Visible state** -- `state/` is a visible system directory for transparency and inspectability.
- **Split ledgers** -- Separate databases isolate write paths and reduce contention.
- **No TOOLS.md** -- Tool discovery is handled through skills metadata, not a manifest file.
- **No runtime.mode** -- Config does not include a `runtime.mode` field.

---

See `WORKSPACE_LIFECYCLE.md` for creation behavior and lifecycle semantics.
