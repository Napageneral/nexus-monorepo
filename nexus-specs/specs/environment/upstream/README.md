# OpenClaw Environment System - Upstream Reference

**Status:** REFERENCE DOCUMENT  
**Source:** OpenClaw upstream (`openclaw/`)  
**Last Updated:** 2026-02-04

---

## Overview

OpenClaw is an AI gateway and agent runtime system that provides:

- **Gateway server** with WebSocket and HTTP APIs
- **Channel adapters** (WhatsApp, Telegram, Discord, iMessage, Signal, Slack, etc.)
- **Agent workspace** for identity, memory, and behavior configuration
- **Skills system** for extending agent capabilities
- **TUI and web UI** for interaction

This folder documents OpenClaw's environment architecture for reference when designing Nexus systems.

---

## How OpenClaw Maps to Nexus Layers

| Nexus Layer | OpenClaw Equivalent | Description |
|-------------|---------------------|-------------|
| **Foundation** | State directory + Workspace | `~/.openclaw/` (config, sessions) + `~/.openclaw/workspace/` (agent files) |
| **Capabilities** | Skills + Plugins | `skills/` directory + channel plugins in `extensions/` |
| **Interface** | CLI + Gateway | `openclaw` CLI commands + WebSocket/HTTP gateway |

### Foundation Layer Mapping

| Nexus Component | OpenClaw Component |
|-----------------|-------------------|
| `~/nexus/` | `~/.openclaw/` (state) + `~/.openclaw/workspace/` (workspace) |
| `state/agents/{id}/` | `~/.openclaw/agents/{id}/sessions/` |
| `state/user/IDENTITY.md` | `~/.openclaw/workspace/USER.md` |
| `skills/` | `skills/` (bundled) + `~/.openclaw/workspace/skills/` (custom) |
| `AGENTS.md` | `~/.openclaw/workspace/AGENTS.md` |
| `config.json` | `~/.openclaw/openclaw.json` |

### Key Differences

| Aspect | OpenClaw | Nexus |
|--------|----------|-------|
| **Primary Interface** | Gateway (channels, web UI) | IDE-first (Cursor, Claude Code) |
| **State Directory** | `~/.openclaw/` | `~/nexus/state/` |
| **Workspace** | `~/.openclaw/workspace/` | `~/nexus/home/` |
| **Config Format** | Single JSON (`openclaw.json`) | Multiple files |
| **Identity Location** | Workspace (`IDENTITY.md`, `USER.md`) | `state/agents/{id}/IDENTITY.md` |
| **Session Storage** | `~/.openclaw/agents/{id}/sessions/` | `state/agents/{id}/sessions/` |
| **IDE Integration** | None (gateway-first) | Native (harness bindings) |
| **Bootstrap** | TUI-driven first-run conversation | Simpler identity setup |

---

## Document Index

### This Directory (`upstream/`)

| Document | Description |
|----------|-------------|
| **[WORKSPACE_STRUCTURE.md](./WORKSPACE_STRUCTURE.md)** | State directory, workspace layout, bootstrap files, config paths |
| **[ONBOARDING_FLOW.md](./ONBOARDING_FLOW.md)** | `openclaw onboard` command, interactive/non-interactive flows, auth setup |
| **[HARNESS_INTEGRATIONS.md](./HARNESS_INTEGRATIONS.md)** | How OpenClaw integrates with IDE harnesses, context injection |

### Related Upstream Docs (Foundation)

| Document | Description |
|----------|-------------|
| `foundation/upstream/UPSTREAM_WORKSPACE.md` | Detailed workspace behavior (older, pre-rename) |
| `foundation/upstream/UPSTREAM_GATEWAY_CHANNELS.md` | Gateway and channel system details |
| `foundation/upstream/UPSTREAM_STRUCTURE.md` | OpenCode (predecessor) project structure |

### Related Upstream Docs (Capabilities)

| Document | Description |
|----------|-------------|
| `capabilities/skills/upstream/UPSTREAM_SKILLS.md` | Skills system details |
| `capabilities/credentials/upstream/UPSTREAM_CREDENTIALS.md` | Credential handling |

