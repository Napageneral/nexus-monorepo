# GlowBot — Active Workplan

> Gap-closure and hard-cutover workplan for bringing the authoritative GlowBot
> app tree into implementation parity with the active spec set.
>
> **Status:** ACTIVE
> **Last Updated:** 2026-03-10
> **Approach:** hard cutover, no backwards compatibility

---

## Customer Outcome

The target customer and operator experience is:

1. a prospective clinic lands on the GlowBot website
2. a clinic launches the hosted GlowBot app through frontdoor
3. the clinic connects shared adapters through runtime-owned
   connection-profile-driven flows
4. GlowBot ingests adapter events into nex primitives with canonical
   `connection_id` provenance
5. GlowBot computes clinic-local intelligence inside the clinic-facing app
6. GlowBot publishes benchmark-safe snapshots to a real shared product control
   plane
7. the clinic receives peer benchmark context and product-control data back from
   that control plane
8. GlowBot operators use a dedicated admin app on a dedicated control-plane
   server to manage managed profiles, benchmarks, cohorts, diagnostics, and
   product flags

This workplan exists to close the remaining gap between that target state and
the current codebase.

---

## Locked Decisions

These decisions are already resolved and are not reopened in this workplan.

| Decision | Resolution |
|---|---|
| Package topology | GlowBot converges on `app/`, `admin/`, `hub/`, `website/`, `shared/`, `docs/`. |
| Clinic app execution model | `app/` is an inline-handler nex app, not a default service-routed product package. |
| Admin execution model | `admin/` is a separate inline-handler nex app. |
| Shared backend boundary | Shared benchmark and product-control behavior belongs in `hub/`, not in the clinic app package. |
| Product control plane deployment | `glowbot-admin` and `glowbot-hub` are co-installed on a dedicated GlowBot control-plane server managed through the hosted platform, with operator install driven by `glowbot-admin` dependency planning. |
| Pipeline ownership | nex core owns storage, indexing, links, jobs, DAG/schedules primitives, canonical record ingress, and shared adapter execution. GlowBot owns product-specific computation modules. |
| Provenance identity | `connection_id` is the canonical provenance identity. `adapter_id` is source classification, not canonical connection identity. |
| Benchmark boundary | The hub consumes `ClinicBenchmarkSnapshot`, not raw adapter events and not raw local derived-output elements. |
| Clinic profile ownership | The clinic-facing GlowBot app owns canonical `ClinicProfile` truth; the hub owns deterministic `profileKey` resolution and cohort definitions from that object. |
| Clinic app -> hub transport | Clinic-facing product-control-plane calls go through a frontdoor-mediated product API gateway keyed by `app_id`, not direct hub URLs from clinic runtimes. |
| Derived-output target state | Persisted `funnel_snapshot`, `trend_delta`, `dropoff_analysis`, and `recommendation` are the local steady-state target, but on-demand read-time computation is allowed during cutover. |
| Cutover philosophy | Hard cutover only. No backwards compatibility wrappers. |
| Adapter lifecycle | GlowBot does not invent app-local adapter lifecycle escape hatches. Shared runtime/app-SDK surfaces are finished upstream and GlowBot consumes them. |

### Why The Sequencing Is Ordered This Way

This workplan intentionally puts the product control plane ahead of persisted
derived outputs.

Reasoning:

- the control-plane shell is a core architecture boundary shared by managed
  connection flows, benchmarks, diagnostics, and admin workflows
- the benchmark network is already intentionally decoupled from the local
  derived-output strategy
- clinic-side derived outputs are important, but they should not land before
  the product-control-plane boundary is real

That means the order is:

1. finish package/deployment truth
2. build the hub shell
3. build GlowBot-managed profile support
4. cut the admin surface over
5. build the benchmark network on the real shell
6. integrate the clinic app with the real hub
7. then land persisted derived outputs

---

## Current Implementation Snapshot

Confirmed from code in the authoritative app tree:

- `app/`, `admin/`, `hub/`, `website/`, `shared/`, and `docs/` exist as the
  top-level package boundaries
- clinic UI source lives under `app/ui/`
- the clinic manifest uses `requires.adapters` and profile-based adapter
  integration metadata
- the clinic manifest no longer declares `glowbot-hub` under any dedicated
  service dependency field
- the app install/activate path registers:
  - one real element definition: `metric`
  - five job definitions
  - one DAG definition
  - one schedule
- schedule lifecycle is now activation-aware through canonical `schedules.*`
- durable `record.ingested` subscriptions now seed/disable/remove through
  lifecycle hooks
- `metric_extract` is the only real pipeline job today
- metric elements are persisted into nex memory with connection-aware
  provenance
- `metric_extract` now consumes canonical `record.ingested` wake-ups and loads
  canonical records through `records.get`
- clinic-facing methods read from nex primitives and compute higher-level views
  on demand
- the old SQLite pipeline path has been deleted from the active clinic app
- `glowbot-hub` exists as a real control-plane package with private frontdoor
  relay ingress, managed profile storage, diagnostics, config, audit, and
  benchmark modules
- `glowbot-admin` now exposes real operator method families over the hub
  contract
- admin methods now call the co-installed hub through `ctx.app.service("hub")`
- clinic app product-control-plane calls now flow through the hosted
  runtime/frontdoor/hub gateway rather than direct hub URLs

Remaining real gaps:

- secret storage still needs hardening beyond the current `secretRef` shell
  implementation
- persisted derived outputs are not materialized yet
- live clinic validation still depends on real credentials and onboarding

---

## Workstreams

## W0. Canonical Documentation Hygiene ✅

Completed:

- the authoritative GlowBot app tree owns the active docs
- active docs follow the canonical artifact split
- the active spec set now includes detailed canon for:
  - hub service shell
  - benchmark network
  - admin surface
  - derived-output model

Exit criteria:

- the active doc tree teaches the same shape as
  [spec-driven-development-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md)

---

## W1. Monorepo Topology Cutover ✅

Completed:

- `consumer/` was replaced by `app/`
- `consumer-ui/` was folded into `app/ui/`
- `admin/`, `hub/`, `website/`, `shared/`, and `docs/` now exist as explicit
  top-level package boundaries
- root workspace configuration references real packages only

Exit criteria:

- top-level package names match the canonical topology
- clinic-facing UI source lives under `app/ui/`
- root workspace config references real packages only

---

## W2. Hosted Package And Deployment Model Cutover ✅

This is now a package/deployment-truth workstream, not just a manifest-cleanup
workstream.

Completed:

- clinic app manifest uses `requires.adapters`
- adapter `command` path escapes were removed
- `adapters[].connectionProfiles` replaced app-local auth form canon
- shared constants and types were aligned to the current adapter set
- integration helpers now deal in adapter identity, connection profile
  identity, and connection state
- clinic app manifest no longer declares `glowbot-hub` as a clinic-server
  dependency
- admin manifest declares the local `glowbot-hub` app dependency expected on
  the dedicated control-plane server
- `glowbot-hub` has real app/package metadata for control-plane deployment
- the active manifests now teach:
  - clinic server package set
  - control-plane server package set

Exit criteria:

- clinic app dependencies reflect clinic-server reality only
- admin/hub app dependencies reflect dedicated control-plane-server reality
- no package metadata implies per-clinic installation of `glowbot-hub`

---

## W3. Runtime Adapter Connection Surface ✅

Completed:

- GlowBot-side integrations assume connection-profile-driven flows
- runtime wrappers exist for
  `list/connect/disconnect/test/getHealth/backfill`
- runtime/app SDK flow selection is profile-aware and keyed by
  `connectionProfileId`, `authMethodId`, and `scope`
- runtime connection state is canonical connection-based state keyed by
  `connectionId`
- adapter event ingress now resolves persisted `connectionId` for event-bus and
  backfill ingestion instead of synthesizing adapter-singleton provenance
