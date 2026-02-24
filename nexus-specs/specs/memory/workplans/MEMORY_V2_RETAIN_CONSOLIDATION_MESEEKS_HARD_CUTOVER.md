# Memory V2 Retain + Consolidation Meeseeks Hard Cutover

**Status:** EXECUTION SPEC  
**Date:** 2026-02-24  
**Owners:** Runtime, Memory, IAM

## 1. Customer Experience (Primary)

The user-facing behavior must be:

1. Retain and consolidation are reliable and deterministic across live and backfill.
2. Writer and consolidator run as real agents with tool-backed side effects, not text-only simulations.
3. One consolidation agent run per retain episode. No internal topic sub-cluster loop.
4. No hidden guardrail layers masking core failures.
5. Validation runs are clean and repeatable (isolated state, no stale-run contamination).

Hard cutover posture applies. No backwards compatibility shims in this slice.

---

## 2. Scope

This spec executes four linked changes:

1. Remove legacy channel-docked agent tool path that caused retain failures (WhatsApp `createLoginTool` crash path).
2. Remove temporary memory guardrail layers added as compensations.
3. Replace in-process consolidation wrapper with a dedicated consolidation meeseeks agent.
4. Enforce episode-native consolidation semantics: one consolidation call per retain episode, no topic sub-clusters.

---

## 3. Problem Summary (Evidence)

### 3.1 Circuit break event root cause

From runtime evidence, five consecutive `memory-writer` hook failures occurred in ~726ms due to:

- `Cannot read properties of undefined (reading 'createLoginTool')`
- stack root in `extensions/whatsapp/src/channel.ts` via channel agent tools aggregation.

This happened during backfill episode dispatch, not user chat traffic.

### 3.2 Guardrail layer drift

Retain still depends on compensations:

- writer-outcome validator gating (`writer-outcome.ts`)
- post-response validation gate in `memory-retain-episode.ts`
- consolidation parse-retry branch for malformed JSON
- hard-coded generation options that are not canonical in broker helper flow

These hide root failures and complicate observability.

### 3.3 Consolidation semantics drift

Current consolidation flow:

- receives an episode fact batch
- re-clusters internally by entities/embedding similarity
- runs one LLM call per cluster
- creates synthetic `consolidation` episodes for observation runs

This conflicts with desired behavior for this slice:

- episode is the only cluster for consolidation invocation
- consolidation is anchored to the retain episode directly

---

## 4. Design Decisions

## 4.1 Legacy channel-docked agent tools: remove

### Decision

Remove channel plugin agent tools from generic agent tool assembly in this slice.

### Why

`listChannelAgentTools()` is global and can fail unrelated workflows (memory writer) due to channel runtime shape drift.

### Required changes

1. Remove channel-docked tools from `createNexusCodingTools` assembly path.
2. Remove WhatsApp `agentTools` entry in plugin definition.
3. Keep channel login/auth flows on explicit channel/runtime interfaces (not generic worker tool inventory).

### Acceptance

1. No memory retain/consolidation path depends on channel plugin login tools.
2. No `createLoginTool` crash path exists in writer/consolidator sessions.

---

## 4.2 Remove temporary compensations

### Decision

Delete temporary compensation layers and fail loudly on core failures.

### Remove

1. `writer-outcome.ts` and its gating in retain automation.
2. consolidation JSON parse retry branch.
3. soft-return behavior that marks retain as non-fired for core execution failures.

### Keep

Core runtime safety mechanisms (timeouts, circuit breaker) remain infra-level protections.

### Acceptance

1. No writer outcome validator path in runtime.
2. No consolidation retry-on-parse branch.
3. Failures surface as explicit errors with traceable invocation rows.

---

## 4.3 Dedicated consolidation meeseeks agent

### Decision

Consolidation runs as its own meeseeks automation, not via in-process LLM wrapper attached to writer automation.

### New automation

Add bundled automation:

- `name`: `memory-consolidator`
- `hook_point`: `memory:consolidate-episode`
- `workspace_dir`: `workspace/memory-consolidator`
- `model`: same default worker model path (`gpt-5.3-codex`)

### Flow

1. Writer retain automation completes and writes facts for episode `E`.
2. Pipeline dispatches a `memory.consolidate.episode` event carrying:
   - `episode_id`
   - `fact_ids` for that episode
3. Consolidator meeseeks receives this event and executes consolidation tools directly.

### Tools for consolidator

Consolidator toolset should be explicit and minimal:

1. `recall`
2. observation create/update tool(s)
3. `insert_causal_link`
4. `propose_merge`

No text-JSON action protocol between agent and runtime for consolidation persistence.

### Acceptance

