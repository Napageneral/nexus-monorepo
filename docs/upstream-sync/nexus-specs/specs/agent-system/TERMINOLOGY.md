# Agent System Terminology

**Status:** REFERENCE DOCUMENT  
**Last Updated:** 2026-01-22

---

## Purpose

This document defines the canonical terminology for the Nexus agent system. Use these terms consistently across all specs, code, and documentation.

---

## Core Concepts

### Session

A **session** is a persistent conversation context between an agent and a user/system.

| Attribute | Description |
|-----------|-------------|
| **sessionId** | UUID identifying the session (used as transcript filename) |
| **sessionKey** | Structured identifier for routing: `agent:{agentId}:{type}:{context}` |
| **Transcript** | JSONL file containing all messages (`{sessionId}.jsonl`) |
| **Metadata** | Token counts, origin, model, queue mode (stored in `sessions.json`) |

**Sessions are persistent.** They survive restarts and can be resumed at any time.

#### Session Isolation — THE KEY INSIGHT

**Sessions are ISOLATED by default.** Each session maintains its own conversation history.

```
┌──────────────────────────────────────────────────────────────────────┐
│                     SESSIONS ARE ISOLATED                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   iMessage Session          Discord Session          Telegram Session │
│   ┌──────────────┐         ┌──────────────┐        ┌──────────────┐  │
│   │ transcript.  │         │ transcript.  │        │ transcript.  │  │
│   │ jsonl        │         │ jsonl        │        │ jsonl        │  │
│   │              │         │              │        │              │  │
│   │ SEPARATE     │         │ SEPARATE     │        │ SEPARATE     │  │
│   │ HISTORY      │         │ HISTORY      │        │ HISTORY      │  │
│   └──────────────┘         └──────────────┘        └──────────────┘  │
│          │                        │                       │           │
│          └────────────────────────┼───────────────────────┘           │
│                                   │                                   │
│                                   ▼                                   │
│                         ┌──────────────────┐                         │
│                         │    ONE AGENT     │                         │
│                         │  (same tools,    │                         │
│                         │   same config)   │                         │
│                         └──────────────────┘                         │
│                                                                       │
│   Discord history ≠ iMessage history ≠ Telegram history              │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

**What IS shared across sessions:**
- MEMORY.md (vector-searchable knowledge) — *being replaced by Mnemonic*
- Tools and capabilities (same agent config)
- System prompt (AGENTS.md)
- Workspace files

**What is NOT shared:**
- Conversation history (each session is independent)
- Session-specific settings (model override, queue mode)

**Cross-session communication:**
- `sessions_send(sessionKey, message)` — explicitly send to another session
- Mnemonic (future) — unified search across all session history

#### Session Key Format

```
agent:{agentId}:{sessionType}:{contextId}

Examples:
  agent:default:main                          # Main session for default agent
  agent:default:dm:user@telegram              # DM session from telegram
  agent:default:subagent:550e8400-...         # Spawned subagent session
  agent:code-worker:main                      # Main session for code-worker agent
