# Built-in Adapters

**Status:** DESIGN + IMPLEMENTATION TRACKER  
**Last Updated:** 2026-02-26  
**Related:** `../ADAPTER_SYSTEM.md`, `../INTERNAL_ADAPTERS.md`, `../../nex/ADAPTER_INTERFACE_UNIFICATION.md`, `../../nex/UNIFIED_RUNTIME_OPERATION_MODEL.md`

---

## Canonical Boundary

Built-in adapters are first-class adapters under the same interface/SDK contract.

No internal adapter-role taxonomy is canonical.

---

## Built-in Inventory

1. `control.ws`  
   WS/RPC runtime operation mount.
2. `control.http`  
   HTTP runtime operation mount.
3. `ingress.http`  
   HTTP ingress operation mount (webhooks, OpenAI compat, OpenResponses compat, webchat session ingress).
4. `clock`  
   Tick ingress + schedule operations.

---

## Operation Ownership

### `control.ws` / `control.http`

Own runtime management operations (config/sessions/agents/acl/apps/etc), plus event ingress invocation operations.

### `ingress.http`

Owns ingress protocol normalization into runtime operations:

1. `event.ingest`
2. `event.backfill` (if enabled by bridge/module)

### `clock`

Owns:

1. periodic tick ingress (`event.ingest`, metadata type `clock.tick`)
2. schedule lifecycle (`clock.schedule.*`)

Legacy `cron.*` and `wake` are removed by hard cutover.

---

## Acceptance Criteria

1. Built-ins are reported as adapters in runtime status/health.
2. Built-ins dispatch through one operation registry + IAM/audit lifecycle.
3. `clock.schedule.*` is present and tested.
4. `cron.*` and `wake` are absent from active runtime operations.

