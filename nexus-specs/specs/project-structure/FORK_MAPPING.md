# Openclaw → Nexus Fork Mapping

**Status:** ALIGNED WITH SPECS  
**Date:** January 30, 2026  
**Last Updated:** 2026-02-09  
**Purpose:** Authoritative mapping of every openclaw component to its Nexus destination

---

## How to Read This Document

Every directory in the openclaw codebase is listed with a decision and destination. This is the **execution guide** for the fork transformation. Agents should follow this document file-by-file.

**Architecture references:**
- `nex/NEX.md` — 8-stage pipeline, NexusRequest lifecycle
- `nex/NEXUS_REQUEST.md` — Data bus schema
- `nex/DAEMON.md` — Process lifecycle
- `adapters/ADAPTER_SYSTEM.md` — External CLI adapter model
- `broker/AGENT_ENGINE.md` — pi-coding-agent wrapper
- `broker/SESSION_LIFECYCLE.md` — Session management
- `data/ledgers/*.md` — System of Record schemas
- `project-structure/NEXUS_STRUCTURE.md` — Target codebase layout

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 **ADAPT** | Keep and modify for Nexus |
| 🔴 **DROP** | Remove entirely |
| 🟡 **REPLACE** | Replace with Nexus-specific implementation |
| 🔵 **NEW** | Doesn't exist in openclaw — build from spec |
| 🔶 **DEFER** | Keep for now, transform later (not V1 critical) |

---

## Target Architecture Summary

```
nex/                              # The fork (Napageneral/nex)
├── src/
│   ├── nex/                      # 🔵 NEX orchestrator (central, NEW)
│   │   ├── pipeline.ts           #    8-stage pipeline executor
│   │   ├── request.ts            #    NexusRequest types (Zod)
│   │   ├── daemon/               #    Process lifecycle, PID, signals
│   │   ├── bus/                   #    Event bus + SSE (from openclaw bus/)
│   │   ├── plugins/              #    NEX plugin system
│   │   ├── adapters/             #    Adapter Manager (spawn/supervise)
│   │   └── stages/               #    Stage implementations (8 files)
│   │
│   ├── broker/                   # 🟡 Agent execution (from agents/ + sessions/ + auto-reply/)
│   │   ├── engine.ts             #    pi-coding-agent wrapper
│   │   ├── context.ts            #    Context assembly (3 layers)
│   │   ├── sessions/             #    Session lifecycle, queue, aliases
│   │   ├── streaming.ts          #    BrokerStreamHandle
│   │   └── compaction.ts         #    Compaction with metadata
│   │
│   ├── iam/                      # 🟡 Identity & Access (from routing/ + config/sessions/)
│   │   ├── identity.ts           #    Identity Graph resolution
│   │   ├── policies.ts           #    ACL policy evaluation (YAML)
│   │   ├── grants.ts             #    Dynamic permissions
│   │   └── audit.ts              #    Decision logging
│   │
│   ├── db/                       # 🔵 Data layer (NEW — replaces storage/)
│   │   ├── ledgers.ts            #    SQLite connections
│   │   ├── events.ts             #    Events Ledger (raw SQL)
│   │   ├── agents.ts             #    Agents Ledger (raw SQL)
│   │   ├── identity.ts           #    Identity Ledger (raw SQL)
│   │   ├── nexus.ts              #    Nexus Ledger (raw SQL)
│   │   └── migrations/           #    Schema versioning
│   │
│   ├── tools/                    # 🟢 Tool system (from agents/tools/ + commands/)
│   ├── providers/                # 🟢 LLM providers (keep as-is)
│   ├── config/                   # 🟢 Config system (adapt for nex.yaml)
│   ├── cli/                      # 🟢 CLI commands (adapt)
│   ├── gateway/                  # 🟢 HTTP server (adapt → NEX HTTP endpoint)
│   ├── infra/                    # 🟢 Infrastructure utils (keep)
│   └── ...                       #    (other adapted modules)
│
├── extensions/                   # External adapter processes (CLI executables)
│   ├── imessage/                 #    Eve adapter
│   ├── discord/                  #    Discord adapter
│   ├── telegram/                 #    Telegram adapter
│   └── ...
│
├── cortex/                       # 🔵 Go process (LATER — separate)
├── skills/                       # 🟢 Skill definitions (adapt)
└── ...
```

---

## src/ — Component-by-Component Mapping

