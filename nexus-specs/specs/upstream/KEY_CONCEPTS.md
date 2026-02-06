# OpenClaw Key Concepts

**Status:** COMPLETE  
**Last Updated:** 2026-02-03

---

## Overview

This document defines the core abstractions and patterns OpenClaw uses. Understanding these is essential before mapping to Nexus equivalents.

---

## Core Abstractions

### Session

A conversation thread identified by a `sessionKey`.

**Storage:** Two-layer persistence:
- `sessions.json` — JSON5 index mapping `sessionKey` → `SessionEntry`
- `<sessionId>.jsonl` — JSONL transcript file

**SessionEntry fields:**
| Field | Purpose |
|-------|---------|
| `sessionId` | UUID for the transcript file |
| `sessionFile` | Path to JSONL file |
| `updatedAt` | Last activity timestamp |
| `inputTokens`, `outputTokens`, `totalTokens` | Token usage |
| `model`, `modelProvider` | Model configuration |
| `compactionCount` | How many times compacted |
| `channel`, `lastChannel`, `lastTo` | Channel metadata |
| `spawnedBy` | Parent session (for workers) |

**Session key formats:**
- `agent:{agentId}:main` — Main session
- `agent:{agentId}:dm:{peerId}` — Per-peer DM
- `agent:{agentId}:{channel}:group:{groupId}` — Group session

### Transcript

The conversation history stored as JSONL.

**First line:** Session header
```json
{"type": "session", "version": 2, "id": "uuid", "timestamp": "...", "cwd": "..."}
```

**Entry types:**
| Type | Purpose |
|------|---------|
| `message` | User/assistant/tool messages |
| `custom_message` | Plugin-injected messages (enters model context) |
| `custom` | Plugin state (does NOT enter model context) |
| `compaction` | Compaction summary with `firstKeptEntryId` |
| `branch_summary` | Branch navigation summaries |

**Tree structure:** Entries have `id` and `parentId`, forming a tree that supports branching.

### Message

A single message in the transcript.

**Fields:**
```typescript
{
  type: "message",
  id: "uuid",
  parentId: "uuid",
  message: {
    role: "user" | "assistant" | "tool",
    content: [{ type: "text", text: "..." }],
    api: "anthropic" | "openai-responses",
    provider: "anthropic" | "google",
    model: "claude-3-5-sonnet-...",
    usage: { input, output, cacheRead, cacheWrite, totalTokens, cost },
    stopReason: "stop" | "tool_calls",
    timestamp: 1706000000000
  }
}
```

### Compaction

Context management to handle long conversations.

**Triggers:**
1. Context overflow error → compact → retry
2. Threshold: `contextTokens > contextWindow - reserveTokens`

**Process:**
1. Plugin hooks: `session_before_compact` can customize
2. LLM summarizes older messages
3. Creates `compaction` entry:
```json
{
  "type": "compaction",
  "id": "uuid",
  "parentId": "uuid",
  "summary": "Previous conversation summary...",
  "firstKeptEntryId": "uuid",
  "tokensBefore": 150000
}
```

**Context assembly:** `buildSessionContext()` uses summary + kept messages.

### Plugin

An extension that adds capabilities to OpenClaw.

**Definition:**
```typescript
{
  id: "my-plugin",
  name: "My Plugin",
  configSchema: { /* JSON schema */ },
  register(api) {
    api.registerTool({ name: "my_tool", ... });
    api.on("before_agent_start", (event, ctx) => { ... });
  }
}
```

**API capabilities:**
- `registerTool()` — Agent tools
- `registerHook()` — Legacy hooks
- `registerChannel()` — Messaging channels
- `registerProvider()` — Model providers
- `on()` — Typed lifecycle hooks

**Discovery order:**
1. Bundled plugins (`extensions/`)
2. Global plugins (`~/.config/openclaw/extensions/`)
3. Workspace plugins (`.openclaw/extensions/`)
4. Config-specified plugins

### Hook

A lifecycle event that plugins can intercept.

**Agent hooks:**
- `before_agent_start` — Modify system prompt, prepend context
- `agent_end` — Analyze completed conversations

