# GlowBot Derived Output Materialization

> Detailed W12 execution spec for persisting GlowBot derived outputs without
> cutting the clinic read path over prematurely.

---

## Purpose

This document defines how GlowBot moves from:

- durable raw `metric` elements
- on-demand funnel/trend/dropoff/recommendation computation

to:

- durable persisted derived outputs
- DAG-driven materialization
- provenance-preserving recommendation history

It is intentionally narrower than
[GLOWBOT_DERIVED_OUTPUT_MODEL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_DERIVED_OUTPUT_MODEL.md).

That document locks the target-state data model.
This document locks the concrete W12 cutover strategy.

Related canon:

- [GLOWBOT_DERIVED_OUTPUT_MODEL.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_DERIVED_OUTPUT_MODEL.md)
- [DATA_PIPELINE.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/DATA_PIPELINE.md)
- [GLOWBOT_BENCHMARK_NETWORK.md](/Users/tyler/nexus/home/projects/nexus/apps/glowbot/docs/specs/GLOWBOT_BENCHMARK_NETWORK.md)
- [Jobs, Schedules, and DAGs](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/work/jobs-schedules-and-dags.md)

---

## Customer Experience

The customer should experience:

1. the same clinic views they already have today
2. durable recommendation history instead of ephemeral recomputation only
3. stable derived outputs that can be inspected and explained later
4. no immediate UI churn while we learn from the first clinic’s real data

The first W12 cut should therefore:

- persist derived outputs
- preserve provenance and history
- keep the clinic read path on-demand until post-clinic evidence says the
  persisted read model is ready

This is a materialization-first slice, not a read-path cutover slice.

---

## Current State

Current code reality:

- `metric_extract` is real and durable
- clinic read surfaces compute from `metric` elements on demand
- `funnel_compute`, `trend_compute`, `dropoff_detect`, and `recommend` are
  placeholders
- GlowBot already has stable pure computation modules for:
  - funnel snapshots
  - trend deltas
  - drop-off analysis
  - recommendation generation

This means W12 does **not** require inventing new product semantics.
It requires:

- persisting the existing computed semantics
- versioning and provenance
- DAG-driven orchestration

---

## Non-Negotiable Rules

1. `metric` elements remain the canonical clinic-runtime source of truth.
2. Persisted derived outputs are new elements, never in-place mutation of raw
   metrics.
3. `metric_extract` remains the canonical `record.ingested` and `schedules.*`
   wake-up seam.
4. Derived-output materialization is triggered **after** `metric_extract`
   succeeds; W12 does not replace the already-proven ingest seam.
5. The clinic UI stays on the current on-demand read path for the first W12
   implementation slice.
6. Every derived element must preserve clinic scope, period bounds, and
   explainable provenance.
7. Recommendations are versioned; they are not overwritten.
8. The hub contract remains benchmark snapshots, not direct consumption of
   local derived elements.

---

## W12 Execution Model

### Phase 1: Materialize, But Keep Reads On-Demand

Phase 1 does all of the following:

- registers derived element definitions
- implements the four compute jobs
- persists derived outputs
- creates provenance links
- runs compute through a dedicated derived-output DAG

Phase 1 does **not** do either of the following:

- switch clinic methods to read persisted derived outputs by default
- make the hub depend on local derived elements directly

### Phase 2: Optional Read-Path Adoption

Only after real clinic evidence:

- overview/funnel/modeling/agents surfaces may selectively read persisted
  outputs
- recommendation history may become the primary source for agents surfaces

Phase 2 is intentionally deferred.

---

## Canonical Trigger Model

### Keep The Existing Ingest Trigger

The canonical ingest trigger stays:

```text
record.ingested
  -> events.subscriptions.*
  -> metric_extract
  -> metric elements
```

The canonical time-based trigger stays:

```text
schedules.*
  -> metric_extract
  -> metric elements
```

### Add A Dedicated Derived-Output DAG

After `metric_extract` succeeds, GlowBot starts a dedicated derived-output DAG.

Canonical DAG:

```text
metric_extract
  -> dags.runs.start(glowbot_derived_outputs)
       -> funnel_compute
       -> trend_compute
       -> dropoff_detect (depends on funnel_compute + trend_compute)
       -> recommend      (depends on dropoff_detect)
```

Why this shape:

- it preserves the already-proven ingest path
- it keeps raw metric extraction independent from derived-output materialization
- it lets W12 land without destabilizing `record.ingested` handling

---

