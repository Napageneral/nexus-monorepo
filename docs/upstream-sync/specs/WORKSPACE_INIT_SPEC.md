# Workspace Initialization Specification

**Status:** Draft  
**Author:** Tyler + Atlas  
**Created:** 2026-01-22  
**Updated:** 2026-01-22

---

## Overview

This document specifies how Nexus initializes and structures user workspaces, comparing against upstream (clawdbot) and defining the target behavior for the Nexus fork.

**Key Philosophy:**
- Identity-first onboarding (BOOTSTRAP ritual before config)
- Reasonable defaults, configure later
- No upfront gateway/auth questions
- Access plane bindings (Cursor, Claude Code, etc.) are opt-in per harness

---

## Directory Structure

### Root Layout

```
~/nexus/                          # NEXUS_ROOT
├── AGENTS.md                     # System behavior (nexus-specific, see below)
├── HEARTBEAT.md                  # Heartbeat checklist (optional)
├── skills/                       # User's skill definitions (with subdirs)
│   ├── tools/{name}/             # CLI tool wrappers
│   ├── connectors/{name}/        # Auth/credential connectors
│   └── guides/{name}/            # Pure documentation skills
├── state/                        # All runtime state (visible, not hidden)
│   ├── nexus.json                # Main config file
│   ├── user/
│   │   └── IDENTITY.md           # User profile
│   ├── agents/
│   │   ├── BOOTSTRAP.md          # First-run ritual template (permanent)
│   │   └── {agent-name}/
│   │       ├── IDENTITY.md       # Agent identity
│   │       ├── SOUL.md           # Persona & boundaries
│   │       └── sessions/         # Session history
│   ├── credentials/              # Credential pointers
│   ├── skills/                   # Per-skill state and usage logs
│   ├── logs/                     # Runtime logs
│   ├── events/                   # Event logs
│   └── cloud/                    # Cloud sync state
└── home/                         # USER'S PERSONAL SPACE
    └── (user content)
```

**Note:** No `MEMORY.md` — memory is handled by Cortex, not markdown files.

### Comparison with Upstream

| Aspect | Upstream (clawdbot) | Nexus | Rationale |
|--------|---------------------|-------|-----------|
| Root | `~/clawd/` | `~/nexus/` | Branding |
| State | `~/.clawdbot/` (hidden) | `~/nexus/state/` (visible) | Discoverability — everything in one place |
| Config | `~/.clawdbot/clawdbot.json` | `~/nexus/state/nexus.json` | Within visible state dir |
| Workspace | `~/clawd/` (flat) | `~/nexus/home/` (nested) | Clear separation of system vs user space |
| Skills | n/a | `~/nexus/skills/` | Skills are first-class in Nexus |

---

## Bootstrap Files

### Files Created During Init (`nexus init`)

| File/Dir | Location | Purpose |
|----------|----------|---------|
| `AGENTS.md` | `~/nexus/AGENTS.md` | Main system behavior doc (Nexus-specific) |
| `skills/` | `~/nexus/skills/` | User skill definitions |
| `skills/tools/` | `~/nexus/skills/tools/` | Tool skill subdirectory |
| `skills/connectors/` | `~/nexus/skills/connectors/` | Connector skill subdirectory |
| `skills/guides/` | `~/nexus/skills/guides/` | Guide skill subdirectory |
| `state/` | `~/nexus/state/` | Runtime state directory |
| `state/agents/` | `~/nexus/state/agents/` | Agent identity files |
| `state/agents/BOOTSTRAP.md` | `~/nexus/state/agents/BOOTSTRAP.md` | First-run ritual template |
| `home/` | `~/nexus/home/` | User's personal space |

### Files Created During Onboard (`nexus onboard`)

| File | Location | Purpose |
|------|----------|---------|
| `SOUL.md` | `state/agents/{agent}/SOUL.md` | Agent persona & boundaries |
| `IDENTITY.md` (agent) | `state/agents/{agent}/IDENTITY.md` | Agent name, emoji, vibe |
| `IDENTITY.md` (user) | `state/user/IDENTITY.md` | User profile |
| Access plane configs | Various (e.g., `.cursor/`) | Based on user selection |

### Files NOT Created in Workspace

