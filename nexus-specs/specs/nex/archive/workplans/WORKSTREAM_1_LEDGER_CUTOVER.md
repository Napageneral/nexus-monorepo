# Workstream 1 Handoff: Broker Ledger-Only Cutover

**Status:** LOCKED FOR IMPLEMENTATION  
**Last Updated:** 2026-02-12  
**Related:** `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/runtime/ui/COMMAND_CENTER.md`
**Related:** `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/data/ledgers/AGENTS_LEDGER.md`
**Incorporates:** formerly separate `WORKSTREAM_1_BROKER_HARDENING.md` addendum

---

## Objective

Complete a hard cutover from file/session-store runtime behavior to ledger-only runtime behavior for broker session and turn execution.

Core intent:
1. No runtime fallback to transcript files or `sessions.json` for source-of-truth behavior.
2. Session state is pointer/provenance only.
3. Turn-level writes capture effective execution configuration and execution facts.
4. Command Center reads the same unified ledger plane that native NEX and AIX imports write to.

---

## Locked Decisions

1. **No sticky session-level behavior overrides.**  
   Session behavior is configured per turn, inherited from parent turn unless explicitly changed.

2. **IAM is the policy authority.**  
   Legacy session knobs (`sendPolicy`, `groupActivation`, etc.) are replaced by IAM/routing decisions.

3. **Queue behavior is broker-scoped.**  
   No session-level queue override persistence.

4. **Compaction is ledger-native only.**  
   Compaction is represented as turns + compactions rows; no transcript mutation path.

5. **Session metrics are thread-derived.**  
   Session points to thread head; counters are derived/materialized from turn/thread data.

6. **Alias-based identity promotion is required.**  
   Session aliases preserve continuity across identity promotion and imports.

---

## Final Review Confirmations (2026-02-12)

These were explicitly accepted and are now part of the locked contract:

1. Current mapping/cutover approach is approved for implementation and validation.
2. `turns.effective_config_json` remains compact JSON for now (parse-out can be deferred).
3. Proposed alias/import/lineage handling in this spec is approved and locked.

---

## SessionEntry Migration Contract

This section defines how legacy `SessionEntry`-style data maps into ledger writes.

### A. Keep at Session Level

1. Session key/canonical key -> `sessions.label`
2. Parent subagent linkage -> `sessions.parent_session_label`, `sessions.parent_turn_id`, `sessions.spawn_tool_call_id`
3. Provenance -> `sessions.origin`, `sessions.origin_session_id`
4. Pointer update time -> `sessions.updated_at`

### B. Write at Turn Level (effective config + execution)

1. Model/provider used -> `turns.model`, `turns.provider`
2. Toolset and IAM permissions granted -> `turns.toolset_name`, `turns.tools_available`, `turns.permissions_granted`
3. Permissions actually exercised -> `turns.permissions_used`
4. Token usage -> `turns.input_tokens`, `turns.output_tokens`, `turns.cached_input_tokens`, `turns.cache_write_tokens`, `turns.reasoning_tokens`, `turns.total_tokens`
5. Turn-local config snapshot (resolved values) -> `turns.effective_config_json` (new column)

### C. Write at Message Level

1. Delivery/source context and routing metadata -> `messages.metadata_json`
2. Optional context payload snapshot -> `messages.context_json`
3. Thinking/tool output content -> `messages.thinking` and `tool_calls.result_json`

### D. Derived or Removed

1. Legacy file fields (`sessionFile`, transcript paths) -> removed from runtime source-of-truth
2. Session-level counters (`compactionCount`, memory flush counters) -> derived from thread/compaction history
3. Legacy session policy fields (`sendPolicy`, `groupActivation`, `groupActivationNeedsSystemIntro`) -> replaced by IAM/pipeline behavior
4. Session-level queue fields (`queueMode`, `queueDebounceMs`, `queueCap`, `queueDrop`) -> broker queue config only

---

## Turn Write Contract

For every broker run:
1. Resolve canonical session key (with alias lookup).
2. Resolve parent turn from session head.
3. Compute effective turn config:
   - global defaults
   - inherited parent turn config
   - explicit per-turn directives
   - IAM constraints
4. Insert pending turn row.
5. Insert user message with request metadata.
6. Insert assistant message(s) and tool calls/results.
7. Finalize turn status and usage fields.
8. Upsert thread ancestry/totals.
9. Move session pointer (`sessions.thread_id`) and append `session_history`.

Transactional requirement:
1. Steps 4-9 are persisted in one transactional unit (savepoint/transaction), or fail as a unit.

---

## Alias Minting and Resolution

Resolution order:
1. Direct session key lookup.
2. Alias lookup in `session_aliases`.
3. Create new session if unresolved.

