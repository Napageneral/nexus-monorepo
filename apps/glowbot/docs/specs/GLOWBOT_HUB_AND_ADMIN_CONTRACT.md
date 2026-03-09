# GlowBot — Hub And Admin Contract

> Canonical contract for the shared GlowBot hub service, the operator-facing
> admin app, and the benchmark network boundary.

---

## Purpose

This document defines the product-specific shared-service boundary for GlowBot.

It exists to keep three things clear:

1. what belongs in the clinic-facing GlowBot app
2. what belongs in the shared GlowBot hub service
3. what still belongs to frontdoor and the hosted runtime rather than to
   product-level GlowBot packages

This is the detailed contract behind:

- [CENTRAL_HUB.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/CENTRAL_HUB.md)
- [GLOWBOT_PACKAGE_TOPOLOGY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PACKAGE_TOPOLOGY.md)
- [DATA_PIPELINE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/DATA_PIPELINE.md)

Detailed companion contracts now live in:

- [GLOWBOT_HUB_SERVICE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_SERVICE_SHELL.md)
- [GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md)
- [GLOWBOT_CLINIC_PROFILE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_CLINIC_PROFILE.md)
- [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)
- [GLOWBOT_ADMIN_SURFACE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_ADMIN_SURFACE.md)

---

## Customer And Operator Experience

The intended product experience is:

1. a clinic launches GlowBot through frontdoor
2. the clinic connects shared adapters through runtime-owned connection-profile
   flows
3. the clinic runtime stores raw metric data locally in nex primitives
4. the clinic-facing app computes funnel intelligence and other product views
5. the clinic-facing app publishes benchmark-safe summary snapshots to the
   shared GlowBot hub
6. the clinic-facing app fetches peer benchmark datasets and product control
   data back from the hub
7. GlowBot operators use a separate admin app to manage cohorts, seeds,
   diagnostics, and support workflows through the same hub boundary

Deployment model:

- clinic servers run the clinic-facing `glowbot` app
- a dedicated GlowBot product control plane server runs `glowbot-admin` and
  `glowbot-hub`
- this deployment model is defined in
  [GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md)

The hub is not a second runtime and not a second frontdoor. It is a
product-specific shared service.

---

## Design Rules

1. The clinic app owns clinic-local product logic.
2. The clinic app owns the canonical clinic profile used for benchmark publication.
3. The clinic runtime owns clinic-local storage, jobs, and orchestration.
4. The hub owns shared GlowBot benchmark aggregation, cohort resolution, and product control data.
5. The admin app owns operator UX, not shared secret storage.
6. The GlowBot hub as product control plane owns GlowBot-managed provider
   credential profiles and their secrets.
7. The runtime owns execution of shared adapter connection flows and hosted product-control-plane gateway calls.
8. The hub never becomes a generic adapter credential or callback service.
9. The benchmark network is built from benchmark-safe snapshot objects, not
   from raw metric streams.
10. The benchmark publication contract must remain stable whether GlowBot
   computes higher-level views on demand or later persists derived outputs.

Detailed shape by concern:

- hub shell and private relay surface:
  [GLOWBOT_HUB_SERVICE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_SERVICE_SHELL.md)
- benchmark publication, cohorts, and peer query behavior:
  [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)
- clinic profile ownership and publication rules:
  [GLOWBOT_CLINIC_PROFILE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_CLINIC_PROFILE.md)
- clinic-app-to-hub transport path:
  [GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md)
- operator-facing admin surface:
  [GLOWBOT_ADMIN_SURFACE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_ADMIN_SURFACE.md)

---

## Responsibility Split

| Layer | Owns |
|---|---|
| Frontdoor | package registry, install planning, routing, runtime token minting, private managed-connection gateway, platform-managed profiles |
| Hosted runtime | package activation, adapter connection execution, reusable callbacks/webhooks, clinic-local memory/jobs/DAGs/cron |
| GlowBot app | clinic UX, product-specific computation, canonical clinic profile ownership, benchmark-safe summary publication, benchmark consumption |
| GlowBot hub | shared benchmark aggregation, cohort rules, product flags, support-safe diagnostics, benchmark dataset serving, GlowBot-managed provider profiles, GlowBot secret-backed provider operations |
| GlowBot admin | operator UX on top of the GlowBot hub contract |

Two negative rules matter:

- the hub does not own platform lifecycle
- the admin app does not become a private credential console for shared adapters