## Canonical Element Types

W12 requires five registered element types in the clinic runtime:

- `metric` (already real)
- `funnel_snapshot`
- `trend_delta`
- `dropoff_analysis`
- `recommendation`

The four derived types are first-class types, not just `observation` rows with
an internal `kind` field.

---

## Canonical Job Responsibilities

### `metric_extract`

Already real.

Additional W12 responsibility:

- return a summary payload that can trigger the downstream derived-output DAG
- start `glowbot_derived_outputs` when new or updated metrics were written

Canonical output summary:

```typescript
interface MetricExtractResult {
  status: "ok";
  recordId: string;
  metricElementIds: string[];
  clinicIds: string[];
  touchedDates: string[];
  triggeredDerivedDagRunId?: string;
}
```

### `funnel_compute`

Inputs:

- metric elements for the target period
- optional `clinic_id` scope
- optional benchmark context already available to the clinic runtime

Writes:

- one `funnel_snapshot` element per funnel step per clinic scope per period

Returns:

- created or updated funnel snapshot ids

### `trend_compute`

Inputs:

- metric elements for current and baseline periods
- optional `clinic_id` scope

Writes:

- one `trend_delta` element per metric dimension per clinic scope per period

Returns:

- created or updated trend delta ids

### `dropoff_detect`

Inputs:

- persisted funnel snapshots for the target period
- persisted trend deltas for the target period pair

Writes:

- one or more `dropoff_analysis` elements per clinic scope per period

Returns:

- created or updated dropoff analysis ids

### `recommend`

Inputs:

- persisted funnel snapshots
- persisted trend deltas
- persisted dropoff analyses

Writes:

- versioned `recommendation` elements

Returns:

- active recommendation ids
- superseded recommendation ids

---

## Canonical Materialization Windows

W12 materializes derived outputs for a bounded set of windows:

- `7d`
- `30d`
- `90d`

The initial implementation may compute all three windows per run.

Reason:

- this matches the existing clinic experience
- keeps read-time comparisons consistent
- avoids inventing a second period vocabulary just for persisted outputs

Each persisted element must therefore preserve:

- `window`
- `period_start`
- `period_end`
- where applicable `baseline_start`
- where applicable `baseline_end`

---

## Canonical Provenance Rules

### Derived Outputs To Metrics

- `funnel_snapshot` -> `metric` via `derived_from`
- `trend_delta` -> `metric` via `derived_from`
- `dropoff_analysis` -> `funnel_snapshot` and/or `trend_delta` via `derived_from`
- `recommendation` -> `dropoff_analysis`, `trend_delta`, and relevant
  `funnel_snapshot` via `supports`

### Recommendation Versioning

Recommendations need a stable lineage key:

- `clinic_id`
- `window`
- `period_end`
- `category`
- `recommendation_key`

When a recommendation with the same lineage key changes materially:

1. the previously active recommendation is versioned to `status = "superseded"`
2. a new active recommendation element is created
3. the new element links to the previous active element via `supersedes`

Recommendations are never overwritten in place.

---

## Canonical Idempotency Rules

The compute jobs must be rerunnable.

### Funnel / Trend / Dropoff

Canonical idempotency key:

- `type`
- `clinic_id`
- `window`
- `period_start`
- `period_end`
- shape-specific identity:
  - `step_name` for funnel snapshots
  - `metric_name + adapter_id` for trend deltas
  - `analysis_key` for drop-off analyses

If the same identity already exists for the same inputs:

- the job updates by versioning through `memory.elements.update`
- not by mutating in place

### Recommendations

Recommendations use the versioning rules above.

---

## Canonical Read-Path Behavior During W12

During W12 implementation:

- clinic methods keep using the current on-demand read model
- persisted derived outputs are validated against those on-demand responses
- read cutover is postponed until real clinic evidence says the materialized
  outputs are trustworthy

This keeps W12 additive rather than destabilizing.

---

## Validation Expectations

W12 is not complete when the jobs merely stop returning `"deferred"`.

W12 is complete only when:

1. derived element definitions are registered
2. the four compute jobs persist real elements
3. provenance links are created
4. recommendation versioning works
5. a DAG run advances through all nodes end to end
6. scheduled refresh produces real derived outputs
7. persisted outputs can be compared against the current on-demand read model

Detailed checkpoint validation belongs in:

- `docs/archive/validation/GLOWBOT_DERIVED_OUTPUT_MATERIALIZATION_VALIDATION.md`
