# DGR-002 Jira Cleanroom Adapter Registration And Preflight Cutover

## Goal

Fix Jira cleanroom boot so the validation lane no longer crashes with `Adapter
not registered: jira`.

## Scope

- deterministic Jira adapter registration check in cleanroom preflight
- canonical adapter registration or activation path before Jira proof begins
- explicit preflight failure when Jira still cannot register

## Acceptance

- Jira proof no longer starts if the adapter is unavailable
- a passing Jira preflight proves adapter registration, connection health, and
  project binding readiness
- the old runtime crash path is removed from the primary golden lane