### 🔵 NEW: `src/nex/` — NEX Orchestrator

This is the heart of Nexus and does NOT exist in openclaw. Build from specs.

| New File/Dir | Spec | Source Material |
|-------------|------|----------------|
| `nex/pipeline.ts` | `nex/NEX.md` | New — 8-stage sync pipeline |
| `nex/request.ts` | `nex/NEXUS_REQUEST.md` | New — NexusRequest + NexusEvent Zod schemas |
| `nex/daemon/` | `nex/DAEMON.md` | Adapt from `src/daemon/` (PID lock, signals, startup) |
| `nex/bus/` | `nex/BUS_ARCHITECTURE.md` | Adapt from openclaw bus — keep pub/sub, change event types |
| `nex/plugins/` | `nex/PLUGINS.md` | New — NEXPlugin interface, loader, hook points |
| `nex/adapters/manager.ts` | `adapters/ADAPTER_SYSTEM.md` | New — spawn/supervise external adapter processes |
| `nex/adapters/protocol.ts` | `adapters/ADAPTER_SYSTEM.md` | New — JSONL CLI protocol handling |
| `nex/stages/receiveEvent.ts` | `nex/NEX.md` | New — create NexusRequest from NexusEvent |
| `nex/stages/resolveIdentity.ts` | `nex/NEX.md` | New — query Identity Graph |
| `nex/stages/resolveAccess.ts` | `nex/NEX.md` | New — evaluate ACL policies |
| `nex/stages/runAutomations.ts` | `nex/NEX.md` | New — match and execute automations |
| `nex/stages/assembleContext.ts` | `nex/NEX.md` | Calls Broker's context assembly |
| `nex/stages/runAgent.ts` | `nex/NEX.md` | Calls Broker's agent engine |
| `nex/stages/deliverResponse.ts` | `nex/NEX.md` | Send via adapter's `send` command |
| `nex/stages/finalize.ts` | `nex/NEX.md` | Write to Nexus Ledger, emit outbound event |

### 🔵 NEW: `src/db/` — Data Layer

Replaces openclaw's file-based storage entirely. Build from ledger specs.

| New File | Spec | Notes |
|----------|------|-------|
| `db/ledgers.ts` | — | SQLite connections (better-sqlite3) |
| `db/events.ts` | `data/ledgers/EVENTS_LEDGER.md` | Raw SQL queries — no ORM |
| `db/agents.ts` | `data/ledgers/AGENTS_LEDGER.md` | Sessions, turns, messages, tool_calls, compactions |
| `db/identity.ts` | `data/ledgers/IDENTITY_GRAPH.md` | Contacts, entities, mappings, aliases |
| `db/nexus.ts` | `data/ledgers/NEXUS_LEDGER.md` | Pipeline traces |
| `db/migrations/` | `nex/DAEMON.md` | schema_version table + migration runner |

### 🟡 REPLACE: `src/broker/` — Agent Execution

Built from multiple openclaw modules. The Broker wraps pi-coding-agent and writes to the Agents Ledger.

| Nexus | From Openclaw | Spec | Notes |
|-------|--------------|------|-------|
| `broker/engine.ts` | `agents/pi-embedded-runner/` | `broker/AGENT_ENGINE.md` | Wrap `runEmbeddedPiAgent()`, return AgentResult |
| `broker/context.ts` | `agents/pi-embedded-runner/history.ts`, prompt construction | `broker/CONTEXT_ASSEMBLY.md` | 3-layer context: system prompt, conversation history, current event |
| `broker/sessions/` | `sessions/`, `routing/session-key.ts` | `broker/SESSION_LIFECYCLE.md` | Session create/resume, queue modes, aliases, serial execution |
| `broker/streaming.ts` | `agents/pi-embedded-subscribe.tools.ts` | `runtime/STREAMING.md` | BrokerStreamHandle, StreamEvent protocol |
| `broker/compaction.ts` | `sessions/` (compaction logic) | `broker/AGENT_ENGINE.md` | Wrap upstream compaction, add metadata table |
| `broker/queue.ts` | `auto-reply/reply/` (queue management) | `broker/SESSION_LIFECYCLE.md` | 6 queue modes: steer, followup, collect, steer-backlog, queue, interrupt |

### 🟡 REPLACE: `src/iam/` — Identity & Access Management

New module replacing openclaw's per-call permission system.

