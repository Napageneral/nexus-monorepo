# Unified Runtime Operation Model

**Status:** DESIGN (authoritative)  
**Date:** 2026-02-25  
**Mode:** Hard cutover (no backwards compatibility)  
**Related:** `ADAPTER_INTERFACE_UNIFICATION.md`, `NEX.md`, `NEXUS_REQUEST.md`, `RUNTIME_SURFACES.md`, `SURFACE_ADAPTER_V2.md`, `ingress/CONTROL_PLANE_AUTHZ_TAXONOMY.md`, `../delivery/ADAPTER_SYSTEM.md`

---

## 1. Customer Experience First

This model exists to make Nexus feel like one coherent system:

1. A user action from UI/CLI/API/channel is handled through the same runtime operation contract.
2. Identity + IAM are always applied before business logic executes.
3. Every operation is visible in one audit/log stream.
4. Agent runs are a runtime capability, not a separate disconnected ingress path.
5. App teams (Control, Oracle, Glowbot, future apps) build on one registry of runtime operations.

The user should never need to think in terms of separate "control plane vs event plane" products. There is one runtime with one operation model.

---

## 2. Research Baseline (Current Reality)

As of this spec, code and specs show mixed models:

1. Control taxonomy exists as `protocol | control | event` in `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/authz-taxonomy.ts`.
2. Runtime methods include duplicated/legacy entries (notably node and dual chat/agent ingress) in `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods-list.ts`.
3. HTTP control and WS control are both mounted today (`/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-http.ts`, `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods.ts`).
4. `NexusRequest` and `NexusEvent` are currently split and message-centric in `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/request.ts`.
5. Existing specs still encode older split language (`SURFACE_ADAPTER_V2.md`, `RUNTIME_SURFACES.md`, `NEXUS_REQUEST.md`).

This document is the cutover target that resolves those inconsistencies.

---

## 3. Locked Decisions

### 3.1 Keep top-level envelope name as `NexusEvent`

No rename to `NexusRequest` as the primary stored envelope.

1. Keep a single events-oriented ledger stream.
2. Add a top-level `operation` discriminator.
3. Preserve message-specific payload under the existing event/delivery structure for message operations.

### 3.2 One runtime operation model

No separate conceptual products called "control operations" vs "event operations."

1. Everything is a runtime operation.
2. One runtime operation (`event.ingest`) represents inbound external/user/system events.
3. Agent execution occurs when operation handling resolves to an agent-targeted execution path (directly or via automation).

### 3.3 AuthN + principal resolution are one stage

Canonical stage name: `resolvePrincipals`.

1. Validate caller/source authenticity.
2. Resolve sender principal.
3. Resolve receiver principal when operation semantics require a receiver.
4. For runtime management operations, receiver is runtime/system.

### 3.4 `resolveAccess` stays canonical IAM stage

`resolveAccess` is IAM AuthZ. No alternate naming.

### 3.5 Finalization is universal journaling

No special "finalize-only-at-end" semantics.

1. Operation trace and audit updates are recorded across the operation lifecycle.
2. Every operation has start/outcome logging regardless of allow/deny/failure.

### 3.6 Hard cutover operation cleanup

1. Merge `chat.send` and `agent` ingress intent under one canonical operation path (`event.ingest`).
2. Remove node-specific operation family for now (including `node.*`, `node.event`, `node.invoke.result`, `skills.bins`).
3. Remove legacy `cron.*` and `wake`; replace with `clock.schedule.*` operations.
4. Rename `ingress.credentials.*` to `auth.tokens.ingress.*`.
5. Remove special-case webhook endpoints `/wake` and `/agent`; mapped webhook routes are canonical.

### 3.7 One adapter interface + one SDK

1. Do not encode dual adapter roles in canonical architecture.
2. All runtime surfaces/channels use one adapter interface and one operation set.
3. External CLI adapter commands are a transport bridge, not a separate conceptual API.

