# SAP-006 MoonSleep Shopify Credential Validation

## Status

Completed.

## Outcome

Real MoonSleep Shopify credentials were validated in cleanroom and in the
retained local proof bundle.

## Proof

- Retained cleanroom proof:
  `/Users/tyler/nexus/state/sandboxes/bf043ac9-5575-49ea-8ecd-4ada02c1e3ab/artifacts/validation/shopify-row-parity-live/20260331T134606Z/shopify-proof-summary.json`
- Retained provider spot-check:
  `/Users/tyler/nexus/state/artifacts/validation/shopify/provider-spotcheck-stable-20260331T1540CDT.json`
- Runtime caveat: the successful cleanroom proof required a larger Node heap and
  search-projection disabled in the launcher path; that runtime issue is a
  follow-up outside the Shopify adapter package itself.
