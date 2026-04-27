# CPB-003 Recent Completed Lane Cleanroom Audit And Prioritization

## Goal

Audit recent completed boards and archived workplans, then identify the next
highest-value behaviors that still need durable cleanroom proof.

## Acceptance

1. recent completed lanes are grouped into concrete cleanroom-proof candidates
2. each candidate names the spec or validation doc that should own the proof
3. the next proof lanes are split into atomic board tickets

## Validation

- subagent audit across completed boards, archived workplans, and existing proof
  surfaces
- explicit prioritization written back into this board

## Current Prioritization

The current priority order is:

1. connection-account identity cleanroom certification
   - why first: it is bounded, already implemented, and fits the current
     sandbox-managed Nex cleanroom direction without extra hosted substrate
     work
   - ticket: `CPB-004`
2. Dispatch integrated operator proof
   - why second: it remains a product-level validation lane, but should build
     on sandbox-managed proof rather than the older hosted fresh-server model
   - ticket: `CPB-007`
3. recorded cleanroom demo artifacts
   - why later: it should attach to stable sandbox-managed proof paths rather
     than racing ahead of them
   - ticket: `CPB-008`

## Existing Anchor Proof

Already-backed cleanroom anchors for this program:

1. cleanroom-first doctrine and repo guidance
2. owner bootstrap plus first-agent finalization proof
3. fresh hosted package smoke on a Frontdoor-created server
4. fresh hosted multi-app harness with shared proof-capture path

## Direction Update

The previous hosted fresh-server backfill candidates were removed from this
board because they no longer match the preferred cleanroom direction.

For new work on this board, prefer sandbox-managed Nex primitives and reusable
runtime-managed cleanrooms over the older hosted fresh-server approach.

## Ownership Notes

- cross-repo hosted proof lanes continue on
  `docs/workplans/hosted-cleanroom-integration-board/`
- runtime-specific recent-front cleanroom proof backfill should converge into
  `nex/docs/workplans/cleanroom-proof-capture-backfill-board/`