### Related Upstream Docs (Interface)

| Document | Description |
|----------|-------------|
| `interface/cli/upstream/UPSTREAM_CLI.md` | CLI command reference |

---

## OpenClaw Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OpenClaw System                                    │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Gateway Server (:18789)                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │ WebSocket   │  │ HTTP API    │  │ Control UI  │  │ OpenAI      │  │  │
│  │  │ Core        │  │ /v1/...     │  │ (Web)       │  │ Compat      │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │  │
│  │         │                │                │                │          │  │
│  │         └────────────────┴────────────────┴────────────────┘          │  │
│  │                                │                                       │  │
│  │  ┌─────────────────────────────┴──────────────────────────────────┐   │  │
│  │  │                    Channel Manager                              │   │  │
│  │  │  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐ │   │  │
│  │  │  │WhatsApp │ │ Telegram │ │ Discord │ │ Signal │ │ iMessage │ │   │  │
│  │  │  └─────────┘ └──────────┘ └─────────┘ └────────┘ └──────────┘ │   │  │
│  │  └────────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      State Directory (~/.openclaw/)                    │  │
│  │  ┌─────────────────┐  ┌────────────────┐  ┌───────────────────────┐  │  │
│  │  │ openclaw.json   │  │ credentials/   │  │ agents/{id}/sessions/ │  │  │
│  │  │ (config)        │  │ (OAuth tokens) │  │ (transcripts)         │  │  │
│  │  └─────────────────┘  └────────────────┘  └───────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    Workspace (~/.openclaw/workspace/)                  │  │
│  │  ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐ │  │
│  │  │AGENTS.md │ │ SOUL.md │ │ USER.md  │ │IDENTITY.md │ │  memory/   │ │  │
│  │  └──────────┘ └─────────┘ └──────────┘ └────────────┘ └────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAW_STATE_DIR` | State directory override | `~/.openclaw` |
| `OPENCLAW_CONFIG_PATH` | Config file path override | `$STATE_DIR/openclaw.json` |
| `OPENCLAW_OAUTH_DIR` | OAuth credentials dir | `$STATE_DIR/credentials` |
| `OPENCLAW_PROFILE` | Named profile | `default` |
| `OPENCLAW_NIX_MODE` | Nix deployment mode | `0` |
| `OPENCLAW_GATEWAY_PORT` | Gateway port | `18789` |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway auth token | (generated) |

Legacy aliases (`CLAWDBOT_*`) are still supported for backward compatibility.

---

## Quick Reference

### Installation

```bash
# Install via npm
npm install -g openclaw

# Or Homebrew
brew install openclaw/tap/openclaw
```

### First-Time Setup

```bash
# Interactive onboarding
openclaw onboard

# Non-interactive (requires explicit risk acknowledgement)
openclaw onboard --non-interactive --accept-risk \
  --auth-choice setup-token \
  --install-daemon
```

### Common Commands

```bash
openclaw status          # Show gateway and agent status
openclaw health          # Health check
openclaw doctor          # Diagnose issues
openclaw configure       # Modify configuration
openclaw channels status # Channel status
openclaw skill list      # List available skills
```

### Key Paths

```
~/.openclaw/
├── openclaw.json           # Main config
├── credentials/oauth.json  # OAuth tokens
├── agents/{id}/sessions/   # Session transcripts
├── skills/                 # Managed skills
├── workspace/              # Agent workspace (default)
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── USER.md
│   ├── IDENTITY.md
│   ├── TOOLS.md
│   ├── HEARTBEAT.md
│   ├── BOOTSTRAP.md        # First-run only
│   └── memory/
```

---

## See Also

- [OpenClaw Documentation](https://docs.openclaw.ai/)
- `OVERVIEW.md` — Nexus environment overview
- `foundation/` — Nexus workspace specs
- `capabilities/` — Nexus skills and credentials

---

*This folder documents OpenClaw behavior for comparison with Nexus. The authoritative Nexus specs are in the parent directories.*
