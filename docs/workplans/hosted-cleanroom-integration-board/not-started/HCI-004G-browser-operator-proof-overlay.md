# HCI-004G Browser Proof Overlay

## Goal

Add a reusable browser-recording proof producer on top of hosted cleanroom
runtime proofs without blocking core runtime correctness.

This lane is about the overlay model itself, not only the operator console.
Operator-console Playwright coverage is the first concrete implementation.

## Scope

- Playwright or comparable browser automation against hosted Frontdoor/runtime
  URLs
- screenshots, traces, video, and metadata capture as optional review artifacts
- integration with the existing cleanroom proof bundle model
- producer namespacing so browser-specific logs/results do not overwrite the
  generic bundle root files
- operator-console as the first reference producer, without making it the owner
  of the concept

## Non-Goals

- runtime correctness itself
- delivery logic
- intake or hydration logic
- making browser recording a mandatory prerequisite for all cleanroom proofs

## Acceptance

1. browser artifacts can be attached to the same hosted cleanroom proof bundle
   as an optional producer
2. the overlay is optional and non-blocking for core runtime proof
3. the shared cleanroom bundle model still owns root metadata, logs, and result
   state
4. browser-producer outputs are easy to inspect after a hosted run and can be
   reused by future app or adapter proof lanes
