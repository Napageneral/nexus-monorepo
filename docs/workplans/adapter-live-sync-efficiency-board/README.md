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
- `/Users/tyler/nexus/home/projects/moonsleep-v1/infra/ops-analytics/files/bin/ops-analytics-paid-media-sync.py`
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
- preserve the provider richness captured by the existing MoonSleep workers
  while moving that collection into smarter Nex backfill and live-monitor lanes
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

- `ALSE-006`
- `ALSE-007`

Completed:

- `ALSE-001`
- `ALSE-003`
- `ALSE-004`
- `ALSE-005`
- `ALSE-008`
- `ALSE-009`

## Richness Parity Rule

Adapter efficiency work must not shrink the attribution data surface.

The MoonSleep paid-media workers are the current parity baseline for provider
field coverage, derived metrics, and entity relationships. Nex adapters should
preserve that richness, but they should not copy the old worker cadence where a
minute-scale timer repeatedly scans multi-day windows and rewrites materialized
facts.

The target split is:

1. backfill is exhaustive, correctness-first, and able to reconstruct all
   currently captured MoonSleep provider facts and entity snapshots
2. live monitor is incremental, lane-specific, and cheap, with hot tails for
   volatile metrics and slower reconciliation lanes for late-arriving metrics
   and entity snapshots
3. unchanged logical rows are suppressed before they become new durable Nex
   records

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

Efficiency is not enough by itself. TikTok Business and Meta Ads now have much
better live-monitor posture, but follow-up parity tickets are required to prove
that the Nex adapters preserve the same provider richness the existing
MoonSleep paid-media worker captures.

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

April 27, 2026 TikTok Business update:

- TikTok Business `0.1.1` replaced the old seven-day every-minute monitor
  replay with bounded per-family monitor lanes and adapter-local revision
  suppression
- Frontdoor package publication succeeded for `tiktok-business@0.1.1`; the
  hosted MoonSleep runtime was upgraded through direct runtime package upload
  because the Frontdoor shared-staging path returned a missing staged tarball
  error
- after the package upgrade, stale duplicate TikTok monitor processes from
  `0.1.0` and an orphaned `0.1.1` process were removed, leaving one supervised
  `0.1.1` live-sync process
- hosted counter proof over a seventy-five-second window showed TikTok
  Business delta `0`; the same window showed Shopify delta `0`, Meta Ads delta
  `161`, and Google Ads delta `53`
- hosted public benchmark after TikTok cleanup:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T16-03-02-860Z.json`
- host metrics in that benchmark were healthy at about `4.5%` CPU and about
  `1.08 MB/s` disk write bandwidth

Next offender:

- Meta Ads is now complete; Google Ads is the remaining observed steady-state
  emitter

April 27, 2026 Meta Ads update:

- Meta Ads `0.1.1` replaced the old seven-day daily and forty-eight-hour
  hourly monitor replay windows with bounded per-family monitor lanes and
  adapter-local revision suppression
- Frontdoor package publication succeeded for `meta-ads@0.1.1`; the hosted
  MoonSleep runtime was upgraded through direct runtime package upload
- after the package upgrade, the stale orphaned Meta Ads `0.1.0` monitor was
  removed, leaving one supervised `0.1.1` live-sync process
- hosted counter proof over a seventy-five-second window showed Meta Ads delta
  `0`; the same window showed Shopify delta `0`, TikTok Business delta `0`,
  and Google Ads delta `53`
- hosted public benchmark after Meta cleanup:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T16-12-50-964Z.json`
- host metrics in that benchmark were healthy at about `2.5%` CPU and about
  `11.8 KB/s` disk write bandwidth

Important operational note:

- attribution `record.ingested` subscriptions were temporarily disabled during
  this isolation test and queued attribution ingest jobs were parked because
  the per-record attribution job path was creating a large queue under Shopify
  catchup load; those must be restored or replayed deliberately after adapter
  live-sync pressure is under control

April 27, 2026 TikTok Business richness-parity update:

- TikTok Business `0.1.2` preserved the MoonSleep worker richness additions on
  top of the smarter `0.1.1` monitor posture: landing page views are requested
  from TikTok reports, derived `landing_page_views` and `link_clicks` are
  emitted, and campaign/ad group/ad snapshots include canonical relationship
  and status metadata
- local live MoonSleep proof passed with a 30-day backfill of `1,637` records
  from `46` requests and a simulated 10-minute steady-state monitor of `10`
  requests with `0` emitted records
- hosted MoonSleep runtime `srv-1c4b077a-1f2` was upgraded through direct
  runtime package upload from active `tiktok-business@0.1.1` to active
  `tiktok-business@0.1.2`
