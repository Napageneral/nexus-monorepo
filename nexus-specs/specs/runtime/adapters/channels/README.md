# Channel Adapters

**Last Updated:** 2026-02-06

---

## Channel Inventory

Full inventory of channels, their adapter status, and compliance level against the adapter protocol defined in `ADAPTER_SYSTEM.md`.

### Compliance Levels

| Level | Commands | What it enables |
|-------|----------|----------------|
| **Basic** | `info`, `monitor` | Events flow in, identity resolution, hooks fire |
| **Standard** | + `send` | Agent can respond, bidirectional communication |
| **Complete** | + `backfill`, `health`, `accounts` | Historical context, production monitoring, auto-discovery |
| **Extended** | + `react`, `edit`, `delete`, `poll` | Platform-native features exposed to agent |

---

### Core Channels (from OpenClaw + Nexus tools)

| Channel | Folder | Nexus Tool | Upstream | Compliance Target | Status |
|---------|--------|------------|----------|-------------------|--------|
| **Discord** | `discord/` | TBD (`discord-cli`) | `src/discord/` (66 files) | Complete + Extended | Review needed |
| **Telegram** | `telegram/` | TBD (`telegram-cli`) | `src/telegram/` (87 files) | Complete + Extended | Review needed |
| **WhatsApp** | `whatsapp/` | Baileys wrapper | `src/web/` (78 files) | Complete + Extended | Review needed |
| **iMessage** | `imessage/` | `eve` | `src/imessage/` (legacy) | Complete | Review needed |
| **Gmail** | `gmail/` | `gog` | Hooks only | Complete | Review needed |
| **Signal** | `signal/` | signal-cli wrapper | `src/signal/` (24 files) | Complete | Review needed |
| **Slack** | `slack/` | TBD (`slack-cli`) | `src/slack/` (65 files) | Complete + Extended | Review needed |
| **LINE** | `line/` | TBD | `src/line/` (34 files) | Standard | Review needed |
| **Feishu/Lark** | `feishu/` | TBD | `src/feishu/` (17 files) | Standard | Placeholder |

### Extension Channels (from OpenClaw extensions)

| Channel | Folder | Upstream | Notes | Priority |
|---------|--------|----------|-------|----------|
| **Google Chat** | `googlechat/` | `extensions/googlechat/` | Config only upstream, full ext now | Phase 3 |
| **MS Teams** | `msteams/` | `extensions/msteams/` | Config only upstream, full ext now | Phase 3 |
| **Matrix** | `matrix/` | `extensions/matrix/` (47 files) | Full ext implementation | Phase 3 |
| **BlueBubbles** | `bluebubbles/` | `extensions/bluebubbles/` (26 files) | Recommended iMessage, replaces native | Phase 2 |
| **Voice/Telephony** | `voice/` | `extensions/voice-call/` (41 files) | Twilio/Plivo/Telnyx | Phase 4 |

### Nexus-Only Channels (not in OpenClaw)

| Channel | Folder | Source | What it ingests | Priority |
|---------|--------|--------|-----------------|----------|
| **AIX** | `aix/` | mnemonic `aix_events.go`, `aix_agents.go` | IDE sessions (Cursor, Codex, Claude Code) | High |
| **Calendar** | `calendar/` | mnemonic `calendar.go` + `gog` | Google Calendar events | Medium |
| **X/Twitter** | `twitter/` | mnemonic `bird.go` | Bookmarks, likes, mentions | Low |

---

## Folder Structure

Each channel folder contains:

```
channels/{channel}/
├── CHANNEL_SPEC.md          # Capabilities, formatting, inbound/outbound, media
└── UPSTREAM_REVIEW.md        # Gap analysis: upstream code vs adapter protocol
```

### CHANNEL_SPEC.md

Per-channel documentation: capabilities object, formatting rules, inbound event normalization, outbound delivery specifics, media handling, platform quirks.

### UPSTREAM_REVIEW.md

Gap analysis against the adapter protocol:
- What behaviors the existing tool/upstream code already fulfills
- What logic exists but needs reforming for the adapter protocol
- What logic doesn't exist at all and must be built
- Estimated effort to reach each compliance level

---

## Review Process

For each channel:

1. **Read CHANNEL_SPEC.md** — Understand the platform
2. **Review upstream code** — What exists in OpenClaw or Nexus tools
3. **Write UPSTREAM_REVIEW.md** — Gap analysis against adapter protocol
4. **Estimate effort** — What it takes to reach Standard, Complete, Extended

---

## Related

- `../ADAPTER_SYSTEM.md` — Adapter protocol, registration, lifecycle
- `../ADAPTER_INTERFACES.md` — Data contracts (NexusEvent, DeliveryResult)
- `../upstream/CHANNEL_INVENTORY.md` — Full OpenClaw channel inventory
