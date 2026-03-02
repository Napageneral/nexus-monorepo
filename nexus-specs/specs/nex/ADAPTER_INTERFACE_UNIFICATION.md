# Adapter Interface Unification

**Status:** IN PROGRESS (authoritative for adapter/interface cutover)  
**Date:** 2026-02-26  
**Mode:** Hard cutover (no backwards compatibility)  
**Related:** [NEXUS_REQUEST_TARGET.md](./NEXUS_REQUEST_TARGET.md), `../delivery/ADAPTER_SYSTEM.md`, `../delivery/sdk/ADAPTER_SDK_OPERATION_MODEL_CUTOVER.md`

---

## 1. Customer Experience First

Nexus should feel simple from the outside:

1. There is one runtime with one operation model.
2. There is one adapter model for all runtime surfaces and channels.
3. There is one SDK contract for adapter authors.
4. A user action always resolves identity, IAM, and audit the same way.
5. Scheduling/timer behavior is part of clock, not a separate cron product.

Users should not have to understand "control adapter vs ingress adapter."  
Everything is an adapter that invokes runtime operations.

---

## 2. Research Baseline (Current Reality)

Current code/spec state is mixed and creates cognitive debt:

1. Runtime now uses a singular adapter shape (`NexusAdapter`) in `nex/src/nex/control-plane/nexus-adapter.ts` for WS control, HTTP control, and HTTP ingress mounts, but external adapter SDK/CLI contract is still capability-verb based.
2. External adapters use a separate CLI capability contract (`monitor|send|stream|backfill|health|accounts`) via:
   - `nex/src/nex/adapters/protocol.ts`
   - `nexus-adapter-sdks/*`
3. Legacy dual-role language still exists in historical docs (`SURFACE_ADAPTER_V2.md`) and some delivery docs must stay synchronized with this spec.
4. Clock is active for tick ingress and schedule operations (`clock.schedule.*`), but runtime scheduler implementation still lives in `server-cron.ts` internals.
5. Legacy node/device control behavior still exists as a parallel stack and must converge into the canonical adapter model (`device.host.*` + `adapter.control.start`).

This spec removes that split model.

---

## 3. Locked Decisions

1. **One adapter interface only.**  
   No adapter role taxonomy (`EventIngressAdapter` vs `ControlSurfaceAdapter`) in the canonical model.
2. **One operation set only.**  
   Operation registry merges runtime control methods and adapter capability operations.
3. **One SDK only.**  
   Internal and external adapters use the same operation contract.
4. **Clock replaces cron.**  
   Scheduling APIs move to `clock.schedule.*`; `cron.*` and `wake` are removed.
5. **Hard cutover.**  
   No aliases, no compatibility shims.
6. **Single in-repo contract file.**  
   Runtime operations are defined in one canonical file: `nex/src/nex/control-plane/runtime-operations.ts`.
7. **Device control is canonical runtime surface.**  
   Legacy `node.*` is replaced by `device.host.list|describe|invoke`.
8. **Duplex device control is an adapter contract.**  
   External adapter surface includes `adapter.control.start` for runtime-initiated invoke + endpoint lifecycle + canonical event ingest frames.

---

## 4. Canonical Adapter Interface

```ts
type OperationMode = "protocol" | "sync" | "event";

type RuntimeOperationDef = {
  operation: string;          // stable operation id
  mode: OperationMode;        // execution behavior
  action: "read" | "write" | "admin" | "approve" | "pair";
  resource: string;           // stable IAM resource
  permission?: string;        // required for sync/event; optional for protocol
};

type RuntimeOperationRequest = {
  request_id: string;
  operation: string;
  payload: Record<string, unknown>;
  transport: {
    adapter_id: string;
    protocol: "ws" | "http" | "internal" | "adapter-cli";
    connection_id?: string;
    remote?: string;
  };
};

type RuntimeOperationResult = {
  ok: boolean;
  result?: unknown;
  error?: unknown;
};

interface NexusAdapter {
  id: string;
  transport: "ws" | "http" | "internal" | "adapter-cli";
  operations(): RuntimeOperationDef[];
  operationFor(operation: string): RuntimeOperationDef | null;
  handle(request: RuntimeOperationRequest): Promise<RuntimeOperationResult>;
}
```