| Nexus | From Openclaw | Spec | Notes |
|-------|--------------|------|-------|
| `iam/identity.ts` | `routing/resolve-route.ts` | `data/ledgers/IDENTITY_GRAPH.md` | Query contacts → mappings → entities |
| `iam/policies.ts` | (new) | `iam/ACCESS_CONTROL_SYSTEM.md`, `iam/POLICIES.md` | YAML policy evaluation, declarative |
| `iam/grants.ts` | (new) | `iam/GRANTS.md` | Dynamic temporary permissions |
| `iam/audit.ts` | (new) | `iam/AUDIT.md` | Decision logging to SQLite |
| `iam/routing.ts` | `routing/bindings.ts` | `iam/ACCESS_CONTROL_SYSTEM.md` | Session key assignment from policies |

---

### 🟢 ADAPT: `src/agents/` — Agent Infrastructure

Heavy adaptation. Core execution moves to `broker/`, but agent configuration, tools, and prompt infrastructure stays.

| Openclaw | Nexus Destination | Action |
|----------|------------------|--------|
| `agents/pi-embedded-runner/` | `broker/engine.ts` | 🟡 Core execution → Broker |
| `agents/pi-embedded-helpers/` | `broker/` (helpers) | 🟡 Move to Broker |
| `agents/pi-embedded-subscribe.tools.ts` | `broker/streaming.ts` | 🟡 Streaming → Broker |
| `agents/pi-extensions/` | `broker/` | 🟡 Agent extensions → Broker |
| `agents/tools/` | `tools/` | 🟢 Keep, move to top-level tools |
| `agents/skills/` | `tools/skills/` | 🟢 Skill loading |
| `agents/schema/` | `tools/schema/` | 🟢 Tool schemas |
| `agents/identity.ts` | `iam/` or keep | 🟢 Agent identity config |
| `agents/identity-file.ts` | keep | 🟢 Identity file management |
| `agents/models-config.ts` | `config/` | 🟢 Model configuration |
| `agents/cli-session.ts` | `broker/` | 🟡 CLI session handling → Broker |
| `agents/tool-policy.ts` | `iam/` | 🟡 Tool policy → IAM |
| `agents/usage.ts` | keep | 🟢 Token usage tracking |
| `agents/auth-profiles/` | `config/` | 🟢 Auth profile management |
| `agents/sandbox/` | 🔶 DEFER | Not V1 |
| `agents/test-helpers/` | `test-helpers/` | 🟢 Keep |

### 🟢 ADAPT: `src/auto-reply/` — Message Processing

This is openclaw's event handling pipeline. Parts go to Broker (queue, processing), parts to NEX stages.

| Openclaw | Nexus Destination | Action |
|----------|------------------|--------|
| `auto-reply/reply.ts` | `broker/queue.ts` | 🟡 Queue management → Broker |
| `auto-reply/reply/` (subdirectory) | `broker/queue/` | 🟡 Queue modes, processing |
| `auto-reply/envelope.ts` | `nex/stages/receiveEvent.ts` | 🟡 Event normalization → NEX stage 1 |
| `auto-reply/heartbeat.ts` | Clock adapter responsibility | 🟡 → adapter |
| `auto-reply/commands-registry.*` | `cli/commands/` | 🟢 Slash commands stay |
| `auto-reply/group-activation.ts` | `iam/` or `nex/stages/` | 🟡 Group mention handling |
| `auto-reply/send-policy.ts` | `broker/` | 🟡 Send policy → Broker |
| `auto-reply/thinking.ts` | `broker/streaming.ts` | 🟡 Thinking indicators → streaming |
| `auto-reply/inbound-debounce.ts` | `nex/adapters/` | 🟡 Debounce → Adapter Manager |
| `auto-reply/model.ts` | `config/` | 🟢 Model selection |
| `auto-reply/status.ts` | keep | 🟢 Status tracking |
| `auto-reply/skill-commands.ts` | `cli/` | 🟢 Skill CLI commands |

### 🟢 ADAPT: `src/sessions/` — Session Management

Mostly moves to `broker/sessions/`.

| Openclaw | Nexus Destination | Action |
|----------|------------------|--------|
| `sessions/session-key-utils.ts` | `broker/sessions/keys.ts` | 🟡 Session key utilities → Broker |
| `sessions/session-label.ts` | `broker/sessions/` | 🟡 Labels → Broker |
| `sessions/send-policy.ts` | `broker/` | 🟡 Send policy |
| `sessions/level-overrides.ts` | `config/` | 🟢 Level config |
| `sessions/model-overrides.ts` | `config/` | 🟢 Model config |
| `sessions/transcript-events.ts` | `broker/` | 🟡 Transcript events → Broker |