- GlowBot no longer depends on adapter-singleton UI assumptions
- managed profile routing now flows through the canonical
  runtime/frontdoor/product-control-plane path

Remaining validation:

- exercise the full hosted path on a real dedicated control-plane server during
  W13 live validation

Exit criteria:

- the clinic app can start, test, disconnect, inspect, and backfill
  connections through the canonical runtime contract
- runtime connection state is canonical connection-based state

---

## W4. Pipeline Write Path Baseline ✅

Completed:

- install registers the `metric` element definition
- install registers GlowBot jobs and DAG definition
- install/activate/upgrade/read-path code is hard-cut from `cron.*` to
  `schedules.*`
- durable `events.subscriptions.*` wake `metric_extract` on canonical
  `record.ingested`
- `metric_extract` now consumes canonical stored records through `records.get`
- `metric_extract` writes connection-aware `metric` elements into nex memory
- write-path dedup keys include `connection_id`
- multi-location data remains taggable with `clinic_id`
- metric metadata preserves canonical `connection_id` provenance and carries
  additional connection context when runtime provides it

Remaining boundary:

- provenance link creation for derived outputs moves to W12 with persisted
  derived observations

Exit criteria:

- canonical records produce canonical metric elements
- metric elements preserve canonical connection-based provenance
- the write path is cleanly ready for persisted derived outputs

---

## W5. Clinic Read Path And On-Demand Computation ✅

Completed:

- clinic-facing methods no longer depend on the deleted local SQLite pipeline
  store
- overview, funnel, modeling, agents, recommendations, pipeline status, and
  manual trigger surfaces now read from nex primitives and app-owned
  computation modules
- higher-level product views are currently computed on demand from `metric`
  elements

Important boundary:

- this is a valid cutover stage
- it is not the final derived-output target state

Exit criteria:

- clinic-facing handlers no longer depend on any app-local storage or scheduler
- product computation remains app-owned and nex-native

---

## W6. Hard Cutover Deletion ✅

Completed:

- `glowbot.db` creation was removed from the active app path
- the old pipeline store and schema helpers were deleted
- `DatabaseSync` was removed from the active clinic path
- active clinic methods no longer read from or write to the old SQLite path

Exit criteria:

- there is no active path reading from or writing to the old local GlowBot
  SQLite pipeline
- old package names and manifest path-escape assumptions are gone from the
  active app code path

---

## W7. Hub Service Shell Implementation 🟡

This is now the highest-priority product-owned architecture workstream.

Completed:

- create a real `glowbot-hub` control-plane package
- add service/package manifest and executable entrypoint
- implement private frontdoor relay ingress:
  - `GET /api/internal/frontdoor/managed-connections/profile`
  - `POST /api/internal/frontdoor/managed-connections/profile/exchange`
- implement the mandatory shell modules:
  - `ingress`
  - `managedProfiles`
  - `secrets`
  - `diagnostics`
  - `config`
  - `audit`

Still required:

- harden secret storage beyond the current env-backed `secretRef` resolution

Exit criteria:

- `hub/` is a real control-plane package
- frontdoor has a real private HTTP target to relay to
- the hub owns real managed-profile and secret-backed shell behavior
- the dedicated control-plane deployment/install path is proven through hosted
  rehearsal

## W7A. Package Publish And Deploy Rehearsal ✅

This hosted rehearsal slice is complete and kept here for traceability.

Scope:

- publish real package artifacts for `glowbot`, `glowbot-admin`, and
  `glowbot-hub`
- validate dependency-driven control-plane install behavior
- rehearse hosted install using real package artifacts instead of repo-local
  package roots

Canonical detail lives in:

- [GLOWBOT_PACKAGE_PUBLISH_AND_DEPLOY_REHEARSAL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PACKAGE_PUBLISH_AND_DEPLOY_REHEARSAL.md)
- [GLOWBOT_PACKAGE_PUBLISH_AND_DEPLOY_REHEARSAL_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/workplans/GLOWBOT_PACKAGE_PUBLISH_AND_DEPLOY_REHEARSAL_WORKPLAN.md)

