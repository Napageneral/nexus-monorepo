# Workspace System Specification

**Status:** AUTHORITATIVE DOCUMENT  
**Last Updated:** 2026-01-27

---

## Overview

This document is the **authoritative specification** for the Nexus workspace system. It defines how initialization, onboarding, project structure, bootstrap files, and agent bindings work together.

**Subordinate specs must align with this document:**
- `INIT.md` — Init command details
- `PROJECT_STRUCTURE.md` — Directory layout
- `BOOTSTRAP_FILES.md` — File templates
- `AGENT_BINDINGS.md` — IDE/harness integrations
- `ONBOARDING.md` — Bootstrap conversation flow

---

## The Workspace Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: nexus init                                                         │
│ Creates everything — structure AND default config                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Directories:                          Files:                               │
│  ~/nexus/                              ~/nexus/AGENTS.md                    │
│  ~/nexus/skills/tools/                 ~/nexus/state/agents/BOOTSTRAP.md    │
│  ~/nexus/skills/connectors/            ~/nexus/state/gateway/config.json    │
│  ~/nexus/skills/guides/                ~/nexus/state/agents/config.json     │
│  ~/nexus/state/                        ~/nexus/state/credentials/config.json│
│  ~/nexus/state/agents/                                                      │
│  ~/nexus/state/user/                                                        │
│  ~/nexus/state/sessions/                                                    │
│  ~/nexus/state/credentials/                                                 │
│  ~/nexus/state/gateway/                                                     │
│  ~/nexus/home/                                                              │
│                                                                             │
│  Output: "Nexus initialized! Open ~/nexus/ in your AI assistant to begin." │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: User opens ~/nexus/ in Cursor (or other agent harness)             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Agent reads AGENTS.md → sees it's a Nexus workspace                        │
│  Notices: No state/agents/*/IDENTITY.md exists (only BOOTSTRAP.md)          │
│  Action: Agent reads BOOTSTRAP.md and starts the conversation               │
│                                                                             │
│  THIS IS AN AGENT CONVERSATION — not a CLI wizard!                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: BOOTSTRAP Conversation (Agent-driven)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Agent says: "Hey. I just came online. Who am I? Who are you?"              │
│                                                                             │
│  Through conversation, they establish:                                      │
│  • Agent name, emoji, creature, vibe                                        │
│  • User name, timezone, email, preferences                                  │
│                                                                             │
│  Agent writes files:                                                        │
│  • state/agents/{name}/IDENTITY.md    ← Directory named from conversation   │
│  • state/agents/{name}/SOUL.md                                              │
│  • state/user/IDENTITY.md                                                   │
│                                                                             │
│  Agent runs: nexus status → sees current capabilities                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Silent Detection (Agent-driven, after bootstrap)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Agent runs: nexus credential scan --deep                                   │
│  → Finds env vars (ANTHROPIC_API_KEY, GITHUB_TOKEN, etc.)                   │
│  → Imports Claude CLI / Codex CLI credentials                               │
│                                                                             │
│  Agent uses: aix (skill/tool)                                               │
│  → Detects which agent harnesses user has (Cursor, Claude Code, etc.)       │
│  → Detects which ones they use most frequently                              │
│                                                                             │
│  Agent detects: OS platform                                                 │
│  → Suggests relevant skill packs (macos-essentials, etc.)                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: Agent Bindings (Auto-created for top 2 harnesses)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Based on aix detection, automatically create bindings for user's           │
│  top 2 most-used agent harnesses.                                           │
│                                                                             │
│  Agent: "I see you use Cursor and Claude Code most. I've set up bindings    │
│          so they connect to Nexus. Want me to set up others?"               │
│                                                                             │
│  Creates (automatically for top 2, optionally for others):                  │
│  • Cursor: .cursor/rules, .cursor/hooks.json, .cursor/hooks/script.js       │
│  • Claude Code: CLAUDE.md                                                   │
│  • Codex: CODEX.md, .codex/                                                 │
│  • etc.                                                                     │
│                                                                             │
│  User must open ~/nexus/ as workspace root for bindings to work.            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 6: Access Planes / Follow-up Tasks (Agent suggests)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Agent: "Here's what else we could set up when you're ready:"               │
│                                                                             │
│  • Channels (WhatsApp, Telegram, Discord) → handled by gateway plugin       │
│  • Skill packs → nexus skills install macos-essentials                       │
│  • Cloud sync → nexus-cloud setup                                           │
│                                                                             │
│  These are follow-up tasks, not part of core onboarding.                    │
│  Channel setup is documented in specs/agent-system/GATEWAY.md               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Project Structure

### Directory Layout

```
~/nexus/                              # NEXUS_ROOT
├── AGENTS.md                         # System behavior (always present)
├── HEARTBEAT.md                      # Heartbeat checklist (optional, user-created)
│
├── skills/                           # Skill definitions
│   ├── tools/{name}/                 # CLI tool wrappers (gog, tmux, etc.)
│   ├── connectors/{name}/            # Auth connectors (google-oauth, etc.)
│   └── guides/{name}/                # Pure documentation (filesystem, etc.)
│
├── state/                            # All runtime state (visible, not hidden)
│   ├── agents/
│   │   ├── BOOTSTRAP.md              # First-run ritual template (permanent)
│   │   ├── config.json               # Agent defaults config
│   │   └── {agent-name}/             # Per-agent identity
│   │       ├── IDENTITY.md
│   │       └── SOUL.md
│   │
│   ├── user/
│   │   └── IDENTITY.md               # User profile
│   │
│   ├── sessions/
│   │   ├── sessions.json             # Session metadata index
│   │   └── {sessionId}.jsonl         # Session transcripts
│   │
│   ├── credentials/
│   │   ├── config.json               # Credential system config
│   │   ├── index.json                # Fast lookup index
│   │   └── {service}/                # Per-service credentials
│   │       └── {account}.json
│   │
│   └── gateway/
│       └── config.json               # Gateway config
│
├── home/                             # USER'S PERSONAL SPACE
│   └── (user content, cloud-synced)
│
└── .cursor/                          # Cursor binding (if configured)
    ├── rules
    ├── hooks.json
    └── hooks/
        └── nexus-session-start.js
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State visibility | `state/` not hidden | Transparency, discoverability |
| Config split | Per-domain config files | Clear separation of concerns |
| User space | `home/` directory | Clear separation from system |
| Skills location | `skills/` at root | First-class, easy to browse |
| No per-agent sessions | Global `state/sessions/` | Simpler, sessions reference agent by ID |

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXUS_ROOT` | Root directory | `~/nexus` |
| `NEXUS_STATE_DIR` | State directory | `~/nexus/state` |
| `NEXUS_HOME` | User home directory | `~/nexus/home` |
| `NEXUS_PROFILE` | Named profile | (none) |

When `NEXUS_PROFILE=foo`, root becomes `~/nexus-foo/`.

---

## 2. Init Command

### Behavior

```bash
nexus init [--workspace <path>]
```

**Creates everything.** Structure AND default config files.

### What Gets Created

**Directories:**
- `~/nexus/`
- `~/nexus/skills/tools/`
- `~/nexus/skills/connectors/`
- `~/nexus/skills/guides/`
- `~/nexus/state/`
- `~/nexus/state/agents/`
- `~/nexus/state/user/`
- `~/nexus/state/sessions/`
- `~/nexus/state/credentials/`
- `~/nexus/state/gateway/`
- `~/nexus/home/`

**Files:**
- `~/nexus/AGENTS.md` (from template)
- `~/nexus/state/agents/BOOTSTRAP.md` (from template)
- `~/nexus/state/agents/config.json` (default agent config)
- `~/nexus/state/credentials/config.json` (default credential config)
- `~/nexus/state/gateway/config.json` (default gateway config)

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

### Idempotent

Safe to run multiple times:
- Creates directories only if they don't exist
- Does not overwrite existing files
- Reports what was created vs already present

---

## 3. Bootstrap Files

### Files Created by Init

| File | Location | Template |
|------|----------|----------|
| `AGENTS.md` | `~/nexus/AGENTS.md` | `reference/AGENTS.md` |
| `BOOTSTRAP.md` | `state/agents/BOOTSTRAP.md` | `reference/BOOTSTRAP.md` |

### Files Created by Agent During Onboarding

| File | Location | Template |
|------|----------|----------|
| Agent IDENTITY | `state/agents/{name}/IDENTITY.md` | `reference/IDENTITY-agent.md` |
| Agent SOUL | `state/agents/{name}/SOUL.md` | `reference/SOUL.md` |
| User IDENTITY | `state/user/IDENTITY.md` | `reference/IDENTITY-user.md` |

### Agent Directory Naming

The agent directory name comes from the **bootstrap conversation**, not a CLI flag.

- User says: "Call me Atlas" → Directory: `state/agents/atlas/`
- Lowercase, spaces replaced with hyphens
- Never create `agents/default/`
- The `--agent` flag exists only for internal/testing purposes

### BOOTSTRAP.md Handling

1. Lives permanently at `state/agents/BOOTSTRAP.md`
2. Read by agent when no `state/agents/*/IDENTITY.md` exists
3. NOT deleted after onboarding (kept for creating additional agents)

---

## 4. Onboarding Flow

### Key Principle

**Onboarding is an agent conversation, not a CLI wizard.**

The user opens `~/nexus/` in their agent harness (Cursor, Claude Code, etc.). The agent reads `AGENTS.md`, detects no identity exists, reads `BOOTSTRAP.md`, and starts the conversation.

### Sequence

1. **Agent reads BOOTSTRAP.md** — Sees the "Hello, World" ritual
2. **Conversation** — Agent and user establish identity together
3. **Agent writes files** — IDENTITY.md, SOUL.md, user IDENTITY.md
4. **Silent detection** — Agent scans for credentials, harnesses, OS
5. **Auto-create bindings** — Top 2 harnesses get bindings automatically
6. **Suggest follow-ups** — Channels, skill packs, cloud sync

### Detection Phase

After establishing identity, the agent:

1. **Credential scan:** `nexus credential scan --deep`
   - Discovers env vars (ANTHROPIC_API_KEY, etc.)
   - Imports Claude CLI / Codex CLI credentials
   - See `specs/credentials/CREDENTIAL_SYSTEM.md` for details

2. **Harness detection:** Uses `aix` skill/tool
   - Detects installed agent harnesses (Cursor, Claude Code, Codex, etc.)
   - Ranks by usage frequency
   - Creates bindings for top 2 automatically

3. **OS detection:** Platform-specific suggestions
   - macOS → suggest macos-essentials skill pack
   - Linux → suggest linux-essentials skill pack

### What Is NOT Asked

Configuration is deferred — use `nexus configure` later:

| Aspect | Default | Configure Later |
|--------|---------|-----------------|
| Gateway port | 18789 | `nexus configure gateway.port` |
| Gateway bind | loopback | `nexus configure gateway.bind` |
| Model | claude-sonnet-4-20250514 | `nexus configure agents.defaults.model` |
| Credential storage | keychain | `nexus configure credentials.defaultStorage` |

---

## 5. Agent Bindings

### Key Principle

**Nexus is the source of truth. Bindings point to Nexus.**

Users must open `~/nexus/` as their workspace root for bindings to work.

### Supported Bindings

| Binding | Command | Auto-Created |
|---------|---------|--------------|
| Cursor | `nexus bindings cursor` | ✅ If top 2 |
| Claude Code | `nexus bindings claude-code` | ✅ If top 2 |
| Codex | `nexus bindings codex` | ✅ If top 2 |
| OpenCode | `nexus bindings opencode` | On request |
| Aider | `nexus bindings aider` | On request |
| Droid | `nexus bindings droid` | On request |
| Amp | `nexus bindings amp` | On request |

### CLI Commands

```bash
nexus bindings list                  # Show configured bindings
nexus bindings cursor                # Create/update Cursor binding
nexus bindings claude-code           # Create/update Claude Code binding
nexus bindings remove cursor         # Remove binding
nexus bindings refresh               # Regenerate all bindings
```

### Cursor Binding

**Creates:**
```
~/nexus/
└── .cursor/
    ├── rules                        # Static rules file
    ├── hooks.json                   # Session hook registration
    └── hooks/
        └── nexus-session-start.js   # Context injection script