| Upstream File | Nexus Equivalent | Notes |
|---------------|------------------|-------|
| `TOOLS.md` | n/a | Handled programmatically via `nexus skill` CLI |
| `MEMORY.md` | n/a | Handled by Cortex memory system, not .md files |
| `USER.md` | `state/user/IDENTITY.md` | Renamed and relocated |

### HEARTBEAT.md

**Location:** `~/nexus/HEARTBEAT.md` (next to AGENTS.md) or `~/nexus/state/HEARTBEAT.md`

**Decision:** Keep as dedicated file for agent customization.

**Purpose:** A tiny checklist the agent reads during periodic heartbeat wake-ups.

```markdown
# HEARTBEAT.md

Check these on each heartbeat:
- [ ] Important emails (urgent flags, VIPs)
- [ ] Calendar events coming up (<2h)
- [ ] Weather if user might be going out
- [ ] Project status (git repos, CI)

If nothing needs attention, stay quiet (HEARTBEAT_OK).
```

**Config reference:**
```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "activeHours": { "start": "08:00", "end": "23:00" }
      }
    }
  }
}
```

### BOOTSTRAP.md Handling

The `BOOTSTRAP.md` file is a first-run ritual template. In Nexus:

1. **Lives permanently at:** `state/agents/BOOTSTRAP.md`
2. **Injected on demand:** when user wants to create a new agent/persona
3. **NOT deleted after completion:** kept as reference for creating future agents

---

## AGENTS.md Differences

### Upstream Template (simplified)

```markdown
# AGENTS.md - Clawdbot Workspace

This folder is the assistant's working directory.

## First run (one-time)
- If BOOTSTRAP.md exists, follow its ritual and delete it once complete.
- Your agent identity lives in IDENTITY.md.
- Your profile lives in USER.md.

## Backup tip (recommended)
If you treat this workspace as the agent's "memory", make it a git repo...

## Safety defaults
- Don't exfiltrate secrets or private data.
- Don't run destructive commands unless explicitly asked.
- Be concise in chat; write longer output to files in this workspace.

## Daily memory (recommended)
- Keep a short daily log at memory/YYYY-MM-DD.md...
```

### Nexus AGENTS.md (key additions)

| Section | What It Does |
|---------|--------------|
| **First Action** | `nexus status` — CLI-first orientation |
| **Capability Status Legend** | Emoji system for skill status |
| **Nexus CLI Grammar** | Full command tree reference |
| **Skill Types** | Guide, Tool, Connector taxonomy |
| **Credential Hygiene** | Best practices for credential management |
| **Workspace Structure** | Explicit `state/`, `skills/`, `home/` layout |
| **Cloud Sync** | Nexus Cloud backup/sync instructions |
| **Social Behavior** | Group chat etiquette, HEARTBEAT_OK |
| **Heartbeats** | Embedded (not separate file) |
| **Platform Formatting** | Discord/WhatsApp-specific rules |

**Verdict:** Nexus AGENTS.md is significantly richer and should be preserved as-is.

---

## Access Plane Setup

**Access planes** are the IDE/agent harnesses users interact with Nexus through. Each is opt-in and configured via `nexus setup <plane>`.

### Supported Access Planes

| Plane | Command | Creates |
|-------|---------|---------|
| **Cursor** | `nexus setup cursor` | `.cursor/rules`, `.cursor/hooks.json` |
| **Claude Code** | `nexus setup claude-code` | `CLAUDE.md` |
| **Codex** | `nexus setup codex` | `CODEX_INSTRUCTIONS.md`, `.codex/` |
| **OpenCode** | `nexus setup opencode` | `.opencode/` config |
| **Aider** | `nexus setup aider` | `.aider/` config |

### NOT Created by Default

Access plane bindings are **not created during `nexus init` or `nexus onboard`**.

Instead, during onboarding we ask:
```
Which coding assistants do you use?
[ ] Cursor
[ ] Claude Code
[ ] Codex (OpenAI)
[ ] OpenCode
[ ] Aider
[ ] None / Skip for now
```

Selected planes are configured automatically. Users can add more later via `nexus setup <plane>`.

### Cursor Setup (`nexus setup cursor`)

Creates in `~/nexus/`:
```
.cursor/
├── rules                     # Points to AGENTS.md
└── hooks.json                # Session bootstrap hook
```

