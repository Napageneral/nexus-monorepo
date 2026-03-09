# GlowBot Benchmark Network

> Canonical target-state contract for benchmark publication, aggregation, seed
> data, cohorting, and peer benchmark query behavior.

---

## Purpose

This document defines GlowBot's shared benchmark network.

It exists to make six things explicit:

1. what clinics publish to the GlowBot hub
2. what the hub aggregates and stores
3. how peer-network data and seed data coexist
4. how cohorts are assigned
5. what benchmark data the clinic app and admin app can query
6. which privacy and freshness rules are non-negotiable

This document is the detailed benchmark contract behind:

- [GLOWBOT_HUB_AND_ADMIN_CONTRACT.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_HUB_AND_ADMIN_CONTRACT.md)
- [CENTRAL_HUB.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/CENTRAL_HUB.md)
- [GLOWBOT_CLINIC_PROFILE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_CLINIC_PROFILE.md)
- [GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md)

---

## Customer And Operator Experience

The intended product experience is:

1. a clinic uses GlowBot and sees peer-aware benchmark context inside product
   views
2. GlowBot compares the clinic against relevant peers, not against a global
   undifferentiated average
3. operators can inspect benchmark freshness, coverage, cohort definitions, and
   sample size health through `glowbot-admin`
4. benchmarks remain useful even when peer participation is thin because
   curated seed datasets can fill gaps without pretending to be live peer
   network data

The customer should see useful benchmark context with honest provenance.

The operator should see whether GlowBot's benchmark network is healthy.

---

## Non-Negotiable Design Rules

1. The benchmark publication unit is `ClinicBenchmarkSnapshot`.
2. The hub never requires raw patient-level or appointment-level data to power
   the benchmark network.
3. The benchmark network is snapshot-based, not raw-event-based.
4. Peer-network aggregates and seed-based benchmarks may coexist, but their
   source attribution must remain explicit.
5. Cohort assignment must be deterministic from canonical clinic profile data.
6. Benchmark query responses must expose freshness and sample size.
7. The benchmark contract must remain stable whether the clinic app computes
   local views on demand or later persists derived outputs.
8. Benchmark publication is product-scoped GlowBot behavior, not a generic nex
   runtime primitive.
9. The clinic app owns the canonical `ClinicProfile`; the hub owns deterministic
   `profileKey` resolution from that object.
10. The clinic app reaches the hub through the frontdoor-mediated
    product-control-plane gateway, not by direct hub URL.

---

## Canonical Publication Object

Clinic runtimes publish benchmark-safe summary snapshots.

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

### Publication rules

- one snapshot describes one clinic, one cohortable profile, and one time window
- a snapshot may be generated from on-demand local computation or persisted
  local derived outputs
- the hub must not care which local implementation path produced it
- the snapshot is the stable cross-installation contract
- `specialty` is required
- `monthlyAdSpendBand`, `patientVolumeBand`, and `locationCountBand` may be
  `"unknown"` during early rollout

The source-of-truth `clinicProfile` object is defined in:

- [GLOWBOT_CLINIC_PROFILE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_CLINIC_PROFILE.md)

---

## Canonical Query Object

The hub returns benchmark records keyed by cohort and period.

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

Query responses must preserve:

- cohort identity
- time window
- benchmark metric identity
- source attribution
- freshness
- sample size

---

## Cohort Model

The benchmark network uses canonical cohort/profile assignment rather than
ad hoc benchmark buckets.

### Cohort definition

```typescript
interface GlowbotBenchmarkCohort {
  profileKey: string
  specialty: string
  monthlyAdSpendBand: string
  patientVolumeBand: string
  locationCountBand: string
  active: boolean
  createdAtMs: number
  updatedAtMs: number
}
```

### Cohort rules

- profile assignment is deterministic from `clinicProfile`
- the hub owns the canonical cohort definitions
- operators can update cohort definitions through the admin surface
- changing cohort rules must not silently rewrite historical benchmark records
- the hub does not replace the clinic app as the canonical owner of the
  published `ClinicProfile`

Historical benchmark records should remain traceable to the cohort definition
that existed when they were aggregated.

---

## Seed Dataset Model

Seed datasets exist to provide useful baseline benchmarks when live peer data is
thin or missing.

