# AIL-007 End-To-End Click-To-Outcome Proof Ladder

## Goal

Define and land the durable validation ladder for the attribution intelligence
layer, centered on the real business journey from acquisition through
attributed outcome.

## Golden Journey

1. acquisition input is connected and current
2. website input is installed and captures first-party session and funnel data
3. backend outcome input is connected and current
4. the attribution intelligence app reconciles those inputs into one attributed
   outcome
5. the operator can inspect both aggregate and row-level result correctly

## Delivered

- umbrella validation doc:
  [attribution-intelligence-click-to-outcome-proof-ladder.md](/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-intelligence-click-to-outcome-proof-ladder.md)
- retained passed bundle:
  [attribution-click-to-outcome-proof-summary.json](/Users/tyler/nexus/state/sandboxes/271f6890-24e2-4d09-95c0-829f1310678d/artifacts/validation/attribution-click-to-outcome-live/20260331T181451Z/attribution-click-to-outcome-proof-summary.json)
- durable promoted artifact:
  [click-to-outcome-proof-latest.json](/Users/tyler/nexus/state/artifacts/validation/attribution-intelligence/click-to-outcome-proof-latest.json)

## Acceptance

1. cleanroom validation exists for the full business journey
   Status: met
2. the proof path uses real adapter connections where appropriate
   Status: met via package-scoped real-credential adapter proofs plus the
   integrated website-input and attribution cleanroom proof
3. expected operator-visible outcomes are explicit before execution
   Status: met in the validation doc and proof summary
4. the validation artifact is durable and can survive beyond the initial
   implementation workplan
   Status: met via promoted host-side artifacts under `state/artifacts/`

## Notes

- the final passed proof was completed in a retained cleanroom sandbox after
  host-side launcher retries were interrupted by local runtime restarts
- that host-runtime flake does not change the cleanroom result; the retained
  bundle and promoted stable artifact are the canonical closure evidence
