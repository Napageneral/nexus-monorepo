# AIX Adapter — Upstream Review

**Last Updated:** 2026-02-06  
**Source:** mnemonic (`internal/adapters/aix*.go`)  
**Upstream (OpenClaw):** N/A — Nexus-only channel

---

## Overview

AIX ingests AI session data from IDE tools (Cursor, Codex, Claude Code, etc.) via their local SQLite databases. This is a Nexus-original adapter with no OpenClaw equivalent.

**Technology:** Reads from AIX SQLite database (`aix.db`), which is populated by the `aix` tool that watches IDE databases.

---

## Current Implementation (Mnemonic)

Three adapters exist in mnemonic, each serving a different purpose:

### 1. `aix.go` — Full Message Adapter
**Reads:** `sessions`, `messages`, `message_metadata` tables from `aix.db`  
**Extracts:**
- Sessions → threads
- Messages → events (user sent, assistant received, tool observed)
- Terminal tool invocations extracted from metadata
- Participants: user contacts + AI model contacts

**Output:** Writes to Cortex `events` and `threads` tables  
**Sync mode:** One-shot incremental via watermarks

### 2. `aix_events.go` — Trimmed Turn Pairs
**Reads:** `turns`, `sessions`, `messages` tables  
**Extracts:**
- Each turn → 2 events (user query + assistant response)
- Tool calls and thinking blocks stripped from assistant content
- Consolidated user messages per turn

**Output:** Writes to Cortex `events` table  
**Purpose:** Clean turn pairs for memory extraction and embedding

### 3. `aix_agents.go` — Full-Fidelity Sessions
**Reads:** `sessions`, `messages`, `turns`, `tool_calls` tables  
**Extracts:**
- Complete sessions with all metadata
- Full messages with cursor rules, checkpoints
- Turn structure for forking
- All tool calls with params and results

**Output:** Writes to Agents Ledger (`agent_*` tables)  
**Purpose:** Import IDE sessions into Agents Ledger for smart forking and session continuity

---

## Protocol Compliance

| Protocol Command | Current State | Status | Notes |
|-----------------|---------------|--------|-------|
| **`info`** | — | Missing | No self-describe command. |
| **`monitor`** | — | Missing | All adapters are one-shot sync, not continuous. |
| **`send`** | — | N/A | You don't "send" to an IDE. AIX is inbound-only. |
| **`backfill`** | `Sync()` methods | Logic exists | All three adapters do incremental sync from aix.db. Need JSONL output instead of SQLite writes. |
| **`health`** | — | Missing | No health check. Could check aix.db accessibility. |
| **`accounts`** | Source parameter | Partial | Sources: cursor, codex, claude-code, opencode. Not a CLI command. |

### Current Compliance Level: **None** (no standalone adapter exists)  
### Target: **Basic** (inbound-only, `info` + `monitor` + `backfill`)

---

## What Exists (Logic Available)

### Data Source
- **AIX SQLite database:** `~/Library/Application Support/aix/aix.db` (macOS) or `~/.local/share/aix/aix.db` (Linux)
- **Read-only access** with busy timeout
- **Tables:** sessions, messages, turns, tool_calls, message_metadata

### Normalization Logic
- Session → thread mapping: `thread_id = "aix_session:{session_id}"`
- Message → event mapping: deterministic event IDs
- Participant creation: user and model contacts
- Tool invocation extraction from metadata JSON
- Content stripping: `stripToolAndThinkingBlocks()` removes XML tool calls, thinking blocks

### Incremental Sync
- Watermark-based: tracks `last_sync_at` and `last_event_id`
- Full sync mode available (`full=true`)
- Idempotent: deterministic IDs prevent duplicates

### Supported IDE Sources
- **Cursor** — Fully implemented and tested
- **Codex** — Mentioned, basic support
- **Claude Code** — Mentioned in docs
- **OpenCode** — Mentioned in docs

---

## What Needs to Be Built

### Adapter Binary
A new `aix` executable (or additions to an existing tool) that implements:

```bash
aix info                                    # AdapterInfo JSON
aix monitor --source cursor --format jsonl  # Watch for new sessions/turns
aix backfill --source cursor --since 2025-01-01 --format jsonl
aix health --source cursor
aix accounts list                           # List available IDE sources
```

### Monitor (Continuous)
Current implementation is one-shot. Need continuous watching:
- **Option A:** Poll aix.db periodically (e.g., every 5s) for new rows since last watermark
- **Option B:** Use FSEvents (macOS) or inotify (Linux) to watch aix.db for changes, then query new rows
- **Option C:** The `aix` tool itself could emit events as they arrive (if it has a watch mode)

Polling is simplest and matches how `eve watch` works.

### JSONL Output
Convert current SQLite-write logic to NexusEvent JSONL emission:

```json
{"event_id":"aix:cursor:msg123","timestamp":1707235200000,"content":"User query text","content_type":"text","channel":"aix","account_id":"cursor","sender_id":"aix:cursor:user","peer_id":"aix:cursor:session456","peer_kind":"dm","thread_id":"aix:cursor:session456","metadata":{"role":"user","session_id":"session456"}}
```

### Account Model
Accounts map to IDE sources:
- `aix/cursor` — Cursor IDE sessions
- `aix/codex` — Codex CLI sessions
- `aix/claude-code` — Claude Code sessions

Each account reads from the same `aix.db` but filters by source.

---

## Design Decisions

### Single Adapter vs Multiple
**Recommendation: Single `aix` adapter with source as account.**

All sources share the same database schema and normalization logic. The source is just a filter. Separate adapters would duplicate code.

### What Goes to Events Ledger vs Agents Ledger?
Current mnemonic has two paths:
1. `aix.go` / `aix_events.go` → Events/Cortex (for memory, search, analysis)
2. `aix_agents.go` → Agents Ledger (for session continuity, forking)

For Nexus:
- **Adapter emits NexusEvents** → Events Ledger (standard pipeline path)
- **Agents Ledger import is separate** — handled by AIX integration in the Broker, not the adapter. The adapter provides raw events; the Broker handles session import.

This keeps the adapter simple (just emit events) and lets the Broker handle the complex session import logic.

### Inbound Only
AIX is strictly inbound. There's no meaningful "send" operation — you don't send messages to an IDE through the adapter system. IDE interaction happens through the Broker directly (harness bindings, session management).

---

## Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Build `aix` CLI with info/accounts commands | 4-8 hours | High |
| Implement backfill (convert Sync to JSONL) | 4-8 hours | High |
| Implement monitor (polling aix.db) | 4-8 hours | High |
| NexusEvent schema for IDE sessions | 2-4 hours | High |
| Health command (check aix.db access) | 1-2 hours | Low |
| **Total to Basic level** | **~20-30 hours** | |

---

## Related
- `../../ADAPTER_SYSTEM.md` — Protocol definition
- mnemonic `internal/adapters/aix*.go` — Current implementation
- mnemonic `docs/CURSOR_TOOL_INVOCATION_PIPELINE.md` — Tool extraction details
- mnemonic `docs/AGENTS_LEDGER_SCHEMA.md` — Agents Ledger schema