Exit criteria:

- real release tarballs exist for all three GlowBot packages
- clinic-style install of `glowbot` is provable
- control-plane install of `glowbot-admin` pulls in `glowbot-hub`
- deployed package state and `productControlPlane.call` behavior are validated

Recorded proof:

- frontdoor published and installed real `glowbot`, `glowbot-admin`, and
  `glowbot-hub` artifacts
- `glowbot-admin` installation on the control-plane server pulled in
  `glowbot-hub` automatically via `requires.apps`
- `glowbot` installed on a separate clinic-style server
- the deployed clinic app successfully reached the deployed control plane via
  `productControlPlane.call`

---

## W8. GlowBot-Managed Profiles ✅

Build the first real product-managed connection capability on top of the shell.

Scope:

- durable managed profile registry for GlowBot-managed profiles
- durable secret-reference storage
- full profile resolution by:
  - `managed_profile_id`
  - `app_id`
  - `adapter_id`
  - `connection_profile_id`
  - `auth_method_id`
- first real secret-backed metadata/exchange implementation for
  GlowBot-managed provider flows

Completed:

- durable managed profile registry exists in the hub
- full tuple resolution by `managed_profile_id`, `app_id`, `adapter_id`,
  `connection_profile_id`, and `auth_method_id` exists in the hub
- the hub has a first real secret-backed OAuth exchange path
- the first GlowBot-managed provider path is validated in deployed
  runtime/frontdoor/hub rehearsal, including failed-exchange diagnostics and
  audit capture

Important boundary:

- the hub owns product-managed secrets
- the admin app may manage those objects operationally
- long-lived secrets never go back to clinic runtimes or browsers

Exit criteria:

- frontdoor relay requests can resolve GlowBot-managed profiles through the hub
- the first GlowBot-managed connection path is real end to end from frontdoor
  into the hub

---

## W9. Admin Surface Cutover ✅

Turn `glowbot-admin` into a real operator app over hub state.

Scope:

- remove the stale `glowbot-admin.credentials` concept
- align admin method names to the canonical admin surface
- implement real operator methods backed by `glowbot-hub`
- implement at least these sections:
  - overview
  - managed profiles
  - clinics
  - diagnostics
  - benchmark network
  - cohorts and seeds
  - product flags
  - audit/support

Completed:

- stale `glowbot-admin.credentials` naming is gone from the admin manifest and
  handlers
- canonical admin method families exist for overview, managed profiles,
  clinics, diagnostics, benchmark network, cohorts, product flags, and audit
- admin methods call the co-installed hub through `ctx.app.service("hub")`
- `admin/ui` now exists as a real operator console source tree
- `admin/dist` is now generated as the packaged static operator UI

Exit criteria:

- `glowbot-admin` calls the hub instead of placeholder local logic
- operator workflows reflect the real product-control-plane architecture
- admin is operator-only and not exposed as a customer-facing app

Recorded proof:

- deployed hosted rehearsal proves `glowbot-admin` is hidden from normal
  customer inventory and non-operator contexts cannot invoke admin methods

---

## W10. Benchmark Network Implementation ✅

Build the benchmark network on top of the real hub shell.

Scope:

- implement `ClinicBenchmarkSnapshot` publication
- implement cohort resolution and storage
- implement peer benchmark aggregation
- implement seed dataset storage and publication
- implement benchmark query with:
  - source attribution
  - freshness
  - sample size
- implement operator-facing network-health diagnostics

Completed:

- hub benchmark snapshot publication and query methods exist
- cohort storage and seed dataset publication/listing exist
- network-health and clinic participation summaries exist
- clinic app now publishes benchmark-safe snapshots using the canonical
  `ClinicProfile`
- clinic app now queries peer benchmark context from the hub through the
  hosted product-control-plane gateway
