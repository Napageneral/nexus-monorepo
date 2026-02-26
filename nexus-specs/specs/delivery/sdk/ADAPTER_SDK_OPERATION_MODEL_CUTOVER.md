# Adapter SDK Operation-Model Cutover

**Status:** IN PROGRESS  
**Last Updated:** 2026-02-26  
**Mode:** Hard cutover (no backwards compatibility)  
**Related:** `../../nex/ADAPTER_INTERFACE_UNIFICATION.md`, `../../nex/UNIFIED_RUNTIME_OPERATION_MODEL.md`, `../../nex/RUNTIME_SURFACES.md`, `../ADAPTER_SYSTEM.md`

---

## 1. Customer Experience First

Adapter authors should see one simple model:

1. One adapter interface (`NexusAdapter`) in runtime.
2. One runtime operation registry (`runtime-operations.ts`).
3. One SDK contract for internal and external adapters.
4. No role taxonomy (no control-vs-event adapter type split).

An adapter should declare which operations it implements and provide handlers for them.

---

## 2. Research Baseline

Current drift before this cutover:

1. Runtime now has canonical operations in `nex/src/nex/control-plane/runtime-operations.ts`.
2. Adapter process boundary still uses legacy CLI verbs:
   1. `info`
   2. `monitor`
   3. `send`
   4. `stream`
   5. `backfill`
   6. `health`
   7. `accounts list`
3. TypeScript SDK (`nexus-adapter-sdk-ts`) and Go SDK (`nexus-adapter-sdk-go`) are both verb/capability-centric.
4. In-repo external adapters (`discord`, `telegram`, `whatsapp`, `gog`) are implemented on that legacy SDK contract.
5. Runtime internal HTTP ingress now mounts on `NexusAdapter` (no separate ingress-only adapter interface).

This spec removes the legacy verb model and moves external adapters to operation IDs.

---

## 3. Locked Decisions

1. Adapter process command verb is operation ID.
2. Legacy verbs are removed, not aliased.
3. SDKs expose operation registration API, not capability fields.
4. `AdapterInfo` reports `operations: string[]` instead of legacy `supports`.
5. `adapter.monitor.stop` remains runtime-managed (process supervision), not required as adapter binary command.
6. Stream transport remains JSONL stdin/stdout for `delivery.stream`.
7. External adapter operation ids are single-sourced from runtime in `nex/src/nex/control-plane/runtime-operations.ts` via `EXTERNAL_ADAPTER_OPERATION_IDS`.

---

## 4. Canonical External Operation Set (Adapter Boundary)

External adapters implement the subset they support:

1. `adapter.info`
2. `adapter.health`
3. `adapter.accounts.list`
4. `adapter.monitor.start`
5. `event.backfill`
6. `delivery.send`
7. `delivery.stream`
8. `delivery.react`
9. `delivery.edit`
10. `delivery.delete`
11. `delivery.poll`

`event.ingest` is runtime-owned; adapters emit normalized events as JSONL output of `adapter.monitor.start` and `event.backfill`.

---

## 5. SDK API (TypeScript + Go)

SDK contract becomes operation-centric:

1. Register operation handlers by string operation ID.
2. Runtime context loading remains shared.
3. Output parsing/validation helpers remain shared.
4. Stream helpers remain shared for `delivery.stream`.

TypeScript target shape:

```ts
type AdapterOperationHandler = (ctx: AdapterContext, payload: unknown) => Promise<unknown>;

type NexusAdapterDefinition = {
  operations: Record<string, AdapterOperationHandler>;
};

runNexusAdapter(definition, options);
```

Go target shape:

```go
type Adapter struct {
    Operations map[string]OperationHandler
}

func Run(adapter Adapter)
```

---

## 6. Runtime Manager Cutover

`AdapterManager` will call operation IDs directly:

1. `queryInfo` -> `adapter.info`
2. `health` -> `adapter.health`
3. `listAccounts` -> `adapter.accounts.list`
4. `startMonitor` -> `adapter.monitor.start`
5. `runBackfill` -> `event.backfill`
6. `send` -> `delivery.send`
7. `stream` / `streamLive` -> `delivery.stream`

Payload transport:

1. Scalar params continue via flags where practical (`--account`, `--since`).
2. Complex payloads use JSON (`--payload-json` and/or stdin JSONL for stream).

---

## 7. Adapter Migration Scope (In-Repo)

Required in this cutover:

1. `nexus-adapter-discord`
2. `nexus-adapter-telegram`
3. `nexus-adapter-whatsapp`
4. `nexus-adapter-gog`

Each adapter must:

1. Switch entrypoint to new SDK runner.
2. Replace legacy `info/supports` with `adapter.info/operations`.
3. Move monitor handler to `adapter.monitor.start`.
4. Move backfill handler to `event.backfill`.
5. Move send handler to `delivery.send`.
6. Keep stream handler under `delivery.stream`.

---

## 8. Validation

Required validation for completion:

1. `nex/src/nex/adapters/*.test.ts` green with new operation command contract.
2. Control-plane runtime tests that invoke adapter manager remain green:
   1. `server.nex-http.e2e`
   2. ingress cutover tests
3. SDK package test suites:
   1. `nexus-adapter-sdk-ts` tests
   2. `nexus-adapter-sdk-go` tests
4. Adapter package tests/build:
   1. discord
   2. telegram
   3. whatsapp
   4. gog
5. Conformance guard:
   1. `nex/src/nex/adapters/protocol.ts` uses `EXTERNAL_ADAPTER_OPERATION_IDS` directly (no duplicated enum literals).
   2. `nex/src/nex/adapters/protocol.test.ts` asserts schema options equal `EXTERNAL_ADAPTER_OPERATION_IDS`.

Node-specific runtime test failures are tracked separately and are not part of this SDK cutover scope.

---

## 9. Out of Scope (Separate Cutover)

1. Removing node operation family.
2. In-process app/plugin operation registry SDK.
