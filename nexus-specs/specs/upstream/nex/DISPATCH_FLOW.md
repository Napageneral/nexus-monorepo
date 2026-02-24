# OpenClaw Dispatch Flow — Upstream Analysis

> **Purpose:** Document OpenClaw's message dispatch pipeline and map to NEX stages.  
> **Source:** `~/nexus/home/projects/openclaw/src/auto-reply/`  
> **Last Updated:** 2026-02-04

---

## Overview

OpenClaw processes inbound messages through a chain of functions rather than a formal pipeline. This document traces the flow and identifies how each step maps to NEX's 8-stage pipeline.

**Key insight:** OpenClaw's "pipeline" is actually a **call chain** where each function calls the next. NEX formalizes this into explicit stages with hook points between each.

---

## OpenClaw Dispatch Chain

```
INBOUND MESSAGE
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    dispatchInboundMessage()                      │
│                         dispatch.ts                              │
├─────────────────────────────────────────────────────────────────┤
│  1. finalizeInboundContext() → Normalize MsgContext              │
│  2. dispatchReplyFromConfig() → Main orchestration               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   dispatchReplyFromConfig()                      │
│                  reply/dispatch-from-config.ts                   │
├─────────────────────────────────────────────────────────────────┤
│  1. Deduplication check (shouldSkipDuplicateInbound)             │
│  2. Audio context detection                                      │
│  3. TTS mode resolution                                          │
│  4. Run hook: message_received                                   │
│  5. Cross-provider routing resolution                            │
│  6. Fast-abort check                                             │
│  7. getReplyFromConfig() → Reply generation                      │
│  8. TTS application                                              │
│  9. Final reply dispatch                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     getReplyFromConfig()                         │
│                       reply/get-reply.ts                         │
├─────────────────────────────────────────────────────────────────┤
│  1. Resolve agent ID and skill filters                           │
│  2. Resolve default model (provider/model/aliases)               │
│  3. Ensure agent workspace                                       │
│  4. Create typing controller                                     │
│  5. Apply media understanding                                    │
│  6. Apply link understanding                                     │
│  7. Initialize session state                                     │
│  8. resolveReplyDirectives() → Parse inline directives           │
│  9. handleInlineActions() → Execute commands                     │
│  10. Stage sandbox media                                         │
│  11. runPreparedReply() → Execute agent                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       runReplyAgent()                            │
│                     reply/agent-runner.ts                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Queue steering (enqueue if session active)                   │
│  2. Memory flush (compaction if context too large)               │
│  3. runAgentTurnWithFallback() → Agent execution                 │
│  4. Block streaming pipeline                                     │
│  5. Session reset handling                                       │
│  6. Usage tracking                                               │
│  7. buildReplyPayloads() → Construct responses                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ReplyDispatcher                             │
│                   reply/reply-dispatcher.ts                      │
├─────────────────────────────────────────────────────────────────┤
│  1. Normalize payload (strip tokens, sanitize)                   │
│  2. Apply human-like delays (800-2500ms between blocks)          │
│  3. Route to appropriate channel                                 │
│  4. deliver() → Send via adapter                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Mapping to NEX Pipeline Stages

### NEX 8-Stage Pipeline

```
1. receiveEvent()       → Create NexusRequest from AdapterEvent
2. resolveIdentity()    → WHO sent this?
3. resolveAccess()      → WHAT can they do?
4. executeTriggers()    → Match and execute hooks
5. assembleContext()    → Gather history, Cortex, agent config
6. runAgent()           → Execute agent
7. deliverResponse()    → Format and send response
8. finalize()           → Write trace, emit to Cortex
```

### Stage-by-Stage Mapping

#### 1. receiveEvent() ← dispatchInboundMessage + finalizeInboundContext

| OpenClaw | NEX |
|----------|-----|
| `dispatchInboundMessage()` entry | `receiveEvent()` entry |
| `finalizeInboundContext()` | Context normalization within `receiveEvent()` |
| Create `MsgContext` | Create `NexusRequest` |
| Normalize text fields | Populate `event.*` fields |
| Resolve `BodyForAgent`, `BodyForCommands` | Populate `event.content` |
| Format sender meta for groups | Capture in `delivery.*` |

**Gap:** OpenClaw does deduplication in `dispatchReplyFromConfig`. NEX should do it in `receiveEvent()` or as a plugin.

---

#### 2. resolveIdentity() ← (OpenClaw LACKS this)

| OpenClaw | NEX |
|----------|-----|
| Uses channel-provided sender info | Dedicated identity resolution |
| `ctx.From`, `ctx.SenderName` | `principal.entity_id`, `principal.name` |
| No entity lookup | Query Identity Ledger |
| No relationship context | `principal.relationship` |

**Gap:** OpenClaw has NO identity resolution. It trusts what the channel provides. NEX adds a formal identity layer.

---

#### 3. resolveAccess() ← (OpenClaw LACKS this)

| OpenClaw | NEX |
|----------|-----|
| No formal ACL | Policy evaluation stage |
| Permissions scattered in config | `permissions.*` structure |
| Command authorization inline | `permissions.tools` |
| No data access levels | `permissions.data_access` |

**Gap:** OpenClaw has NO ACL stage. Permissions are implicit or config-based. NEX adds explicit access control.

---

#### 4. executeTriggers() ← dispatchReplyFromConfig hooks + getReplyFromConfig inline actions

| OpenClaw | NEX |
|----------|-----|
| `message_received` hook | Trigger evaluation |
| `handleInlineActions()` | Command processing (may move to separate stage) |
| `resolveReplyDirectives()` | Session override detection |
| Cross-provider routing resolution | Session routing |
| Fast-abort check | Pipeline exit |

**Mapping:**
- OpenClaw's `message_received` hook → NEX trigger evaluation
- OpenClaw's inline commands (`/status`, `/new`) → Could be NEX commands or hooks
- OpenClaw's fast-abort → NEX pipeline exit via `'skip'` return

---

#### 5. assembleContext() ← getReplyFromConfig context gathering

| OpenClaw | NEX |
|----------|-----|
| `getReplyFromConfig()` setup | `assembleContext()` |
| Resolve agent ID | `agent.agent_id` |
| Resolve model | `agent.model` |
| Apply media understanding | Context enrichment |
| Apply link understanding | Context enrichment |
| Initialize session state | Session from `resolveAccess()` |
| Create turn in ledger (implied) | Create turn in Agents Ledger |

**Mapping:**
- OpenClaw scatters context gathering across multiple functions
- NEX consolidates into single `assembleContext()` stage
- Both prepare the full context the agent needs

---

#### 6. runAgent() ← runReplyAgent + runAgentTurnWithFallback

| OpenClaw | NEX |
|----------|-----|
| `runReplyAgent()` | `runAgent()` |
| `runAgentTurnWithFallback()` | Agent execution |
| Queue steering | Could be plugin or pre-check |
| Memory flush (compaction) | Memory management |
| Block streaming pipeline | Streaming integrated |
| Usage tracking | Token/usage tracking |

**Mapping:**
- Core agent execution maps directly
- OpenClaw's block streaming → NEX StreamingContext
- Both capture tokens, latency, tool calls

---

#### 7. deliverResponse() ← ReplyDispatcher + buildReplyPayloads

| OpenClaw | NEX |
|----------|-----|
| `buildReplyPayloads()` | Response formatting |
| `normalizeReplyPayload()` | Payload normalization |
| `ReplyDispatcher` | `deliverResponse()` |
| Human-like delays | Could be plugin or config |
| `routeReply()` | Channel routing |
| `deliver()` | Adapter send |

**Mapping:**
- Both normalize and deliver responses
- OpenClaw has elaborate human delay system
- NEX may simplify or make configurable

---

#### 8. finalize() ← (OpenClaw LACKS this)

| OpenClaw | NEX |
|----------|-----|
| No explicit finalize stage | Dedicated finalization |
| Writes scattered throughout | Centralized trace write |
| No unified audit trail | Full NexusRequest persisted |

**Gap:** OpenClaw doesn't have a formal finalization stage. Writes happen throughout. NEX consolidates trace/audit at the end.

---

## Detailed Function Analysis

### dispatchInboundMessage()

```typescript
async function dispatchInboundMessage(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcher: ReplyDispatcher;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof getReplyFromConfig;
}): Promise<DispatchInboundResult>
```

**What it does:**
1. Finalize context (`finalizeInboundContext()`)
2. Call dispatch orchestration (`dispatchReplyFromConfig()`)

**NEX equivalent:**
- Entry into `receiveEvent()` stage
- Context normalization

---

### dispatchReplyFromConfig()

**What it does (in order):**

| Step | Purpose | NEX Mapping |
|------|---------|-------------|
| 1. Dedupe check | Prevent duplicate processing | `receiveEvent` or plugin |
| 2. Audio context | Detect voice messages | Part of context |
| 3. TTS resolution | Text-to-speech mode | Agent config |
| 4. `message_received` hook | Notify plugins | `executeTriggers` |
| 5. Cross-provider routing | Route to origin channel | `deliverResponse` or session |
| 6. Fast-abort check | Early exit for aborts | Plugin with `'skip'` |
| 7. `getReplyFromConfig()` | Generate reply | Stages 5-6 |
| 8. TTS application | Convert response to audio | `deliverResponse` |
| 9. Final dispatch | Send response | `deliverResponse` |

---

### getReplyFromConfig()

**What it does (in order):**

| Step | Purpose | NEX Mapping |
|------|---------|-------------|
| 1. Resolve agent ID | Which agent handles | `assembleContext.agent_id` |
| 2. Resolve model | Which LLM | `assembleContext.model` |
| 3. Ensure workspace | Agent workspace exists | Init concern |
| 4. Typing controller | Manage typing indicator | `StreamingContext` |
| 5. Media understanding | Process images/audio | Context enrichment |
| 6. Link understanding | Process URLs | Context enrichment |
| 7. Session state | Initialize session | From `resolveAccess` |
| 8. Reply directives | Parse inline overrides | `executeTriggers` |
| 9. Inline actions | Execute `/commands` | Commands or triggers |
| 10. Stage media | Sandbox attachments | Context prep |
| 11. Run prepared reply | Execute agent | `runAgent` |

---

### runReplyAgent()

**What it does (in order):**

| Step | Purpose | NEX Mapping |
|------|---------|-------------|
| 1. Queue steering | Enqueue if session busy | Rate limiting |
| 2. Memory flush | Compact if too large | Memory management |
| 3. Agent execution | Run LLM | `runAgent` core |
| 4. Block streaming | Real-time delivery | `StreamingContext` |
| 5. Session reset | Handle errors | Error recovery |
| 6. Usage tracking | Record tokens | Response metadata |
| 7. Build payloads | Construct responses | Response formatting |

---

## Gap Analysis

### What NEX Adds

| Feature | OpenClaw | NEX |
|---------|----------|-----|
| **Central orchestrator** | ❌ Call chain | ✅ 8-stage pipeline |
| **Identity resolution** | ❌ None | ✅ `resolveIdentity` stage |
| **Access control** | ❌ Implicit | ✅ `resolveAccess` stage |
| **Unified request object** | ❌ Multiple contexts | ✅ `NexusRequest` |
| **Stage hooks** | ❌ Event-based | ✅ After-stage plugins |
| **Pipeline tracing** | ❌ Scattered logs | ✅ `pipeline[]` trace |
| **Audit persistence** | ❌ Partial | ✅ Nexus Ledger |

### What to Preserve from OpenClaw

| Feature | Why Keep |
|---------|----------|
| **Deduplication logic** | Works well, battle-tested |
| **Block streaming pipeline** | Well-designed coalescing |
| **Human delay system** | Natural conversation feel |
| **Reply normalization** | Handles edge cases |
| **Typing controller** | Good UX pattern |

---

## Flow Diagrams

### OpenClaw Complete Flow

```
Channel Message
      │
      ▼
