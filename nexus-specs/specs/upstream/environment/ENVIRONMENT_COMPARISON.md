# OpenClaw vs Nexus Environment Comparison

**Status:** AUTHORITATIVE  
**Last Updated:** 2026-02-04

---

## Overview

This document captures the major architectural and philosophical differences between OpenClaw's environment approach and Nexus's environment design.

**Core Insight:** OpenClaw is a **runtime you connect to** (gateway-first). Nexus is an **environment you inhabit** (workspace-first).

---

## Summary Table

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Architecture** | Gateway-first (daemon) | Workspace-first (files + harness adapters) |
| **Visibility** | Hidden `~/.openclaw/` | Visible `~/nexus/` |
| **CLI** | Execution-focused (does things) | Discovery-focused (shows you things) |
| **Skills** | System prompt injection | On-demand file reading |
| **Multi-agent** | Config-driven | Directory-driven |
| **Credentials** | JSON files | Pointers to keychains |
| **Sessions** | JSONL files | SQLite ledger |
| **Onboarding** | Heavy wizard | Light bootstrap |
| **Portability** | Locked to openclaw runtime | Harness-agnostic |

---

## 1. Visibility vs Hiddenness

### OpenClaw

Hidden state directory (`~/.openclaw/`). Users don't know it's there unless they're told. The workspace (`~/clawd/` or wherever) is separate and optional.

```
~/.openclaw/           # Hidden from casual users
├── config.json        # Main config
├── auth-profiles.json # Credentials
├── workspace/         # Agent workspace
└── sessions/          # Session transcripts
```

### Nexus

Everything visible at `~/nexus/`. State, skills, home, agents — all in one place. No hidden folders.

```
~/nexus/               # Visible, discoverable
├── AGENTS.md          # System behavior (entry point)
├── skills/            # Capabilities
├── state/             # Runtime state
│   ├── agents/        # Per-agent identity
│   ├── user/          # User profile
│   └── nexus.db       # SQLite ledger
└── home/              # User's personal space
```

### Why This Matters

Hidden state creates hidden knowledge. When something breaks, users can't debug it. When they want to customize, they don't know where to look. Visible structure is self-documenting.

---

## 2. Harness-Agnostic vs Gateway-First

### OpenClaw

Gateway-first architecture. Everything connects to the openclaw daemon via WebSocket. Claude Code, Cursor, Codex — they're all just "clients" to the gateway. The gateway IS the runtime.

```
┌─────────────────────────────────────────────────────────┐
│                    OPENCLAW GATEWAY                      │
│                                                          │
│   CLI ──┐                                                │
│         │                                                │
│   UI ───┼──► WebSocket ──► Gateway ──► Agent Runtime    │
│         │                                                │
│   IDE ──┘                                                │
│                                                          │
│   Everything routes through the gateway daemon           │
└─────────────────────────────────────────────────────────┘
```

### Nexus

Harness-agnostic. AGENTS.md works with Cursor's rules system, Claude Code's CLAUDE.md, Codex's agents, or standalone nexus. The environment is the constant; the harness is pluggable.

```
┌─────────────────────────────────────────────────────────┐
│                    ~/nexus/ WORKSPACE                    │
│                                                          │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│   │   Cursor    │  │ Claude Code │  │    Codex    │    │
│   │             │  │             │  │             │    │
│   │ reads rules │  │ reads rules │  │ reads rules │    │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│          │                │                │            │
│          ▼                ▼                ▼            │
│   ┌─────────────────────────────────────────────────┐  │
│   │                  AGENTS.md                       │  │
│   │            (universal bootstrap)                 │  │
│   └─────────────────────────────────────────────────┘  │
│                                                          │
│   The workspace is the constant; harnesses adapt to it  │
└─────────────────────────────────────────────────────────┘
```

### Why This Matters

OpenClaw's approach means you're always running openclaw. Nexus's approach means you can use Cursor natively with full power, then switch to Claude Code, then fire up a remote codex session — and all three see the same environment, skills, identity, and context.

The workspace is the OS, not the daemon. This creates "stickiness" — the environment persists, harnesses come and go.

---

## 3. CLI Philosophy

### OpenClaw CLI

18+ top-level commands, 25+ subcommand groups. It's a full management interface:

```bash
openclaw gateway run/status/stop    # Daemon lifecycle
openclaw agent                       # Run agent turns
openclaw message send               # Send messages to channels
openclaw config set                 # Modify configuration
openclaw plugins install            # Manage plugins
openclaw cron add                   # Schedule jobs
openclaw browser                    # Browser automation
```

