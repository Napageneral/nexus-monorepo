# WIB-006 Workplan

## Objective

Turn the website-input install proof into a repeatable operator lane with
retained artifacts.

## Execution Steps

1. Define the canonical proof URL matrix for custom code, GTM, and Wix.
2. Define the required retained artifacts for each proof run.
3. Define the baseline-only path and the bridge-capable path.
4. Define the operator pass and fail rules.
5. Document the proof output format so later validation can be regression tested.
6. Generate one retained artifact from a package-level proof fixture.

## Deliverables

- operator proof checklist
- proof artifact list
- failure-state checklist
- install-mode coverage notes
- generated proof artifact under `app/docs/validation/artifacts/`

## Exit Condition

This workplan is complete when an operator can run the proof without guessing
which events, identifiers, or artifacts should exist.
