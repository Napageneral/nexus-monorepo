# Command Center UI (NEX Native)

**Status:** SPEC IN PROGRESS (IMPLEMENTATION BLOCKED ON LEDGER-FIRST PREREQUISITES)  
**Last Updated:** 2026-02-11  
**Owner:** Tyler / Nexus

---

## Purpose

Define a zero-unspecced path to ship a new **Command Center** in the existing NEX Control UI instead of building a separate app/backend.

This spec is the implementation gate for:
1. Command Center tab in existing `nex/ui`
2. Session import from AIX-normalized history
3. Deferred multi-select file context injection phase

No production code should land for this feature outside this spec's approved scope.

---

## Decision: Build On Existing NEX UI + Gateway

### Chosen direction

Build the Command Center in:
- UI: `nex/ui`
- Backend surface: existing Gateway RPC + events in `nex/src/gateway`
- Runtime/broker execution: existing NEX broker + pi-embedded integration

### Why this is the right baseline

Existing NEX already provides:
- Web Control UI shell + routing + chat rendering
- WebSocket RPC client (`chat.send`, `chat.history`, `chat.abort`, `agents.list`, `sessions.list`)
- Streaming events (`chat`, `agent`) with tool event support
- Session lifecycle and transcript persistence
- Broker/ledger integration path

This avoids duplicating agent runtime and keeps all orchestration in one system.

---

## Core Data Plane Decision

The Command Center data plane is **ledger-first**:

1. **Agents Ledger is source of truth** for sessions/turns/messages/tool-calls shown in Command Center.
2. **NEX broker runtime writes directly to Agents Ledger** during native runs.
3. **AIX acts as an ingestion adapter** for external harness history (Cursor, Codex, Claude Code, etc.) and continuously syncs into the same ledger plane.
4. Command Center should query a ledger-backed session view rather than per-harness stores.

---

## Scope

## In scope (phased)

1. New `command-center` tab inside existing Control UI
2. 4-column layout foundation:
   - Left: agent menu
   - Center-left: agent chat
   - Center-right: file panel (phase-gated)
   - Right: project tree
   - Optional bottom terminal (post-MVP)
3. AIX session import into NEX/ledger model
4. Prerequisite workstreams that remove blockers to ledger-first operation

## Out of scope (for now)

1. Embedding/RAG `@codebase`
2. VS Code fork behavior
3. Tauri/native shell
4. New standalone backend
5. Multi-select context injection in browser MVP (deferred)

## Packaging strategy

1. Primary delivery target: existing browser Control UI in `nex/ui`
2. Desktop packaging decision deferred until UI scope is stable
3. Deferred features (like advanced context injection UX) can be revisited during desktop-app phase

---

## Phased Delivery Plan

## Phase 0 (MVP): Command Center Core

Goal: fast usable baseline for daily agent work.

Includes:
1. Command Center tab + layout shell in `nex/ui`
2. Agent list and active-agent switching
3. Chat panel using existing `chat.*` methods/events
4. Session browser shortcut for opening sessions
5. Session views that are ledger-backed (directly or via ledger-backed gateway adapters)

Excludes:
1. Multi-select context injection
2. Rich editor/viewer (file panel can be placeholder or minimal read-only preview)
3. Inline diff accept/reject UX
4. Integrated terminal panel

## Phase 1: Session Continuity + AIX Ingestion

Includes:
1. AIX -> NEX `sessions.import` path
2. Backfill + tail sync operations into unified ledger plane
3. Resume imported sessions as first-class NEX sessions
4. Provenance metadata (`source`, `source_session_id`, `imported_at`) visible in sessions UI

## Phase 2: Review UX

Includes:
1. File panel editing
2. Diff cards / jump-to-file links for tool changes
3. Project tree + deferred multi-select context injection
4. Optional bottom terminal

---

## Architecture (Current + Planned)

## Current foundations reused

1. `nex/ui/src/ui/controllers/chat.ts` for `chat.history`, `chat.send`, `chat.abort`
2. `nex/ui/src/ui/app-gateway.ts` for event handling and stream updates
3. `nex/src/gateway/server-methods/chat.ts` and `sessions.ts` for run/session control
4. `nex/src/gateway/server-methods/agents.ts` for agent metadata/config access

## Planned additions

1. New Command Center view/controller set under `nex/ui/src/ui/views|controllers`
2. New Gateway `sessions.import` method for AIX ingestion
3. Ledger-backed session query path for Command Center views

