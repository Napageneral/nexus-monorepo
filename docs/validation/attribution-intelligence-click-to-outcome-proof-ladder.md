# Attribution Intelligence Click-To-Outcome Proof Ladder

**Status:** VALIDATED
**Last Updated:** 2026-03-31
**Related:** [Attribution Intelligence Layer](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md), [Attribution Website Input Package And Install Contract](/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-website-input-package-and-install-contract.md), [AIL-007](/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/completed/AIL-007-end-to-end-click-to-outcome-proof-ladder.md)

## Purpose

This document is the durable validation corpus for the attribution intelligence
product family.

It proves the full business journey:

1. acquisition facts exist
2. website input is installed and collecting first-party events
3. backend outcome truth exists
4. the attribution app reconciles those inputs into an attributed outcome
5. the operator can inspect both aggregate and row-level evidence

## Expected Operator Outcomes Before Execution

The proof is written to expect these outcomes before it runs:

- one website installation is created successfully
- three website events are accepted under that installation
- replaying the same `page_view` event dedupes cleanly
- one paid acquisition fact is materialized
- one backend outcome is materialized
- the inspected outcome is attributed to `meta_paid`
- the inspected outcome match method is `bridge_match`
- pipeline counts end at `ad_facts=1`, `web_events=3`,
  `business_outcomes=1`, `outcome_attributions=1`

## Validation Ladder

### 1. Provider Truth

Real provider-credential proof remains package-scoped and is already validated
upstream:

- Meta Ads: [META_ADS_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/docs/validation/META_ADS_ADAPTER_VALIDATION.md)
- Google Ads: [GOOGLE_ADS_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/docs/validation/GOOGLE_ADS_ADAPTER_VALIDATION.md)
- TikTok Business: [TIKTOK_BUSINESS_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business/docs/validation/TIKTOK_BUSINESS_ADAPTER_VALIDATION.md)
- Shopify: [SHOPIFY_ADAPTER_VALIDATION.md](/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/docs/validation/SHOPIFY_ADAPTER_VALIDATION.md)

Those proofs establish adapter-side auth, backfill, live sync, and provider-row
parity with real MoonSleep upstreams where applicable.

### 2. Website Input Contract

The first-party website contract is proven separately by the website-input
package and install workflow:

- workflow: [attribution-website-input-install-and-proof-workflow.md](/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-website-input-install-and-proof-workflow.md)
- operator lane: [wib-006-operator-proof-and-validation-lane.md](/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/docs/validation/wib-006-operator-proof-and-validation-lane.md)

### 3. Integrated Click-To-Outcome Cleanroom

The integrated cleanroom proof installs `website-input` and `attribution`
together, creates a bound website sender token, collects real website-input
events through the app method surface, ingests canonical paid and backend rows,
then validates the operator reads.

Default launcher:

- [attribution-click-to-outcome-cleanroom-live.ts](/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/attribution-click-to-outcome-cleanroom-live.ts)

Passed retained cleanroom bundle:

- [attribution-click-to-outcome-proof-summary.json](/Users/tyler/nexus/state/sandboxes/271f6890-24e2-4d09-95c0-829f1310678d/artifacts/validation/attribution-click-to-outcome-live/20260331T181451Z/attribution-click-to-outcome-proof-summary.json)
- [result.json](/Users/tyler/nexus/state/sandboxes/271f6890-24e2-4d09-95c0-829f1310678d/artifacts/validation/attribution-click-to-outcome-live/20260331T181451Z/result.json)

Durable promoted artifacts:

- [click-to-outcome-proof-20260331T181451Z.json](/Users/tyler/nexus/state/artifacts/validation/attribution-intelligence/click-to-outcome-proof-20260331T181451Z.json)
- [click-to-outcome-proof-latest.json](/Users/tyler/nexus/state/artifacts/validation/attribution-intelligence/click-to-outcome-proof-latest.json)

## What The Passed Proof Demonstrates

- `website-input.installations.create` issues a real bound sender token
- `website-input.collect` accepts canonical `page_view`, `cta_click`, and
  `handoff_start` events
- duplicate replay on `event_id` dedupes correctly
- the attribution app binds acquisition, website, and backend inputs explicitly
- manual replay materializes:
  - `ad_facts=1`
  - `web_events=3`
  - `sessions=1`
  - `bridges=2`
  - `outcomes=1`
  - `outcome_attributions=1`
- `attribution.summary` shows spend, outcomes, and gross revenue
- `attribution.funnel` shows the session-side website funnel counts
- `attribution.outcomes.list` and `attribution.outcomes.get` expose the
  attributed backend outcome with inspectable bridge evidence
- the winning attribution decision is `meta_paid` with `bridge_match`

## Notes

- The host-side runtime supervisor restarted during several earlier launcher
  attempts. The final passed evidence above was completed inside the retained
  cleanroom sandbox using the same cleanroom proof script and fresh workspace
  roots, then promoted into stable host-side artifacts.
- That host-runtime instability does not invalidate the retained cleanroom
  proof. The passed bundle and promoted artifact are the canonical AIL-007
  evidence.
