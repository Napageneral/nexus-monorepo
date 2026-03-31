---
summary: "Introduce one content-addressed validation image identity model and one shared ensure path for proof lanes and hosted executors."
title: "VSB-002 Content-Addressed Image Identity And Ensure Contract"
---

# VSB-002 Content-Addressed Image Identity And Ensure Contract

## Goal

Replace ad hoc validation image naming with one content-addressed identity and
one shared image ensure contract.

## Scope

- deterministic image identity from substrate inputs
- shared image-ensure helper or runtime surface
- lane-facing contract that returns a ready image instead of embedding inline
  `docker build`
- proof-lane caller migration for at least one Nex lane

## Acceptance

- equivalent substrate inputs resolve to the same image identity
- changed substrate inputs resolve to a different image identity
- proof callers can ask for image availability without embedding their own
  build logic
- at least one real validation lane uses the shared ensure contract

## Validation

- focused unit tests for identity and ensure logic
- one proof lane rerun using the shared ensure path
- `git diff --check`

## Completion Notes

- landed `validation-substrate-images.ts` as the shared content-addressed image
  seam in `nex`
- content identity now derives from the Dockerfile plus declared fingerprint
  inputs instead of mutable hand-versioned tags
- the operator-console browser proof now requests a ready image through the
  shared ensure contract instead of embedding inline `docker build`
