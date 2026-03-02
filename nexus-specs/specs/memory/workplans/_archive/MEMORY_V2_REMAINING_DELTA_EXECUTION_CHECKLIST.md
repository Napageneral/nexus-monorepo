> **Status:** ARCHIVED — V2 track superseded by V3 canonical specs and NEXUS_REQUEST_TARGET.md memory system integration
> **Archived:** 2026-02-27

# MEMORY V2 Remaining Delta Execution Checklist

**Status:** ARCHIVED
**Date:** 2026-02-27  
**Owners:** Memory, Runtime, IAM

## 1. Customer Experience Target

End-state behavior must be:

1. Live + backfill retain/consolidate are deterministic and auditable.
2. Writer + consolidator are real tool-backed meeseeks with no text-simulation persistence path.
3. Episode payloads are readable and stable for QA (who/when/content/attachments).
4. Facts/entities come from message content + attachments only.
5. Attribution is deterministic (`source_episode_id`) and consolidation is idempotent.
6. Validation runs are isolated, repeatable, and clean.

Hard cutover posture: no compatibility shims and no compensating guardrails.

---

## 2. Delta Matrix (Spec Acceptance -> Current Status)

### A. Hard Cutover Retain + Consolidation (`MEMORY_V2_RETAIN_CONSOLIDATION_MESEEKS_HARD_CUTOVER.md`)

1. Legacy channel-docked crash path removed (`createLoginTool` path)
- **Status:** PASS
- Evidence: no `createLoginTool` in `src/`.

2. Remove temporary compensation layers (`writer-outcome`, retry masking)
- **Status:** PARTIAL
- Evidence: `writer-outcome.ts` removed; strict retain dispatch helper is in place.
- Gap: consolidation still persists via runtime JSON action parsing path (`/Users/tyler/nexus/home/projects/nexus/nex/src/memory/consolidation.ts`).

3. Dedicated consolidation meeseeks persists via completed tool calls (no text-JSON protocol)
- **Status:** FAIL
- Evidence: `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/meeseeks/memory-consolidate-episode.ts` calls `consolidateEpisodeBatch(...)` with `assembled.tools = []`, then runtime parses JSON actions.

4. One consolidation call per retain episode, no topic sub-clusters
- **Status:** PARTIAL
- Evidence: episode batch path consolidates whole fact set in one pass.
- Gap: legacy catch-up/per-fact loop and `kickConsolidation` remain in `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/consolidation.ts` (unused but present).

5. No manual max output limiter in consolidation path
- **Status:** PASS
- Evidence: no explicit `max_output_tokens` override in consolidation meeseeks path.

6. Clean isolated validation
- **Status:** PARTIAL
- Evidence: ladder supports isolated `--state-dir` and checks.
- Gap: caller-CWD hardening still required to prevent workspace bleed regressions in Stage A.

### B. Track 1 Writer Payload Contract (`MEMORY_V2_TRACK1_EPISODE_AGENT_PAYLOAD_CONTRACT.md`)

1. Top-level payload contract (`platform`, `thread`, `participants`, `events`)
- **Status:** PASS
- Evidence: `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-live.ts` + `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/meeseeks/memory-retain-episode.ts`.

2. Event contract includes readable datetime, content object, attachments array
- **Status:** PASS
- Evidence: `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-episodes.ts`.

3. Excluded noisy fields from writer payload
- **Status:** PASS
- Evidence: payload build omits `direction`, raw delivery, raw metadata.

4. Writer task guidance: content+attachments extraction only
- **Status:** PASS
- Evidence: writer task text in `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/meeseeks/memory-retain-episode.ts`.

### C. Track 2 Attachments (`MEMORY_V2_TRACK2_ATTACHMENTS_CANONICAL_HYDRATION_AND_INTERPRETATION.md`)

1. Phase A canonical hydration from `attachments` table
- **Status:** PASS
- Evidence: `ATTACHMENTS_SELECT_SQL` in live/backfill paths uses normalized `attachments` table first.

2. Phase B `attachment_interpretations` model + runtime path
- **Status:** FAIL
- Evidence: no `attachment_interpretations` schema or write/read path in `src/`.

### D. Track 3 Recall Thread Lookback (`MEMORY_V2_TRACK3_RECALL_THREAD_LOOKBACK_HYBRID.md`)

1. Recall schema includes `thread_id` and `thread_lookback_events`
- **Status:** FAIL
- Evidence: `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools/memory-recall-tool.ts` schema lacks both fields.

2. Backend supports inferred thread defaults for retain/consolidate sessions
- **Status:** FAIL
- Evidence: `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/recall.ts` options do not include thread lookback controls.

### E. Track 0 Reasoning + Automation Model Control (`MEMORY_V2_TRACK0_REASONING_TRACE_AND_AUTOMATION_MODEL_CONTROL.md`)

1. Per-hook `agent.model` / `agent.thinking` / `agent.reasoning_mode` mapping into runtime request
- **Status:** FAIL
- Evidence: hooks runtime currently merges only `stream_params`; no canonical hook-config model/thinking/reasoning mapping.

2. Usage normalization includes reasoning metrics
- **Status:** FAIL
- Evidence: `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/usage.ts` has no reasoning field.

3. Persistence of non-zero reasoning tokens in turn ledger
- **Status:** PARTIAL
- Evidence: DB + turn fields exist, but upstream usage model does not carry reasoning; effective values commonly zero.

4. Persist assistant reasoning summaries/text when provider exposes them
- **Status:** FAIL
- Evidence: no active wiring populating `messages.thinking` from provider reasoning summaries.

