# Out-Adapter System Specification

**Status:** DESIGN IN PROGRESS  
**Last Updated:** 2026-01-30

---

## Overview

Out-adapters handle delivering agent responses to external platforms. This document specifies:

1. How agents send messages (automatic vs explicit)
2. The message tool interface
3. Per-channel formatting and capabilities
4. The tool hook pattern for on-demand guidance
5. Channel adapter interface and implementations

---

## 1. How Agents Send Messages

### Two Paths (from Upstream)

**Path A: Automatic Text Extraction**

The MA (Manager Agent) responds with text. The broker:
1. Extracts the text from the model output
2. Routes to the originating channel's out-adapter
3. Out-adapter applies mechanical formatting (chunking, markdown conversion)
4. Delivers to platform

```
Agent returns text → Broker extracts → Out-Adapter formats → Platform
```

The agent doesn't worry about chunking or platform limits. The out-adapter handles it.

**Path B: Explicit Message Tool**

Agent calls the `message` tool for:
- Proactive sends (not responding to a message)
- Cross-channel messages
- Platform-specific features (polls, reactions, embeds, buttons)
- When agent wants to suppress automatic reply

```
Agent calls message tool → Tool executes → Out-Adapter formats → Platform
```

### Nexus Approach

- **MA conversations**: Use automatic text extraction. MA just responds naturally.
- **Proactive/cross-channel**: Use message tool with explicit channel/target.
- **Platform features**: Use message tool with feature-specific params (polls, reactions).

---

## 2. Message Tool Specification

### Tool Definition

```typescript
const messageTool = {
  name: "message",
  description: buildMessageToolDescription(channel, capabilities),
  parameters: MessageToolSchema,
  execute: async (toolCallId, params, signal) => {
    // Tool hook intercepts here for formatting guidance
    return await runMessageAction(params);
  },
};
```

### Schema (from Upstream)

```typescript
const MessageToolSchema = {
  // Required
  action: {
    type: "string",
    enum: ["send", "react", "poll", "delete", "pin", "unpin", "thread"],
    description: "The action to perform",
  },
  
  // For action=send
  message: {
    type: "string",
    description: "The message content to send",
  },
  to: {
    type: "string",
    description: "Target: 'user:ID', 'channel:ID', or 'current' for reply",
  },
  channel: {
    type: "string",
    enum: ["discord", "telegram", "imessage", "signal", "whatsapp", "slack"],
    description: "Target channel (if different from current)",
  },
  
  // Threading
  threadId: { type: "string" },
  replyToId: { type: "string" },
  
  // Reactions (action=react)
  messageId: { type: "string" },
  emoji: { type: "string" },
  remove: { type: "boolean" },
  
  // Polls (action=poll)
  pollQuestion: { type: "string" },
  pollOption: { type: "array", items: { type: "string" } },
  pollDurationHours: { type: "number" },
  pollMulti: { type: "boolean" },
  
  // Telegram/Slack buttons (conditional)
  buttons: {
    type: "array",
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          callback_data: { type: "string" },
        },
      },
    },
    description: "Inline keyboard buttons (Telegram/Slack)",
  },
  
  // Adaptive cards (Teams/Slack)
  card: {
    type: "object",
    additionalProperties: true,
    description: "Adaptive Card JSON object",
  },
};
```

### Tool Description (Dynamic)

The tool description tells the agent what's available:

```typescript
function buildMessageToolDescription(channel: string, capabilities: ChannelCapabilities): string {
  const actions = getChannelActions(channel);
  
  let desc = "Send, delete, and manage messages via channel adapters.";
  desc += ` Current channel (${channel}) supports: ${actions.join(", ")}.`;
  
  if (capabilities.supports_buttons) {
    desc += " Inline buttons available with buttons=[[{text,callback_data}]].";
  }
  if (capabilities.supports_polls) {
    desc += " Polls available with action=poll.";
  }
  
  return desc;
}
```

---

## 3. Channel Adapters

### Adapter Interface