```typescript
interface GlowbotBenchmarkSeedRecord {
  seedRecordId: string
  profileKey: string
  periodKind: "7d" | "30d" | "90d"
  metricName: string
  peerMedian: number
  peerP25: number
  peerP75: number
  sourceLabel: string
  publishedAtMs: number
}
```

### Seed rules

- seed data is curated operator-controlled product data
- seed records must never masquerade as live peer-network data
- query responses must preserve `source: "industry_seed"` for seed-backed
  results
- if both live peer data and seed data are available, live peer data wins for
  the primary benchmark result

---

## Publication Flow

Canonical flow:

1. the clinic app computes a `ClinicBenchmarkSnapshot`
2. the clinic app calls the runtime-facing product-control-plane gateway for
   `glowbotHub.benchmarks.publishSnapshot`
3. the hub validates the snapshot shape
4. the hub resolves the canonical `profileKey`
5. the hub stores the snapshot as benchmark-network input
6. the hub updates or recomputes aggregate benchmark records for the affected
   cohort and period

Important boundary:

- benchmark publication is not raw metric replication
- benchmark publication is a product-level summary handoff from clinic runtime
  to hub

---

## Query Flow

Canonical flow:

1. the clinic app asks the runtime-facing product-control-plane gateway for
   benchmark context for a profile and period
2. the hub returns peer-network records when healthy live data exists
3. the hub falls back to seed records when live data is missing or below
   threshold
4. the hub returns sample size and freshness with the result

The clinic app must be able to tell the user whether a comparison comes from:

- live peer network data
- industry seed data

---

## Canonical Hub Methods

```text
glowbotHub.benchmarks.publishSnapshot
glowbotHub.benchmarks.query
glowbotHub.benchmarks.networkHealth
glowbotHub.benchmarks.seed.publish
glowbotHub.benchmarks.seed.list
glowbotHub.cohorts.list
glowbotHub.cohorts.update
```

### Method intent

- `publishSnapshot` accepts `ClinicBenchmarkSnapshot`
- `query` returns benchmark records plus source and freshness metadata
- `networkHealth` returns operator-oriented benchmark coverage status
- `seed.publish` manages curated seed datasets
- `cohorts.*` manages canonical cohort definitions

Clinic app transport rule:

- the clinic app reaches these methods through the frontdoor-mediated
  product-control-plane gateway described in
  [GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_PRODUCT_CONTROL_PLANE_GATEWAY.md)

---

## Diagnostics And Network Health

The benchmark network needs explicit operator-facing health surfaces.

Canonical health questions:

- how many clinics published snapshots in the last 7d / 30d
- which cohorts have healthy peer coverage
- which cohorts are seed-only
- which clinics are stale or no longer publishing
- which benchmark metrics are below minimum sample-size thresholds

These are hub/admin concerns, not clinic-runtime concerns.

---

## Privacy Rules

The benchmark network must not require or store:

- patient names
- emails
- phone numbers
- appointment-level rows
- raw conversation payloads
- raw adapter event payloads
- long-lived provider secrets

The benchmark network stores only benchmark-safe clinic summary data and
operator-controlled benchmark metadata.

---

## Relationship To The Derived Output Model

The benchmark network consumes benchmark-safe summary snapshots, not internal
GlowBot element types directly.

That means:

- the clinic app may generate snapshots from on-demand read-time computation
- the clinic app may later generate snapshots from persisted
  `funnel_snapshot`, `trend_delta`, `dropoff_analysis`, and `recommendation`
  elements
- the hub contract does not change when the clinic runtime changes its internal
  derived-output strategy

This decoupling is intentional and mandatory.

---

## Validation Expectations

The benchmark network is not considered real until all of these are true:

1. the clinic app can publish a valid snapshot
2. the hub rejects malformed or privacy-unsafe snapshots
3. the hub assigns a canonical cohort/profile key
4. the hub can return live peer-network benchmark records
5. the hub can return seed-backed fallback benchmark records
6. query responses include source attribution, freshness, and sample size
7. the admin surface can show benchmark network health and stale participation

---

## Explicit Non-Goals

- The benchmark network does not ingest raw adapter events as its public API.
- The benchmark network does not replace clinic-local product computation.
- The benchmark network does not hide whether data came from peers or seeds.
- The benchmark network does not require persisted local derived outputs before
  it can exist.
