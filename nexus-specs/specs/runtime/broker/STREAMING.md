# Streaming

**Status:** TODO  
**Last Updated:** 2026-02-02

---

## Overview

This document covers how streaming works in the Broker:
- Streaming bridge: agent → broker → NEX → out-adapter
- Partial response handling
- Interruption and steering during stream

**TODO:** This is a complex topic that needs careful design.

---

## The Streaming Bridge

Agent responses stream through multiple layers:

```
Agent Runtime
    │
    │ (streaming chunks)
    ▼
Broker
    │
    │ (streaming or buffered?)
    ▼
NEX
    │
    │ (streaming or buffered?)
    ▼
Out-Adapter
    │
    │ (platform-specific)
    ▼
External Platform
```

---

## Key Questions

### 1. Does Broker Buffer?

Options:
- **Stream-through:** Broker passes chunks to NEX immediately
- **Buffer:** Broker collects full response before passing to NEX
- **Hybrid:** Buffer until threshold, then stream

Trade-offs:
- Stream-through: Lower latency, but harder to handle errors
- Buffer: Higher latency, but cleaner error handling
- Hybrid: Balanced, but more complex

### 2. How Does NEX Handle Streaming?

Options:
- Pass through to out-adapter
- Buffer and format before delivery
- Depends on platform capabilities

### 3. Out-Adapter Considerations

Different platforms have different streaming capabilities:
- **Discord:** Supports message editing (can "stream" by editing)
- **Telegram:** Supports message editing
- **iMessage:** No streaming, must send complete message
- **WhatsApp:** No streaming

### 4. Interruption During Stream

When steering or interrupting a streaming response:
- What happens to partial output?
- Does user see it?
- How is it stored in Agents Ledger?

---

## Proposed Approach

**TODO:** Finalize after discussion.

### Agent → Broker

Broker receives streaming chunks from agent runtime.

### Broker → NEX

Broker signals NEX with:
- `stream_start` — Response beginning
- `stream_chunk` — Partial content
- `stream_end` — Response complete
- `stream_error` — Error occurred

### NEX → Out-Adapter

NEX decides based on platform:
- Streaming platforms: Forward chunks
- Non-streaming: Buffer until complete

---

## Tool Calls During Stream

When agent makes tool calls:
1. Stream pauses
2. Tool executes
3. Stream resumes with tool result in context

How is this represented to the user/platform?

---

## Related Documents

- `INTERFACES.md` — NEX ↔ Broker interface
- `OVERVIEW.md` — Broker overview
- `../adapters/` — Out-adapter specifications

---

*This document defines streaming behavior for the Nexus agent system.*