---

## 4. Canonical Envelope

`NexusEvent` becomes the single envelope for all runtime operations.

```ts
type NexusEvent = {
  event_id: string;                 // ULID/UUID, globally unique
  created_at: number;               // daemon receive timestamp
  operation: string;                // canonical operation id, ex: "event.ingest", "config.set"

  transport: {
    surface: string;                // ex: "control.ws", "ingress.http", "ingress.clock"
    protocol: "ws" | "http" | "internal" | "adapter";
    request_id?: string;
    connection_id?: string;
    remote?: string;
  };

  principals?: {
    sender?: {
      entity_id?: string;
      type: "owner" | "known" | "unknown" | "system" | "webhook" | "agent";
    };
    receiver?: {
      type: "agent" | "entity" | "system" | "unknown";
      entity_id?: string;
      agent_id?: string;
      persona_ref?: string;
    };
  };

  access?: {
    decision: "allow" | "deny" | "ask";
    permission?: string;
    policy_id?: string;
  };

  payload: unknown;                 // operation-specific input
  result?: unknown;                 // operation-specific output

  trace: Array<{
    step: string;                   // ex: resolvePrincipals, resolveAccess, executeOperation
    at: number;
    duration_ms?: number;
    status: "ok" | "deny" | "error";
    detail?: string;
  }>;

  status: "processing" | "completed" | "denied" | "failed";
};
```

### 4.1 Message payload compatibility

For `operation = "event.ingest"`:

1. `payload` contains canonical message ingress object (`event` + `delivery` data).
2. Existing delivery/event shape remains valid.
3. No new parallel ledger/object model is introduced.

---

## 5. Unified Operation Pipeline

All runtime operations pass through the same lifecycle:

1. `receiveOperation`  
   Parse/stamp envelope, assign ids, normalize transport metadata.
2. `resolvePrincipals`  
   AuthN + sender/receiver resolution (receiver may be runtime/system).
3. `resolveAccess`  
   IAM authorization decision for the resolved principal(s) and operation.
4. `operation.preExecute`  
   Audit start + hook/bus signal.
5. `executeOperation`  
   Dispatch to operation handler from registry.
6. `operation.postExecute`  
   Audit outcome + hook/bus signal.
7. `finalizeJournal`  
   Persist final trace/status updates.

### 5.1 Agent execution branch

`runAgent` is an internal runtime capability invoked by operation handlers or automations.

Canonical internal chain:

1. `assembleContext`
2. `runAgent`
3. outbound adapter sends/streams
4. usage/tool/response journaling

`deliverResponse` is not treated as a standalone top-level pipeline stage in this model.

---

## 6. Operation Registry (Authoritative Contract)

The runtime owns a single `OperationRegistry`.

Implementation source of truth:

1. `nex/src/nex/control-plane/runtime-operations.ts`

Each operation definition includes:

1. `operation` id (string, stable)
2. input schema
3. output schema
4. IAM permission
5. principal requirements (sender-only vs sender+receiver)
6. execution handler
7. allowed surface mounts

```ts
type OperationDefinition = {
  operation: string;
  permission: string;
  requires_receiver: boolean;
  allowed_surfaces: string[];
  input_schema: unknown;
  output_schema: unknown;
  execute: (ctx: OperationContext) => Promise<unknown>;
};
```

Surface defaulting rule:

1. `protocol` + `control` + `event` operations default to `ws.control` only.
2. `http.control` mounts must be explicit in the operation descriptor.
3. `http.ingress` mounts must be explicit in the operation descriptor.
4. Operations mounted by static HTTP routes (`http-control-routes.ts`) must explicitly include `http.control` in their descriptor surfaces.

### 6.1 Core operation families (v1)

1. `auth.*`  
   Login/session/token lifecycle for runtime access.
2. `runtime.*`  
   Health/status/logs/update/system presence.
3. `config.*`  
   Get/set/patch/apply/schema.
