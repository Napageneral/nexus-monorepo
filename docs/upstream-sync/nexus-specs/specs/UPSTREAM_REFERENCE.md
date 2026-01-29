# Upstream Reference

**Status:** REFERENCE DOCUMENT  
**Last Updated:** 2026-01-22

---

## Purpose

This document provides canonical links to upstream clawdbot documentation. When implementing Nexus features or debugging behavior differences, consult these references.

---

## Core Documentation

| Topic | Upstream File | Key Content |
|-------|---------------|-------------|
| **Session Management** | `docs/reference/session-management-compaction.md` | Two persistence layers, JSONL format, compaction behavior, session key routing |
| **Session Types** | `src/config/sessions/types.ts` | `SessionEntry` schema, metadata fields |
| **Agent Defaults** | `src/config/types.agent-defaults.ts` | `AgentCompactionConfig`, default settings |

---

## Session & Compaction

### Session Format

**Upstream:** `docs/reference/session-management-compaction.md`

Key sections:
- **Two persistence layers:** `sessions.json` (metadata) vs `{id}.jsonl` (transcript)
- **JSONL entry types:** `session`, `message`, `custom_message`, `custom`, `compaction`, `branch_summary`
- **Session key routing:** DMs collapse to main session, groups/channels isolated

### Compaction Implementation

| Component | File | Purpose |
|-----------|------|---------|
| Gateway RPC | `src/gateway/server-methods/sessions.ts` | `sessions.compact` — line-based truncation, creates `.bak` archives |
| Pi-Agent | `src/agents/pi-embedded-runner/compact.ts` | LLM-based summarization, writes `compaction` entry to JSONL |
| Archive Util | `src/gateway/session-utils.fs.ts` | `archiveFileOnDisk()` — creates timestamped backups |

### SessionEntry Schema

**Upstream:** `src/config/sessions/types.ts`

```typescript
type SessionEntry = {
  sessionId: string;
  updatedAt: number;
  sessionFile?: string;
  
  // Token tracking
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  compactionCount?: number;
  
  // Model info
  model?: string;
  modelProvider?: string;
  
  // Rich origin metadata
  origin?: {
    provider: string;      // "telegram", "whatsapp", etc.
    surface: string;       // "dm", "group", etc.
    chatType: string;
    from?: string;
    to?: string;
    accountId?: string;
    threadId?: string;
  };
  
  // Queue modes
  queueMode?: "steer" | "followup" | "collect" | "steer-backlog" | "queue" | "interrupt";
  
  // System prompt breakdown
  systemPromptReport?: SessionSystemPromptReport;
  
  // Skills snapshot
  skillsSnapshot?: {...};
};
```

---

## Gateway & Agent Runtime

| Component | File | Purpose |
|-----------|------|---------|
| Gateway Server | `src/gateway/server.ts` | Main HTTP server, RPC handlers |
| Session Methods | `src/gateway/server-methods/sessions.ts` | Session CRUD, compaction RPC |
| Agent Runner | `src/agents/pi-embedded-runner/` | Pi-coding-agent integration |
| Message Router | `src/gateway/delivery/` | Channel → session routing |

---

## Message Delivery

### Channel Adapters

| Channel | Files | Notes |
|---------|-------|-------|
| Telegram | `src/channels/telegram/` | Groups, channels, threads |
| Discord | `src/channels/discord/` | Guilds, channels, DMs |
| WhatsApp | `src/channels/whatsapp/` | Individual, group chats |
| iMessage | `src/channels/imessage/` | Via Shortcuts/automation |
| Matrix | `src/channels/matrix/` | Rooms, spaces |

### Routing Logic

**Upstream:** `src/gateway/delivery/router.ts`

Key insight: Session key construction determines isolation:
```typescript
// DMs merge across channels
sessionKey = `agent:${agentId}:main`

// Groups are isolated per channel
sessionKey = `agent:${agentId}:${provider}:group:${groupId}`
```

---

## Configuration

| Config | File | Purpose |
|--------|------|---------|
| Agent Defaults | `src/config/types.agent-defaults.ts` | Default agent settings |
| Compaction Config | `src/config/types.agent-defaults.ts` | `AgentCompactionConfig` |
| Channel Config | `src/config/channels/` | Per-channel settings |

---

## Memory (Being Replaced)

**Upstream memory system:** `src/memory/`

Nexus is replacing this with Cortex. Key files to understand the old system:
- `src/memory/store.ts` — Vector store interface
- `src/memory/flush.ts` — Pre-compaction memory flush

---

## Queue System

**Upstream:** `src/gateway/queue/`

Queue modes determine message delivery behavior:
- `steer` — Abort current run, start new
- `followup` — Queue without interrupting
- `collect` — Buffer + debounce + batch
- `steer-backlog` — Steer + queue remaining
- `queue` — Simple FIFO
- `interrupt` — Clear queue + abort + start new

---

## Useful Commands

### Check Upstream State

```bash
# From worktree root
cd worktrees/bulk-sync-upstream

# Find session-related code
rg "sessionKey" --type ts

# Find compaction logic
rg "compact" src/gateway/server-methods/

# Check session types
cat src/config/sessions/types.ts
```

### Compare With Nexus

```bash
# Diff a specific file
diff worktrees/bulk-sync-upstream/src/config/sessions/types.ts \
     worktrees/bulk-sync/src/config/sessions/types.ts
```

---

## Version Tracking

| Reference | Commit/Version | Date |
|-----------|----------------|------|
| Upstream baseline | `HEAD` of `bulk-sync-upstream` worktree | 2026-01-22 |
| Nexus fork point | TBD (after thin-fork rebase) | TBD |

---

*Keep this document updated as upstream evolves. It's the canonical map for understanding where Nexus diverges.*
