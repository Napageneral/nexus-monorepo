# AFEA-001 Fleet Efficiency Proof Harness

## Goal

Create one repeatable proof shape for adapter efficiency so every adapter can
be judged against the same standard.

## Scope

- define a package-local benchmark profile for backfill and live monitor
- capture provider request counts, emitted record counts, elapsed time, and
  restart behavior
- capture steady-state no-change monitor behavior over a short soak
- define a pass/fail budget for hot-loop provider work and durable record churn
- document how provider-backed adapters should prove health checks are O(1)

## Acceptance

1. every active adapter has a clear benchmark command or documented exception
2. the proof captures at least one exhaustive backfill and one steady-state
   live monitor soak
3. restart resume behavior is tested for adapters with live monitors
4. unchanged provider rows are proven not to create durable record churn
5. the proof output can be attached to adapter validation docs and hosted
   upgrade tickets

## Notes

Use Shopify, Google Ads, Meta Ads, TikTok Business, and Eve as implementation
examples. The harness should be extracted opportunistically while burning down
the concrete adapter tickets; it is not a prerequisite that blocks starting
Zenoti.