```typescript
interface ChannelOutAdapter {
  channel: string;
  
  // Capabilities
  capabilities: ChannelCapabilities;
  
  // Formatting
  formatText(content: string): string;
  chunkText(content: string): string[];
  
  // Delivery
  sendText(target: DeliveryTarget, text: string): Promise<DeliveryResult>;
  sendMedia(target: DeliveryTarget, media: MediaPayload): Promise<DeliveryResult>;
  
  // Platform-specific actions
  react?(target: MessageTarget, emoji: string): Promise<void>;
  createPoll?(target: DeliveryTarget, poll: PollPayload): Promise<PollResult>;
  pinMessage?(target: MessageTarget): Promise<void>;
}

interface ChannelCapabilities {
  text_limit: number;
  caption_limit?: number;
  supports_markdown: boolean;
  markdown_flavor?: 'standard' | 'telegram_html' | 'discord' | 'slack';
  supports_embeds: boolean;
  supports_threads: boolean;
  supports_reactions: boolean;
  supports_polls: boolean;
  supports_buttons: boolean;
  supports_cards: boolean;
  supports_ptt: boolean;
}

interface DeliveryTarget {
  channel: string;
  account_id: string;
  to: string;           // user:ID, channel:ID, chat:ID
  thread_id?: string;
  reply_to_id?: string;
}

interface DeliveryResult {
  success: boolean;
  message_ids: string[];
  chunks_sent: number;
  error?: string;
}
```

### Channel Implementations (from Upstream)

#### Discord

```typescript
const discordAdapter: ChannelOutAdapter = {
  channel: 'discord',
  
  capabilities: {
    text_limit: 2000,
    supports_markdown: true,
    markdown_flavor: 'discord',
    supports_embeds: true,
    supports_threads: true,
    supports_reactions: true,
    supports_polls: false,  // Discord has native polls but different API
    supports_buttons: false,
    supports_cards: false,
    supports_ptt: false,
  },
  
  formatText(content: string): string {
    // Convert markdown tables to Discord-compatible format
    return convertMarkdownTables(content);
  },
  
  chunkText(content: string): string[] {
    return chunkDiscordTextWithMode(content, {
      maxChars: 2000,
      chunkMode: 'markdown',  // Preserve code blocks
    });
  },
  
  async sendText(target, text): Promise<DeliveryResult> {
    const chunks = this.chunkText(this.formatText(text));
    const messageIds: string[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const result = await discordRest.post(Routes.channelMessages(target.to), {
        body: {
          content: chunks[i],
          // Only first chunk gets reply reference
          message_reference: i === 0 && target.reply_to_id 
            ? { message_id: target.reply_to_id } 
            : undefined,
        },
      });
      messageIds.push(result.id);
    }
    
    return { success: true, message_ids: messageIds, chunks_sent: chunks.length };
  },
};
```

#### Telegram

```typescript
const telegramAdapter: ChannelOutAdapter = {
  channel: 'telegram',
  
  capabilities: {
    text_limit: 4096,
    caption_limit: 1024,
    supports_markdown: true,
    markdown_flavor: 'telegram_html',  // Uses HTML, not Markdown
    supports_embeds: false,
    supports_threads: true,  // Forum topics
    supports_reactions: true,
    supports_polls: true,
    supports_buttons: true,
    supports_cards: false,
    supports_ptt: true,
  },
  
  formatText(content: string): string {
    // Convert Markdown to Telegram HTML
    return renderTelegramHtmlText(content);
  },
  
  chunkText(content: string): string[] {
    return markdownToTelegramHtmlChunks(content, 4000);
  },
  
  async sendText(target, text): Promise<DeliveryResult> {
    const htmlText = this.formatText(text);
    const chunks = this.chunkText(htmlText);
    const messageIds: string[] = [];
    
    for (const chunk of chunks) {
      try {
        const result = await bot.api.sendMessage(target.to, chunk, {
          parse_mode: 'HTML',
          message_thread_id: target.thread_id,
          reply_parameters: target.reply_to_id 
            ? { message_id: target.reply_to_id } 
            : undefined,
        });
        messageIds.push(String(result.message_id));
      } catch (err) {
        // Fallback to plain text if HTML parsing fails
        const result = await bot.api.sendMessage(target.to, stripHtml(chunk));
        messageIds.push(String(result.message_id));
      }
    }
    
    return { success: true, message_ids: messageIds, chunks_sent: chunks.length };
  },
  
  async createPoll(target, poll): Promise<PollResult> {
    const result = await bot.api.sendPoll(target.to, poll.question, poll.options, {
      allows_multiple_answers: poll.multi,
      message_thread_id: target.thread_id,
    });
    return { poll_id: String(result.poll.id), message_id: String(result.message_id) };
  },
};
```