---

## Canonical Benchmark Source Story

The hub does not ingest raw adapter events and does not ingest raw clinic metric
elements directly as its public product boundary.

The canonical publication unit is a benchmark-safe clinic summary snapshot.

That snapshot is produced inside the clinic runtime from:

- raw `metric` elements
- canonical GlowBot clinic profile information
- GlowBot app-owned computation logic

Whether the clinic app computed that summary:

- directly on demand from `metric` elements, or
- from persisted derived outputs such as `funnel_snapshot` or `trend_delta`

is an implementation detail of the clinic runtime, not a hub contract detail.

This is intentional.

Reasoning:

- it lets GlowBot keep evolving the local derived-output model without forcing
  hub API churn
- it prevents the shared benchmark boundary from depending on unfinished local
  persistence decisions
- it keeps the hub fed by the canonical product-level summary shape rather than
  by unstable internal intermediate objects

---

## Canonical Benchmark Publication Contract

Clinic runtimes publish benchmark-safe summaries, not patient-level records and
not raw provider credentials.

```typescript
interface ClinicBenchmarkSnapshot {
  clinicId: string
  periodStart: string
  periodEnd: string
  clinicProfile: {
    specialty: string
    monthlyAdSpendBand: string
    patientVolumeBand: string
    locationCountBand: string
  }
  metrics: {
    impressions_to_clicks: number | null
    clicks_to_leads: number | null
    leads_to_bookings: number | null
    bookings_to_consults: number | null
    consults_to_treatments: number | null
    no_show_rate: number | null
    review_velocity: number | null
    average_rating: number | null
  }
  source: {
    appId: string
    generatedAtMs: number
    dataFreshnessMs: number
  }
}
```

Publication rule:

- `specialty` is required
- the three cohort-band fields may be `"unknown"` during early rollout
- the hub owns deterministic `profileKey` resolution from the published clinic
  profile

Privacy rules:

- no patient-level rows
- no appointment-level rows
- no phone numbers, names, emails, or message bodies
- no provider OAuth secrets or app private keys
- no raw adapter event payloads

---

## Canonical Peer Benchmark Contract

The hub aggregates clinic snapshots into reusable peer benchmark datasets keyed
by cohort and period.

```typescript
interface PeerBenchmarkRecord {
  profileKey: string
  periodStart: string
  periodEnd: string
  metricName: string
  peerMedian: number
  peerP25: number
  peerP75: number
  sampleSize: number
  source: "peer_network" | "industry_seed"
  freshnessMs: number
}
```

The hub may mix:

- live peer-network aggregates
- curated seed datasets

but it must preserve source attribution and freshness separately.

---

## GlowBot Hub Responsibilities

The hub has four canonical responsibilities.

### 1. Benchmark intake and aggregation

The hub:

- receives `ClinicBenchmarkSnapshot` publications from clinic runtimes
- validates the snapshot shape
- assigns the snapshot to a canonical cohort/profile bucket
- aggregates benchmark records over time

### 2. Benchmark dataset serving

The hub:

- returns peer benchmark records for a clinic profile and requested period
- returns sample-size and freshness metadata
- exposes whether a value comes from peer-network data or seed data

### 3. Product control data

The hub owns product-scoped shared data such as:

- benchmark cohort definitions
- benchmark thresholds
- seed datasets
- rollout flags
- operator-controlled product metadata

### 4. Support-safe diagnostics

The hub owns product-level support summaries such as:

- clinic benchmark participation status
- benchmark freshness
- app version and rollout flags
- high-level integration freshness summaries when those are safe to expose

These diagnostics must never expose long-lived provider credential secrets.

---

## Hub Service Methods

The shared service package owns a product-level service namespace.

Canonical hub method families:

```text
glowbotHub.benchmarks.publishSnapshot
glowbotHub.benchmarks.query
glowbotHub.clinicProfiles.resolve
glowbotHub.productFlags.list
glowbotHub.diagnostics.summary
```

Canonical expectations:

- clinic app reaches `glowbotHub.benchmarks.publishSnapshot` through the
  frontdoor-mediated product-control-plane gateway with a validated
  `ClinicBenchmarkSnapshot`
- clinic app reaches `glowbotHub.benchmarks.query` through the same gateway to
  fetch peer benchmark data
