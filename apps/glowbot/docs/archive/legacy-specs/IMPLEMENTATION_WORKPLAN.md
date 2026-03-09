# GlowBot Implementation Workplan (GlowBot Domain E2E)

Date: 2026-02-26
Status: execution-ready
Primary goal: complete customer E2E signup -> workspace resolve/provision -> tenant GlowBot launch.
Production canonical plan: `specs/PRODUCTION_E2E_CUTOVER.md`

Note:

1. This workplan captured implementation phases that are largely complete at code level.
2. Remaining production cutover scope (public deployment, frontdoor/hub infra, live E2E certification) is tracked in `specs/PRODUCTION_E2E_CUTOVER.md`.

Canonical journey spec: `specs/GLOWBOT_DOMAIN_E2E.md`

---

## 1) Customer Experience First (Target State)

1. User opens GlowBot domain shell (`glowbot-demo` Vercel project).
2. User signs up/signs in with Google OAuth through frontdoor.
3. Frontdoor resolves existing workspace or auto-provisions one.
4. User lands in tenant GlowBot UI at `/app/glowbot/` through frontdoor.
5. User configures integrations and immediately sees GlowBot product tabs and behavior.

Hard cutover principle:

1. GlowBot shell ownership is in GlowBot repo.
2. `nexus-frontdoor-web` remains generic and non-product-specific.

---

## 2) Research Snapshot (Current Reality)

## 2.1 Implemented and validated

1. Frontdoor OIDC start/callback and auto-provision support.
2. Frontdoor runtime proxying for `/app/*`, `/runtime/*`, `/auth/*`.
3. GlowBot tenant UI tabs and runtime RPC contracts.
4. Adapter connection bridge for OAuth/API-key/upload/test/disconnect.
5. CSV normalization and ledger ingest path.
6. Pipeline storage and deterministic compute modules.
7. Hub service modules (contracts/services/tests) for provisioning/credentials/benchmarks.

## 2.2 Not yet at target

1. Product shell is still implemented in `nexus-frontdoor-web`, not GlowBot repo.
2. Launch UX is app-picker-driven, not strict GlowBot-first direct launch.
3. Provisioning status UX is not implemented in GlowBot shell.
4. Hub modules exist but are not wired as runtime HTTP/control-plane surfaces.
5. Live adapter backfill and continuous ingest/monitoring pipeline is incomplete.
6. End-to-end signup-to-launch tests are not centralized in GlowBot repo.

---

## 3) Gap Matrix

## G1 - Shell ownership mismatch (P0)

- Current: shell in `nexus-frontdoor-web`.
- Target: shell in GlowBot monorepo, hosted on `glowbot-demo`.

## G2 - Launch orchestration mismatch (P0)

- Current: user may need workspace/app picker path.
- Target: direct launch to `/app/glowbot/?workspace_id=...` after resolve/provision.

## G3 - Provisioning lifecycle UX missing (P0)

- Current: no productized provisioning progress/retry UX in GlowBot shell.
- Target: explicit states for provisioning, ready, failure, and no-workspace conditions.

## G4 - Hub runtime wiring incomplete (P1)

- Current: hub logic is module/test-level.
- Target: callable runtime methods and/or API surfaces for operator workflows.

## G5 - Live data pipeline completeness gap (P1)

- Current: connect/upload triggers pipeline, but no guaranteed adapter backfill scheduler and no continuous ingest orchestration.
- Target: deterministic backfill + recurring sync + health-driven re-sync behavior.

## G6 - E2E confidence gap (P1)

- Current: component/integration tests exist; full product journey test is missing.
- Target: first-time and returning-user E2E coverage from shell to tenant UI.

---

## 4) Execution Plan

## Phase 0 - Spec and Documentation Cutover (now)

Deliverables:

1. Canonical GlowBot domain E2E spec.
2. Frontend integration spec aligned to GlowBot-domain ownership.
3. Master workplan and TODO aligned to same target state.

Acceptance:

1. No conflicting shell ownership language across core GlowBot specs.

## Phase 1 - GlowBot Shell Cutover (P0)

Deliverables:

1. Implement GlowBot domain shell routes/components in GlowBot repo.
2. Add frontdoor proxy endpoints required by shell (`oidc-start`, session/workspaces/select/provisioning, app catalog).
3. Implement launch resolution rules from `GLOWBOT_DOMAIN_E2E.md`.
4. Implement direct GlowBot app launch path (`/app/glowbot/?workspace_id=...`).

Acceptance:

1. First-time user can complete signup and reach GlowBot tenant UI without manual operator flow.
2. Returning user lands in existing GlowBot workspace.
3. Multi-workspace user can select and launch desired workspace.

## Phase 2 - Hub Surface Wiring (P1)

Deliverables:

1. Wire `hub.platformCredentials.*` and `admin.*` method handlers into runtime/API surface.
2. Add authz boundaries for operator-only methods.
3. Connect provisioning flow to frontdoor workspace registration in runtime path.

Acceptance:

1. Operator can run clinic provision/list/get/deprovision end-to-end through runtime methods.

## Phase 3 - Live Data Pipeline Completion (P1)

Deliverables:

1. Explicit adapter backfill orchestration after connection.
2. Scheduled sync runner with durable run tracking.
3. Health/status monitor -> retry/recovery policy.
4. Pipeline status semantics updated to reflect real schedule state.

Acceptance:

1. Real adapter metrics land without manual upload in supported adapters.
2. Dashboard reflects fresh data with verifiable run history.

## Phase 4 - E2E Validation and Cutover (P0/P1 gate)

Deliverables:

1. Playwright E2E:
   - first-time signup/provision/launch
   - returning user launch
   - multi-workspace select + launch
2. Runtime and shell integration assertions for app registration + launch path.
3. Rollout checklist for `glowbot-demo` Vercel project.

Acceptance:

1. E2E suite green in CI/local before production cutover.

---

## 5) Immediate TODO Queue (Start Iteration Here)

1. Build GlowBot shell page(s) in GlowBot repo with Google CTA and session state machine.
2. Add/verify GlowBot shell API proxy routes to frontdoor (`oidc-start`, session/workspaces/provisioning/apps).
3. Implement direct GlowBot app resolver and launch logic.
4. Add shell-level tests for provisioning and launch decision tree.
5. Add first full E2E test from shell to `/app/glowbot/`.
6. After shell cutover is green, wire hub runtime methods and live backfill scheduler.

---

## 6) Open Decisions (with recommended defaults)

1. Multiple workspaces after login:
   - Default: auto-select `active_workspace_id` when present; otherwise show picker.
2. Provisioning timeout UX:
   - Default: poll every 2s for 90s, then show retry + support path.
3. App catalog mismatch (`glowbot` missing):
   - Default: hard error, no fallback app launch.
