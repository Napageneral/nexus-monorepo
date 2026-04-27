# IVH-001 Candidate Artifact Contract And Issue State

## Goal

Define a first-class `candidate_artifact` contract and persist it in Dispatch
issue state as the stable handoff between `implementing` and `validating`.

## Scope

- define the candidate-artifact fields needed for source snapshots, patch
  bundles, runtime bundles, or container images
- persist candidate-artifact metadata and references in issue state
- make the validating stage resolve the candidate by id rather than by ambient
  repo state
- surface the selected candidate artifact in review state and run summaries

## Acceptance

- Dispatch issue state stores a stable `candidate_artifact_id` for each
  implementation output selected for validation
- the contract records enough metadata for validation to materialize the
  candidate reproducibly
- review surfaces can tell a human exactly which candidate artifact was proven