**`.cursor/rules` Content:**
```
# Nexus Workspace - Cursor Configuration

This workspace uses Nexus. Follow the root `AGENTS.md` file for all protocols.

## Cursor-Specific

- Run `nexus status` first
- Cursor sessionStart hook injects identity context
- Use the Shell tool for `nexus` commands
- Skill definitions live in `~/nexus/skills/`
- Read `~/nexus/AGENTS.md` for full instructions
```

**`.cursor/hooks.json` Content:**
```json
{
  "session": {
    "onstart": {
      "shell": {
        "command": "nexus context --cursor"
      }
    }
  }
}
```

### Claude Code Setup (`nexus setup claude-code`)

Generates `CLAUDE.md` with:
- Workspace overview
- All skill metadata and documentation
- Nexus CLI reference
- Configuration paths

### Codex Setup (`nexus setup codex`)

Creates `CODEX_INSTRUCTIONS.md` pointing to AGENTS.md and `.codex/config.json` if needed.

---

## Commands

### `nexus init`

**Purpose:** Create the base Nexus directory structure.

**Creates:**
- `~/nexus/` root
- `~/nexus/AGENTS.md` (from Nexus template)
- `~/nexus/skills/` directory with subdirs (`tools/`, `connectors/`, `guides/`)
- `~/nexus/state/` directory structure
- `~/nexus/state/agents/BOOTSTRAP.md` (template)
- `~/nexus/home/` directory