#### WhatsApp (Baileys)

```typescript
const whatsappAdapter: ChannelOutAdapter = {
  channel: 'whatsapp',
  
  capabilities: {
    text_limit: 4000,
    supports_markdown: false,  // Plain text only
    supports_embeds: false,
    supports_threads: false,
    supports_reactions: true,
    supports_polls: true,
    supports_buttons: false,
    supports_cards: false,
    supports_ptt: true,  // Voice notes
  },
  
  formatText(content: string): string {
    // Convert markdown tables to plain text
    return convertMarkdownTables(content, 'plain');
  },
  
  chunkText(content: string): string[] {
    return chunkText(content, 4000);
  },
  
  async sendText(target, text): Promise<DeliveryResult> {
    const formatted = this.formatText(text);
    const chunks = this.chunkText(formatted);
    const messageIds: string[] = [];
    
    for (const chunk of chunks) {
      const result = await sock.sendMessage(target.to, { text: chunk });
      messageIds.push(result.key.id);
    }
    
    return { success: true, message_ids: messageIds, chunks_sent: chunks.length };
  },
};
```

#### iMessage

```typescript
const imessageAdapter: ChannelOutAdapter = {
  channel: 'imessage',
  
  capabilities: {
    text_limit: 4000,
    supports_markdown: false,
    supports_embeds: false,
    supports_threads: false,
    supports_reactions: true,  // Tapbacks
    supports_polls: false,
    supports_buttons: false,
    supports_cards: false,
    supports_ptt: false,
  },
  
  formatText(content: string): string {
    return convertMarkdownTables(content, 'plain');
  },
  
  chunkText(content: string): string[] {
    return chunkText(content, 4000);
  },
  
  async sendText(target, text): Promise<DeliveryResult> {
    const formatted = this.formatText(text);
    const chunks = this.chunkText(formatted);
    const messageIds: string[] = [];
    
    for (const chunk of chunks) {
      // Uses imsg CLI
      const result = await imsg.send({
        chat_id: target.to,
        text: chunk,
      });
      messageIds.push(result.message_id);
    }
    
    return { success: true, message_ids: messageIds, chunks_sent: chunks.length };
  },
};
```

#### Signal

```typescript
const signalAdapter: ChannelOutAdapter = {
  channel: 'signal',
  
  capabilities: {
    text_limit: 4000,
    supports_markdown: true,
    markdown_flavor: 'standard',
    supports_embeds: false,
    supports_threads: false,
    supports_reactions: true,
    supports_polls: false,
    supports_buttons: false,
    supports_cards: false,
    supports_ptt: true,
  },
  
  formatText(content: string): string {
    // Signal preserves text styles via ranges
    return content;
  },
  
  chunkText(content: string): string[] {
    return markdownToSignalTextChunks(content, 4000);
  },
  
  async sendText(target, text): Promise<DeliveryResult> {
    const chunks = this.chunkText(text);
    const messageIds: string[] = [];
    
    for (const chunk of chunks) {
      const result = await signalDaemon.send({
        recipient: target.to,
        message: chunk.text,
        textStyles: chunk.styles,  // Preserves formatting
      });
      messageIds.push(result.timestamp);
    }
    
    return { success: true, message_ids: messageIds, chunks_sent: chunks.length };
  },
};
```

---

## 4. Chunking System

