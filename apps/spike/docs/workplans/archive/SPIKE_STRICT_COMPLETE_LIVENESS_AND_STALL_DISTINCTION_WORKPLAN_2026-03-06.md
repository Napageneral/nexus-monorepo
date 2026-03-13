# Spike Strict-Complete Liveness And Stall Distinction Workplan

**Status:** ACTIVE
**Last Updated:** 2026-03-06

---

## Purpose

This workplan closes the gap between the canonical investigation policy model
and the current ask runtime behavior for strict-complete execution.

Canonical target-state documents:

- `../specs/SPIKE_GUIDE_FOR_AGENT_MODEL.md`
- `../specs/SPIKE_INVESTIGATION_POLICY_MODEL.md`

The specific implementation goal is:

- preserve strict-complete exhaustive ask behavior
- distinguish `slow and alive` from `silently stalled`
- expose that distinction durably to the operator and the orchestration kernel
- avoid defaulting to degraded root synthesis simply because a branch is slow

---

## Customer Experience

The intended operator experience is:

1. start a Spike ask on a large hydrated tree
2. let it run for as long as it needs when branches are still alive
3. see that long-running branches are making real progress
4. identify branches that are truly stalled rather than merely slow
5. keep the root ask strict-complete by default
6. cancel explicitly when desired and get a clean terminal request row

The operator should not have to infer liveness from absent output.

---

## Current Reality

### What already works

- asks persist `ask_requests`
- branch sessions persist in `sessions`
- completed turns persist in `turns`
- the broker already emits runtime events such as `stream_start`,
  `stream_end`, `assistant`, and `tool_status`
- local CLI interruption now writes terminal `cancelled` request rows

### What is still missing

- the kernel has no durable notion of in-flight branch liveness beyond session
  creation time
- `sessions.updated_at` does not currently reflect in-flight provider activity
- the go-agent runtime only emits assistant/tool events after provider
  completion or tool execution
- Codex SSE is currently parsed to completion without surfacing mid-stream
  progress to Spike
- as a result, a healthy long-running provider call and a silently wedged
  provider call can look identical while in flight

---

## Primary Finding

The missing layer is not "retry sooner" or "synthesize partially by default."

The missing layer is durable liveness.

Spike already has useful kernel surfaces:

- `sessions.updated_at`
- event fanout through broker
- request rows in `ask_requests`
- synchronous strict-complete subtree recursion

What it lacks is a reliable source of in-flight progress while a provider call
is still running.

---

## Implementation Strategy

### Phase 1: Surface real provider heartbeats

Plumb a provider progress callback through the go-agent provider request
context.

For the Codex/OpenAI responses SSE path:

- emit progress notifications while SSE events are being received
- do not wait until final `response.completed` to surface liveness

This gives the runtime a real "alive" signal during long provider turns.

### Phase 2: Promote runtime progress into broker events

Map provider progress into broker-visible runtime events.

These events should be lightweight and frequent enough to show liveness, but
not so noisy that they flood the ledger or UI.

### Phase 3: Persist branch activity durably

Use broker-visible progress events to touch session activity timestamps.

The minimum durable signal is:

- active branch session label
- last observed activity time
- whether a terminal turn has been written

This makes `slow and alive` observable in SQLite without inventing a separate
shadow state system.

### Phase 4: Keep strict-complete default semantics

Do not change the default synthesis contract.

The root still waits for every child to reach a terminal branch outcome.

The new liveness signal exists so the kernel and operator can distinguish:

- alive and still working
- stalled with no progress
- completed
- failed
- cancelled

### Phase 5: Leave automatic stall termination optional

Once real liveness exists, a future execution policy may enforce stall
termination based on absence of heartbeats.

That should be added only after observing real branch heartbeat behavior on
large asks. It is not required for the first pass.

---

## File-Level Changes

Expected implementation areas:

- `service/internal/prlm/tree/`
  - execution policy hooks already exist and may need light extension
- `service/internal/broker/`
  - propagate and persist activity signals
- `../pi-mono/go-coding-agent/pkg/agent/`
  - surface provider progress into runtime events
- `../pi-mono/go-coding-agent/pkg/providers/`
  - emit Codex/OpenAI SSE progress notifications

---

## Validation Plan

### Unit validation

- provider progress callback emits during Codex SSE parsing
- runtime converts provider progress into runtime events
- broker updates session activity when progress events arrive
- strict-complete default synthesis remains unchanged

### Real-run validation

- run a real SWE-Atlas simple-login ask on the rebuilt binary
- confirm long-running branch sessions show advancing activity timestamps while
  still in flight
- confirm interrupted runs still land in `cancelled`
- confirm completed branches still persist terminal turns normally

---

## Non-Goals

This workplan does not:

- change exhaustive routing away from strict-complete default semantics
- default to degraded completion
- switch Spike wholesale to a new transport architecture
- require immediate WebSocket migration for Codex execution