Rules:

1. `mode` is operation metadata, not an adapter role.
2. Any adapter can expose any combination of operations.
3. All adapters dispatch through the same IAM + audit + hooks lifecycle.
4. `event` mode operations normalize to canonical `NexusEvent` and run `nex.processEvent(...)`.

---

## 5. Canonical SDK Contract

The SDK is operation-centric. CLI adapter commands become an implementation detail of the SDK runtime bridge.

### 5.1 Required SDK primitives

1. Operation registration (`registerOperation(def, handler)`)
2. Runtime context loading (credentials/config/account)
3. JSON schema validation for inputs/outputs
4. Event normalization helpers
5. Delivery helpers (send/stream/reaction/edit/delete)
6. Backfill helpers
7. Control-session helpers for long-lived duplex device adapters (`adapter.control.start`)

### 5.2 External adapter bridge

Existing CLI verbs (`info|monitor|send|stream|backfill|health|accounts`) remain supported as a transport bridge but map to runtime operations:

1. `info` -> `adapter.info`
2. `monitor` -> `event.ingest` stream producer
3. `backfill` -> `event.backfill` stream producer
4. `send` -> `delivery.send`
5. `stream` -> `delivery.stream`
6. `health` -> `adapter.health`
7. `accounts` -> `adapter.accounts.list`
8. optional verbs -> `delivery.react|delivery.edit|delivery.delete|delivery.poll`
9. control-session stream -> `adapter.control.start`

---

## 6. Unified Runtime Operation Set

This is one registry (single source of truth), grouped only for readability.

### 6.1 Protocol operations

1. `connect`
2. `auth.login`

### 6.2 Runtime synchronous operations

1. `health`, `status`, `logs.tail`, `system-presence`
2. `events.stream`, `apps.list`, `apps.open.<app_id>`
3. `auth.users.list`, `auth.users.create`, `auth.users.setPassword`
4. `auth.tokens.ingress.list`, `auth.tokens.ingress.create`, `auth.tokens.ingress.revoke`, `auth.tokens.ingress.rotate`
5. `models.list`
6. `usage.status`, `usage.cost`, `sessions.usage`, `sessions.usage.timeseries`, `sessions.usage.logs`
7. `config.get`, `config.schema`, `config.set`, `config.patch`, `config.apply`
8. `wizard.start`, `wizard.next`, `wizard.cancel`, `wizard.status`
9. `agents.list`, `agents.create`, `agents.update`, `agents.delete`, `agents.files.list`, `agents.files.get`, `agents.files.set`, `agent.identity.get`, `agent.wait`
10. `skills.status`, `skills.install`, `skills.update`
11. `sessions.list`, `sessions.resolve`, `sessions.preview`, `sessions.import`, `sessions.import.chunk`, `sessions.patch`, `sessions.reset`, `sessions.delete`, `sessions.compact`
12. `chat.history`, `chat.abort`, `chat.inject`
13. `device.pair.list`, `device.pair.approve`, `device.pair.reject`, `device.token.rotate`, `device.token.revoke`
14. `device.host.list`, `device.host.describe`, `device.host.invoke`
15. `browser.request`
16. `talk.mode`
17. `tts.status`, `tts.providers`, `tts.enable`, `tts.disable`, `tts.convert`, `tts.setProvider`
18. `voicewake.get`, `voicewake.set`
19. `acl.requests.list`, `acl.requests.show`, `acl.requests.approve`, `acl.requests.deny`, `acl.approval.request`
20. `tools.invoke`
21. `update.run`

### 6.3 Event operations

1. `event.ingest`
2. `event.backfill`

### 6.4 Adapter capability operations

1. `adapter.info`
2. `adapter.health`
3. `adapter.accounts.list`
4. `adapter.monitor.start`, `adapter.monitor.stop`
5. `adapter.control.start`
6. `delivery.send`
7. `delivery.stream`
8. `delivery.react`
9. `delivery.edit`
10. `delivery.delete`
11. `delivery.poll`

---

## 7. Clock Scheduling Cutover (`cron -> clock`)

Clock owns both periodic ticks and scheduled jobs.

### 7.1 New clock schedule operations

