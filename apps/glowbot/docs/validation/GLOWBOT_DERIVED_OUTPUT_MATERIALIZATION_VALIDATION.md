# GlowBot Derived Output Materialization Validation

> Focused validation ladder for W12.

---

## Validation Order

1. definition registration
2. DAG registration
3. per-job persistence
4. provenance links
5. recommendation versioning
6. parity against on-demand reads

---

## Checkpoints

| # | Checkpoint | Pass Criteria |
|---|---|---|
| DV1 | Derived element definitions exist | `funnel_snapshot`, `trend_delta`, `dropoff_analysis`, and `recommendation` are registered in memory definitions |
| DV2 | Derived-output DAG exists | the dedicated derived-output DAG is registered with the expected node dependencies |
| DV3 | `funnel_compute` persists outputs | one or more `funnel_snapshot` elements are created for a synthetic metric window |
| DV4 | `trend_compute` persists outputs | one or more `trend_delta` elements are created for a synthetic metric window |
| DV5 | `dropoff_detect` persists outputs | one or more `dropoff_analysis` elements are created from persisted upstream outputs |
| DV6 | `recommend` persists outputs | one or more `recommendation` elements are created from persisted analyses |
| DV7 | Derived outputs carry period and clinic scope | persisted elements preserve `window`, period bounds, and `clinic_id` where present |
| DV8 | Provenance links exist | derived elements link back to source metrics or upstream analyses with canonical link types |
| DV9 | Recommendation supersession works | rerunning recommendation generation creates a new active recommendation and supersedes the old one |
| DV10 | DAG advances end to end | a single W12 DAG run reaches terminal completion with downstream job runs created in order |
| DV11 | Schedule-driven refresh works | schedule-driven pipeline execution produces persisted derived outputs |
| DV12 | Persisted outputs match on-demand reads | synthetic parity checks show persisted outputs are consistent with the current on-demand model |

---

## Evidence

Minimum evidence:

- focused job tests for all four compute jobs
- DAG integration test
- schedule integration test
- parity assertions against the current on-demand read model

W12 should not be marked complete from unit tests alone if DAG advancement or
schedule-driven execution is still unproven.
