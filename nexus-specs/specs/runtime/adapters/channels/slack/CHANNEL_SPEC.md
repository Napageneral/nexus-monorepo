# Slack Adapter

**Status:** TODO  
**Nexus Tool:** `slack-cli` (TBD)  
**Upstream:** `src/slack/` (full implementation)

---

## Capabilities

```typescript
const SLACK_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4000,               // Slack block text limit
  supports_markdown: true,
  markdown_flavor: 'mrkdwn',      // Slack's custom markdown
  supports_embeds: true,          // Block Kit attachments
  supports_threads: true,
  supports_reactions: true,
  supports_polls: false,
  supports_buttons: true,         // Block Kit buttons
  supports_voice_notes: false,
};
```

---

## Formatting Rules

### Text Limits
- **Message:** 4000 chars (block text limit)
- **Attachment text:** 3000 chars
- **Blocks per message:** 50 max

### mrkdwn (Slack Markdown)
Slack uses its own markdown flavor called mrkdwn:
- `*bold*` (not `**bold**`)
- `_italic_` (not `*italic*`)
- `~strikethrough~` (not `~~strikethrough~~`)
- `` `code` ``, ` ```code block``` `
- `>` for quotes (single line only)
- `<url|text>` for links
- `<@U123>` for user mentions
- `<#C123>` for channel mentions

### Table Conversion
Markdown tables should be converted to code blocks or bullet lists:

```markdown
| Col1 | Col2 |
|------|------|
| A    | B    |
```
→
```
Col1  Col2
----  ----
A     B
```

### Chunking
- Chunk at 4000 chars
- Preserve code blocks (don't split mid-fence)
- Use `thread_ts` for follow-up chunks

---

## Inbound

### Event Fields
```typescript
{
  channel: 'slack',
  peer_kind: message.channel_type === 'im' ? 'dm' : 'group',
  thread_id: message.thread_ts,
  metadata: {
    team_id: message.team,
    channel_name: message.channel,
    user_id: message.user,
  },
}
```

### Socket Mode
Upstream uses Socket Mode (no public webhook required):
- `monitor/provider.ts` — Socket Mode connection
- `monitor/events.ts` — Event processing
- Real-time events over WebSocket

### Slash Commands
- `monitor/slash.ts` — Slash command handling
- Commands registered in Slack app config
- Respond with ephemeral or in-channel messages

---

## Outbound

### Send Text
```typescript
await client.chat.postMessage({
  channel: channelId,
  text: message,
  thread_ts: threadTs,  // For thread replies
});
```

### Block Kit (Rich Messages)
```typescript
{
  blocks: [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Hello* _world_' },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Click me' },
          action_id: 'button_click',
        },
      ],
    },
  ],
}
```

### Reactions
```typescript
await client.reactions.add({
  channel: channelId,
  timestamp: messageTs,
  name: 'thumbsup',  // Emoji name without colons
});
```

### Pins
```typescript
await client.pins.add({
  channel: channelId,
  timestamp: messageTs,
});
```

### Edit/Delete
```typescript
// Edit
await client.chat.update({
  channel: channelId,
  ts: messageTs,
  text: newText,
});

// Delete
await client.chat.delete({
  channel: channelId,
  ts: messageTs,
});
```

---

## Media

### Supported
- Images: PNG, JPG, GIF
- Files: Any type via `files.upload`
- Snippets: Code/text snippets

### Upload
```typescript
await client.files.uploadV2({
  channel_id: channelId,
  file: buffer,
  filename: 'image.png',
  thread_ts: threadTs,
});
```

---

## Threading

- Threads identified by `thread_ts` (timestamp of parent message)
- Reply to thread: include `thread_ts` in `chat.postMessage`
- `reply_broadcast: true` to also post to channel
- Thread resolution in `monitor/threading.ts`

---

## Upstream Files

### Inbound
- `monitor.ts` — Main monitor export
- `monitor/provider.ts` — Socket Mode provider
- `monitor/message-handler.ts` — Message processing
- `monitor/events.ts` — Event handling
- `monitor/slash.ts` — Slash command handling
- `monitor/threading.ts` — Thread resolution

### Outbound
- `send.ts` — Main send functions
- `actions.ts` — Edit, delete, react, pin operations
- `channels/plugins/outbound/slack.ts` — Outbound adapter

---

## Porting Notes

### From Upstream
- Socket Mode setup: `monitor/provider.ts`
- Threading logic: `monitor/threading.ts`
- Action API: `actions.ts` (edit, delete, react, pin)
- mrkdwn formatting: Handle conversion from standard markdown

### Nexus Tool
TBD: `slack-cli` using Slack Web API with Socket Mode.

### Key Differences from Discord
- mrkdwn instead of standard markdown
- Timestamps as message IDs (`ts`)
- Block Kit for rich messages
- Socket Mode instead of gateway

---

## Related
- `../upstream/CHANNEL_INVENTORY.md` — Full upstream details
- `../ADAPTER_INTERFACES.md` — Interface definitions
