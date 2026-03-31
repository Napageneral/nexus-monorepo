# GJV-003 Human-Shaped Validation Script Preview

## Goal

Force validating agents to surface the exact human-facing words and actions they
intend to use before the proof executes.

## Scope

- define the preview contract for validation scripts
- include exact prompts, chat messages, clicks, commands, and expected
  outcomes
- expose the preview in the planning and later Dispatch run surface

## Acceptance

- a validating agent cannot claim a user-facing proof without surfacing the
  actual script first
- reviewers can reject un-human or low-quality validation phrasing before the
  run starts

## Current State

Landed:

- fresh-boot run input now carries `validation_script_markdown`
- job and DAG run evidence project that field for later review
- Dispatch run review can show the run-scoped validation script when present
- Dispatch issue detail now shows a pre-execution validation-script preview
  generated from the planned validation commands and browser flows
- Dispatch issue detail now exposes explicit approve/reject controls for
  review-required scripts
- Dispatch validation execution now blocks UI-proof and demo-proof validation
  lanes until the previewed script is approved

Validated:

- `go test ./cmd/dispatch-engine/...`
- consumer-ui touched-file TypeScript sanity for:
  - `app/runs/page.tsx`
  - `app/issue/[id]/IssueDetail.tsx`
  - `lib/types.ts`

Closure Notes:

- pre-execution preview now lives on the Dispatch issue
- post-execution review still lives on the Dispatch run
- the next honest step is not more substrate work here; it is using the flow on
  a real downstream ticket in `GJV-006`
