# OCP-001 Operator Chat Proof Contract And Human Script

## Goal

Freeze the operator-chat cleanroom proof into one explicit, human-shaped
validation contract.

## Why

The workflow requires the exact operator journey to be written down before the
cleanroom run executes.

## Scope

- define the primary golden-journey proof script for the global `Chat` page
- make the happy-path and recovery-path steps explicit
- define what artifact bundle and review evidence the proof must emit
- pin the producer, runner, and browser entrypoints that the remaining tickets
  must implement

## Acceptance

- the operator-chat validation ladder includes an explicit human-shaped script
- the proof contract names the exact producer and browser proof entrypoints
- reviewers can tell what will be said, clicked, asserted, and captured before
  the first cleanroom run starts

## Completion Notes

- the operator-chat validation ladder now carries the explicit operator script
  and review-evidence contract
- the target proof entrypoints are pinned to the operator-chat cleanroom
  capture script, docker launcher, proof producer, and `/chat` Playwright
  scenario