### 🟢 ADAPT: `src/routing/` — Routing

Splits between IAM (identity resolution, session key assignment) and Broker (route execution).

| Openclaw | Nexus Destination | Action |
|----------|------------------|--------|
| `routing/bindings.ts` | `iam/routing.ts` | 🟡 Bindings → IAM policies |
| `routing/resolve-route.ts` | `iam/identity.ts` | 🟡 Route resolution → IAM |
| `routing/session-key.ts` | `broker/sessions/keys.ts` | 🟡 Session key building → Broker |

### 🟢 ADAPT: `src/daemon/` — Daemon Process

Moves to `nex/daemon/`. Good upstream reference for PID management, launchd, systemd.

| Openclaw | Nexus Destination | Action |
|----------|------------------|--------|
| `daemon/paths.ts` | `nex/daemon/paths.ts` | 🟢 PID file, log paths |
| `daemon/service-runtime.ts` | `nex/daemon/runtime.ts` | 🟢 Service runtime management |
| `daemon/launchd.ts` | `nex/daemon/launchd.ts` | 🟢 macOS launchd integration |
| `daemon/systemd.ts` | `nex/daemon/systemd.ts` | 🟢 Linux systemd integration |
| `daemon/schtasks.ts` | `nex/daemon/schtasks.ts` | 🟢 Windows scheduled tasks |
| `daemon/inspect.ts` | `nex/daemon/inspect.ts` | 🟢 Daemon inspection |
| `daemon/diagnostics.ts` | `nex/daemon/diagnostics.ts` | 🟢 Health diagnostics |
| `daemon/constants.ts` | `nex/daemon/constants.ts` | 🟢 Daemon constants |
| `daemon/node-service.ts` | `nex/daemon/node-service.ts` | 🟢 Node service management |

### 🟢 ADAPT: `src/gateway/` — HTTP Server

Becomes the NEX HTTP endpoint (health, SSE, eventually RPC).

| Openclaw | Nexus Destination | Action |
|----------|------------------|--------|
| `gateway/server.ts` + `server/` | `gateway/` | 🟢 Adapt for NEX health + SSE endpoint |
| `gateway/server-methods/` | `gateway/` | 🟢 Adapt API methods |
| `gateway/protocol/` | `gateway/` | 🟢 Protocol definitions |
| `gateway/session-utils.ts` | `broker/` or `gateway/` | 🟡 Session utils may split |
| `gateway/chat-sanitize.ts` | keep | 🟢 Input sanitization |

### 🟢 ADAPT: `src/hooks/` — Hook System

Maps to `nex/plugins/` (pipeline hooks) and `nex/automations/` (user automations).

| Openclaw | Nexus Destination | Action |
|----------|------------------|--------|
| `hooks/loader.ts` | `nex/plugins/loader.ts` | 🟡 Adapt for NEXPlugin interface |
| `hooks/types.ts` | `nex/plugins/types.ts` | 🟡 New types |
| `hooks/workspace.ts` | `nex/automations/` | 🟡 Workspace hooks → automations |
| `hooks/bundled/` | `nex/plugins/builtin/` | 🟢 Adapt bundled hooks |
| `hooks/install.ts` | `nex/plugins/` | 🟢 Plugin installation |
| `hooks/gmail-ops.ts` | `nex/automations/` or skills | 🟡 Gmail hook → automation |

### 🟢 ADAPT: `src/config/` — Configuration

Keep and adapt for `nex.yaml`.

| Openclaw | Nexus Destination | Action |
|----------|------------------|--------|
| `config/paths.ts` | keep (already rewritten) | 🟢 Already adapted |
| `config/schema.ts` | Adapt for nex.yaml Zod schema | 🟡 New config structure |
| `config/sessions/` | `broker/sessions/config.ts` | 🟡 Session config → Broker |
| `config/channel-capabilities.ts` | keep | 🟢 Channel capability definitions |
| `config/types.*.ts` | keep | 🟢 Type definitions |
| `config/validation.ts` | keep | 🟢 Config validation |

### 🟢 ADAPT: `src/providers/` — LLM Providers

Keep as-is. Model catalog, provider SDKs, streaming.

