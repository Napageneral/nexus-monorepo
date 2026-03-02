# Hosted Oracle + Multi-UI Integration (Single Tenant Runtime)

**Status:** DESIGN LOCKED (planning)  
**Owner:** Nexus Runtime + Frontdoor + Oracle  
**Last Updated:** 2026-02-24

---

## 1. Objective

Define the canonical architecture and UX for:

1. Oracle GitHub App integration per tenant runtime
2. Oracle product UI served from the same tenant runtime as Control UI
3. Multi-UI selection from frontdoor for one workspace
4. Oracle operations flowing through NexusEvent -> IAM -> runAutomations -> ledger/audit, with agent execution only when required

This spec is a **hard cutover** design. No backward-compatibility paths are retained once cutover starts.

---

## 2. Customer Experience First (Canonical UX)

### 2.1 Hosted Entry

1. User opens product shell (Vercel frontend).
2. User signs up/logs in (Google OAuth first, password fallback allowed).
3. Shell loads workspace memberships from frontdoor.
4. User selects a workspace.
5. User selects an app within that workspace (Control, Oracle, future apps).
6. Browser launches selected app on the tenant runtime with frontdoor-minted runtime token bootstrap.

### 2.2 First-time Oracle Onboarding

1. User switches to Oracle app.
2. Oracle UI shows "Connect GitHub" setup if no installation exists.
3. User is sent through GitHub App install flow.
4. GitHub redirects and sends webhook events to the tenant runtime Oracle ingress.
5. Tenant runtime stores installation state and starts indexing jobs.
6. Oracle UI transitions to repo/index status and query surface.

### 2.3 Day-2 Usage

1. User stays in same workspace and switches apps with one app switcher.
2. Oracle queries (`ask`, status, sync) run from Oracle UI/API.
3. Requests are IAM-scoped to workspace principal.
4. GitHub webhook updates trigger sync/index automatically.

---

## 3. Scope Boundaries

Current code reality (2026-02-24):

1. runtime exposes **control-plane** and **ingress** listener trust zones.
2. agent ingress dispatches through `dispatchNexusEvent -> nex.processEvent` for protocol paths that represent event work.
3. this spec keeps trust-zone separation by surface semantics; concrete listener/port topology is deploy-time configuration.

### 3.1 Frontdoor responsibilities (and only these)

1. AuthN (session, OAuth/OIDC, password fallback)
2. Workspace membership resolution + role/scopes at workspace level
3. App launch bootstrap (runtime token mint + runtime endpoint descriptor)
4. Workspace/app selection state for shell UX
5. Reverse proxy/bootstrap functions where required by hosted contract

### 3.2 Tenant runtime responsibilities

1. Serve app UIs (Control + Oracle + future) from runtime app mounts
2. Enforce IAM/AuthZ for app APIs and ingress
3. Own Oracle data plane and control plane for that workspace
4. Run Oracle indexing/query services inside tenant boundary
5. Emit Nexus bus/audit events and persist ledger traces

### 3.3 Oracle module responsibilities

1. GitHub App install callback + webhook handling
2. Installation/repo/token metadata persistence
3. Indexing job orchestration (init/sync)
4. Query endpoints + MCP/API bridge
5. Oracle UI API/backend for setup/status/query workflows

---

## 4. Decision: Frontdoor does NOT own Oracle GitHub internals

Frontdoor does **not** implement GitHub App webhooks, repo sync logic, or Oracle storage.

Rationale:

1. Keeps frontdoor generic for all products.
2. Preserves strict tenant isolation (customer code data and GitHub installation scope stay in tenant runtime).
3. Avoids product-coupling frontdoor debt.
4. Aligns with one-runtime-per-customer isolation strategy.

---

## 5. Multi-UI Serving Model (Tenant Runtime)

### 5.1 Canonical runtime app mount model

Tenant runtime serves apps under one namespace:

- `/app/control/*` -> Control UI
- `/app/oracle/*` -> Oracle UI
- `/app/<future-app>/*` -> future app UIs

No bare `/app/*` default route after cutover. Caller must specify app id.

### 5.2 App registry (runtime)

Add runtime app registry configuration (conceptual):

