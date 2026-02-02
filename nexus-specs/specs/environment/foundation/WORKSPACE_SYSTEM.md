# Workspace System Specification

**Status:** AUTHORITATIVE DOCUMENT  
**Last Updated:** 2026-01-29

---

## Overview

This document is the **authoritative specification** for the Nexus workspace system. It defines how initialization, onboarding, project structure, bootstrap files, and agent bindings work together.

**Subordinate specs must align with this document:**
- `INIT.md` — Init command details
- `PROJECT_STRUCTURE.md` — Directory layout
- `BOOTSTRAP_FILES.md` — File templates
- `harnesses/HARNESS_BINDINGS.md` — IDE/harness integrations
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
│  ~/nexus/state/agents/                 ~/nexus/state/nexus.db (System of Record)
│  ~/nexus/state/user/                                                        │
│  ~/nexus/state/credentials/                                                 │
│  ~/nexus/state/gateway/                                                     │
│  ~/nexus/state/cortex/                                                      │
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
│  Agent runs: nexus bindings detect --json (uses AIX internally)            │
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
│  Agent runs: nexus bindings detect --json                                   │
│  → Returns harnesses ranked by AIX session count                            │
│  → Identifies supported harnesses (Cursor, Claude Code, OpenCode)           │
│  → Codex is NOT supported (no lifecycle hooks)                              │
│                                                                             │
│  Agent creates bindings for top 2 supported harnesses:                      │
│  → nexus bindings create cursor                                             │
│  → nexus bindings create claude-code                                        │
│                                                                             │
│  Agent: "I see you use Cursor and Claude Code most. I've set up bindings    │
│          so they connect to Nexus. Want me to set up others?"               │
│                                                                             │
│  Creates:                                                                   │
│  • Cursor: .cursor/hooks.json, .cursor/hooks/nexus-session-start.js         │
│  • Claude Code: CLAUDE.md, .claude/settings.json                            │
│  • OpenCode: .opencode/plugins/nexus-bootstrap.ts                           │
│                                                                             │
│  User must open ~/nexus/ as workspace root for bindings to work.            │
│                                                                             │
│  If AIX not available: Agent prompts user to install AIX or manually        │
│  specify which harnesses they use.                                          │
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
│   ├── nexus.db                      # System of Record (SQLite)
│   │                                 # Contains: Events, Agents, Identity, Nexus ledgers
│   │                                 # Sessions/turns/messages stored here, not files
│   │
│   ├── cortex/                       # Derived data layer
│   │   └── {agentId}.db              # Per-agent embeddings, episodes, analyses
│   │
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
├── .cursor/                          # Cursor binding (if configured)
│   ├── hooks.json
│   └── hooks/
│       └── nexus-session-start.js
│
├── .claude/                          # Claude Code binding (if configured)
│   └── settings.json
│
└── .opencode/                        # OpenCode binding (if configured)
    └── plugins/
        └── nexus-bootstrap.ts
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State visibility | `state/` not hidden | Transparency, discoverability |
| Config split | Per-domain config files | Clear separation of concerns |
| User space | `home/` directory | Clear separation from system |
| Skills location | `skills/` at root | First-class, easy to browse |
| Sessions in DB | `nexus.db` (Agents Ledger) | Structured queries, no file sprawl |
| Cortex per-agent | `cortex/{agentId}.db` | Isolation, embeddings stay local |

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXUS_ROOT` | Root directory | `~/nexus` |
| `NEXUS_STATE_DIR` | State directory | `~/nexus/state` |
| `NEXUS_HOME` | User home directory | `~/nexus/home` |
| `NEXUS_PROFILE` | Named profile | (none) |

When `NEXUS_PROFILE=foo`, root becomes `~/nexus-foo/`.

### Data Layer Integration

The workspace includes the **System of Record** and **Derived Data Layer** from the runtime architecture:

| Component | Location | Purpose |
|-----------|----------|---------|
| **System of Record** | `state/nexus.db` | SQLite with four ledgers |
| **Cortex** | `state/cortex/{agentId}.db` | Per-agent derived data |

**System of Record (nexus.db)** contains four ledgers:

| Ledger | What It Stores |
|--------|----------------|
| **Events Ledger** | Raw incoming events from adapters |
| **Agents Ledger** | Sessions, turns, messages, tool calls |
| **Identity Graph** | Entities, aliases, memberships |
| **Nexus Ledger** | Pipeline traces for observability |

**Cortex** is the derived layer — built from ledger data:
- **Episodes:** Summarized chunks for context retrieval
- **Facets:** Structured observations about entities
- **Embeddings:** Vector search over conversations

> **Key insight:** Sessions are NOT stored as files. They're written to the Agents Ledger in `nexus.db`, enabling structured queries and avoiding file sprawl.

See `specs/data/` for full ledger and cortex specifications.

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
- `~/nexus/state/credentials/`
- `~/nexus/state/gateway/`
- `~/nexus/state/cortex/`
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
   - See `../capabilities/credentials/CREDENTIAL_SYSTEM.md` for details

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

### Supported Harnesses

| Harness | Command | Auto-Created | Support |
|---------|---------|--------------|---------|
| **Cursor** | `nexus bindings create cursor` | ✅ If top 2 | ✅ Full |
| **Claude Code** | `nexus bindings create claude-code` | ✅ If top 2 | ✅ Full |
| **OpenCode** | `nexus bindings create opencode` | ✅ If top 2 | ✅ Full |
| **Codex** | N/A | ❌ Never | ⛔ Not supported |

> **Codex:** Not supported due to lack of lifecycle hooks. Cannot inject or refresh context.

### CLI Commands

```bash
nexus bindings detect                # Detect harnesses via AIX
nexus bindings list                  # Show configured bindings
nexus bindings create cursor         # Create Cursor binding
nexus bindings create claude-code    # Create Claude Code binding
nexus bindings create opencode       # Create OpenCode binding
nexus bindings verify                # Verify bindings are correct
nexus bindings refresh               # Regenerate all bindings
nexus bindings remove cursor         # Remove binding
```

### Harness Detection

Uses AIX to detect which harnesses the user has, ranked by usage:

```bash
nexus bindings detect --json
```

**Requires:** AIX installed (`brew install Napageneral/tap/aix`)

No fallback without AIX — detection requires accurate session data.

### Cursor Binding

**Creates:**
```
~/nexus/
├── AGENTS.md                        # Instructions (already exists)
└── .cursor/
    ├── hooks.json                   # Hook config (startup + compact)
    └── hooks/
        └── nexus-session-start.js   # Context injection script
