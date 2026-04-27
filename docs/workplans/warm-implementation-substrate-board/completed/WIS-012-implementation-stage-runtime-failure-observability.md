# WIS-012 Implementation-Stage Runtime Failure Observability

## Goal

Make implementation-stage startup failures concrete, inspectable, and fast to
diagnose.

## Scope

- instrument the implementation-stage app-method path after prepared-substrate
  resolution and before worker attach
- log the exact downstream method being called, request id, and timeout or
  cancellation cause
- log sandbox materialization milestones with enough detail to distinguish:
  image resolution failure, sandbox create failure, workspace projection
  failure, runtime transport failure, and worker-launch failure
- preserve concise operator logs while still capturing the concrete downstream
  reason instead of only `app method failed: fetch failed`
- add focused tests around the new error-surfacing path where feasible

## Acceptance

- when `implementing` fails, the runtime logs show the concrete downstream
  failure boundary
- operators can tell whether the failure was in image resolution, sandbox
  creation, materialization, transport, or worker launch without reconstructing
  the path manually
- the generic `fetch failed` wrapper is no longer the only surfaced clue for
  implementation-stage startup failures

## Current Evidence

- live `SPEC-259` lineage `dagrun_aa2fe17d-b595-44b2-82b3-d0165e571734` failed
  in `implementing`
- `work.db` stores the job error only as `app method failed: fetch failed`
- runtime logs show the stage got as far as starting `docker create` for the
  implementation sandbox, but the terminal downstream cause is not surfaced
  cleanly enough for operator diagnosis
