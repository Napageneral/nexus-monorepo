# Acquisition Adapter Package Alignment

**Status:** CANONICAL
**Last Updated:** 2026-04-02
**Related:** [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md), [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [Google Ads Adapter](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md), [Google Business Profile Adapter](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-business-profile-adapter.md), [Meta Ads Adapter](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/meta-ads-adapter.md), [Unified Package Capability Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-package-capability-model.md), [Unified Adapter SDK and Authoring Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-adapter-sdk-and-authoring-model.md), [Adapter Full-Surface Compliance Standard](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-full-surface-compliance-standard.md)

---

## Purpose

This document defines the canonical package-alignment target state for the
shared acquisition adapters that attribution products depend on first:

- `google-ads`
- `google-business-profile`
- `meta-ads`

The purpose is to remove package-boundary ambiguity, normalize package-shape
and validation posture, and align the packages to the newer Nex adapter canon.

This document is intentionally about package shape and package ownership.

It is not the place for:

- migration sequencing
- temporary compatibility shims
- hosted-runtime bug triage
- per-ticket implementation planning

Those belong in the active work board.

## Customer Experience

The intended operator and package-author experience is:

1. each acquisition provider surface appears once as a shared canonical package
2. package capability truth lives in the package declaration material, not in
   ad hoc runtime reflection
3. `adapter.info` reports derived runtime reflection that matches the package
   declaration exactly
4. package docs, tests, release flow, hosted install, and cleanroom proof all
   follow the same shape as the newer canonical adapter family
5. the same package owns both:
   - the provider-native method surface
   - the Nex projection contract for ingest, backfill, monitor, and
     normalization

The customer should not experience:

- overlapping package ownership for the same provider surface
- one package family with explicit method-catalog truth and another depending
  on implicit fallback behavior
- projection-only packages being treated as the long-term steady state when the
  canonical model is full provider-native surface plus projection in one package

## Canonical Package Boundaries

The canonical acquisition package boundaries are:

- `google-ads` owns the Google Ads provider surface for attribution products
- `google-business-profile` owns the Google Business Profile provider surface
- `meta-ads` owns the Meta Ads provider surface

The target state does not include overlapping Google Ads ownership inside the
legacy `google` package.

Rules:

1. `google-ads` is the canonical shared Google Ads package
2. `google-business-profile` is the canonical shared Google Business Profile
   package
3. `meta-ads` is the canonical shared Meta Ads package
4. the legacy broad `google` package is not canonical for Google Ads in the
   active attribution package set
5. no second package should expose overlapping Google Ads capability as an
   active target-state surface

## Canonical Package Shape

These packages follow the same minimum package-shape rules as the newer
canonical adapters such as Jira, Confluence, GitHub, and Bitbucket.

Each package must carry:

- `adapter.nexus.json`
- an explicit `methodCatalog` declaration
- `api/openapi.yaml` as package-owned capability declaration material
- a package-local `SKILL.md`
- package-local spec, workplan, and validation docs
- a repeatable release-packaging path
- package-contract checks in local validation

Rules:

1. package capability truth is package-owned declaration material
2. adapter runtime reflection is derived state
3. `adapter.info` must report a truthful `methodCatalog`
4. `adapter.info` should report the package projection contract through
   `projection`
5. package tests should fail loudly when `adapter.info` drifts from the
   declared package surface

## Canonical Runtime Identity And Reflection

These packages follow the current Nex adapter contract.

Rules:

1. `connection_id` is the sole operational runtime identity surface
2. provider ids such as `customer_id`, `ad_account_id`, `campaign_id`,
   `ad_group_id`, `ad_id`, or GBP location ids remain provider metadata rather
   than runtime identity
3. the runtime validates `adapter.info` against the canonical package
   declaration at install and activation time
4. `adapter.connections.list` is the canonical connection-listing operation
5. legacy `adapter.accounts.list` semantics are not part of target-state canon

## Canonical Provider Surface Model

These packages are provider-backed adapters, so they follow the full-surface
default.

The target state is:

1. one canonical package per provider surface
2. full provider-native public method catalog where a trustworthy upstream
   contract exists
3. additive Nex projection behavior in the same package
4. truthful provider-native namespacing for outward methods

That means:

- `google-ads.*` methods belong in `google-ads`
- `meta-ads.*` methods belong in `meta-ads`
- projection logic for row-shaped ingest remains in the same package

Projection is additive.

It must not replace or hide the provider-native public method catalog.

## Canonical Validation Posture

These packages follow the shared package-author experience and the hosted
adapter validation ladder.

Each package must prove:

1. manifest and package-contract validation
2. local build and focused tests
3. shared hosted lifecycle proof through Frontdoor-managed install
4. connection setup and health
5. representative provider-native read methods in cleanroom validation
6. ingest, backfill, and monitor behavior
7. projection fidelity and provider-row parity
8. restart-safe hosted/runtime rehydration

The shared hosted lifecycle gate is not optional package-local prose.
It is part of the canonical validation ladder for these packages.

## Package-Local Documentation Rules

The active package-local docs for `google-ads` and `meta-ads` must match the
same shape and quality bar as the newer canonical adapter family.

Rules:

1. package-local specs describe the intended package behavior truthfully
2. active workplans describe only the current gap-closure work
3. validation docs explicitly name the shared hosted lifecycle gate before
   package-specific proof
4. testing guides include package-contract checks, not only provider-behavior
   checks
5. archived pre-cutover or legacy-contract material remains archived and is
   not treated as active target-state truth

## Done Definition

The acquisition adapter package-alignment slice is complete when:

1. `google-ads` is the sole canonical Google Ads package in the active
   attribution adapter set
2. overlapping Google Ads ownership in `google` is retired from active canon
3. `google-ads` and `meta-ads` both declare explicit package-owned
   `methodCatalog` truth
4. `google-ads` and `meta-ads` both publish truthful derived `methodCatalog`
   and `projection` metadata through `adapter.info`
5. both packages meet the newer package-shape and validation hygiene bar
6. both packages are on a clear path from projection-only surfaces toward the
   full provider-native method model
7. hosted install, cleanroom proof, and package-local docs all tell one
   coherent story