### F. IAM/Attribution/Contact Seeding (`MEMORY_V2_IAM_ATTRIBUTION_CONTACT_SEEDING_EXECUTION_SPEC.md`)

1. Episode-native attribution (`source_episode_id`) enforced
- **Status:** PASS
- Evidence: schema + writer runtime assignment in `/Users/tyler/nexus/home/projects/nexus/nex/src/db/memory.ts` and `/Users/tyler/nexus/home/projects/nexus/nex/src/agents/tools/memory-writer-tools.ts`.

2. Contact seeding in live + backfill
- **Status:** PASS
- Evidence: `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/identity.ts`, `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/stages/resolveIdentity.ts`, `/Users/tyler/nexus/home/projects/nexus/nex/src/cli/memory-backfill-cli.ts`.

3. IAM sender taxonomy (`match.sender`) hard cutover
- **Status:** PASS

4. Single-path IAM/tool enforcement (no secondary filter layers)
- **Status:** PARTIAL
- Evidence: control-plane role gate consolidation is done.
- Gap: `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/tool-invoke.ts` still applies runtime tool-policy filtering after ACL envelope.

5. Remove manual retain access injection helper
- **Status:** FAIL
- Evidence: `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-access.ts` still manually sets sender/receiver + calls `resolveAccessStage` for internal retain/consolidate requests.

---

## 3. Execution Plan (Remaining Work Only)

## Phase 1: Consolidation End-State Hard Cut

1. Replace runtime JSON action protocol with tool-backed consolidator writes.
- Remove JSON action parsing/persistence contract from `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/consolidation.ts`.
- Make consolidator meeseeks use explicit tools for create/update observation, causal links, merge proposals.
- Keep one episode batch invocation unit.

2. Delete dead legacy consolidation fallback path.
- Remove `kickConsolidation` and per-fact fallback loop from `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/consolidation.ts`.
- Keep only episode-native batch entrypoint used by hook flow.

3. Validation for Phase 1.
- Unit: consolidation tests assert tool-backed persistence path only.
- Runtime: per episode, single consolidator hook invocation row, no duplicate observation run for same `observation_v1 + episode_id`.

## Phase 2: IAM End-State Completion

1. Remove secondary runtime policy compile/filter from `tools.invoke`.
- In `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/tool-invoke.ts`, enforce only canonical ACL envelope for permission decision.
- Tool discovery remains from canonical tool registry.

2. Remove manual retain access helper path.
- Delete `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-access.ts`.
- Route retain/consolidate request authorization through canonical request assembly + IAM path.

3. Validation for Phase 2.
- IAM conformance + control-plane/tool-invoke tests pass.
- Live/backfill retain and consolidate still receive required tool permissions under canonical envelope.

## Phase 3: Track 0 Completion (Model/Thinking/Reasoning)

1. Hook config -> ingress metadata mapping.
- Wire `hook.config_json.agent.model/thinking/reasoning_mode` into derived request metadata.

2. Ingress -> run options.
- Extend ingress parser and run option types with reasoning mode + model override.

3. Usage/telemetry reasoning flow.
- Extend usage normalization + accumulators with reasoning metrics.
- Persist `turns.reasoning_tokens` from actual provider/runtime usage.
- Persist export-safe reasoning summaries into `messages.thinking` when available.

4. Seeder defaults.
- Add memory writer/consolidator hook `config_json` defaults with model/thinking values.

5. Validation for Phase 3.
- Unit tests for parsing + option mapping + usage normalization.
- Runtime query confirms per-hook config visible in `effective_config_json` and non-zero reasoning where returned.

## Phase 4: Track 2 Phase B + Track 3

1. Track 2 Phase B.
- Add `attachment_interpretations` table and schema bootstrap.
- Add runtime/tool path to write interpretation text with runtime-filled metadata fields.

2. Track 3 recall extension.
- Extend recall schema with `thread_id`, `thread_lookback_events`.
- Implement backend lookback behavior and retain/consolidate defaults from run context.

3. Validation for Phase 4.
- New unit tests for attachment interpretation persistence.
- Recall tests for explicit + implicit thread lookback paths.
- Regression: recall unchanged when thread params absent.

## Phase 5: Validation Harness Hardening + Full Ladder

1. Pin Stage A execution context to project root robustly to avoid caller-CWD bleed.
2. Run full ladder in isolated state dir from fresh baseline.
3. Review quality buckets and sample outputs after clean run.

---

## 4. Acceptance Gates (must all pass)

1. Consolidator persistence is tool-backed only; no JSON action parser path remains.
2. No manual retain access helper remains; retain/consolidate auth uses canonical IAM path.
3. `tools.invoke` does not apply independent runtime policy compilation/filter after ACL decision.
4. Track 0 wiring complete: per-hook model/thinking/reasoning config and reasoning telemetry persisted.
5. Track 2 Phase B complete: interpretation table + writes + reads.
6. Track 3 complete: recall thread lookback fields and behavior.
7. Full validation ladder passes in isolated state with clean run IDs and zero retain/consolidate hook errors.

---

## 5. Execution TODO (Ordered)

1. Consolidation end-state hard cut (Phase 1).
2. IAM end-state completion (Phase 2).
3. Track 0 completion (Phase 3).
4. Track 2 Phase B + Track 3 (Phase 4).
5. Validation harness hardening + full clean ladder run (Phase 5).

No premature optimization and no backward-compatibility branches in this slice.
