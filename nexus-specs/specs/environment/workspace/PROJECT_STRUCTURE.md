# Project Structure Specification

**Status:** ALIGNED WITH WORKSPACE_SYSTEM.md  
**Last Updated:** 2026-01-29

---

## Overview

This document defines the canonical directory structure for a Nexus workspace.

---

## Root Layout

```
~/nexus/                          # NEXUS_ROOT
├── AGENTS.md                     # System behavior (nexus-specific)
├── HEARTBEAT.md                  # Heartbeat checklist (optional)
├── skills/                       # User's skill definitions
│   ├── tools/{name}/             # CLI tool wrappers
│   ├── connectors/{name}/        # Auth/credential connectors
│   └── guides/{name}/            # Pure documentation skills
├── state/                        # All runtime state (visible, not hidden)
│   ├── user/
│   │   └── IDENTITY.md           # User profile
│   ├── agents/
│   │   ├── BOOTSTRAP.md          # First-run ritual template (permanent)
│   │   ├── config.json           # Agent defaults config
│   │   └── {agent-name}/
│   │       ├── IDENTITY.md       # Agent identity
│   │       └── SOUL.md           # Persona & boundaries
│   ├── sessions/                 # Global session transcripts
│   │   ├── sessions.json         # Metadata index
│   │   └── {sessionId}.jsonl    # Transcripts
│   ├── credentials/
│   │   ├── config.json           # Credential system config
│   │   ├── index.json            # Fast lookup index
│   │   └── {service}/            # Per-service credentials
│   │       └── {account}.json
│   └── gateway/
│       └── config.json           # Gateway config
├── home/                         # USER'S PERSONAL SPACE
│   └── (user content)
│
├── .cursor/                      # Cursor binding (if configured)
│   ├── hooks.json
│   └── hooks/
│       └── nexus-session-start.js
│
├── .claude/                      # Claude Code binding (if configured)
│   └── settings.json
│
└── .opencode/                    # OpenCode binding (if configured)
    └── plugins/
        └── nexus-bootstrap.ts
```

---

## Key Directories

### `~/nexus/` (NEXUS_ROOT)

The workspace root. Contains system files and subdirectories.

**Key Files:**
- `AGENTS.md` — System behavior documentation (always present)
- `HEARTBEAT.md` — Optional heartbeat checklist

### `~/nexus/skills/`

User's skill definitions, organized by type:

| Subdirectory | Purpose |
|--------------|---------|
| `tools/{name}/` | CLI tool wrappers (e.g., `gog`, `tmux`) |
| `connectors/{name}/` | Auth/credential connectors (e.g., `google-oauth`) |
| `guides/{name}/` | Pure documentation skills (e.g., `filesystem`) |

Each skill has a `SKILL.md` file and optional supporting files.

### `~/nexus/state/`

All runtime state. **Visible, not hidden** — transparency over obscurity.

| Subdirectory | Purpose |
|--------------|---------|
| `user/` | User identity and profile |
| `agents/` | Agent identity files and config |
| `sessions/` | Global session transcripts and metadata |
| `credentials/` | Credential pointers (not raw secrets) and config |
| `gateway/` | Gateway configuration |

### `~/nexus/home/`

**User's personal space.** This is where users put their projects, notes, and personal content.

Nexus Cloud syncs this directory (minus patterns in `home/.nexusignore`).

---

## Comparison with Upstream

| Aspect | Upstream (clawdbot) | Nexus | Rationale |
|--------|---------------------|-------|-----------|
| Root | `~/clawd/` | `~/nexus/` | Branding |
| State | `~/.clawdbot/` (hidden) | `~/nexus/state/` (visible) | Discoverability |
| Config | `~/.clawdbot/clawdbot.json` | Split configs by domain | Clear separation of concerns |
| Workspace | `~/clawd/` (flat) | `~/nexus/home/` (nested) | Clear separation |
| Skills | n/a | `~/nexus/skills/` | Skills are first-class |
| Sessions | `~/.clawdbot/sessions/` | `~/nexus/state/sessions/` (global) | Simpler, sessions reference agent by ID |

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXUS_ROOT` | Root directory | `~/nexus` |
| `NEXUS_STATE_DIR` | State directory | `~/nexus/state` |
| `NEXUS_HOME` | User home directory | `~/nexus/home` |
| `NEXUS_PROFILE` | Named profile | (none) |

### Profile Support

When `NEXUS_PROFILE=foo`:
- Root becomes `~/nexus-foo/`
- Allows multiple isolated Nexus instances

---

## Design Decisions

### Visible State Directory

**Decision:** `~/nexus/state/` instead of hidden `~/.nexus/`

**Rationale:**
- Everything in one place
- Easy to explore and understand
- No hunting for hidden directories
- Git-friendly (can add to `.gitignore` selectively)

### Separate `home/` Directory

**Decision:** User content in `~/nexus/home/`, not workspace root

**Rationale:**
- Clear separation of system vs user space
- `home/` is the cloud-synced directory
- Prevents accidental modification of system files
- Maps to familiar "home directory" concept

### Skills as First-Class

**Decision:** Dedicated `~/nexus/skills/` with subdirectories by type

**Rationale:**
- Skills are central to Nexus identity
- Organized by type (tools, connectors, guides)
- Easy to browse and discover
- Supports `nexus skills list --type tools`

### Split Config Philosophy

**Decision:** Config split by domain into separate files

**Rationale:**
- Clear separation of concerns
- Each domain's config is self-contained
- Different consumers may need different access
- Gateway is optional; its config shouldn't pollute core
- Easy to find config for specific subsystem

### No Per-Agent Sessions

**Decision:** Global `state/sessions/` only, not per-agent

**Rationale:**
- Simpler structure
- Sessions reference agent by ID in metadata
- Avoids duplication and complexity

---

## File Locations Reference

| Data | Location |
|------|----------|
| Agent defaults config | `state/agents/config.json` |
| Credential system config | `state/credentials/config.json` |
| Gateway config | `state/gateway/config.json` |
| User profile | `state/user/IDENTITY.md` |
| Agent identity | `state/agents/{name}/IDENTITY.md` |
| Agent persona | `state/agents/{name}/SOUL.md` |
| Session transcripts | `state/sessions/{id}.jsonl` |
| Session metadata | `state/sessions/sessions.json` |
| Credentials | `state/credentials/{service}/{account}.json` |
| Credential index | `state/credentials/index.json` |

---

*See INIT.md for how structure is created.*  
*See BOOTSTRAP_FILES.md for file inventory.*
