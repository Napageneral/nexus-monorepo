> **Status:** ARCHIVED — V2 track superseded by V3 canonical specs and NEXUS_REQUEST_TARGET.md memory system integration
> **Archived:** 2026-02-27

# MEMORY V2 Track 3: Recall Thread-Aware Lookback (Hybrid)

## Status
ARCHIVED

## Objective
Improve agent context on sparse episodes by extending the existing `recall` tool with thread-aware lookback behavior, without adding a new tool.

## Customer Experience Goal
1. Retain/consolidate agents can easily peek recent thread context when episode context is thin.
2. Agent UX stays simple: same `recall` tool, no extra toolset churn.
3. Defaults work automatically in memory sessions; agent can still override.

## Hard Cutover Principle
No new parallel "thread peek" tool for this track.
- Extend existing `recall` schema and backend.
- Keep the primary tool name and usage pattern stable.

## Decision (Hybrid: Option 2 + Option 3)
1. Extend `recall` params with optional:
   - `thread_id?: string`
   - `thread_lookback_events?: number`
2. If caller omits `thread_id`, resolve default from run context (`currentThreadTs`) in memory retain/consolidate sessions.
3. In retain/consolidate sessions, apply default lookback behavior internally for sparse episode cases.
4. Do not introduce a separate tool registration/injection path.

## Proposed Tool Contract Additions
```ts
recall({
  query: string,
  ...existing,
  thread_id?: string,
  thread_lookback_events?: number
})
```

Semantics:
- `thread_id`: constrain/augment short-term event retrieval to the thread.
- `thread_lookback_events`: include up to N recent prior events from that thread as additional context candidates.

## Backend Behavior
1. Add optional thread-aware branch in short-term event retrieval path.
2. When `thread_id` is present (or inferred), include prior thread events ordered by timestamp descending up to lookback limit.
3. Preserve existing ranking/fusion behavior; lookback events are additive context, not a separate tool output type.

## Implementation Plan
1. Update recall tool schema and parameter parsing:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools/memory-recall-tool.ts`
2. Thread context plumbing into recall execution options:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/nexus-tools.ts`
3. Recall backend query logic:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/recall.ts`
4. Session defaults for memory retain/consolidate paths via run context (no new tool).

## Validation Plan
1. Unit tests for recall with explicit `thread_id` and lookback count.
2. Unit tests for implicit thread context (run context default path).
3. Regression tests: existing recall behavior unchanged when thread params absent.
4. Episode quality check on sparse threads: reduced ambiguous facts like "the sender/contact".

## Acceptance Criteria
1. Recall supports thread-aware lookback with no new tool.
2. Memory retain/consolidate sessions get thread-aware defaults without explicit agent-side thread wiring.
3. Existing non-memory recall flows remain stable.

