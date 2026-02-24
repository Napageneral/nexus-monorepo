# Workstream 1 Addendum: Broker Hardening (Pre-Command Center)

**Status:** LOCKED FOR IMPLEMENTATION  
**Last Updated:** 2026-02-12  
**Related:** `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/runtime/ui/WORKSTREAM_1_LEDGER_CUTOVER.md`  
**Related:** `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/runtime/ui/COMMAND_CENTER.md`

---

## Objective

Lock the remaining broker hardening decisions required before Command Center implementation proceeds:

1. Remove heartbeat pipeline root-and-stem (replace with hooks/automations architecture).
2. Enforce orchestration-boundary dedupe so duplicate inbound events do not re-run full pipeline behavior.
3. Centralize canonical session resolution into one broker-owned resolver used across pipeline, gateway, and import.
4. Keep delivery target resolution generic and decoupled from removed heartbeat behavior.

---

## Locked Decisions

1. **Heartbeat subsystem is removed root-and-stem.**  
   No migration shim, no runtime fallback, no partial retention of heartbeat behavior.

2. **Hooks/automations replace heartbeat wake and heartbeat message pipelines.**  
   Legacy heartbeat-specific prompts/tokens/events are removed.

3. **Duplicate inbound events must not re-trigger business behavior.**  
   Events uniqueness in ledger is not sufficient by itself; orchestration must short-circuit duplicate processing.

4. **Canonical session resolution is broker-owned and shared.**  
   No parallel resolver logic in gateway methods/import/pipeline stages.

5. **Generic outbound target resolution remains a shared utility.**  
   Heartbeat-specific wrappers are removed with heartbeat deletion.

---

## Current Behavior Snapshot (Why this addendum exists)

### A. Heartbeat coupling

Current heartbeat logic spans multiple runtime surfaces (`infra`, `gateway`, `cron`, `web`) and includes:

1. Scheduler + wake coalescing
2. HEARTBEAT token-specific response normalization
3. Heartbeat-only routing and sender resolution
4. Heartbeat-only status/event emission
5. Heartbeat-only config and RPC controls

This is incompatible with the clean-slate hooks/automations direction.

### B. Duplicate inbound behavior gap

Current `events` insert is idempotent at storage level (`UNIQUE(source, source_id)` with conflict ignore), but duplicate events can still execute pipeline stages because:

1. Receive stage does not currently branch on duplicate insert outcome.
2. Pipeline execution continues after no-op event insert.
3. Durable queue insert conflict does not prevent in-memory enqueue/execution.

Result: duplicate behavior is still possible even when event row is deduped.

### C. Resolver fragmentation

Session resolution logic currently exists in multiple places with overlapping but non-identical rules:

1. NEX session resolver
2. Gateway sessions resolve path
3. Gateway session methods local helpers
4. Import reconciliation logic
5. Legacy session-store-based resolver paths

This creates drift risk for aliases, suffix resolution, and canonical label continuity.

---

## Target Architecture

## 1) Heartbeat Removal

### Remove

1. Heartbeat scheduler/wake/event APIs and controls.
2. Heartbeat token behavior, heartbeat visibility config, heartbeat delivery wrappers.
3. Heartbeat-driven cron wake modes and hook wake modes tied to heartbeat semantics.
4. Web heartbeat runner and heartbeat-specific channel hooks.

### Keep (only if still needed outside heartbeat)

1. Generic outbound targeting utility (`resolveOutboundTarget`) for delivery paths.
2. Any generic coalescing primitive only if explicitly reused by hooks runtime; otherwise delete.

### Replacement

1. Hooks/automations trigger and execution lifecycle becomes the only proactive path.
2. Equivalent observability should be emitted through hooks/automation telemetry, not heartbeat event channels.

---

## 2) Orchestration-Boundary Dedupe

### Required behavior

For inbound duplicates identified by `(source, source_id)`:

1. Do not run full pipeline side effects again.
2. Do not produce duplicate agent turns or duplicate outbound delivery.
3. Record an explicit duplicate/drop outcome for observability.

### Implementation contract

1. Receive stage must surface duplicate detection outcome (not just rely on SQL no-op).
2. Pipeline must short-circuit downstream stages for duplicates.
3. Duplicate short-circuit status must be visible in request trace/event telemetry.

### Status semantics

Allowed implementation choices:

1. Add explicit request status for duplicate/drop path, or
2. Reuse a non-error terminal status with a clear `exit_reason`/trace marker.

Constraint: duplicate path must be unambiguous in diagnostics and queryable.

---

## 3) Canonical Session Resolver

### Placement

Broker-owned shared resolver module in NEX core (not gateway-only, not import-only).

### Consumers

1. Pipeline stages (primary source for runtime turn/session writes)
2. Gateway session methods (resolve/list/preview/path operations)
3. Import ingestion (`sessions.import` reconciliation)

### Required behavior

1. Canonical direct lookup
2. Alias lookup
3. Deterministic suffix disambiguation policy
4. Identity promotion alias minting
5. Canonical label return for all callers

### Non-goal

No resolver behavior should depend on transcript/session-store files.

---

## 4) Delivery Target Handling (Post-heartbeat)

### Clarification

In NEX pipeline delivery, outbound adapter routing currently resolves by channel/account context from delivery metadata, not through heartbeat-specific target wrappers.

### Decision

1. Keep delivery target logic generic and explicit in broker delivery path.
2. Remove heartbeat-specific target wrapper helpers with heartbeat deletion.
3. Any shared targeting utility retained must be heartbeat-agnostic.

---

## Acceptance Criteria

1. Heartbeat subsystem and controls are removed from runtime, gateway, cron coupling, and web monitor paths.
2. Duplicate inbound events do not trigger duplicate pipeline behavior.
3. Duplicate handling is observable with explicit trace semantics.
4. A single canonical session resolver is used by pipeline, gateway, and import.
5. Delivery target handling remains functional without heartbeat-specific wrappers.
6. No transcript/session-store fallback is introduced while implementing this addendum.

---

## Rollout Order

1. Implement orchestration dedupe short-circuit first (safety guard).
2. Centralize session resolver and switch call sites.
3. Remove heartbeat subsystem and wake coupling.
4. Validate gateway + import + pipeline compatibility under resolver unification.

---

## Notes for Execution

1. This addendum intentionally tightens behavior before Command Center work to avoid building UI on unstable broker semantics.
2. Workstream 1 ledger cutover rules remain fully in force; this document adds hardening constraints, not alternate data model rules.
