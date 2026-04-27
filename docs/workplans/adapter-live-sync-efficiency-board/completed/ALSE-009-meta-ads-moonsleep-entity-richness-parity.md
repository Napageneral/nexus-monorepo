# ALSE-009 Meta Ads MoonSleep Entity Richness Parity

Status: completed. Local implementation, offline tests, package validation,
Linux arm64 packaging, live MoonSleep API proof, hosted MoonSleep runtime
upgrade, hosted real-credential smoke, and hosted runtime benchmark passed on
April 27, 2026.

## Goal

Make `meta-ads` preserve the provider entity richness captured by the existing
MoonSleep paid-media worker while keeping the smarter backfill and live-monitor
posture from `ALSE-004`.

## Scope

- compare the Nex Meta Ads adapter against the MoonSleep
  `ops-analytics-paid-media-sync.py` Meta extraction path
- preserve campaign, ad set, ad, and creative relationship coverage
- preserve attribution-relevant insight metrics and derived fields
- keep exhaustive backfill semantics intact
- keep live monitor incremental, lane-specific, and cheap
- extend Meta adapter validation so it proves both performance and richness
  parity

## Acceptance

1. full backfill captures campaign, ad set, ad, and creative entity snapshots or
   equivalent durable records with provider ids, names, statuses, parent
   relationships, objective/configuration fields, and creative references where
   available from the existing MoonSleep worker path
2. full backfill captures daily campaign/ad set/ad insights and account hourly
   delivery with actions, action values, landing page views, purchases,
   purchase value, and cost-per-action fields
3. live monitor keeps the `0.1.1` posture: a one-minute hot lane for current
   hourly delivery plus slower daily and snapshot reconciliation lanes
4. live monitor does not restore seven-day daily or forty-eight-hour hourly
   replay windows in the one-minute loop
5. unchanged logical rows are suppressed before runtime ingest
6. the benchmark artifact reports API request count, emitted record count,
   family coverage, and parity assertions against the MoonSleep worker field
   checklist
7. hosted MoonSleep proof shows Meta remains quiet in steady state after the
   richness parity changes

## Current Gap

The Nex Meta Ads adapter now has the right live-sync shape, but its entity
snapshot surface is not yet proven equivalent to the MoonSleep worker.

The MoonSleep worker fetches campaign, ad set, and ad edges, including creative
relationships, before fetching daily insight rows at campaign/ad set/ad levels
and hourly account delivery. That gives MoonSleep durable operator context for
why a metric moved, not just the metric rows themselves.

The Nex adapter currently has campaign snapshots plus insight rows. It must
either add first-class ad set, ad, and creative snapshot records or prove an
equivalent durable projection exists without losing operator-facing context.

## Local Resolution

Implemented locally as `meta-ads@0.1.2`:

- added `adset_snapshot`, `ad_snapshot`, and `creative_snapshot` projection
  families alongside the existing `campaign_snapshot`, daily insight, and
  account-hourly families
- ad set snapshots preserve campaign parent id, status, effective status,
  optimization goal, billing event, daily budget, lifetime budget, and update
  time
- ad snapshots preserve campaign/ad set parent ids, ad status, effective
  status, and creative id/name references
- creative snapshots are derived from Meta ad references so the attribution app
  can inspect creative ids and names as first-class durable records
- daily campaign/ad set/ad insight requests now include `inline_link_clicks`
- derived metrics now include `inline_link_clicks`, fallback `link_clicks`,
  landing page views, purchases, purchase value, and cost per purchase with
  MoonSleep-compatible action aliases including `omni_purchase` and
  `offsite_conversion.fb_pixel_purchase`
- provider methods now cover campaigns, ad sets, ads, campaign daily, ad set
  daily, ad daily, and account hourly reads
- the `0.1.1` monitor cadence remains intact: account hourly is the one-minute
  hot lane, and daily/snapshot reconciliation remains on slower lanes

## Local Proof

Offline package proof:

- `go test ./...` passed in
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads`
- `go build -o ./bin/meta-ads-adapter ./cmd/meta-ads-adapter` passed
- `nexus package validate .` passed for package `meta-ads@0.1.2`
- Linux arm64 package artifact:
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/dist/meta-ads-0.1.2.tar.gz`
- package sha256:
  `0e4ebb7cb901862c82a234bb7470b9b54bb35ccdea5affaebb6637f8f37c1685`

Live MoonSleep Meta API proof:

