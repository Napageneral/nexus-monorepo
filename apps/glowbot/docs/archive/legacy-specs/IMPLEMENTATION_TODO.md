# GlowBot Implementation TODO (Hard Cutover)

Date: 2026-02-26
Canonical flow: `specs/GLOWBOT_DOMAIN_E2E.md`
Production canonical plan: `specs/PRODUCTION_E2E_CUTOVER.md`

Note:

1. This checklist reflects implementation progress in code/tests.
2. It is not a full production-readiness checklist by itself.
3. Production deployment, infra cutover, and live E2E certification are tracked in `specs/PRODUCTION_E2E_CUTOVER.md`.

## 1) Customer Outcome Checklist

1. User can sign up/sign in on GlowBot domain shell via Google OAuth.
2. User is resolved/provisioned to a GlowBot workspace through frontdoor.
3. User is launched directly to `/app/glowbot/` for that workspace.
4. User can configure integrations and see real product tabs/data.

---

## 2) Completed Baseline

- [x] Frontdoor OIDC + runtime proxy + auto-provision primitives.
- [x] GlowBot tenant UI pages and contracts (`glowbot.*` methods).
- [x] Integrations bridge mapped to `adapter.connections.*`.
- [x] CSV normalization and upload ingest to ledger.
- [x] Deterministic pipeline compute/storage path.
- [x] Hub service modules/tests for provisioning/credentials/benchmarks.

---

## 3) P0 - GlowBot Domain Shell Cutover

- [x] Implement product shell in GlowBot repo (landing + signup + launch states).
- [x] Use `glowbot-demo` Vercel project as host for shell.
- [x] Add shell proxy routes required for frontdoor orchestration.
- [x] Standardize OIDC return path into GlowBot shell callback route.
- [x] Implement workspace resolution decision tree:
  - [x] provisioning in progress
  - [x] single workspace auto-launch
  - [x] multi-workspace picker
  - [x] no-workspace failure state
- [x] Launch directly to `/app/glowbot/?workspace_id=<id>`.

---

## 4) P0 - E2E Confidence

- [x] Add shell integration tests for auth/session/workspace/provisioning states.
- [x] Add E2E test: first-time signup -> provision -> launch -> integrations visible.
- [x] Add E2E test: returning user -> direct launch.
- [x] Add E2E test: multi-workspace select -> launch.
- [x] Browser E2E harness added (`playwright`, `e2e/shell-flows.spec.ts`, `npm run test:e2e`).

---

## 5) P1 - Hub Runtime Surface Wiring

- [x] Wire `hub.platformCredentials.get|exchange|refresh` into callable runtime/API surfaces.
- [x] Wire `admin.clinics.*`, `admin.adapters.health`, `admin.benchmarks.status`, `admin.system.vpsList`.
- [x] Enforce operator authz boundaries for admin methods.

---

## 6) P1 - Live Data Pipeline Completion

- [x] Implement real adapter backfill orchestration after connect.
- [x] Implement recurring sync scheduler with durable run records.
- [x] Implement monitor/retry policy for stale/broken adapter connections.
- [x] Align `glowbot.pipeline.status` with real schedule state (not display-only projection).

---

## 7) Deferred (External Dependency)

- [ ] Partner/live credential cutover and external validation after contract/access milestone.
- [x] Runbook prepared: `specs/LIVE_CREDENTIAL_CUTOVER_RUNBOOK.md`
