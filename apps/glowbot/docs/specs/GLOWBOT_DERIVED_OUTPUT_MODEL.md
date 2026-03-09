# GlowBot Derived Output Model

> Canonical target-state model for persisted clinic-runtime derived outputs in
> GlowBot.

---

## Purpose

This document defines GlowBot's target-state persisted derived outputs inside
the clinic runtime.

It exists to make five things explicit:

1. which outputs are persisted beyond raw `metric` elements
2. which jobs produce those outputs
3. how those outputs relate to product views, recommendations, and benchmarks
4. what provenance and versioning rules apply
5. how the derived-output model stays separate from the shared benchmark
   network contract

This document is a local clinic-runtime data-model spec. It does not define the
shared hub contract.

Related canon:

- [DATA_PIPELINE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/DATA_PIPELINE.md)
- [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)

---

## Customer Experience

The customer should experience:

1. stable funnel and modeling views for a chosen period
2. durable recommendations and analysis history
3. explainable provenance from recommendations back to underlying metrics
4. the ability for GlowBot to evolve UI and read-path performance without
   changing the meaning of the product views

The customer should not care whether a view was computed live or read from a
persisted observation.

The platform still must care because persistence defines:

- provenance
- historical comparison
- job boundaries
- explainability

---

## Non-Negotiable Design Rules

1. Raw `metric` elements remain the canonical local source of truth.
2. Derived outputs are persisted as re-derivable observations or mental models,
   never as mutable in-place transformations of raw metrics.
3. Derived outputs link back to source metrics via element links.
4. Derived outputs remain clinic-runtime-local and are not the public hub
   contract.
5. Persisted derived outputs must preserve `clinic_id` and period boundaries.
6. Persisted derived outputs are owned by GlowBot app computation jobs, not by
   nex core itself.
7. The hub consumes benchmark-safe snapshots, not raw derived-output elements
   directly.

---

## Canonical Derived Output Types

GlowBot persists four higher-level output families.

### `funnel_snapshot`

Produced by `funnel_compute`.

Represents:

- one funnel step
- one period
- one clinic scope or rolled-up clinic set
- one computed conversion context

### `trend_delta`

Produced by `trend_compute`.

Represents:

- one metric or funnel dimension
- one current-vs-baseline comparison
- one period pair
- one directional movement with confidence metadata

### `dropoff_analysis`

Produced by `dropoff_detect`.

Represents:

- one meaningful funnel weakness or operational gap
- one affected stage or metric region
- one supporting evidence package

### `recommendation`

Produced by `recommend`.

Represents:

- one operator/customer-facing action recommendation
- one supporting analysis context
- one status/versioned recommendation record

---

## Canonical Job Boundaries

The target-state local derived-output jobs are:

```text
metric_extract
funnel_compute
trend_compute
dropoff_detect
recommend
```

### Job responsibilities

- `metric_extract`
  - normalize adapter events into `metric` elements
- `funnel_compute`
  - compute persisted `funnel_snapshot` observations from metric elements
- `trend_compute`
  - compute persisted `trend_delta` observations from metric elements and/or
    funnel snapshots
- `dropoff_detect`
  - compute persisted `dropoff_analysis` observations from funnel snapshots and
    trend deltas
- `recommend`
  - compute persisted `recommendation` elements from the analysis package

The clinic app may temporarily compute some of these views on demand during a
cutover, but that is not the target-state model.

---

## Canonical Element Shapes

### Funnel snapshot

```typescript
interface GlowbotFunnelSnapshotElementMetadata {
  kind: "funnel_snapshot"
  period_start: string
  period_end: string
  clinic_id?: string
  step_name: string
  step_order: number
  step_value: number
  prev_step_value: number | null
  conversion_rate: number | null
  peer_median: number | null
  delta_vs_peer: number | null
  source_breakdown?: Record<string, number>
}
```

### Trend delta

```typescript
interface GlowbotTrendDeltaElementMetadata {
  kind: "trend_delta"
  period_start: string
  period_end: string
  baseline_start: string
  baseline_end: string
  clinic_id?: string
  metric_name: string
  current_value: number | null
  baseline_value: number | null
  absolute_delta: number | null
  relative_delta: number | null
  direction: "up" | "down" | "flat"
}
```

### Drop-off analysis

```typescript
interface GlowbotDropoffAnalysisElementMetadata {
  kind: "dropoff_analysis"
  period_start: string
  period_end: string
  clinic_id?: string
  stage_name: string
  severity: "low" | "medium" | "high"
  current_conversion_rate: number | null
  peer_median: number | null
  gap_vs_peer: number | null
  supporting_metric_names: string[]
}
```

### Recommendation

```typescript
interface GlowbotRecommendationElementMetadata {
  kind: "recommendation"
  period_start: string
  period_end: string
  clinic_id?: string
  category: "demand" | "conversion" | "local" | "benchmark" | "modeling"
  confidence: "HIGH" | "MEDIUM" | "LOW"
  score: number
  status: "active" | "superseded" | "dismissed"
}
```

---

## Provenance Rules

Every persisted derived output must preserve explainable lineage.

Mandatory rules:

1. every derived output links to the metric elements it was derived from
2. recommendation elements link to the funnel/trend/dropoff elements that
   support them
3. superseded recommendations link to newer recommendations via `supersedes`
4. derived outputs must preserve period boundaries and clinic scope

Canonical link types:

- `derived_from`
- `supports`
- `supersedes`

---

## Relationship To Read Surfaces

Target-state read surfaces may:

- read persisted derived outputs directly
- recompute from raw metrics when necessary
- blend persisted outputs with fresh runtime state for presentation

The target state prefers persisted derived outputs as the stable read-model
basis for:

- funnel views
- trend views
- drop-off summaries
- recommendation history

On-demand recomputation is a cutover tactic, not the canonical steady-state
design.

---

## Relationship To The Benchmark Network

The hub does not ingest these local element types directly as its product
boundary.

Instead:

- the clinic runtime derives a benchmark-safe `ClinicBenchmarkSnapshot`
- that snapshot may use raw metrics alone
- or it may use persisted derived outputs
- the hub contract remains unchanged either way

This separation is required so benchmark-network APIs do not churn when the
local derived-output model evolves.

---

## Validation Expectations

The derived-output model is not considered landed until all of these are true:

1. the four output families are registered as element definitions
2. the compute jobs write persisted outputs instead of only returning in-memory
   view data
3. provenance links are created for every persisted output
4. recommendations are versioned or superseded rather than overwritten
5. clinic read surfaces can use persisted derived outputs without losing product
   meaning

---

## Explicit Non-Goals

- This model does not move GlowBot business semantics into nex core.
- This model does not make the hub depend on raw local derived-output elements.
- This model does not make raw metric elements mutable.
