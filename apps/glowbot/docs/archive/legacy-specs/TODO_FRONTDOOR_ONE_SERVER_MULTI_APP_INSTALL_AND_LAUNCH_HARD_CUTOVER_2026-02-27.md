# TODO: Frontdoor One-Server Multi-App Install and Launch (Hard Cutover)

Date: 2026-02-27
Status: In progress (hosted authenticated certification pending)
Parent Spec: `SPEC_FRONTDOOR_ONE_SERVER_MULTI_APP_INSTALL_AND_LAUNCH_HARD_CUTOVER_2026-02-27.md`

Canonical references:
1. `SPEC_FRONTDOOR_SERVER_FIRST_APP_ENTITLEMENT_AND_INSTALL_HARD_CUTOVER_2026-02-27.md`
2. `FRONTDOOR_CANONICAL_APP_SLOT_ARCHITECTURE_HARD_CUTOVER_2026-02-27.md`
3. `EXECUTION_TRACKER_FRONTDOOR_APP_SLOT_E2E_HARD_CUTOVER_2026-02-27.md`

---

## 1) Intent

Ship the customer-visible model where one server can host multiple apps (`glowbot`, `spike`) and installing a second app defaults to the existing selected server, not an implicit second server.

---

## 2) Current Gap Snapshot (Ground Truth)

- [x] Planner supports install-on-selected-server.
- [x] Runtime app-slot truth gating exists (`runtime_app_missing` / `runtime_unavailable`).
- [x] Data model supports per-server multi-app installs.
- [x] Frontdoor product provision button defaults to forced new-server creation.
- [x] Server app install endpoint does not complete runtime attach/reconcile lifecycle.
- [x] Provisioner remains product-shaped (`spike` branch + glowbot-specific app config path).
- [x] Runtime app identity still uses transition aliasing (`spike-runtime -> spike`).

---

## 3) Workplan (Clear -> Ambiguous)

## Phase P0: Spec and tracker lock

- [x] Add this TODO + parent spec to canonical execution tracker references.
- [x] Confirm no naming conflicts with existing server-first and app-slot specs.

Validation:
- [x] `L0` docs cross-check complete.

## Phase P1: Frontdoor UX intent semantics (customer-facing)

- [x] Replace default "Provision product workspace" behavior with explicit two actions:
  - `Install app on selected server` (default when server exists).
  - `Create another server and install app` (explicit).
- [x] Keep explicit `create_new_server: true` only on dedicated new-server action.
- [x] Ensure status messaging makes action intent clear before execute.

Validation:
- [x] `L1` frontdoor shell tests updated.
- [ ] `L5` browser check: second app install on same server path is primary/default.

## Phase P2: Install orchestration hard cutover (server-scoped)

- [x] Introduce runtime app-slot attach operation for server app installs.
- [x] Update `POST /api/servers/:serverId/apps/:appId/install` to:
  - set `installing`,
  - apply runtime config mutation,
  - reconcile via `/runtime/api/apps`,
  - then set `installed` or `failed`.
- [x] Persist actionable `last_error` on failure.

Validation:
- [x] `L1` unit tests for install state transitions.
- [x] `L2` contract tests for install endpoint and install-status endpoint.
- [x] `L3` local integration: install transitions visible end-to-end.

## Phase P3: Provisioner de-product-shaping (neutral server profile)

- [x] Refactor autoprovision/provision command so new server provisioning is neutral and app-agnostic.
- [x] Move app attachment/install responsibility to install orchestration path.
- [x] Keep product mapping as launch preference only.

Validation:
- [x] `L2` resolver/provision tests verify no implicit product-bound server creation for existing eligible server.
- [x] `L4` explicit new-server flow still works via `create_new_server`.

## Phase P4: Canonical app identity convergence

- [x] Remove runtime alias dependency (`spike-runtime -> spike`) by making runtime catalog and install contract canonical on `spike`.
- [x] Update tests/spec evidence accordingly.

Validation:
- [x] `L1`/`L2` tests pass with no alias requirement.
- [x] `L6` no false-ready launch states from identity mismatch.

## Phase P5: Hosted one-server dual-app certification

- [ ] Hosted flow: create or use one server, install `glowbot`, install `spike` on same server, launch both. (blocked: no authenticated production session from current environment)
- [ ] Capture evidence bundle:
  - servers API snapshot,
  - server apps inventory showing both installed,
  - runtime apps snapshot showing both slots present,
  - browser launch proof for both apps.

Validation:
- [ ] `L5` hosted browser flow pass.
- [ ] `L6` blocked-state regression checks pass.

---

## 4) Acceptance Checklist

- [ ] One server can host and launch both `glowbot` and `spike`. (hosted evidence pending)
- [ ] Second app install does not create a second server unless explicitly requested. (hosted browser proof pending)
- [x] Install state reflects runtime attach truth, not DB writes alone.
- [x] Frontdoor UI clearly separates install vs new-server actions.
- [x] Canonical app IDs are consistent across frontdoor/runtime/UI.

---

## 5) Out of Scope (for this burn-down)

- [ ] Billing pricing engine and invoicing UX.
- [ ] Server resize/tier management UX.
- [ ] Advanced app uninstall lifecycle.
