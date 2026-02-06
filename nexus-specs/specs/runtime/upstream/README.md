# OpenClaw Runtime - Upstream Reference

**Status:** COMPLETE  
**Last Updated:** 2026-02-04  
**Upstream Version:** v2026.2.3

---

## Overview

This folder contains comprehensive documentation of OpenClaw's runtime infrastructure — the "engine" that processes messages, executes agents, and delivers responses. This serves as the authoritative reference for building Nexus's runtime layer.

---

## Architecture Summary

OpenClaw's runtime is a **gateway-centric** architecture where a central server orchestrates all communication:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         OPENCLAW RUNTIME ARCHITECTURE                            │
│                                                                                  │
│   ┌──────────────────┐     ┌──────────────────────────────────────────────┐     │
│   │     Clients      │     │               Gateway Server                 │     │
│   │                  │     │                                              │     │
│   │  • CLI           │◄───►│  WebSocket + HTTP Server                     │     │
│   │  • Control UI    │     │       │                                      │     │
│   │  • Mobile Apps   │     │       ▼                                      │     │
│   │  • Remote Nodes  │     │  ┌─────────────────────────────────┐        │     │
│   └──────────────────┘     │  │        RPC Methods              │        │     │
│                            │  │  (agent, sessions, channels...) │        │     │
│                            │  └─────────────────────────────────┘        │     │
│                            │       │                                      │     │
│                            └───────┼──────────────────────────────────────┘     │
│                                    │                                             │
│   ┌────────────────────────────────┼────────────────────────────────────────┐   │
│   │                                ▼                                         │   │
│   │  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐    │   │
│   │  │   Channel   │───►│   Auto-Reply     │───►│   Agent Execution   │    │   │
│   │  │   Monitors  │    │   Pipeline       │    │   (pi-embedded)     │    │   │
│   │  └─────────────┘    └──────────────────┘    └─────────────────────┘    │   │
│   │        ▲                     │                        │                 │   │
│   │        │                     ▼                        ▼                 │   │
│   │  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐    │   │
│   │  │   Channel   │◄───│   Reply          │◄───│   Session/Turns     │    │   │
│   │  │   Senders   │    │   Dispatcher     │    │   (JSONL files)     │    │   │
│   │  └─────────────┘    └──────────────────┘    └─────────────────────┘    │   │
│   │                                                                         │   │
│   │                     MESSAGE PROCESSING LAYER                            │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                         EXTENSION LAYER                                  │   │
│   │                                                                          │   │
│   │   Plugins          Hooks           Tools           Channels              │   │
│   │   (discovery,      (lifecycle,     (built-in,      (telegram,           │   │
│   │    loading)         bundled)        plugin)         discord...)          │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Index

| Document | Purpose | Key Concepts |
|----------|---------|--------------|
| [`GATEWAY_SERVER.md`](./GATEWAY_SERVER.md) | Central server architecture | WebSocket, HTTP, RPC methods, protocol, authentication |
| [`AUTO_REPLY_PIPELINE.md`](./AUTO_REPLY_PIPELINE.md) | Message processing flow | Dispatch, command detection, reply generation, streaming |
| [`SESSION_AND_AGENT.md`](./SESSION_AND_AGENT.md) | Agent execution and sessions | Session keys, pi-embedded-runner, context assembly, tools |
| [`PLUGINS_AND_HOOKS.md`](./PLUGINS_AND_HOOKS.md) | Extension system | Plugin discovery, lifecycle hooks, tool registration |
| [`CHANNELS_ACCESS.md`](./CHANNELS_ACCESS.md) | Channels and access control | Allowlists, mention gating, routing, sender identity |
| [`CONFIGURATION.md`](./CONFIGURATION.md) | Configuration system | Config schema, sections, migrations, identity links |
| [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) | Supporting infrastructure | Outbound delivery, heartbeat, device pairing, exec approvals |
| [`DAEMON_SERVICE.md`](./DAEMON_SERVICE.md) | Service management | launchd, systemd, schtasks, service lifecycle |

---

## Message Lifecycle

The complete flow of a message through OpenClaw:

```
1. INBOUND
   Channel Monitor receives message from external platform
        │
        ▼
2. NORMALIZATION  
   Extract sender, content, chat type, create MsgContext
        │
        ▼
3. ACCESS CONTROL
   Check allowlists, mention gating, command authorization
        │
        ▼
4. DISPATCH
   dispatchInboundMessage() → dispatchReplyFromConfig()
   Run message_received hooks, check deduplication
        │
        ▼
5. AGENT EXECUTION
   runReplyAgent() → pi-embedded-runner
   Load session, assemble context, execute LLM
        │
        ▼
6. STREAMING
   onToolResult → onBlockReply → Final
   Block chunking with paragraph/sentence breaks
        │
        ▼
7. REPLY DISPATCH
   ReplyDispatcher serializes, normalizes, applies delays
        │
        ▼
8. OUTBOUND DELIVERY
   Format for platform, chunk if needed, deliver
        │
        ▼
9. SESSION RECORDING
   Append to JSONL transcript, update sessions.json
```

