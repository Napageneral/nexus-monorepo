# LINE Adapter

**Status:** TODO  
**Nexus Tool:** TBD  
**Upstream:** `src/line/` (full implementation)

---

## Capabilities

```typescript
const LINE_CAPABILITIES: ChannelCapabilities = {
  text_limit: 5000,
  supports_markdown: false,       // Plain text only
  markdown_flavor: null,
  supports_embeds: true,          // Flex Messages
  supports_threads: false,
  supports_reactions: false,
  supports_polls: false,
  supports_buttons: true,         // Template/Flex buttons
  supports_ptt: false,
};
```

---

## Formatting Rules

### Text Limits
- **Text message:** 5000 chars
- **Flex Message JSON:** 30KB max

### No Markdown
LINE does not support markdown in regular messages. Use:
- Plain text for simple messages
- Flex Messages for rich formatting
- Template Messages for structured content

### Chunking
- Chunk at 5000 chars for text
- Max 5 messages per reply
- Use `reply-chunks.ts` logic

---

## Inbound

### Webhook Events
LINE uses webhooks (no long-polling or WebSocket):

```typescript
{
  channel: 'line',
  peer_kind: event.source.type === 'user' ? 'dm' : 'group',
  metadata: {
    user_id: event.source.userId,
    group_id: event.source.groupId,
    room_id: event.source.roomId,
    reply_token: event.replyToken,  // Valid for 1 minute
  },
}
```

### Event Types
- `message` — Text, image, video, audio, file, location, sticker
- `follow` — User added bot as friend
- `unfollow` — User blocked bot
- `join` — Bot joined group/room
- `leave` — Bot left group/room
- `postback` — Button/action callback

### Reply Token
- Each event includes a `replyToken`
- Valid for **1 minute** only
- Can reply up to **5 messages** with one token
- After expiry, must use push message (requires user ID)

---

## Outbound

### Reply vs Push
```typescript
// Reply (uses replyToken, free)
await client.replyMessage(replyToken, messages);

// Push (uses userId, costs money per message)
await client.pushMessage(userId, messages);
```

### Text Message
```typescript
{
  type: 'text',
  text: 'Hello, world!',
}
```

### Flex Message
Rich, customizable card-like messages:

```typescript
{
  type: 'flex',
  altText: 'Card preview text',
  contents: {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'Title', weight: 'bold', size: 'xl' },
        { type: 'text', text: 'Description', wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'button',
          action: { type: 'uri', label: 'Visit', uri: 'https://...' },
        },
      ],
    },
  },
}
```

### Template Messages
Predefined structured formats:

```typescript
// Buttons template
{
  type: 'template',
  altText: 'Menu',
  template: {
    type: 'buttons',
    title: 'Menu',
    text: 'Please select',
    actions: [
      { type: 'message', label: 'Option 1', text: 'option1' },
      { type: 'postback', label: 'Option 2', data: 'action=opt2' },
    ],
  },
}

// Confirm template
{
  type: 'template',
  altText: 'Confirm?',
  template: {
    type: 'confirm',
    text: 'Are you sure?',
    actions: [
      { type: 'message', label: 'Yes', text: 'yes' },
      { type: 'message', label: 'No', text: 'no' },
    ],
  },
}

// Carousel template
{
  type: 'template',
  altText: 'Items',
  template: {
    type: 'carousel',
    columns: [
      { title: 'Item 1', text: 'Desc', actions: [...] },
      { title: 'Item 2', text: 'Desc', actions: [...] },
    ],
  },
}
```

### Quick Replies
Suggested action buttons below message:

```typescript
{
  type: 'text',
  text: 'Choose an option:',
  quickReply: {
    items: [
      {
        type: 'action',
        action: { type: 'message', label: 'Option A', text: 'A' },
      },
      {
        type: 'action',
        action: { type: 'message', label: 'Option B', text: 'B' },
      },
    ],
  },
}
```

---

## Rich Menus

Persistent menu attached to chat input:

```typescript
// Create rich menu
const richMenuId = await client.createRichMenu({
  size: { width: 2500, height: 1686 },
  selected: true,
  name: 'Main Menu',
  chatBarText: 'Menu',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 1686 },
      action: { type: 'message', text: 'Left button' },
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 1686 },
      action: { type: 'uri', uri: 'https://...' },
    },
  ],
});

// Upload rich menu image
await client.setRichMenuImage(richMenuId, buffer, 'image/png');

// Link to user
await client.linkRichMenuToUser(userId, richMenuId);

// Set as default
await client.setDefaultRichMenu(richMenuId);
```

---

## Media

### Supported Types
- Image: JPEG, PNG (max 10MB)
- Video: MP4, M4V (max 200MB, 1 min)
- Audio: M4A, MP3 (max 200MB, 1 min)
- File: Any (via Files API)
- Sticker: LINE stickers by package/sticker ID
- Location: Lat/long with title

### Image Message
```typescript
{
  type: 'image',
  originalContentUrl: 'https://...full.jpg',
  previewImageUrl: 'https://...preview.jpg',
}
```

---

## Upstream Files

### Inbound
- `monitor.ts` — Main monitor (webhook-based)
- `bot.ts` — Bot creation
- `bot-handlers.ts` — Webhook event handlers
- `bot-message-context.ts` — Context building
- `webhook.ts` — Webhook server
- `http-registry.ts` — HTTP route registration

### Outbound
- `send.ts` — Main send functions
- `reply-chunks.ts` — Chunked replies (max 5 per token)
- `flex-templates.ts` — Flex Message templates
- `template-messages.ts` — Template message builders
- `rich-menu.ts` — Rich Menu operations

---

## Porting Notes

### From Upstream
- Webhook handling: `webhook.ts`, `bot-handlers.ts`
- Flex templates: `flex-templates.ts`
- Reply chunking: `reply-chunks.ts`
- Rich menu management: `rich-menu.ts`

### Nexus Tool
TBD: LINE bot integration tool or webhook receiver.

### Key Differences
- Webhook-only (no socket/polling option)
- Reply tokens expire in 1 minute
- No markdown — use Flex Messages for formatting
- Push messages cost money; replies are free
- Rich Menus for persistent UI

### Note
LINE is not in the main channel registry in upstream but has a full implementation in `src/line/`.

---

## Related
- `../upstream-reference/CHANNEL_INVENTORY.md` — Full upstream details
- `../ADAPTER_INTERFACES.md` — Interface definitions
- [LINE Messaging API Docs](https://developers.line.biz/en/docs/messaging-api/)
