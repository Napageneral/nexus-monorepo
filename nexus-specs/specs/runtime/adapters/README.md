# Adapters Spec

**Status:** DESIGN IN PROGRESS  
**Last Updated:** 2026-02-06

---

## Overview

Adapters connect Nexus to external platforms. They handle:
- **Inbound:** Receiving messages, normalizing to `NexusEvent`
- **Outbound:** Formatting and delivering responses

Adapters are external tools (like `eve`, `gog`, `discord-cli`) that meet defined interfaces.

---

## Documents

### Nexus Interface Specs

| Spec | Status | Description |
|------|--------|-------------|
| `ADAPTER_SYSTEM.md` | ✅ Done | **Operational system** — registration, accounts, lifecycle, process management, health, context integration |
| `ADAPTER_INTERFACES.md` | 📦 Archived | Data contracts overview and design principles (superseded by `ADAPTER_SYSTEM.md` + `INBOUND_INTERFACE.md`/`OUTBOUND_INTERFACE.md`) |
| `INBOUND_INTERFACE.md` | ✅ Done | Receiving events, NexusEvent schema |
| `OUTBOUND_INTERFACE.md` | ✅ Done | Delivery, formatting, chunking |
| `OUTBOUND_TARGETING.md` | ✅ Done | Targeting semantics for threads + replies (`thread_id`, `reply_to_id`) |
| `BUILTIN_ADAPTERS.md` | 🚧 Active | Which integrations ship as built-in adapters (ingress + clock) and how they relate to the control-plane |
| `INTERNAL_ADAPTERS.md` | 🚧 Active | Add first-class support for internal (in-process) adapters like clock + HTTP ingress bridges |
| `CHANNEL_MIGRATION_TRACKER.md` | ✅ Active | Channel-by-channel execution tracker for adapter cutover |
| `CHANNEL_DIRECTORY.md` | ✅ Active | Per-channel directory of outbound targets (separate from identity directory) |
| `channels/` | ✅ Done | Per-channel specs (9 channels) |
| `ADAPTER_CREDENTIALS.md` | ✅ Active | How adapter accounts link to credentials + how NEX injects secrets |
| `ADAPTER_SDK_TYPESCRIPT.md` | ✅ Active | Detailed spec for the TypeScript adapter SDK |

### Upstream Reference

| Spec | Description |
|------|-------------|
| `upstream/CHANNEL_INVENTORY.md` | All channels in OpenClaw |
| `upstream/TOOL_HOOK_MECHANISM.md` | How tool hooks work (and don't) |
| `upstream/OPENCLAW_INBOUND.md` | OpenClaw inbound patterns |
| `upstream/OPENCLAW_OUTBOUND.md` | OpenClaw outbound patterns |

---

## Quick Start

**Read `ADAPTER_SYSTEM.md`** for the full operational system (registration, lifecycle, accounts).  
**Read `ADAPTER_INTERFACES.md`** for data contracts (NexusEvent, DeliveryResult, ChannelCapabilities).

---

## Key Concepts

### 1. External Tools

Adapters are external binaries that meet the interface:

```bash
# Inbound: tool emits events
eve monitor --format jsonl

# Outbound: tool sends messages
eve send --chat-id "+1234567890" --text "Hello"
```

### 2. Separate Interfaces

Inbound and outbound are separate. One tool can implement both, or use different tools:

| Tool | Inbound | Outbound | Channel |
|------|---------|----------|---------|
| `eve` | ✅ | ✅ | iMessage |
| `gog` | ✅ | ✅ | Gmail |
| `aix` | ✅ | ❌ | AI sessions |

### 3. Capabilities

Each channel exposes capabilities for agent context:

```typescript
capabilities: {
  text_limit: 2000,          // Discord
  supports_markdown: true,
  supports_embeds: true,
  // ...
}
```

### 4. NexusRequest Integration

Adapters create/consume `NexusRequest`:
- Inbound adapter creates request with delivery context
- Outbound adapter uses request to route response

---

## Channel Support

### Per-Channel Specs

See `channels/` folder. All channels from upstream are documented:

| Platform | Upstream | Spec | Nexus Tool |
|----------|----------|------|------------|
| Discord | Full | `channels/discord/CHANNEL_SPEC.md` | `nexus-adapter-discord` |
| Telegram | Full | `channels/telegram/CHANNEL_SPEC.md` | `nexus-adapter-telegram` |
| WhatsApp | Full | `channels/whatsapp/CHANNEL_SPEC.md` | Baileys |
| iMessage | Full | `channels/imessage/CHANNEL_SPEC.md` | `eve` |
| Signal | Full | `channels/signal/CHANNEL_SPEC.md` | signal-cli |
| Slack | Full | `channels/slack/CHANNEL_SPEC.md` | `nexus-adapter-slack` |
| LINE | Full | `channels/line/CHANNEL_SPEC.md` | TBD |
| Gmail | Hooks only | `channels/gmail/CHANNEL_SPEC.md` | `gog` |
| Google Chat | Config only | `channels/googlechat/CHANNEL_SPEC.md` | — |
| MS Teams | Config only | `channels/msteams/CHANNEL_SPEC.md` | — |

Each spec includes:
- Capabilities object
- Formatting rules and limits
- Media handling
- Porting notes

---

## Open Questions

1. **Formatting guidance injection** — Just-in-time guidance when message tool is called. Strategy defined in `ADAPTER_SYSTEM.md` (tool response hints). See `upstream/TOOL_HOOK_MECHANISM.md` for deeper investigation.

2. **Webhook adapters** — Adapters that need to receive webhooks (Telegram, LINE) run their own HTTP server. NEX connects to them for health but doesn't manage the listener port.

3. **Media handling** — Per-channel media limits and formats. See `channels/` for current specs.

4. **Rate limiting** — Should NEX enforce outbound rate limits globally, or leave to adapters? Currently adapter-managed.

---

## Related Specs

- `../nex/NEXUS_REQUEST.md` — Request object adapters create/consume
- `../iam/` — IAM processes events from adapters
- `../broker/` — Broker routes to adapters
