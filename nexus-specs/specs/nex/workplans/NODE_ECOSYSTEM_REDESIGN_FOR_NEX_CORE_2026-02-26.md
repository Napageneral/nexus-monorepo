# Node Ecosystem Redesign For Nex Core (2026-02-26)

**Status:** DECISION-LOCKED PLAN  
**Date Locked:** 2026-02-27  
**Mode:** Hard cutover (no backwards compatibility)  
**Related:**  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/UNIFIED_RUNTIME_OPERATION_MODEL.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/ADAPTER_INTERFACE_UNIFICATION.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/adapters/ADAPTER_CONNECTION_SERVICE.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/iam/IDENTITY_RESOLUTION.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/iam/ACCESS_CONTROL_SYSTEM.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/memory/UNIFIED_ENTITY_STORE.md`

---

## 1) Customer Experience Goal (First)

Users should not have to understand a special "node world."

1. Device integrations (iOS, macOS, Android, headless) are first-class adapters/apps.
2. Pairing/auth, IAM authorization, and audit behave exactly like the rest of Nex.
3. Device capabilities (camera/screen/system/location/etc.) are invoked through one canonical adapter/runtime operation model.
4. Device-originated stimuli (voice request, local events) enter the same canonical ingest path.
5. "Install companion software on device + connect adapter" is explicit product UX, not hidden runtime internals.

---

## 2) Combined Research Baseline

### 2.1 Current runtime state is split

1. Canonical runtime taxonomy intentionally excludes `node.*`:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/runtime-operations.ts`
2. Core handlers do not mount `nodeHandlers`:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods.ts`
3. IAM role gate denies `role=node` control-plane methods:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/iam-authorize.ts`
4. But legacy node stack still exists:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods/nodes.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/node-registry.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/node-host/runner.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/infra/node-pairing.ts`

### 2.2 Pairing/identity is duplicated today

1. Canonical pairing path already exists: `device.pair.*` + `device.token.*`.
2. Legacy duplicate pairing still exists: `node.pair.*` + `state/nodes`.
3. Broadcast residue still includes `node.pair.requested/resolved`:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-broadcast.ts`
4. Identity bootstrap still seeds `platform=node` contacts from legacy node pairing state:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/bootstrap-identities.ts`

### 2.3 Device app capability surfaces are real and rich

1. iOS exposes command routing far beyond camera/screen:
   - `/Users/tyler/nexus/home/projects/nexus/nex/apps/ios/Sources/Runtime/RuntimeConnectionController.swift`
   - `/Users/tyler/nexus/home/projects/nexus/nex/apps/ios/Sources/Model/NodeAppModel.swift`
2. macOS node mode includes canvas/camera/location + `system.run/which/notify`:
   - `/Users/tyler/nexus/home/projects/nexus/nex/apps/macos/Sources/Nexus/NodeMode/MacNodeModeCoordinator.swift`
   - `/Users/tyler/nexus/home/projects/nexus/nex/apps/macos/Sources/Nexus/NodeMode/MacNodeRuntime.swift`
3. Android exposes canvas/camera/screen/location/sms:
   - `/Users/tyler/nexus/home/projects/nexus/nex/apps/android/app/src/main/java/ai/nexus/android/NodeRuntime.kt`

### 2.4 Adapter SDK is unified for channel adapters but still lacks device-control session semantics

1. External adapter operations are command-invocation oriented (`adapter.info`, `adapter.monitor.start`, `delivery.*`, `adapter.setup.*`).
2. There is no first-class long-lived runtime-initiated command RPC surface equivalent to legacy `node.invoke.request/result`.
3. Connection/auth manifests and custom setup are already strong and should be reused:
   - `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/adapters/ADAPTER_CONNECTION_SERVICE.md`

---

## 3) Locked Decisions

1. **Node is not a separate product concept in core contracts.** Treat it as device adapter/app functionality.
2. **Hard cutover.** Remove legacy `node.*` method family and `node-pair` store; no compatibility aliases.
3. **Single pairing authority.** `device.pair.*` + `device.token.*` remain canonical.
4. **Device entities are first-class in identity graph.** Every paired device maps to an entity (`type='device'`), not a system-origin shortcut.
5. **Single IAM model.** Device command invocation and device-originated ingest are authorized and audited via existing ACL/grants.
6. **Frontdoor-first hosted auth.** For hosted/browser/mobile pair flows, frontdoor establishes identity and pairing claims; runtime enforces IAM.
7. **Capability declaration remains useful and kept.** It is used for routing/UX/observability preflight; authorization still enforced by IAM/ACL.
8. **Adapter/app project split is explicit.** Dedicated adapter projects will be created for:
   1. iOS
   2. macOS
   3. Android
   4. headless

---

## 4) Target Architecture

### 4.1 Runtime operation surface (canonical)

Keep existing:

1. `device.pair.list`
2. `device.pair.approve`
3. `device.pair.reject`
4. `device.token.rotate`
5. `device.token.revoke`

Add canonical device execution surface:

1. `device.host.list` — list connected/known device-host endpoints and capability metadata
2. `device.host.describe` — endpoint detail (adapter, endpoint id, caps, commands, permissions, health)
3. `device.host.invoke` — invoke a declared endpoint command with IAM enforcement and audit

Remove legacy runtime methods:

1. `node.list`
2. `node.describe`
3. `node.invoke`
4. `node.invoke.result`
5. `node.event`
6. `node.pair.*`
7. `skills.bins` (legacy node-side helper RPC)

### 4.2 Adapter boundary extension (SDK/runtime manager)

Add one long-lived adapter control session operation:

1. `adapter.control.start`

`adapter.control.start` stream contract (JSONL over stdio):

1. Runtime -> adapter frames:
   - `invoke.request` `{ request_id, endpoint_id, command, payload, timeout_ms?, idempotency_key? }`
   - `invoke.cancel` `{ request_id }`
2. Adapter -> runtime frames:
   - `endpoint.upsert` `{ endpoint_id, display_name?, platform?, caps[], commands[], permissions? }`
   - `endpoint.remove` `{ endpoint_id }`
   - `invoke.result` `{ request_id, ok, payload?, error? }`
   - `event.ingest` `{ event: NexusEvent }` (canonical inbound event envelope)

Notes:

1. `adapter.monitor.start` remains for channel-style monitors.
2. `adapter.control.start` is for device-style duplex command/control.
3. This replaces legacy `node.invoke.request/result` and `node.event` protocol semantics.

### 4.3 IAM + entity integration

1. Pair approval creates/updates a device entity:
   - `entities.type = 'device'`
   - tags like `device`, `platform:<platform>`, `adapter:<adapter_id>`
2. Contacts binding:
   - `(platform='device', space_id='', sender_id=<device_id>) -> entity_id`
3. Remove `node` from system-origin short-circuit list in identity resolution.
4. `device.host.invoke` authorization uses IAM permission resources, e.g.:
   - `device.host.invoke`
   - optional command-scoped resources: `device.command:<adapter>:<command>`
5. Grants/approvals remain canonical for sensitive operations (same ACL flow as exec/tool approvals).

### 4.4 Auth and pairing path

1. Local/self-hosted:
   - runtime device token + pairing flow (`device.pair.*`) remains direct.
2. Hosted:
   - frontdoor-issued authenticated pairing ticket/claims.
   - runtime verifies claims and still IAM-authorizes actual operations.
3. Admin service remains machine/service helper where needed; frontdoor remains user identity boundary.

### 4.5 Adapter-app packaging model

Each device family becomes a dedicated adapter project that includes:

1. Adapter manifest + runtime integration (SDK operations, auth manifest, custom setup flow if needed).
2. Device companion software and install/update metadata.
3. Capability/command declaration logic and endpoint lifecycle reporting.

---

## 5) Legacy -> Canonical Migration Map

1. `node.list` -> `device.host.list`
2. `node.describe` -> `device.host.describe`
3. `node.invoke` -> `device.host.invoke`
4. `node.pair.*` -> `device.pair.*` / `device.token.*`
5. `node.invoke.request`/`node.invoke.result` wire frames -> `adapter.control.start` invoke frames
6. `node.event` -> `adapter.control.start` `event.ingest` frame

---

## 6) Adapter Project Targets

### 6.1 `nexus-adapter-device-headless`

Scope:

1. Replace `/src/node-host/runner.ts` protocol path with adapter control session.
2. Expose commands:
   - `system.run`
   - `system.which`
   - `browser.proxy` (if enabled)

### 6.2 `nexus-adapter-device-macos`

Scope:

1. Move macOS node mode command surface into dedicated device adapter project boundary.
2. Expose current capabilities:
   - canvas/a2ui
   - camera
   - location
   - screen.record
   - `system.run/which/notify`

### 6.3 `nexus-adapter-device-ios`

Scope:

1. Move iOS node-mode runtime surface into dedicated adapter project boundary.
2. Expose current capabilities:
   - canvas/a2ui
   - camera/list/snap/clip
   - screen.record
   - location
   - device status/info
   - photos/contacts/calendar/reminders/motion
   - talk push-to-talk commands

### 6.4 `nexus-adapter-device-android`

Scope:

1. Move Android node runtime surface into dedicated adapter project boundary.
2. Expose current capabilities:
   - canvas/a2ui
   - camera snap/clip
   - screen.record
   - location
   - sms.send (when supported/permitted)

---

## 7) Execution Plan (Spec -> Build -> Validate)

### Phase A: Contract freeze

1. Extend runtime taxonomy (`runtime-operations.ts`) with `device.host.*`.
2. Extend external adapter operation set with `adapter.control.start`.
3. Update specs:
   - this document
   - `ADAPTER_INTERFACE_UNIFICATION.md`
   - `ADAPTER_SDK_OPERATION_MODEL_CUTOVER.md`

### Phase B: Runtime core implementation

1. Implement `device.host.*` handlers in control-plane.
2. Add adapter-control session manager in adapter manager.
3. Wire `adapter.control.start` stream framing and lifecycle.
4. Remove runtime `nodeHandlers` surface and legacy node event plumbing.

### Phase C: IAM/entity cutover

1. Replace node-pair persistence usage with device-pair persistence.
2. Create/update device entities on pairing approval.
3. Remove `node` system-origin special-casing.
4. Remove legacy node contact seeding from bootstrap.

### Phase D: SDK updates (TS + Go)

1. Add `adapter.control.start` operation type.
2. Add control-session stream helpers and typed frame schema.
3. Add endpoint registry + invoke responder helpers in SDK runtime.
4. Add conformance tests for control-session behavior.

### Phase E: Adapter/app migration

1. Create dedicated device adapter projects for headless/iOS/macOS/Android.
2. Port current capability handlers into those projects.
3. Register auth manifests + custom setup flows where needed.
4. Remove in-tree legacy node CLI/tool coupling from `nex` core.

### Phase F: Hard deletion + docs

1. Delete:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods/nodes.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/node-registry.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/infra/node-pairing.ts`
   - node-only CLI/agent tool paths still targeting `node.*`
2. Remove `node.pair.*` broadcasts and docs.
3. Update docs/CLI help to canonical `device.host.*` terminology.

---

## 8) Validation Requirements

### 8.1 Automated

1. `nex` unit/e2e suites pass with `node.*` removed from taxonomy and handlers.
2. SDK TS/Go test suites pass with new `adapter.control.start` contract.
3. Adapter conformance tests validate endpoint lifecycle + invoke result behavior.

### 8.2 End-to-end

1. Pair each adapter type (headless, iOS, macOS, Android) through `device.pair.*`.
2. Validate `device.host.list` / `device.host.describe` fidelity.
3. Validate representative invokes per platform.
4. Validate device-originated event ingest path enters canonical `event.ingest` pipeline and IAM/audit records are present.

---

## 9) Non-Goals

1. Multi-hop "apps on apps" composition in this cutover.
2. Marketplace-style tenant isolation/permissions.
3. Backwards-compatible legacy `node.*` aliases.