- hosted package health reported healthy, all required TikTok methods were
  registered, `adapters.connections.test` passed, and bounded real-credential
  reads returned `4` campaigns, `4` ad groups, `76` ads, and `14` ad daily rows
  for `2026-04-26`
- hosted post-upgrade proof artifact:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-business-hosted-upgrade/postvalidate-2026-04-27T17-32-05-338Z.json`
- hosted public benchmark after the upgrade had zero errors and no records in
  the five-minute adapter-pressure sample:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T17-33-31-979Z.json`
- next richness-parity target is `ALSE-009` for Meta Ads

April 27, 2026 Meta Ads richness-parity update:

- Meta Ads `0.1.2` adds `adset_snapshot`, `ad_snapshot`, and
  `creative_snapshot` projection families while preserving the smarter `0.1.1`
  monitor cadence
- daily campaign/ad set/ad insight requests now include `inline_link_clicks`,
  and derived metrics preserve MoonSleep-compatible link click, landing page
  view, purchase, purchase value, and cost-per-purchase fields
- provider methods now cover campaigns, ad sets, ads, campaign daily, ad set
  daily, ad daily, and account hourly reads
- offline tests, package validation, and Linux arm64 packaging passed; local
  package artifact:
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/dist/meta-ads-0.1.2.tar.gz`
- live MoonSleep Meta proof passed with `13` backfill requests, `1,437`
  records, all eight families present, all parity assertions true, and a
  simulated 10-minute steady-state monitor of `10` requests with `0` emitted
  records
- local proof artifact:
  `/Users/tyler/nexus/state/artifacts/validation/meta-ads-local-benchmark/meta-ads-local-benchmark-2026-04-27T17-49-44Z.json`
- hosted MoonSleep runtime `srv-1c4b077a-1f2` was upgraded through direct
  runtime package upload from active `meta-ads@0.1.1` to active
  `meta-ads@0.1.2`
- hosted package health reported healthy, all required Meta methods were
  registered, `adapters.connections.test` passed, and bounded real-credential
  reads returned `13` campaigns, `16` ad sets, `75` ads, and insight rows at
  campaign, ad set, ad, and account-hourly levels
- hosted post-upgrade proof artifact:
  `/Users/tyler/nexus/state/artifacts/validation/meta-ads-hosted-upgrade/postvalidate-2026-04-27T17-59-24-429Z.json`
- hosted public benchmark after the upgrade had zero errors and no records in
  the five-minute adapter-pressure sample:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T18-00-54-841Z.json`
- next paid-media efficiency/parity target is Google Ads

April 27, 2026 Google Ads efficiency update:

- Google Ads `0.1.1` replaces the old generic one-minute monitor replay with
  adapter-local monitor lanes and revision suppression
- campaign hourly remains the only one-minute lane, bounded to a two-hour
  hot tail
- campaign/ad-group/ad daily reports now reconcile every thirty minutes with a
  bounded three-day tail instead of replaying broad windows every minute
- account/access snapshots now run daily, so the optional
  `customers:listAccessibleCustomers` lookup is no longer hot-loop work under
  developer-token quota pressure
- the adapter now remembers when a credential only works without the
  `login-customer-id` header after Google returns `USER_PERMISSION_DENIED`,
  avoiding repeated two-request retry cycles on every poll
- live MoonSleep Google proof passed with `8` backfill provider requests,
  `186` records, all five families present, a first monitor cycle of `7`
  provider requests and `14` emitted records, and a simulated 10-minute
  steady monitor of exactly `10` provider requests with `0` emitted records
- local proof artifact:
  `/Users/tyler/nexus/state/artifacts/validation/google-ads-local-benchmark/google-ads-local-benchmark-2026-04-27T18-19-56Z.json`
- next step is hosted package install/signoff for Google Ads before the final
  MoonSleep hosted soak and attribution app reorientation

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
5. each active paid-media adapter preserves the MoonSleep worker's provider
   metric, entity, and relationship richness for the same source
6. the hosted MoonSleep server passes a meaningful soak with active live sync
   and acceptable CPU, disk, and latency behavior

## Execution Order

1. lock the performance baseline, instrumentation, and acceptance budget
2. fix Shopify first because it is the clearest source of avoidable load
3. narrow TikTok Business monitor behavior
4. narrow Meta Ads monitor behavior
5. narrow Google Ads monitor behavior
6. close TikTok Business and Meta Ads MoonSleep-worker richness parity gaps
   introduced or exposed by the efficiency refactor
7. add runtime-side latency instrumentation and any required ingest-path
   hardening
8. rerun hosted MoonSleep soak and only then resume attribution app parity work

## Relationship To Other Boards

- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`
  remains the hosted MoonSleep runtime board, but its soak/signoff lane is now
  downstream of this efficiency board
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-app-parity-board/README.md`
  is paused on this board reaching an acceptable hosted baseline
