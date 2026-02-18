# Streaming Architecture

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-06

---

## Overview

Streaming defines how agent responses flow in real time from the Agent Engine through the Nexus system to the end user. This is a cross-cutting concern that touches three runtime components:

- **Broker** — Translates agent engine callbacks into StreamEvents
- **NEX** — Routes StreamEvents to the correct adapter (or block pipeline fallback)
- **Adapters** — Handle platform-specific rendering (edit throttling, SSE, block sends)

**Key Principle:** Stream as natively as possible, coalesce only when the platform requires it.

The Broker always streams raw token events. NEX routes them based on adapter capability. Adapters handle platform-specific rendering.

---

## Architecture

```
Agent Engine (pi-coding-agent)
    │ raw callbacks: onPartialReply, onToolResult, onAgentEvent
    ▼
Broker (translates to StreamEvents)
    │ StreamEvent: token, tool_status, lifecycle
    ▼
NEX (routes based on adapter capability)
    │
    ├── Adapter supports "stream"?
    │     │
    │     YES → Pipe events to adapter's stream process (stdin JSONL)
    │           Adapter handles platform-specific rendering
    │
    │     NO → NEX Block Pipeline (coalesce tokens → blocks)
    │           Call adapter's `send` for each block
    │
    └── After stream completes → Broker writes AgentResult to ledger
```

### Layer Responsibilities

| Layer | Responsibility | Does NOT do |
|-------|---------------|-------------|
| **Broker** | Translate agent callbacks to StreamEvents | Platform-aware coalescing, delivery |
| **NEX** | Route events to adapter, block pipeline fallback | Platform-specific formatting |
| **Adapter** | Platform-specific streaming (edit timing, SSE, etc.) | Context assembly, ledger writes |

---

## StreamEvent Protocol

The Broker emits `StreamEvent` objects during agent execution. These flow through NEX to the adapter.

```typescript
type StreamEvent =
  | { type: 'stream_start'; runId: string; sessionLabel: string; target: DeliveryTarget }
  | { type: 'token'; text: string }
  | { type: 'tool_status'; toolName: string; toolCallId: string; status: 'started' | 'completed' | 'failed'; summary?: string }
  | { type: 'reasoning'; text: string }
  | { type: 'stream_end'; runId: string; final?: boolean }
  | { type: 'stream_error'; error: string; partial: boolean };
```

### Event Details

**`stream_start`** — Agent execution has begun. Includes the delivery target so NEX can route immediately.

**`token`** — A text token from the LLM. Emitted as fast as the model produces them. These are the raw building blocks of the response.

**`tool_status`** — Agent is calling a tool. `started` when the tool begins, `completed`/`failed` when it finishes. Adapters can render this as status indicators ("Reading file.ts...", "Running shell command...").

**`reasoning`** — Extended thinking tokens. Most adapters will suppress these. API/debug adapters may forward them.

**`stream_end`** — Agent execution complete. `final: true` means this is the last stream event for this run (no more tool calls). `final: false` means the agent will continue after processing tool results.

**`stream_error`** — Something went wrong. `partial: true` means some content was already delivered (user saw partial response). `partial: false` means nothing was delivered yet.

---

## Broker → NEX Interface

The Broker provides a stream handle to NEX at the start of execution:

```typescript
interface BrokerStreamHandle {
  // NEX subscribes to stream events
  onEvent(callback: (event: StreamEvent) => void): void;
  
  // NEX can signal back to Broker
  abort(): void;                    // Cancel execution
  
  // Status queries
  isStreaming(): boolean;
  isCompacting(): boolean;
}

// Broker execution returns both the stream handle and the final result
interface BrokerExecution {
  stream: BrokerStreamHandle;       // For real-time streaming
  result: Promise<AgentResult>;     // Resolves when execution completes
}
```

### Usage

```typescript
// NEX starts broker execution
const execution = broker.execute(nexusRequest);

// Subscribe to streaming events
execution.stream.onEvent((event) => {
  routeStreamEvent(nexusRequest.delivery, event);
});

// Wait for final result (ledger writes happen here)
const result = await execution.result;
```