### Chunking Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `length` | Split at character limit | Plain text channels |
| `newline` | Split at paragraph boundaries first | Readable chunks |
| `markdown` | Preserve code blocks, don't break syntax | Markdown-capable channels |

### Chunking Functions (from Upstream)

```typescript
// Basic length-based chunking
function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > limit) {
    // Find smart break point (newline, whitespace)
    let breakPoint = remaining.lastIndexOf('\n', limit);
    if (breakPoint < limit * 0.5) {
      breakPoint = remaining.lastIndexOf(' ', limit);
    }
    if (breakPoint < limit * 0.5) {
      breakPoint = limit;
    }
    
    chunks.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }
  
  if (remaining) chunks.push(remaining);
  return chunks;
}

// Markdown-aware chunking
function chunkMarkdownText(text: string, limit: number): string[] {
  // Don't break inside code blocks
  const codeBlockRegex = /```[\s\S]*?```/g;
  // ... implementation preserves code blocks
}

// Paragraph-aware chunking
function chunkByParagraph(text: string, limit: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';
  
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > limit) {
      if (current) chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  
  if (current) chunks.push(current.trim());
  return chunks;
}
```

---

## 5. Tool Hook Pattern for Formatting Guidance

### The Problem

Agent needs channel-specific formatting guidance, but:
- System prompt bloat breaks caching
- Not all turns need formatting guidance
- Guidance should be on-demand

### The Solution: Tool Hooks

When agent calls `message` tool, a `before_tool_call` hook intercepts and injects guidance.

```typescript
// Tool hook registration
const toolHooks = {
  before_tool_call: [
    {
      name: 'message-formatting-guide',
      match: { tool: 'message' },
      handler: messageFormattingHook,
    },
  ],
};

// Hook implementation
async function messageFormattingHook(
  event: ToolCallEvent,
  request: NexusRequest,
): Promise<ToolHookResult> {
  const channel = event.params.channel ?? request.delivery.channel;
  const capabilities = getChannelCapabilities(channel);
  
  // Load channel-specific formatting skill
  const guide = await loadFormattingGuide(channel);
  
  // Return guidance to be shown to agent
  return {
    inject_context: `
## Formatting for ${channel}

${guide.summary}

**Limits:**
- Text: ${capabilities.text_limit} chars
${capabilities.caption_limit ? `- Captions: ${capabilities.caption_limit} chars` : ''}

**Supported:**
${capabilities.supports_markdown ? '- Markdown: Yes' : '- Markdown: No (plain text only)'}
${capabilities.supports_buttons ? '- Inline buttons: Yes' : ''}
${capabilities.supports_polls ? '- Polls: Yes' : ''}
`,
  };
}
```

### Formatting Guides (Per Channel)

```typescript
const FORMATTING_GUIDES = {
  discord: {
    summary: `
Discord uses standard Markdown with some extensions.
- Keep messages under 2000 chars (auto-chunked if longer)
- Tables are converted to code blocks
- First message in a thread gets the reply reference
- Use embeds for rich structured content
    `,
  },
  
  telegram: {
    summary: `
Telegram uses HTML formatting, not Markdown.
- Keep messages under 4096 chars
- Captions limited to 1024 chars
- Bold: <b>text</b>, Italic: <i>text</i>
- Code: <code>text</code>, Pre: <pre>text</pre>
- If HTML parsing fails, falls back to plain text
- Forum topics supported via thread_id
    `,
  },
  
  whatsapp: {
    summary: `
WhatsApp uses plain text only.
- Keep messages under 4000 chars
- No markdown formatting preserved
- Tables converted to plain text
- Voice notes supported for audio
- Polls available with action=poll
    `,
  },
  
  imessage: {
    summary: `
iMessage uses plain text.
- Keep messages under 4000 chars
- No markdown formatting
- Tapback reactions available
- Media sent as attachments
    `,
  },
  
  signal: {
    summary: `
Signal preserves text formatting via style ranges.
- Keep messages under 4000 chars
- Bold, italic, strikethrough, monospace supported
- Tables converted based on config (code or plain)
- Voice notes supported
    `,
  },
};
```

