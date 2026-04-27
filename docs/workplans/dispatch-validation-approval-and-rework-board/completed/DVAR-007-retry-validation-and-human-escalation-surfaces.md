# DVAR-007 Retry Validation And Human Escalation Surfaces

## Goal

Support non-code outcomes after validation without forcing a rework loop.

## Scope

- add retry-validation flows for interrupted or inconclusive attempts
- add human-escalation state and rationale capture
- ensure both paths preserve validation history cleanly

## Acceptance

- interrupted or environmentally inconclusive attempts can be retried without a
  new implementation pass
- manager can escalate to a human with explicit rationale and artifact links
- retry and escalation are first-class outcomes in issue state and run state
