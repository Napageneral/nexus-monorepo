# DGR-010 Live SPEC-259 Demo-Proof Rerun Through The Orchestrated Lane

## Goal

Prove the new golden-runner model on the same live Dispatch lane that already
proved warm-start and candidate handoff.

## Scope

- live rerun of `SPEC-259`
- preflight, orchestrated runner, canonical recording, manifest, and review
  gate all active on the same lineage
- final tier reaches `demo_proof`

## Acceptance

- `SPEC-259` reaches `reviewing` with `required_tier_ready = true`
- the same lineage proves implementation, validation, and the reviewable demo
  artifact
- the resulting handoff can link the ticket, forge surface, and proof video

## Current Blocker

- later reruns proved the manager-lane starvation bug was fixed and the issue
  could reach candidate publication
- the remaining live blocker is no longer the orchestrated proof lane itself
- the issue now stops because validation script approval is pending, and the
  remaining product gap is the approval, post-validation review, and rework
  loop

This ticket is effectively superseded by:

- [DVAR-009 Live SPEC-259 Approval Through Completion Dogfood](/Users/tyler/nexus/home/projects/nexus/docs/workplans/dispatch-validation-approval-and-rework-board/not-started/DVAR-009-live-spec-259-approval-through-completion-dogfood.md)
