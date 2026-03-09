# Execution Tracker: Frontdoor App-Slot E2E Hard Cutover

Date: 2026-02-27  
Status: active execution tracker  
Primary owner: product architecture + implementation team

Canonical references:

1. `FRONTDOOR_CANONICAL_APP_SLOT_ARCHITECTURE_HARD_CUTOVER_2026-02-27.md`
2. `CROSS_DOC_ALIGNMENT_FRONTDOOR_APP_SLOT_2026-02-27.md`
3. `SPEC-spike-frontdoor-product-aware-routing-allocation-policy-hard-cutover-2026-02-27.md`
4. `TODO-spike-frontdoor-product-aware-routing-allocation-policy-hard-cutover-2026-02-27.md`
5. `EVIDENCE_FRONTDOOR_APP_SLOT_E2E_HARD_CUTOVER_2026-02-27.md`
6. `SPEC_FRONTDOOR_PROXY_NEXT_CHUNK_ROUTING_AND_SIGNED_IN_PRODUCT_PROVISIONING_HARD_CUTOVER_2026-02-27.md`
7. `SPEC_FRONTDOOR_SERVER_FIRST_APP_ENTITLEMENT_AND_INSTALL_HARD_CUTOVER_2026-02-27.md`
8. `SPEC_FRONTDOOR_ONE_SERVER_MULTI_APP_INSTALL_AND_LAUNCH_HARD_CUTOVER_2026-02-27.md`
9. `TODO_FRONTDOOR_ONE_SERVER_MULTI_APP_INSTALL_AND_LAUNCH_HARD_CUTOVER_2026-02-27.md`

---

## 1) Objective

Deliver a production-ready, reproducible end-to-end flow:

1. User lands on product domain.
2. User signs in with Google through frontdoor canonical flow.
3. Frontdoor resolves/provisions correct workspace per explicit allocation policy.
4. User launches correct tenant app (`/app/glowbot` or `/app/spike`) with no control fallback.
5. User configures adapters and receives normalized pipeline data.

---

## 2) Execution Rules

1. Hard cutover only.
2. Frontdoor canonical entrypoint.
3. App slots are first-class (`static|proxy`).
4. App backend contracts are runtime-native (`glowbot.*`, `spike.*`).
5. Tenant allocation follows explicit policy (reuse first, create when required).
6. Every phase must pass its validation gate before moving to the next.

---

## 3) Burn-Down Queue (Single Source of Truth)

- [x] `E00` Foundation lock: canonical architecture + cross-doc alignment baseline committed.
- [x] `E01` Close remaining cross-doc tail cleanup in Spike/frontdoor naming and references.
- [x] `E02` Tenant allocation policy hard cutover in frontdoor resolver/provisioner paths.
- [x] `E03` OIDC flavor/product forwarding hardening in frontdoor-web + server integration tests.
- [x] `E04` Frontdoor launch safety enforcement (control-bootstrap-only, no silent app fallback).
- [x] `E05` Runtime app-slot contract implementation (`kind: static|proxy`) + config validation.
- [x] `E06` GlowBot backend contract migration to runtime-native `glowbot.*` methods.
- [x] `E07` Tenant app deployment correctness (`/app/glowbot` identity passes in production).
- [x] `E08` UX resilience states + diagnostics (no workspace, provisioning, no app, unhealthy runtime).
- [x] `E09` Migration/backfill for legacy mappings (`product_id = NULL`, stale product routes).
- [ ] `E10` Production E2E certification and evidence bundle signoff.
- [x] `E11` Frontdoor Next proxy chunk routing + signed-in product provisioning fix (GlowBot Integrations crash + Spike self-serve path).
- [ ] `E12` Server-first dashboard + app entitlement/install lifecycle cutover (multi-app on single server as first-class UX).

---

## 4) Definition of Done Per Item

