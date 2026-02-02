# Streaming in NEX

**Status:** DESIGN COMPLETE  
**Last Updated:** 2026-01-30

---

## Overview

Streaming enables real-time token delivery from agent to user. This document specifies how streaming flows through the NEX architecture.

**Key insight:** Streaming happens between Agent ↔ Broker ↔ Out-Adapter. NEX sets up the context but doesn't intercept the stream — that would be too slow.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              STREAMING FLOW                                      │
│                                                                                  │
│  NEX Pipeline (sync)                    Agent Execution (streaming)             │
│  ─────────────────                      ────────────────────────────            │
│                                                                                  │
│  ┌─────────────────┐                                                            │
│  │ 1. RECEIVE      │                                                            │
│  │ 2. ACL          │                                                            │
│  │ 3. HOOKS        │                                                            │
│  │ 4. BROKER PREP  │─────────────────────┐                                      │
│  └────────┬────────┘                     │                                      │
│           │                              │ StreamingContext                     │
│           │ prepare()                    │  - delivery target                   │
│           │ returns                      │  - out-adapter instance              │
│           │                              │  - typing signaler                   │
│           ▼                              │  - permissions                       │
│  ┌─────────────────┐                     │                                      │
│  │ 5. AGENT EXEC   │◄────────────────────┘                                      │
│  │    (streaming)  │                                                            │
│  │                 │    ┌───────────────────────────────────────────────────┐  │
│  │   NEX waits     │    │                                                   │  │
│  │   for completion│    │   Agent generates token                          │  │
│  │                 │    │       ↓                                           │  │
│  │                 │    │   Broker receives onTextDelta(token)              │  │
│  │                 │    │       ↓                                           │  │
│  │                 │    │   Broker calls adapter.onPartial(text)            │  │
│  │                 │    │       ↓                                           │  │
│  │                 │    │   Adapter updates platform:                       │  │
│  │                 │    │     - Typing indicator                            │  │
│  │                 │    │     - Draft message edit (Telegram)               │  │
│  │                 │    │     - Accumulate for final send                   │  │
│  │                 │    │       ↓                                           │  │
│  │                 │    │   (repeat until agent completes)                  │  │
│  │                 │    │       ↓                                           │  │
│  │                 │    │   Agent completes → final response                │  │
│  │                 │    │                                                   │  │
│  │                 │    └───────────────────────────────────────────────────┘  │
│  │                 │                          │                                 │
│  │◄────────────────┼──────────────────────────┘                                 │
│  │  response       │                                                            │
│  └────────┬────────┘                                                            │
│           │                                                                     │
│           ▼                                                                     │
│  ┌─────────────────┐                                                            │
│  │ 6. DELIVER      │  May send final message if streaming not supported        │
│  │ 7. COMPLETE     │  Write trace to ledger                                    │
│  └─────────────────┘                                                            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Components

### StreamingContext

Created by Broker during preparation, passed to agent execution:

```typescript
interface StreamingContext {
  // Delivery target
  channel: string;
  peer_id: string;
  thread_id?: string;
  reply_to_id?: string;
  
  // Adapter
  outAdapter: OutboundAdapter;
  
  // Callbacks
  onPartial: (text: string, mediaUrls?: string[]) => Promise<void>;
  onTyping: () => Promise<void>;
  onToolStart: (toolName: string) => Promise<void>;
  
  // Typing signaler
  typingSignaler: TypingSignaler;
  
  // Streaming config
  streamingEnabled: boolean;
  draftMode: boolean;  // Telegram: edit message as tokens arrive
}
```

### TypingSignaler

Manages typing indicators across different trigger points:

```typescript
interface TypingSignaler {
  signalRunStart(): Promise<void>;      // Agent starts
  signalMessageStart(): Promise<void>;  // Assistant message begins
  signalTextDelta(text?: string): Promise<void>;  // Token received
  signalToolStart(): Promise<void>;     // Tool execution begins
  signalReasoningDelta(): Promise<void>; // Reasoning update
}
```

### Streaming Callbacks

The Broker provides these callbacks to the agent executor:

```typescript
interface AgentStreamingCallbacks {
  // Text streaming
  onTextDelta?: (delta: string) => Promise<void>;
  onTextStart?: () => Promise<void>;
  onTextEnd?: (fullText: string) => Promise<void>;
  
  // Partial reply (accumulated text)
  onPartialReply?: (payload: { text: string; mediaUrls?: string[] }) => Promise<void>;
  
  // Reasoning (for reasoning models)
  onReasoningStream?: (payload: { text: string }) => Promise<void>;
  
  // Tools
  onToolStart?: (toolName: string, params: unknown) => Promise<void>;
  onToolEnd?: (toolName: string, result: unknown) => Promise<void>;
  
  // Message lifecycle
  onAssistantMessageStart?: () => Promise<void>;
  onAssistantMessageEnd?: () => Promise<void>;
}
```

---

## Flow Detail

### 1. NEX Prepares Context

```typescript
// In NEX pipeline, stage 4 (Broker)
const streamingContext = await broker.prepare(nexusRequest);

// streamingContext includes:
// - Delivery target from nexusRequest.delivery
// - Out-adapter for the channel
// - Typing signaler configured for channel
// - onPartial callback wired to adapter
```

### 2. Broker Wires Callbacks