```

| Segment | Meaning |
|---------|---------|
| `agent:` | Prefix (always present) |
| `{agentId}` | Agent identifier (e.g., `default`, `code-worker`) |
| `{sessionType}` | Session type: `main`, `dm`, `group`, `subagent`, `cron` |
| `{contextId}` | Context-specific ID (user, thread, spawn UUID, cron job ID) |

### Run

A **run** is a single agent invocation within a session.

| Attribute | Description |
|-----------|-------------|
| **runId** | UUID identifying this specific invocation |
| **sessionId** | The session this run belongs to |
| **Lifecycle** | start → streaming → compacting → end |
| **Outcome** | `ok`, `error`, or `timeout` |

**Sessions can have multiple runs** (e.g., resumed conversation, multiple user messages).

```
Session (persistent)
├── Run 1 (user message → agent response)
├── Run 2 (followup message → agent response)
├── Run 3 (heartbeat trigger → agent check)
└── Run 4 (resumed context → continuation)
```

### Turn

A **turn** is a query + response exchange. **The key addressable unit.**

| Attribute | Description |
|-----------|-------------|
| **Turn ID** | Same as the final assistant message ID |
| **Query messages** | Input: one or more messages (user, trigger, agent, system injection) |
| **Response message** | Output: the assistant's complete response |
| **Tool calls** | Tools invoked during this turn (part of the turn, not separate turns) |

**Key principles:**
- A turn completes when the assistant finishes responding to the query
- A turn can be initiated by: user, trigger, agent message, webhook, cron, event — anything
- Multiple input messages can be grouped into one turn (e.g., user sends several messages before assistant responds)
- Tool calls are **part of a turn**, not separate turns — they occur during the assistant's response generation
- Turn ID = final assistant message ID (clean, unambiguous)

**Runs contain one or more turns.** A single run typically contains one turn, but can contain multiple turns if the agent uses tools iteratively and continues responding.

```
Run (single invocation)
└── Turn: 
    ├── Query: "Fix the bug in auth.ts"
    ├── [Agent thinking]
    ├── Tool call: Read file
    ├── Tool result: [file contents]
    ├── Tool call: Edit file
    ├── Tool result: [edit confirmation]
    ├── Tool call: Run tests
    ├── Tool result: [test output]
    └── Response: "Fixed. The issue was..."
```

### Agent

An **agent** is a configured AI persona with:

| Component | Description |
|-----------|-------------|
| **agentId** | Unique identifier (e.g., `default`, `code-worker`) |
| **Identity** | `IDENTITY.md` (name, emoji, vibe) |
| **Soul** | `SOUL.md` (persona, boundaries, behavior) |
| **Sessions** | One or more session contexts |
| **Config** | Model, tools, capabilities |

### Manager vs Worker

| Term | Role | Description |
|------|------|-------------|
| **Manager Agent (MA)** | Interaction | Talks to user, delegates tasks, maintains conversation |
| **Worker Agent (WA)** | Execution | Task-focused, heavy context, specialized tools |

**MWP = Manager-Worker Pattern** — the architecture where MA orchestrates WAs.

---

## Session Lifecycle

### Session States

| State | Meaning |
|-------|---------|
| `idle` | No active run, ready for messages |
| `running` | Active run in progress |
| `streaming` | Actively generating output |
| `compacting` | Performing context compaction |

### Run Lifecycle Events

| Event | When |
|-------|------|
| `phase: "start"` | Run begins |
| `phase: "end"` | Run completes (success or error) |
| `phase: "error"` | Run failed with error |

---

## Spawn System

### Subagent Spawn

When a parent spawns a child session:

```
Parent Session                    Child Session
(agent:default:main)              (agent:default:subagent:{runId})
       │                                  │
       │  sessions_spawn(task, ...)       │
       │─────────────────────────────────►│
       │                                  │
       │        [child executes]          │
       │                                  │
       │◄─────────────────────────────────│
       │     announce (result + stats)    │
```

### Spawn Record

```typescript
type SubagentRunRecord = {
  runId: string;                // Unique run identifier
  childSessionKey: string;      // Spawned session key
  requesterSessionKey: string;  // Parent session key
  requesterOrigin?: DeliveryContext;  // Channel context
  task: string;                 // Task description
  cleanup: "delete" | "keep";   // Post-completion behavior
  label?: string;               // Human-readable name
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  outcome?: { status: "ok"|"error"|"timeout", error?: string };
  archiveAtMs?: number;         // Auto-cleanup time
};
```

### Nested Spawning

| Upstream | Nexus |
|----------|-------|
| Forbidden | Allowed |

Workers can spawn sub-workers in Nexus. Agent Broker tracks spawn depth (default max: 3).

```
MA (agent:default:main)
└── WA (agent:default:subagent:aaa)
    └── Sub-WA (agent:default:subagent:bbb)
        └── Sub-Sub-WA (agent:default:subagent:ccc)  // depth 3
