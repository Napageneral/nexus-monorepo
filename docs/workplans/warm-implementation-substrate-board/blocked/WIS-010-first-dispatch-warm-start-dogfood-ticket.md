# WIS-010 First Dispatch Warm-Start Dogfood Ticket

## Goal

Close one real Dispatch ticket through the new warm implementation startup path
without regressing candidate-artifact handoff or fresh validation cleanrooms.

## Scope

- run one live Dispatch ticket with a warm implementation substrate
- prove the implementation worker does not waste critical-path budget on repo
  install or startup repair
- prove candidate artifact publication still works
- prove validation still runs in a fresh cleanroom against that candidate

## Acceptance

- one real Dispatch issue reaches `implementing` through a warm preflighted
  substrate
- the implementation worker no longer burns most of its budget on install or
  startup triage
- candidate-artifact publication and fresh validation signoff still work on the
  same run

## Current Evidence

- warm-start substrate path is proven through `triage`, `hydrate_repo`,
  `planning`, `preparing_substrate`, `implementing`, candidate publication, and
  validation packet creation on the live `SPEC-259` lineage
- runtime restart fencing is live and now blocks restart while active work is
  running instead of silently tearing down the runtime
- the current best live proof is
  `dagrun_8b9a8c1e-78f0-4719-ac74-04e640500b0b`, which completed
  `preparing_substrate`, `implementing`, `validating`, and reached
  `reviewing`
- that run preserved a real candidate artifact and validation packet:
  `candidate_704ab2dd-f5b6-411d-9570-d4fe5a585591` and
  `packet_ec4125fe-26b1-4330-b95f-efd05d3f1902`
- the proof harness now exports host-visible cleanroom bundles, so the current
  remaining work is in the proof/evidence path itself rather than in startup,
  artifact export, or runtime interruption handling
- focused runtime verification still passes:
  - `pnpm exec vitest run src/runtime/domains/sandboxes/service.test.ts --reporter=dot`
  - `pnpm exec vitest run src/runtime/domains/sandboxes/implementation-substrate-work.test.ts src/api/internal-jobs/implementation-substrate-job.test.ts --reporter=dot`

## Current Gate

- `WIS-011` through `WIS-019` are complete in code and verification
- warm-start itself is now proven through prepared substrate creation,
  implementation worker attach, candidate publication, validation packet
  creation, and validation-stage execution on one lineage
- the remaining blocker is no longer startup architecture
- the live run now fails in `reviewing` because the required `demo_proof`
  evidence tier is not satisfied; the run finished with `current_tier =
  minimum_reviewable`
- the blocking gap is the product/golden-journey proof lane:
  the review package still lacks the UI/demo-proof evidence needed to satisfy
  the review gate on the same lineage
- the follow-on execution lane for that gap is
  [Dispatch Golden Runner Demo-Proof Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-golden-runner-demo-proof-board/README.md)

## Exit Criteria To Close

- rerun the same live Dispatch issue on the hard-cut startup-profile registry
  path with the completed warm-start and validation-resilience architecture
- confirm the implementation worker still launches through the ready prepared
  substrate on `compact_worker` without meaningful cold-start repair on the
  critical path
- confirm candidate-artifact publication and fresh validation cleanroom signoff
  complete on the same lineage
- confirm the resulting review package satisfies the required `demo_proof`
  tier rather than stalling at `minimum_reviewable`
