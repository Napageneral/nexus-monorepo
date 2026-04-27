# ALSE-001 Hosted Baseline And Proof Contract

## Goal

Make the performance problem measurable and non-negotiable before adapter
hardening starts.

## Scope

- hosted MoonSleep runtime latency measurements for cheap reads and key app
  reads
- explicit distinction between direct runtime latency and CLI startup overhead
- per-adapter and per-family live-sync pressure census
- record churn and duplicate-vs-new insert analysis
- CPU, disk, and request-latency acceptance budget for the hosted server

## Acceptance

1. a canonical benchmark harness exists for the hosted MoonSleep server and
   records p50 and p95 timings for the direct hosted runtime path and the
   Frontdoor path for:
   - `apps.list`
   - `jobs.runs.list`
   - `runtime.health`
   - `attribution.pipeline.status`
   - `attribution.summary`
2. the dominant sources of sustained hosted load are identified by adapter and,
   where possible, by family
3. the board locks the latency target for cheap reads at sub-100ms median on
   the hosted MoonSleep server
4. a durable baseline artifact exists so later adapter fixes can be judged
   against the same contract

## Starting Point

Current diagnosis already shows:

- the tenant runtime is slow even for cheap endpoints
- the hosted box stays busy even when no replay job is active
- the active paid-core adapter set is using replay-heavy monitor behavior

Quick local sanity checks also show that the broad local runtime baseline is
not the main problem:

- direct local `http://127.0.0.1:18789/health` responds in about `72ms`
- local `nexus status` reported runtime reachable in about `200ms`
- local `nexus runtime call jobs.status` was about `380ms`
- local `nexus runtime call records.list --params '{"limit":5}'` was about
  `400ms`

That means the active issue is primarily the hosted MoonSleep tenant under live
adapter load, not the general existence of the Nex runtime.

## Benchmark Contract

The benchmark for this board should be product-shaped rather than synthetic.

The canonical measured operations are:

- `apps.list`
- `jobs.runs.list`
- `runtime.health`
- `attribution.pipeline.status`
- `attribution.summary`

The benchmark must collect:

- direct tenant runtime timings where possible
- public Frontdoor timings
- p50
- p95
- max
- error rate
- host CPU
- disk read bandwidth
- disk write bandwidth
- disk write IOPS
- per-adapter record pressure over the same measurement window

The benchmark should run under normal live-sync load. It must not disable the
active monitors just to make the box look healthy.

## Latency Budget

Tier A: cheap control-plane reads

- `apps.list`
- `jobs.runs.list`
- `runtime.health`
- `attribution.pipeline.status`

Target:

- p50 under `100ms`
- p95 under `250ms`

Tier B: heavier product read

- `attribution.summary`

Immediate acceptance target:

- p50 under `250ms`
- p95 under `500ms`

Stretch target after read-model hardening:

- p50 under `100ms`

## Required Artifact Bundle

The durable baseline artifact for this ticket should contain:

- one latency JSON for the direct tenant runtime path
- one latency JSON for the public Frontdoor path
- one host-metrics JSON covering the same window
- one adapter-pressure JSON with counts by adapter and, where possible, by
  family
- one short markdown summary interpreting the results

## Adapter Pressure Census

The census should answer:

- which adapters emit the most records per minute
- which families dominate write pressure
- which families are doing broad scans but mostly dedupe away
- which families are creating genuinely new durable records through revision
  churn

For Shopify in particular, the baseline should capture:

- emitted records per family
- distinct `logical_row_id` count by family
- distinct `revision_hash` count by family
- rough ratio of emitted rows to real row changes

## Notes

This ticket should produce the benchmark contract the rest of the board uses.
It is not optional bookkeeping.

## Current Baseline Artifact

The current canonical benchmark artifact bundle is:

- JSON:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-07T18-55-21-334Z.json`
- markdown summary:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-07T18-55-21-334Z.md`

A follow-up run with the same pressure window but shorter sample count verified
the Hetzner host-metrics parsing end to end:

- JSON:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-07T18-56-09-449Z.json`

The current public-runtime baseline shows two things at once:

- the tenant is consistently above the latency budget even on cheap reads
- the worst latency is spiky, not just uniformly slow

The current sampled public-runtime timings are:

- `apps.list` p50 about `2010ms`, p95 about `13823ms`
- `jobs.runs.list` p50 about `399ms`, p95 about `563ms`
- `runtime.health` p50 about `279ms`, p95 about `302ms`
- `attribution.pipeline.status` p50 about `318ms`, p95 about `333ms`
- `attribution.summary` p50 about `646ms`, p95 about `671ms`

The adapter-pressure census over the recent hour shows write pressure dominated
by:

- `shopify` at `50` records
- `web-journey` at `38` records

Within Shopify, the hot families were:

- `customer`
- `line_item`
- `fulfillment`
- `inventory`
- `order`
- `product`

The matching host-pressure snapshot from the parsed Hetzner metrics shows the
box is effectively saturated during the benchmark window:

- CPU about `97%`
- disk write bandwidth about `23.4 MB/s`
- disk write IOPS about `1141.6`

That is enough to close the “is this really the host, or just a slow endpoint”
question. The current hosted tenant is under real continuous pressure while the
cheap reads are being measured.
