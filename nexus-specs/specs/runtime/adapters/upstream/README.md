# OpenClaw Upstream Reference

**Status:** Reference Documentation  
**Last Updated:** 2026-02-04

---

## Overview

This folder documents how OpenClaw (the upstream codebase) implements messaging adapters. These docs serve as a reference for porting patterns to Nexus's adapter interfaces.

### What is OpenClaw?

OpenClaw is the existing codebase that handles multi-channel messaging (Discord, Telegram, WhatsApp, iMessage, Signal, Slack, LINE). It provides:

- **Inbound monitors** — Platform-specific listeners that receive messages
- **Context normalization** — Converts platform events to `MsgContext`
- **Reply pipeline** — Processes messages through agents and generates responses
- **Outbound delivery** — Formats and sends responses per channel

### How This Relates to Nexus

Nexus defines clean adapter interfaces (`INBOUND_INTERFACE.md`, `OUTBOUND_INTERFACE.md`). OpenClaw shows how these patterns are implemented in practice.

| OpenClaw | Nexus Equivalent |
|----------|------------------|
| `MsgContext` | `NexusEvent` |
| `ReplyPayload` | `DeliveryResult` content |
| Platform monitors | `InboundAdapter.onEvent()` |
| `deliverOutboundPayloads()` | `OutboundAdapter.sendText()` |
| `resolveAgentRoute()` | Broker routing |
| Session keys | Resource paths in IAM |

---

## Document Index

### Core Patterns

| Document | Description |
|----------|-------------|
| **OPENCLAW_INBOUND.md** | How inbound messages are received, normalized, and dispatched |
| **OPENCLAW_OUTBOUND.md** | How responses are formatted, chunked, and delivered |
| **STREAMING_OUTPUT.md** | Block streaming, coalescing, and human-like delays |

### Reference

| Document | Description |
|----------|-------------|
| **CHANNEL_INVENTORY.md** | All channels in OpenClaw with implementation status |
| **TOOL_HOOK_MECHANISM.md** | Tool hook infrastructure (exists but unused upstream) |

---

## Concept Mapping

### Inbound Flow

```
OpenClaw                              Nexus
─────────────────────────────────────────────────────────────
Platform Monitor                      InboundAdapter.start()
     │                                     │
     ▼                                     ▼
Raw platform event                    Raw platform event
     │                                     │
     ▼                                     ▼
Extract & normalize                   Normalize to NexusEvent
to MsgContext                              │
     │                                     ▼
     ▼                                onEvent(callback)
resolveAgentRoute()                        │
     │                                     ▼
     ▼                                Broker receives event
dispatchInboundMessage()                   │
     │                                     ▼
     ▼                                ACL → Hooks → Agent
Agent receives context
```

### Outbound Flow

```
OpenClaw                              Nexus
─────────────────────────────────────────────────────────────
Agent reply                           Agent reply
     │                                     │
     ▼                                     ▼
ReplyDispatcher                       Pipeline completion
     │                                     │
     ▼                                     ▼
normalizeReplyPayload()               OutboundAdapter.formatText()
     │                                     │
     ▼                                     ▼
Chunking per channel                  OutboundAdapter.chunkText()
     │                                     │
     ▼                                     ▼
deliverOutboundPayloads()             OutboundAdapter.sendText()
     │                                     │
     ▼                                     ▼
Platform-specific send                Platform-specific send
```

### Key Type Mapping

| OpenClaw Type | Nexus Type | Notes |
|---------------|------------|-------|
| `MsgContext` | `NexusEvent` | Normalized inbound event |
| `MsgContext.From` | `NexusEvent.sender_id` | Sender identifier |
| `MsgContext.To` | `NexusEvent.peer_id` | Destination |
| `MsgContext.Provider` | `NexusEvent.channel` | Platform name |
| `MsgContext.ChatType` | `NexusEvent.peer_kind` | dm/group/channel |
| `MsgContext.SessionKey` | Resource path | Session context |
| `ReplyPayload` | Response content | Text, media, metadata |
| `ReplyPayload.text` | Delivery content | Message text |
| `ReplyPayload.mediaUrl` | `MediaPayload` | Attached media |
| `OutboundDeliveryResult` | `DeliveryResult` | Delivery confirmation |

---

## Patterns to Adopt

### 1. Unified Normalization

OpenClaw normalizes all platform events to `MsgContext`. Nexus uses `NexusEvent`.

**Adopt:** The concept of a single normalized event type.

**Change:** `NexusEvent` is simpler — OpenClaw's `MsgContext` has 50+ fields, many redundant.

### 2. Plugin Architecture

Each OpenClaw channel is a plugin with adapters for inbound, outbound, onboarding, etc.

**Adopt:** Plugin structure with clear adapter interfaces.

**Change:** Nexus adapters are external tools, not embedded code.

### 3. Envelope Format

