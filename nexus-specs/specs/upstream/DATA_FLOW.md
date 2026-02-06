# OpenClaw Data Flow

**Status:** COMPLETE  
**Last Updated:** 2026-02-03

---

## Overview

This document traces the lifecycle of a message through OpenClaw — from when it arrives at a channel to when a response is delivered.

---

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           MESSAGE LIFECYCLE                                      │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         1. CHANNEL MONITOR                               │    │
│  │                                                                          │    │
│  │  External Service (WhatsApp, Discord, Telegram, etc.)                   │    │
│  │       │                                                                  │    │
│  │       ▼                                                                  │    │
│  │  Channel Monitor (listens to platform events)                           │    │
│  │       │                                                                  │    │
│  │       ▼                                                                  │    │
│  │  Extract: From, To, Body, ChatType, SenderId, MediaType                 │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                      2. ACCESS CONTROL & GATING                          │    │
│  │                                                                          │    │
│  │  • Allowlist check (DM policy, group policy)                            │    │
│  │  • Self-message filtering (echo detection)                              │    │
│  │  • Mention gating (for groups)                                          │    │
│  │  • Command authorization (owner check)                                  │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                       3. MESSAGE NORMALIZATION                           │    │
│  │                                                                          │    │
│  │  • Build envelope with standardized fields                              │    │
│  │  • Group history aggregation                                            │    │
│  │  • Resolve session key                                                  │    │
│  │  • Create FinalizedMsgContext                                           │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         4. DISPATCH PIPELINE                             │    │
│  │                                                                          │    │
│  │  dispatchInboundMessage()                                               │    │
│  │       │                                                                  │    │
│  │       ▼                                                                  │    │
│  │  dispatchReplyFromConfig()                                              │    │
│  │       │                                                                  │    │
│  │       ├── Deduplication check                                           │    │
│  │       ├── Run `message_received` hooks                                  │    │
│  │       ├── Fast abort check (stop commands)                              │    │
│  │       │                                                                  │    │
│  │       ▼                                                                  │    │
│  │  getReplyFromConfig()                                                   │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                        5. AGENT EXECUTION                                │    │
│  │                                                                          │    │
│  │  runReplyAgent()                                                        │    │
│  │       │                                                                  │    │
│  │       ├── Load session (SessionManager.open)                            │    │
│  │       ├── Build context (walk tree, apply compaction)                   │    │
│  │       ├── Run `before_agent_start` hooks                                │    │
│  │       ├── Execute LLM (via pi-coding-agent)                             │    │
│  │       │                                                                  │    │
│  │       ▼                                                                  │    │
│  │  Streaming output:                                                      │    │
│  │       • onToolResult → tool execution updates                           │    │
│  │       • onBlockReply → streaming text chunks                            │    │
│  │       • Final → complete response                                       │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                       6. REPLY DISPATCHER                                │    │
│  │                                                                          │    │
│  │  ReplyDispatcher                                                        │    │
│  │       │                                                                  │    │
│  │       ├── Serialize: tool → block → final (in order)                    │    │
│  │       ├── Normalize payloads (prefixes, heartbeat stripping)            │    │
│  │       ├── Apply human-like delays                                       │    │
│  │       ├── Check send policy (allow/deny rules)                          │    │
│  │       │                                                                  │    │
│  │       ▼                                                                  │    │
│  │  deliverOutboundPayloads()                                              │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                       7. OUTBOUND DELIVERY                               │    │
│  │                                                                          │    │
│  │  • Text chunking (respects channel limits)                              │    │
│  │  • Media delivery                                                       │    │
│  │  • Thread/reply-to handling                                             │    │
│  │  • TTS generation (if configured)                                       │    │
│  │  • Cross-channel routing (if originating channel differs)               │    │
│  │       │                                                                  │    │
│  │       ▼                                                                  │    │
│  │  Channel-specific deliver() function                                    │    │
│  │       │                                                                  │    │
│  │       ▼                                                                  │    │
│  │  External Service (message sent)                                        │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                      │                                           │
│                                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                        8. SESSION RECORDING                              │    │
│  │                                                                          │    │
│  │  • Append messages to JSONL transcript                                  │    │
│  │  • Update sessions.json metadata                                        │    │
│  │  • Session mirroring (record sent messages)                             │    │
│  │  • Run `message_sent` hooks                                             │    │
│  │                                                                          │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files by Stage

| Stage | Key Files |
|-------|-----------|
| **Channel Monitor** | `src/{channel}/monitor.ts`, `src/web/inbound/monitor.ts` |
| **Access Control** | `src/web/inbound/access-control.ts`, `src/channels/allowlist-match.ts` |
| **Gating** | `src/channels/mention-gating.ts`, `src/web/auto-reply/monitor/group-gating.ts` |
| **Dispatch** | `src/auto-reply/dispatch.ts`, `src/auto-reply/reply/dispatch-from-config.ts` |
| **Agent Execution** | `src/auto-reply/reply/agent-runner.ts`, `src/agents/pi-embedded-runner/` |
| **Reply Dispatcher** | `src/auto-reply/reply/reply-dispatcher.ts` |
| **Outbound** | `src/infra/outbound/deliver.ts`, `src/auto-reply/reply/route-reply.ts` |

---

## Gateway Client Flow

For WebSocket clients (CLI, UI, native apps), the flow differs slightly:

```
Client sends `agent` method
    │
    ▼
Gateway validates params
    │
    ▼
Resolve session entry
    │
    ▼
Respond immediately: {runId, status: "accepted"}
    │
    ▼
agentCommand() runs asynchronously
    │
    ├── Emits `agent` events during execution
    │
    ▼
Client receives events or uses `agent.wait`
```

---

## Streaming Behavior

OpenClaw streams responses in three phases:

1. **Tool Results** — `onToolResult` callback when tools execute
2. **Block Replies** — `onBlockReply` callback for streaming text chunks
3. **Final Reply** — Complete response returned as `ReplyPayload[]`

The ReplyDispatcher serializes these in order, applying delays between block replies for natural pacing.

---

## Cross-Channel Routing

If the originating channel differs from the current surface:

```
Agent generates response
    │
    ▼
route-reply.ts detects mismatch
    │
    ▼
Routes to originating channel via deliverOutboundPayloads()
    │
    ▼
Channel-specific delivery
```

This enables scenarios where a message arrives on one channel but is answered on another.

---

*This document traces OpenClaw's message flow without mapping to Nexus concepts.*