- command:
  `source ~/.config/moonsleep/load.sh && META_ADS_LIVE_BENCHMARK=1 go test ./cmd/meta-ads-adapter -run TestLiveMetaAdsLocalBenchmark -count=1 -timeout=15m -v`
- result: passed in `31.05s`
- artifact:
  `/Users/tyler/nexus/state/artifacts/validation/meta-ads-local-benchmark/meta-ads-local-benchmark-2026-04-27T17-49-44Z.json`
- 30-day backfill: `13` requests, `1,437` records, all eight Meta families
  present
- family counts: `campaign_snapshot=13`, `adset_snapshot=16`,
  `ad_snapshot=75`, `creative_snapshot=75`, `campaign_daily=45`,
  `adset_daily=76`, `ad_daily=422`, `account_hourly=715`
- parity assertions passed for campaign/ad set/ad snapshot endpoints, campaign
  ad set/ad/account report levels, required report fields, and derived metric
  keys
- first monitor cycle: `8` requests and `209` emitted records
- simulated 10-minute steady-state monitor: `10` requests and `0` emitted
  records

## Remaining Work

Completed on April 27, 2026.

## Hosted Proof

Hosted MoonSleep package upgrade:

- target runtime: `srv-1c4b077a-1f2` at `https://t-e86786c3-537.nexushub.sh`
- packaged artifact:
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/dist/meta-ads-0.1.2.tar.gz`
- package sha256:
  `7add95a07dd50be85b5a0033bd10482ac1a692d8e56428e80d2fda03a3fb48f7`
- preflight artifact:
  `/Users/tyler/nexus/state/artifacts/validation/meta-ads-hosted-upgrade/preflight-2026-04-27T17-57-21-795Z.json`
- upgrade artifact:
  `/Users/tyler/nexus/state/artifacts/validation/meta-ads-hosted-upgrade/upgrade-2026-04-27T17-57-59-385Z.json`
- result: upgraded from active `0.1.1` to active `0.1.2`; package health
  reported healthy and adapter version `0.1.2`

Hosted real-credential adapter proof:

- artifact:
  `/Users/tyler/nexus/state/artifacts/validation/meta-ads-hosted-upgrade/postvalidate-2026-04-27T17-59-24-429Z.json`
- all required Meta methods were registered
- MoonSleep Meta connection `bde3face-bab7-4262-afaf-491cb00b98ab` remained
  connected and `adapters.connections.test` passed
- bounded hosted reads passed:
  `meta-ads.accounts.get`,
  `meta-ads.campaigns.list` returned `13` campaigns,
  `meta-ads.adsets.list` returned `16` ad sets,
  `meta-ads.ads.list` returned `75` ads,
  `meta-ads.insights.campaign_daily.list` returned `1` row,
  `meta-ads.insights.adset_daily.list` returned `2` rows,
  `meta-ads.insights.ad_daily.list` returned `11` rows, and
  `meta-ads.insights.account_hourly.list` returned `24` rows for
  `2026-04-26`

Hosted runtime benchmark after the upgrade:

- artifact:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T18-00-54-841Z.json`
- samples per operation: `3`
- pressure window: `5` minutes
- all benchmarked runtime operations returned `0` errors
- adapter-pressure sample returned no records in the window
- public runtime p50s were approximately `303ms` for `apps.list`, `397ms` for
  `jobs.runs.list`, `278ms` for `runtime.health`, `320ms` for
  `attribution.pipeline.status`, and `533ms` for `attribution.summary`

## Follow-Up

- Google Ads remains the next observed paid-media adapter to inspect for
  steady-state emission behavior.
- Public hosted URL latency remains above the sub-100ms product target even
  when adapter pressure is quiet; previous localhost proof indicates much of
  that gap is network/proxy or non-cheap app read cost rather than active
  adapter churn.

## Implementation Notes

- Treat the MoonSleep worker as the provider-field parity baseline, not as the
  runtime design to copy.
- Backfill may scan broadly because it is an operator-initiated reconstruction
  path.
- Monitor should stay family-laned and bounded: hot hourly tail every minute,
  slow daily reconciliation every thirty minutes, and entity snapshots every
  thirty minutes or slower.
- Prefer stable logical ids plus revision suppression for emitted records.
- Do not add any schema field named `kind`.

## Proof Plan

1. add or extend a Meta live benchmark checklist with MoonSleep entity and
   metric coverage assertions
2. run normal offline package tests
3. run the gated MoonSleep live benchmark when credentials are available
4. package and install on the hosted MoonSleep runtime only after local proof
5. run a hosted counter sample and latency benchmark after installation
