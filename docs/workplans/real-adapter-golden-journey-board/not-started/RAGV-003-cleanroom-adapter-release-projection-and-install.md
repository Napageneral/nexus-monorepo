# RAGV-003 Cleanroom Adapter Release Projection And Install

## Goal

Make adapter installation inside validation cleanrooms explicit, reproducible,
and independent of host source-tree guessing.

## Scope

- define how a validation profile declares required adapters
- project installable adapter releases or package artifacts into the cleanroom
- install and register those adapters inside the cleanroom runtime
- remove cleanroom proof dependence on source-root probing for Slack, Jira, and
  Git or Bitbucket lanes

## Acceptance

- a validation cleanroom can install the adapters required by the selected
  profile without probing arbitrary host paths
- the latest adapter release or explicit staged release is visible in proof
  receipts
- the current Slack-adapter-source-not-found failure class is closed
