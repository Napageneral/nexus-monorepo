# Workspace System Specification

**Status:** AUTHORITATIVE
**Last Updated:** 2026-02-17

**Canonical lifecycle spec:** `specs/environment/foundation/WORKSPACE_LIFECYCLE.md`

---

## Overview

This is the canonical workspace contract for Nexus.

All subordinate environment specs must align with this document:
- `INIT_REFERENCE.md`
- `WORKSPACE_LAYOUT_REFERENCE.md`
- `BOOTSTRAP_FILES_REFERENCE.md`
- `BOOTSTRAP_ONBOARDING.md`

This contract is **big-bang**:
- no backward compatibility requirements
- no legacy aliases as a spec obligation

---

## Contract Summary

| Area | Canonical Contract |
|------|--------------------|
| State data | Split ledger DBs in `state/data/*.db` |
| Cortex | Shared DB at `state/cortex/cortex.db` |
| Config | Single file at `state/config.json` |
| CLI boundary | `nexus status` for orientation, `nexus runtime ...` for control-plane |
| Terminology | Use `runtime` / `control-plane`; do not use `gateway` as canonical product term |

---

## Workspace Lifecycle

### Phase 1: `nexus init`

`nexus init` creates directory structure, databases, bootstrap files, and a seed config with a generated auth token. All DBs are created eagerly with current schemas applied. Init is idempotent.

### Phase 2: Agent bootstrap conversation

When the user opens `~/nexus/` in an agent harness, the agent reads:
- `AGENTS.md`
- `state/agents/BOOTSTRAP.md`

If no agent identity exists (no subdirectories in `state/agents/`), the agent runs the bootstrap conversation and writes identity files. `BOOTSTRAP.md` is permanent and never deleted -- it serves as a reusable template for creating new agent personas at any time.

### Phase 3: Silent detection and setup

After identity is established, the agent can run capability discovery:
- credential scan/import
- harness detection
- optional follow-up setup (skills, cloud, channels)

### Phase 4: Runtime operation

The runtime/control-plane serves health, automation, hooks, channel delivery, and agent execution operations. Runtime controls live under `nexus runtime ...`.

---

## Canonical Layout

```text
{workspace_root}/
├── AGENTS.md                          # Workspace behavior contract
├── skills/                            # Flat skills dir (metadata tracks type internally)
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
    │   ├── BOOTSTRAP.md               # Permanent onboarding template
    │   └── {name}/                    # Agent persona directories
    │       ├── IDENTITY.md
    │       └── SOUL.md
    ├── user/
    │   └── IDENTITY.md                # User profile
    ├── credentials/                   # Credential index + pointers
    ├── workspace/                     # Automation workspaces (meeseeks pattern)
    │   ├── memory-reader/             # Memory reader meeseeks workspace
    │   └── memory-writer/             # Memory writer meeseeks workspace
    └── config.json                    # Runtime config with auth token
```

Optional workspace-local harness artifacts may exist (for example `.cursor/`, `.claude/`, `.opencode/`) when bindings are enabled.

---

## Directory Concepts

Two directory structures serve different purposes. They are hierarchical -- personas sit above workspaces.

### Agent Personas (`state/agents/{name}/`)

Agent personas define **who the agent is**. Identity, personality, values, boundaries.

```
state/agents/
├── BOOTSTRAP.md                       # Permanent onboarding template
└── echo/                              # Agent persona "Echo"
    ├── IDENTITY.md                    # Who I am, what I do
    └── SOUL.md                        # Personality, boundaries, values
```

- Created during onboarding conversation
- One directory per named agent persona (Echo, Atlas, etc.)
- Applied as the "who am I" layer during context assembly
- Read into the system prompt as `## Agent Identity` and `## Agent Soul`

### Automation Workspaces (`state/workspace/{name}/`)

Automation workspaces are **accumulated knowledge stores** for a specific function or role. They are the working directories for meeseeks-pattern automations.

```
state/workspace/
├── memory-reader/                     # Memory search specialist
│   ├── ROLE.md                        # Role instructions
│   ├── SKILLS.md                      # Accumulated skills (self-improving)
│   ├── PATTERNS.md                    # Common patterns (self-improving)
│   ├── ERRORS.md                      # Known failure modes (self-improving)
│   └── skills/                        # Skill files, scripts, schemas
└── memory-writer/                     # Memory extraction specialist
    └── ...
```

- Created by the automation seeder at runtime startup
- One directory per automation that has `workspace_dir` set
- NOT for agent persona files -- persona files live in `state/agents/`

### The Relationship

Personas are hierarchical ABOVE workspaces. Echo (a persona) might be the identity applied to a memory-reader meeseeks execution. The persona says "who I am," the workspace says "what I know about this job."

