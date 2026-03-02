# Runtime Surfaces

**Status:** ACTIVE (aligned to unified operation model)  
**Last Updated:** 2026-02-26  
**Related:** `UNIFIED_RUNTIME_OPERATION_MODEL.md`, `ADAPTER_INTERFACE_UNIFICATION.md`, `ingress/CONTROL_PLANE_AUTHZ_TAXONOMY.md`, `../delivery/INTERNAL_ADAPTERS.md`

---

## 1. Canonical Position

Runtime surfaces are adapter mounts over one operation registry.

1. one operation model
2. one adapter interface
3. one IAM/audit lifecycle

There is no canonical dual-adapter-role split in this document.

---

## 2. Universal Lifecycle

All runtime operations follow the same lifecycle:

1. `receiveOperation`
2. `resolvePrincipals` (AuthN + sender/receiver resolution)
3. `resolveAccess` (IAM/AuthZ)
4. `operation.preExecute` (audit + hooks + bus)
5. `executeOperation`
6. `operation.postExecute` (audit + hooks + bus)
7. `finalizeJournal`

`runAgent` is an internal runtime capability invoked by operation handlers or automations.

---

## 3. Operation Execution Modes

Execution mode is operation metadata, not adapter-role metadata:

1. `protocol`: transport/session mechanics
2. `sync`: synchronous runtime operation handler
3. `event`: normalize to canonical `NexusEvent` and run `nex.processEvent(...)`

---

## 4. Runtime Adapter Inventory (Current Target)

Bundled/internal:

1. `control.ws`
2. `control.http`
3. `ingress.http`
4. `clock`

External:

1. `discord`
2. `telegram`
3. `whatsapp`
4. `eve`
5. `gogcli`
6. future adapters

All of the above use the same operation contract.

---

## 5. Listener Topology

Two listeners are allowed for trust-boundary isolation:

1. control listener
2. ingress listener

Both listeners dispatch through the same operation registry and IAM/audit path.

---

## 6. Clock and Scheduling

Clock owns time-based runtime behavior:

1. periodic tick ingress (`event.ingest`)
2. schedule management (`clock.schedule.*`)

Legacy `cron.*` and `wake` are non-canonical and removed by hard cutover.

