# SPEC: Frontdoor Server-First App Entitlement and Install Model (Hard Cutover)

Date: 2026-02-27  
Owner: GlowBot + Spike + Nexus Frontdoor + nex runtime  
Mode: Hard cutover (no legacy fallback behavior)  
Status: Approved canonical target (Option 3 locked)

Depends on:

1. `FRONTDOOR_CANONICAL_APP_SLOT_ARCHITECTURE_HARD_CUTOVER_2026-02-27.md`
2. `CROSS_DOC_ALIGNMENT_FRONTDOOR_APP_SLOT_2026-02-27.md`
3. `SPEC-spike-frontdoor-product-aware-routing-allocation-policy-hard-cutover-2026-02-27.md`

---

## 1) Customer Experience Goal (North Star)

Customers should only need to reason about two things:

1. **Servers** (how many isolated runtime environments they have).
2. **Apps** (which products are installed on those servers).

Canonical UX commitments:

1. Frontdoor always lands users in a **Server Dashboard** card view, even if they have only one server.
2. Selecting a server opens a **Server Detail** view showing app cards installed on that server.
3. Users can browse owned apps and discover new apps in an **App Center** / **App Store** flow.
4. Product pages route users into frontdoor with purchase intent; frontdoor decides whether to buy server + app, app only, or just launch.

---

## 2) Canonical Terminology

1. **Server** (customer-facing): the isolation boundary currently represented by frontdoor workspace/tenant runtime.
2. **App**: installable product surface running through `/app/<app_id>`.
3. **Adapter**: connector primitive for external systems.
4. **Nex SDK**: shared SDK used to build apps and adapters.

Rules:

1. App and Adapter remain separate runtime primitives.
2. Internal IDs can remain `workspace_id` for now; UI language is `server`.
3. `control` app remains platform-default on all servers.

---

## 3) Hard-Cutover Product Decisions (Locked)

1. Frontdoor is canonical (`frontdoor.nexushub.sh`).
2. Server list/dashboard is always shown; no single-server bypass.
3. Server detail always shows installed app cards (including control/runtime defaults).
4. First purchase auto-provisions one server and auto-installs the selected app.
5. If user loses app entitlement, app card stays visible but is disabled/greyed and cannot launch.
6. Post-checkout destination is server dashboard, not special onboarding flow.
7. Launch-contract edge cases are deferred; server/app ownership and install model ships first.
8. Billing implementation detail is deferred; ownership/install models and controls are in-scope now.
9. Option 3 is locked for first-purchase server creation:
   - `POST /api/servers` remains operator/policy guarded (`server_creation_forbidden` for non-allowed users).
   - Signed-in customer self-serve creation for zero-server flows is executed by entry orchestration (`create_server_and_install`) through autoprovision.
   - No legacy fallback path or manual operator action is required for canonical product entry.

---

## 4) Entry Intent and Outcome Matrix

### 4.1 Entry intent contract from product pages

Product pages should link to frontdoor with:

1. `app_id` (required): `glowbot` or `spike`.
2. `entry_source` (required): product page/source slug.
3. Optional `server_id` (if user explicitly chose a server in prior flow).
4. Optional `create_new_server=true` (explicit user intent to provision a new server even when existing servers are available).

### 4.2 Required outcome matrix

1. **No server + no app entitlement**
   - Authenticate.
   - Create server (default smallest profile).
   - Grant app entitlement.
   - Install app on created server.
   - Land on server dashboard showing provisioning/install progress.

2. **Has server(s) + missing app entitlement**
   - Authenticate.
   - Complete app entitlement purchase.
   - Prompt/select target server (or use explicit `server_id` intent).
   - Install app on target server.
   - Land on server dashboard.

3. **Has server(s) + has app entitlement**
   - Authenticate.
   - Land on server dashboard.
   - User opens server and launches app (or installs app on an additional server).

---

## 5) Information Architecture (Frontdoor)

## 5.1 Top-level sections

