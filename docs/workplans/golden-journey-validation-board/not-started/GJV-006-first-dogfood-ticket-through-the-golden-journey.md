# GJV-006 First Dogfood Ticket Through The Golden Journey

## Goal

Prove the new model by using it on a real subsequent work item rather than only
on synthetic harness development.

## Scope

- choose one real new ticket after the substrate is ready
- execute it through the golden-journey validation path
- attach the primary demo artifact and proof bundle to the owning run
- close the ticket through the same review flow the human will use going
  forward

Current leading candidate:

- use the now-working operator-console runtime-backed browser proof as the
  first real dogfood ticket
- keep the whole-session recording path and proof bundle as the review artifact
- expand beyond the already-proven create-agent flow with the next live console
  mutation scenarios:
  - create a schedule and verify it appears and runs
  - exercise one deterministic adapter/integration flow
  - keep the proof runtime-backed rather than shell-only

## Acceptance

- one real ticket is completed, validated, and reviewed through the new model
- the candidate ticket uses a lane that already has representative proof
  infrastructure rather than inventing new validation substrate work
- the board/spec can then be dogfooded by the next wave of work
