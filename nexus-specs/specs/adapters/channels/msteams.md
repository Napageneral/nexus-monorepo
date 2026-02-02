# Microsoft Teams Adapter

**Status:** Config Only (No Implementation)  
**Nexus Tool:** None  
**Upstream:** Config schema only

---

## Implementation Status

### Upstream (OpenClaw)
⚠️ **Config only** — No implementation exists.

| Component | Status |
|-----------|--------|
| Config schema | ✅ `config/types.msteams.ts` |
| Webhook config | ✅ Defined in schema |
| Reply styles | ✅ Defined in schema |
| Team/channel configs | ✅ Defined in schema |
| Monitor | ❌ Not implemented |
| Outbound | ❌ Not implemented |
| Channel plugin | ❌ Not implemented |

### Nexus
❌ **Not implemented**

---

## Capabilities (Theoretical)

```typescript
const MSTEAMS_CAPABILITIES: ChannelCapabilities = {
  text_limit: 28000,              // Approximate Teams limit
  supports_markdown: true,        // Limited markdown
  markdown_flavor: 'teams',
  supports_embeds: true,          // Adaptive Cards
  supports_threads: true,         // Reply threads
  supports_reactions: true,       // Emoji reactions
  supports_polls: false,
  supports_buttons: true,         // Adaptive Card actions
  supports_ptt: false,
};
```

---

## What Exists Upstream

### Config Schema
```typescript
// config/types.msteams.ts
interface MSTeamsConfig {
  enabled: boolean;
  webhook_url?: string;           // Incoming webhook URL
  reply_style: 'thread' | 'new';  // Reply behavior
  teams: TeamConfig[];            // Team/channel mappings
}

interface TeamConfig {
  team_id: string;
  team_name: string;
  channels: ChannelConfig[];
}

interface ChannelConfig {
  channel_id: string;
  channel_name: string;
  webhook_url?: string;
}
```

---

## MS Teams API Overview

### Bot Framework
Teams bots use the Microsoft Bot Framework:
- Receive activities via webhook
- Send via Bot Framework REST API
- Requires Azure Bot registration

### Incoming Webhooks (Simple)
```bash
# Simple message posting
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from webhook!"}'
```

### Adaptive Cards
```typescript
{
  type: "message",
  attachments: [{
    contentType: "application/vnd.microsoft.card.adaptive",
    content: {
      type: "AdaptiveCard",
      version: "1.4",
      body: [{
        type: "TextBlock",
        text: "Hello, Teams!",
        weight: "bolder",
        size: "large"
      }],
      actions: [{
        type: "Action.OpenUrl",
        title: "Learn More",
        url: "https://..."
      }]
    }
  }]
}
```

---

## Formatting

### Supported Markdown
Teams supports limited markdown in messages:
- `**bold**`
- `*italic*`
- `~~strikethrough~~`
- `` `code` ``
- ``` ```code block``` ``` (with language hint)
- `[text](url)` for links
- `@mention` via special syntax

### Mention Format
```typescript
{
  text: "Hello <at>User Name</at>",
  entities: [{
    type: "mention",
    text: "<at>User Name</at>",
    mentioned: {
      id: "user-aad-id",
      name: "User Name"
    }
  }]
}
```

### Adaptive Cards for Rich Content
Use Adaptive Cards for:
- Structured data display
- Interactive buttons
- Forms and inputs
- Image galleries

---

## If Implementing

### Inbound
```typescript
{
  channel: 'msteams',
  peer_kind: activity.conversation.isGroup ? 'group' : 'dm',
  thread_id: activity.conversation.id,
  metadata: {
    team_id: activity.channelData?.team?.id,
    channel_id: activity.channelData?.channel?.id,
    tenant_id: activity.channelData?.tenant?.id,
    from: activity.from,
  },
}
```

### Outbound
```typescript
// Via Bot Framework
await adapter.sendActivities(context, [{
  type: 'message',
  text: message,
  attachments: adaptiveCards,
}]);

// Via Incoming Webhook (simpler but limited)
await fetch(webhookUrl, {
  method: 'POST',
  body: JSON.stringify({
    text: message,
    // or Adaptive Card
  }),
});
```

### Authentication
- Bot Framework: Azure AD app registration
- Webhooks: URL-based (less secure)
- Microsoft Graph API for advanced features

---

## Reply Styles

From upstream config, two reply styles are defined:

### Thread Reply
```typescript
reply_style: 'thread'
// Replies in the same thread/conversation
```

### New Message
```typescript
reply_style: 'new'
// Creates a new message (not a reply)
```

---

## Porting Priority

**Phase 3 (As Needed)** — Per upstream channel inventory.

### Considerations
- Enterprise-focused platform
- Requires Azure AD / Bot Framework setup
- More complex auth than other platforms
- Adaptive Cards have learning curve
- Rate limits and throttling apply

### If Needed
1. Register Azure Bot
2. Implement Bot Framework webhook receiver
3. Add outbound via Bot Framework SDK
4. Support Adaptive Cards
5. Handle team/channel structure

### Simpler Alternative
Use **Incoming Webhooks** for one-way notifications:
- No bot registration needed
- Limited to posting messages
- Cannot receive or reply

---

## Related
- `../upstream/CHANNEL_INVENTORY.md` — Upstream status
- `../ADAPTER_INTERFACES.md` — Interface definitions
- [Teams Bot Framework Docs](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/what-are-bots)
- [Adaptive Cards Designer](https://adaptivecards.io/designer/)