- clinic app may reach `glowbotHub.clinicProfiles.resolve` through the same
  gateway when clinic profile bucket assignment is shared logic rather than
  local-only logic
- clinic app reads feature/rollout state through the same gateway-backed
  `glowbotHub.productFlags.list` surface
- admin tooling reads operational summaries through
  `glowbotHub.diagnostics.summary`

The hub contract is product-specific, not generic platform control-plane API.

---

## Admin App Contract

The admin app is a separate hosted app package that talks to the hub. It does
not collapse the hub into a collection of direct database tables and it does
not replace frontdoor operator APIs.

Canonical admin method families:

```text
glowbot-admin.clinics.list
glowbot-admin.clinics.get
glowbot-admin.benchmarks.list
glowbot-admin.benchmarks.networkHealth
glowbot-admin.benchmarks.seeds.publish
glowbot-admin.cohorts.list
glowbot-admin.cohorts.update
glowbot-admin.productFlags.list
glowbot-admin.productFlags.update
```

The admin app owns:

- operator UX
- search and filter workflows
- review and correction workflows
- approval and publishing flows

The admin app does not own:

- package lifecycle mutation
- managed provider client secrets
- managed GitHub App private keys
- reusable adapter callback handling

---

## Explicit Non-Goals

The hub and admin app must not own:

- runtime package lifecycle APIs
- frontdoor package registry behavior
- raw adapter event storage
- patient-level or appointment-level source records
- generic shared-adapter callback/webhook plumbing

Additional boundary rules:

- the admin app must never own long-lived provider secrets
- the GlowBot hub may own GlowBot-managed provider secrets in its product
  control-plane role
- the GlowBot hub must never return long-lived provider secrets to frontdoor,
  tenant runtimes, or admin browsers
- platform-managed profiles remain owned by frontdoor, not by the GlowBot hub

---

## Managed Connection Boundary

This matters for both GlowBot and other apps such as Spike.

When an app-specific connection profile depends on app-managed provider
credentials or app-managed provider setup state:

- the runtime calls frontdoor's private managed-connection gateway
- frontdoor authenticates the runtime and resolves authoritative
  server/tenant/app/profile context
- frontdoor first checks for an exact platform-managed profile match
- if no platform-managed match exists, frontdoor relays to the GlowBot hub as
  GlowBot's product control plane
- runtime executes the shared adapter flow
- the shared adapter remains generic
- the tenant runtime stores connection state and `connection_id`, not
  long-lived GlowBot-managed provider secrets

### Managed OAuth

Examples:

- `glowbot-managed-google-oauth`

For GlowBot-managed OAuth profiles:

- the GlowBot hub stores the OAuth client secret reference
- frontdoor remains the runtime-facing gateway
- frontdoor relays the secret-backed metadata/exchange work to the GlowBot hub

For platform-managed OAuth profiles:

- frontdoor may own the profile and serve the runtime directly

### Managed custom-flow

Examples:

- `spike-managed-github-app`

For managed custom-flow profiles such as a GitHub App install:

- the product control plane stores the app private key and other
  product-managed secrets
- frontdoor exposes the private runtime-facing gateway and relays to the
  product control plane
- the shared adapter auth method for the managed path consumes product-backed
  runtime-private material through that gateway
- the tenant runtime does not persist the managed private key as a reusable
  local secret file

This preserves the same control-plane secret boundary as managed OAuth while
keeping product-specific secret ownership out of frontdoor.

---

## Relationship To Persisted Derived Outputs

GlowBot may later persist higher-level local derived outputs such as:

- `funnel_snapshot`
- `trend_delta`
- `dropoff_analysis`
- `recommendation`

That does not change the hub contract.

The stable boundary is still:

1. clinic runtime computes product summaries locally
2. clinic runtime publishes benchmark-safe snapshots to the hub
3. hub aggregates and serves peer benchmarks

Persisted derived outputs are a local clinic-runtime optimization and auditability
decision, not a hub API requirement.

---

## Canonical Long-Term Result

The long-term product split is:

- frontdoor owns platform-managed secret boundaries and the runtime-facing
  managed-connection gateway
- runtime owns shared adapter execution and clinic-local data primitives
- GlowBot app owns clinic-facing product logic
- GlowBot hub owns shared benchmark/control data and GlowBot-managed provider
  secret boundaries
- GlowBot admin owns operator UX on top of the hub

That is the stable architecture GlowBot should continue building toward.
