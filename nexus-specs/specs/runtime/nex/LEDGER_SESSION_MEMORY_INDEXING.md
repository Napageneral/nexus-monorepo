# Ledger Session Memory Indexing (Replace Transcript Indexing)

**Status:** LOCKED FOR IMPLEMENTATION  
**Last Updated:** 2026-02-13  
**Related:** `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/runtime/ui/WORKSTREAM_1_LEDGER_CUTOVER.md`  
**Related:** `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/ledgers/AGENTS_LEDGER.md`  
**Related (Upstream):** `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/cortex/upstream/UPSTREAM_MEMORY.md` (Session transcript indexing)

---

## 1. Objective

Preserve the upstream “sessions” memory source (used by `memory_search`) while completing a **ledger-only** runtime cutover:

1. **No transcript JSONL** files as a source of truth (no reads, no writes, no watches).
2. Session recall is derived from the **Agents Ledger** (native NEX + AIX imports write here).
3. The indexing plane stays the existing memory index (builtin sqlite index and/or QMD backend), but **its inputs become ledger-derived**.

This is a **recall/search** feature (cross-session retrieval), not prompt assembly. Prompt history assembly is already ledger-based via `assembleContext`.

### 1.1 Configuration Gate (Decision)

Nexus always indexes session history from the agents ledger for memory search.

- `memorySearch.experimental.sessionMemory` is deprecated/ignored.
- `memorySearch.sources` is deprecated/ignored (session history is always included).

---

## 2. Why Upstream Indexed Sessions

Upstream indexed sessions because users rarely keep `MEMORY.md` perfectly updated, but they still want “what did we decide last week?” recall.

Mechanically, upstream:

1. Stores each chat as an append-only **transcript JSONL** file.
2. Optionally indexes those transcripts when `sources: ["sessions"]` is enabled for memory search.
3. Extracts only `user` + `assistant` message text (tool calls/results excluded), typically with redaction, and embeds it into the memory index.

In Nexus, the canonical persisted record is the **Agents Ledger**, so we keep the same recall capability but change the substrate.

---

## 3. Canonical Source: Agents Ledger

Ledger tables involved:

- `sessions` (stable label, pointer to current thread head)
- `session_history` (append-only feed of session pointer movements)
- `threads` (ancestry JSON for a thread head / turn)
- `turns` (metadata, model/provider, status)
- `messages` (turn-local user/assistant/system/tool messages)
- `compactions` (summary text when compaction occurs)

Primary invariant: **all harnesses converge here**.

- Native NEX execution writes turns/messages/tool_calls to ledger
- AIX import writes imported sessions/turns/messages to ledger

Therefore, memory indexing should read only from ledger.

---

## 4. What Gets Indexed (Content Contract)

### 4.1 Message Inclusion Rules

Index only:

- `messages.role in ("user","assistant")`
- `messages.content` as plain text

Exclude by default:

- tool calls/results (`tool_calls`, `messages.role="tool"`)
- system prompt content

Rationale: tool outputs are large/noisy and can contain secrets; system prompts are repetitive.

### 4.2 Redaction

Apply the same redaction intent as upstream session indexing:

- `redactSensitiveText(text, { mode: "tools" })` before embedding

### 4.3 Document Unit

**Unit of indexing = per-turn documents** (superior incremental behavior vs per-session whole-doc rewrites).

For each session label and for each turn in that session head ancestry, we synthesize a markdown-ish document:

- Path format (not a real filesystem path; it’s an index ID):
  - `sessions/<safeSessionLabel>/turns/<turnId>.md`

- Content format:
  - Header (metadata for humans + debugging):
    - `Session: <sessionLabel>`
    - `Turn: <turnId>`
    - optional: timestamp/model/provider
  - Body:
    - `User: ...`
    - `Assistant: ...`

This yields:

- Small, highly-relevant embeddings
- Easy incremental tail indexing (new turn = new doc)
- Better recall precision than large monolithic transcripts

