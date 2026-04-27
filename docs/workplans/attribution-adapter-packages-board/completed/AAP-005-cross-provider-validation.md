# AAP-005 Cross-Provider Validation

## Goal

Prove the attribution adapter package set through cleanroom validation.

This is now the adapter-scoped acceptance slice of the broader
[Attribution Golden Journey Board](/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-golden-journey-board/README.md).

## Scope

- Meta Ads
- TikTok Business
- TikTok Display
- Google Ads
- Shopify

## Outcome

Completed through the full attribution golden journey rather than a separate
adapter-only synthetic pass.

Primary validation corpus:

- `/Users/tyler/nexus/home/projects/nexus/docs/validation/attribution-golden-journey-validation.md`
- `/Users/tyler/nexus/state/artifacts/validation/attribution-golden-journey/golden-journey-proof-latest.json`

Validated provider set:

- Meta Ads
- Google Ads
- TikTok Business
- TikTok Display
- Shopify

Closure notes:

- all five providers were installed and backfilled inside one fresh cleanroom
  Nex runtime
- sampled adapter outputs were already covered in the provider-specific parity
  boards; this lane closes the remaining “prove them together” gap
- the golden journey also proved the adapters in the real product context with
  `website-input` and `attribution`

## Acceptance

1. one active validation doc proves setup, health, backfill, and monitor for
   each provider lane
2. the proof path runs in cleanroom first
3. sampled provider rows are checked against upstream values
4. the validation corpus is reusable for later attribution-app work