4. `acl.*`  
   Approval request/list/approve/deny.
5. `auth.tokens.ingress.*`  
   Ingress token list/create/revoke/rotate (renamed from `ingress.credentials.*`).
6. `agents.*`, `sessions.*`, `models.*`, `usage.*`, `apps.*`, `tools.invoke`, `wizard.*`, `talk.*`, `tts.*`, `voicewake.*`, `browser.request`.
7. `event.ingest`  
   Canonical event ingress operation for user/channel/webhook/openai/openresponses/webchat/clock/system ingress.
8. `event.backfill` (when enabled by adapter/system policy).
9. Adapter capability operations: `adapter.info`, `adapter.health`, `adapter.accounts.list`, `adapter.monitor.start|stop`, `delivery.send|stream|react|edit|delete|poll`.
10. Clock scheduling operations: `clock.schedule.list|status|create|update|remove|run|runs|wake`.

### 6.2 Hard cutover mapping (required)

1. `chat.send` -> `event.ingest`
2. `agent` -> `event.ingest`
3. `system-event` -> `event.ingest`
4. `ingress.credentials.*` -> `auth.tokens.ingress.*`
5. Remove `node.*`, `node.event`, `node.invoke.result`, `skills.bins` from active registry.
6. `wake` -> `clock.schedule.wake`
7. `cron.list` -> `clock.schedule.list`
8. `cron.status` -> `clock.schedule.status`
9. `cron.add` -> `clock.schedule.create`
10. `cron.update` -> `clock.schedule.update`
11. `cron.remove` -> `clock.schedule.remove`
12. `cron.run` -> `clock.schedule.run`
13. `cron.runs` -> `clock.schedule.runs`
14. Remove internal pseudo-method dispatch ids (`_internal.event.ingest.chat|agent|system`); `event.ingest` delegates directly to internal handler functions.

---

## 7. Single Adapter Model

### 7.1 Canonical interface

All adapters implement one interface shape:

1. `operations()`
2. `operationFor()`
3. `handle()`

Operation execution mode (`protocol|sync|event`) is operation metadata, not adapter-role metadata.

### 7.2 Canonical internal adapters

1. `control.ws` (WS/RPC runtime adapter)
2. `control.http` (HTTP runtime adapter for mounted control operations)
3. `ingress.http` (HTTP ingress adapter modules mapped to runtime operations)
4. `clock` (timer + schedule adapter mapped to `event.ingest` and `clock.schedule.*`)

### 7.3 External adapters

External adapters emit runtime operations through the same operation contract (primarily `event.ingest` / `event.backfill`) and consume outbound send/stream APIs.

### 7.4 Listener topology

Two listeners are allowed for trust-boundary isolation:

1. Control listener (operator/runtime control traffic).
2. Ingress listener (external event ingress traffic).

Both listeners feed the same operation dispatcher, IAM model, and audit lifecycle.

---

## 8. HTTP Routing Cutover Rules

1. Remove bespoke HTTP handler bypasses; HTTP mounts operations through the same adapter interface contract.
2. Keep HTTP on control listener only for:
   - UI/static app serving
   - auth callback/protocol plumbing
   - operational liveness endpoints as needed
