# Acquisition Adapters Hosted Cleanroom Signoff

This runbook is the shared signoff lane for the aligned acquisition adapter set:

- `google-ads`
- `meta-ads`

It is the board-level closeout path for
`/Users/tyler/nexus/home/projects/nexus/docs/workplans/acquisition-adapter-alignment-board/`.

## Canonical Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md`
- `/Users/tyler/nexus/home/projects/nexus/frontdoor/docs/validation/FRONTDOOR_HOSTED_PACKAGE_LIVE_TESTING.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/TESTING.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/docs/validation/GOOGLE_ADS_ADAPTER_VALIDATION.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/TESTING.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/docs/validation/META_ADS_ADAPTER_VALIDATION.md`

## Current Blocker

Do not treat this runbook as executable on the compliant hosted path until
`AAA-004` is closed:

- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/acquisition-adapter-alignment-board/in-progress/AAA-004-hosted-runtime-adapter-contract-parity.md`

The active package and runtime source canon already uses
`adapter.connections.list`. If the hosted compliant runtime still rejects
adapter reflection with `adapter.accounts.list`, the hosted image must be
rebuilt or repointed before signoff can begin.

## Signoff Prerequisites

1. `google-ads` and `meta-ads` both pass local package validation.
2. The hosted compliant runtime validates adapter reflection against the
   current `adapter.connections.list` canon.
3. Frontdoor package publish succeeds for both adapters on the target platform.
4. One fresh hosted server can be provisioned through Frontdoor for the shared
   proof.
5. Real provider credentials exist for both packages.

## Shared Hosted Signoff Sequence

1. Build and validate both packages locally.
2. Publish both package releases through the canonical Frontdoor registry path.
3. Provision one fresh hosted target through Frontdoor.
4. Install both adapters onto that same hosted target through Frontdoor-managed
   package state.
5. Mint a runtime access token and prove runtime health from the hosted target.
6. Prove package reflection on hosted:
   - `adapter.info`
   - `adapter.connections.list`
   - the declared `google-ads.*` methods
   - the declared `meta-ads.*` methods
7. Prove representative provider-native reads on hosted:
   - `google-ads.customers.accessible.list`
   - `google-ads.customers.get`
   - `google-ads.reporting.campaign_daily.list`
   - `meta-ads.accounts.get`
   - `meta-ads.campaigns.list`
   - `meta-ads.insights.campaign_daily.list`
8. Prove projection behavior for both packages through the same runtime:
   - connection health
   - backfill behavior
   - monitor or resume behavior where applicable
9. Capture one dated proof bundle that links:
   - Frontdoor hosted lifecycle proof
   - package-contract proof
   - provider-native read proof
   - projection/backfill/monitor proof

## Completion Standard

This signoff lane is complete when one reviewable proof bundle shows:

1. both adapters installed through the canonical hosted path
2. both adapters reflected the current package-owned surface correctly
3. both adapters executed representative provider-native reads successfully
4. both adapters preserved the same runtime `connection_id` model through
   hosted execution
5. the hosted proof bundle is durable enough to close
   `AAA-007`