1. `E01`: no active doc conflict on shell canon, transport canon, or forced per-product tenant wording.
2. `E02`: resolver tests prove reuse-vs-create behavior exactly matches allocation policy.
3. `E03`: OIDC tests prove `flavor/product` forwarding for new and existing users.
4. `E04`: tests prove control bootstrap never injects into non-control app routes.
5. `E05`: runtime app catalog reports mode and invalid app config fails loudly.
6. `E06`: GlowBot core tabs run through runtime-native methods without required app-local bridges.
7. `E07`: launch identity smoke confirms GlowBot markers present and control markers absent.
8. `E08`: user-visible progress/error states are explicit and actionable.
9. `E09`: backfill report confirms corrected mappings with no regressions.
10. `E10`: owner can run full production flow manually with no operator intervention.
11. `E11`: `/app/glowbot/integrations` loads without Next chunk 404s and signed-in user can provision/select Spike workspace from frontdoor UI.
12. `E12`: server-first dashboard/store/install flows are deterministic, and launch readiness only reports true when runtime app slot exists for the selected app/server pair.

---

## 5) Iterative Validation Ladder

1. `L0` Spec gate: canonical decisions and tracker are aligned.
2. `L1` Static gate: lint, typecheck, and unit tests pass for touched modules.
3. `L2` Contract gate: endpoint/method contract tests pass.
4. `L3` Local integration gate: frontdoor-runtime-app launch path works locally.
5. `L4` Hosted API smoke gate: health, products, workspaces, runtime apps, diagnostics pass.
6. `L5` Launch identity gate: requested app bundle is served and verified.
7. `L6` Auth/provisioning gate: deterministic workspace resolution for new and existing users.
8. `L7` Data-path gate: connect adapter -> backfill -> live monitoring -> normalized metrics visible.
9. `L8` UX resilience gate: all required in-browser failure/progress states validated.
10. `L9` Production E2E signoff gate: full journey reproducible with evidence bundle.

---

## 6) Current Focus

1. Active item: `E12` hosted authenticated same-server dual-app certification (`glowbot` + `spike`) and evidence capture.
2. Next item: run owner walk-through on canonical frontdoor and capture APIs + browser proof artifacts for one-server dual-app launch.

---

## 7) Evidence Log (append as we execute)

