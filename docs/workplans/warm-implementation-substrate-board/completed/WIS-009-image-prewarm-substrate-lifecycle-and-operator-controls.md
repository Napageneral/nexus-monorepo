# WIS-009 Image Prewarm, Substrate Lifecycle, And Operator Controls

## Goal

Keep image prewarm and warm substrate lifecycle separate, visible, and
operable.

## Scope

- define operator controls for warming common base images
- define inspection and lifecycle controls for prepared substrates
- define TTL, garbage-collection, or explicit cleanup policy for prepared
  substrates
- preserve the separation between image-level and substrate-level readiness

## Acceptance

- operators can inspect and manage both image readiness and prepared-substrate
  readiness without conflating them
- image prewarm is not treated as repo-level substrate prep
- stale or failed prepared substrates can be invalidated or cleaned up safely