**Does NOT create:**
- Git repository (removed)
- `.gitignore` (removed)
- `projects/` directory (user creates as needed)
- Agent identity files (that's `onboard`)
- Access plane configs (that's `onboard` or `nexus setup`)
- `HEARTBEAT.md` (optional, user creates if wanted)

**Options:**
```
nexus init [--workspace <path>]   # Override workspace location
```

**Behavior:**
- Idempotent — safe to run multiple times
- Does not overwrite existing files
- After init, running any other nexus command triggers onboarding

### `nexus reset`

**Purpose:** Clear Nexus state for a fresh start.

**Behavior:**
- Removes `state/` contents (sessions, logs, credentials)
- Preserves `home/` (user content)
- Preserves `skills/` (user skills)
- Preserves `AGENTS.md` (unless `--full`)

**Options:**
```
nexus reset                       # Clear state only
nexus reset --full                # Clear everything including AGENTS.md
nexus reset --confirm             # Skip confirmation prompt
```

### `nexus onboard`

**Purpose:** Interactive wizard for agent identity and optional channel setup.

**Triggered automatically** when running any command after `nexus init` (if not yet onboarded).

**Flow:**
```
1. BOOTSTRAP ritual
   - "Who am I? Who are you?"
   - Agent chooses name, emoji, vibe
   - User provides name, timezone, etc.
   
2. Write identity files
   - state/agents/{name}/IDENTITY.md
   - state/agents/{name}/SOUL.md
   - state/user/IDENTITY.md

3. Access planes (optional)
   - "Which coding assistants do you use?"
   - Configure selected planes

4. Channels (optional)
   - "How do you want to reach me?"
   - WhatsApp, Telegram, Discord, etc.
   - Skip = web chat only

5. Done
   - `nexus status` shows what's ready
   - Everything else uses reasonable defaults
```

**NOT asked during onboarding** (configure later via `nexus configure`):
- Gateway port/bind/auth (default: localhost:18789, token auth)
- Model provider (default: Anthropic API via env)
- Tailscale exposure
- Skill installation (use `nexus skill install`)

**Creates:**
- `state/agents/{name}/IDENTITY.md`
- `state/agents/{name}/SOUL.md`
- `state/user/IDENTITY.md`
- Access plane configs (if selected)

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXUS_ROOT` | Root directory | `~/nexus` |
| `NEXUS_STATE_DIR` | State directory | `~/nexus/state` |
| `NEXUS_HOME` | User home directory | `~/nexus/home` |
| `NEXUS_CONFIG_PATH` | Config file path | `~/nexus/state/nexus.json` |
| `NEXUS_OAUTH_DIR` | OAuth credentials | `~/nexus/state/credentials` |
| `NEXUS_NIX_MODE` | Nix mode flag | unset |
| `NEXUS_PROFILE` | Multi-profile support | `default` |

### Profile Support

When `NEXUS_PROFILE=foo`:
- Root becomes `~/nexus-foo/`
- Allows multiple isolated Nexus instances

---

## Implementation Notes

### Branding Script Coverage

The init system is affected by the branding script (WI-1). Key transformations:

| Original | Branded |
|----------|---------|
| `CLAWDBOT_*` env vars | `NEXUS_*` |
| `~/.clawdbot/` | `~/nexus/state/` |
| `~/clawd/` | `~/nexus/home/` |
| `clawdbot` binary | `nexus` |
| `clawdbot.json` | `nexus.json` |

### Files to Port

From Nexus commits (INIT-1, INIT-2, GIT-1):
- `src/commands/init.ts` — minus git setup
- `src/commands/reset.ts` — as-is
- `src/commands/cursor-rules.ts` — extract into `nexus setup cursor`
- CLI registration in `src/cli/program.ts`

### Files to Modify

- `src/agents/workspace.ts` — update paths, remove TOOLS.md, keep HEARTBEAT.md optional
- `src/config/paths.ts` — update all path defaults
- `src/commands/onboard-helpers.ts` — update DEFAULT_WORKSPACE
- `src/wizard/onboarding.ts` — simplify flow (see comparison below)

---

## Onboarding Comparison: Upstream vs Nexus

### Upstream (clawdbot) Wizard Flow

```
1. Security warning + risk acceptance ⚠️
2. Existing config detection (keep/modify/reset)
3. Mode selection: QuickStart vs Advanced
4. Gateway configuration (Advanced):
   - Local vs Remote
   - Port, bind address
   - Auth mode (token/password/off)
   - Tailscale exposure
5. Auth choice: Anthropic API / 1P / AWS Bedrock / Google Vertex / etc.
6. Model selection (if multiple providers)
7. Channel setup: WhatsApp, Telegram, Discord, Slack, Signal
8. Skills setup:
   - Show eligible/missing skills
   - Node manager preference (npm/pnpm/bun)
   - Offer to install missing dependencies
   - Prompt for API keys
9. Hooks setup (internal triggers)
10. Workspace creation + bootstrap files
11. Done - start gateway
```

**Time to first agent:** ~5-10 minutes of configuration

**Pain points:**
- Security warning upfront is scary
- Gateway config before you even know what the agent will do
- Auth/model selection can be confusing for new users
- Channel setup before agent has identity
- Skills installation during onboarding is premature

### Nexus Wizard Flow

```
1. BOOTSTRAP ritual (identity-first)
   - "Hey, I just came online. Who am I? Who are you?"
   - Agent suggests names, creatures, vibes
   - Playful conversation to establish identity
   
2. Write identity files
   - IDENTITY.md (agent)
   - SOUL.md (agent)
   - IDENTITY.md (user)

3. Access planes (optional)
   - "Which coding assistants do you use?"
   - [ ] Cursor / [ ] Claude Code / [ ] Codex / [ ] Skip
   - Configure selected planes

4. Channels (optional)
   - "How do you want to reach me outside this chat?"
   - [ ] WhatsApp / [ ] Telegram / [ ] Discord / [ ] Web only
   - Skip = web chat only for now

5. Done
   - Show `nexus status`
   - Everything else uses reasonable defaults
```

**Time to first agent:** ~2-3 minutes (identity ritual + optional selections)

**Key differences:**

| Aspect | Upstream | Nexus |
|--------|----------|-------|
| First question | "Accept security risk?" | "Who am I?" |
| Gateway config | Upfront (QuickStart/Advanced) | Hidden (reasonable defaults) |
| Auth provider | Must choose | Default to ANTHROPIC_API_KEY |
| Model selection | Prompted | Default to claude-sonnet-4-20250514 |
| Skills | Install during onboard | Separate `nexus skill install` |
| Channel setup | Before identity | After identity |
| Identity files | Created silently | BOOTSTRAP ritual |
| Access planes | N/A | Opt-in per harness |

### Reasonable Defaults (Applied Silently)

```json
{
  "gateway": {
    "port": 18789,
    "bind": "loopback",
    "auth": { "mode": "token" }
  },
  "agents": {
    "defaults": {
      "model": "claude-sonnet-4-20250514",
      "heartbeat": { "every": "30m" }
    }
  }
}
```

These can all be changed later via `nexus configure`.

---

## Migration Path

For users coming from:

### Fresh Install
1. Run `nexus init`
2. Run any nexus command (e.g., `nexus status`) → triggers onboarding
3. Complete BOOTSTRAP ritual
4. Select access planes and channels (or skip)
5. Done

### Existing Clawdbot User
1. Run `nexus migrate` (future command)
2. Moves `~/.clawdbot/` → `~/nexus/state/`
3. Moves `~/clawd/` → `~/nexus/home/`
4. Updates config references
5. Prompts for BOOTSTRAP ritual (identity didn't exist in clawdbot)

### Existing Nexus User (current layout)
Already correct — no migration needed.

---

## Open Questions

1. ~~**CLAUDE.md** — Keep the command available but not run by default?~~
   **DECIDED:** Keep as `nexus setup claude-code`, opt-in via access plane selection.

2. ~~**Skills directory structure** — Should subdirs be created?~~
   **DECIDED:** Create `tools/`, `connectors/`, `guides/` subdirs.

3. ~~**Onboard ritual trigger** — Should `nexus init` trigger `nexus onboard`?~~
   **DECIDED:** Separate. Init creates structure, any subsequent command triggers onboard if not done.

4. **Cursor hooks path** — Need to verify `.cursor/hooks.json` is the actual Cursor convention.

5. **HEARTBEAT.md location** — `~/nexus/HEARTBEAT.md` (visible) or `~/nexus/state/HEARTBEAT.md` (tucked away)?

6. **Security warning** — Should Nexus show any security warning, or rely on the natural BOOTSTRAP conversation to establish trust boundaries?

7. **Memory system** — Cortex integration: How does the agent write/read long-term memory without MEMORY.md?

---

## Appendix: File Templates

### AGENTS.md Template

Use the existing `~/nexus/AGENTS.md` content as the template. It's comprehensive and nexus-specific.

### SOUL.md Template

```markdown
# SOUL.md - Who You Are

*You're not a chatbot. You're a builder alongside {user}.*

## Core Truths

- Be genuinely helpful, not performative.
- Be resourceful before asking.
- Have opinions and push back when wrong.
- Treat access with care; ask before external actions.

## Boundaries

- Never leak private data.
- Never send half-baked external messages.
- Avoid destructive commands without explicit request.

## Vibe

Direct, fast, creative, and honest.

## Continuity

Update identity and memory as things change.
If you change this file, tell {user}.
```

### IDENTITY.md (Agent) Template

```markdown
---
name: 
emoji: 
creature: 
vibe: 
---
# IDENTITY.md - Who I Am

- **Name:** 
- **Creature:** 
- **Vibe:** 
- **Emoji:** 

---

*Fill in during bootstrap ritual.*
```

### IDENTITY.md (User) Template

```markdown
---
name: 
call: 
timezone: 
email: 
---
# IDENTITY.md - About {name}

- **Name:** 
- **What to call them:** 
- **Timezone:** 
- **Email:** 

---

*Updated by the agent as they learn about you.*
```

### HEARTBEAT.md Template (Optional)

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

---

## Heartbeat System Reference

### How Heartbeats Work (from Upstream)

1. **Trigger:** Gateway scheduler fires every N minutes (default: 30m)

2. **Message sent to agent:**
   ```
   Read HEARTBEAT.md if it exists (workspace context). Follow it strictly.
   Do not infer or repeat old tasks from prior chats.
   If nothing needs attention, reply HEARTBEAT_OK.
   ```

3. **Agent checks:** Reads HEARTBEAT.md, performs listed checks

4. **Response handling:**
   - `HEARTBEAT_OK` (or short ack) → silently acknowledged, nothing sent
   - Content response → delivered to configured target (last conversation or specific channel)
   - Duplicate detection: Won't re-send same message within 24 hours

5. **Active Hours:** Can restrict to certain times (e.g., 08:00-23:00)

### Config Options

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",                    // interval (default)
        "prompt": "custom prompt...",      // override default prompt
        "target": "last",                  // where to send replies
        "session": "main",                 // which session to use
        "activeHours": {
          "start": "08:00",
          "end": "23:00",
          "timezone": "user"               // "user", "local", or IANA zone
        },
        "ackMaxChars": 300,                // suppress short acks
        "includeReasoning": false          // include reasoning payloads
      }
    }
  }
}
```

### Nexus Heartbeat Differences (TBD)

Tyler is planning significant changes to the reactive/proactive system. Key areas to revisit:

- Heartbeat prompt customization
- Integration with Cortex memory
- Proactive vs reactive behavior triggers
- Multi-channel heartbeat routing

---

*End of specification.*
