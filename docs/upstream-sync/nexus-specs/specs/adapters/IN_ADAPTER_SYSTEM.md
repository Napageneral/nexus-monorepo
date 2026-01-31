# In-Adapter System Specification

**Status:** DESIGN IN PROGRESS  
**Last Updated:** 2026-01-30

---

## Overview

In-adapters handle receiving messages from external platforms and normalizing them into `NexusRequest` objects for the pipeline.

---

## 1. Adapter Interface

```typescript
interface ChannelInAdapter {
  channel: string;
  
  // Lifecycle
  start(config: AdapterConfig): Promise<void>;
  stop(): Promise<void>;
  
  // Normalization
  normalizeEvent(rawEvent: unknown): NexusEvent;
  
  // Connection info
  isConnected(): boolean;
  getAccountId(): string;
}

interface NexusEvent {
  event_id: string;           // {adapter}:{source_id}
  timestamp: number;
  
  content: string;
  content_type: 'text' | 'image' | 'audio' | 'video' | 'file';
  direction: 'received';
  
  channel: string;
  account_id: string;
  sender_id: string;
  sender_name?: string;
  
  peer_id: string;
  peer_kind: 'dm' | 'group' | 'channel';
  thread_id?: string;
  reply_to_id?: string;
  
  metadata?: Record<string, any>;
  attachments?: Attachment[];
}
```

---

## 2. Channel Implementations (from Upstream)

### Discord

```typescript
const discordInAdapter: ChannelInAdapter = {
  channel: 'discord',
  
  async start(config) {
    // Uses @buape/carbon or discord.js
    client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      const event = this.normalizeEvent(message);
      await pipeline.process(event);
    });
  },
  
  normalizeEvent(message: DiscordMessage): NexusEvent {
    return {
      event_id: `discord:${message.id}`,
      timestamp: message.createdTimestamp,
      content: message.content,
      content_type: 'text',
      direction: 'received',
      channel: 'discord',
      account_id: message.client.user.id,
      sender_id: message.author.id,
      sender_name: message.author.username,
      peer_id: message.channel.id,
      peer_kind: message.channel.isDMBased() ? 'dm' : 'group',
      thread_id: message.channel.isThread() ? message.channel.id : undefined,
      reply_to_id: message.reference?.messageId,
      metadata: {
        guild_id: message.guildId,
        channel_name: message.channel.name,
      },
      attachments: message.attachments.map(a => ({
        id: a.id,
        filename: a.name,
        url: a.url,
        content_type: a.contentType,
      })),
    };
  },
};
```

### Telegram

```typescript
const telegramInAdapter: ChannelInAdapter = {
  channel: 'telegram',
  
  async start(config) {
    // Uses grammy
    bot.on('message', async (ctx) => {
      const event = this.normalizeEvent(ctx.message);
      await pipeline.process(event);
    });
    
    await bot.start();  // Polling or webhook
  },
  
  normalizeEvent(message: TelegramMessage): NexusEvent {
    return {
      event_id: `telegram:${message.message_id}`,
      timestamp: message.date * 1000,
      content: message.text || message.caption || '',
      content_type: message.photo ? 'image' : message.voice ? 'audio' : 'text',
      direction: 'received',
      channel: 'telegram',
      account_id: String(message.chat.id),
      sender_id: String(message.from.id),
      sender_name: message.from.first_name,
      peer_id: String(message.chat.id),
      peer_kind: message.chat.type === 'private' ? 'dm' : 'group',
      thread_id: message.message_thread_id ? String(message.message_thread_id) : undefined,
      reply_to_id: message.reply_to_message?.message_id 
        ? String(message.reply_to_message.message_id) 
        : undefined,
      metadata: {
        chat_title: message.chat.title,
        is_forum: message.chat.is_forum,
      },
    };
  },
};
```

### WhatsApp (Baileys)

```typescript
const whatsappInAdapter: ChannelInAdapter = {
  channel: 'whatsapp',
  
  async start(config) {
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        
        const event = this.normalizeEvent(msg);
        await pipeline.process(event);
      }
    });
  },
  
  normalizeEvent(msg: WAMessage): NexusEvent {
    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    
    return {
      event_id: `whatsapp:${msg.key.id}`,
      timestamp: msg.messageTimestamp * 1000,
      content: msg.message?.conversation || 
               msg.message?.extendedTextMessage?.text || '',
      content_type: 'text',
      direction: 'received',
      channel: 'whatsapp',
      account_id: sock.user.id,
      sender_id: isGroup ? msg.key.participant : jid,
      sender_name: msg.pushName,
      peer_id: jid,
      peer_kind: isGroup ? 'group' : 'dm',
      metadata: {
        quoted_message_id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId,
      },
    };
  },
};
```

### iMessage

