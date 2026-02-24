# Delivery Resolution + Adapter Implementation Update

**Status:** IMPLEMENTED (runtime/code complete)  
**Last Updated:** 2026-02-24  
**Scope:** NEX runtime adapter core + receiver resolution + delivery identity history

**Related specs:**
- `../UNIFIED_DELIVERY_TAXONOMY.md`
- `../UNIFIED_DELIVERY_TAXONOMY_WORKPLAN.md`
- `../RUNTIME_ROUTING.md`
- `../DELIVERY_DIRECTORY_SCHEMA.md`
- `../adapters/ADAPTER_SYSTEM.md`
- `../adapters/ADAPTER_INTERFACES.md`

---

## Summary

This update captures the concrete implementation and validation completed in `nex` for:

1. Sender name history persistence in `identity.db`
2. Receiver resolution using the same contact/identity system as sender resolution
3. Removal of implicit `atlas` receiver fallback (non-escalating unresolved behavior)
4. Runtime-orchestrated adapter backfill wiring
5. Adapter-core `channel -> platform` cutover (strict delivery taxonomy naming in adapter runtime surfaces)

---

## Implemented Changes

### 1) Sender Name History (contacts)

Implemented a dedicated history table for sender display names:

```sql
contact_name_observations(
  platform,
  space_id,
  sender_id,
  observed_name,
  first_seen,
  last_seen,
  seen_count
)
```

Behavior:
- On `upsertContact(...)`, name observations are upserted and counted.
- On `ensureContactMapping(...)`, name observations are also upserted.
- Current `contacts.sender_name` remains the latest best-effort value.
- History table preserves rename timeline and frequency.

Primary code:
- `src/db/identity.ts`
- `src/iam/identity.test.ts`

---

### 2) Sender/Receiver Symmetry in Delivery Context

Added receiver delivery fields:
- `delivery.receiver_id`
- `delivery.receiver_name`

Receiver stage now resolves through contact lookup using the same identity store primitives as sender-side resolution.

Primary code:
- `src/nex/request.ts`
- `src/nex/stages/resolveReceiver.ts`
- `src/nex/stages/resolveReceiver.test.ts`
- `src/nex/adapters/protocol.ts`

---

### 3) Receiver Safety: No Implicit Persona Escalation

Removed default persona fallback in receiver stage:
- Old behavior: unresolved message receiver -> `persona: atlas`
- New behavior: unresolved receiver -> `receiver.type = "unknown"`

System/tool/control ingress still maps to system receiver paths as designed.

Impact:
- Unknown receiver does not implicitly escalate into persona execution.
- Persona execution remains gated by explicit persona resolution.

Primary code:
- `src/nex/stages/resolveReceiver.ts`
- `src/nex/stages/resolveReceiver.test.ts`

---

### 4) Runtime-Orchestrated Backfill Wiring

`NEX.startMonitorsFromConfig(...)` now launches adapter backfill when account config sets `backfill: true`.

Behavior:
- Backfill events are processed via `this.processEvent(event)` (same pipeline path as live monitor ingress).
- Supports optional `backfill_since` in account config.
- Returns explicit telemetry:
  - `backfill_started`
  - `backfill_skipped`

Primary code:
- `src/nex/nex.ts`
- `src/nex/nex.monitor-bootstrap.test.ts`
- `src/nex/runtime.test.ts`

---

### 5) Adapter-Core `channel -> platform` Cutover

Converted adapter runtime/core types and contracts to `platform` naming:

- Adapter bootstrap config requires `platform` (legacy `channel` rejected in this surface)
- Adapter protocol `info` now uses:
  - `platform`
  - `platform_capabilities`
- Runtime context file uses `platform`
- Adapter state/supervision model uses `platform`
- Manager APIs renamed:
  - `getActivePlatforms()`
  - `getPlatformCapabilities()`

Also tightened stream target handling:
- `stream_start.target.channel` is rejected
- `stream_start.target.platform` is required path

Primary code:
- `src/nex/adapters/config.ts`
- `src/nex/adapters/protocol.ts`
- `src/nex/adapters/runtime-context.ts`
- `src/nex/adapters/adapter-state-db.ts`
- `src/nex/adapters/supervision.ts`
- `src/nex/adapters/manager.ts`
- `src/nex/stages/assembleContext.ts`
- `src/nex/control-plane/server.nex-http.e2e.test.ts`

---

## Validation Executed

The following validation passed after implementation:

- `pnpm tsc --noEmit`
- targeted unit/integration suite (adapter core + identity + receiver + runtime bootstrap)
- e2e adapter fixture check:
  - `pnpm vitest run --config vitest.e2e.config.ts src/nex/control-plane/server.nex-http.e2e.test.ts`

All executed test groups passed for changed surfaces.

---

## Explicitly Out of Scope in This Update

- Full control-plane API language migration away from legacy `channel` request params
- Non-adapter subsystems still carrying compatibility aliases
- Memory-system-specific follow-on changes (handled separately)

---

## Next Recommended Follow-up

1. Complete remaining control-plane `channel` alias removal in RPC request models and method handlers.
2. Require adapters to emit `delivery.receiver_id` for deterministic multi-persona receiver mapping.
3. Add conformance tests that fail on any adapter output containing legacy sender/receiver shape deviations.

