# Adapter Live Sync Efficiency Board

This board tracks the hardening work required to make the live attribution
adapter set behave like a production system instead of a replay-heavy proof
environment.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-full-surface-compliance-standard.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-validation-proof-ladder.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-app-parity-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/tier1_projection.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business/cmd/tiktok-business-adapter/ingest.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/cmd/meta-ads-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google-ads/cmd/google-ads-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/runtime/stages/finalizeRequest.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/storage/records.ts`

Scope:

- inspect the full backfill and live-monitor posture for the active hosted
  MoonSleep attribution adapters
- separate exhaustive backfill correctness from cheap incremental live sync
- reduce unnecessary replay windows, snapshot scans, and revision churn
- measure and harden the tenant runtime latency under active monitor load
- restore hosted runtime reads to a production-grade latency budget before more
  attribution app product work

Out of scope:

- new attribution UI features
- new providers outside the current MoonSleep paid-core set
- replacing the canonical adapter package boundaries
- weakening correctness just to make the box look fast

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

In progress:

- `ALSE-002`

Not started:

- `ALSE-003`
- `ALSE-004`
- `ALSE-005`
- `ALSE-006`
- `ALSE-007`

Completed:

- `ALSE-001`

## Current Diagnosis

The current hosted MoonSleep server is too slow for production:

- cheap reads like `apps.list`, `jobs.runs.list`, and `runtime.health` are
  taking seconds instead of milliseconds
- tenant CPU and disk write rates stay elevated even without active replay jobs
- the adapter set is using replay-safe polling loops as its steady-state live
  sync posture

The `ALSE-001` baseline artifact now makes that concrete:

- canonical artifact:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-07T18-55-21-334Z.json`
- cheap reads are still far above the budget, with `apps.list` showing extreme
  latency spikes
- the host was effectively saturated during the benchmark snapshot at about
  `97%` CPU and about `23.4 MB/s` disk write bandwidth
- the recent-hour record pressure was dominated by `shopify`, followed by
  `web-journey`

The original worst offender was Shopify:

- monitor polls every minute and fetches orders, customers, products,
  collections, inventory, fulfillments, discounts, and marketing every cycle
- several monitor families intentionally fall back to local snapshot scans in
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/shopify/cmd/shopify-adapter/tier1_projection.go`
- most Shopify record ids include a revision hash, so any row change becomes a
  new durable record rather than a stable upsert

TikTok Business, Meta Ads, and Google Ads also still use multi-day replay
windows on minute-scale live monitors.

April 27, 2026 Shopify update:

- package-local adapter-only benchmark now passes with a 30-day MoonSleep
  backfill plus `10m` no-change monitor soak
- current proof:
  `/Users/tyler/nexus/state/sandboxes/6bab0655-3bc7-4513-bee8-44615bdc4360/artifacts/validation/shopify-adapter-benchmark/20260427T140738Z/shopify-adapter-benchmark.json`
- Shopify backfill emitted `8577` records in `34749ms`
- Shopify monitor soak emitted `0` additional records across `10` snapshots
- local source now also falls back to `last_poll_at - overlap` when a family
  has not yet observed a provider row to advance `cursor_at`

Shopify is no longer the obvious package-local CPU/disk offender. `ALSE-002`
stays in progress until that latest local patch is packaged/installed on the
hosted MoonSleep tenant and the full hosted adapter set is re-benchmarked.

April 27, 2026 hosted package/deploy retest:

- Shopify `0.1.2` was packaged, published, and installed on the MoonSleep
  hosted runtime; the active monitor process now runs from
  `/opt/nex/state/packages/installed/adapter/shopify/releases/0.1.2`
- before deployment could complete, the hosted server hit a separate runtime
  durability problem: `runtime.db` had grown to about `56GB`, dominated by
  unbounded `bus_events` and `nexus_requests`, while business data ledgers were
  much smaller
- after compacting runtime request/event telemetry, the disk recovered from
  effectively full to about `23%` used
- first hosted Shopify `0.1.2` run still flooded the runtime because the
  persisted Shopify monitor cursor was stale at April 10, 2026; the live
  monitor treated that as a catchup window and emitted thousands of records
- after seeding the hosted Shopify monitor cursor to steady state, Shopify
  stopped producing new durable records in the live sample and its
  `adapter_instances.events_received` counter had `0` delta over a one-minute
  sample
- the same one-minute counter sample showed the remaining hot adapters were
  `tiktok-business` at about `405` events/minute and `meta-ads` at about
  `162` events/minute; `google-ads` showed `0` delta in that sample
- public-runtime benchmark after Shopify steady-state seeding improved from
  multi-second reads to roughly `281ms` p50 for `apps.list`, `517ms` p50 for
  `jobs.runs.list`, and `276ms` p50 for `runtime.health`
- on-server localhost benchmark showed the runtime itself is now healthy for
  cheap reads: `runtime.health` about `8ms` p50, `apps.list` about `11ms` p50,
  and `jobs.runs.list` about `12ms` p50
- remaining non-cheap product read cost is still visible in
  `attribution.summary`, about `136ms` p50 on localhost

Current proof artifacts:

- hosted public benchmark after Shopify steady-state seed:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T15-23-33-328Z.json`
- hosted localhost benchmark after Shopify steady-state seed:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-runtime-localhost-benchmark-2026-04-27T15-27-00Z.json`

Important operational note:

- attribution `record.ingested` subscriptions were temporarily disabled during
  this isolation test and queued attribution ingest jobs were parked because
  the per-record attribution job path was creating a large queue under Shopify
  catchup load; those must be restored or replayed deliberately after adapter
  live-sync pressure is under control

## Goal State

The board is only complete when all of the following are true:

1. cheap hosted runtime reads like `apps.list`, `jobs.runs.list`, and
   `runtime.health` are sub-100ms median on the MoonSleep hosted server and do
   not degrade into multi-second reads under normal live sync
2. each active adapter has an explicit distinction between exhaustive backfill
   semantics and cheap steady-state monitor semantics
3. no adapter performs minute-by-minute full snapshot scans or multi-day replay
   windows without an explicitly justified slow lane
4. unchanged logical rows are suppressed before they create unnecessary durable
   record churn
5. the hosted MoonSleep server passes a meaningful soak with active live sync
   and acceptable CPU, disk, and latency behavior

## Execution Order

1. lock the performance baseline, instrumentation, and acceptance budget
2. fix Shopify first because it is the clearest source of avoidable load
3. narrow TikTok Business monitor behavior
4. narrow Meta Ads monitor behavior
5. narrow Google Ads monitor behavior
6. add runtime-side latency instrumentation and any required ingest-path
   hardening
7. rerun hosted MoonSleep soak and only then resume attribution app parity work

## Relationship To Other Boards

- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`
  remains the hosted MoonSleep runtime board, but its soak/signoff lane is now
  downstream of this efficiency board
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-app-parity-board/README.md`
  is paused on this board reaching an acceptable hosted baseline
