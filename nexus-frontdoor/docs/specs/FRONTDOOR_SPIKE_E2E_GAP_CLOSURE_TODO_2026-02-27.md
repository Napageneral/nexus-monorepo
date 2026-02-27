# Frontdoor + Spike Hosted E2E Gap Closure TODO (Hard Cutover)

Date: 2026-02-27
Owners: Frontdoor + Spike Runtime
Status: Execution checklist

## 1. Customer Journey (Definition of Done)

A single user must be able to:

1. Sign in with Google on frontdoor.
2. Auto-provision a workspace/tenant and see real provisioning state.
3. Launch workspace from frontdoor into a real runtime app surface.
4. Connect GitHub App inside the tenant runtime UI.
5. Select repo + branch/commit, run hydrate, and see job progress.
6. Ask Oracle and receive a traced response with request ID.

This is a hard cutover plan. No legacy fallback UX.

## 2. Confirmed Blocking Gaps (Research)

1. Provisioning status lookup mismatch.
- Provision requests are keyed by `oidc:<provider>:<sub>`.
- Active frontdoor sessions use internal `user-<uuid>` IDs.
- Status endpoint currently queries by session `userId` only.
- Symptom: UI shows `status=none` even when provisioning is complete.

2. No launchable app contract for current bound runtime.
- Frontdoor UI asks runtime for `/runtime/api/apps`.
- Bound Spike API runtime returns 404 for `/api/apps`.
- Symptom: `No launchable app` and Open Workspace cannot route to tenant app.

3. Provisioner is a runtime-binding stub, not an app-manifest provisioner.
- Current script returns runtime URLs/token only.
- It does not create or register launchable app entries.

4. Tenant-runtime GitHub onboarding is not the canonical in-tenant connector flow yet.
- Long-term target is connector UX in tenant runtime, not in frontdoor.

5. Frontdoor shell quality/state handling is not production-grade.
- Functional but not polished or conversion-ready.
- Missing better empty-state, progress, failure, and admin UX clarity.

## 3. Work Plan (Ordered)

### P0 - Unblock functional E2E

- [x] T1. Fix provisioning status identity linkage in frontdoor.
- [x] T2. Add regression tests for provisioning-status lookup across OIDC -> internal user mapping.
- [x] T3. Lock launch contract to runtime-owned app manifest:
  - Runtime must implement `/api/apps` and app entry paths.
  - Frontdoor remains generic and only routes to runtime-declared apps.
  - No API-only launch fallback path is permitted.
- [x] T4. Implement runtime-owned launch contract end-to-end.
- [x] T5. Add launch-path regression tests for app-manifest discovery and app routing.
- [x] T6. Add frontdoor API to expose launch diagnostics in one call (workspace + runtime + app inventory state).

### P1 - Provisioning contract hardening

- [x] T7. Expand provisioner output schema to include launch metadata required by chosen launch contract.
- [x] T8. Validate and persist provisioner output atomically; fail provisioning on invalid payload.
- [x] T9. Add provisioner smoke command to CI/deploy checks.

### P2 - Tenant runtime product flow

- [x] T10. Move GitHub App connect/install UX fully into tenant runtime UI.
- [x] T11. Implement tenant-runtime repo/ref/commit selection + hydrate trigger + status polling.
- [x] T12. Implement tenant-runtime Ask Oracle UI with request ID and result timeline.

### P3 - Frontdoor product shell quality

- [ ] T13. Replace current control-plane styling with production customer-facing layout.
- [ ] T14. Add admin sections: workspace list, member/invite mgmt, runtime keys, account actions, clear launch states.
- [ ] T15. Improve operational copy for all empty/failure/provisioning states.

### P4 - Reliability + observability + ops

- [ ] T16. Add end-to-end correlation IDs across frontdoor, provisioner, and runtime logs.
- [ ] T17. Add hosted smoke test script: sign-in -> provision -> launch -> hydrate -> ask.
- [ ] T18. Add deployment verification checklist for Hetzner (service health, config, DB migrations, runtime auth).