- peer benchmark usage no longer depends on local seed-only assumptions

Key design boundary:

- the benchmark network consumes snapshots, not raw adapter events and not raw
  local derived-output elements

Exit criteria:

- the hub can ingest benchmark-safe snapshots
- the hub can return peer or seed benchmark data honestly
- the admin app can operate cohort/seed/network-health workflows

---

## W11. Clinic App Hub Integration Cutover ✅

Connect the clinic-facing GlowBot app to the real hub.

Scope:

- implement the canonical `ClinicProfile` object in GlowBot app/shared
  contracts
- clinic app publishes benchmark snapshots to the hub using that canonical
  clinic profile
- clinic app queries peer benchmark data from the hub
- clinic app consumes hub-backed product flags/config when needed
- clinic app reaches the hub through the frontdoor-mediated product
  control-plane gateway rather than direct hub URLs
- clinic app no longer depends on seeds/placeholders where the hub is now the
  canonical source
- managed connection flows resolve through:
  - runtime
  - frontdoor gateway
  - `glowbot-hub`

Completed:

- the clinic app owns a canonical `ClinicProfile` object in shared/app code
- benchmark-safe clinic snapshots publish through the hosted product
  control-plane gateway
- peer benchmark context queries now resolve through `glowbot-hub`
- clinic product flags resolve through the hosted product-control-plane gateway
- clinic app no longer depends on direct hub URLs or tenant-local hub auth
  secrets
- clinic app no longer teaches local `glowbot-hub` co-installation
- clinic integration backfill now routes through the canonical runtime
  connection surface instead of local placeholders
- the exact Nex runtime gateway method used by clinic app code,
  `productControlPlane.call`, is now landed and validated in source/tests

Remaining validation:

- validate the full clinic app -> runtime -> frontdoor -> hub path on a real
  dedicated control-plane server during W13 live rollout

Exit criteria:

- the clinic app owns a canonical `ClinicProfile`
- the clinic app consumes a real product control plane
- the clinic app uses the canonical hosted transport path for product
  control-plane calls
- the clinic app no longer teaches the old local-hub dependency model

---

## W12. Persisted Derived Outputs And DAG Automation ✅

Persisted higher-level observations are now materially landed under the
canonical Nex work runtime while clinic reads intentionally remain on-demand.

Canonical detail lives in:

- [GLOWBOT_DERIVED_OUTPUT_MATERIALIZATION.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_DERIVED_OUTPUT_MATERIALIZATION.md)

Scope:

- register element definitions for:
  - `funnel_snapshot`
  - `trend_delta`
  - `dropoff_analysis`
  - `recommendation`
- implement real compute jobs:
  - `funnel_compute`
  - `trend_compute`
  - `dropoff_detect`
  - `recommend`
- persist derived outputs canonically into nex primitives
- create provenance links from derived outputs back to source metrics
- version/supersede recommendations instead of overwriting them
- move read surfaces onto persisted derived outputs where that now improves the
  steady-state design
- validate derived-output execution against the now-signed-off Nex work runtime
- validate end-to-end schedule-driven refresh against `schedules.*`

Current state:

- derived element definitions are registered for:
  - `funnel_snapshot`
  - `trend_delta`
  - `dropoff_analysis`
  - `recommendation`
- `metric_extract` now triggers a dedicated derived-output DAG rather than
  serving as the only durable GlowBot pipeline stage
- `funnel_compute`, `trend_compute`, `dropoff_detect`, and `recommend` are
  real job scripts
- derived outputs now persist canonically into nex memory with provenance links
  and recommendation supersession
- deployed and local runtime validation now prove:
  - DAG advancement through downstream node execution
  - schedule-driven refresh through `schedules.trigger`
  - parity against the current on-demand read model
- the focused W12 execution notes are now historical and belong in
  [docs/archive/workplans](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/workplans)
  and
  [docs/archive/validation](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/validation)

Important boundary:

- the benchmark network remains snapshot-based and decoupled from the local
  derived-output strategy
