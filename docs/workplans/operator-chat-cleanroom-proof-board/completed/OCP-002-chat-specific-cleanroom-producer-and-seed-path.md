# OCP-002 Chat-Specific Cleanroom Producer And Seed Path

## Goal

Create one dedicated cleanroom producer that boots the operator console with
deterministic operator-chat-ready state.

## Why

The existing console cleanroom harness does not create the lane and transcript
state that the new global `Chat` surface needs for truthful end-to-end proof.

## Scope

- add operator-chat-specific cleanroom launcher and capture entrypoints
- add a post-bootstrap seed path that uses Nex runtime primitives to create:
  - a manager lane with visible transcript history
  - at least one visible worker lane linked to the manager lane
  - one pending approval attached to a visible lane
  - linked public conversation context and a selected delivery target
  - a deterministic replay or reconnect scenario
- add the smallest possible cleanroom-only helper if approval or replay setup
  cannot be produced deterministically through existing runtime paths alone

## Acceptance

- a fresh cleanroom run can materialize the required chat state without manual
  operator setup
- the producer uses runtime seams as the primary mechanism rather than raw
  database mutation
- the resulting seeded state is stable enough for browser proof assertions

## Current Progress

- the canonical dedicated cleanroom runner now exists at
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-host.sh`
- the capture wrapper now exists at
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
- the deterministic seed and transcript helper now exists at
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-proof.ts`
- the seed path now executes successfully through the cleanroom lane and
  produces manager-lane, worker-lane, approval, delivery-target, and
  replay-gap-ready state
- the Docker-backed harness now also executes successfully at
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-docker.sh`
  against the same seeded operator-chat proof path