---

## Deferred Track: Multi-Select Context Injection

This is explicitly deferred and does **not** block Command Center Phase 0.

When resumed, expected direction is still gateway-mediated context resolution (for security + path controls), but design is out of scope for current milestone.

---

## Decision: `sessions.import` for AIX

Adopt **B1**: Gateway RPC `sessions.import`.

Add method:
- `sessions.import`
  - Accepts normalized session payload (or batch)
  - Creates/updates NEX session and ledger records
  - Returns created keys + import report

## Required import semantics

1. Idempotent re-import by source/session fingerprint
2. Provenance fields:
   - `source` (`aix`)
   - `source_provider` (`cursor`, `codex`, `claude-code`, etc.)
   - `source_session_id`
   - `imported_at`
3. Parent/child turn lineage preservation where available
4. Graceful degradation if source omits fields
5. Import report with per-session success/failure

---

## Prerequisite Workstreams (Trail Through Hurdles)

These are required before full Command Center goal is considered complete.

## Workstream 1: NEX Broker Ledger-First Completion

Goal:
1. Finish transition so broker/session runtime no longer depends on transcript/session files for primary execution semantics.
2. Keep transcript compatibility only where explicitly required as transitional behavior.

Current risk snapshot:
1. Runtime still has broad references to `sessions.json` and `*.jsonl` transcript workflows across gateway/auto-reply/infra codepaths.
2. Command Center correctness depends on eliminating split-brain between file-store and ledger views.

Exit criteria:
1. Session routing/head state sourced from ledger-backed model
2. Turn/message/tool-call persistence sourced from ledger-backed model
3. No primary-path reliance on file transcript read/write for session truth

## Workstream 2: AIX Ingestion Contract + Sync Reliability

Goal:
1. Validate AIX idempotent import/backfill/tail behavior against NEX ingestion contract.
2. Ensure external harness continuity lands in unified ledger plane.

Current risk snapshot:
1. AIX has strong parser/upsert lineage handling (including Cursor subagent linking), but NEX ingestion contract must formalize idempotency and provenance boundary.
2. Continuous sync must avoid duplicate/late-write drift.

Exit criteria:
1. `sessions.import` idempotency key/fingerprint semantics documented and tested
2. Backfill + tail sync operational runbook defined
3. Lineage fields preserved for imported sessions/turns/tool calls

---

## Proposed Command Center UI Contract (Initial)

## Layout contract

1. `agent-menu` (left)
2. `chat-pane` (primary center-left)
3. `file-pane` (center-right, minimal in Phase 0)
4. `project-tree` (right)
5. `terminal-pane` (optional, collapsed by default, Phase 2+)

## Interaction contract (Phase 0)

1. Agent/session selection from unified session plane
2. Chat interaction over existing `chat.send`/`chat.history` with ledger-backed semantics
3. Imported sessions behave like native sessions from UI perspective

## Session continuity contract (Phase 1)

1. Imported sessions appear in `sessions.list`
2. Selecting imported session opens it in chat seamlessly
3. Imported history is distinguishable via provenance metadata

---

## Acceptance Criteria

## AC0: Spec gate

1. Deferred track explicitly scoped out of Phase 0
2. `sessions.import` decision locked
3. This spec updated with selected options before implementation begins

## AC1: Command Center tab

1. New tab reachable from Control UI nav
2. Uses existing auth/session model
3. Streams chat deltas + tool events in active pane

## AC2: Unified sessions in Command Center

1. Session list reflects ledger-backed unified session plane
2. Imported and native sessions are both openable in chat
3. Session provenance is visible for imported records

## AC3: Session import

1. Imported sessions are queryable via `sessions.list`
2. Imported sessions can be resumed via `chat.history` + `chat.send`
3. Import is idempotent and emits clear result summary

---

## Open Questions (Must Close Before Coding)

1. **Import payload transport format**  
   JSON payload over RPC vs file-path reference vs both.

2. **Where imported sessions should appear by default**  
   Same list mixed with active sessions vs separate filtered view.

3. **Phase 0 file pane behavior**  
   Placeholder only vs minimal read-only preview.

4. **Ledger migration sequencing**  
   Which runtime paths must be converted before Command Center GA.

---

## Next Step After Spec Approval

1. Confirm prerequisite sequencing owners/work order (Workstream 1 and 2)
2. Implement Phase 0 Command Center tab in `nex/ui`
3. Implement `sessions.import` in Gateway + tests
