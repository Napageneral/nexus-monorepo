# AIP-004 Attribution Ledger And Evidence Review Surfaces

## Goal

Build the inspectable attribution ledger and review surfaces that let operators
see what matched, what failed, and why.

## Current Status

The `0.1.5` attribution app now has an app-owned ledger read model on top of
existing business-outcome and outcome-attribution facts:

- primary outcomes are entity-level, not raw backend rows
- scope-correct inspector reads are supported
- review flags are derived for `missing_row`, `weak_match`, `utm_only`,
  `needs_review`, and `clean`
- the UI is switched from raw `outcomes.list` rows to a ledger/review queue

The remaining work on this ticket is live hosted validation and any final
surface tightening after the MoonSleep browser pass.

## Live Validation Notes

Hosted MoonSleep validation against `moonsleep-prod-shadow` already surfaced
two concrete parity gaps to resolve before this ticket can be closed:

- the newest Shopify orders can appear in the ledger as `missing_row` until
  attribution materialization catches up
- the current review heuristic is too aggressive for MoonSleep parity and
  likely needs to narrow `weak_match` / `needs_review` semantics

## Acceptance

1. the app exposes a real outcome ledger rather than only a short recent list
2. operators can inspect winning decisions, evidence, bridge attributes, and
   unresolved reasons quickly
3. review-oriented states such as weak or unresolved attribution are surfaced
   clearly
4. the UI and methods read app-owned facts instead of raw adapter payloads
