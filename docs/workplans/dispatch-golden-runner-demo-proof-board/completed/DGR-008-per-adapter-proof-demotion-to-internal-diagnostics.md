# DGR-008 Per-Adapter Proof Demotion To Internal Diagnostics

## Goal

Keep existing per-adapter proofs useful without letting them remain the primary
top-level contract.

## Scope

- internal module or helper ownership for Slack, Jira, and forge proof bodies
- diagnostic entrypoints for local debugging
- removal of per-adapter top-level golden-lane coupling

## Acceptance

- per-adapter proofs remain available for diagnostics
- the orchestrated runner becomes the canonical top-level validation lane
- Dispatch no longer needs to surface three separate user-facing proof
  commands for the same golden journey