### 4.4 Compaction

When compaction is present in the ledger, it is already recorded as:

- `turns.turn_type = "compaction"`
- `compactions.summary`

Compaction summaries should also be indexable under `source="sessions"` as:

- `sessions/<safeSessionLabel>/compactions/<turnId>.md`

This is optional for v1 if per-turn docs are indexed for all turns in ancestry (including compaction turns).

---

## 5. Incremental Sync (Backfill + Tail)

### 5.1 Cursor Storage

We maintain a cursor in the memory index DB (`meta` table) so we can tail changes without transcript FS watchers:

- key: `memory_sessions_ledger_cursor_v1`
- value: last processed `session_history.id` (integer)

### 5.2 Tail Sync Algorithm

On memory sync:

1. Read `session_history` rows with `id > cursor`
2. Join to `sessions` to scope to the current agent persona:
   - `sessions.persona_id = <agentId>`
3. Coalesce updates per `session_label` to the latest `thread_id`
4. For each updated session:
   1. Load `threads.ancestry` for the head `thread_id`
   2. For each `turn_id` in ancestry:
      - Build the synthetic turn doc (content contract above)
      - Skip if the `files` table already has the same hash for this path/source
      - Otherwise, index via existing chunk/embed pipeline
5. Advance cursor to the max processed `session_history.id`

### 5.3 Backfill

When:

- cursor is missing (first run)
- `sync(force=true)`
- embedding meta changes require reindex

We backfill by listing all sessions for persona and indexing each head ancestry.

### 5.4 Deletion / Retention

Ledger sessions are durable; by default we do not delete session-derived docs from the index unless:

- a full reindex occurs, or
- a session is explicitly `status="deleted"` and we choose to clean derived docs (deferred)

---

## 6. Implementation Plan (Code)

### 6.1 Builtin Memory Backend

Modify:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/manager.ts`

Changes:

1. Remove transcript file delta/watcher logic:
   - `onSessionTranscriptUpdate`
   - `resolveSessionTranscriptsDirForAgent`
   - “dirty files” and delta accounting
2. Add a read-only Agents Ledger connection:
   - open DB at `resolveLedgerPath("agents")` (WAL-safe read)
3. Implement `syncLedgerSessions()` using the algorithm in section 5
4. Keep `source="sessions"` in the memory index so `memory_search` remains stable

### 6.2 QMD Backend

Modify:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/qmd-manager.ts`

Changes:

1. Replace transcript-based `exportSessions()` with a ledger-derived exporter:
   - write derived `.md` docs under QMD export dir using the per-turn doc format
2. QMD update/embed continues unchanged; only the exported inputs change

### 6.3 Tooling/Docs

Update:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools/memory-tool.ts`

Replace wording:

- “session transcripts” → “session history (agents ledger)”

---

## 7. Tests / Acceptance Criteria

### 7.1 Unit/Integration Tests (vitest)

1. Builtin index:
   - Create a temp `agents.db` ledger with one session + one turn + messages + session_history
   - Run `MemoryIndexManager.sync()`
   - Assert memory index `files` contains `source="sessions"` entries and searches can retrieve session content
2. QMD export:
   - With QMD sessions enabled, assert exporter writes markdown derived from ledger (no JSONL transcript reads)

### 7.2 Acceptance Criteria

1. `memory_search` with `sources: ["memory","sessions"]` returns results derived from ledger-only data.
2. No runtime requirement for `agents/<agentId>/sessions/*.jsonl` transcript files.
3. New turns become searchable after the next memory sync (tail cursor advances).

---

## 8. Non-Goals

1. Replacing memory with Cortex episodic/declarative systems (handled elsewhere).
2. Building UI for browsing memory/session index (Command Center uses Agents Ledger directly).
3. Adding new RAG systems; this only preserves upstream “sessions” recall in a ledger-native way.
