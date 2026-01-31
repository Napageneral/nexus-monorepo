# Adapters Spec

**Status:** DESIGN IN PROGRESS  
**Last Updated:** 2026-01-30

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
| `ADAPTER_INTERFACES.md` | ✅ Done | Overview and design principles |
| `INBOUND_INTERFACE.md` | ✅ Done | Receiving events, NexusEvent schema |
| `OUTBOUND_INTERFACE.md` | ✅ Done | Delivery, formatting, chunking |
| `channels/` | ✅ Done | Per-channel specs (9 channels) |

### Upstream Reference

| Spec | Description |
|------|-------------|
| `upstream-reference/CHANNEL_INVENTORY.md` | All channels in OpenClaw |
| `upstream-reference/TOOL_HOOK_MECHANISM.md` | How tool hooks work (and don't) |
| `upstream-reference/OPENCLAW_INBOUND.md` | OpenClaw inbound patterns |
| `upstream-reference/OPENCLAW_OUTBOUND.md` | OpenClaw outbound patterns |

---

## Quick Start

**Read `ADAPTER_INTERFACES.md`** for the core interface definitions.

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

| Channel | Upstream | Spec | Nexus Tool |
|---------|----------|------|------------|
| Discord | Full | `channels/discord.md` | TBD |
| Telegram | Full | `channels/telegram.md` | TBD |
| WhatsApp | Full | `channels/whatsapp.md` | Baileys |
| iMessage | Full | `channels/imessage.md` | `eve` |
| Signal | Full | `channels/signal.md` | signal-cli |
| Slack | Full | `channels/slack.md` | TBD |
| LINE | Full | `channels/line.md` | TBD |
| Gmail | Hooks only | `channels/gmail.md` | `gog` |
| Google Chat | Config only | `channels/googlechat.md` | — |
| MS Teams | Config only | `channels/msteams.md` | — |

Each spec includes:
- Capabilities object
- Formatting rules and limits
- Media handling
- Porting notes

---

## Open Questions

1. **Formatting guidance injection** — How to provide on-demand guidance when message tool is called? See `upstream-reference/TOOL_HOOK_MECHANISM.md`

2. **Tool CLI interface** — Standardize CLI args across adapter tools?

3. **Media handling** — Per-channel media limits and formats

---

## Related Specs

- `../core/NEXUS_REQUEST.md` — Request object adapters create/consume
- `../acl/` — ACL processes events from adapters
- `../agent-system/` — Broker routes to adapters
