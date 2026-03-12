# GlowBot — Central Hub Specification

> Product-specific shared control-plane app behavior, benchmark aggregation, and operator surfaces for GlowBot on the hosted Nex platform.
>
> Detailed hub/admin contract material now lives in:
>
> - [GLOWBOT_HUB_AND_ADMIN_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_AND_ADMIN_CONTRACT.md)
> - [GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_DEPLOYMENT.md)
> - [GLOWBOT_HUB_SERVICE_SHELL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_SERVICE_SHELL.md)
> - [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)
> - [GLOWBOT_ADMIN_SURFACE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_ADMIN_SURFACE.md)

---

## Customer And Operator Experience

The intended hosted GlowBot experience is:

1. a clinic user signs into frontdoor
2. frontdoor provisions and manages the server
3. frontdoor installs the GlowBot app package plus required shared adapter packages on clinic servers
4. the clinic launches GlowBot through the frontdoor shell
5. the clinic connects integrations through runtime-owned adapter connection flows
6. GlowBot computes clinic-local intelligence from adapter data inside the tenant runtime
7. GlowBot pulls shared benchmark and product control data from the GlowBot hub app
8. GlowBot operators manage benchmarks, clinic profiles, and support workflows through a separate admin app on a dedicated GlowBot control plane server

The GlowBot hub is not a second platform control plane. It is the
product-specific GlowBot control plane service inside the hosted package model.

---

## Package And Execution Model

GlowBot has four distinct product package roles:

- `website/` for public landing and signup
- `app/` for the clinic-facing hosted GlowBot package
- `admin/` for the operator-facing hosted admin package
- `hub/` for the shared GlowBot benchmark and product-control service

Execution split:

- the clinic-facing `glowbot` package is an inline-handler nex app
- the operator-facing `glowbot-admin` package is an inline-handler nex app
- the shared `glowbot-hub` package is a separate headless app package

This split is intentional.

Reasoning:

- clinic-local persistence and orchestration belong to nex core primitives
- clinic-facing product logic belongs in the app package
- shared benchmark and product-control responsibilities belong in the hub
- adding a separate clinic-side service by default would create extra process
  and deployment complexity without a distinct product boundary

---

## Responsibility Split

| Layer | Owns |
|---|---|
| Frontdoor | server provisioning, package registry, dependency resolution, install/upgrade planning, product catalog, billing |
| Hosted runtime | package activation, lifecycle hooks, shared adapter OAuth callbacks, app method execution, tenant-local data and jobs |
| GlowBot hub | benchmark aggregation, shared product configuration, operator workflows, product-specific support APIs |
| GlowBot clinic app | clinic UI, funnel intelligence, recommendations, benchmark consumption, adapter-aware product UX |

Two boundaries are important:

- GlowBot does not provision machines directly.
- GlowBot does not own the reusable adapter connection platform.

Those responsibilities belong to frontdoor and the runtime respectively.

---

## Package Model

GlowBot uses the hosted package model defined in [App Manifest and Package Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/apps/app-manifest-and-package-model.md).

Canonical package roles:

- `glowbot`: clinic-facing app package
- `glowbot-admin`: operator-facing app package
- `glowbot-hub`: shared headless app package for benchmarks and product control data
- shared adapter packages: `google`, `meta-ads`, `patient-now-emr`, `zenoti-emr`, `callrail`, `twilio`, `apple-maps`

Clinic servers declare shared adapter dependencies explicitly:

```json
{
  "id": "glowbot",
  "requires": {
    "adapters": [
      { "id": "nexus-adapter-google", "version": "^0.1.0" },
      { "id": "nexus-adapter-meta-ads", "version": "^0.1.0" },
      { "id": "nexus-adapter-patient-now-emr", "version": "^0.1.0" },
      { "id": "nexus-adapter-zenoti-emr", "version": "^0.1.0" },
      { "id": "nexus-adapter-callrail", "version": "^0.1.0" },
      { "id": "nexus-adapter-twilio", "version": "^0.1.0" },
      { "id": "nexus-adapter-apple-maps", "version": "^0.1.0" }
    ]
  }
}
```

The clinic app manifest does not point at adapter binaries via `../` paths.
Shared adapters remain separate installable packages.

