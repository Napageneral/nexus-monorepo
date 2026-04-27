# SLE-007 Hosted MoonSleep Efficiency Proof Refresh

## Goal

Prove that the new Shopify incremental live-sync model works correctly and no
longer drags the hosted MoonSleep tenant into unacceptable latency.

## Scope

- refresh the package-local validation doc
- run cleanroom proof for backfill, monitor restart, and bounded live changes
- run hosted MoonSleep before/after benchmark and churn artifacts
- close the Shopify package-local efficiency board and unblock the broader
  attribution app parity lane

## Acceptance

1. package-local validation corpus references the new incremental proof path
2. hosted benchmark shows material improvement against the current baseline
3. hosted MoonSleep remains responsive under live Shopify monitoring
4. the active package docs no longer imply that the old replay-heavy monitor
   posture is good enough

## Proof

- cleanroom proof bundle
- hosted benchmark artifact bundle
- hosted Shopify churn artifact bundle
- refreshed validation doc and package workplan

## Progress

The hosted MoonSleep tenant is now running `shopify@0.1.1`, which includes the
new family scheduler, family cursor state, targeted inventory hot lane, and
duplicate-revision suppression.

Fresh hosted proof artifacts:

- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-08T02-29-53-696Z.json`
- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-08T02-29-53-696Z.md`
- `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/shopify-recent-churn-2026-04-08T02-31-23-239Z.json`

Current hosted result:

- `apps.list` improved from roughly `2010ms` p50 / `13823ms` p95 to
  `286ms` p50 / `542ms` p95
- host CPU average dropped from the prior saturated range to roughly `46.7%`
- disk write bandwidth average dropped to roughly `10.1 MB/s`
- repeated Shopify logical rows fell in the hottest family groups, especially
  `line_item` and `order`

The hosted lane is materially better, but it is not closed yet. `attribution`
reads still have unacceptable tail latency, so the Shopify efficiency work is
no longer the dominant blocker but the full hosted signoff remains open.

April 27, 2026 package-local benchmark refresh:

- `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-benchmark.json`
- 30-day MoonSleep Shopify backfill: `8577` records in `34749ms`
- `10m` monitor soak: `0` total record delta and no family-level churn
- no-change live monitor container sample during the soak was effectively idle
  rather than CPU-bound

Remaining work:

- package and install the latest local watermark fallback patch onto the hosted
  MoonSleep tenant
- rerun hosted runtime/app latency and adapter-pressure benchmarks with the
  full adapter set active
- close this ticket only if hosted MoonSleep remains responsive under the full
  live-sync load
