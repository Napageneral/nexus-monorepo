# AAA-006 Meta Ads Full-Surface Provider Method Catalog

## Goal

Push `meta-ads` from a projection-only package toward the canonical
provider-native full-surface model.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/meta-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-full-surface-compliance-standard.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/raw-and-curated-adapter-generation-model.md`

## Current Gap

- `meta-ads` currently exposes only adapter runtime operations plus the
  ingest contract
- the package does not yet expose a public `meta-ads.*` provider-native method
  surface
- the package is therefore not aligned with the newer full-surface provider
  canon

## Completion Notes

Completed with the first truthful read slice:

- `meta-ads.accounts.get`
- `meta-ads.campaigns.list`
- `meta-ads.insights.campaign_daily.list`

The method declarations, handlers, package OpenAPI, `adapter.info` reflection,
tests, and package-local docs were updated together. The projection contract
remains additive and unchanged.

Validation run:

- `go test ./...`
- `nexus package validate .`

Hosted cleanroom proof remains downstream of `AAA-004`, because the live
Frontdoor-hosted compliant runtime still needs contract parity.

## Acceptance

1. the package has an explicit first public `meta-ads.*` method slice
2. that method slice is declared in package-owned OpenAPI and reflected
   truthfully through `adapter.info`
3. representative read-only provider-native methods are callable in cleanroom
   proof
4. the ingest/projection contract remains additive rather than replacing the
   provider-native method surface
