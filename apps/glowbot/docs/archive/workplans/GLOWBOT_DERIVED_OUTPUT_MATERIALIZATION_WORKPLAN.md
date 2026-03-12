# GlowBot Derived Output Materialization Workplan

> Focused W12 workplan for persisting derived outputs while keeping clinic
> reads on-demand.

---

## Scope

This workplan covers:

- derived element-definition registration
- compute job implementation
- dedicated derived-output DAG registration
- provenance link creation
- recommendation versioning
- validation against the current on-demand read model

This workplan does **not** include:

- live clinic credential validation
- immediate clinic read-path cutover to persisted outputs

---

## Work Sequence

### W12.1 Register Derived Element Definitions

Implement and validate registration for:

- `funnel_snapshot`
- `trend_delta`
- `dropoff_analysis`
- `recommendation`

Files likely touched:

- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/app/pipeline/registry.ts`
- install/upgrade hooks

### W12.2 Add Dedicated Derived-Output DAG

Create a dedicated DAG rooted below `metric_extract`:

- `funnel_compute`
- `trend_compute`
- `dropoff_detect`
- `recommend`

Do not replace the existing `record.ingested -> metric_extract` seam.

### W12.3 Implement `funnel_compute`

Use the existing funnel computation module to:

- load the bounded metric window
- compute snapshots
- persist one `funnel_snapshot` element per step/window/clinic scope
- return created element ids

### W12.4 Implement `trend_compute`

Use the existing trend computation module to:

- compute current vs baseline deltas
- persist `trend_delta` elements
- return created element ids

### W12.5 Implement `dropoff_detect`

Use persisted funnel/trend outputs to:

- compute persisted `dropoff_analysis`
- persist those analyses
- return created element ids

### W12.6 Implement `recommend`

Use persisted analysis outputs to:

- compute recommendations
- supersede prior active recommendations when lineage matches
- persist active recommendation elements
- create `supports` and `supersedes` links

### W12.7 Materialization Validation Against On-Demand Reads

Add tests that compare:

- on-demand funnel output vs persisted `funnel_snapshot`
- on-demand trends vs persisted `trend_delta`
- on-demand dropoff/recommendation logic vs persisted outputs

### W12.8 Optional Read-Cutover Decision

Do not automatically switch clinic reads.

After W12 lands:

- compare persisted outputs to real clinic evidence
- decide later whether read surfaces should adopt persisted outputs

---

## Exit Criteria

W12 is complete when:

1. derived element definitions exist
2. all four compute jobs are real
3. the dedicated derived-output DAG runs end to end
4. provenance links exist
5. recommendation supersession works
6. validation shows persisted outputs match the current on-demand model closely

