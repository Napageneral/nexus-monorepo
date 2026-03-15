# SPEC: Frontdoor One-Server Multi-App Install and Launch (Hard Cutover)

Date: 2026-02-27
Owner: GlowBot + Spike + Nexus Frontdoor + nex runtime
Mode: Hard cutover (no legacy fallback behavior)
Status: Proposed detailed execution spec (customer-UX-first)

Depends on:
1. `FRONTDOOR_CANONICAL_APP_SLOT_ARCHITECTURE_HARD_CUTOVER_2026-02-27.md`
2. `SPEC_FRONTDOOR_SERVER_FIRST_APP_ENTITLEMENT_AND_INSTALL_HARD_CUTOVER_2026-02-27.md`
3. `EXECUTION_TRACKER_FRONTDOOR_APP_SLOT_E2E_HARD_CUTOVER_2026-02-27.md`
4. `SPEC-spike-frontdoor-product-aware-routing-allocation-policy-hard-cutover-2026-02-27.md`

---

## 1) Customer Intention and Desired UX (North Star)

Customers reason about only two primitives:
1. **Servers**: isolated runtime environments.
2. **Apps**: installable products on those servers.

Desired behavior:
1. Frontdoor always opens to a **Servers** list (even when there is only one server).
2. User selects a server and sees **all apps on that server** (installed, installing, blocked, not installed).
3. User can install both `glowbot` and `spike` on the same server.
4. New server creation happens only when user explicitly requests it, or when user has zero servers.
5. Launch is enabled only when runtime app slot actually exists on the selected server.
6. If entitlement is missing/revoked, app card remains visible but disabled with explicit reason.

---

## 2) Canonical UX Journeys (Required)

## 2.1 First purchase, no servers

1. User arrives from a product page with app intent (`app_id` + `entry_source`).
2. User signs in with Google.
3. Frontdoor creates one server, grants app entitlement, installs app on that server.
4. User lands on Servers dashboard and sees provisioning/install status.
5. After install completes and runtime catalog confirms slot exists, launch button activates.

## 2.2 Existing user with one server, buying second app

1. User buys second app entitlement.
2. Frontdoor defaults to installing on selected/default existing server.
3. No automatic new server is created.
4. Server detail shows second app progress and then launch-ready state.

## 2.3 Explicit additional server request

1. User clicks explicit "Create new server" (or equivalent explicit intent).
2. Frontdoor provisions another server and installs requested app there.
3. New server appears in dashboard with provisioning/install states.

## 2.4 Entitlement loss

1. App remains visible on server detail.
2. App card is disabled/greyed.
3. Block reason is explicit (`entitlement_required` or policy reason).

---

## 3) Hard-Cutover Decisions (Locked in this spec)

1. `frontdoor.nexushub.sh` remains the single canonical entrypoint.
2. Multi-app on single server is first-class and default where policy allows.
3. Product-aware routing is launch preference only; it is not mandatory one-server-per-product.
4. `create_new_server` remains explicit intent only; never implicit for users who already have an eligible server.
5. No silent fallback to Control UI for non-control app routes.
6. No "DB-installed but runtime-missing" false-ready state.

---

## 4) Current State Research (as of 2026-02-27)

## 4.1 Already aligned with target

1. Planner supports `install_on_selected_server` when user has entitlement and server exists.
2. Launch readiness uses runtime truth gates and blocks with `runtime_app_missing` / `runtime_unavailable`.
3. Runtime supports first-class app slots with `kind: static|proxy`.
4. Store data model already supports many apps per server (`PRIMARY KEY(workspace_id, app_id)`).

## 4.2 Gaps causing product-shaped behavior

1. Frontdoor shell "Provision product workspace" currently forces `create_new_server: true`.
2. Entry execute hard-forces `create_server_and_install` when `create_new_server` is true.
3. `create_server_and_install` calls autoprovision with `productId = appId` and writes workspace `productId`, reinforcing product-coupled provisioning.
4. Provisioner has explicit `product_id === "spike"` branch to shared Spike runtime binding, while non-Spike path configures tenant runtime with optional GlowBot app slot only.
5. Server app install endpoint marks install state in DB but does not perform runtime app-slot attach/config mutation.
6. Runtime app ID alias (`spike-runtime -> spike`) is still used to bridge mismatch.

---