## 4. Acceptance Gates

All must pass:

1. Google sign-in succeeds in production with frontdoor session established.
2. Auto-provision request appears in UI with non-`none` status and final `ready` state.
3. Open Workspace routes to a real launch target for active workspace.
4. GitHub App connection is performed from tenant runtime UI only.
5. Hydrate runs against selected repo/ref/commit and reports terminal status.
6. Ask Oracle returns answer + request ID + traceable logs.
7. Hosted smoke script passes on Hetzner from a clean browser session.

## 5. Immediate Execution Sequence

1. T8 + T9
2. T10 + T11 + T12
3. T13 + T14 + T15
4. T16 + T17 + T18

## 6. Iterative Validation Ladder

Each task must pass all lower rungs before progressing:

1. Unit tests
- Targeted tests for changed module(s) only.

2. Contract tests
- API/route behavior checks for payload shape, auth, and status codes.

3. Local integration
- Local frontdoor + runtime launch path and primary user flow.

4. Hosted smoke
- Hetzner service checks + real browser flow against production domain.

5. E2E signoff
- Clean-session run: sign-in -> provision -> launch -> GitHub connect -> hydrate -> ask.

## 7. Current Sprint (In Progress)

1. `[x]` S1: T1 + T2 (provisioning status identity linkage + regression tests)
2. `[x]` S2: T4 + T5 (runtime `/api/apps` contract + `/app/*` runtime routes + tests)
3. `[x]` S3: T6 (frontdoor launch diagnostics API + UI integration)
4. `[x]` S4: Hosted validation of S1-S3 on Hetzner

## 8. Current TODO List (Production E2E)

1. `[x]` Add launch diagnostics endpoint and UI surfacing:
   - One API call from shell that returns workspace binding, runtime health, app inventory, and last provisioning request.
   - Render explicit launch failure reasons in browser without requiring log access.
2. `[x]` Harden provisioner write path:
   - Make tenant + OIDC account + provisioning-request updates atomic for failed/partial command output.
   - Add strict schema validation for command payload before persistence.
3. `[x]` Add CI/deploy smoke for provisioner and launch:
   - Scripted check: auth session -> workspace select -> runtime app inventory -> `/app/*` launch response.
4. `[x]` Fix tenant runtime health root cause:
   - Remove forced `NEXUS_DISABLE_NEX_ADAPTERS=1` in `provision-tenant-local.mjs` runtime spawn.
   - Keep adapter disable as explicit opt-in only (`FRONTDOOR_TENANT_DISABLE_NEX_ADAPTERS=1`).
   - Validate hosted tenant `/runtime/health` returns `200` with non-`unhealthy` status.
5. `[~]` Fix production provisioner/runtime binding drift:
   - GlowBot cutover now pins frontdoor provision command to local tenant contract (`provision-tenant-local.mjs`) for `glowbot` workspace launches.
   - Existing GlowBot tenant/workspace bindings are reconciled to local tenant runtime (`:32003`) with `glowbot` app manifest live.
   - Remaining: introduce flavor-aware provisioner routing so Spike and GlowBot can coexist without config drift.
6. `[x]` Complete tenant runtime product flow implementation:
   - In-tenant GitHub App connect/install start + callback endpoints (`/connectors/github/install/start|callback`).
   - Repo/ref/commit selection + hydrate trigger + live status in `/app/spike`.
   - Ask Oracle response with request ID + timeline rendering in `/app/spike`.
7. `[ ]` Run full hosted acceptance sweep:
   - [x] Open Workspace success.
   - [x] Hydrate + Ask Oracle success path.
   - [x] Ask timeline retrieval success path.
   - [ ] Clean browser Google sign-in rerun.
   - [ ] GitHub App real installation callback + repo load from installation scope (requires non-empty app installation).