- `runtime.apps.control` (enabled, root, bootstrap settings)
- `runtime.apps.oracle` (enabled, root, bootstrap settings)
- each app entry includes `id`, `display_name`, `root`, `api_prefixes`, `default_route`

Runtime exposes app catalog endpoint for authenticated clients:

- `GET /api/apps` -> available apps for current principal/workspace (IAM-filtered)

### 5.3 API namespace model

Per-app API is namespaced for clarity and IAM policying:

- `/api/control/*`
- `/api/oracle/*`

Ingress bridges remain ingress-surface owned, not control-plane-surface owned.

### 5.4 Runtime app catalog contract

Tenant runtime publishes canonical app descriptors:

- `GET /api/apps`

Example response:

```json
{
  "ok": true,
  "items": [
    {
      "app_id": "control",
      "display_name": "Control",
      "entry_path": "/app/control/chat",
      "api_base": "/api/control",
      "icon": "control-panel",
      "order": 10
    },
    {
      "app_id": "oracle",
      "display_name": "Oracle",
      "entry_path": "/app/oracle/",
      "api_base": "/api/oracle",
      "icon": "tree",
      "order": 20
    }
  ]
}
```

Rules:

1. Runtime filters items by IAM for current principal.
2. Frontdoor/UI never hardcodes app list as source of truth.
3. App launch path always originates from descriptor `entry_path`.

### 5.5 App package/install model (tenant runtime)

Canonical install unit is an **App Package**.

Each package contains:

1. app manifest (`app_id`, `display_name`, routes, api namespaces)
2. UI assets (build output mounted under `/app/<app_id>/`)
3. runtime module handlers (control-plane + ingress bindings)
4. optional automations seed bundle
5. optional adapter registration payload
6. optional DB migration pack

Install operation (conceptual):

1. register app manifest in runtime app registry
2. apply DB migrations (if any)
3. seed automations/hooks (if any)
4. register adapter modules (if any)
5. expose app descriptor in `/api/apps`

Removal operation:

1. disable app in registry
2. stop app adapters/automations
3. keep data by default unless explicit purge is requested

---

## 6. Frontdoor Multi-UI UX Model

### 6.1 Workspace + app switcher

Frontdoor shell always provides:

1. Workspace switcher (membership-scoped)
2. App switcher (workspace-scoped, IAM-filtered)

Launch semantics:

- Frontdoor computes target runtime from selected workspace.
- Frontdoor mints runtime token for selected workspace + principal.
- Browser opens `https://<frontdoor>/app/<app_id>/...` (or direct runtime contract where configured).

### 6.2 App catalog source of truth

App availability is runtime-driven, filtered by IAM:

1. Frontdoor asks runtime app catalog (`/api/apps`) using scoped token.
2. Frontdoor renders only allowed apps.
3. Runtime remains final authority for API/UI access.

---

## 7. Oracle in NexusEvent Pipeline (Current Model Compatible)

This design assumes current NEX behavior where non-agent events are first-class.

Canonical flow for Oracle API requests:

1. ingress/control API receives request
2. normalize -> `NexusEvent`
3. `receiveOperation -> resolvePrincipals -> resolveAccess -> executeOperation (event.ingest path)`
4. if operation is handled (query/status/sync) -> finalize/deliver without `runAgent`
5. only workflows requiring agent reasoning continue to `assembleContext -> runAgent`

This is already aligned with the implemented split-phase pipeline behavior.

---

## 8. Oracle Surface Decomposition (Adapter/Automation/Plugin)

### 8.1 Internal adapter submodule

Add `oracle-http` as a submodule under internal `http-ingress` adapter for external Oracle protocol ingress:

- GitHub webhook receiver
- Oracle REST API ingress endpoints
- optional MCP HTTP ingress bridge

### 8.2 Automations

Use automations for event-driven execution:

- webhook event -> queue sync/index job
- scheduled health/reindex events (clock adapter)
- maintenance compaction/cleanup

### 8.3 Plugins

Use plugins for cross-cutting behavior only:

- observability enrichment
- policy/audit augmentation
- shared request instrumentation

No Oracle business logic in generic plugin layer.

---

## 9. GitHub App Integration (Per Tenant)

### 9.1 Required Oracle endpoints (tenant runtime)

