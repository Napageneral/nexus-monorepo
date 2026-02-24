# Surface Adapter V2

**Status:** SPEC FOR FINAL REVIEW  
**Date:** 2026-02-24  
**Mode:** Hard cutover (no backwards compatibility)  
**Related:** `RUNTIME_SURFACES.md`, `ingress/CONTROL_PLANE_AUTHZ_TAXONOMY.md`, `ingress/INGRESS_INTEGRITY.md`, `ingress/SINGLE_TENANT_MULTI_USER.md`, `hosted/HOSTED_DIRECT_BROWSER_RUNTIME_CONTRACT.md`

---

## 1. Customer Experience First

This spec defines one clear user story:

1. Every inbound interaction is authenticated, authorized, audited.
2. Agent-triggering interactions are normalized to `NexusEvent` and run through the event pipeline.
3. Control operations stay synchronous and reliable without pretending to be chat events.
4. Protocol plumbing (handshake/pairing) is explicit and cannot accidentally impersonate user actions.

Users should experience one coherent system:

- Control UI/CLI actions feel immediate and predictable.
- Messages/events from channels and APIs route through the same event policy model.
- Security posture is consistent across local and hosted modes.

---

## 2. Problem Statement

Current runtime behavior is strong, but language and interface boundaries are still confusing:

1. Control-plane taxonomy currently uses `transport | iam | pipeline`, which mixes concerns and causes naming confusion.
2. WS RPC includes both synchronous control methods and event-ingress methods in one dispatcher surface.
3. Event adapters (Discord/Eve/Gog/Clock/HTTP ingress) use a clear event contract, while control surfaces have separate conventions.
4. Teams building new app surfaces (e.g. Oracle/Glowbot) need one explicit model for:
   - protocol operations
   - control operations
   - event ingress operations

---

## 3. Decision Summary

### 3.1 Canonical operation kinds

Replace taxonomy language with:

1. `protocol`
2. `control`
3. `event`

Hard cutover mapping:

- `transport` -> `protocol`
- `iam` -> `control`
- `pipeline` -> `event`

### 3.2 Keep WS/RPC in runtime core (not a normal event adapter)

WS/HTTP control plane remains runtime-core because it owns:

- handshake/auth transport mechanics
- connection/session state
- synchronous request/response UX for admin/control methods

It does not become a monitor/send channel adapter.

### 3.3 Unify security envelope

All non-protocol operations use one shared envelope:

1. AuthN
2. Principal resolution
3. AuthZ
4. Audit
5. Hook/event emission

The divergence happens only after this shared envelope:

- `control`: run synchronous handler
- `event`: normalize to `NexusEvent` and execute event pipeline

### 3.4 Hard cutover only

No compatibility aliases. Old kind names are removed from code/spec/tests in one cut.

---

## 4. Canonical Semantics

### 4.1 AuthN vs AuthZ

1. **AuthN (Authentication):** who is calling (token/session/adapter credential validation).
2. **AuthZ (Authorization):** what that caller may do (IAM policy/grant decision).

Both are mandatory for `control` and `event`.  
`protocol` operations can be AuthN-only where appropriate.

### 4.2 Operation-kind behavior

### `protocol`

Use for transport lifecycle only:

- connect/challenge/hello
- pairing plumbing
- connection metadata synchronization

Rules:

1. Must not trigger agent work.
2. Must not mutate business state beyond transport session/pairing state.
3. May bypass IAM tool permission checks when explicitly classified as protocol.

### `control`

Use for synchronous runtime management operations:

- sessions/config/approvals/channels/status/apps listing
- key management and other control-plane management actions

Rules:

1. AuthN + principal resolution + IAM AuthZ required.
2. Produces synchronous request/response.
3. Emits control audit + bus events.
4. Does not require `NexusEvent` normalization.

### `event`

Use for anything that represents ingress work:

- chat send
- OpenAI/OpenResponses/webhooks/webchat ingress
- node/adapter inbound messages
- timer/clock ticks

Rules:

1. AuthN + principal resolution + IAM AuthZ required.
2. Must normalize to `NexusEvent`.
3. Must enter `nex.processEvent(...)`.
4. May or may not invoke agent path, based on receiver/access/automations.

---

## 5. Shared Execution Envelope

For `control` and `event`, the required sequence is:

1. **Authenticate caller** (AuthN).
2. **Resolve effective principal** (entity + scopes/roles/tags).
3. **Authorize operation** via IAM.
4. **Write access audit** decision.
5. **Emit operation hook/bus start signal**.
6. Branch by kind:
   - `control`: execute handler
   - `event`: normalize + `nex.processEvent(...)`
7. **Emit completion/failure hook/bus signal**.
8. **Write completion audit metadata**.

Notes:

1. Audit remains mandatory even on deny/failure paths.
2. Hook failures must not violate synchronous response guarantees for `control`.

---

## 6. Adapter and Surface Model

### 6.1 Two adapter classes

1. **EventIngressAdapter** (existing channel-style model):
   - monitor/send/stream/backfill/health/accounts/etc
   - emits canonical ingress events
2. **ControlSurfaceAdapter** (new surface-oriented model):
   - declares `protocol/control/event` operations
   - executes transport/control handlers directly
   - routes event ops to `nex.processEvent(...)`

### 6.2 Existing adapter impact

No forced rewrite for existing event adapters:

1. `eve`, `gog`, Discord, Telegram, WhatsApp: remain `EventIngressAdapter`.
2. `clock`: internal `EventIngressAdapter`.
3. `http-ingress`: internal `EventIngressAdapter` (with submodules).
4. WS RPC/control HTTP: becomes/uses `ControlSurfaceAdapter` semantics.

This preserves current event-adapter investments while formalizing control surfaces.

### 6.3 Listener topology

Logical topology remains:

1. **Control surface** (protocol + control + selected event operations like `chat.send`)
2. **Ingress surface** (event-only protocol bridges/channels)

Physical deployment can be one process and one or more listeners.  
Port count is an implementation detail; operation semantics are the contract.

---

## 7. Canonical Interface Sketch (Normative Shape)

```ts
type OperationKind = "protocol" | "control" | "event";

type SurfaceOperationDef = {
  method: string;
  kind: OperationKind;
  action: "read" | "write" | "admin" | "approve" | "pair";
  resource: string;
  permission?: string; // required for control/event; optional for protocol
};

interface ControlSurfaceAdapter {
  id: string;
  transport: "ws" | "http" | "cli";
  operations(): SurfaceOperationDef[];
  handleProtocol?(ctx: ProtocolContext): Promise<ProtocolResult>;
  handleControl?(ctx: ControlContext): Promise<ControlResult>;
  handleEvent?(ctx: EventContext): Promise<EventIngressInput>;
}

interface EventIngressAdapter {
  info(): AdapterInfo;
  monitor(...): AsyncIterable<NexusEvent>;
  send?(...): Promise<DeliveryResult>;
  stream?(...): AsyncIterable<StreamStatus>;
  backfill?(...): AsyncIterable<NexusEvent>;
  health?(...): Promise<AdapterHealth>;
}
```

Normative rules:

1. `handleEvent` output must become canonical `NexusEvent`.
2. `ControlSurfaceAdapter` must not bypass IAM for `control`/`event`.
3. `protocol` operations cannot be reclassified at runtime.

---

## 8. Method Classification Contract

Current WS taxonomy entries are reclassified by hard cutover:

1. Existing `transport` entries become `protocol`.
2. Existing `iam` entries become `control`.
3. Existing `pipeline` entries become `event`.

Classification determines:

1. security path (AuthN-only vs AuthN+AuthZ),
2. execution path (sync handler vs event pipeline),
3. audit/hook behavior.

Unknown methods are denied by default.

---

## 9. Observability Contract

### 9.1 Control operations

Control operations emit bus events (not `NexusEvent`):

1. `control.operation.started`
2. `control.operation.completed`
3. `control.operation.failed`

Payload includes:

1. method
2. action/resource/permission
3. principal/entity_id
4. request_id
5. latency + result metadata (on completion)

### 9.2 Event operations

Event operations are observable through existing `nex.request.*` pipeline event stream.

---

## 10. Security Invariants

1. Identity authority is credential/session-derived, not request-body supplied.
2. Reserved platforms/channels cannot be spoofed by adapters/clients.
3. `sender_id` and similar fields are daemon-stamped where required by ingress-integrity policy.
4. `protocol` path cannot mutate control state or trigger agent work.
5. Every deny decision is auditable.

---

## 11. App Model Implications

This model is the foundation for tenant apps:

1. App UI/API surfaces register control operations via `ControlSurfaceAdapter`.
2. App ingress bridges/channels register event adapters.
3. App automation logic reacts to:
   - control bus events (`control.operation.*`)
   - event pipeline hooks (`runAutomations`, stage hooks)

Example:

1. Oracle app uses control ops for admin screens (`repos.list`, `index.status`).
2. Oracle app uses event ingress for webhook/GitHub-triggered work.
3. Oracle app can dispatch controlled `NexusEvent` operations when agent/broker work is needed.

---

## 12. Hard Cutover Plan

### Phase 1: Taxonomy rename

1. Replace `transport|iam|pipeline` with `protocol|control|event` in runtime code + tests.
2. Update spec docs and control-plane method tables.

### Phase 2: Surface adapter abstraction

1. Introduce `ControlSurfaceAdapter` interface and runtime dispatcher binding.
2. Move WS/HTTP control operation registration to this abstraction.

### Phase 3: Shared envelope enforcement

1. Centralize AuthN/principal/AuthZ/audit/hook prelude for control+event.
2. Enforce branch-specific handler/pipeline execution paths.

### Phase 4: Observability hardening

1. Emit `control.operation.*` bus events for all control operations.
2. Add regression tests for audit + bus coverage and deny paths.

### Phase 5: Legacy removal

1. Remove old taxonomy terms and any fallback compatibility shims.
2. Fail build if old terms appear in runtime taxonomy code.

---

## 13. Acceptance Criteria

1. No runtime taxonomy uses `transport|iam|pipeline`.
2. Every method is explicitly classified `protocol|control|event`.
3. Control operations are IAM-authorized and audited, with synchronous response preserved.
4. Event operations normalize to `NexusEvent` and enter `nex.processEvent(...)`.
5. Existing event adapters (`eve/gog/discord/...`) continue functioning without interface break.
6. Control operation bus events are emitted and test-covered.

---

## 14. Non-Goals (This Spec)

1. OIDC/provider rollout details.
2. Multi-workspace UX details.
3. Channel-by-channel adapter migration implementation.
4. In-process Oracle app implementation details.
