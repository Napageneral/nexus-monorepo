# DGR-007 Review Gate Manifest Consumption And Tier Evaluation

## Goal

Make review gate consume the structured manifest rather than infer truth
primarily from command exit codes.

## Scope

- review-gate evaluation of required phases and checkpoints
- tier computation from manifest truth and expected artifacts
- warning surfaces for optional checkpoint failures

## Acceptance

- `minimum_reviewable`, `standard`, `ui_proof`, and `demo_proof` are computed
  from manifest truth
- optional checkpoint failures do not automatically block the required tier
- required phase failures block the gate clearly
