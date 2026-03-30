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
