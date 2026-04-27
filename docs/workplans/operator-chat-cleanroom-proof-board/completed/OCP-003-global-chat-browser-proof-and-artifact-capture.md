# OCP-003 Global Chat Browser Proof And Artifact Capture

## Goal

Add a dedicated browser proof scenario for the global `Chat` page and wire it
into the cleanroom capture path.

## Why

The final review artifact must prove the actual `/chat` experience, not only
runtime helpers or generic console coverage.

## Scope

- add a dedicated operator-console Playwright scenario for the global `Chat`
  route
- assert manager-lane send and reply
- assert worker-lane visibility, selection, and direct chat
- assert approval resolution from the chat surface
- assert reconnect or replay recovery
- assert linked public conversation context and delivery-target visibility
- integrate the proof into the cleanroom capture runner so one review-worthy
  artifact bundle is emitted

## Acceptance

- the cleanroom capture flow runs the dedicated `/chat` proof scenario
- the resulting browser proof exercises the required operator journey end to
  end
- the artifact bundle is sufficient for review without reconstructing the story
  from raw logs

## Current Progress

- the dedicated `/chat` Playwright scenario now exists at
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/e2e/07-operator-chat.spec.ts`
- the chat microfrontend now exposes the missing proof surfaces:
  approval response actions, linked public conversation records, and stable
  selectors for lanes, transcript, approvals, delivery, and replay assertions
- the dedicated `/chat` proof now also covers lane-action creation and
  invocation through the transplanted header controls
- the proof is now wired directly to
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-proof.ts`
- the cleanroom capture lane is now green through
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`,
  which reuses the shared cleanroom recording substrate and executes the proof
  inside the Linux cleanroom image
- the host-managed harness at
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-host.sh`
  remains available for focused local debugging
- the Docker-backed cleanroom harness is now also green through
  `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-docker.sh`
- the latest canonical review bundle now exists at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T144405Z`
- that canonical bundle now reuses the shared cleanroom recording substrate and
  retains the primary whole-session review artifact at
  `videos/full-session.webm`
- that latest bundle also covers worker-lane reload recovery after explicit
  worker selection
