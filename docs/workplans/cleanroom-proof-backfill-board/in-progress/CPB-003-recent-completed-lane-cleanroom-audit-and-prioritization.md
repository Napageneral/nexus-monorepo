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

1. hosted app fresh-server cleanroom proof
   - why first: it builds directly on the new fresh-server hosted smoke seam
     and does not require the same credential complexity as adapters
   - ticket: `CPB-005`
2. hosted adapter connection and ingest proof
   - why second: it carries more credential and environment complexity, but it
     is the next major missing end-to-end proof lane after app install/runtime
   - ticket: `CPB-006`
3. Dispatch integrated operator proof
   - why third: it depends on the app and adapter hosted lanes being credible
     first
   - ticket: `CPB-007`
4. connection-account identity cleanroom certification
   - why parallel but narrower: the feature is done, but its cleanroom proof
     still needs a dedicated owning path
   - ticket: `CPB-004`
5. recorded cleanroom demo artifacts
   - why later: it should attach to stable cleanroom proof paths rather than
     racing ahead of them
   - ticket: `CPB-008`

## Existing Anchor Proof

Already-backed cleanroom anchors for this program:

1. cleanroom-first doctrine and repo guidance
2. owner bootstrap plus first-agent finalization proof
3. fresh hosted package smoke on a Frontdoor-created server
4. fresh hosted multi-app harness with shared proof-capture path

## Ownership Notes

- cross-repo hosted proof lanes continue on
  `docs/workplans/hosted-cleanroom-integration-board/`
- runtime-specific recent-front cleanroom proof backfill should converge into
  `nex/docs/workplans/cleanroom-proof-capture-backfill-board/`
