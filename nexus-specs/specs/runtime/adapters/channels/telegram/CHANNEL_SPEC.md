# Telegram Adapter

**Status:** TODO  
**Nexus Tool:** `telegram-cli` (TBD)  
**Upstream:** `src/telegram/` (full implementation)

---

## Capabilities

```typescript
const TELEGRAM_CAPABILITIES: ChannelCapabilities = {
  text_limit: 4096,
  supports_markdown: false,      // Uses HTML formatting instead
  markdown_flavor: null,
  html_formatting: true,
  supports_embeds: false,
  supports_threads: true,        // Forum topics
  supports_reactions: true,
  supports_polls: true,
  supports_buttons: true,        // Inline keyboards
  supports_ptt: true,            // Voice messages
};
```

---

## Formatting Rules

### Text Limits
- **Message:** 4096 chars
- **Caption:** 1024 chars (for media)
- **Button text:** 64 chars
- **Callback data:** 64 bytes

### HTML Formatting
Telegram uses HTML, **not** Markdown:
- `<b>bold</b>`, `<i>italic</i>`, `<u>underline</u>`
- `<s>strikethrough</s>`, `<code>code</code>`
- `<pre>code block</pre>`, `<pre><code class="language-python">...</code></pre>`
- `<a href="url">link</a>`
- `<tg-spoiler>spoiler</tg-spoiler>`
- `<blockquote>quote</blockquote>`

### Markdown Conversion
When receiving Markdown content, convert to HTML:
```
**bold** → <b>bold</b>
*italic* → <i>italic</i>
`code` → <code>code</code>
```code block``` → <pre>code block</pre>
[link](url) → <a href="url">link</a>
```

### Table Conversion
Convert Markdown tables to preformatted text:
```
| Col1 | Col2 |
|------|------|
| A    | B    |
```
→
```html
<pre>Col1  Col2
----  ----
A     B</pre>
```

### Chunking
- Chunk at 4096 chars
- Preserve code blocks (don't split mid-`<pre>`)
- First chunk gets reply reference
- Caption limit is separate (1024 chars)

---

## Inbound

### Event Fields
```typescript
{
  channel: 'telegram',
  peer_kind: ctx.chat.type === 'private' ? 'dm' : 'group',
  thread_id: ctx.message.message_thread_id?.toString(),
  metadata: {
    chat_id: ctx.chat.id,
    chat_type: ctx.chat.type,       // 'private' | 'group' | 'supergroup' | 'channel'
    is_forum: ctx.chat.is_forum,
    topic_id: ctx.message.message_thread_id,
  },
}
```

### Message Types
- `message` — Regular messages
- `edited_message` — Message edits
- `callback_query` — Button clicks
- `poll_answer` — Poll responses

### Attachments
- Images, videos, documents, audio
- Voice messages (OGG format)
- Stickers (WebP/animated TGS)

---

## Outbound

### Send Text
```typescript
await bot.api.sendMessage(chatId, text, {
  parse_mode: 'HTML',
  reply_to_message_id: replyToId,
  message_thread_id: topicId,       // For forum topics
});
```

### Inline Buttons
```typescript
await bot.api.sendMessage(chatId, text, {
  reply_markup: {
    inline_keyboard: [[
      { text: "Option A", callback_data: "choice_a" },
      { text: "Option B", callback_data: "choice_b" },
    ]],
  },
});
```

### Reactions
```typescript
await bot.api.setMessageReaction(chatId, messageId, {
  reaction: [{ type: 'emoji', emoji: '👍' }],
});
```

### Edit Message
```typescript
await bot.api.editMessageText(chatId, messageId, newText, {
  parse_mode: 'HTML',
});
```

---

## Media

### Supported Formats
- **Images:** JPG, PNG, GIF, WebP
- **Video:** MP4 (H.264/MPEG-4)
- **Audio:** MP3, M4A
- **Voice:** OGG (Opus codec)
- **Documents:** Any file type

### Size Limits
- **Photos:** 10MB
- **Documents:** 50MB (bots), 2GB (users)
- **Video notes:** 1 minute max

### Sending Media
```typescript
await bot.api.sendPhoto(chatId, fileIdOrUrl, {
  caption: "Caption text",
  parse_mode: 'HTML',
});
```

---

## Forum Topics

Telegram supergroups can have forum topics (threads):
- Each topic has a `message_thread_id`
- Include `message_thread_id` in sends to post to specific topic
- General topic has thread ID 1

```typescript
await bot.api.sendMessage(chatId, text, {
  message_thread_id: topicId,
});
```

---

## Porting Notes

### From Upstream
- Bot setup: `bot.ts` (Grammy framework)
- Event handlers: `bot-handlers.ts`
- Context building: `bot-message-context.ts`
- Message dispatch: `bot-message-dispatch.ts`
- Send functions: `send.ts`
- Outbound adapter: `channels/plugins/outbound/telegram.ts`

### Key Upstream Patterns
```typescript
// Grammy bot setup
const bot = new Bot(token);
bot.on('message', handler);
bot.start();

// Webhook mode
bot.api.setWebhook(webhookUrl);
```

### Nexus Tool
TBD: `telegram-cli` wrapper or Grammy-based integration. Need to decide:
- Polling vs webhook mode
- Token storage in credentials
- Multi-bot support

---

## Related
- `../upstream/CHANNEL_INVENTORY.md` — Full upstream details
- `../ADAPTER_INTERFACES.md` — Interface definitions
