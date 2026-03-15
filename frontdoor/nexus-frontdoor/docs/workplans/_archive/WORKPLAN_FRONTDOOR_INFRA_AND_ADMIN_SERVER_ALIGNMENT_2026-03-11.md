# Workplan: Frontdoor Infra And Admin Server Alignment

**Date:** 2026-03-11
**Status:** COMPLETED
**Spec:** `/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md`
**Depends on:** `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/platform-model.md`
**Depends on:** `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/packages-and-control-planes.md`
**Depends on:** `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_AND_ADMIN_CONTRACT.md`
**Depends on:** `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md`
**Approach:** HARD CUTOVER — active frontdoor canon must describe the current infra, `oracle-1` is retired rather than kept as historical compatibility, and the shared admin-server pattern is promoted from GlowBot's current canon instead of the old frontdoor seed proposal

---

## Objective

Close four remaining gaps:

1. frontdoor canonical infra docs still contain stale host topology and do not
   clearly capture the hardened public-host posture
2. `oracle-1` is still a live legacy host even though frontdoor has moved to
   `frontdoor-1`
3. the shared admin-server pattern still lives only as a frontdoor proposal
   even though GlowBot now has concrete canonical product-control-plane/admin
   docs
4. frontdoor docs still point at the old proposal instead of a shared platform
   canon for product control planes and admin apps

Completed 2026-03-11 after:

1. updating frontdoor infra canon to reflect the hardened current topology
2. deleting `oracle-1` from Hetzner and removing its dedicated public firewall
3. adding shared `nex` platform canon for product control plane servers and
   admin apps
4. aligning GlowBot and frontdoor docs to that shared canon
5. archiving the superseded frontdoor-only admin server proposal docs

## Customer And Operator Experience Goal

The active docs should tell one simple story:

1. frontdoor runs on its own dedicated public host
2. public host operator access is deterministic and narrowed
3. tenant SSH is private-network-only
4. legacy public infrastructure is retired instead of lingering ambiguously
5. product operators use dedicated product control plane servers and admin apps
   that are not customer-visible
6. GlowBot is the first concrete instance of that shared pattern, not an
   exception to it

## Research Findings

1. The executed hardening is only captured in
   `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/workplans/_archive/WORKPLAN_FRONTDOOR_SERVER_HARDENING_2026-03-10.md`.
2. `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/TENANT_NETWORKING_AND_ROUTING_2026-03-04.md`
   still says frontdoor runs on `oracle-1`, which is now false.
3. `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md`
   already captures some intended hardening (`nexus-operator`, hardened tenant
   SSH, tenant firewall), but not the current static-public-host policy
   enforced on `frontdoor-1`.
4. `oracle-1` is still live and `api.spike.fyi` still resolves to it, so
   deleting it is a real decommission event.
5. GlowBot now has stronger canonical product-control-plane/admin docs than the
   old frontdoor admin-server proposal:
   - `GLOWBOT_HUB_AND_ADMIN_CONTRACT.md`
   - `GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md`
   - `GLOWBOT_ADMIN_SURFACE.md`
   - `GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md`
6. The old frontdoor admin-server docs are still only exploratory proposal
   material and now lag the concrete GlowBot canon.

## Phase 1: Frontdoor Infra Canon Cleanup

### Goal

Make active frontdoor infra canon reflect the hardened live topology.

### Changes

1. Update `CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md` to distinguish:
   - static public platform hosts
   - lifecycle-managed tenant VPSes
2. Add explicit canonical policy for static public hosts:
   - canonical operator key is `nexus-operator`
   - public SSH is explicitly restricted
   - static public hosts keep backups enabled
   - static public hosts keep delete/rebuild protection enabled
   - named snapshots are taken before major infra changes
3. Update `TENANT_NETWORKING_AND_ROUTING_2026-03-04.md` so it reflects:
   - `frontdoor-1` as the frontdoor host
   - `oracle-1` no longer serving as platform frontdoor infrastructure
   - tenant traffic still routed through frontdoor over the private network
4. Remove or rewrite stale `oracle-1` and `api.spike.fyi` assumptions from
   active frontdoor canon where they no longer belong.

### Exit Criteria

Active frontdoor infra specs match the current hardened topology instead of the
previous legacy layout.

## Phase 2: Oracle Retirement

### Goal

Retire the now-legacy `oracle-1` host.

### Changes

1. Confirm a current recovery snapshot exists.
2. Confirm `frontdoor-1` remains the only active frontdoor public host.
3. Delete `oracle-1` from Hetzner.
4. Record the retirement in the docs and validation notes.

### Exit Criteria

`oracle-1` no longer exists in Hetzner, and active docs no longer treat it as a
current platform host.

## Phase 3: Shared Admin Server Canon Promotion

### Goal

Promote the shared admin-server/product-control-plane pattern into active Nex
platform canon using GlowBot's concrete model as the first grounded instance.

### Changes

1. Add a new canonical platform spec under `nex/docs/specs/platform/` covering:
   - dedicated product control plane servers
   - operator-only admin apps
   - relationship between platform control plane, product control planes, and
     customer servers
   - deployment model for product control plane services plus admin apps
   - the rule that customers do not see product admin apps in normal catalog
     and launch flows
2. Align that new spec with the existing platform docs rather than redefining
   the package model.
3. Update GlowBot docs to reference the new shared platform canon where useful.

### Exit Criteria

The shared pattern no longer depends on the old frontdoor proposal to be
understood.

## Phase 4: Frontdoor Admin Pattern Alignment

### Goal

Make frontdoor docs consume the new shared canon instead of carrying a stale
parallel proposal as the main reference.

### Changes

1. Update frontdoor canonical docs to reference the new shared admin-server
   spec.
2. Archive or reduce the old proposal docs if they are fully superseded:
   - `ADMIN_SERVER_PATTERN.md`
   - `TODO_ADMIN_SERVER_PATTERN.md`
3. Keep only still-open exploratory questions in proposal space, if any remain.

### Exit Criteria

Frontdoor no longer presents the old seed proposal as the primary source for
the admin-server pattern.

## Phase 5: Validation

### Goal

Prove the active docs and live infra reflect the new target state.

### Validation

1. Confirm active frontdoor infra specs no longer claim frontdoor runs on
   `oracle-1`.
2. Confirm `oracle-1` is absent from `hcloud server list`.
3. Confirm the new shared admin-server canon exists under `nex/docs/specs/platform/`.
4. Confirm frontdoor active specs point at the shared canon rather than the old
   seed proposal as the main reference.
5. Confirm the old proposal material is either archived or explicitly reduced
   to genuinely unresolved questions only.

### Exit Criteria

The active docs tree tells one coherent story about hardened frontdoor
infrastructure, retired legacy public hosts, and the shared product-control-plane/admin-app pattern.

## Residual Note

`api.spike.fyi` still has a Vercel DNS record pointing at the retired
`oracle-1` IP. The server retirement is complete, but DNS cleanup is an
external change and should be done only with explicit approval for that record
removal.
