# Agent-Driven Delivery Model

**Status:** CANONICAL
**Last Updated:** 2026-03-01
**Related:** [NEXUS_REQUEST_TARGET.md](./NEXUS_REQUEST_TARGET.md)

---

## Core Principle

The pipeline does not deliver messages. The **agent** decides if, when, and where to respond — by invoking a delivery tool. If the agent never invokes the tool, no message is sent. If the agent sends messages across multiple platforms, that's fine too. The pipeline's only job is to run `executeOperation`, which fires the agent. Everything else is the agent's autonomous decision.

---

## Architecture

```
Pipeline: acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest
                                                      │
                                                      └── For event.ingest with agent receiver:
                                                            broker.runAgent(request)
                                                              │
                                                              └── Agent runs with tools:
                                                                    • agent_deliver(content, target?)
                                                                    • agent_send(op, text, target)
                                                                    • wait()
                                                                    │
                                                                    When agent invokes agent_deliver:
                                                                      1. Broker resolves adapter from platform/routing
                                                                      2. Broker queries adapter capabilities from registry
                                                                      3. Broker opens delivery session with adapter
                                                                      4. Agent content streams to adapter via delivery.stream
                                                                      5. Adapter handles: typing, block chunking, streaming
                                                                      6. Adapter responds with delivery_complete
                                                                      7. Broker records outbound event in events table
```

---

## Key Principles

### 1. Agent Autonomy

The agent is the decision-maker for all outbound communication:
- **Zero responses** is a valid outcome. The pipeline completes successfully.
- **Multiple responses** across multiple platforms is fine.
- **Channel selection** is the agent's choice, informed by the adapter capability registry.
- The pipeline never assumes a response will happen.

### 2. Delivery is a Tool, Not a Stage

There is no `deliverResponse` pipeline stage. Delivery happens when the agent invokes a send tool during `executeOperation`. This cleanly encapsulates delivery as an agent capability, not a pipeline concern.

### 3. Adapter Owns the Delivery Experience

Each adapter implements its own platform-specific delivery behavior:
- **Typing indicators**: The adapter decides when to show/hide typing based on its platform's conventions.
- **Block chunking**: The adapter chunks content based on its platform's text limits and formatting rules.
- **Streaming**: The adapter decides whether to stream token-by-token (edit-in-place) or deliver completed blocks.
- **Formatting**: The adapter applies platform-specific formatting (markdown flavor, embeds, buttons, etc.).

The broker does NOT need to know about typing modes, chunk sizes, or streaming strategies. It provides a content stream; the adapter renders it.

### 4. Portable and Composable

Because delivery is a tool, it is portable — any agent (manager, worker, unified) can use send tools. The broker makes adapter-specific delivery "flavors" available as tool capabilities. This enables:
- Manager agents sending across multiple platforms
- Worker agents reporting back through specific channels
- Any future agent type gaining delivery capabilities

---

## Agent Tools

### `agent_deliver`

Unified delivery tool that consolidates the previous `reply_to_caller` and `send_message` into a single interface. When called without a target, it replies on the same channel the inbound event arrived through (implicit routing from `request.routing`). When called with explicit target fields, it sends to the specified platform/channel.

```typescript
{
  content: string;         // the message to send

  // Optional explicit targeting (omit to reply to caller)
  platform?: string;       // "discord", "telegram", "bluebubbles", etc.
  target?: string;         // channel/user/container ID
  account_id?: string;     // if the platform has multiple accounts
  thread_id?: string;
  reply_to_id?: string;
}
```

The broker resolves the adapter from the target (or from `request.routing` if no explicit target), queries its capabilities, and opens a delivery session.

### `agent_send`

Dispatches work to other agents (sub-agent orchestration). Existing broker dispatch mechanism.

### `wait`

Explicitly completes without sending a response. Useful for manager agents that have handled the request through tool calls (e.g., filing a ticket, updating a database) without needing to message back.

---

## Adapter Capability Registry

Each adapter exposes its capabilities during `adapter.control.start` via `endpoint.upsert`. The adapter manager maintains a registry:

```typescript
type AdapterCapabilities = {
  // Platform identity
  platform: string;
  account_id: string;

  // Delivery capabilities
  supports_typing: boolean;
  supports_streaming: boolean;       // Native token-by-token streaming (edit-in-place)
  supports_block_delivery: boolean;  // Multi-message chunked delivery
  supports_edit: boolean;
  supports_delete: boolean;

  // Content capabilities
  text_limit: number;                // Max chars per message
  supports_markdown: boolean;
  markdown_flavor?: string;
  supports_code_blocks: boolean;
  supports_tables: boolean;
  supports_media: boolean;
  supports_voice_notes: boolean;
  supports_embeds: boolean;
  supports_buttons: boolean;
  supports_reactions: boolean;
  supports_threads: boolean;
  supports_polls: boolean;

  // Available endpoints
  endpoints: AdapterEndpoint[];
};
```

