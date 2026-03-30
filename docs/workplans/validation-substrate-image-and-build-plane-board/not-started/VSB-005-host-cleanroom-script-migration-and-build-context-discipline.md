---
summary: "Move host-level cleanroom scripts onto the shared image contract and tighten Docker context or ignore discipline where large roots are still used."
title: "VSB-005 Host Cleanroom Script Migration And Build-Context Discipline"
---

# VSB-005 Host Cleanroom Script Migration And Build-Context Discipline

## Goal

Make host-level cleanroom scripts consume the shared image model and stop
paying avoidable context or image-build cost.

## Scope

- Slack synthetic cleanroom and similar host cleanroom wrappers
- root-context Docker build review
- explicit `.dockerignore` or equivalent context discipline where large roots
  remain necessary
- removal of repeated inline host `docker build` residue where the image can be
  ensured instead

## Acceptance

- representative host cleanroom scripts use the shared image ensure path
- repo-root contexts remain only where they are necessary and explicitly
  disciplined
- irrelevant large trees and transient outputs are excluded from proof-image
  build contexts
- one host cleanroom proof reruns successfully from the new path

## Validation

- context inspection by review plus focused script tests
- one Slack or equivalent host cleanroom proof rerun
- `git diff --check`
