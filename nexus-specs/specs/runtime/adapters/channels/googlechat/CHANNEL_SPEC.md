# Google Chat Adapter

**Status:** Config Only (No Implementation)  
**Nexus Tool:** None  
**Upstream:** Registry entry + config types only

---

## Implementation Status

### Upstream (OpenClaw)
⚠️ **Config only** — No implementation exists.

| Component | Status |
|-----------|--------|
| Registry entry | ✅ `src/channels/registry.ts` |
| Config types | ✅ `config/types.googlechat.ts` |
| Webhook path | ✅ `/googlechat` configured |
| Monitor | ❌ Not implemented |
| Outbound | ❌ Not implemented |
| Channel plugin | ❌ Not implemented |

### Nexus
❌ **Not implemented**

---

## Capabilities (Theoretical)

```typescript
const GOOGLECHAT_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4096,               // Google Chat limit
  supports_markdown: true,        // Limited markdown
  markdown_flavor: 'googlechat',
  supports_embeds: true,          // Cards
  supports_threads: true,         // Threaded spaces
  supports_reactions: true,       // Emoji reactions
  supports_polls: false,
  supports_buttons: true,         // Card buttons
  supports_ptt: false,
};
```

---

## What Exists Upstream

### Registry Entry
```typescript
// src/channels/registry.ts
{
  id: 'googlechat',
  name: 'Google Chat',
  webhook_path: '/googlechat',
  // ... minimal config
}
```

### Config Types
```typescript
// config/types.googlechat.ts
interface GoogleChatConfig {
  enabled: boolean;
  webhook_path: string;
  // Likely placeholder structure
}
```

---

## Google Chat API Overview

### Webhook (Incoming)
Google Chat apps receive webhooks for:
- Message events
- Added to space events
- Removed from space events
- Card interactions

### REST API (Outgoing)
```typescript
// spaces.messages.create
POST https://chat.googleapis.com/v1/spaces/{space}/messages
{
  text: "Hello, world!",
  thread: { name: "spaces/{space}/threads/{thread}" },
}
```

### Cards (Rich Messages)
```typescript
{
  cardsV2: [{
    cardId: "unique-id",
    card: {
      header: { title: "Card Title" },
      sections: [{
        widgets: [{
          textParagraph: { text: "Content here" }
        }]
      }]
    }
  }]
}
```

---

## Formatting

### Supported Markdown
Google Chat supports limited markdown:
- `*bold*`
- `_italic_`
- `~strikethrough~`
- `` `code` ``
- ``` ```code block``` ```
- `<link|text>` for links
- `<users/123456>` for mentions

### No Tables
Convert tables to code blocks or lists.

---

## If Implementing

### Inbound
```typescript
{
  channel: 'googlechat',
  peer_kind: space.type === 'DM' ? 'dm' : 'group',
  thread_id: message.thread?.name,
  metadata: {
    space_name: space.name,
    space_type: space.type,
    sender: message.sender,
  },
}
```

### Outbound
```typescript
await chat.spaces.messages.create({
  parent: spaceName,
  requestBody: {
    text: message,
    thread: threadName ? { name: threadName } : undefined,
  },
});
```

### Authentication
- Service account for bots
- OAuth for user-context actions
- Workspace domain restrictions apply

---

## Porting Priority

**Phase 3 (As Needed)** — Per upstream channel inventory.

### Considerations
- Primarily enterprise/Workspace use
- Requires Google Workspace account
- Service account setup needed
- Less common than other channels

### If Needed
1. Implement webhook receiver
2. Add Google Chat API client
3. Create outbound plugin
4. Add to channel registry

---

## Related
- `../upstream/CHANNEL_INVENTORY.md` — Upstream status
- `../ADAPTER_INTERFACES.md` — Interface definitions
- [Google Chat API Docs](https://developers.google.com/chat/api/reference/rest)