| Date | Item | Gate | Result | Evidence |
|------|------|------|--------|----------|
| 2026-02-27 | E00 | L0 | pass | canonical specs + alignment addendum established |
| 2026-02-27 | E01 | L0 | pass | cross-doc tail cleanup complete; stale Spike TODO wording item closed |
| 2026-02-27 | E02 | L1/L2 | pass | `tenant-autoprovision` now enforces reuse-first mapping and only provisions when no eligible tenant exists; tests updated for reuse + fallback behavior |
| 2026-02-27 | E03 | L1/L2 | pass | frontdoor-web OIDC start now forwards `product`/`flavor`; route + shell e2e tests assert forwarding |
| 2026-02-27 | E04 | L1/L2/L3 | pass | control bootstrap injection now restricted to control app routes; regression test blocks bootstrap on `/app/glowbot` |
| 2026-02-27 | E05 | L1/L2/L3 | pass | `nex` runtime app catalog now exposes `kind` (`static|proxy`), proxy app serving path implemented, and invalid static/proxy app config returns explicit 503 launch errors |
| 2026-02-27 | E06 | L1/L2/L3 | pass | runtime `glowbot.*` namespace is registered in `coreRuntimeHandlers` + authz taxonomy, dedicated `glowbot` handler tests pass, and GlowBot core tabs moved to client-side runtime RPC with browser default transport `runtime-ws` (no required app-local bridge in primary browser flow) |
| 2026-02-27 | E07 | L1 | pass | provisioner supports strict GlowBot app-slot mode selection (`static|proxy`) with hard validation (`static` requires root, `proxy` requires `proxy.baseUrl`, and static/proxy conflict is rejected) including dry-run validation path |
| 2026-02-27 | E07 | L4/L5 | pass | hosted checks: `GET /health` (`ok:true`), `GET /api/products` (`glowbot`,`spike`), authenticated `GET /runtime/api/apps?workspace_id=tenant-tnapathy-gmail-com-1a51e3ec` shows `glowbot kind=proxy`, and `scripts/glowbot-frontdoor-launch-identity-smoke.mjs` returns `ok:true` with GlowBot markers and no control markers |
| 2026-02-27 | E08 | L1/L8 | pass | `nexus-frontdoor-web` now surfaces launch blockers proactively even when launch button is disabled; e2e coverage added for: provisioning in progress, no launchable app, runtime unhealthy (`pnpm -s lint && pnpm -s test && pnpm -s test:e2e` all pass) |
| 2026-02-27 | E09 | L1/L6 | pass | added `scripts/backfill-product-mappings.mjs` (dry-run default + `--apply`) with regression tests (`src/backfill-product-mappings.test.ts`); hosted dry-run/apply against `/var/lib/spike-frontdoor` reported zero pending repairs (`applied_actions:0`) |
| 2026-02-27 | E10 | L4/L5/L6 | pass | hosted production smokes pass on canonical frontdoor: `frontdoor-launch-smoke.mjs` (`runtime_status: healthy`, `launch_ready: true`) and `glowbot-production-smoke.mjs` (session/diagnostics/runtime apps resolved through canonical frontdoor endpoints); runtime root-cause guard added so accidental `FRONTDOOR_TENANT_DISABLE_NEX_ADAPTERS=1` now fails unless explicit override is set |
| 2026-02-27 | E10 | L7/L9 | pending (external) | adapter/hub live-data path requires external partner credentials and contracts (`GLOWBOT_SMOKE_HUB_API_KEY` absent); platform/runtime path is validated and ready for owner manual E2E once credentials are available |
| 2026-02-27 | E11 | L0 (research) | in-progress | production logs confirm root `/_next/*` 404s during `/app/glowbot/integrations` load and existing signed-in flow lacks deterministic Spike self-serve provisioning path from legacy null-product workspace |
| 2026-02-27 | E11 | L1/L2/L4 | pass | hard-cutover fixes shipped: frontdoor `Referrer-Policy` set to `same-origin` so Next subresource requests preserve same-origin app referer context for `/_next` routing; canonical frontdoor shell now includes signed-in `Provision product workspace` controls (`glowbot|spike`) and forwards product/flavor into OIDC start/callback flow; deployed to Hetzner and verified live headers plus shell markup on `https://frontdoor.nexushub.sh/` |
| 2026-02-27 | E12 | L0 | pass (Option 3 locked) | server-first model spec is now approved canonical with Option 3 policy locked: zero-server signed-in self-serve creation runs via `create_server_and_install` orchestration while direct `POST /api/servers` remains policy-guarded |
| 2026-02-27 | E12 | L1/L2 | pass | canonical frontdoor shell (`nexus-frontdoor/public/index.html`) consumes server-first APIs end-to-end: `GET /api/servers`, `GET /api/servers/:id/apps`, `GET /api/apps/owned`, `GET /api/apps/catalog`, `POST /api/apps/:id/purchase`, `POST /api/servers/:id/apps/:id/install`, `GET /api/entry/resolve`, and `POST /api/entry/execute`; regression coverage includes zero-server `create_server_and_install` success + `autoprovision_identity_unavailable` failure + explicit `create_new_server` signed-in path + runtime-truth failure paths (no silent install success) in `src/server.test.ts`; validation: `pnpm -s lint && pnpm -s test` in `nexus-frontdoor` (latest: `57 passed`) |
| 2026-02-28 | E12 | L1/L2/L3/L4 | partial pass | hard-cutover deltas completed locally: shell action split is enforced by server-rendered UI test, install orchestration is runtime-truth based for both `POST /api/servers/:server/apps/:app/install` and `POST /api/apps/:app/purchase` install path, and canonical app identity no longer aliases `spike-runtime -> spike`; validation: `pnpm -s lint && pnpm -s test` in `nexus-frontdoor` (`57/57`), `pnpm -s lint && pnpm -s test` in `nexus-frontdoor-web` (`22/22`), provisioner smoke (`scripts/provisioner-smoke.mjs`) passes when required proxy base env is set; added hosted cert runner `scripts/frontdoor-one-server-dual-app-smoke.mjs` for the final gate; hosted public probes pass for `GET /health`, `GET /api/products`, `GET /api/apps/catalog`; authenticated hosted one-server dual-app certification remains pending because no production session credential is available in this environment. |
| 2026-02-27 | E11 | L4/L8 | pass | deployed to Hetzner (`spike-frontdoor.service`) and verified hosted behavior: `GET /app/glowbot/integrations` returns `200` with all referenced Next assets `200` (no client error); signed-in Spike self-serve now works via `create_new_server` provisioning path, provisioned Spike server launches `/app/spike` successfully (`200`), and unsupported server/app pairs surface deterministic blocked reasons (`runtime_app_missing`) instead of false-ready launch |
