# Init Command Specification

**Status:** ALIGNED WITH WORKSPACE_SYSTEM.md  
**Last Updated:** 2026-01-29

---

## Overview

The `nexus init` command creates the base Nexus directory structure AND default configuration files. It's the first step in setting up a new Nexus workspace.

**Philosophy:** Create everything — structure AND default config. Configuration can be adjusted later via `nexus configure`.

---

## Command

```bash
nexus init [--workspace <path>]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--workspace <path>` | `~/nexus` | Override workspace location |

---

## What It Creates

### Directories

| Path | Purpose |
|------|---------|
| `~/nexus/` | Workspace root |
| `~/nexus/skills/` | User skill definitions |
| `~/nexus/skills/tools/` | CLI tool wrappers |
| `~/nexus/skills/connectors/` | Auth/credential connectors |
| `~/nexus/skills/guides/` | Pure documentation skills |
| `~/nexus/state/` | Runtime state |
| `~/nexus/state/agents/` | Agent identity files |
| `~/nexus/state/user/` | User profile |
| `~/nexus/state/cortex/` | Derived data (per-agent) |
| `~/nexus/state/credentials/` | Credential pointers |
| `~/nexus/state/gateway/` | Gateway configuration |
| `~/nexus/home/` | User's personal space |

### Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | System behavior documentation |
| `state/agents/BOOTSTRAP.md` | First-run ritual template |
| `state/agents/config.json` | Agent defaults config |
| `state/credentials/config.json` | Credential system config |
| `state/gateway/config.json` | Gateway config |

---

## What It Does NOT Create

| Item | Reason |
|------|--------|
| Git repository | User preference (removed from default) |
| `.gitignore` | No git by default |
| `projects/` directory | User creates as needed |
| Agent identity files | Created during bootstrap conversation |
| User identity file | Created during bootstrap conversation |
| Access plane configs | Created during `nexus onboard` or `nexus setup` |
| `HEARTBEAT.md` | Optional, user creates if wanted |

---

## Behavior

### Idempotent

Safe to run multiple times:
- Creates directories only if they don't exist
- Does not overwrite existing files
- Reports what was created vs already present

### Default Config Content

**`state/agents/config.json`:**
```json
{
  "defaults": {
    "model": "claude-sonnet-4-20250514"
  }
}
```

**`state/credentials/config.json`:**
```json
{
  "defaultStorage": "keychain",
  "syncOnStatus": true,
  "syncTtlMinutes": 15,
  "rotation": {
    "enabled": ["anthropic", "openai", "gemini", "openrouter", "groq"]
  }
}
```

**`state/gateway/config.json`:**
```json
{
  "port": 18789,
  "bind": "loopback",
  "auth": {
    "mode": "token"
  },
  "credentials": {
    "level": 1,
    "blocked": []
  }
}
```

### Bootstrap Flow

After init, when the user opens `~/nexus/` in their agent harness (Cursor, Claude Code, etc.), the agent reads `AGENTS.md`, detects no identity exists, reads `BOOTSTRAP.md`, and starts the bootstrap conversation.

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (or already initialized) |
| 1 | Error (permissions, disk space, etc.) |

---

## Comparison with Upstream

| Aspect | Upstream (clawdbot) | Nexus |
|--------|---------------------|-------|
| Command | `clawdbot init` (implied by first run) | `nexus init` (explicit) |
| Git init | ✅ Creates repo | ❌ Removed |
| .gitignore | ✅ Created | ❌ Removed |
| Config files | Created immediately | ✅ Created immediately (split by domain) |
| Onboarding | Immediate full wizard | Agent-driven bootstrap conversation |

---

## Implementation Notes

### Branding Script Coverage

Init command affected by branding (WI-1):

| Original | Branded |
|----------|---------|
| `~/clawd/` | `~/nexus/home/` |
| `~/.clawdbot/` | `~/nexus/state/` |
| `CLAWDBOT_*` env vars | `NEXUS_*` |

### Source Files

From upstream to port:
- `src/commands/init.ts` — main logic (minus git setup)
- CLI registration in `src/cli/program.ts`

---

## Example Output

```
$ nexus init

Creating Nexus workspace at ~/nexus...

✓ Created ~/nexus/
✓ Created ~/nexus/AGENTS.md
✓ Created ~/nexus/skills/tools/
✓ Created ~/nexus/skills/connectors/
✓ Created ~/nexus/skills/guides/
✓ Created ~/nexus/state/
✓ Created ~/nexus/state/agents/
✓ Created ~/nexus/state/agents/BOOTSTRAP.md
✓ Created ~/nexus/state/agents/config.json
✓ Created ~/nexus/state/user/
✓ Created ~/nexus/state/cortex/
✓ Created ~/nexus/state/credentials/
✓ Created ~/nexus/state/credentials/config.json
✓ Created ~/nexus/state/gateway/
✓ Created ~/nexus/state/gateway/config.json
✓ Created ~/nexus/home/

Nexus initialized! Open ~/nexus/ in your AI assistant to begin.
```

---

## Related Specifications

- **PROJECT_STRUCTURE.md** — Directory layout details
- **ONBOARDING.md** — Identity ritual flow (after init completes, see ONBOARDING.md for the agent-driven bootstrap conversation)
- **BOOTSTRAP_FILES.md** — File templates and purposes
- **specs/runtime/nex/automations/AUTOMATION_SYSTEM.md** — Automation system
- **specs/runtime/nex/PLUGINS.md** — NEX plugin system
