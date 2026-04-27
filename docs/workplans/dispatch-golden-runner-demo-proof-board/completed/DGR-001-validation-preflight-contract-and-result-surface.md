# DGR-001 Validation Preflight Contract And Result Surface

## Goal

Define deterministic validation preflight before the recorded golden journey
begins.

## Scope

- preflight contract for adapters, connections, credentials, and resource
  bindings
- explicit preflight result surface for validation state and review summaries
- clear failure classes such as adapter unavailable, connection unhealthy, or
  resource binding missing

## Acceptance

- preflight can fail before the primary recording begins
- Jira adapter availability is expressible as preflight truth
- validation state records preflight outcomes distinctly from proof outcomes
