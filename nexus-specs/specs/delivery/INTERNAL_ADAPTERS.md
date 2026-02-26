# Internal Adapters

**Status:** ACTIVE  
**Last Updated:** 2026-02-26  
**Related:** `ADAPTER_SYSTEM.md`, `../nex/ADAPTER_INTERFACE_UNIFICATION.md`, `../nex/UNIFIED_RUNTIME_OPERATION_MODEL.md`

---

## Canonical Position

Internal adapters use the same interface and operation set as every other adapter.

There is no separate internal adapter role taxonomy.

---

## Bundled Internal Adapters

1. `control.ws`
2. `control.http`
3. `ingress.http`
4. `clock`

All four mount operations through the same operation registry + IAM + audit lifecycle.

---

## Clock Ownership

Clock is the canonical scheduler/time source:

1. emits tick ingress via `event.ingest`
2. manages schedules via `clock.schedule.*`

Legacy cron operations are removed.

---

## Invariants

1. Internal adapters must not bypass operation registry dispatch.
2. Internal adapters must not bypass principal resolution/IAM/audit.
3. Internal adapters must follow ingress integrity field-stamping rules.