### 🟢 ADAPT: `src/cli/` — CLI Commands

Adapt for `nexus` CLI. Many commands stay, some new ones added.

| Openclaw | Nexus Destination | Action |
|----------|------------------|--------|
| `cli/daemon-cli/` | keep | 🟢 `nexus daemon start/stop/status` |
| `cli/gateway-cli/` | keep | 🟢 Gateway management |
| `cli/cron-cli/` | keep | 🟢 Cron job management |
| `cli/program/` | keep | 🟢 CLI program setup |
| `cli/browser-cli-actions-input/` | 🔶 DEFER | Browser not V1 |

### 🟢 ADAPT: `src/commands/` — Slash Commands

Keep agent-facing commands. These become NEX tools/commands.

### 🟢 ADAPT: Utility Modules

These stay with minimal changes:

| Module | Action | Notes |
|--------|--------|-------|
| `src/infra/` | 🟢 ADAPT | Infrastructure utils (home-dir, net, tls, format-time) |
| `src/markdown/` | 🟢 ADAPT | Markdown processing |
| `src/media/` | 🟢 ADAPT | Media handling |
| `src/media-understanding/` | 🟢 ADAPT | Media transcription/analysis |
| `src/logging/` | 🟢 ADAPT | Logging infrastructure |
| `src/terminal/` | 🟢 ADAPT | Terminal/PTY management |
| `src/process/` | 🟢 ADAPT | Process management |
| `src/security/` | 🟢 ADAPT | Security utilities |
| `src/shared/` | 🟢 ADAPT | Shared utilities (text processing) |
| `src/utils/` | 🟢 ADAPT | General utilities |
| `src/compat/` | 🟢 ADAPT | Legacy compatibility |
| `src/types/` | 🟢 ADAPT | Type definitions |
| `src/link-understanding/` | 🟢 ADAPT | URL/link analysis |
| `src/plugin-sdk/` | 🟢 ADAPT | Plugin SDK for extensions |
| `src/scripts/` | 🟢 ADAPT | Build/utility scripts |
| `src/test-helpers/` | 🟢 ADAPT | Test helpers (already fixed) |
| `src/test-utils/` | 🟢 ADAPT | Test utilities |

---

### 🟡 REPLACE: Channel-Specific Source Directories

Openclaw bundles channel handling in `src/`. Nexus moves these to `extensions/` as external adapter processes.

| Openclaw src/ | Nexus | Action |
|---------------|-------|--------|
| `src/imessage/` | `extensions/imessage/` | 🟡 Merge with extension, external CLI |
| `src/discord/` | `extensions/discord/` | 🟡 Merge with extension, external CLI |
| `src/telegram/` | `extensions/telegram/` | 🟡 Merge with extension, external CLI |
| `src/slack/` | `extensions/slack/` | 🟡 Merge with extension, external CLI |
| `src/signal/` | `extensions/signal/` | 🟡 Merge with extension, external CLI |
| `src/whatsapp/` | `extensions/whatsapp/` | 🟡 Merge with extension, external CLI |
| `src/line/` | `extensions/line/` | 🟡 Merge with extension, external CLI |
| `src/web/` | `gateway/` (web inbound) | 🟡 Web channel → gateway |
| `src/channels/` | `nex/adapters/types.ts` + extensions | 🟡 Channel types → shared, impls → extensions |
| `src/canvas-host/` | 🔶 DEFER | Canvas/A2UI not V1 |

### 🔴 DROP

| Openclaw | Reason |
|----------|--------|
| `src/acp/` | Agent Client Protocol — not used |
| `src/tui/` | No TUI — confirmed drop |
| `src/memory/` | Replaced by Cortex (Go, separate process) |
| `src/docs/` | Separate docs site |
| `src/wizard/` | Onboarding wizard — different model |
| `src/tts/` | Text-to-speech — not V1 |
| `src/node-host/` | Multi-node execution — not V1 |
| `src/pairing/` | Device pairing — not V1 |
| `src/browser/` | Browser automation — not V1 (defer, complex) |

### 🔶 DEFER (Keep in tree, transform later)

| Openclaw | Reason |
|----------|--------|
| `src/cron/` | Cron system — keep as-is, eventually becomes clock adapter |
| `src/plugins/` | Plugin runtime — keep, adapt to NEXPlugin model incrementally |
| `src/macos/` | macOS system integration — keep for daemon |

---

## extensions/ — External Adapter Processes