```typescript
const imessageInAdapter: ChannelInAdapter = {
  channel: 'imessage',
  
  async start(config) {
    // Uses imsg CLI via RPC
    rpcClient.on('message', async (message) => {
      const event = this.normalizeEvent(message);
      await pipeline.process(event);
    });
  },
  
  normalizeEvent(message: IMessageRaw): NexusEvent {
    const isGroup = message.participants?.length > 1;
    
    return {
      event_id: `imessage:${message.id}`,
      timestamp: message.date,
      content: message.text,
      content_type: 'text',
      direction: 'received',
      channel: 'imessage',
      account_id: message.account_id,
      sender_id: message.sender,
      sender_name: message.sender_name,
      peer_id: message.chat_id || message.chat_guid,
      peer_kind: isGroup ? 'group' : 'dm',
      metadata: {
        chat_guid: message.chat_guid,
        service: message.service,
      },
    };
  },
};
```

### Signal

```typescript
const signalInAdapter: ChannelInAdapter = {
  channel: 'signal',
  
  async start(config) {
    // Uses Signal daemon SSE
    eventSource.on('receive', async (envelope) => {
      if (!envelope.dataMessage) return;
      
      const event = this.normalizeEvent(envelope);
      await pipeline.process(event);
    });
  },
  
  normalizeEvent(envelope: SignalEnvelope): NexusEvent {
    const isGroup = !!envelope.dataMessage.groupInfo;
    
    return {
      event_id: `signal:${envelope.timestamp}`,
      timestamp: envelope.timestamp,
      content: envelope.dataMessage.message,
      content_type: 'text',
      direction: 'received',
      channel: 'signal',
      account_id: config.accountId,
      sender_id: envelope.source,
      sender_name: envelope.sourceName,
      peer_id: isGroup ? envelope.dataMessage.groupInfo.groupId : envelope.source,
      peer_kind: isGroup ? 'group' : 'dm',
      metadata: {
        group_name: envelope.dataMessage.groupInfo?.name,
      },
    };
  },
};
```

---

## 3. Adapter Registry

```typescript
const inAdapterRegistry = new Map<string, ChannelInAdapter>();

function registerInAdapter(adapter: ChannelInAdapter): void {
  inAdapterRegistry.set(adapter.channel, adapter);
}

async function startAllAdapters(config: NexusConfig): Promise<void> {
  for (const [channel, adapterConfig] of Object.entries(config.channels)) {
    const adapter = inAdapterRegistry.get(channel);
    if (adapter && adapterConfig.enabled) {
      await adapter.start(adapterConfig);
    }
  }
}
```

---

## 4. Pipeline Integration

When an in-adapter receives a message:

```typescript
async function processInboundEvent(event: NexusEvent): Promise<void> {
  // 1. Create NexusRequest
  const request = createNexusRequest(event);
  
  // 2. Store in Events Ledger
  await eventsLedger.insert(event);
  
  // 3. Run through pipeline
  await aclEvaluate(request);
  await hookEvaluate(request);
  await brokerDispatch(request);
}

function createNexusRequest(event: NexusEvent): NexusRequest {
  return {
    request_id: uuid(),
    event_id: event.event_id,
    timestamp: event.timestamp,
    
    event: {
      content: event.content,
      content_type: event.content_type,
      direction: event.direction,
      metadata: event.metadata,
    },
    
    delivery: {
      channel: event.channel,
      account_id: event.account_id,
      thread_id: event.thread_id,
      reply_to_id: event.reply_to_id,
      peer_id: event.peer_id,
      peer_kind: event.peer_kind,
      capabilities: getChannelCapabilities(event.channel),
    },
    
    pipeline: [{
      stage: 'adapter',
      timestamp: Date.now(),
      latency_ms: 0,
    }],
  };
}
```

---

## 5. Relationship to Out-Adapters

In Nexus, we propose **unified channel adapters** that handle both directions:

```typescript
interface ChannelAdapter {
  channel: string;
  capabilities: ChannelCapabilities;
  
  // Inbound
  start(config: AdapterConfig): Promise<void>;
  stop(): Promise<void>;
  normalizeEvent(rawEvent: unknown): NexusEvent;
  
  // Outbound
  formatText(content: string): string;
  chunkText(content: string): string[];
  sendText(target: DeliveryTarget, text: string): Promise<DeliveryResult>;
  sendMedia(target: DeliveryTarget, media: MediaPayload): Promise<DeliveryResult>;
}
```

Single adapter per channel keeps:
- Capabilities in one place
- Formatting rules consistent
- Easier to add new channels

---

## Related Specs

- `OUT_ADAPTER_SYSTEM.md` — Outbound delivery
- `../core/NEXUS_REQUEST.md` — Request object created by adapters
- `upstream-reference/OPENCLAW_INBOUND.md` — Full upstream investigation