```

**How it works:**

1. User opens `~/nexus/` in Cursor
2. Cursor reads `.cursor/rules` — points to AGENTS.md
3. Session start hook runs `nexus-session-start.js`
4. Script runs `nexus status --json`, reads identity files
5. Context injected into session via `additional_context`

**Session hook outputs:**
- Agent Identity (IDENTITY.md content)
- Agent Soul (SOUL.md content)
- Agent Memory (MEMORY.md content, if exists)
- User Identity (IDENTITY.md content)
- Daily memory logs (today + yesterday)

### Claude Code Binding

**Creates:**
```
~/nexus/
└── CLAUDE.md
```

**Content:** Generated file containing workspace overview, all skill metadata, CLI reference, identity info.

**Regeneration:** Run `nexus bindings claude-code` when skills change.

### Other Bindings

Each binding has its own file format requirements. See `AGENT_BINDINGS.md` for detailed specs per harness.

### Binding Parity

All bindings should provide equivalent context to agents:

| Context | Cursor | Claude Code | Codex | Others |
|---------|--------|-------------|-------|--------|
| AGENTS.md behavior | Via rules | Inline in CLAUDE.md | Via CODEX.md | TBD |
| Agent identity | Hook injection | Inline | TBD | TBD |
| User identity | Hook injection | Inline | TBD | TBD |
| Capability status | Hook injection | Inline | TBD | TBD |
| Daily memory | Hook injection | Manual | TBD | TBD |

---

## 6. Templates Reference

All templates live in `specs/workspace/reference/`:

| Template | Purpose |
|----------|---------|
| `AGENTS.md` | System behavior document |
| `BOOTSTRAP.md` | First-run ritual |
| `IDENTITY-agent.md` | Agent identity template |
| `IDENTITY-user.md` | User identity template |
| `SOUL.md` | Agent persona template |
| `cursor/rules` | Cursor rules file |
| `cursor/hooks.json` | Cursor hook registration |
| `cursor/hooks/nexus-session-start.js` | Cursor session hook script |

---

## 7. Config Structure

### Split Config Philosophy

Config is split by domain, not unified in one file:

| Config | Location | Purpose |
|--------|----------|---------|
| Agent defaults | `state/agents/config.json` | Model, behavior settings |
| Credential system | `state/credentials/config.json` | Storage, rotation, sync |
| Gateway | `state/gateway/config.json` | Port, bind, auth, access control |

### Why Split?

- **Clarity:** Each domain's config is self-contained
- **Permissions:** Different consumers may need different access
- **Modularity:** Gateway is optional; its config shouldn't pollute core
- **Discoverability:** Easy to find config for specific subsystem

---

## 8. Relationship to Other Specs

| Spec | Relationship |
|------|--------------|
| `specs/cli/` | CLI commands referenced here |
| `specs/credentials/` | Credential scan and import details |
| `specs/skills/` | Skill taxonomy and hub |
| `specs/agent-system/` | Gateway, channels, triggers |
| `specs/UNIFIED_SYSTEM.md` | Service name linking, status cascade |

---

## 9. Open Work

| Item | Status | Notes |
|------|--------|-------|
| Binding parity | NEEDS SPEC | Deep dive into all harness formats |
| aix integration | NEEDS SPEC | Harness detection specifics |
| Nexus bot bindings | NEEDS SPEC | How gateway agent gets context |
| Other harnesses | NEEDS RESEARCH | Droid, Amp, OpenCode file formats |

---

*This document is authoritative. Update subordinate specs to align with this.*
