# WhatsApp Adapter

**Status:** TODO  
**Nexus Tool:** Baileys integration (existing)  
**Upstream:** `src/web/` (full implementation)

---

## Capabilities

```typescript
const WHATSAPP_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4000,              // Approximate, unofficial
  supports_markdown: false,
  markdown_flavor: null,
  supports_embeds: false,
  supports_threads: false,       // No native threads
  supports_reactions: true,
  supports_polls: true,          // Max 12 options
  supports_buttons: false,       // Business API only
  supports_ptt: true,            // Push-to-talk voice notes
};
```

---

## Formatting Rules

### Text Limits
- **Message:** ~4000 chars (no official limit, practical limit)
- **Poll options:** 12 max
- **Poll option text:** 100 chars

### Plain Text Only
WhatsApp does **not** support Markdown or HTML formatting. Strip all formatting:
- `**bold**` → `bold`
- `*italic*` → `italic`
- `` `code` `` → `code`

Some clients render basic formatting, but it's unreliable. Default to plain text.

### Table Conversion
Convert Markdown tables to plain text with alignment:
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
- Split at paragraph boundaries when possible
- No code block preservation needed (plain text)

---

## Inbound

### Event Fields
```typescript
{
  channel: 'whatsapp',
  peer_kind: msg.key.remoteJid.endsWith('@g.us') ? 'group' : 'dm',
  thread_id: undefined,          // No native threading
  metadata: {
    jid: msg.key.remoteJid,
    participant: msg.key.participant,  // Group sender
    pushName: msg.pushName,
    is_group: msg.key.remoteJid.endsWith('@g.us'),
  },
}
```

### JID Formats
- **Individual:** `12025551234@s.whatsapp.net`
- **Group:** `123456789012345678@g.us`
- **Broadcast:** `status@broadcast`

### Message Types
- Text messages
- Media messages (image, video, audio, document)
- Reactions
- Poll responses
- Voice notes (PTT)

### Deduplication
WhatsApp can send duplicate events. Implement dedupe by message ID:
```typescript
const seenIds = new Set<string>();
if (seenIds.has(msg.key.id)) return;
seenIds.add(msg.key.id);
```

---

## Outbound

### Send Text
```typescript
await sock.sendMessage(jid, { text: messageText });
```

### Reply to Message
```typescript
await sock.sendMessage(jid, 
  { text: messageText },
  { quoted: quotedMessage }
);
```

### Send Poll
```typescript
await sock.sendMessage(jid, {
  poll: {
    name: "Question text",
    values: ["Option 1", "Option 2", "Option 3"],  // Max 12
    selectableCount: 1,  // Single choice (or higher for multi)
  },
});
```

### Reactions
```typescript
await sock.sendMessage(jid, {
  react: {
    text: '👍',
    key: messageKey,
  },
});
```

---

## Media

### Supported Formats
- **Images:** JPG, PNG, GIF, WebP
- **Video:** MP4 (H.264)
- **Audio:** MP3, M4A, OGG
- **Voice notes:** OGG Opus (PTT flag)
- **Documents:** Any file type

### Size Limits
- **Images:** 5MB
- **Video:** 16MB
- **Documents:** 100MB

### Sending Media
```typescript
// Image
await sock.sendMessage(jid, {
  image: { url: './image.jpg' },
  caption: 'Caption text',
});

// Voice note (PTT)
await sock.sendMessage(jid, {
  audio: { url: './voice.ogg' },
  ptt: true,  // Push-to-talk flag
});
```

### Media Download
```typescript
const buffer = await downloadMediaMessage(msg, 'buffer', {});
```

---

## Authentication

### QR Code Login
Baileys uses QR code authentication (no API keys):
```typescript
const sock = makeWASocket({
  auth: state,
  printQRInTerminal: true,
});
```

### Session Persistence
Store auth state for reconnection:
```typescript
const { state, saveCreds } = await useMultiFileAuthState('auth_info');
sock.ev.on('creds.update', saveCreds);
```

---

## Groups

### Group Management
```typescript
// Get group metadata
const metadata = await sock.groupMetadata(groupJid);

// Group participants
metadata.participants.forEach(p => {
  console.log(p.id, p.admin);  // 'admin' | 'superadmin' | null
});
```

### Mentions
```typescript
await sock.sendMessage(groupJid, {
  text: '@12025551234 Hello!',
  mentions: ['12025551234@s.whatsapp.net'],
});
```

---

## Porting Notes

### From Upstream
- Monitor: `inbound/monitor.ts`
- Message extraction: `inbound/extract.ts`
- Media handling: `inbound/media.ts`
- Access control: `inbound/access-control.ts`
- Deduplication: `inbound/dedupe.ts`
- Outbound: `outbound.ts`
- Outbound adapter: `channels/plugins/outbound/whatsapp.ts`
- Auto-reply: `auto-reply/monitor.ts`

### Key Upstream Patterns
```typescript
// Baileys connection
const sock = makeWASocket({
  auth: state,
  getMessage: async (key) => {
    // Message retrieval for reactions/replies
  },
});

// Event handling
sock.ev.on('messages.upsert', async ({ messages }) => {
  for (const msg of messages) {
    await handleMessage(msg);
  }
});
```

### Nexus Integration
Existing Baileys integration may be usable. Need to:
- Verify auth state storage location
- Implement credential pointer for session
- Handle QR flow in CLI context

---

## Related
- `../upstream/CHANNEL_INVENTORY.md` — Full upstream details
- `../ADAPTER_INTERFACES.md` — Interface definitions
