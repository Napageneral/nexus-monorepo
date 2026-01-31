# Signal Adapter

**Status:** TODO  
**Nexus Tool:** `signal-cli` wrapper (TBD)  
**Upstream:** `src/signal/` (full implementation)

---

## Capabilities

```typescript
const SIGNAL_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4000,              // Practical limit
  supports_markdown: false,
  markdown_flavor: null,
  text_style_ranges: true,       // Bold, italic, etc. via ranges
  supports_embeds: false,
  supports_threads: false,       // No native threads
  supports_reactions: true,
  supports_polls: false,
  supports_buttons: false,
  supports_ptt: true,            // Voice notes
};
```

---

## Formatting Rules

### Text Limits
- **Message:** ~4000 chars (no official limit, practical limit)
- **Group name:** 128 chars
- **Group description:** 480 chars

### Text Style Ranges
Signal uses position-based style ranges, **not** Markdown:
```typescript
{
  text: "Hello bold world",
  textStyles: [
    { start: 6, length: 4, style: 'BOLD' },  // "bold"
  ],
}
```

Available styles:
- `BOLD`
- `ITALIC`
- `STRIKETHROUGH`
- `MONOSPACE`
- `SPOILER`

### Markdown Conversion
Convert Markdown to style ranges:
```typescript
// "Hello **bold** world"
{
  text: "Hello bold world",
  textStyles: [{ start: 6, length: 4, style: 'BOLD' }],
}
```

### Table Conversion
Convert Markdown tables to monospace styled text:
```
| Col1 | Col2 |
|------|------|
| A    | B    |
```
→
```typescript
{
  text: "Col1  Col2\n----  ----\nA     B",
  textStyles: [{ start: 0, length: 31, style: 'MONOSPACE' }],
}
```

### Chunking
- Chunk at ~3500 chars (leave buffer)
- Split at paragraph boundaries
- Style ranges must be recalculated per chunk

---

## Inbound

### Event Fields
```typescript
{
  channel: 'signal',
  peer_kind: envelope.dataMessage?.groupInfo ? 'group' : 'dm',
  thread_id: undefined,          // No native threading
  metadata: {
    source: envelope.source,      // Sender phone number
    source_uuid: envelope.sourceUuid,
    group_id: envelope.dataMessage?.groupInfo?.groupId,
    timestamp: envelope.timestamp,
  },
}
```

### SSE Event Stream
signal-cli provides Server-Sent Events:
```typescript
const eventSource = new EventSource(
  `http://localhost:${port}/api/v1/receive/${number}`
);

eventSource.onmessage = (event) => {
  const envelope = JSON.parse(event.data);
  handleEnvelope(envelope);
};
```

### Message Types
- `dataMessage` — Regular messages
- `syncMessage` — Sent from other devices
- `receiptMessage` — Read/delivery receipts
- `typingMessage` — Typing indicators
- `reactionMessage` — Emoji reactions

---

## Outbound

### Send Text
```typescript
await fetch(`http://localhost:${port}/api/v1/send/${number}`, {
  method: 'POST',
  body: JSON.stringify({
    recipients: [recipientNumber],
    message: text,
  }),
});
```

### Send with Style Ranges
```typescript
await fetch(`http://localhost:${port}/api/v1/send/${number}`, {
  method: 'POST',
  body: JSON.stringify({
    recipients: [recipientNumber],
    message: "Hello bold world",
    textStyles: [
      { start: 6, length: 4, style: 'BOLD' },
    ],
  }),
});
```

### Quote Reply
```typescript
await fetch(`http://localhost:${port}/api/v1/send/${number}`, {
  method: 'POST',
  body: JSON.stringify({
    recipients: [recipientNumber],
    message: text,
    quote: {
      timestamp: originalTimestamp,
      author: originalAuthor,
      message: originalMessage,
    },
  }),
});
```

### Reactions
```typescript
await fetch(`http://localhost:${port}/api/v1/react/${number}`, {
  method: 'POST',
  body: JSON.stringify({
    recipient: recipientNumber,
    emoji: '👍',
    targetAuthor: messageAuthor,
    targetTimestamp: messageTimestamp,
  }),
});
```

---

## Media

### Supported Formats
- **Images:** JPG, PNG, GIF, WebP
- **Video:** MP4
- **Audio:** MP3, M4A, OGG
- **Voice notes:** OGG Opus
- **Files:** Any file type

### Size Limits
- **Attachments:** 100MB (total per message)

### Sending Media
```typescript
await fetch(`http://localhost:${port}/api/v1/send/${number}`, {
  method: 'POST',
  body: JSON.stringify({
    recipients: [recipientNumber],
    message: "Caption text",
    attachments: ['/path/to/image.jpg'],
  }),
});
```

### Voice Notes
```typescript
// OGG Opus format for proper voice note display
await fetch(`http://localhost:${port}/api/v1/send/${number}`, {
  method: 'POST',
  body: JSON.stringify({
    recipients: [recipientNumber],
    attachments: ['/path/to/voice.ogg'],
    // Signal auto-detects voice notes by format
  }),
});
```

---

## signal-cli Daemon

### Starting Daemon
```bash
signal-cli -u +12025551234 daemon --http localhost:8080
```

### Registration
```bash
# Register with SMS verification
signal-cli -u +12025551234 register

# Verify with code
signal-cli -u +12025551234 verify 123456
```

### Linking (Secondary Device)
```bash
# Generate link URI
signal-cli link -n "Nexus Agent"

# Outputs: tsdevice://?uuid=...&pub_key=...
# Scan with Signal mobile app
```

---

## SSE Reconnection

The SSE connection may drop. Implement reconnection logic:
```typescript
function connectSSE() {
  const es = new EventSource(sseUrl);
  
  es.onerror = () => {
    es.close();
    setTimeout(connectSSE, 5000);  // Reconnect after 5s
  };
  
  es.onmessage = handleMessage;
}
```

### From Upstream
The `sse-reconnect.ts` file has robust reconnection:
- Exponential backoff
- Health checks
- Connection state tracking

---

## Groups

### Group Management
```bash
# List groups
signal-cli -u +12025551234 listGroups

# Send to group
signal-cli -u +12025551234 send -g GROUP_ID -m "Message"
```

### Group IDs
Group IDs are base64-encoded. API uses them directly:
```typescript
{
  groupId: "base64EncodedGroupId==",
  message: "Hello group!",
}
```

---

## Porting Notes

### From Upstream
- Monitor: `monitor.ts`
- Event handler: `monitor/event-handler.ts`
- Daemon management: `daemon.ts`
- SSE reconnection: `sse-reconnect.ts`
- Send functions: `send.ts`
- Reactions: `send-reactions.ts`
- Outbound adapter: `channels/plugins/outbound/signal.ts`

### Key Upstream Patterns
```typescript
// Daemon management
class SignalDaemon {
  async start() {
    this.process = spawn('signal-cli', [
      '-u', this.number,
      'daemon',
      '--http', `localhost:${this.port}`,
    ]);
  }
  
  async ensureRunning() {
    if (!this.isRunning) await this.start();
  }
}

// SSE connection
const es = new EventSourcePolyfill(sseUrl, {
  heartbeatTimeout: 60000,
});
```

### Nexus Tool
TBD: signal-cli wrapper. Need to:
- Detect signal-cli installation
- Handle registration/linking flow
- Store phone number in credentials
- Manage daemon lifecycle
- SSE vs polling decision

---

## Related
- `../upstream-reference/CHANNEL_INVENTORY.md` — Full upstream details
- `../ADAPTER_INTERFACES.md` — Interface definitions