## 5) Target System Contract (One Server, Many Apps)

## 5.1 Server provisioning contract

1. Provisioning creates a **neutral server runtime profile** (Control baseline + app-slot capability), not a product-bound runtime.
2. App installation is performed after provisioning via app attach/install flow.
3. New server naming/product mapping must not imply single-product lock.

## 5.2 App install contract (server-scoped)

`POST /api/servers/:serverId/apps/:appId/install` must:
1. Validate entitlement and admin access.
2. Move install state `not_installed -> installing`.
3. Apply runtime app-slot config mutation for `appId` on target server runtime (static/proxy as configured).
4. Reconcile runtime app catalog (`/runtime/api/apps`) and only then set status to `installed`.
5. Set `failed` with `last_error` if attach/reconcile fails.

## 5.3 Entry execution contract

1. For signed-in users with existing eligible server:
   - default action is install on selected/recommended server.
2. For users with zero servers:
   - `create_server_and_install` remains canonical.
3. For explicit user request:
   - `create_new_server: true` keeps forcing new server creation.
4. `create_server_and_install` should provision neutral server then install requested app, not provision product-shaped runtime.

## 5.4 Canonical app identity contract

1. Product app IDs and runtime app IDs should be 1:1 canonical (`spike` not `spike-runtime` bridge mode).
2. Transitional aliasing can remain only until migration is complete; hard-cutover exit removes alias dependency.

---

## 6) UX Contract in Frontdoor Shell

## 6.1 Servers view (default, always)

1. Card list with generated names and statuses.
2. Each card links to server detail app grid.
3. Explicit action for creating another server.

## 6.2 Server detail view

1. App cards for `control`, `glowbot`, `spike` (and future apps).
2. Card states: `installed`, `installing`, `not_installed`, `blocked_no_entitlement`, `runtime_app_missing`, `runtime_unavailable`, `failed`.
3. Action buttons:
   - `Launch` when launchable.
   - `Install` when entitled + not installed.
   - disabled state with reason when blocked.

## 6.3 Store/App center

1. Purchase grants account app entitlement.
2. After purchase, flow returns to server context and requests install target server (if ambiguous).

---

## 7) Gap Matrix (Where We Are -> Target)

1. **G1 Intent default mismatch**
   - Current: explicit product provision path often creates extra server.
   - Target: existing-server install is default; new server only explicit.

2. **G2 Install orchestration incomplete**
   - Current: install endpoint mainly writes DB state.
   - Target: install endpoint performs runtime attach + reconciliation.

3. **G3 Provisioner product coupling**
   - Current: `spike` and `glowbot` are provisioned through product-shaped branches.
   - Target: neutral server provisioning plus app attach flow.

4. **G4 App ID inconsistency**
   - Current: runtime alias bridge (`spike-runtime -> spike`).
   - Target: single canonical app ID across frontdoor/runtime/UI.

5. **G5 UX action semantics**
   - Current: "Provision product workspace" language and default flow can imply per-product server fan-out.
   - Target: explicit split between "Install app on this server" and "Create another server".

---

## 8) Validation Ladder for This Spec

1. `L0` Spec gate: this document and canonical specs are conflict-free.
2. `L1` Unit/contract gate: resolver/install/provision tests pass with new semantics.
3. `L2` Install attach gate: install endpoint mutates runtime app slot and reconciles runtime catalog.
4. `L3` Single-server dual-app gate: same server reports both `glowbot` and `spike` installed and launchable.
5. `L4` Explicit-new-server gate: `create_new_server` produces second server only when requested.
6. `L5` Hosted browser gate: user signs in, installs second app on existing server, launches both from one server detail view.
7. `L6` Regression gate: unsupported app/server pair surfaces deterministic blocked state, never false launch-ready.

---

## 9) Non-Goals (Deferred)

1. Billing charge model and pricing math.
2. Advanced server sizing UX.
3. App uninstall/delete lifecycle polish.
4. Multi-user org policy controls beyond current membership model.

---

## 10) Exit Criteria (Done Definition)

1. A user with one server can install and launch both `glowbot` and `spike` from that same server.
2. No implicit second server is created during second-app purchase/install.
3. App launch readiness reflects runtime truth, not DB state alone.
4. Canonical frontdoor UX consistently communicates install/provision progress and blocked reasons.
