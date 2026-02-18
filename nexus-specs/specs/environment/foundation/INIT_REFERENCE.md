# Init Command Specification

**Canonical lifecycle spec:** `specs/environment/foundation/WORKSPACE_LIFECYCLE.md`

**Status:** ALIGNED WITH `WORKSPACE_LIFECYCLE.md`
**Last Updated:** 2026-02-17

---

## Overview

`nexus init` creates the baseline Nexus workspace structure: directories, databases, bootstrap documents, and config. After init, the workspace is a complete artifact on disk — the runtime can boot cleanly from it without manual patching.

---

## Command

```bash
nexus init [--workspace <path>]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--workspace <path>` | `~/nexus` | Override target workspace root |

---

## What It Creates

```
{workspace_root}/
├── AGENTS.md                          # Workspace behavior contract (template)
├── skills/                            # Flat skills directory (metadata tracks type)
├── home/                              # User personal workspace
└── state/
    ├── data/
    │   ├── events.db                  # Events ledger (empty, schema applied)
    │   ├── agents.db                  # Agents ledger (empty, schema applied)
    │   ├── identity.db                # Identity mappings (empty, schema applied)
    │   └── nexus.db                   # Request traces + automations table (empty, schema applied)
    ├── cortex/
    │   └── cortex.db                  # Cortex memory store (empty, schema applied)
    ├── agents/
    │   └── BOOTSTRAP.md               # Permanent onboarding conversation template (NEVER deleted)
    ├── user/                          # Empty — populated during onboarding
    ├── credentials/                   # Empty — populated during credential sync/scan
    ├── workspace/                     # Empty — automation workspaces created at runtime
    └── config.json                    # Seed config with generated auth token
```

### Directories

| Path | Purpose |
|------|---------|
| `skills/` | Flat skills directory — no subdirectories. Internal metadata on each skill tracks its type (tool, connector, guide). |
| `state/data/` | Ledger databases |
| `state/cortex/` | Cortex memory database |
| `state/agents/` | Agent bootstrap template; agent persona subdirectories created during onboarding |
| `state/user/` | User identity files (created during onboarding) |
| `state/credentials/` | Credential pointers/index (populated during credential sync/scan) |
| `state/workspace/` | Automation workspaces for meeseeks-pattern automations (created at runtime startup) |
| `home/` | User personal workspace |

### Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Workspace behavior contract (template) |
| `state/agents/BOOTSTRAP.md` | Permanent onboarding conversation template — never deleted, reusable for creating additional agent personas |
| `state/config.json` | Standalone seed config with generated auth token |

### Databases

All databases are created eagerly by init with their current schema applied. The runtime owns schema migrations for subsequent versions, but init ensures the files exist from the start.

| Database | Location | Purpose |
|----------|----------|---------|
| `events.db` | `state/data/events.db` | Events ledger |
| `agents.db` | `state/data/agents.db` | Agents ledger |
| `identity.db` | `state/data/identity.db` | Identity mappings |
| `nexus.db` | `state/data/nexus.db` | Request traces + automations table |
| `cortex.db` | `state/cortex/cortex.db` | Cortex memory store |

---

## Default Config

`state/config.json` is a standalone file (not nested under `state/nexus/`).

```json
{
  "runtime": {
    "port": 18789,
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "<generated-hex-token>"
    }
  }
}
```

The auth token is generated during init via:

```typescript
crypto.randomBytes(24).toString('hex')
```

---

## Design Decisions

**DBs are created eagerly.** Init owns the workspace shape. Creating databases at init time (rather than lazily at runtime) means the workspace is a complete artifact on disk immediately.

**Auth token is generated at init.** Setting `auth.mode: "token"` without a token would create a workspace that cannot boot an authenticated runtime without manual intervention. Init generates the token and writes it into config.

**No `runtime.mode` field.** "Local" vs "remote" is a deployment concern, not a config value. The runtime infers local mode from `bind: "loopback"`.

**`skills/` is flat.** No `tools/`, `connectors/`, `guides/` subdirectories. Internal metadata on each skill tracks its type. This follows the agent skills standard.

**`BOOTSTRAP.md` is permanent.** It is never deleted after onboarding. It serves as a reusable template for creating new agent personas at any time. Bootstrap detection uses a different signal — the absence of agent persona subdirectories in `state/agents/`.

**`state/workspace/` is for automation workspaces.** Not for agent persona files. Meeseeks-pattern automations (memory-reader, memory-writer, etc.) get their own subdirectory here at runtime startup. Agent personas go in `state/agents/{name}/` with `IDENTITY.md` and `SOUL.md`.

**`config.json` is standalone.** Located at `state/config.json`, not nested under `state/nexus/`.

---

## Behavior

### Idempotency

`nexus init` is safe to run repeatedly:
- Creates missing directories and files
- Does not overwrite existing user/authored files
- Does not recreate DB files if they already exist

### Post-Init State

After init completes, the workspace is ready for `nexus start` with no manual config patching:

```bash
nexus init --workspace /tmp/test-workspace
nexus start --workspace /tmp/test-workspace
# Token is in config.json. Port is in config.json. DBs exist. No patching needed.
```

---

## Bootstrap Transition

After init, onboarding begins when the user opens the workspace and sends the first message.

The system detects first-run state by checking whether `state/agents/` contains any subdirectories (agent persona directories). If none exist, the `BOOTSTRAP.md` template is injected into the context to drive the onboarding conversation.

Onboarding creates:
- `state/agents/{name}/IDENTITY.md` — agent identity
- `state/agents/{name}/SOUL.md` — agent persona, boundaries, values
- `state/user/IDENTITY.md` — user profile and preferences

See `WORKSPACE_LIFECYCLE.md` Phase 3 for the full onboarding flow.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Failure |

---

## E2E Assertions (After Init)

- Directory structure matches the tree above
- `state/config.json` exists with `runtime.port`, `runtime.bind: "loopback"`, `runtime.auth.mode: "token"`, `runtime.auth.token` (non-empty string)
- All 5 DB files exist: `events.db`, `agents.db`, `identity.db`, `nexus.db`, `cortex.db`
- `state/agents/BOOTSTRAP.md` exists and is non-empty
- `AGENTS.md` exists at workspace root
- `skills/` directory exists (flat, no subdirectories)
- `state/workspace/` directory exists (empty)
- `state/user/` directory exists (empty)
- `state/credentials/` directory exists (empty)

---

## Related Specifications

- `WORKSPACE_LIFECYCLE.md` — Canonical lifecycle spec (init, runtime boot, onboarding, automations)
- `WORKSPACE_SYSTEM.md` — Workspace layout reference
- `BOOTSTRAP_FILES_REFERENCE.md` — Bootstrap file catalog
- `BOOTSTRAP_ONBOARDING.md` — Onboarding flow details
