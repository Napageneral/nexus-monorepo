# AIP-003 Bridge And Backend Outcome Matching Parity

## Goal

Port the most valuable MoonSleep bridge and order-matching logic into the
attribution app so backend outcomes resolve more accurately and more
explainably.

## Acceptance

1. checkout and handoff bridge matching follows a clear priority order
2. Shopify order and line-item matching logic is materially closer to
   MoonSleep's current attribution behavior
3. unresolved reasons remain explicit when no trustworthy bridge exists
4. the work preserves a reusable path for future backend adapters such as
   Zenoti
