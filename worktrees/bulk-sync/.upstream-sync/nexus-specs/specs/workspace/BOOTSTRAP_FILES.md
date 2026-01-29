# Bootstrap Files Specification

**Status:** ALIGNED WITH WORKSPACE_SYSTEM.md  
**Last Updated:** 2026-01-28

---

## Overview

This document inventories all files created during Nexus initialization and onboarding, their purposes, and templates.

---

## Files Created During `nexus init`

| File | Location | Purpose | Template |
|------|----------|---------|----------|
| `AGENTS.md` | `~/nexus/AGENTS.md` | Main system behavior doc | `reference/AGENTS.md` |
| `BOOTSTRAP.md` | `state/agents/BOOTSTRAP.md` | First-run ritual template | `reference/BOOTSTRAP.md` |
| `agents/config.json` | `state/agents/config.json` | Agent defaults config | Default JSON (see below) |
| `credentials/config.json` | `state/credentials/config.json` | Credential system config | Default JSON (see below) |
| `gateway/config.json` | `state/gateway/config.json` | Gateway config | Default JSON (see below) |

### AGENTS.md

The main system behavior document. Contains:
- CLI-first orientation (`nexus status`)
- Capability status legend
- Full CLI grammar
- Skill types taxonomy
- Credential hygiene best practices
- Workspace structure overview
- Cloud sync instructions
- Safety rules
- Social behavior guidelines
- **Triggers** (proactive wake-ups) — simplified reference, NOT detailed heartbeat behavior

**Template:** `reference/AGENTS.md`

**Important Change:** The detailed "Heartbeats" section with behavioral checklists has been moved to the **Unified Triggers** system. AGENTS.md now contains a simplified "Triggers" section that tells agents:
- Triggers wake them for scheduled/event work
- Check `HEARTBEAT.md` if woken by a heartbeat trigger
- Use `create_trigger` to schedule future wake-ups
- Reply `HEARTBEAT_OK` if nothing needs attention

See `specs/agent-system/UNIFIED_TRIGGERS.md` for the full trigger system spec.

### BOOTSTRAP.md

First-run ritual template. Used during agent onboarding conversation to establish agent identity.

**Handling:**
1. Lives permanently at `state/agents/BOOTSTRAP.md`
2. Read by agent when no `state/agents/*/IDENTITY.md` exists
3. NOT deleted after onboarding (kept for creating additional agents)

**Template:** `reference/BOOTSTRAP.md`

**Note:** Memory is handled by Cortex, not markdown files. The BOOTSTRAP.md template does not reference MEMORY.md.

---

## Files Created During Agent Onboarding

| File | Location | Purpose | Template |
|------|----------|---------|----------|
| Agent IDENTITY.md | `state/agents/{name}/IDENTITY.md` | Agent name, emoji, vibe | `reference/IDENTITY-agent.md` |
| Agent SOUL.md | `state/agents/{name}/SOUL.md` | Agent persona & boundaries | `reference/SOUL.md` |
| User IDENTITY.md | `state/user/IDENTITY.md` | User profile | `reference/IDENTITY-user.md` |

**Note:** The agent directory name (`{name}`) comes from the bootstrap conversation, not a CLI flag. The directory is never named `default`.

### Agent IDENTITY.md

Agent's identity markers.

**Template:** `reference/IDENTITY-agent.md`

### Agent SOUL.md

Agent's persona, boundaries, and behavior guidelines.

**Template:** `reference/SOUL.md`

**Note:** Memory is handled by Cortex, not markdown files. The SOUL.md template does not reference MEMORY.md.

### User IDENTITY.md

User's profile, updated by the agent as they learn.

**Template:** `reference/IDENTITY-user.md`

---

## Config Files Created During Init

### `state/agents/config.json`

Default agent configuration.

**Default content:**
```json
{
  "defaults": {
    "model": "claude-sonnet-4-20250514"
  }
}
```

### `state/credentials/config.json`

Default credential system configuration.

**Default content:**
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

### `state/gateway/config.json`

Default gateway configuration.

**Default content:**
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

---

## Agent Binding Templates

Templates for IDE/harness bindings live in `reference/cursor/`:

| Template | Purpose |
|----------|---------|
| `reference/cursor/rules` | Cursor rules file |
| `reference/cursor/hooks.json` | Cursor hook registration |
| `reference/cursor/hooks/nexus-session-start.js` | Cursor session hook script |

These are used when creating Cursor bindings via `nexus bindings cursor`. See `AGENT_BINDINGS.md` for details.

---

## Optional Files

### HEARTBEAT.md

**Location:** `~/nexus/HEARTBEAT.md` (next to AGENTS.md)

**Created by:** User (optional, not auto-created)

**Purpose:** User-customizable checklist read by agents when woken by heartbeat triggers.

**Relationship to Triggers:** The Unified Triggers system handles heartbeat scheduling. HEARTBEAT.md is just the checklist the agent reads when a heartbeat trigger fires. See `specs/agent-system/UNIFIED_TRIGGERS.md`.

**Template:**

```markdown
# HEARTBEAT.md

Things to check on each heartbeat:

- [ ] Important emails (urgent flags, VIPs)
- [ ] Calendar events coming up (<2h)
- [ ] Weather if user might be going out
- [ ] Project status (git repos, CI)

If nothing needs attention, stay quiet (reply HEARTBEAT_OK).

## Custom checks

Add project-specific items here as needed.
```

### MEMORY.md

**Status:** NOT USED in Nexus

**Reason:** Memory is handled by Cortex, not markdown files.

Upstream clawdbot uses `MEMORY.md` for agent memory. Nexus replaces this with the Cortex memory system. Templates (BOOTSTRAP.md, SOUL.md) do not reference MEMORY.md.

---

## Files NOT Created

| Upstream File | Nexus Status | Notes |
|---------------|--------------|-------|
| `TOOLS.md` | Not used | Handled via `nexus skill` CLI |
| `MEMORY.md` | Not used | Handled by Cortex |
| `USER.md` | Renamed | Now `state/user/IDENTITY.md` |
| `.gitignore` | Not created | No default git init |

---

## File Frontmatter

Identity files use YAML frontmatter for machine-readable metadata:

```markdown
---
name: Atlas
emoji: 🧭
creature: "description"
vibe: "description"
---
# Human-readable content below
```

This allows:
- Programmatic parsing via `nexus` CLI
- Human editing with nice formatting
- Flexible additional fields

---

## Related Specifications

- **WORKSPACE_SYSTEM.md** — Authoritative spec (this document aligns with it)
- **INIT.md** — File creation timing
- **ONBOARDING.md** — Ritual flow
- **AGENT_BINDINGS.md** — IDE/harness binding configurations
- **specs/agent-system/UNIFIED_TRIGGERS.md** — Trigger system (replaces detailed heartbeat behavior)