---

## 6. toolResultFormat

### What It Is

Controls how tool OUTPUT is formatted when shown back TO the agent in conversation history.

### Values

| Value | Behavior |
|-------|----------|
| `markdown` | Tool results wrapped in code blocks, backticks |
| `plain` | Raw text, no formatting |

### How It's Determined

```typescript
const MARKDOWN_CAPABLE_CHANNELS = [
  'discord', 'telegram', 'signal', 'slack', 'googlechat',
];

function getToolResultFormat(channel: string): 'markdown' | 'plain' {
  return MARKDOWN_CAPABLE_CHANNELS.includes(channel) ? 'markdown' : 'plain';
}
```

### Effect on Tool Results

```typescript
// With markdown
function formatToolOutput(text: string, useMarkdown: boolean): string {
  if (!useMarkdown) return text;
  return `\`\`\`\n${text}\n\`\`\``;
}

// Example: read_file tool result

// markdown:
// ```
// {"config": "value"}
// ```

// plain:
// {"config": "value"}
```

### Nexus Approach

- `toolResultFormat` determined by `request.delivery.channel`
- Passed to agent execution context
- Tool results formatted accordingly

---

## 7. Adapter Registry

### Registration

```typescript
const adapterRegistry = new Map<string, ChannelOutAdapter>();

function registerAdapter(adapter: ChannelOutAdapter): void {
  adapterRegistry.set(adapter.channel, adapter);
}

function getAdapter(channel: string): ChannelOutAdapter | undefined {
  return adapterRegistry.get(channel);
}

// Register all adapters
registerAdapter(discordAdapter);
registerAdapter(telegramAdapter);
registerAdapter(whatsappAdapter);
registerAdapter(imessageAdapter);
registerAdapter(signalAdapter);
```

### Delivery Flow

```typescript
async function deliverResponse(
  request: NexusRequest,
  content: string,
): Promise<DeliveryResult> {
  const channel = request.delivery.channel;
  const adapter = getAdapter(channel);
  
  if (!adapter) {
    throw new Error(`No adapter for channel: ${channel}`);
  }
  
  const target: DeliveryTarget = {
    channel,
    account_id: request.delivery.account_id,
    to: request.delivery.peer_id,
    thread_id: request.delivery.thread_id,
    reply_to_id: request.delivery.reply_to_id,
  };
  
  return adapter.sendText(target, content);
}
```

---

## 8. Upstream Channel Support (to Port)

| Channel | Upstream Status | Priority | Notes |
|---------|-----------------|----------|-------|
| Discord | Full | High | Most complete |
| Telegram | Full | High | HTML formatting |
| WhatsApp | Full | High | Baileys |
| iMessage | Full | High | imsg CLI |
| Signal | Full | Medium | Signal daemon |
| Slack | Full | Medium | Threads, buttons |
| Google Chat | Partial | Low | Cards |
| MS Teams | Partial | Low | Adaptive Cards |
| Matrix | Stub | Low | E2E encryption |

### Porting Strategy

1. **Phase 1:** Discord, Telegram, WhatsApp, iMessage (core channels)
2. **Phase 2:** Signal, Slack
3. **Phase 3:** Google Chat, Teams, Matrix (as needed)

---

## 9. Open Questions

1. **Where do adapters live in codebase?**
   - Upstream: `src/{channel}/send.ts`
   - Nexus: TBD — unified `adapters/{channel}.ts`?

2. **How to handle adapter errors?**
   - Retry logic per adapter?
   - Best-effort mode from upstream?

3. **Media handling?**
   - Different per platform (download, upload, size limits)
   - Need separate spec?

4. **How does tool hook actually inject context?**
   - Modify params?
   - Return text that's shown to agent?
   - Need to confirm pi-agent mechanism

---

## Related Specs

- `NEXUS_REQUEST.md` — Request object that carries delivery context
- `upstream-reference/OPENCLAW_OUTBOUND.md` — Full upstream investigation
- `../agent-system/` — Broker that orchestrates delivery