3. Ingress HTTP routes are adapter-owned and map to runtime operations (`event.ingest` and future ingress operations).
4. Webhook mappings are canonical ingress pathing; remove fixed `/wake` and `/agent` behavior.
5. Static HTTP control routes are centralized in one route table (`nex/src/nex/control-plane/http-control-routes.ts`) so operation mount points are not duplicated in `server-http.ts`.
6. Static route table entries must map to canonical runtime operations and taxonomy kinds.
7. Static HTTP control operation handlers are owned by a dedicated registry module (not inline in HTTP server bootstrap), and are wired by canonical operation id.
8. Browser/canvas and app-open HTTP control handlers (`browser.request`, `apps.open.*`) are also owned by dedicated registry extensions, not inline transport bootstrap code.
9. HTTP request path/method to operation mapping is resolved in a dedicated resolver module, not ad hoc branching in transport bootstrap.
10. HTTP operation resolver enforces `http.control` surface declaration before returning an operation mount.
11. HTTP control operation dispatch (kind-check + adapter invocation) is centralized in a dedicated dispatcher module, not duplicated inline per request.
12. HTTP ingress operation dispatch (`event.ingest`) is centralized in a dedicated dispatcher module.
13. Every explicit `http.control` mount must be reachable by a known resolver family (static route table or approved dynamic control handler).
14. HTTP ingress dispatcher family operation ids are defined once in `runtime-operations.ts` (`HTTP_INGRESS_OPERATION_IDS`) and consumed by both ingress adapter and ingress dispatcher modules.

---

## 9. Hooks, Audit, and Bus Semantics

Mandatory signals for every operation:

1. `operation.started`
2. `operation.completed` or `operation.failed` or `operation.denied`

Hooks run at:

1. post-`resolveAccess`, pre-`executeOperation`
2. post-`executeOperation`

Audit records must include:

1. operation id
2. sender principal
3. receiver principal when present
4. IAM decision
5. latency + status

---

## 10. Plugin/Extension Contract

Runtime/plugin/app modules extend behavior by registering operations in `OperationRegistry`.

Initial trust posture:

1. Plugin operations are powerful/trusted by installer intent.
2. Capability sandboxing is deferred.
3. Registry boundary remains mandatory so future capability gating can be added without redesign.

---

## 11. Migration Constraints

1. No compatibility aliases.
2. No dual taxonomy.
3. No dual operation sources for the same behavior.
4. No new standalone request ledger.
5. Do not rename stable fields unnecessarily beyond explicit cutover items in this spec.

---

## 12. Validation Requirements (Post-implementation)

1. Operation registry coverage test: every exposed runtime method resolves to exactly one operation definition.
2. IAM coverage test: every operation requires IAM except explicitly whitelisted protocol/auth handshake operations.
3. Cutover test: old removed operations return unsupported.
4. Ingress test: HTTP ingress/OpenAI/OpenResponses/webhooks/webchat/clock all produce `event.ingest`.
5. Chat test: interactive chat path also resolves through `event.ingest`.
6. Audit test: started/outcome records for allow/deny/fail are emitted for all operations.
7. RunAgent path test: receiver-agent and automation-triggered agent invocation both work via unified operation flow.
8. Clock cutover test: `clock.schedule.*` passes lifecycle coverage (create/list/update/run/remove/runs/status/wake).
9. Legacy cutover test: `cron.*` and `wake` are unsupported.
10. Adapter operation conformance test:
   1. External adapter operation ids are defined once in `nex/src/nex/control-plane/runtime-operations.ts` as `EXTERNAL_ADAPTER_OPERATION_IDS`.
   2. Adapter process protocol schema in `nex/src/nex/adapters/protocol.ts` references that constant directly.
   3. Tests assert zero drift between schema enum options and canonical ids.
11. HTTP control route conformance tests:
   1. Static route table entries are unique by `method + pathname`.
   2. Every static route operation resolves in control-plane taxonomy with expected kind.
   3. Runtime operations missing from WS/core handler registry must equal the explicit static HTTP control operation set.

---

## 13. Internal Adapter Inventory (Target)

Bundled by default:

1. `control.ws` — runtime operation adapter (WS/RPC)
2. `control.http` — runtime operation adapter (HTTP-mounted control operations)
3. `ingress.http` — ingress adapter (webhooks, OpenAI compat, OpenResponses compat, webchat ingress)
4. `clock` — timer + schedule adapter

External (managed by adapter runtime):

1. `discord`
2. `telegram`
3. `whatsapp`
4. `eve`
5. `gogcli`
6. future adapter packages

---

This document is the canonical operation-model target for Nexus runtime unification.