OpenClaw wraps messages with context:
```
[Discord] #channel-name User: message
```

**Adopt:** Envelope provides routing context to agents.

**Change:** Nexus can simplify — agent receives structured `NexusRequest.delivery`.

### 4. Block Streaming with Coalescing

OpenClaw streams LLM responses in chunks with configurable coalescing.

**Adopt:** Coalescing prevents message spam (min chars, idle timeout).

**Change:** Nexus may use simpler streaming — tool-level vs. block-level.

### 5. Human-Like Delays

OpenClaw adds random delays between block replies (800-2500ms).

**Adopt:** Makes responses feel natural.

**Change:** Make configurable per channel/agent.

### 6. Session Key Encoding

OpenClaw session keys encode context:
```
agent:main:discord:bot123:dm:user456
```

**Adopt:** Session keys carry routing context.

**Change:** Nexus uses resource paths in IAM instead.

---

## Patterns to Change

### 1. Monolithic Configuration

OpenClaw uses a single large YAML config.

**Change:** Nexus uses distributed configuration — skills, credentials, identity files.

### 2. Hardcoded Channel Order

OpenClaw has `CHAT_CHANNEL_ORDER` array.

**Change:** Nexus discovers capabilities from adapter tools.

### 3. Unused Hook Infrastructure

OpenClaw has `before_tool_call` hook types but never invokes them.

**Change:** Nexus uses turn-start context injection instead.

### 4. Session Mirroring

OpenClaw mirrors messages to session transcripts.

**Change:** Nexus writes to Agents Ledger for history.

### 5. Embedded Tool Execution

OpenClaw passes tools to agent session, observes but can't intercept.

**Change:** Nexus tools are external, can wrap with guidance.

---

## Key Source Files

### Inbound

| File | Purpose |
|------|---------|
| `src/auto-reply/dispatch.ts` | Entry point for message dispatch |
| `src/auto-reply/reply/dispatch-from-config.ts` | Core dispatch orchestration |
| `src/auto-reply/reply/inbound-context.ts` | Context finalization |
| `src/auto-reply/reply/inbound-dedupe.ts` | Deduplication cache |
| `src/routing/resolve-route.ts` | Agent route resolution |
| `src/routing/session-key.ts` | Session key generation |

### Outbound

| File | Purpose |
|------|---------|
| `src/infra/outbound/deliver.ts` | Main delivery orchestrator |
| `src/auto-reply/reply/reply-dispatcher.ts` | Reply serialization |
| `src/auto-reply/reply/normalize-reply.ts` | Payload normalization |
| `src/auto-reply/chunk.ts` | Chunking system |
| `src/channels/plugins/outbound/*.ts` | Per-channel outbound adapters |

### Streaming

| File | Purpose |
|------|---------|
| `src/auto-reply/reply/block-reply-pipeline.ts` | Block streaming pipeline |
| `src/auto-reply/reply/block-streaming.ts` | Coalescing configuration |
| `src/auto-reply/reply/block-reply-coalescer.ts` | Text coalescing logic |

### Channels

| Directory | Purpose |
|-----------|---------|
| `src/discord/` | Discord implementation |
| `src/telegram/` | Telegram implementation |
| `src/web/` | WhatsApp (Baileys) |
| `src/signal/` | Signal implementation |
| `src/imessage/` | iMessage implementation |
| `src/slack/` | Slack implementation |
| `src/line/` | LINE implementation |

---

## Migration Phases

### Phase 1: Core Channels

Port the most-used channels first:

| Channel | OpenClaw Source | Nexus Tool |
|---------|-----------------|------------|
| iMessage | `src/imessage/` | `eve` (existing) |
| WhatsApp | `src/web/` | Baileys wrapper |
| Discord | `src/discord/` | `discord-cli` |
| Telegram | `src/telegram/` | `telegram-bot` |

### Phase 2: Extended Channels

| Channel | OpenClaw Source | Nexus Tool |
|---------|-----------------|------------|
| Signal | `src/signal/` | signal-cli wrapper |
| Slack | `src/slack/` | `slack-cli` |
| Gmail | `src/hooks/gmail.ts` | `gog` (existing) |

### Phase 3: As Needed

| Channel | Status |
|---------|--------|
| LINE | Full implementation exists |
| Google Chat | Config only, no implementation |
| MS Teams | Config only, no implementation |

---

## Related Nexus Specs

| Spec | Path |
|------|------|
| Adapter Interfaces | `../ADAPTER_INTERFACES.md` |
| Inbound Interface | `../INBOUND_INTERFACE.md` |
| Outbound Interface | `../OUTBOUND_INTERFACE.md` |
| Per-Channel Specs | `../channels/*.md` |
| NexusRequest | `../../nex/NEXUS_REQUEST.md` |

---

*This folder documents upstream patterns. See parent folder for Nexus-native interface specs.*
