# GlowBot Hub — Implementation Workplan

> Focused workplan for turning `glowbot-hub` from a package boundary into a real
> product control plane service aligned to the hosted control-plane shell.
>
> **Status:** ACTIVE
> **Last Updated:** 2026-03-09
> **Approach:** hard cutover, no backwards compatibility

---

## Customer Outcome

The target experience is:

1. a clinic uses GlowBot through the hosted app
2. the app offers app-branded connection choices such as
   `Connect with GlowBot Google`
3. the runtime starts the shared adapter flow
4. frontdoor remains the only runtime-facing gateway for managed profile
   operations
5. frontdoor relays GlowBot-managed profile work to `glowbot-hub`
6. `glowbot-hub` performs secret-backed product operations and benchmark/control
   functions
7. GlowBot operators use `glowbot-admin` as operator UX on top of that hub

This workplan exists to build that missing product control plane.

---

## Locked Inputs

This workplan assumes these canonical inputs are already locked:

- [HOSTED_PRODUCT_CONTROL_PLANE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/hosted/HOSTED_PRODUCT_CONTROL_PLANE_SHELL.md)
- [GLOWBOT_HUB_AND_ADMIN_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_AND_ADMIN_CONTRACT.md)
- [GLOWBOT_HUB_SERVICE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_SERVICE_SHELL.md)
- [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)
- [GLOWBOT_ADMIN_SURFACE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_ADMIN_SURFACE.md)
- [CENTRAL_HUB.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/CENTRAL_HUB.md)
- [HOSTED_APP_PLATFORM_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/hosted/HOSTED_APP_PLATFORM_CONTRACT.md)

Decisions already locked:

- `glowbot-hub` is GlowBot's product control plane service
- `glowbot-admin` is operator UI, not the secret owner
- frontdoor remains the only runtime-facing gateway
- platform-managed profiles remain frontdoor-owned
- GlowBot-managed profiles are owned by `glowbot-hub`
- benchmark publication uses benchmark-safe snapshots rather than raw metric
  streams

---

## Current Reality

Confirmed from code:

- `/apps/glowbot/hub` contains only
  [README.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/hub/README.md)
- `/apps/glowbot/admin` exists, but methods are placeholders
- [credentials.ts](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/admin/methods/credentials.ts)
  still reflects the old idea that the admin app would manage provider
  credentials directly
- the clinic app still declares a local `glowbot-hub` dependency in
  [app.nexus.json](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/app/app.nexus.json),
  which now conflicts with the dedicated control-plane deployment model and
  must be removed during cutover
- frontdoor now has the managed-connection gateway and product-control-plane
  shell canon, but GlowBot has no executable service behind that route

This means GlowBot's next blocker is product-side implementation, not more
adapter inventing.

---

## Workstreams

## H1. Service Shell Scaffold

Create a real `glowbot-hub` service package aligned to the hosted product
control-plane shell.

Scope:

- add a real package manifest/service entry for `glowbot-hub`
- add private frontdoor ingress endpoints:
  - `GET /api/internal/frontdoor/managed-connections/profile`
  - `POST /api/internal/frontdoor/managed-connections/profile/exchange`
- add the shell modules:
  - `ingress`
  - `managedProfiles`
  - `secrets`
  - `diagnostics`
  - `config`
  - `audit`

Exit criteria:

- `glowbot-hub` is an executable service package, not only a directory
- frontdoor has a concrete private HTTP target to relay to

---

## H2. GlowBot-Managed Profile Module

Implement GlowBot's first real managed-profile module on top of the shell.

Initial scope:

- durable managed profile registry for GlowBot-managed profiles
- secret-reference storage for GlowBot-managed provider credentials
- profile selection by:
  - `managed_profile_id`
  - `app_id`
  - `adapter_id`
  - `connection_profile_id`
  - `auth_method_id`
- secret-backed metadata/exchange operations for GlowBot-managed OAuth profiles

Important boundary:

- `glowbot-hub` may own GlowBot-managed provider secrets
- `glowbot-admin` may manage them operationally
- long-lived secrets never go back to tenant runtimes or browsers

Exit criteria:

- frontdoor relay requests can resolve GlowBot-managed profiles through the hub
- GlowBot-managed OAuth profiles are real product-controlled objects

---

## H3. Admin App Cutover

Turn `glowbot-admin` into the operator UI for `glowbot-hub`.

Scope:

- replace the placeholder `glowbot-admin.credentials` concept with managed
  profile views backed by the hub
- implement real clinic, benchmark, diagnostics, and config views
- keep the admin app focused on operator UX, not direct secret ownership

Priority pages:

- managed profiles
- clinics
- diagnostics
- benchmark network health
- product flags/config

Exit criteria:

- `glowbot-admin` calls `glowbot-hub`, not placeholder local methods
- operator workflows reflect the product-control-plane model

---

## H4. Benchmark And Product-Control Modules

Build the GlowBot-specific business modules on top of the shell once the shell
exists.

Scope:

- benchmark snapshot ingestion
- peer benchmark aggregation
- cohort definition storage
- seed dataset publishing
- product flags/config
- support-safe diagnostics

Important sequencing rule:

- build the shell first
- then plug benchmark/control modules into the shell

Reasoning:

- the shell is reusable architecture
- benchmark logic is product-specific payload on top of that shell

Exit criteria:

- clinic app can publish benchmark-safe snapshots
- clinic app can query peer benchmark datasets
- admin app can operate benchmark and config workflows through the hub

---

## H5. GlowBot App Integration Cutover

Connect the clinic-facing GlowBot app to the real hub.

Scope:

- clinic app uses `glowbotHub.benchmarks.publishSnapshot`
- clinic app uses `glowbotHub.benchmarks.query`
- clinic app uses `glowbotHub.productFlags.list` and related hub methods as
  needed
- managed profile connection flows work through:
  - runtime
  - frontdoor gateway
  - `glowbot-hub`

Exit criteria:

- the clinic app depends on a real shared hub, not on seeds/placeholders alone
- app-managed profile flows have a real product control plane behind them

---

## H6. Validation And Live Readiness

Validate the shell and product modules before live clinic rollout.

Scope:

- private frontdoor relay auth and request-shape tests
- managed profile lookup tests
- secret-backed exchange tests
- admin-app-to-hub integration tests
- benchmark publication/query tests
- audit/diagnostics visibility tests

Exit criteria:

- GlowBot has a real product control plane that frontdoor can relay to
- `glowbot-admin` is a real operator surface
- the first managed GlowBot profile can be exercised without storing long-lived
  provider secrets in tenant runtimes

---

## Sequencing

| Order | Workstream | Notes |
|---|---|---|
| 1 | H1 Service shell scaffold | unblock everything else |
| 2 | H2 GlowBot-managed profile module | first control-plane capability |
| 3 | H3 Admin app cutover | operator UX on top of the real hub |
| 4 | H4 Benchmark and product-control modules | product payload on top of the shell |
| 5 | H5 GlowBot app integration cutover | app consumes the real hub |
| 6 | H6 Validation and live readiness | validate before clinic use |

---

## What This Workplan Explicitly Does Not Do

- it does not move product-managed secrets into frontdoor by default
- it does not let the admin app become the canonical secret owner
- it does not push long-lived product secrets into tenant runtimes
- it does not treat benchmark aggregation as a reason to skip the shell
- it does not couple GlowBot-specific control-plane behavior to Spike-specific
  implementation residue