`glowbot-hub` is not a clinic-server dependency in the target state. It is
deployed separately on the dedicated GlowBot product control plane server
alongside `glowbot-admin`.

---

## GlowBot Hub Responsibilities

The hub has four canonical responsibilities.

### 1. Benchmark aggregation

The hub receives benchmark-safe clinic summaries and publishes benchmark datasets back to clinic runtimes.

What the hub stores:

- clinic profile buckets used for comparison
- aggregate conversion benchmarks
- aggregate demand and local visibility benchmarks
- sample-size and freshness metadata
- product-level benchmark definitions and thresholds

What the hub does not store as part of the benchmark network:

- patient-level records
- appointment-level records
- per-patient identifiers
- raw OAuth credentials for standard adapters

### 2. Product control data

The hub serves product-scoped shared data such as:

- benchmark definitions
- category thresholds
- industry seed datasets
- benchmark cohort definitions
- product announcements or operator flags

### 3. Operator workflows

Operators use the hub for:

- clinic profile review and correction
- benchmark quality monitoring
- support diagnostics
- rollout controls for product features

### 4. Shared service endpoints for the GlowBot apps

Clinic and operator apps may call the hub app for:

- benchmark queries
- clinic profile resolution
- support-safe diagnostic summaries
- product control metadata

---

## Benchmark Data Model

Clinic runtimes publish benchmark-safe summaries, not raw clinic datasets.

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
}
```

The hub aggregates these snapshots into benchmark records keyed by profile cohort and period.

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

Privacy rule:

- clinic runtimes send only benchmark-safe aggregates and cohort metadata
- benchmark participation never requires transmitting patient-level or appointment-level records

---

## Admin App

The operator surface is a separate app package, not an internal page bolted onto the hub app.

```json
{
  "id": "glowbot-admin",
  "displayName": "GlowBot Admin",
  "requires": {
    "services": [
      { "id": "glowbot-hub", "version": "^1.0.0" }
    ]
  }
}
```

This dependency applies on the dedicated GlowBot control plane server, not on
clinic servers.

Canonical operator views:

- clinic list and support state
- benchmark network health
- cohort definition and threshold management
- product rollout flags
- aggregate adapter freshness and product diagnostics

Canonical operator methods:

```text
glowbotAdmin.clinics.list
glowbotAdmin.clinics.get
glowbotAdmin.benchmarks.list
glowbotAdmin.benchmarks.publishSeed
glowbotAdmin.benchmarks.networkHealth
glowbotAdmin.productFlags.list
glowbotAdmin.productFlags.update
```

These are product-level methods. They do not replace package lifecycle or runtime operator APIs.

---

## Hub Communication Model

Clinic runtimes access the hub through the product control-plane gateway and
app dependency model.

Canonical interactions:

- clinic app asks the hub for benchmark data matching the clinic profile
- clinic app publishes benchmark-safe summaries to the hub
- admin app queries the hub for network health and support diagnostics

The transport path follows the hosted routing contract:

- humans launch through the frontdoor shell
- runtime and service traffic use hosted runtime transport
- private package lifecycle traffic remains frontdoor-to-runtime operator traffic

GlowBot does not invent a second public lifecycle API for installs, upgrades, or removals.

The hub also does not become the default execution home for clinic-local funnel
math, trend computation, or recommendation logic. Those remain GlowBot app
concerns executed in the clinic-facing app package using nex primitives for
storage and orchestration.

---

## Security And Compliance Constraints

- benchmark uploads contain no patient-level or appointment-level records
- standard adapter OAuth callbacks remain runtime-owned, not hub-owned
- the hub may expose product-specific callbacks only when they are genuinely product-specific
- operator access is authenticated and role-scoped
- hosted deployments handling EMR-derived clinic intelligence run on HIPAA-eligible infrastructure under the hosted platform contract

---

## Reference Specs

- [spec-driven-development-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md)
- [App Manifest and Package Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/apps/app-manifest-and-package-model.md)
- [Platform Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/platform-model.md)
- [Platform Runtime Access and Routing](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/runtime-access-and-routing.md)
- [Platform Packages and Control Planes](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/packages-and-control-planes.md)
- [Managed Connection Gateway](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/managed-connection-gateway.md)