1. `clock.schedule.list`
2. `clock.schedule.status`
3. `clock.schedule.create`
4. `clock.schedule.update`
5. `clock.schedule.remove`
6. `clock.schedule.run`
7. `clock.schedule.runs`
8. `clock.schedule.wake`

### 7.2 Schedule payload contract

Keep existing schedule semantics:

1. `{"kind":"at","at":"<ISO8601>"}`
2. `{"kind":"every","everyMs":<number>,"anchorMs"?:<number>}`
3. `{"kind":"cron","expr":"<cron expr>","tz"?: "<iana tz>"}`

### 7.3 Configuration cutover

Move runtime scheduling config under `clock`:

1. `clock.enabled`
2. `clock.tickIntervalMs`
3. `clock.schedule.enabled`
4. `clock.schedule.store`
5. `clock.schedule.maxConcurrentRuns`

Remove `cron.*` runtime config usage.

### 7.4 Hard mapping

1. `wake` -> `clock.schedule.wake`
2. `cron.list` -> `clock.schedule.list`
3. `cron.status` -> `clock.schedule.status`
4. `cron.add` -> `clock.schedule.create`
5. `cron.update` -> `clock.schedule.update`
6. `cron.remove` -> `clock.schedule.remove`
7. `cron.run` -> `clock.schedule.run`
8. `cron.runs` -> `clock.schedule.runs`

---

## 8. Implementation Plan

### Phase 1: Spec and taxonomy hardening

1. Remove dual-role language from specs.
2. Publish single adapter interface and merged operation registry.
3. Mark legacy `SURFACE_ADAPTER_V2` sections as historical only.

### Phase 2: Runtime interface cutover

1. Replace `ControlSurfaceAdapter` naming with unified `NexusAdapter` naming in runtime control modules.
2. Route WS and HTTP control operations through the same unified adapter interface.
3. Route internal HTTP ingress modules through that same interface contract.

### Phase 3: Operation registry merge

1. Add operation definitions for adapter capability operations.
2. Add handlers bridging runtime -> adapter manager for adapter capability operations.
3. Keep IAM/audit/hook behavior uniform.

### Phase 4: Clock scheduling cutover

1. Introduce `clock.schedule.*` operations and handlers.
2. Move legacy cron implementation behind clock schedule operation names.
3. Remove `cron.*` + `wake` from taxonomy and handlers.

### Phase 5: SDK cutover

1. Update TS/Go adapter SDKs to publish the unified operation contract.
2. Keep CLI verb bridge only as SDK transport compatibility, not as canonical architecture language.

---

## 9. Validation Requirements

1. All exposed runtime operations resolve via one registry function.
2. All adapters implement one interface (`operations()`, `operationFor()`, `handle()`).
3. WS and HTTP control paths use the same adapter interface implementation.
4. HTTP ingress modules are mounted through the same adapter interface, not bespoke route logic.
5. HTTP control operation resolver maps paths/methods to canonical operation ids and only mounts operations declaring `http.control`.
6. HTTP control dispatch is executed through one shared dispatcher module (no duplicated protocol/control dispatch branches in transport bootstrap).
7. HTTP ingress dispatch (`event.ingest`) is executed through one shared dispatcher module.
8. `http.ingress` mounts are explicit operation descriptor surfaces; ingress dispatcher only mounts operations declaring `http.ingress`.
9. HTTP ingress operation ids are defined once in `runtime-operations.ts` (`HTTP_INGRESS_OPERATION_IDS`) and both ingress adapter + ingress dispatcher consume that canonical list.
10. `cron.*` and `wake` methods return unsupported after cutover.
11. `clock.schedule.*` operations pass e2e tests for create/list/update/run/remove.
12. `event.ingest` and `event.backfill` are exercised through adapter and internal ingress paths.
13. Adapter capability operations (`adapter.info`, `delivery.send`, `delivery.stream`, etc.) are IAM-audited and tested.
14. `event.ingest` chat/agent/system delegation uses internal handler functions, not pseudo runtime method ids.
15. Legacy node-surface tests are removed or rewritten to canonical `device.host.*` behavior.

---

## 10. Out Of Scope

1. OIDC provider expansion details.
2. Channel migration sequencing per platform.
3. Multi-hop app-on-app composition.