---

## Key Differences from Nexus

| Aspect | OpenClaw | Nexus | Notes |
|--------|----------|-------|-------|
| **Orchestrator** | Gateway RPC methods | NEX 8-stage pipeline | Nexus has defined stages |
| **Data Storage** | JSONL files + sessions.json | SQLite ledgers | Nexus is queryable |
| **Access Control** | Per-channel allowlists | Declarative IAM policies | Nexus is auditable |
| **Event Flow** | Channel → dispatch → agent | Adapters → NEX → Broker | Nexus has central pipeline |
| **Plugins** | Discovery, loader, slots | NEX stage hooks | Nexus has defined hook points |
| **Hooks** | 14+ lifecycle types | 8 pipeline stages | Nexus is more structured |
| **Sessions** | Session keys in JSONL | Session rows in SQLite | Same concepts, different storage |
| **Configuration** | Single config.json | Split by domain | Nexus is modular |

---

## Source Directory Mapping

| OpenClaw (`src/`) | Nexus Equivalent | Purpose |
|-------------------|------------------|---------|
| `gateway/` | NEX + Gateway | Central server |
| `auto-reply/` | NEX pipeline | Message dispatch |
| `agents/` | Broker | Agent execution |
| `sessions/` | Agents Ledger | Session management |
| `plugins/` | NEX plugins | Extension system |
| `hooks/` | Automations | Lifecycle handlers |
| `channels/` | Adapters | Platform connections |
| `infra/` | Infrastructure | Supporting utilities |
| `config/` | Split configs | Configuration |
| `daemon/` | Service layer | System services |
| `routing/` | IAM | Access control |
| `security/` | IAM | Security utilities |

---

## Patterns to Adopt

### From Gateway
- WebSocket protocol with req/res/event frames
- RPC method handlers with typed schemas
- Health state and discovery
- Node registry for remote execution

### From Auto-Reply Pipeline
- Deduplication cache with TTL
- Command detection patterns
- Block streaming with coalescing
- Human-like delays between chunks

### From Session/Agent
- Session key format (`agent:{id}:{scope}`)
- Context assembly (history + compaction summaries)
- Lane-based queue management
- Failover and retry logic
- Tool policy filtering

### From Plugins/Hooks
- Plugin discovery cascade (workspace → global → bundled)
- Typed lifecycle hooks with priority
- Factory-based tool registration
- Slot-based exclusive capabilities

### From Channels/Access
- Allowlist matching algorithm
- Route resolution priority chain
- Sender identity normalization
- Platform-specific formatting

---

## Patterns to Improve

| OpenClaw Pattern | Nexus Improvement |
|------------------|-------------------|
| Inline allowlist checks | Declarative IAM policies |
| Per-channel config | Domain-split configuration |
| JSONL file storage | SQLite ledger tables |
| Scattered hook points | 8 defined pipeline stages |
| Hidden workspace | Visible `~/nexus/` |
| Multiple config sources | Single authoritative config |

---

## File Counts

| Directory | Files | Primary Focus |
|-----------|-------|---------------|
| `gateway/` | 191 | Server, protocol, RPC |
| `auto-reply/` | 208 | Dispatch, reply |
| `agents/` | 447 | Execution, tools |
| `sessions/` | 7 | Session utilities |
| `plugins/` | 37 | Extension system |
| `hooks/` | 39 | Lifecycle hooks |
| `channels/` | 70+ | Platform adapters |
| `infra/` | 184 | Infrastructure |
| `config/` | 133 | Configuration |
| `daemon/` | 30 | Service management |

---

## Next Steps

With this runtime documentation complete, the next phase is to create domain-specific comparison documents that map OpenClaw patterns to Nexus specs:

1. **Broker** — How pi-embedded-runner maps to Nexus Broker
2. **NEX** — How auto-reply pipeline maps to NEX stages
3. **IAM** — How allowlists/routing map to IAM policies
4. **Adapters** — How channels map to in/out adapters

These comparisons will inform the implementation strategy and identify which patterns to port vs. rewrite.

---

*This folder documents OpenClaw runtime infrastructure. See `../` for Nexus runtime specs.*
