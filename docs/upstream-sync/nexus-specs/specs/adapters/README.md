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
| `ADAPTER_INTERFACES.md` | ✅ Done | Inbound/Outbound interface definitions |
| `channels/` | In Progress | Per-channel specs (one file per platform) |

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

### Porting from Upstream

| Channel | Upstream Status | Nexus Tool | Priority |
|---------|-----------------|------------|----------|
| Discord | Full | `discord-cli` (TBD) | High |
| Telegram | Full | `telegram-bot` (TBD) | High |
| WhatsApp | Full | Baileys wrapper | High |
| iMessage | Full | `eve` | High |
| Signal | Full | `signal-cli` wrapper | Medium |
| Slack | Full | `slack-cli` (TBD) | Medium |
| Gmail | Hooks only | `gog` | High |
| LINE | Full | TBD | Low |

### Per-Channel Specs

See `channels/` folder for detailed specs per platform:
- Capabilities and limits
- Formatting rules
- Media handling
- Platform-specific features

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
