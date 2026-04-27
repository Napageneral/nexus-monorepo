# Acquisition Adapter Alignment Board

This board tracks the package-alignment work for the shared acquisition
adapters after the newer adapter canon settled around package-owned method
catalogs, explicit reflection metadata, and full-surface provider-backed
packages.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/validation/acquisition-adapters-hosted-cleanroom-signoff.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-business-profile-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/meta-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-package-capability-model.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-adapter-sdk-and-authoring-model.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-full-surface-compliance-standard.md`
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md`

Scope:

- make `google-ads` the canonical Google Ads package
- retire overlapping Google Ads scope in `google`
- bring `google-ads` and `meta-ads` up to the newer minimum package shape
- align package-local testing and validation to the hosted lifecycle gate
- close hosted runtime/package contract skew that blocks install proof
- push both packages toward the full provider-native method model

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

- `AAA-001`
- `AAA-002`
- `AAA-003`
- `AAA-005`
- `AAA-006`

In Progress:

- `AAA-004`

Not Started:

- `AAA-007`

Execution note:

- `AAA-007` now has an active shared signoff document, but execution remains
  blocked on `AAA-004` because the hosted compliant runtime image still needs
  contract-parity proof.

## Execution Order

The default sequence for this board is:

1. lock the canonical package boundary so Google Ads no longer overlaps with
   the legacy `google` package
2. land the minimum package-shape parity in `google-ads` and `meta-ads`
3. align testing and validation ladders to the hosted lifecycle gate
4. close the hosted runtime/package contract skew so hosted install proof is
   trustworthy again
5. expand `google-ads` into a truthful provider-native public method surface
6. expand `meta-ads` into a truthful provider-native public method surface
7. run final hosted cleanroom and package signoff across both packages