1. Consolidation agent has its own session label namespace and hook.
2. No `runConsolidationLlmViaBroker` wrapper path remains.
3. Consolidation persistence happens only through completed tool calls.

---

## 4.4 Episode-native consolidation semantics (no sub-cluster loop)

### Decision

Consolidation invocation unit is exactly one retain episode.

### Rules

1. One consolidation agent call per retain episode dispatch.
2. No internal semantic/topic sub-clustering loop inside consolidation runtime logic.
3. Consolidation analysis is anchored to the source retain episode id.

### Data-model alignment

Use existing analysis schema for idempotency:

- `analysis_runs.analysis_type_id = 'observation_v1'`
- `analysis_runs.episode_id = <retain_episode_id>`
- rely on existing `UNIQUE(analysis_type_id, episode_id)` for idempotency.

No synthetic `knowledge:*` episode creation in this slice.

### Acceptance

1. Consolidation path has no per-cluster loop.
2. A rerun on same episode does not create duplicate analysis run for `observation_v1`.
3. Observation-fact links for that episode are stable/idempotent.

---

## 4.4a Observation head strategy (for consolidator behavior)

### Decision

Consolidator should default to updating the latest head observation chain for relevant matches, while keeping controlled branching available.

### Default behavior

1. When recall returns matching observations, prefer the most recent head (latest non-child descendant) as update target.
2. Use stale status and recency as tie-breakers before creating a new branch.

### Controlled branching

Branching is allowed when:

1. Candidate observations are semantically distinct topics.
2. Updating the head would blur topic boundaries.
3. Evidence is stronger for a sibling branch than for the current head.

### Why

1. Head-first keeps continuity and reduces fragmentation.
2. Branching preserves model quality when episode facts are orthogonal to the current head.

### Implementation note

Expose an explicit `resolve_observation_head` tool so the consolidator can normalize any recalled observation id to its current head before deciding `update` vs `create`.

---

## 4.5 Generation constraints

### Decision

Do not set manual `max_output_tokens` limits for consolidation in this slice.

### Why

Output truncation and retry complexity were introduced by artificial caps and wrapper behavior drift.

### Acceptance

1. Consolidation code path does not pass `max_output_tokens` overrides.
2. No strict JSON action parsing contract is required between consolidator agent and runtime writer.

---

## 4.6 Clean validation runs

### Decision

Backfill/live validation must run in isolated state directories.

### Required pattern

1. Clone/seed required ledgers into temporary `NEXUS_STATE_DIR`.
2. Run smoke/backfill validation against that isolated state.
3. Destroy temp state after run.

### Acceptance

1. Re-running same validation scenario starts from clean runtime metadata (automations, invocations, backfill runs).
2. Results are reproducible and comparable run-to-run.

---

## 5. Implementation Plan

1. **Tool path cutover**
   - Remove channel-docked agent tool injection.
   - Remove WhatsApp `agentTools` plugin hook.
2. **Guardrail deletion**
   - Delete writer outcome validator file and all call sites.
   - Remove consolidation parse-retry path.
3. **Consolidation agent split**
   - Add `memory-consolidator` bundled automation + workspace prompt pack.
   - Add `memory:consolidate-episode` event dispatch after retain success.
   - Remove writer-embedded consolidation wrapper.
4. **Episode-only consolidation runtime**
   - Remove cluster-building loop from consolidation core.
   - Bind consolidation run to source retain episode id.
   - Enforce idempotency via `analysis_runs` unique key.
5. **Validation harness update**
   - Add isolated-state smoke command path for backfill/live retain+consolidation.

---

## 6. Validation Checklist

## 6.1 Unit/Integration

1. Retain writer tests pass without `writer-outcome` layer.
2. Consolidation tests assert:
   - single episode invocation
   - no internal cluster-loop behavior
   - idempotent rerun on same episode
3. Agent tool inventory tests verify channel plugin agent tools are absent from generic worker inventory.

## 6.2 Runtime evidence

1. `hook_invocations` rows exist for success/failure/skipped/circuit-open paths.
2. No retain/consolidation failure stack traces referencing `createLoginTool`.
3. Consolidation session labels are `meeseeks:memory-consolidator:...` (or equivalent dedicated namespace).

## 6.3 Smoke run

1. Small window (`--apply`, concurrency 1) in isolated state:
   - episodes retained
   - facts/entities written
   - one consolidation run per retained episode
2. Medium window repeat run:
   - idempotent behavior on already consolidated episodes
   - no duplicate observation analysis runs for same episode

---

## 7. Non-Goals

1. Reworking memory writer into non-agent architecture.
2. Introducing compatibility layers for old consolidation clustering semantics.
3. Broad unrelated channel platform refactors beyond removing the agent-tool crash path.
