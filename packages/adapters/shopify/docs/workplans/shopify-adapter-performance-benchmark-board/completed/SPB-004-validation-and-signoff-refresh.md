# SPB-004 Validation And Signoff Refresh

## Goal

Fold the new Shopify adapter-only benchmark lane into the package corpus and
close the initial benchmark board.

## Scope

- refresh package validation docs
- reference the benchmark harness and latest artifacts
- keep hosted tenant proof separate from adapter-only proof

## Acceptance

1. validation docs reference the benchmark harness truthfully
2. the benchmark board can close with durable artifact links
3. hosted tenant latency proof and adapter-only benchmark proof are no longer
   conflated

## Completion

Completed on April 27, 2026.

The validation corpus now references:

- the canonical benchmark harness
- the April 27, 2026 30-day backfill proof
- the April 27, 2026 `10m` monitor soak proof
- the separation between isolated Shopify adapter cost and hosted tenant
  latency proof