```typescript
// Broker creates streaming callbacks
const callbacks: AgentStreamingCallbacks = {
  onAssistantMessageStart: async () => {
    await streamingContext.typingSignaler.signalMessageStart();
  },
  
  onTextDelta: async (delta) => {
    // Accumulate text
    accumulatedText += delta;
    
    // Signal typing
    await streamingContext.typingSignaler.signalTextDelta(delta);
    
    // If streaming enabled, send partial
    if (streamingContext.streamingEnabled) {
      await streamingContext.onPartial(accumulatedText);
    }
  },
  
  onToolStart: async (toolName) => {
    await streamingContext.typingSignaler.signalToolStart();
  },
  
  onTextEnd: async (fullText) => {
    // Final text ready
    finalResponse = fullText;
  },
};
```

### 3. Agent Executes with Callbacks

```typescript
// Agent execution (inside Broker)
const response = await agentSession.run({
  messages: conversationHistory,
  newMessage: nexusRequest.event.content,
  tools: allowedTools,
  callbacks: callbacks,  // Streaming callbacks
});
```

### 4. Adapter Handles Platform-Specific Streaming

```typescript
// Example: Telegram draft mode
class TelegramAdapter implements OutboundAdapter {
  private draftMessageId?: string;
  
  async onPartial(text: string): Promise<void> {
    if (this.draftMessageId) {
      // Edit existing message
      await this.bot.editMessage(this.draftMessageId, text);
    } else {
      // Send initial draft
      const msg = await this.bot.sendMessage(this.target, text);
      this.draftMessageId = msg.id;
    }
  }
  
  async sendFinal(text: string): Promise<DeliveryResult> {
    if (this.draftMessageId) {
      // Final edit
      await this.bot.editMessage(this.draftMessageId, text);
      return { success: true, message_ids: [this.draftMessageId] };
    } else {
      // No streaming happened, send normally
      const msg = await this.bot.sendMessage(this.target, text);
      return { success: true, message_ids: [msg.id] };
    }
  }
}
```

### 5. NEX Receives Final Response

```typescript
// Back in NEX pipeline
const response = await broker.execute(nexusRequest, streamingContext);

// response contains:
// - content: final text
// - tool_calls: array of tool invocations
// - tokens_in, tokens_out
// - latency_ms

nexusRequest.response = response;
```

### 6. Deliver Stage (Conditional)

```typescript
// Stage 6: Deliver
if (!streamingContext.streamingEnabled) {
  // No streaming happened, send final message now
  const result = await outAdapter.sendFinal(response.content);
  nexusRequest.delivery_result = result;
} else {
  // Already sent via streaming
  nexusRequest.delivery_result = {
    success: true,
    streamed: true,
    message_ids: streamingContext.sentMessageIds,
  };
}
```

---

## Channel Streaming Support

| Channel | Streaming Mode | Typing | Notes |
|---------|---------------|--------|-------|
| **Discord** | Accumulate | ✅ | Send final message at end |
| **Telegram** | Draft edit | ✅ | Edit message as tokens arrive |
| **WhatsApp** | Accumulate | ✅ | Send final at end (no edit API) |
| **iMessage** | Accumulate | ❌ | Send final at end |
| **Signal** | Accumulate | ✅ | Send final at end |
| **Slack** | Draft edit | ✅ | Edit message as tokens arrive |

### Streaming Modes

**Accumulate:** Tokens accumulate locally, typing indicator fires, final message sent at end.

**Draft Edit:** Initial message sent immediately, edited as each token arrives.

---

## Typing Indicator Triggers

Typing indicators fire at multiple points to show activity:

| Trigger | When |
|---------|------|
| Run start | Agent execution begins |
| Message start | Assistant starts responding |
| Text delta | Each token received |
| Tool start | Tool execution begins |
| Reasoning delta | Reasoning model thinking |

---

## Error Handling

### Streaming Errors

If streaming fails mid-response:

```typescript
try {
  await streamingContext.onPartial(text);
} catch (error) {
  // Log but don't fail the agent
  console.error('Streaming update failed:', error);
  // Continue accumulating, will send final at end
  streamingContext.streamingEnabled = false;
}
```

### Agent Errors

If agent fails mid-stream:

```typescript
try {
  const response = await broker.execute(nexusRequest, streamingContext);
} catch (error) {
  // If we sent partial messages, send error message
  if (streamingContext.sentMessageIds.length > 0) {
    await outAdapter.sendMessage(target, "Sorry, I encountered an error.");
  }
  throw error;
}
```

---

## Configuration

### Per-Channel Config

```yaml
adapters:
  telegram:
    streaming:
      enabled: true
      mode: draft_edit
      typing_interval_ms: 3000
  
  discord:
    streaming:
      enabled: true
      mode: accumulate
      typing_interval_ms: 5000
  
  imessage:
    streaming:
      enabled: false  # No typing indicator support
```

### Per-Session Override

Agents or hooks can disable streaming for specific requests:

```typescript
// In hook
if (isLongFormResponse) {
  nexusRequest.hooks.context.disable_streaming = true;
}
```

---

## Interaction with Plugins

Plugins do NOT intercept streaming — too slow.

Plugins can:
- Inspect `nexusRequest.response` after completion
- Modify streaming config via `hooks.context.disable_streaming`
- Log streaming metrics in `onComplete`

---

## Related Specs

- `NEX.md` — Pipeline orchestration
- `NEXUS_REQUEST.md` — Data bus schema
- `../broker/AGENT_EXECUTION.md` — Agent execution details
- `../adapters/OUTBOUND_INTERFACE.md` — Adapter interface