---

## Agent Engine → Broker Translation

The Agent Engine (pi-coding-agent) produces raw callbacks. The Broker translates these into StreamEvents:

```typescript
// Raw callbacks from pi-coding-agent
interface AgentEngineCallbacks {
  onPartialReply: (payload: { text: string; messageId?: string }) => void;
  onReasoningStream: (payload: { text: string }) => void;
  onToolResult: (payload: { toolCallId: string; toolName: string; status: 'started' | 'completed' | 'failed'; summary?: string }) => void;
  onAgentEvent: (event: { phase: 'start' | 'streaming' | 'tool_use' | 'compaction_start' | 'compaction_end' | 'end'; timestamp: number }) => void;
}

// Broker translation (simplified)
// onAgentEvent(start)        → stream_start
// onPartialReply(text)       → token
// onReasoningStream(text)    → reasoning
// onToolResult(started)      → tool_status (started)
// onToolResult(completed)    → tool_status (completed)
// onAgentEvent(end)          → stream_end
```

See `broker/AGENT_ENGINE.md` for the full agent engine interface.

---

## NEX Stream Router

NEX receives StreamEvents from the Broker and routes them based on adapter capability.

```typescript
async function routeStreamEvent(delivery: DeliveryContext, event: StreamEvent): Promise<void> {
  const adapter = adapterManager.getOutboundAdapter(delivery.channel, delivery.account_id);
  
  if (adapter.supports.includes('stream')) {
    // Path 1: Adapter handles streaming natively
    await pipeToAdapterStream(adapter, delivery, event);
  } else {
    // Path 2: Block pipeline fallback
    await blockPipeline.enqueue(delivery, event);
  }
}
```

---

## Path 1: Native Adapter Streaming

### The `stream` Command

Adapters that support streaming implement a `stream` command — a long-running bidirectional process.

```bash
<command> stream --account <account_id> --format jsonl
```

**Stdin:** Receives StreamEvents as JSONL (one per line).  
**Stdout:** Emits delivery status as JSONL.

### Stdin (NEX → Adapter)

NEX pipes StreamEvents directly to the adapter's stdin:

```jsonl
{"type":"stream_start","runId":"run_abc","target":{"to":"channel:123456","thread_id":"789"},"sessionLabel":"main"}
{"type":"token","text":"Let me "}
{"type":"token","text":"check "}
{"type":"token","text":"that for you."}
{"type":"tool_status","toolName":"Read","toolCallId":"tc_1","status":"started"}
{"type":"tool_status","toolName":"Read","toolCallId":"tc_1","status":"completed","summary":"Read package.json"}
{"type":"token","text":"\n\nHere's what I found:"}
{"type":"token","text":" the version is 2.1.0."}
{"type":"stream_end","runId":"run_abc","final":true}
```

### Stdout (Adapter → NEX)

The adapter reports delivery status:

```typescript
type AdapterStreamStatus =
  | { type: 'message_created'; messageId: string }
  | { type: 'message_updated'; messageId: string; chars: number }
  | { type: 'message_sent'; messageId: string; final: boolean }
  | { type: 'delivery_complete'; messageIds: string[] }
  | { type: 'delivery_error'; error: string };
```

```jsonl
{"type":"message_created","messageId":"msg_abc123"}
{"type":"message_updated","messageId":"msg_abc123","chars":35}
{"type":"message_updated","messageId":"msg_abc123","chars":82}
{"type":"message_sent","messageId":"msg_abc123","final":false}
{"type":"message_sent","messageId":"msg_def456","final":true}
{"type":"delivery_complete","messageIds":["msg_abc123","msg_def456"]}
```

### Adapter-Specific Behavior

Each streaming adapter handles platform specifics internally:

**Discord adapter:**
- On `stream_start`: Create empty message in channel
- On `token`: Accumulate text, edit message every ~300ms (Discord rate limit: 5 edits/sec)
- On `tool_status`: Optionally show status embed or typing indicator
- On `stream_end`: Final edit with complete text, remove any status indicators

**Telegram adapter:**
- On `stream_start`: Send initial message, start typing action
- On `token`: Accumulate text, `editMessageText` every ~500ms
- On `tool_status`: Edit message to show "Reading file..." indicator
- On `stream_end`: Final edit with complete formatted text (HTML)

**API/WebSocket adapter:**
- On `token`: Forward as SSE event immediately (true streaming)
- On `tool_status`: Forward as structured SSE event
- On `stream_end`: Send SSE close event

**Slack adapter:**
- On `stream_start`: `chat.postMessage` with initial text
- On `token`: Accumulate, `chat.update` periodically
- On `stream_end`: Final `chat.update` with formatted text (mrkdwn)

### Stream Process Lifecycle

NEX manages one stream process per adapter account (like monitor):

```
NEX starts adapter execution
    │
    ├── Is stream process running for this adapter/account?
    │     YES → Pipe to existing process
    │     NO → Spawn: <command> stream --account <id> --format jsonl
    │
    └── Stream process stays alive for subsequent deliveries
        (NEX sends multiple stream_start/stream_end sequences)
```

The stream process is long-running, handling multiple deliveries. NEX spawns it on first use and keeps it alive. Each `stream_start`/`stream_end` pair is one delivery.

---

## Path 2: Block Pipeline Fallback

For adapters that only support `send` (no `stream` capability), NEX coalesces token events into blocks and delivers via `send`.

### Block Pipeline

```typescript
interface BlockPipeline {
  enqueue(delivery: DeliveryContext, event: StreamEvent): void;
  flush(delivery: DeliveryContext): Promise<void>;
  stop(delivery: DeliveryContext): void;
}
```

### Coalescing Logic

Tokens accumulate in a buffer. The buffer flushes when:

1. **Size threshold reached** — Buffer exceeds `maxChars`
2. **Paragraph boundary** — Buffer has content at a `\n\n` boundary and exceeds `minChars`
3. **Idle timeout** — No new tokens for `idleMs` (agent is thinking or doing tool calls)
4. **Stream end** — Flush any remaining content

```typescript
interface BlockPipelineConfig {
  minChars: number;          // Min chars before flush (default: 800)
  maxChars: number;          // Max chars per block (default: 1200)
  idleMs: number;            // Idle timeout for flush (default: 1000)
  humanDelayMs?: {           // Delay between block sends
    min: number;             // Default: 800
    max: number;             // Default: 2500
  };
}
```

### Block Delivery

When a block flushes:

```typescript
async function deliverBlock(adapter: OutboundAdapter, delivery: DeliveryContext, block: string): Promise<void> {
  // Apply human delay (random interval between blocks)
  if (blockIndex > 0 && config.humanDelayMs) {
    const delay = randomBetween(config.humanDelayMs.min, config.humanDelayMs.max);
    await sleep(delay);
  }
  
  // Deliver via adapter's send command
  await adapter.send(delivery, block);
}
```

### Per-Channel Config

Block pipeline config can vary by channel since different platforms have different character limits and user expectations:

```typescript
const BLOCK_PIPELINE_DEFAULTS: Record<string, Partial<BlockPipelineConfig>> = {
  imessage: { minChars: 600, maxChars: 1000, humanDelayMs: { min: 1000, max: 3000 } },
  whatsapp: { minChars: 600, maxChars: 1000, humanDelayMs: { min: 800, max: 2500 } },
  sms: { minChars: 140, maxChars: 160, humanDelayMs: { min: 500, max: 1500 } },
};
```

### Tool Status in Block Mode

For block-only platforms, tool status events are rendered inline:

```
[Reading package.json...]

Here's what I found: the version is 2.1.0.
```

Or suppressed entirely, depending on channel config.

---

## Interruption During Streaming

### Preemption (Steer/Interrupt)

