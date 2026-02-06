# OpenClaw Architecture Overview

**Status:** COMPLETE  
**Last Updated:** 2026-02-03  
**Version:** v2026.2.3

---

## Overview

OpenClaw is a multi-platform messaging automation system that connects AI agents to communication channels (WhatsApp, Discord, Telegram, etc.). It runs as a gateway server with WebSocket/HTTP interfaces, managing sessions, executing agents, and delivering responses.

---

## Repository Structure

```
openclaw/
├── src/                    # Core source code (2500+ files)
├── extensions/             # Channel adapters & plugins (31 extensions)
├── apps/                   # Native applications (macOS, iOS, Android)
├── ui/                     # Web control UI (Lit components)
├── packages/               # Compatibility shims (clawdbot, moltbot)
├── docs/                   # Documentation (600+ files)
├── skills/                 # Agent skills definitions
├── scripts/                # Build and utility scripts
├── package.json            # Root package (pnpm workspaces)
├── pnpm-workspace.yaml     # Workspace config
└── openclaw.mjs            # CLI entry point
```

**Key insight:** The "core" is in `src/` at the root, not in a separate `packages/core/` directory. The `packages/` folder only contains legacy compatibility shims.

---

## Core Directory (`src/`)

### Application Core

| Directory | Files | Purpose |
|-----------|-------|---------|
| `gateway/` | 191 | WebSocket server, HTTP routes, client connections, RPC methods |
| `agents/` | 447 | Agent execution, model config, tools, skills, sandbox |
| `auto-reply/` | 208 | Message dispatch, command detection, reply orchestration |
| `sessions/` | 7 | Session management, send policies, transcript events |
| `config/` | 133 | Configuration schema, validation, migrations |
| `cli/` | 170 | Command-line interface, subcommands |
| `commands/` | 224 | CLI command handlers and business logic |

### Channel Integrations (in `src/`)

| Directory | Purpose |
|-----------|---------|
| `channels/` | Channel abstraction layer, registry, targets |
| `discord/` | Discord bot integration |
| `slack/` | Slack workspace integration |
| `telegram/` | Telegram bot integration |
| `signal/` | Signal messaging integration |
| `web/` | WhatsApp Web via browser automation |
| `imessage/` | iMessage integration (macOS) |
| `line/` | LINE messaging integration |
| `feishu/` | Feishu/Lark integration |

### Infrastructure

| Directory | Files | Purpose |
|-----------|-------|---------|
| `infra/` | 151 | Networking, file I/O, retries, updates, outbound delivery |
| `plugins/` | 30+ | Plugin loading, registry, discovery, runtime |
| `hooks/` | 39 | Hook system for extensibility |
| `memory/` | 39 | Vector memory, embeddings, search |
| `routing/` | 4 | Message routing logic |
| `security/` | 9 | Security utilities |

### Support Systems

| Directory | Purpose |
|-----------|---------|
| `browser/` | Playwright/CDP browser automation |
| `daemon/` | System service management (launchd, systemd) |
| `cron/` | Scheduled job execution |
| `media/` | Media handling and processing |
| `tts/` | Text-to-speech |
| `pairing/` | Device pairing and authentication |
| `providers/` | AI provider integrations (Copilot, Google, Qwen) |

---

## Extensions (`extensions/`)

Extensions are channel adapters and plugins loaded at runtime.

### Channel Adapters (19)

| Extension | Platform |
|-----------|----------|
| `whatsapp` | WhatsApp Business/Personal |
| `telegram` | Telegram Bot API |
| `discord` | Discord Bot |
| `slack` | Slack App |
| `signal` | Signal Messenger |
| `imessage` | iMessage (macOS) |
| `bluebubbles` | iMessage via BlueBubbles |
| `matrix` | Matrix Protocol |
| `msteams` | Microsoft Teams |
| `googlechat` | Google Workspace Chat |
| `line` | LINE Messaging |
| `feishu` | Feishu/Lark |
| `mattermost` | Mattermost |
| `nextcloud-talk` | Nextcloud Talk |
| `nostr` | Nostr Protocol |
| `tlon` | Urbit/Tlon |
| `twitch` | Twitch Chat |
| `zalo` | Zalo Bot |
| `zalouser` | Zalo Personal |

### Auth Providers (5)

| Extension | Purpose |
|-----------|---------|
| `copilot-proxy` | GitHub Copilot proxy |
| `google-antigravity-auth` | Google Cloud Code Assist |
| `google-gemini-cli-auth` | Gemini CLI OAuth |
| `minimax-portal-auth` | MiniMax Portal |
| `qwen-portal-auth` | Qwen Portal |

### Utilities (7)

| Extension | Purpose |
|-----------|---------|
| `memory-core` | Core memory search |
| `memory-lancedb` | LanceDB long-term memory |
| `voice-call` | Telephony (Twilio, Telnyx, Plivo) |
| `llm-task` | Structured JSON tasks |
| `lobster` | Workflow pipelines |
| `open-prose` | OpenProse VM skill pack |
| `diagnostics-otel` | OpenTelemetry exporter |

---

## Native Apps (`apps/`)

| App | Platform | Technology |
|-----|----------|------------|
| `macos/` | macOS menu bar | Swift |
| `ios/` | iOS | Swift |
| `android/` | Android | Kotlin |
| `shared/` | Cross-platform | Swift Package (OpenClawKit) |

Native apps communicate with the gateway via WebSocket protocol.

---

## Key Architectural Components

### 1. Gateway Server

The central process that:
- Manages WebSocket connections from clients (CLI, UI, native apps)
- Serves HTTP endpoints (Control UI, APIs, webhooks)
- Coordinates channel monitors (Discord, Telegram, etc.)
- Routes messages to agents and back
- Handles device pairing and authentication

### 2. Agent System

Agent execution is delegated to `@mariozechner/pi-coding-agent`:
- Sessions track conversation state
- Transcripts stored as JSONL files
- Context assembled from history + compaction summaries
- Tools executed during agent runs
- Streaming responses delivered to clients

### 3. Channel System

Each channel has:
- **Monitor** — Listens for inbound messages
- **Sender** — Delivers outbound messages
- **Plugin** — Configuration and behavior

Channels can be in `src/` (built-in) or `extensions/` (plugin).

### 4. Plugin System

Plugins extend OpenClaw via:
- `register(api)` — Called at load time
- Hook registration — Lifecycle events
- Tool registration — Agent capabilities
- Channel registration — New platforms

---

## Build System

| Tool | Purpose |
|------|---------|
| pnpm | Package manager and workspaces |
| tsdown | TypeScript build |
| Vite | UI build |
| Vitest | Testing (unit, e2e, extensions) |
| turbo | Monorepo task orchestration |

---

## Configuration

- **Location:** `~/.openclaw/` (hidden directory)
- **Main config:** `config.json` (JSON5 format)
- **Sessions:** `workspace/sessions/` with `sessions.json` index
- **Credentials:** Per-channel in config

---

## External Dependencies

| Dependency | Purpose |
|------------|---------|
| `@mariozechner/pi-coding-agent` | Core agent execution, LLM calls |
| Anthropic/OpenAI SDKs | Model providers |
| Playwright | Browser automation |
| SQLite (via better-sqlite3) | Memory/search storage |

---

*This document captures OpenClaw's architecture on its own terms, without mapping to Nexus concepts.*
