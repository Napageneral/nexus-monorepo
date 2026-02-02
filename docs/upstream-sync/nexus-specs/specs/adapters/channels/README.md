# Channel Specs

Per-channel documentation for adapters.

---

## Channels

| Channel | Status | File | Upstream |
|---------|--------|------|----------|
| Discord | TODO | [`discord.md`](discord.md) | `src/discord/` |
| Telegram | TODO | [`telegram.md`](telegram.md) | `src/telegram/` |
| WhatsApp | TODO | [`whatsapp.md`](whatsapp.md) | `src/web/` |
| iMessage | TODO | [`imessage.md`](imessage.md) | `src/imessage/` |
| Signal | TODO | [`signal.md`](signal.md) | `src/signal/` |
| Slack | TODO | `slack.md` | `src/slack/` |
| LINE | TODO | `line.md` | `src/line/` |
| Gmail | TODO | `gmail.md` | `src/hooks/gmail.ts` |

### Status Legend
- **TODO** — Spec written, adapter not built
- **WIP** — Adapter in development
- **Done** — Adapter complete and tested

---

## What Each File Contains

1. **Capabilities** — `ChannelCapabilities` object
2. **Formatting Rules** — Limits, markdown, chunking
3. **Inbound** — Event normalization
4. **Outbound** — Delivery specifics
5. **Media** — Supported formats, limits
6. **Platform Features** — Threads, reactions, polls, etc.
7. **Porting Notes** — Upstream files to port

---

## Template

```markdown
# {Channel} Adapter

**Status:** TODO  
**Nexus Tool:** `{tool-name}`  
**Upstream:** `src/{channel}/`

---

## Capabilities

\`\`\`typescript
const {CHANNEL}_CAPABILITIES: ChannelCapabilities = {
  text_limit: 0000,
  // ...
};
\`\`\`

---

## Formatting Rules

### Text Limits
- Message: X chars

### Markdown
- Supported/not supported
- Flavor

### Chunking
- Strategy

---

## Inbound

### Event Fields
- Channel-specific fields

---

## Outbound

### Send Text
- API calls

---

## Media

### Supported
- Formats

### Limits
- Size limits

---

## Porting Notes

### From Upstream
- Key files

### Nexus Tool
- Implementation notes
```
