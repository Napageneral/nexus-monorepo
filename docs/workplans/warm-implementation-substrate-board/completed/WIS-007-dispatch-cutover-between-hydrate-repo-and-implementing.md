# WIS-007 Dispatch Cutover Between Hydrate Repo And Implementing

## Goal

Make Dispatch resolve a healthy warm substrate before it attaches the
implementation worker.

## Scope

- compute the prepared-substrate key after `hydrate_repo`
- resolve, prepare, or wait on the required substrate
- block worker attach until substrate preflight passes
- preserve the existing candidate-artifact and validation-cleanroom flow

## Acceptance

- Dispatch does not attach the implementation worker to a cold repo copy when a
  warm-start runtime config is selected
- substrate prep or failure is visible between `hydrate_repo` and
  `implementing`
- successful runs reach `implementing` with a preflighted warm substrate
