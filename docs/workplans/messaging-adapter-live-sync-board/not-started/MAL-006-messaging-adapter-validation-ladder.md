# MAL-006 Messaging Adapter Validation Ladder

## Goal

Create the shared proof ladder for messaging adapters so Slack and Discord can
be validated consistently across cleanroom, hosted, and live dogfood lanes.

## Current Gap

Slack and Discord have useful package-local tests and validation notes, but the
OpenClaw-informed target state needs a repeatable ladder for durable sync,
offline catch-up, rich live events, native interactions, rate-limit behavior,
hosted install/restart, and agent-use proof.

## Scope

- define provider-neutral proof stages
- define Slack-specific and Discord-specific live event scripts
- include human-shaped validation scripts before execution
- cover cleanroom package tests, hosted install/restart, and live dogfood
- capture artifact and evidence expectations

## Acceptance

1. validation ladder covers install/connect, backfill, monitor, catch-up,
   revisions, interactions, rate limits, hosted restart, and agent-use
2. Slack and Discord each have provider-specific validation scripts
3. cleanroom proof is the default lane
4. live dogfood is documented as secondary confirmation
5. validation docs link back to the canonical spec and this board
