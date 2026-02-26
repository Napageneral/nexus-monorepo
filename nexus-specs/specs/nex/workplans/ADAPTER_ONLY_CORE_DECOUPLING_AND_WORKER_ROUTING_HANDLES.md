# Adapter-Only Core Decoupling And Worker Routing Handles

**Status:** Plan (Hard Cutover)
**Last Updated:** 2026-02-25

---

## 1. Customer Experience First

This cutover is successful when users experience:

1. Manager can always route a follow-up back to the same worker without guessing internal session IDs.
2. Worker routing is deterministic and auditable across restarts.
3. Core runtime has no provider-specific behavior branches for WhatsApp/Discord/Slack/iMessage/Gmail.
4. Provider behavior lives in adapters; core only understands generic platform/account/container semantics.
5. No compatibility shim or fallback mode remains.
6. Event->session resolution uses symmetric sender/receiver entity identity and does not depend on provider-specific fallbacks.

---

## 2. Research Findings

### 2.1 `session_aliases` is not powering worker return routing

Worker return routing is already driven by worker/session dispatch metadata, not alias table lookup.

Evidence in code:

1. Worker dispatch creates `worker:` session labels and returns `dispatch_id` + `spawned_session_label`.
   - `src/nex/stages/runAgent.ts` lines around 2307-2466
2. Worker follow-up resolution uses:
   - in-memory tool call map (`spawned_session`)
   - `sessions.spawn_tool_call_id`
   - `tool_calls.spawned_session_label`
   - `src/nex/stages/runAgent.ts` lines around 2770-2838
3. Subagent registry stores stable per-run `childSessionKey` and supports `/subagents send <id|#> ...`.
   - `src/agents/subagent-registry.ts`
   - `src/reply/reply/commands-subagents.ts`

### 2.2 `session_aliases` is currently schema + test residue

1. Table remains in schema (`src/db/agents.ts`), but there are no non-test runtime query/writes found.
2. Runtime session resolver is canonical label only.
   - `src/nex/session.ts`

### 2.3 Provider-specific core coupling still exists

Non-test references for `whatsapp|discord|slack|imessage|gmail` remain in core runtime/control/config/reply/security layers.

Primary coupling zones:

1. `src/config/*` (provider schemas/types/legacy migrations)
2. `src/security/*` (provider-specific audit/fix logic)
3. `src/reply/*` (provider-specific auth/allowlist/threading branches)
4. `src/infra/outbound/*` (provider-specific channel parsing/target behavior)
5. `src/hooks/gmail*` + control-plane reload hooks
6. `src/channels/registry.ts` legacy static provider catalog

---

## 3. Locked Decisions

1. `session_aliases` is removed from runtime routing semantics.
2. Manager-to-worker re-routing uses explicit worker handles (dispatch/run/session), not alias indirection.
3. Provider-specific behavior is forbidden in core runtime paths.
4. No backward-compatibility layer for removed core provider branches.
5. `session_continuity_transfers` is retained for continuity/audit, not lookup aliasing.
6. Human-readable worker targeting is handled by explicit worker labels/dispatch ids/run ids returned by runtime.

---

## 4. Worker Routing Handle Model

### 4.1 Canonical worker addressing

Accepted worker targets for manager->worker follow-up:

1. `worker:{session_label}` (existing canonical)
2. `dispatch:{dispatch_id}`
3. `run:{worker_run_id}`

Resolution order:

1. `dispatch:` -> resolve via `sessions.spawn_tool_call_id` then `tool_calls.spawned_session_label`
2. `run:` -> resolve via subagent registry (`runId -> childSessionKey`)
3. `worker:` -> direct session label

### 4.2 Explicit non-goals

1. No `session_aliases` lookup in this flow.
2. No fuzzy/main/suffix compatibility session matching.
3. No hidden remapping from generic manager labels to worker sessions.

---

## 5. Provider Core Purge Scope

Hard-cut remove provider-specific branches for:

1. `whatsapp`
2. `discord`
3. `slack`
4. `imessage`
5. `gmail` (legacy hook watcher/runtime control-plane coupling)

Core behavior after purge:

1. Generic platform/account/container/session handling only.
2. Adapter manager and adapter protocol are the only ingress/egress provider boundary in runtime core.
3. Provider-specific threading/allowlist/security heuristics move behind channel docks or adapter plugins.

Out of scope for this pass:

1. Provider mention strings in docs/comments/examples/tests.
2. Adapter extension implementation details under `extensions/**`.
3. Legacy config shape references required only for config parsing compatibility tests (to be handled in a separate schema hard-cut pass).

---

## 6. Implementation Phases

### Phase A: Worker handle resolver

1. Add worker-target resolver helper in core runtime.
2. Update manager follow-up paths to accept `dispatch:` and `run:` handles.
3. Keep existing `worker:` session label path.

### Phase B: Remove `session_aliases` runtime residue

1. Drop schema table from agents ledger schema.
2. Remove alias-focused tests/guardrails.
3. Keep continuity transfer semantics (`session_continuity_transfers`) unchanged.

### Phase C: Provider-specific core purge

1. Delete provider-specific branches in `security`, `reply`, `infra/outbound`, `hooks`, `channels/registry`, and control-plane reload hooks.
2. Remove provider-specific config/type/schema surfaces from core where replaced by adapter-defined config.
3. Remove legacy migration logic for removed provider config keys.
4. Replace removed branching with adapter capability hooks where needed (threading policy, target normalization, auth normalization).

### Phase D: Validation

1. `pnpm -s tsc --noEmit`
2. Targeted runtime/control-plane/reply/security tests for touched files
3. Grep invariant checks:
   - No non-test core references to removed provider names outside adapters/extensions.
   - No non-test runtime use of `session_aliases`.

---

## 7. Acceptance Criteria

1. Manager can route follow-up to prior worker via `dispatch:` or `run:` without alias lookup.
2. `session_aliases` removed from runtime schema and runtime behavior.
3. `session_continuity_transfers` remains as continuity audit trail.
4. Core runtime/control/reply/security/outbound paths have no hard-coded provider branches for WhatsApp/Discord/Slack/iMessage/Gmail.
5. Build/typecheck passes.
6. Runtime grep invariant: no non-test direct behavior branch on `whatsapp|discord|slack|imessage|gmail` in targeted core execution modules.

---

## 8. Risks

1. Removing provider config/types may break CLI/config UX paths still tied to `channels.*`.
2. Security audit output may lose provider-specific diagnostics unless replaced with adapter capability-driven diagnostics.
3. Legacy tests asserting provider-specific behavior require hard-cut rewrite or removal.
