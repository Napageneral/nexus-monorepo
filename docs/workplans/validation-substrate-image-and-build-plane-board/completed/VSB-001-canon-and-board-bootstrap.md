---
summary: "Write the canonical validation substrate image spec and stand up the execution board."
title: "VSB-001 Canon And Board Bootstrap"
---

# VSB-001 Canon And Board Bootstrap

## Goal

Write the canonical image and build-plane model and create the execution board
that will burn it down.

## Scope

- one canonical spec for shared validation substrate images and host build
  serialization
- alignment updates to the active validation substrate specs
- one execution board with atomic implementation tickets

## Acceptance

1. the target-state image and build-plane model is written as canon
2. the active validation substrate specs reference the same shared image model
3. one execution board exists with truthful atomic tickets for implementation
   and validation

## Validation

- doc link audit by inspection
- `git diff --check`

## Completion Notes

Completed by adding:

- [Shared Validation Substrate Images And Host Build Serialization](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/environment/shared-validation-substrate-images-and-host-build-serialization.md)
- the [Validation Substrate Image And Build-Plane Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/validation-substrate-image-and-build-plane-board/README.md)

Result:

- the target state now distinguishes substrate image from fresh proof payload
- the shared host Docker build plane is now explicit canon rather than implicit
  operator lore
- implementation can proceed as bounded tickets instead of ad hoc fixes
