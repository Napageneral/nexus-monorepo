# Channel Specs

Per-channel documentation for adapters.

---

## Channels

| Channel | Status | File |
|---------|--------|------|
| Discord | ✅ | `discord.md` |
| Telegram | TODO | `telegram.md` |
| WhatsApp | TODO | `whatsapp.md` |
| iMessage | TODO | `imessage.md` |
| Signal | TODO | `signal.md` |
| Slack | TODO | `slack.md` |
| Gmail | TODO | `gmail.md` |

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
