---
summary: "Close performance hardening with a recorded cleanroom proof and updated validation corpus."
title: "OPUX-007 - Cleanroom Performance Proof And Closeout"
---

# OPUX-007 - Cleanroom Performance Proof And Closeout

## Why

The performance pass is complete only when the cleanroom proof demonstrates the
human operator journey and the performance-sensitive paths.

## Required Outcomes

- cleanroom proof passes after all hardening changes
- proof bundle includes timing evidence and whole-session recording
- board and validation docs point at the final artifact

## Planned Changes

- extend the existing operator-chat cleanroom path with performance assertions
- run the captured cleanroom proof
- update board status and validation docs

## Exit Criteria

- performance, scroll, viewport, and manager-first sidebar tickets are completed
- latest cleanroom artifact is recorded and linked
- OPUX-006 remains open for a dedicated side-by-side upstream visual parity
  review

## Validation

- `bash /Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
- passed cleanroom bundle:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z`
- primary recording:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z/videos/full-session.webm`
- result:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z/result.json`
