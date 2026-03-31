# GAP-001 Google Ads Package Boundary Auth And Provider Access

## Goal

Establish the shared Google Ads acquisition package boundary and concrete
provider access path needed for row-shaped Google Ads ingest.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google/docs/specs/ADAPTER_SPEC_GOOGLE.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`

## Current Gap

- the current shared `google` package mixes Google Ads with Google Business
  Profile and Places behavior
- the current auth surface combines Ads and Business Profile scopes in one
  connection flow
- the current Google Ads fetch path is metric-oriented and does not yet lock
  the provider-access path needed for row-family parity with MoonSleep
- the package does not clearly define how customer-account discovery,
  `customer_id`, and optional `login_customer_id` should behave in Nex

## Acceptance

1. the Google Ads acquisition contract is explicitly separated from Google
   Business Profile behavior at the package and workplan level
2. required credential fields and connection semantics are concrete enough to
   support real Google Ads account discovery and reporting
3. the package can enumerate or validate accessible Google Ads customer
   accounts before performance sync begins
4. the chosen provider access path is explicit enough to support the required
   row families and cleanroom validation later in the board
