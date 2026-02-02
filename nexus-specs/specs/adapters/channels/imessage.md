# iMessage Adapter

**Status:** TODO  
**Nexus Tool:** `eve` (BlueBubbles integration)  
**Upstream:** `src/imessage/` (full implementation)

---

## Capabilities

```typescript
const IMESSAGE_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4000,              // Practical limit
  supports_markdown: false,
  markdown_flavor: null,
  supports_embeds: false,
  supports_threads: false,       // No native threads
  supports_reactions: true,      // Tapbacks
  supports_polls: false,
  supports_buttons: false,
  supports_ptt: false,           // Voice memos are attachments
};
```

---

## Formatting Rules

### Text Limits
- **Message:** ~4000 chars (no official limit, practical limit)
- **Subject line:** 256 chars (optional, rarely used)

### Plain Text Only
iMessage does **not** support Markdown or HTML. All text is plain:
- Strip all formatting
- No code blocks, bold, italic
- Emojis work natively

### Table Conversion
Convert Markdown tables to plain monospace text:
```
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
- Chunk at ~3500 chars (leave buffer)
- Split at paragraph/sentence boundaries
- Each chunk is a separate message bubble

---

## Inbound

### Event Fields
```typescript
{
  channel: 'imessage',
  peer_kind: chat.participants.length > 2 ? 'group' : 'dm',
  thread_id: undefined,          // No native threading
  metadata: {
    chat_guid: chat.guid,
    handle_id: message.handle?.address,
    is_from_me: message.isFromMe,
    is_group: chat.participants.length > 2,
    service: message.service,    // 'iMessage' | 'SMS'
  },
}
```

### BlueBubbles Events
BlueBubbles provides webhook/polling access to iMessage:
- `new-message` — Incoming message
- `updated-message` — Message edit (iOS 16+)
- `message-send-error` — Delivery failure
- `typing-indicator` — Typing status

### Handle Formats
- **iMessage:** `email@example.com` or `+12025551234`
- **SMS:** `+12025551234`
- **Chat GUID:** `iMessage;+;chat123456` or `SMS;+;+12025551234`

---

## Outbound

### Send Text
```typescript
await bluebubbles.post('/api/v1/message/text', {
  chatGuid: chatGuid,
  message: text,
  method: 'private-api',  // or 'apple-script'
});
```

### Reply (Thread)
iMessage doesn't have true threading, but can reply to specific messages:
```typescript
await bluebubbles.post('/api/v1/message/text', {
  chatGuid: chatGuid,
  message: text,
  selectedMessageGuid: replyToGuid,  // Creates reply bubble
});
```

### Tapback Reactions
```typescript
await bluebubbles.post('/api/v1/message/react', {
  chatGuid: chatGuid,
  selectedMessageGuid: messageGuid,
  reaction: 'love',  // 'love' | 'like' | 'dislike' | 'laugh' | 'emphasize' | 'question'
});
```

Tapback values:
| Name | Emoji |
|------|-------|
| `love` | ❤️ |
| `like` | 👍 |
| `dislike` | 👎 |
| `laugh` | 😂 |
| `emphasize` | !! |
| `question` | ? |

---

## Media

### Supported Formats
- **Images:** JPG, PNG, GIF, HEIC
- **Video:** MOV, MP4
- **Audio:** M4A, MP3 (as attachments)
- **Files:** Any file type

### Size Limits
- **iMessage:** 100MB per attachment
- **SMS/MMS:** ~1MB (carrier dependent)

### Sending Media
```typescript
await bluebubbles.post('/api/v1/message/attachment', {
  chatGuid: chatGuid,
  attachmentPath: '/path/to/file.jpg',
  attachmentName: 'photo.jpg',
});
```

### Attachment Download
```typescript
const attachment = await bluebubbles.get(
  `/api/v1/attachment/${attachmentGuid}/download`
);
```

---

## Platform Requirements

### macOS Only
iMessage requires macOS with:
- Messages.app running
- Signed into iCloud
- BlueBubbles server installed

### BlueBubbles Setup
BlueBubbles provides HTTP API access to iMessage:
1. Install BlueBubbles server on Mac
2. Enable Private API for full features
3. Configure webhook or polling
4. Store server URL and password

### Private API Features
With Private API enabled:
- Typing indicators
- Read receipts
- Tapback reactions
- Reply threading

Without Private API (AppleScript only):
- Basic send/receive
- Limited features

---

## Groups

### Group Chats
```typescript
// Get chat info
const chat = await bluebubbles.get(`/api/v1/chat/${chatGuid}`);

// Participants
chat.participants.forEach(p => {
  console.log(p.address);  // Email or phone
});
```

### Mentions
iMessage doesn't have native @mentions. Use plain text:
```typescript
await sendMessage(chatGuid, "Hey @Tyler, check this out");
```

---

## Porting Notes

### From Upstream
- Monitor: `monitor.ts`
- Provider: `monitor/monitor-provider.ts`
- Delivery: `monitor/deliver.ts`
- Runtime: `monitor/runtime.ts`
- Send functions: `send.ts`
- Outbound adapter: `channels/plugins/outbound/imessage.ts`

### Key Upstream Patterns
```typescript
// BlueBubbles client setup
const client = new BlueBubblesClient({
  serverUrl: config.serverUrl,
  password: config.password,
});

// Polling for messages
const messages = await client.getMessages({
  after: lastMessageDate,
  limit: 100,
});
```

### Nexus Tool
The `eve` tool wraps BlueBubbles. Need to:
- Verify eve CLI is installed
- Store BlueBubbles credentials
- Handle polling vs webhook mode
- macOS-only detection

---

## Related
- `../upstream-reference/CHANNEL_INVENTORY.md` — Full upstream details
- `../ADAPTER_INTERFACES.md` — Interface definitions
