# DVAR-005 Post-Validation Review Stage And Manager Decision Routing

## Goal

Make manager review the canonical decision point after validation completes.

## Scope

- add `post_validation_review` as a first-class stage
- let the manager choose `complete`, `retry_validation`,
  `return_to_implementation`, or `escalate_to_human`
- drive the next stage from manager decision rather than raw validation exits

## Acceptance

- every completed validation attempt flows into `post_validation_review`
- manager decision is persisted as structured issue/run state
- Dispatch routes to completion, retry, rework, or escalation from that
  decision