**Message hooks:**
- `message_received` — Observe incoming
- `message_sending` — Modify or cancel outgoing
- `message_sent` — Observe sent

**Tool hooks:**
- `before_tool_call` — Modify or block tool calls
- `after_tool_call` — Observe execution
- `tool_result_persist` — Transform results before persistence

**Compaction hooks:**
- `before_compaction`, `after_compaction`

**Session hooks:**
- `session_start`, `session_end`

**Execution:**
- Void hooks: parallel (fire-and-forget)
- Modifying hooks: sequential, results merged

### Tool

A capability the agent can use during execution.

**Registration:**
```typescript
api.registerTool({
  name: "my_tool",
  description: "What it does",
  parameters: { /* JSON schema */ },
  execute: async (params, ctx) => { ... }
});
```

**Built-in tools:** File operations, shell, web, spawning, etc.

### Gateway

The central server process.

**Functions:**
- WebSocket connections (clients, nodes)
- HTTP endpoints (Control UI, APIs)
- Channel coordination
- Agent command execution
- Device pairing

**Protocol:**
- `req` — Request frame
- `res` — Response frame
- `event` — Event broadcast

**Key methods:**
- `agent` — Execute agent command
- `sessions.*` — Session management
- `channels.*` — Channel status/logout
- `config.*` — Configuration management

### Channel

A messaging platform integration.

**Components:**
- **Monitor** — Listens for inbound messages
- **Sender** — Delivers outbound messages
- **Plugin** — Configuration, dock metadata

**Access control:**
- DM policies: `pairing`, `allowlist`, `open`, `disabled`
- Group policies: `open`, `disabled`, `allowlist`
- Allowlist matching: wildcards, IDs, usernames, tags

---

## Patterns

### Allowlist Matching

Senders are matched against allowlists using multiple strategies:

| Match Type | Example |
|------------|---------|
| `wildcard` | `*` (allow all) |
| `id` | Direct ID match |
| `name` | Display name match |
| `username` | Handle match (with/without `@`) |
| `tag` | Tag-based match |
| `prefixed-id` | `telegram:123` |

### Session Routing

Messages are routed to sessions via bindings:

**Priority (highest to lowest):**
1. Peer binding — Direct match on peer ID
2. Parent peer binding — Thread inherits from parent
3. Guild binding — Discord guild-level
4. Team binding — Slack team-level
5. Account binding — Account-specific
6. Channel binding — Channel-wide (`accountId: "*"`)
7. Default — Falls back to default agent

### DM Scoping

How DM sessions are scoped:

| Scope | Session Key Format |
|-------|-------------------|
| `main` | `agent:{agentId}:main` (all DMs share one) |
| `per-peer` | `agent:{agentId}:dm:{peerId}` |
| `per-channel-peer` | `agent:{agentId}:{channel}:dm:{peerId}` |
| `per-account-channel-peer` | `agent:{agentId}:{channel}:{accountId}:dm:{peerId}` |

### Identity Links

Collapse sessions across channels:

```typescript
identityLinks: {
  alice: ["telegram:111", "discord:222"]
}
```

Messages from either channel use the same session.

### Send Policy

Rules controlling whether agent can send replies:

```typescript
{
  rules: [
    { match: { channel: "whatsapp", chatType: "group" }, action: "deny" },
    { match: { keyPrefix: "agent:main:whatsapp" }, action: "allow" }
  ],
  default: "allow"
}
```

### Command Authorization

Before executing commands:
1. Resolve channel from context
2. Get allowlist from config
3. Normalize sender candidates
4. Match against owner list
5. If `enforceOwnerForCommands`, only owners can execute

---

## External Dependencies

| Dependency | Purpose |
|------------|---------|
| `@mariozechner/pi-coding-agent` | Core agent execution, SessionManager, LLM calls |
| Anthropic SDK | Claude models |
| OpenAI SDK | GPT models |
| Playwright | Browser automation |
| better-sqlite3 | SQLite for memory/search |
| Grammy | Telegram bot framework |
| Discord.js | Discord bot |
| Baileys | WhatsApp Web automation |

---

*This document defines OpenClaw's abstractions without mapping to Nexus concepts.*
