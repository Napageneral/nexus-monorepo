# TODO: Admin Server Pattern

Date: 2026-02-27
Status: not started
Parent: `ADMIN_SERVER_PATTERN.md`

---

## Immediate

- [ ] Answer open questions in seed spec.
- [ ] Define core-admin app interface (standard dashboards + APIs).
- [ ] Define telemetry collection contract (push vs pull, data format).
- [ ] Design access control model for admin servers.

## Phase 1: GlowBot Admin Server

- [ ] Spec the GlowBot admin app (extends core-admin with adapter health, pipeline stats, credential vault, peer benchmarks).
- [ ] Implement GlowBot admin app in glowbot mono-repo.
- [ ] Deploy GlowBot admin server on Hetzner.
- [ ] Migrate Central Hub functionality into the admin server pattern.

## Phase 2: Spike Admin Server

- [ ] Spec the Spike admin app (extends core-admin with hydration stats, ask query metrics, GitHub connector health).
- [ ] Implement Spike admin app in spike mono-repo.
- [ ] Deploy Spike admin server.

## Phase 3: Frontdoor Admin Server

- [ ] Spec the frontdoor admin app (platform-wide: all servers, accounts, spending, usage).
- [ ] Implement frontdoor admin app.
- [ ] Deploy frontdoor admin server (or integrate into frontdoor service).

## Phase 4: Extract and Formalize

- [ ] Extract core-admin as a reusable shared component.
- [ ] Document the pattern for future products.