- W12 materializes derived outputs first and keeps clinic reads on-demand until
  real clinic evidence justifies a read-path cutover

Exit criteria:

- derived outputs are persisted canonically
- provenance is explainable
- the materialized outputs are proven against the current on-demand read model

---

## W13. Live Clinic Cutover 🚧

This is the final customer-evidence workstream after the product and platform
boundaries are real.

Scope:

- real connection flow through the canonical runtime/frontdoor/control-plane
  path
- real connection test and health
- real data arrival
- pipeline verification on live clinic data
- clinic-facing dashboard verification with real data
- disconnect/reconnect verification
- evidence capture in the live runbook

Supporting workstream:

- non-EMR shared-adapter parity is tracked separately in
  [NON_EMR_ADAPTER_PARITY_WORKPLAN.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/workplans/NON_EMR_ADAPTER_PARITY_WORKPLAN.md)
  because the first clinic will validate Google, Meta Ads, CallRail, Twilio,
  and Apple Maps before EMR adapters

Exit criteria:

- a real clinic can connect, ingest, benchmark, and see valid data through the
  canonical hosted/runtime/control-plane model

---

## W13A. Synthetic Deployed Rehearsal ✅

This is the last non-credential product rehearsal before the first clinic.

Scope:

- real published GlowBot package artifacts
- separate control-plane and clinic servers
- synthetic canonical `record.ingest`
- real downstream `metric_extract`
- deployed clinic method reads
- benchmark snapshot publish/query
- product flag round-trip through the deployed control-plane path

Current state note:

- complete and validated with real published package artifacts, separate
  control-plane and clinic runtimes, synthetic canonical `record.ingest`,
  downstream `metric_extract`, deployed clinic method reads, benchmark
  publication/query, and product-control-plane reads
- the focused execution and evidence notes are now archived in
  [docs/archive/workplans](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/workplans)
  and
  [docs/archive/validation](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/archive/validation)

Exit criteria:

- the deployed shape proves metric ingest, clinic reads, benchmark publication,
  and product-control-plane reads without live credentials

---

## Current Sequencing

| Order | Workstream | Current Status |
|---|---|---|
| 1 | W0 Canonical documentation hygiene | complete |
| 2 | W1 Monorepo topology cutover | complete |
| 3 | W2 Hosted package and deployment model cutover | complete |
| 4 | W3 Runtime adapter connection surface | complete |
| 5 | W4 Pipeline write path baseline | complete |
| 6 | W5 Clinic read path and on-demand computation | complete |
| 7 | W6 Hard cutover deletion | complete |
| 8 | W7 Hub service shell implementation | partial |
| 9 | W8 GlowBot-managed profiles | complete |
| 10 | W9 Admin surface cutover | partial |
| 11 | W10 Benchmark network implementation | complete |
| 12 | W11 Clinic app hub integration cutover | complete |
| 13 | W12 Persisted derived outputs and DAG automation | complete |
| 14 | W13A Synthetic deployed rehearsal | complete |
| 15 | W13 Live clinic cutover | pending |

Parallel notes:

- W10 does not need W12 to land first because the benchmark network is
  intentionally snapshot-based
- the control-plane and clinic-app integration boundaries are now stable enough
  that W12 can proceed when live-clinic priorities permit

---

## What This Workplan Explicitly Does Not Do

- it does not reopen target-state architecture questions that are already
  locked in specs
- it does not plan for backwards compatibility
- it does not let GlowBot invent local adapter lifecycle workarounds
- it does not move GlowBot business semantics into nex core
- it does not conflate on-demand read-path completion with persisted
  derived-output completion
- it does not treat the hub as optional once the control-plane model is locked

---

## Validation

Validation is tracked in:

- [VALIDATION_LADDER.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/validation/VALIDATION_LADDER.md)
- [LIVE_CREDENTIAL_CUTOVER_RUNBOOK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/validation/LIVE_CREDENTIAL_CUTOVER_RUNBOOK.md)