dispatchInboundMessage()
      │
      ├── finalizeInboundContext()
      │     • Normalize text
      │     • Resolve body variants
      │     • Format sender meta
      │
      ▼
dispatchReplyFromConfig()
      │
      ├── shouldSkipDuplicateInbound() ──→ [skip if duplicate]
      │
      ├── runHook("message_received")
      │
      ├── tryFastAbortFromMsg() ──→ [abort if requested]
      │
      ▼
getReplyFromConfig()
      │
      ├── Resolve agent, model, workspace
      │
      ├── Apply media/link understanding
      │
      ├── resolveReplyDirectives()
      │     • Parse /model, /think, queue
      │
      ├── handleInlineActions()
      │     • Execute /status, /new, etc.
      │     └──→ [return if command handled]
      │
      ▼
runPreparedReply()
      │
      ▼
runReplyAgent()
      │
      ├── Queue steering
      │
      ├── Memory flush
      │
      ├── runAgentTurnWithFallback()
      │     • Execute LLM
      │     • Block streaming
      │
      ├── buildReplyPayloads()
      │
      ▼
ReplyDispatcher
      │
      ├── normalizeReplyPayload()
      │     • Strip tokens
      │     • Sanitize
      │
      ├── Human delay
      │
      ├── deliver()
      │
      ▼