1. `Servers` (default)
2. `Apps` (owned apps and where installed)
3. `Store` (discover/purchase apps)
4. `System` (runtime/admin areas; existing control-plane surfaces)

## 5.2 Servers view (always shown)

1. Card list of all servers.
2. Generated friendly names for each server (editable later).
3. Per-card state badges:
   - `ready`
   - `provisioning`
   - `degraded`
   - `failed`
4. Server actions:
   - open server detail
   - create server
   - delete server (policy-controlled)

## 5.3 Server detail view

1. App card grid for selected server.
2. Includes default platform apps (`control`, base runtime surfaces).
3. App card states:
   - `installed`
   - `installing`
   - `not_installed`
   - `blocked_no_entitlement`
   - `blocked_runtime_missing`
   - `blocked_runtime_unavailable`
   - `install_failed`
4. Actions:
   - launch installed app
   - install owned app not yet installed
   - view install logs/errors

## 5.4 Apps view

1. Owned app catalog.
2. For each app, show install footprint across servers.
3. Manage app ownership/subscription metadata (initially read-only if billing integration is pending).

## 5.5 Store view

1. Catalog of available apps.
2. Initial available apps: `glowbot`, `spike`.
3. Purchase CTA routes through frontdoor checkout/entitlement flow.

---

## 6) Runtime and Provisioning Model

## 6.1 Server-first allocation policy

1. Server provisioning is independent from app purchase.
2. App entitlement is independent from server count.
3. App installation is a server-scoped operation requiring both:
   - account app entitlement
   - target server selection

## 6.2 Install model

1. Installing an app writes server-level app-slot config.
2. App install can be repeated across multiple servers.
3. App uninstall policy is deferred, but install-state transitions must be explicit and observable now.

## 6.3 App-slot technical contract alignment

1. App slots keep canonical `kind: static|proxy` behavior.
2. App backend contracts remain runtime-native namespaces (`glowbot.*`, `spike.*`).
3. No silent fallback from requested app to control app.

---

## 7) Data Model Additions (Conceptual Contract)

These entities define behavior; physical schema names may map to existing frontdoor tables.

1. `servers`
   - `server_id` (maps to `workspace_id`)
   - `display_name`
   - `status`
   - `runtime_profile`
   - `created_at_ms`, `updated_at_ms`

2. `app_entitlements`
   - `user_id`
   - `app_id`
   - `status` (`active`, `inactive`, `revoked`)
   - `granted_at_ms`, `expires_at_ms`

3. `server_app_installs`
   - `server_id`
   - `app_id`
   - `status` (`not_installed`, `installing`, `installed`, `failed`, `blocked_no_entitlement`)
   - `installed_at_ms`
   - `last_error`

4. `server_provision_requests`
   - `request_id`
   - `user_id`
   - `status` (`queued`, `running`, `succeeded`, `failed`)
   - `server_id` (when assigned)
   - `created_at_ms`, `updated_at_ms`

---

## 8) Frontdoor API Surface (Target Contract)

## 8.1 Servers

1. `GET /api/servers` -> list servers for user.
2. `POST /api/servers` -> create server (default runtime profile unless overridden by operator policy).
3. `GET /api/servers/:serverId` -> server detail/status.
4. `DELETE /api/servers/:serverId` -> delete server (policy/role restricted).

## 8.2 Server apps

1. `GET /api/servers/:serverId/apps` -> app install inventory + states.
2. `POST /api/servers/:serverId/apps/:appId/install` -> start install.
3. `GET /api/servers/:serverId/apps/:appId/install-status` -> install progress/details.

## 8.3 App ownership/store

1. `GET /api/apps/owned` -> account app entitlements.
2. `GET /api/apps/catalog` -> store apps.
3. `POST /api/apps/:appId/purchase` -> entitlement flow entry (billing internals deferred).

## 8.4 Entry intent handling