The broker queries this registry when the agent invokes a send tool, so the agent can see what platforms are available and what each supports.

---

## delivery.stream Protocol Extensions

The existing `delivery.stream` bidirectional JSONL protocol is extended to support the agent-driven model:

### nex → adapter (stream events)

```typescript
// Existing events (unchanged)
{ type: "stream_start", runId, sessionLabel, target }
{ type: "token", text }
{ type: "tool_status", toolName, toolCallId, status, summary? }
{ type: "reasoning", text }
{ type: "stream_end", runId, final? }
{ type: "stream_error", error, partial }
```

The adapter receives the content stream and autonomously decides:
- When to start/stop typing indicators
- How to chunk the content into platform-appropriate blocks
- Whether to stream via edit-in-place or multi-message delivery
- How to format content for its platform

### adapter → nex (status events)

```typescript
// Existing events (unchanged)
{ type: "message_created", messageId }
{ type: "message_updated", messageId }
{ type: "message_sent", messageId }
{ type: "delivery_complete", messageIds, final: true }
{ type: "error", error }
```

---

## Typing Modes (Adapter-Internal)

Each adapter implements its own typing strategy. Common modes:

| Mode | Behavior | Typical Platform |
|---|---|---|
| `instant` | Start typing immediately on `stream_start` | DMs |
| `on_content` | Start typing when first `token` arrives | Group chats |
| `never` | No typing indicators | Email, SMS |

The adapter decides based on:
- Container kind (DM vs group)
- Platform conventions
- Whether the event was an @mention

**The broker does not participate in typing decisions.**

---

## Block Chunking (Adapter-Internal)

Each adapter implements its own chunking strategy based on platform constraints:

| Platform | Text Limit | Chunking Strategy |
|---|---|---|
| Discord | 2000 chars | Stream with edit-in-place, or multi-message for long content |
| WhatsApp | 4096 chars | Block delivery with paragraph-break splitting |
| SMS | 160 chars | Aggressive chunking |
| Email | Unlimited | Batch delivery (entire response as one message) |
| Telegram | 4096 chars | Block delivery with Markdown formatting |

The adapter buffers `token` events and decides when a block is ready for delivery. Common strategies:
- **Min/max chars**: Buffer until 800-1200 chars, flush at paragraph breaks
- **Paragraph mode**: Flush on every `\n\n` boundary
- **Batch mode**: Buffer everything until `stream_end`, deliver as one message

**The broker does not participate in chunking decisions.**

---

## Outbound Event Recording

When delivery completes (adapter sends `delivery_complete`), the broker records an outbound event in the events table:

```typescript
{
  id: generatedId,
  content: deliveredContent,
  content_type: "text",
  platform: adapter.platform,
  sender_id: agent.entity_id,     // agent is the sender for outbound
  receiver_id: originalSender.id, // original sender is the receiver
  container_id: routing.container_id,
  thread_id: routing.thread_id,
  request_id: request.request_id,
  timestamp: now,
  received_at: now,
}
```

This ensures the events table contains both inbound and outbound events for complete conversation history.

---

## Migration from Current Architecture

### What Gets Eliminated

- `deliverResponse` pipeline stage — replaced by agent tool invocation
- Reply agent's `onBlockReply` callback chain — replaced by adapter-internal chunking
- Reply agent's `TypingController` / `TypingSignaler` — replaced by adapter-internal typing
- `DeliveryContext.capabilities` and `available_channels` on the NexusRequest bus — replaced by adapter registry
- `DeliveryResult` on the NexusRequest bus — delivery is internal to `executeOperation`
- `ResponseContext` on the NexusRequest bus — agent execution details are internal

### What Gets Migrated

- Block chunking logic (`EmbeddedBlockChunker`) → each adapter implements its own version
- Typing mode resolution → each adapter implements its own strategy
- `delivery.stream` protocol → extended but fundamentally the same
- `agent_deliver` tool (consolidates old `send_message` and `reply_to_caller`) → through broker → adapter delivery session

### What Stays

- `delivery.stream` subprocess protocol (bidirectional JSONL)
- `delivery.send` one-shot protocol (for non-streaming adapters)
- `SessionQueue` for per-session serialization (internal to broker)
- Adapter manager process lifecycle management

---

## Open Items

- **Adapter SDK updates**: Each adapter needs to implement typing and chunking internally. Need to provide SDK helpers/defaults.
- **Block chunking defaults**: Provide a reference implementation that adapters can use out-of-the-box, with platform-specific overrides.
- **Typing mode defaults**: Same — provide sensible defaults adapters can customize.
- **Capabilities refresh protocol**: How/when does the adapter registry refresh capabilities? On every `adapter.control.start`? Periodic polling?
- **Multi-account routing**: When a platform has multiple accounts, how does the agent's tool present the choice?
