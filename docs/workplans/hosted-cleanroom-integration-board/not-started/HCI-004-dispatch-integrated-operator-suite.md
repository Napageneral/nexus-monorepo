# HCI-004 Dispatch Integrated Operator Suite

## Goal

Exercise the broader operator story on a disposable hosted server with Dispatch
plus its supporting apps and adapters.

This file is now the umbrella for the executable `HCI-004*` tickets below. Do
not work this file directly as one coarse lane.

## Dependency Shape

This lane should sit behind:

- `HCI-002` for fresh hosted multi-app install and launch proof
- `HCI-003` for adapter install, connection, and ingest proof

It should likely reuse:

- `packages/apps/dispatch/scripts/dispatch-cleanroom-lane.sh`
- the hosted fresh-server wrappers in `frontdoor/scripts/`
- the operator-console/browser capture hooks when the review-artifact lane
  begins

## Decomposed Ticket Set

1. `HCI-004A Hosted Dispatch Stack Wrapper`
2. `HCI-004B Hosted Dispatch Operator Bootstrap And Policy Compile`
3. `HCI-004C Hosted Jira Intake Fixture And Single-Lineage Proof`
4. `HCI-004D Hosted Repo Binding And Spike Hydration`
5. `HCI-004E Hosted Manager/Worker Sandbox Execution And Evidence Bundle`
6. `HCI-004F Hosted Delivery Receipts And Idempotent Closeout`
7. `HCI-004G Browser/Operator Proof Overlay`

## Acceptance

1. one hosted cleanroom lane can install Dispatch plus its dependent app and adapter set
2. the system can ingest or read real data into Dispatch-owned workflows
3. operator-facing flows behave coherently end to end