Channel Response
```

### NEX Pipeline (for comparison)

```
AdapterEvent
      │
      ▼
1. receiveEvent()
      │ [afterReceiveEvent]
      ▼
2. resolveIdentity()
      │ [afterResolveIdentity]
      ▼
3. resolveAccess()
      │ [afterResolveAccess]
      ▼
4. executeTriggers()
      │ [afterExecuteTriggers]
      ▼
5. assembleContext()
      │ [afterAssembleContext]
      ▼
6. runAgent()
      │ [afterRunAgent]
      ▼
7. deliverResponse()
      │ [afterDeliverResponse]
      ▼
8. finalize()
      │ [onFinalize]
      ▼
Complete
```

---

## Implementation Notes

### Deduplication

OpenClaw builds composite keys:
```
provider|accountId|sessionKey|peerId|threadId|messageId
```

NEX should:
- Implement as `afterReceiveEvent` plugin
- Use similar key structure
- Configurable TTL (OpenClaw: 20 min)

### Inline Commands

OpenClaw handles `/status`, `/new`, `/model`, etc. in `handleInlineActions()`.

NEX options:
1. Dedicated command stage before `executeTriggers`
2. Part of `executeTriggers` (commands are just triggers)
3. Separate command system (not in pipeline)

Recommendation: Commands are triggers that may exit pipeline early.

### Human Delays

OpenClaw adds 800-2500ms between block replies.

NEX options:
1. Part of `deliverResponse()` stage
2. Configurable per-channel
3. Plugin pattern

---

## Related Documents

- `README.md` — Overview and mapping
- `HOOK_LIFECYCLE.md` — Hook execution details
- `STREAMING_ARCHITECTURE.md` — Streaming flow
- `../../upstream/AUTO_REPLY_PIPELINE.md` — Full OpenClaw source analysis
