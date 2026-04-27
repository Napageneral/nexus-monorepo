# OCH-009 Cleanroom Validation Contract And Proof Lane

## Goal

Define and prove the cleanroom validation lane for the operator chat hard cut.

## Why

This is a runtime-affecting, operator-facing surface.
The workflow requires a cleanroom-backed proof lane rather than relying on the
ambient local runtime as the primary signoff path.

## Scope

- define the canonical cleanroom validation contract for operator chat
- define the human-shaped validation script for the main chat journey
- prove manager-lane send and reply
- prove worker-lane inspection and direct chat
- prove approval round-trip
- prove replay recovery after reconnect or sequence gap
- prove linked public conversation context through at least one real delivery
  channel

## Acceptance

- the active validation lane is explicit and cleanroom-backed
- the primary proof script follows a truthful operator journey
- reviewers can verify manager, worker, approval, replay, and linked public
  conversation behavior from the resulting evidence

## Current Progress

- the cleanroom contract is now captured in
  `/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/operator-chat-cleanroom-validation-ladder.md`
- the dedicated implementation and execution work was burned down in
  `/Users/tyler/nexus/home/projects/nexus/docs/workplans/operator-chat-cleanroom-proof-board/README.md`
- the reusable cleanroom substrate already exists through:
  - `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-console-cleanroom-capture.sh`
  - `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-console-cleanroom-docker.sh`
  - `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/manager-worker-code-mode-cleanroom-docker.sh`
  - `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/slack-synthetic-nohuman-cleanroom-docker.sh`
- the canonical operator-chat proof now runs through:
  - `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
  - `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-host.sh`
  - `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-docker.sh`
  - `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-proof.ts`
  - `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/e2e/07-operator-chat.spec.ts`
- the latest canonical cleanroom artifact bundle now exists at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260407T195221Z`
- that canonical bundle now retains the primary whole-session cleanroom
  recording and shared recording manifest expected by the broader review
  standard
- the proved browser journey now includes the preserved lane-action control
  path in addition to manager chat, worker chat, approvals, replay recovery,
  and linked public conversation context

## Closeout

- this ticket is complete because the dedicated proof board produced one
  truthful cleanroom artifact bundle for the global `Chat` page
- the Docker-backed harness now also passes end to end, so the operator-chat
  proof lane is closed at both the host-managed and Docker-backed cleanroom
  layers
