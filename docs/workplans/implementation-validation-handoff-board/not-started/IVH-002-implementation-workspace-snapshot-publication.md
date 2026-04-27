# IVH-002 Implementation Workspace Snapshot Publication

## Goal

Make the implementation stage publish an exact workspace-snapshot candidate
artifact plus focused preflight receipts.

## Scope

- capture the post-edit workspace tree from the implementation sandbox
- attach changed-file metadata and focused test receipts
- store the snapshot as the first candidate-artifact form supported by Dispatch
- ensure validation can consume the snapshot without depending on the
  implementation sandbox remaining alive

## Acceptance

- every successful implementation stage can emit a workspace-snapshot candidate
  artifact
- the candidate artifact is decoupled from the implementation sandbox lifetime
- focused implementation checks are attached as receipts, not confused with the
  signoff proof