```

**How it works:**

1. User opens `~/nexus/` in Cursor
2. Session start hook runs `nexus-session-start.js`
3. Script runs `nexus status --json`, reads identity files
4. Context injected via `additional_context`
5. Hook also runs after compaction (re-injects context)

### Claude Code Binding

**Creates:**
```
~/nexus/
├── CLAUDE.md                        # Instructions (identical to AGENTS.md)
└── .claude/
    └── settings.json                # Hook config (reuses Cursor script)
```

### OpenCode Binding

**Creates:**
```
~/nexus/
├── AGENTS.md                        # Instructions (already exists)
└── .opencode/
    └── plugins/
        └── nexus-bootstrap.ts       # Native TypeScript plugin
```

**Key advantage:** OpenCode injects context on every LLM call (not just session start).

### Context Injection

All supported bindings inject:

| Context | Cursor | Claude Code | OpenCode |
|---------|--------|-------------|----------|
| Instructions | `AGENTS.md` | `CLAUDE.md` | `AGENTS.md` |
| Agent identity | Hook | Hook | Plugin |
| User identity | Hook | Hook | Plugin |
| Daily memory | Hook | Hook | Plugin |
| Post-compaction refresh | ✅ Yes | ✅ Yes | ✅ Yes |

**Full specification:** See `harnesses/HARNESS_BINDINGS.md`

---

## 6. Templates Reference

### Bootstrap Templates

Located in `bootstrap-templates/`:

| Template | Purpose |
|----------|---------|
| `AGENTS.md` | System behavior document |
| `BOOTSTRAP.md` | First-run ritual |
| `IDENTITY-agent.md` | Agent identity template |
| `IDENTITY-user.md` | User identity template |
| `SOUL.md` | Agent persona template |

> **Note:** See `BOOTSTRAP_FILES.md` for detailed template purposes and usage.

### Harness Binding Templates

Located in `harnesses/templates/`:

| Harness | Files |
|---------|-------|
| Cursor | `cursor/hooks.json`, `cursor/nexus-session-start.js` |
| Claude Code | `claude-code/settings.json` |
| OpenCode | `opencode/nexus-bootstrap.ts` |
| Codex | `codex/README.md` (limitations doc) |

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
| `../interface/cli/` | CLI commands |
| `../capabilities/` | Skills, credentials, capability mapping |
| `../../data/ledgers/` | System of Record (nexus.db schema) |
| `../../data/cortex/` | Derived layer (embeddings, episodes) |
| `../../runtime/` | NEX, adapters, broker, hooks |
| `../OVERVIEW.md` | Environment overview |

---

## 9. Open Work

| Item | Status | Notes |
|------|--------|-------|
| Harness bindings | ✅ COMPLETE | See `harnesses/HARNESS_BINDINGS.md` |
| AIX integration | ✅ COMPLETE | `nexus bindings detect` |
| Cursor binding | ✅ COMPLETE | Hooks + script templates |
| Claude Code binding | ✅ COMPLETE | Settings + shared script |
| OpenCode binding | ✅ COMPLETE | Native TypeScript plugin |
| Codex binding | ⛔ NOT SUPPORTED | No lifecycle hooks |
| Nexus bot bindings | NEEDS SPEC | How gateway agent gets context |
| CLI implementation | TODO | Implement `nexus bindings` commands |

---

*This document is authoritative. Update subordinate specs to align with this.*
