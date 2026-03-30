# HCI-004D Hosted Repo Binding And Spike Hydration

## Goal

From an accepted Dispatch issue, prove repo binding resolution and Spike
hydration on the hosted runtime.

## Scope

- Git connection use from hosted cleanroom
- repo binding readback
- Spike mirror/worktree/index hydration outputs
- issue state linkage between Dispatch and Spike

## Non-Goals

- implementation work
- evidence tier and validation bundle
- PR or Jira closeout

## Acceptance

1. hosted runtime resolves the intended repo for the Dispatch issue
2. Spike hydration outputs are present and inspectable
3. proof capture ties the hydrated repo state back to the original issue lineage