1. `GET /api/entry/resolve?app_id=<id>&entry_source=<src>&server_id=<optional>`
2. Returns deterministic action plan:
   - `create_server_and_install`
   - `purchase_app_then_install`
   - `install_on_selected_server`
   - `dashboard_only`
3. `POST /api/entry/execute`
4. Executes the resolver action in server-first mode:
   - `create_server_and_install`: provisions a server when user has zero active servers, grants entitlement, installs app, and sets active/default server for the session.
   - `purchase_app_then_install`: grants entitlement and installs on selected/recommended server.
   - `install_on_selected_server`: installs when entitlement is active and server admin access is valid.
   - `dashboard_only`: no-op, returns current state.
5. Explicit `create_server_and_install` error contract (no silent fallback):
   - `autoprovision_disabled`
   - `autoprovision_identity_unavailable`
   - `autoprovision_failed`
   - `autoprovision_tenant_missing`
   - `autoprovision_runtime_missing`
6. `POST /api/entry/execute` supports explicit new-server intent:
   - request body `create_new_server: true` forces `action_requested = create_server_and_install` for signed-in users with existing servers.
   - this is canonical for "Provision product workspace" UX when user intentionally wants an additional server.

---

## 9) UI Behavior Requirements

1. Server dashboard must render even with one server.
2. All long-running actions must expose explicit progress and error states:
   - server provisioning
   - app install
   - entitlement verification
3. Disabled app cards must show reason (for example: entitlement revoked).
4. Launch buttons are only enabled for `installed` + `entitlement active`.
5. Runtime catalog must include the app slot for launch to be enabled; missing runtime app slot is surfaced as an explicit blocked state (`runtime_app_missing`).
6. Entry from product page should preserve intent and show status messaging in dashboard context.

---

## 10) Migration and Cutover

1. Existing `workspace` records are re-labeled as `server` in frontdoor UI.
2. Existing product-scoped launch mappings are migrated into:
   - account app entitlements
   - server app installs
3. Legacy product-only autoprovision paths are superseded by server-first resolver.
4. Any legacy user landing path must end in server dashboard, not direct workspace/product special casing.

---

## 11) Validation Ladder

1. `L0` Spec alignment: this spec + canonical app-slot specs contain no contradictions.
2. `L1` Unit tests: resolver, entitlement checks, install state transitions.
3. `L2` Contract tests: server/app APIs return deterministic action plans and states.
4. `L3` Local integration: first-purchase flow (`create_server_and_install`) provisions server + installs app with visible progress and session default-server update.
5. `L4` Hosted smoke: frontdoor dashboard shows servers, server detail app cards, install actions.
6. `L5` Cross-app validation: same user installs both GlowBot and Spike on one server.
7. `L6` Entitlement-loss validation: revoked entitlement disables launch and greys card.
8. `L7` Production E2E: product-page click -> auth -> dashboard -> app available and launchable.

---

## 12) Execution Plan

1. **Phase A: Model + API**
   - Add server alias APIs and app entitlement/install state APIs.
   - Implement entry-intent resolver.
   - Implement entry-intent executor (`POST /api/entry/execute`) with Option 3 self-serve server provisioning path.

2. **Phase B: Frontdoor IA**
   - Replace workspace-centric default shell with server dashboard default.
   - Add server detail app-card view.
   - Add apps/store views.

3. **Phase C: Provision + install orchestration**
   - Implement auto-provision + auto-install path for first purchase.
   - Implement install-on-existing-server path.

4. **Phase D: Migration**
   - Backfill server/app install states from current workspace/product data.
   - Remove legacy product-scoped UX branches.

5. **Phase E: Hosted validation + evidence**
   - Execute validation ladder L1-L7.
   - Publish evidence bundle and close tracker item.

---

## 13) Explicitly Deferred (Not Blocking This Cutover)

1. Billing plan tiers and pricing mechanics.
2. Advanced launch-contract variants and app health routing policy.
3. Guided onboarding/tutorial UX.
4. Token-usage monetization model.