Alias minting rules:
1. Mint alias on identity promotion (channel-based key -> canonical entity key).
2. Mint alias on import reconciliation when source/native keys differ but should resolve to same canonical session.
3. Alias target must always be a canonical session key (no alias chains).
4. For merge candidate selection:
   - prefer session with larger `session_history` depth
   - tie-break by latest `sessions.updated_at`
5. Keep historical sessions; do not merge turn trees destructively.

---

## `sessions.import` Conflict Policy

Request idempotency:
1. Request-level `idempotencyKey` dedupes full request replay.
2. Item-level uniqueness key: `(source, source_provider, source_session_id)`.

Per-item outcomes:
1. Same source tuple + same fingerprint -> `skipped`
2. Same source tuple + changed fingerprint -> `upserted`
3. Unknown source tuple -> `imported`
4. Invalid payload/linkage -> `failed` with reason

Collision policy:
1. Non-unique label hints never overwrite canonical session keys.
2. Deterministic canonical labels remain stable across retries.
3. Parent/child linkage is repaired in a second pass within the same import operation where needed.

---

## Thread-Level Metrics Contract

Thread is the metrics surface. Session only points to thread head.

Track/materialize on thread (or derive from turn ancestry):
1. cumulative token totals
2. depth/ancestry
3. compaction lineage and counts
4. latest model/provider snapshot (optional denormalization)

Session-level metric duplication is intentionally avoided.

---

## Out of Scope

1. Multi-select context injection UX
2. Desktop app packaging
3. RAG/indexing additions
4. Legacy file-store compatibility paths

---

## Acceptance Criteria

1. Native broker runs write complete turn/thread/session lineage to Agents Ledger without transcript fallback.
2. Effective turn config is persisted per turn and can be reconstructed from ledger alone.
3. IAM-derived permissions and actually-used permissions are both persisted per turn.
4. Session alias promotion and import reconciliation resolve to stable canonical sessions.
5. `sessions.import` behavior is idempotent with deterministic `imported/upserted/skipped/failed` outcomes.
6. Command Center can read session continuity from ledger-only semantics.
7. Heartbeat subsystem and controls are removed from runtime, control plane, cron coupling, and web monitor paths.
8. Duplicate inbound events do not trigger duplicate pipeline behavior.
9. Duplicate handling is observable with explicit trace semantics.
10. A single canonical session resolver is used by pipeline, control plane, and import.
11. Delivery target handling remains functional without heartbeat-specific wrappers.

---

## Broker Hardening (Pre-Command Center)

The following hardening constraints tighten broker behavior before Command Center implementation. These are additive to the ledger cutover above.

### Heartbeat Removal

The heartbeat subsystem is **removed root-and-stem** — no migration shim, no runtime fallback, no partial retention. Hooks/automations replace heartbeat wake and heartbeat message pipelines. Equivalent observability is emitted through hooks/automation telemetry, not heartbeat event channels.

Remove:
1. Heartbeat scheduler/wake/event APIs and controls.
2. Heartbeat token behavior, heartbeat visibility config, heartbeat delivery wrappers.
3. Heartbeat-driven cron wake modes and hook wake modes tied to heartbeat semantics.
4. Web heartbeat runner and heartbeat-specific channel hooks.

Keep (only if still needed outside heartbeat):
1. Generic outbound targeting utility (`resolveOutboundTarget`) for delivery paths.
2. Any generic coalescing primitive only if explicitly reused by hooks runtime; otherwise delete.

### Orchestration-Boundary Dedupe

For inbound duplicates identified by `(source, source_id)`:
1. Do not run full pipeline side effects again.
2. Do not produce duplicate agent turns or duplicate outbound delivery.
3. Record an explicit duplicate/drop outcome for observability.

Implementation contract:
1. Receive stage must surface duplicate detection outcome (not just rely on SQL no-op).
2. Pipeline must short-circuit downstream stages for duplicates.
3. Duplicate short-circuit status must be visible in request trace/event telemetry.

### Canonical Session Resolver

Broker-owned shared resolver module in NEX core (not control-plane-only, not import-only).

Consumers:
1. Pipeline stages (primary source for runtime turn/session writes)
2. Control plane session methods (resolve/list/preview/path operations)
3. Import ingestion (`sessions.import` reconciliation)

Required behavior:
1. Canonical direct lookup
2. Alias lookup
3. Deterministic suffix disambiguation policy
4. Identity promotion alias minting
5. Canonical label return for all callers

No resolver behavior should depend on transcript/session-store files.

### Delivery Target Handling (Post-Heartbeat)

Keep delivery target logic generic and explicit in broker delivery path. Remove heartbeat-specific target wrapper helpers with heartbeat deletion. Any shared targeting utility retained must be heartbeat-agnostic.

### Hardening Rollout Order

1. Implement orchestration dedupe short-circuit first (safety guard).
2. Centralize session resolver and switch call sites.
3. Remove heartbeat subsystem and wake coupling.
4. Validate control plane + import + pipeline compatibility under resolver unification.