Control/API:

1. `GET /api/oracle/github/install-url`
2. `GET /api/oracle/github/installations`
3. `POST /api/oracle/repos/:repo_id/sync`
4. `GET /api/oracle/repos/:repo_id/status`
5. `POST /api/oracle/ask`

Ingress:

1. `POST /ingress/oracle/github/webhook`

### 9.2 Persistence ownership

Store in tenant-controlled DB/state:

1. GitHub installation metadata
2. repo bindings and status
3. webhook delivery ledger/idempotency
4. indexing jobs and state
5. token cache metadata (encrypted secret material where applicable)

No Oracle installation/repo state in frontdoor DB.

---

## 10. Security and IAM

### 10.1 Identity rules

1. Frontdoor token claims provide principal/workspace identity for UI/API calls.
2. GitHub webhook principal is derived from verified signature + installation binding.
3. Request body fields never override principal identity.

### 10.2 IAM taxonomy extension

Add Oracle actions (examples):

- `oracle.app.read`
- `oracle.ask.create`
- `oracle.repo.read`
- `oracle.repo.sync`
- `oracle.github.install.manage`
- `oracle.webhook.receive` (service/internal)

### 10.3 Hard cutover constraints

1. No legacy direct Oracle endpoints outside namespaced runtime/app model.
2. No bypass path that executes Oracle actions outside NexusEvent + IAM.
3. No frontdoor-side Oracle data storage.

---

## 11. Implementation Workplan (Planning Level)

### Phase 1 — Runtime Multi-UI Foundation

1. Add runtime app registry config + resolver.
2. Add `/app/<app_id>/` static serving with strict app mount lookup.
3. Add `/api/apps` app catalog endpoint (IAM-filtered).
4. Remove bare `/app/*` fallback.

### Phase 2 — Frontdoor Multi-UI Launch

1. Extend shell to select app per workspace.
2. Add launch flow for `workspace + app`.
3. Consume runtime app catalog.
4. Enforce workspace/app IAM at launch and token mint boundaries.

### Phase 3 — Oracle Runtime Module (in-process target)

1. Add Oracle API module under runtime app namespace.
2. Add Oracle ingress module (`oracle-http`) under `http-ingress` adapter.
3. Map Oracle operations to NexusEvent + runAutomations-first handling.
4. Add Oracle UI bundle mount at `/app/oracle/`.

### Phase 4 — GitHub App Integration

1. Implement install URL + installation callback handling.
2. Implement webhook signature verification + idempotent delivery handling.
3. Implement installation token lifecycle.
4. Wire sync/index jobs + status surfaces.

### Phase 5 — Validation

1. End-to-end browser flow: login -> workspace -> app switch -> open Oracle UI.
2. GitHub install flow e2e against test app.
3. Webhook -> index job -> status update e2e.
4. Oracle ask/status/sync API tests through NexusEvent/IAM path.
5. Security tests: spoof attempts on webhook/user identity fields denied.

---

## 12. Validation Matrix (Must Pass)

1. Frontdoor cannot route user to workspace they are not a member of.
2. Runtime token workspace claim must match runtime tenant pin.
3. User without Oracle scope cannot see Oracle app in catalog.
4. User without Oracle scope cannot call `/api/oracle/*`.
5. GitHub webhook with invalid signature is rejected.
6. Oracle API requests generate NexusEvent trace and IAM decision artifacts.
7. Non-agent Oracle operations complete without invoking `runAgent`.
8. App switching between Control and Oracle works without re-auth breakage.

---

## 13. Explicit Non-Goals (for this spec)

1. Sidecar deployment architecture as canonical target.
2. Embeddable iframe webchat productization.
3. Full Oracle in-process Go migration details.
4. Cross-workspace shared Oracle index data.

---

## 14. Next Planning Output

After this design is approved, create one implementation spec per phase:

1. `../workplans/RUNTIME_MULTI_UI_CUTOVER.md`
2. `FRONTDOOR_MULTI_UI_LAUNCH.md`
3. `ORACLE_RUNTIME_MODULE.md`
4. `ORACLE_GITHUB_APP_INTEGRATION.md`
5. `ORACLE_E2E_VALIDATION_PLAN.md`
