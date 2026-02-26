# Adapter System

**Status:** DESIGN SPEC (aligned)  
**Last Updated:** 2026-02-26  
**Related:** `../nex/UNIFIED_RUNTIME_OPERATION_MODEL.md`, `../nex/ADAPTER_INTERFACE_UNIFICATION.md`, `INTERNAL_ADAPTERS.md`, `contract/adapter-protocol.schema.json`

---

## 1. Canonical Model

Nexus uses one adapter model:

1. one adapter interface
2. one operation set
3. one SDK contract

Adapters are operation mounts, not role-typed products.

---

## 2. Interface Contract

```ts
interface NexusAdapter {
  id: string;
  transport: "ws" | "http" | "internal" | "adapter-cli";
  operations(): RuntimeOperationDef[];
  operationFor(operation: string): RuntimeOperationDef | null;
  handle(request: RuntimeOperationRequest): Promise<RuntimeOperationResult>;
}
```

Operation `mode` (`protocol|sync|event`) is metadata on operations, not adapter taxonomy.

---

## 3. Operation Coverage

Runtime operation families include:

1. protocol operations (`connect`, `auth.login`)
2. runtime management operations (`config.*`, `sessions.*`, `agents.*`, `acl.*`, etc)
3. event operations (`event.ingest`, `event.backfill`)
4. adapter capability operations (`adapter.info`, `adapter.health`, `adapter.accounts.list`, `delivery.send`, `delivery.stream`, etc)
5. clock scheduling operations (`clock.schedule.*`)

---

## 4. External Adapter CLI Bridge

External adapters may still execute with CLI verbs, but those verbs map to runtime operations:

1. `info` -> `adapter.info`
2. `monitor` -> event operation producer (`event.ingest`)
3. `backfill` -> event operation producer (`event.backfill`)
4. `send` -> `delivery.send`
5. `stream` -> `delivery.stream`
6. `health` -> `adapter.health`
7. `accounts` -> `adapter.accounts.list`

This bridge is transport-level compatibility, not a second architecture.

---

## 5. Hard Cutover Rules

1. No dual adapter-role docs or code paths.
2. No parallel operation taxonomies.
3. No `cron.*`/`wake` operation surface; scheduling is `clock.schedule.*`.
4. No hidden bypasses around IAM/audit lifecycle.

