# Discord Adapter

**Status:** TODO  
**Nexus Tool:** `discord-cli` (TBD)  
**Upstream:** `src/discord/` (full implementation)

---

## Capabilities

```typescript
const DISCORD_CAPABILITIES: ChannelCapabilities = {
  text_limit: 2000,
  supports_markdown: true,
  markdown_flavor: 'discord',
  supports_embeds: true,
  supports_threads: true,
  supports_reactions: true,
  supports_polls: false,         // Discord polls are different API
  supports_buttons: false,       // Requires bot interactions
  supports_voice_notes: false,
};
```

---

## Formatting Rules

### Text Limits
- **Message:** 2000 chars
- **Embed description:** 4096 chars
- **Embed field value:** 1024 chars

### Markdown
Discord uses standard Markdown with some differences:
- `**bold**`, `*italic*`, `~~strikethrough~~`
- `` `code` ``, ` ```code block``` `
- `> quote`, `>>> multiline quote`
- `||spoiler||`

### Table Conversion
Markdown tables converted to code blocks:

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
- Chunk at 2000 chars
- Preserve code blocks (don't split mid-fence)
- First chunk gets reply reference
- Subsequent chunks don't

---

## Inbound

### Event Fields
```typescript
{
  channel: 'discord',
  peer_kind: message.channel.isDMBased() ? 'dm' : 'group',
  thread_id: message.channel.isThread() ? message.channel.id : undefined,
  metadata: {
    guild_id: message.guildId,
    channel_name: message.channel.name,
  },
}
```

### Attachments
- Images, videos, files supported
- URLs provided directly

---

## Outbound

### Send Text
```typescript
await rest.post(Routes.channelMessages(channelId), {
  body: {
    content: text,
    message_reference: replyToId ? { message_id: replyToId } : undefined,
  },
});
```

### Embeds
```typescript
{
  embeds: [{
    title: "...",
    description: "...",
    color: 0x5865F2,
    fields: [{ name: "...", value: "...", inline: true }],
  }],
}
```

### Reactions
```typescript
await rest.put(Routes.channelMessageOwnReaction(channelId, messageId, emoji));
```

---

## Media

### Supported
- Images: PNG, JPG, GIF, WebP
- Video: MP4, WebM
- Audio: MP3, OGG
- Files: Any (with size limits)

### Size Limits
- Regular: 8MB
- Nitro: 50MB / 100MB

---

## Threading

- Threads have their own channel ID
- Reply to thread = post in thread
- `message_reference` for replies within thread

---

## Porting Notes

### From Upstream
- Chunking logic: `chunkDiscordTextWithMode()`
- Table conversion: `convertMarkdownTables()`
- Embed handling: `send.messages.ts`
- Reaction support: `send.reactions.ts`

### Nexus Tool
TBD: `discord-cli` or integrate with existing Discord bot setup.

---

## Related
- `../upstream/OPENCLAW_OUTBOUND.md` — Full upstream details
- `../ADAPTER_INTERFACES.md` — Interface definitions
- `ONBOARDING.md` — Credential + account setup flow (credentials-first)