Extensions become external CLI adapter processes per `ADAPTER_SYSTEM.md`. Each must implement the adapter CLI protocol: `info`, `monitor`, `send`, `stream`, `health`.

| Extension | Nexus Channel | Priority | Notes |
|-----------|--------------|----------|-------|
| `extensions/imessage/` | imessage | P0 | Eve adapter — first target |
| `extensions/discord/` | discord | P1 | Discord adapter |
| `extensions/telegram/` | telegram | P1 | Telegram adapter |
| `extensions/slack/` | slack | P1 | Slack adapter |
| `extensions/signal/` | signal | P2 | Signal adapter |
| `extensions/whatsapp/` | whatsapp | P2 | WhatsApp adapter |
| `extensions/bluebubbles/` | imessage-bb | P2 | BlueBubbles alternative |
| `extensions/matrix/` | matrix | P2 | Matrix adapter |
| `extensions/googlechat/` | googlechat | P2 | Google Chat |
| `extensions/msteams/` | msteams | P2 | Microsoft Teams |
| `extensions/feishu/` | feishu | Low | Feishu/Lark |
| `extensions/line/` | line | Low | LINE messenger |
| `extensions/nostr/` | nostr | Low | Nostr protocol |
| `extensions/tlon/` | tlon | Low | Tlon/Urbit |
| `extensions/zalo/` | zalo | Low | Zalo messenger |
| `extensions/mattermost/` | mattermost | Low | Mattermost |
| `extensions/nextcloud-talk/` | nextcloud | Low | Nextcloud Talk |
| `extensions/twitch/` | twitch | Low | Twitch chat |
| `extensions/copilot-proxy/` | — | 🟢 ADAPT | Copilot credential proxy |
| `extensions/google-*-auth/` | — | 🟢 ADAPT | Google OAuth flows |
| `extensions/memory-core/` | 🔴 DROP | Replaced by Cortex |
| `extensions/memory-lancedb/` | 🔴 DROP | Replaced by Cortex |
| `extensions/llm-task/` | 🔶 DEFER | LLM task runner |
| `extensions/device-pair/` | 🔶 DEFER | Device pairing |
| `extensions/phone-control/` | 🔶 DEFER | Phone control |
| `extensions/diagnostics-otel/` | 🔶 DEFER | OpenTelemetry |
| `extensions/lobster/` | 🔶 DEFER | Lobster extension |
| `extensions/open-prose/` | 🔶 DEFER | Prose editing |
| `extensions/talk-voice/` | 🔶 DEFER | Voice calls |
| `extensions/voice-call/` | 🔶 DEFER | Voice calls |

**Key transformation:** Each `extensions/{name}/` needs to implement the adapter CLI protocol. The Adapter Manager in `src/nex/adapters/manager.ts` spawns these as child processes, reads JSONL from stdout (monitor mode), and sends delivery requests via `send`/`stream` commands.

---

## Top-Level Directories

| Openclaw | Nexus | Action |
|----------|-------|--------|
| `apps/` | 🔶 DEFER | iOS/Android/macOS apps — keep, not V1 |
| `assets/` | 🟢 ADAPT | Static assets |
| `docs/` | 🟢 ADAPT | Documentation |
| `extensions/` | 🟢 ADAPT | External adapters (see above) |
| `git-hooks/` | 🟢 ADAPT | Git hooks |
| `packages/` | 🔴 DROP | Legacy package structure (`packages/nexus/`, `packages/moltbot/`) |
| `patches/` | 🟢 ADAPT | Dependency patches |
| `scripts/` | 🟢 ADAPT | Build/release scripts |
| `skills/` | 🟢 ADAPT | Skill definitions (52 skills) |
| `src/` | 🟡 TRANSFORM | See component-by-component above |
| `Swabble/` | 🔶 DEFER | Swift package |
| `test/` | 🟢 ADAPT | Integration tests |
| `ui/` | 🔶 DEFER | Web UI — keep, not V1 critical |
| `vendor/` | 🟢 ADAPT | Vendored dependencies |

---

## 🔵 NEW Components (Build from Specs)

These don't exist in openclaw at all:

| Component | Location | Spec | Priority |
|-----------|----------|------|----------|
| **NEX Pipeline** | `src/nex/pipeline.ts` | `nex/NEX.md` | P0 |
| **NexusRequest types** | `src/nex/request.ts` | `nex/NEXUS_REQUEST.md` | P0 |
| **Pipeline stages (8)** | `src/nex/stages/*.ts` | `nex/NEX.md` | P0 |
| **Adapter Manager** | `src/nex/adapters/manager.ts` | `adapters/ADAPTER_SYSTEM.md` | P0 |
| **Adapter CLI protocol** | `src/nex/adapters/protocol.ts` | `adapters/ADAPTER_SYSTEM.md` | P0 |
| **Events Ledger** | `src/db/events.ts` | `data/ledgers/EVENTS_LEDGER.md` | P0 |
| **Agents Ledger** | `src/db/agents.ts` | `data/ledgers/AGENTS_LEDGER.md` | P0 |
| **Identity Ledger** | `src/db/identity.ts` | `data/ledgers/IDENTITY_GRAPH.md` | P0 |
| **Nexus Ledger** | `src/db/nexus.ts` | `data/ledgers/NEXUS_LEDGER.md` | P0 |
| **ACL Policy Engine** | `src/iam/policies.ts` | `iam/ACCESS_CONTROL_SYSTEM.md` | P1 |
| **Grants System** | `src/iam/grants.ts` | `iam/GRANTS.md` | P1 |
| **Audit Logger** | `src/iam/audit.ts` | `iam/AUDIT.md` | P1 |
| **Automation System** | `src/nex/automations/` | `nex/automations/AUTOMATION_SYSTEM.md` | P2 |
| **Clock Adapter** | `extensions/clock/` | (needs spec) | P1 |

---

## Execution Order

Follows `FORK_PLAN.md` Step 1 (scaffold). The transformation proceeds in this order:

### Wave 1: Create New Modules (no breakage)
1. Create `src/db/` — ledger schemas and queries (pure new code)
2. Create `src/nex/request.ts` — NexusRequest + NexusEvent Zod types
3. Create `src/nex/pipeline.ts` — 8-stage executor with stubs
4. Create `src/nex/stages/` — stub implementations
5. Create `src/nex/adapters/` — Adapter Manager skeleton
6. Create `src/iam/` — identity resolution + ACL policy engine

### Wave 2: Move Existing Code
7. Move `src/agents/pi-embedded-*` → `src/broker/engine.ts` (adapt)
8. Move `src/sessions/` → `src/broker/sessions/` (adapt)
9. Move `src/auto-reply/reply/` queue logic → `src/broker/queue.ts`
10. Move `src/daemon/` → `src/nex/daemon/`
11. Move `src/hooks/` → `src/nex/plugins/`
12. Move `src/routing/` → split `src/iam/` + `src/broker/sessions/`

### Wave 3: Wire Integration
13. Wire pipeline stages to real implementations
14. Replace file-based storage with ledger writes
15. Wire Adapter Manager to extensions
16. Wire NEX daemon startup sequence

### Wave 4: Clean Up
17. Drop `src/memory/`, `src/tui/`, `src/acp/`, other DROPs
18. Drop `packages/` directory
19. Update imports across all adapted files
20. Verify all tests pass

---

## Critical Implementation Details to Preserve

These upstream patterns are battle-tested and must be carried over carefully:

| Pattern | Openclaw Location | Why It Matters |
|---------|-------------------|----------------|
| **Compaction with staged pruning** | `sessions/` + agents | Context overflow recovery |
| **Failover between providers** | `providers/` | Model fallback on 400/500 errors |
| **Tool call retry logic** | `agents/pi-embedded-runner/` | Graceful retry on transient failures |
| **Streaming abort/steer** | `agents/pi-embedded-subscribe.tools.ts` | Mid-stream cancellation |
| **Session key normalization** | `routing/session-key.ts` | Backward compat for `dm` → `direct` |
| **Config hot-reload per-message** | `routing/bindings.ts` | Dynamic binding changes |
| **Channel capability detection** | `config/channel-capabilities.ts` | Text limits, markdown support |
| **Media handling pipeline** | `media/`, `media-understanding/` | Image/audio/video processing |
| **Mention pattern matching** | `auto-reply/group-activation.ts` | Group chat @mentions |
| **Inbound debounce** | `auto-reply/inbound-debounce.ts` | Rapid message coalescing |
| **Legacy env var fallbacks** | `config/paths.ts` | OPENCLAW_*/MOLTBOT_*/CLAWDBOT_* support |

---

*This document is the execution guide for the fork. Every file in the openclaw codebase is accounted for. Follow it file-by-file.*
