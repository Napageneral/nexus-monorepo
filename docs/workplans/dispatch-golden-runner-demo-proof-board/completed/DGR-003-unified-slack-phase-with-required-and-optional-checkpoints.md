# DGR-003 Unified Slack Phase With Required And Optional Checkpoints

## Goal

Keep Slack as one top-level proof phase while making its internal checkpoints
explicit.

## Scope

- one Slack phase result driven by one top-level Slack test for the golden
  journey
- internal checkpoints such as ingress, ack-first reply, follow-up, media, and
  context shift
- validation-profile control over which checkpoints are required

## Acceptance

- Slack is no longer represented as several top-level proof commands
- a non-core Slack checkpoint can fail without automatically invalidating the
  entire golden journey when the profile does not require it
- required Slack checkpoints are explicit in the manifest