Comprehensive but **execution-focused**. The CLI does things.

### Nexus CLI

Focused on **orientation and discovery**:

```bash
nexus status                        # Who am I, what can I do?
nexus skill use <name>              # Get the guide
nexus credential verify             # Is this working?
nexus capabilities                  # What's available?
```

The Nexus CLI doesn't wrap execution. It doesn't have `nexus message send` because you'd just use `eve send` directly. The CLI is a **discovery layer**, not an execution layer.

### Why This Matters

OpenClaw's CLI creates lock-in. If you learn `openclaw message send --channel discord`, you can't transfer that to any other tool. 

Nexus says "here's how Discord works" (via skill) and then you use whatever Discord tool you want. Skills are portable; CLI wrappers are not.

---

## 4. Skills Injection

### OpenClaw

Skills are injected into the system prompt at session start. The agent loads all relevant skills into context before it runs.

```
System prompt gets:
├── Workspace context (AGENTS.md, SOUL.md, etc.)
├── All matching skills content
├── Channel-specific instructions
└── Tool descriptions
```

This works but it's **not portable**. If you switch to Cursor (which has its own rules system), the skills don't come along. The skill injection is baked into openclaw's agent runner.

### Nexus

Skills are **documentation that agents read on demand**. The CLI provides access:

```bash
nexus skill use gog    # Agent reads the guide
gog gmail search "is:unread"    # Agent uses the tool directly
```

The skill content lives in files. Any harness can read files. Cursor can load skill files via its rules. Claude Code can read them. Codex can read them. The mechanism is universal.

### Why This Matters

OpenClaw's approach couples skills to the runtime. Nexus's approach makes skills portable across any agent that can read files.

---

## 5. Multi-Agent Architecture

### OpenClaw

Multi-agent is supported but agent identity is config-driven. Each agent has an `agentId` in config, and you route messages to agents via bindings:

```json
{
  "agents": {
    "list": [
      { "id": "work", "name": "Work Bot" },
      { "id": "personal", "name": "Personal Bot" }
    ]
  },
  "routing": {
    "bindings": [
      { "agentId": "work", "match": { "channel": "slack" } }
    ]
  }
}
```

### Nexus

Agents are **first-class directories** with their own identity files:

```
~/nexus/state/agents/
├── atlas/
│   ├── SOUL.md
│   ├── IDENTITY.md
│   └── MEMORY.md
├── code-worker/
│   ├── SOUL.md
│   └── IDENTITY.md
```

Each agent is a self-contained identity. You can `cd` into an agent and understand who it is. The Agents Ledger tracks their sessions and turns.

### Why This Matters

Directory-based agents are inspectable and editable. Config-based agents are opaque.

---

## 6. Credentials

### OpenClaw

Credentials in `auth-profiles.json` with rotation and cooldown tracking. OAuth tokens refresh automatically. API keys stored in JSON.

```json
{
  "anthropic:main": {
    "type": "api_key",
    "key": "sk-ant-..."
  },
  "google:tyler": {
    "type": "oauth",
    "accessToken": "ya29...",
    "refreshToken": "1//...",
    "expiresAt": 1706000000000
  }
}
```

### Nexus

Similar approach but with **pointers**:

```yaml
# ~/nexus/state/credentials/google.yaml
google:
  type: oauth
  storage: keychain    # or 1password, env, file
  account: tyler@gmail.com
  keychain_service: nexus-google-oauth
```

Nexus prefers storing pointers to where secrets live (keychain, 1password, env vars) rather than the secrets themselves.

### Why This Matters

JSON files with tokens are leakable. Pointers to keychains are safer and integrate with existing secret management.

---

## 7. Onboarding

### OpenClaw

Heavy wizard-based onboarding. `openclaw onboard` walks you through 20+ auth providers, channel setup, daemon installation, etc. Interactive TUI experience.

**Pros:** Comprehensive, guided  
**Cons:** Overwhelming, all-or-nothing

### Nexus

Lighter bootstrap. `nexus init` creates the structure, asks a few questions (name, agent identity), and you're done. Capabilities are added progressively as you need them.

**Pros:** Low barrier, grow into complexity  
**Cons:** Less hand-holding

### Why This Matters

OpenClaw's onboarding is comprehensive but overwhelming. Nexus's approach is "start simple, grow into complexity." Users add skills and credentials as they need them.

---

## 8. State Storage

### OpenClaw

```
Config:       config.json (single file, all config)
Sessions:     JSONL files + sessions.json index
Credentials:  auth-profiles.json
Skills:       Markdown files in skills/
```

### Nexus

