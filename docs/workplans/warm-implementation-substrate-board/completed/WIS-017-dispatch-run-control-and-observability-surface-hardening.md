# WIS-017 Dispatch Run-Control And Observability Surface Hardening

## Goal

Make Dispatch run inspection and control surfaces stable and truthful during
active runs.

## Scope

- fix `dispatch.runs.get` so active runs no longer intermittently fail with
  HTTP `500` wrapping `400 Bad Request`
- harden adjacent control surfaces that have shown the same failure family,
  including `dispatch.runs.cancel` and `dispatch.runs.requeue`
- preserve actionable validation and run-state diagnostics through the
  operator-facing APIs
- add focused coverage around active-run fetch, cancel, and requeue flows

## Acceptance

- `dispatch.runs.get` is reliable during active runs and restart windows
- `dispatch.runs.cancel` and `dispatch.runs.requeue` no longer leak misleading
  `500` / `400 Bad Request` wrappers for normal operator actions
- operators can inspect active and recently interrupted runs without falling
  back to direct DB reads

## Current Evidence

- [runtime.log](/Users/tyler/nexus/state/logs/runtime.log) shows intermittent
  failures for `dispatch.runs.get`, `dispatch.runs.cancel`, and
  `dispatch.runs.requeue` with `INTERNAL_ERROR` plus inner `400 Bad Request`
- the current `SPEC-259` forensic loop depended on direct `work.db` and
  `issue-state.json` inspection because the normal operator surface was not
  trustworthy enough