```

---

## Queue Modes

How messages are delivered to sessions:

| Mode | Behavior |
|------|----------|
| `steer` | Abort current run, start new with this message |
| `followup` | Queue without interrupting current run |
| `collect` | Buffer + debounce + batch multiple messages |
| `steer-backlog` | Steer + queue remaining messages |
| `queue` | Simple FIFO (no interruption) |
| `interrupt` | Clear queue + abort + start new |

---

## Message Types

### JSONL Transcript Entry Types

| Type | Purpose | Enters LLM Context? |
|------|---------|---------------------|
| `session` | File header (id, cwd, timestamp, version) | No (metadata) |
| `message` | User/assistant/toolResult messages | Yes |
| `custom_message` | Extension-injected messages | Yes (can hide from UI) |
| `custom` | Extension state (not sent to model) | **No** |
| `compaction` | **Persisted summary** after compaction | **Yes** (replaces old msgs) |
| `branch_summary` | Tree branch summary | Yes |

**Key insight:** The `compaction` entry IS persisted to JSONL. It contains:
- `summary`: LLM-generated summary of compacted messages
- `firstKeptEntryId`: UUID of first message kept in context
- `tokensBefore`: Token count before compaction

### Agent Message (Broker)

```typescript
interface AgentMessage {
  id: string;           // Unique message ID
  from: string;         // Sender agent ID
  to: string;           // Target agent ID
  content: string;
  timestamp: number;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}
```

---

## Transcript Format

### File Structure

```
~/nexus/state/sessions/
├── sessions.json              # Metadata index
├── {sessionId}.jsonl          # Transcript
└── {sessionId}.jsonl.bak.*    # Compaction archives
```

### JSONL Example

```jsonl
{"type":"session","version":"1.0","id":"abc123","timestamp":"2026-01-22T12:00:00Z","cwd":"/path"}
{"type":"user","timestamp":"...","sessionId":"abc123","uuid":"msg-1","message":{"role":"user","content":[{"type":"text","text":"Fix the bug"}]}}
{"type":"assistant","timestamp":"...","sessionId":"abc123","uuid":"msg-2","message":{"role":"assistant","content":[...],"model":"claude-4-sonnet"}}
```

### SessionEntry (sessions.json)

```typescript
type SessionEntry = {
  sessionId: string;
  updatedAt: number;
  sessionFile?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  origin?: {
    provider: string;     // "telegram", "whatsapp", "cursor"
    surface: string;      // "dm", "group"
    from?: string;
    accountId?: string;
  };
  queueMode?: QueueMode;
};
```

---

## Trigger System

| Term | Definition |
|------|------------|
| **Trigger** | Event that invokes an agent (heartbeat, cron, webhook, completion) |
| **Heartbeat** | Periodic wake-up (e.g., every 30m) |
| **Cron** | Time-based trigger (cron expression or timestamp) |
| **Completion Callback** | Trigger when async work finishes |

---

## Persistence Locations

| Data | Location |
|------|----------|
| Sessions | `~/nexus/state/sessions/` |
| Session metadata | `~/nexus/state/sessions/sessions.json` |
| Agent identity | `~/nexus/state/agents/{agentId}/` |
| Credentials | `~/nexus/state/credentials/` |
| Broker queues | `~/nexus/state/broker/queues.db` (SQLite) |
| Spawn registry | `~/nexus/state/subagents/runs.json` |

---

## Glossary

| Term | Definition |
|------|------------|
| **aix** | Session analysis/indexing tool |
| **Broker** | Agent message routing layer |
| **Compaction** | Context window management (truncation or summarization) |
| **Mnemonic** | Memory/search system (replacing upstream MEMORY.md) |
| **Gateway** | HTTP server managing agent sessions |
| **MWP** | Manager-Worker Pattern |
| **JSONL** | JSON Lines format for transcripts |

---

*This document is the canonical terminology reference. All other specs should use these terms.*