```
Config:       Split by domain (agents.yaml, channels.yaml, etc.)
Sessions:     SQLite (Agents Ledger)
Credentials:  YAML pointers + secrets in keychains
Skills:       Markdown files in skills/ (same)
```

### Why This Matters

- **SQLite** is queryable, atomic, and doesn't sprawl into thousands of files
- **Split config** is easier to understand and version
- **Credential pointers** are more secure

---

## 9. Bootstrap Files

### OpenClaw

Seven bootstrap files:

| File | Purpose |
|------|---------|
| `AGENTS.md` | Primary workspace instructions |
| `SOUL.md` | Agent identity/personality |
| `IDENTITY.md` | Agent name, emoji (often empty) |
| `USER.md` | User profile |
| `TOOLS.md` | Local tool notes (camera names, SSH hosts) |
| `HEARTBEAT.md` | Heartbeat behavior configuration |
| `BOOTSTRAP.md` | Bootstrap/init instructions |

### Nexus

Three core files per agent, plus user identity:

| File | Purpose |
|------|---------|
| `AGENTS.md` | System behavior (workspace root) |
| `state/agents/{name}/SOUL.md` | Personality/values per agent |
| `state/agents/{name}/IDENTITY.md` | Name, emoji, vibe per agent |
| `state/user/IDENTITY.md` | User profile |

### Why This Matters

Nexus is more structured — identity files are per-agent, not global. OpenClaw's TOOLS.md and USER.md are folded into the skill system and user identity file.

---

## 10. The "Workspace as OS" Philosophy

### OpenClaw

The gateway is the OS. Channels, plugins, skills, agents — they're all managed by the gateway daemon. The workspace is just where files live.

```
Gateway daemon owns:
├── Channel connections
├── Plugin loading
├── Skill injection
├── Agent execution
├── Session storage
└── Everything
```

### Nexus

The workspace is the OS. The structure of `~/nexus/` defines what's possible. NEX (the pipeline) reads from this structure. Harnesses adapt to this structure. The workspace is the source of truth.

```
Workspace structure owns:
├── skills/ → capabilities
├── state/agents/ → agent identities
├── state/credentials/ → auth
├── AGENTS.md → behavior
└── Everything
```

When you run Cursor in `~/nexus/`, it picks up AGENTS.md and knows the rules. When you run Claude Code, it picks up the same rules via CLAUDE.md symlink. When you run openclaw (as a tool), it reads the same config.

### Why This Matters

The workspace persists. Harnesses come and go. This is the fundamental inversion — instead of adapting to the runtime, the runtimes adapt to the workspace.

---

## Architectural Decision Summary

| Decision | OpenClaw Choice | Nexus Choice | Rationale |
|----------|-----------------|--------------|-----------|
| **Primary interface** | Gateway daemon | Workspace files | Harness portability |
| **State visibility** | Hidden | Visible | Debuggability, discoverability |
| **CLI purpose** | Execution | Discovery | Tool portability |
| **Skill delivery** | System prompt injection | On-demand reading | Harness portability |
| **Agent identity** | Config entries | Directory structure | Inspectability |
| **Credential storage** | JSON files | Keychain pointers | Security |
| **Session storage** | JSONL files | SQLite | Queryability |
| **Config structure** | Monolithic | Domain-split | Clarity |
| **Onboarding** | Heavy wizard | Light bootstrap | Low barrier |

---

## What Nexus Adopts from OpenClaw

Despite the architectural differences, Nexus adopts many proven patterns:

1. **Session key format** — `agent:{id}:{scope}` works well
2. **Compaction approach** — Summary + kept messages
3. **Streaming phases** — Tool → block → final
4. **Block chunking** — Paragraph/sentence break preferences
5. **Human-like delays** — 800-2500ms between chunks
6. **Failover logic** — Profile rotation, cooldowns
7. **Deduplication** — TTL-based cache
8. **Bootstrap file concept** — AGENTS.md, SOUL.md, IDENTITY.md

The implementation details are battle-tested; only the architecture changes.

---

## See Also

- `./WORKSPACE_STRUCTURE.md` — OpenClaw workspace details
- `./CLI_SYSTEM.md` — OpenClaw CLI reference
- `./SKILLS_SYSTEM.md` — OpenClaw skills approach
- `./HARNESS_INTEGRATIONS.md` — OpenClaw harness patterns
- `../OVERVIEW.md` — Nexus environment overview
- `../foundation/WORKSPACE_SYSTEM.md` — Nexus workspace spec

---

*This document captures the philosophical and architectural differences between OpenClaw and Nexus environments.*