```
Agent Persona (state/agents/echo/)
  = "I am Echo, a helpful assistant who values precision"

Automation Workspace (state/workspace/memory-reader/)
  = "I know how to search cortex, these queries work well, these patterns fail"

During execution:
  system_prompt = persona.IDENTITY + persona.SOUL + workspace.ROLE + workspace.SKILLS
```

---

## Data Layer Integration

### System of Record: `state/data/*.db`

The System of Record is split into ledger databases:
- `events.db` for inbound/outbound event records
- `agents.db` for sessions, turns, tool calls, and agent interaction state
- `identity.db` for entities, aliases, membership, and identity graph operations
- `nexus.db` for runtime traces, control-plane metadata, and nexus-level runtime data (includes automations table)

All DBs are created eagerly by `nexus init` with current schemas applied.

### Derived Layer: `state/cortex/cortex.db`

Cortex is a shared derived store across all agents.

It captures artifacts like:
- episodes
- facets
- embeddings
- analyses

Per-agent Cortex DB files are not canonical.

---

## Init Contract

### Command

```bash
nexus init [--workspace <path>]
```

### Required directories

- `{workspace_root}/skills/`
- `{workspace_root}/state/data/`
- `{workspace_root}/state/cortex/`
- `{workspace_root}/state/agents/`
- `{workspace_root}/state/user/`
- `{workspace_root}/state/credentials/`
- `{workspace_root}/state/workspace/`
- `{workspace_root}/home/`

### Required files

- `{workspace_root}/AGENTS.md`
- `{workspace_root}/state/agents/BOOTSTRAP.md`
- `{workspace_root}/state/config.json`
- `{workspace_root}/state/data/events.db` (with schema applied)
- `{workspace_root}/state/data/agents.db` (with schema applied)
- `{workspace_root}/state/data/identity.db` (with schema applied)
- `{workspace_root}/state/data/nexus.db` (with schema applied)
- `{workspace_root}/state/cortex/cortex.db` (with schema applied)

### Config shape

`state/config.json` is a single namespaced document. Core domains:
- `agent`
- `credentials`
- `runtime`
- `hooks`
- `automation`
- `acl`
- `channels`
- `cortex`

There is no `runtime.mode` field. Local vs remote is a deployment concern -- the runtime infers local mode from `bind: loopback`.

### Idempotency

`nexus init` must be safe to run repeatedly:
- create missing paths and files
- do not overwrite existing user data unless explicitly requested
- do not recreate DB files that already exist

---

## Onboarding Contract

Onboarding is an agent conversation, not a CLI questionnaire.

The conversation must establish:
- agent identity (`state/agents/{name}/IDENTITY.md`)
- agent behavior (`state/agents/{name}/SOUL.md`)
- user profile (`state/user/IDENTITY.md`)

Agent directory naming comes from the conversation outcome, normalized to filesystem-safe format.

`BOOTSTRAP.md` is permanent. It is never deleted after onboarding. It serves as the reusable template for creating new agent personas at any time.

---

## Runtime / Control-Plane Contract

### Grammar boundary

- `nexus status`: orientation and capability summary
- `nexus runtime ...`: runtime/control-plane operations

### Canonical runtime surfaces

Runtime command surfaces include:
- process/service control
- health/status/probe
- method invocation and message routing controls
- event wake and operational diagnostics

`gateway` naming is non-canonical in the spec contract.

---

## Relationship to Other Specs

| Spec | Role |
|------|------|
| `WORKSPACE_LIFECYCLE.md` | Full lifecycle from init through operational state |
| `INIT_REFERENCE.md` | Init behavior and file creation details |
| `WORKSPACE_LAYOUT_REFERENCE.md` | Directory and file path reference |
| `BOOTSTRAP_FILES_REFERENCE.md` | Template/file inventory |
| `BOOTSTRAP_ONBOARDING.md` | Conversation flow contract |
| `RUNTIME_REALIGNMENT_DECISIONS.md` | Locked architectural decisions |

---

## Acceptance Checklist

This spec is considered aligned when all are true:
- subordinate foundation docs point to `state/config.json` only (not `state/nexus/config.json`)
- subordinate foundation docs describe split ledgers under `state/data/*.db`
- subordinate foundation docs describe shared `state/cortex/cortex.db`
- foundation docs use runtime/control-plane terminology instead of gateway terminology
- `skills/` is described as flat (no `tools/`, `connectors/`, `guides/` subdirectories)
- DBs are described as eagerly created by init (not lazily created at runtime)
- `BOOTSTRAP.md` is described as permanent (never deleted)
- `state/workspace/` is described as automation workspaces only (not agent persona files)
- agent personas (`state/agents/{name}/`) and automation workspaces (`state/workspace/{name}/`) are clearly distinguished