When a new message arrives for a session with an active run:

```
User sends new message → NEX enqueues message (mode=interrupt/steer)
    │
    ├── Active run exists?
    │     YES → broker.stream.abort()
    │           Broker persists partial output (turn status = 'aborted')
    │
    └── Queue drains backlog into the next run
          - Preemptive modes drain queued messages + the new message
          - NEX builds a synthetic batch event referencing original event_ids
          - Context assembly replays them as distinct messages
          → Start new run
```

There is **no in-run message injection** in the Broker streaming interface. `steer` is treated as a preemptive alias of `interrupt` (abort + restart).

### Abort

If the agent needs to be stopped (interrupt queue mode, user cancellation):

```
NEX calls → broker.stream.abort()
    │
    ├── Agent execution cancelled via AbortSignal
    ├── Stream ends (stop_reason = 'aborted')
    ├── If adapter is streaming: adapter gets stream_end or error, finalizes
    ├── Partial content already delivered to user stays visible
    └── Ledger records the turn as 'aborted' and persists any partial output
```

---

## Streaming and Ledger Writes

**Streaming and persistence are separate concerns.**

- **During execution:** StreamEvents flow to adapters in real time. Nothing is written to the ledger yet.
- **After execution:** The complete `AgentResult` is written to the Agents Ledger in a single transaction.

This means:
- Users see responses in real time via streaming
- The ledger gets the complete, final state (not partial fragments)
- If the agent fails mid-stream, users saw partial output but the ledger records the failure
- Ledger data is always consistent (no partial turns)

### Partial Failure Handling

If the agent dies mid-stream:

1. User already saw some content via streaming
2. Broker returns `AgentResult` with `stopReason: 'error'` and the partial messages
3. Ledger writes the turn as `status: 'failed'`
4. Messages that were produced ARE saved (for debugging/replay)
5. The adapter gets `stream_error` with `partial: true`
6. Adapter can optionally send an error indicator to the user ("Response was interrupted")

---

## Platform Streaming Summary

| Platform | Adapter supports `stream`? | How it works |
|----------|--------------------------|-------------|
| Discord | Yes | Edit message as tokens arrive (~300ms throttle) |
| Telegram | Yes | `editMessageText` (~500ms throttle) |
| Slack | Yes | `chat.update` periodically |
| Web UI | Yes | Forward as SSE events (true token streaming) |
| API clients | Yes | Forward as SSE/WebSocket events |
| iMessage | No | Block pipeline → `send` per block |
| WhatsApp | No | Block pipeline → `send` per block |
| SMS | No | Block pipeline → `send` per block |
| Gmail | No | Buffer full response → single `send` |

---

## Open Questions

1. **Stream process lifecycle:** Keep alive indefinitely or spawn per-delivery? Keeping alive is more efficient (no process startup per message) but requires the adapter to handle multiple concurrent streams to different targets.

2. **Backpressure:** If the adapter can't keep up with token delivery (slow platform API), should NEX buffer, drop, or slow down? Tokens are small so buffering is fine in practice.

3. **Reasoning tokens:** Stream to adapter or suppress? Most users don't want to see thinking. API adapters might want it. Could be a per-adapter config.

4. **Multi-message streaming:** For long responses that span multiple messages (Discord 2000 char limit), the adapter needs to create a new message and start editing that one. The adapter handles this, not NEX.

---

## Related Documents

- `broker/AGENT_ENGINE.md` — Agent engine callbacks that feed into streaming
- `broker/CONTEXT_ASSEMBLY.md` — What the agent sees
- `broker/OVERVIEW.md` — Broker overview, queue modes
- `adapters/ADAPTER_SYSTEM.md` — Adapter protocol, lifecycle, and `stream` command details
- `adapters/ADAPTER_INTERFACES.md` — StreamEvent and AdapterStreamStatus type definitions

---

*This document defines the streaming architecture for Nexus — from agent token output to platform delivery. It is the canonical streaming spec; broker/ and nex/ streaming docs redirect here.*
