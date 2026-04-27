# ALSE-008 TikTok Business MoonSleep Richness Parity

Status: completed. Local implementation, live MoonSleep API proof, hosted
package upgrade, hosted real-credential smoke, and hosted runtime benchmark
passed on April 27, 2026.

## Goal

Make `tiktok-business` preserve the provider richness captured by the existing
MoonSleep paid-media worker while keeping the smarter backfill and live-monitor
posture from `ALSE-003`.

## Scope

- compare the Nex TikTok Business adapter against the MoonSleep
  `ops-analytics-paid-media-sync.py` TikTok extraction path
- preserve metric fields, derived attribution inputs, and campaign/ad group/ad
  entity snapshot coverage
- keep exhaustive backfill semantics intact
- keep live monitor incremental, lane-specific, and cheap
- extend the local live benchmark so it proves both performance and richness
  parity

## Acceptance

1. full backfill captures the TikTok metrics needed by MoonSleep attribution,
   including spend, impressions, clicks, landing page views, payments, payment
   value, ROAS, and current Nex efficiency metrics
2. campaign, ad group, and ad snapshots preserve provider ids, names, parent
   relationships, status fields, objectives, and budget fields where available
   from the existing MoonSleep worker path
3. live monitor keeps the `0.1.1` posture: a one-minute hot lane for current
   hourly delivery plus slower daily and snapshot reconciliation lanes
4. live monitor does not restore a seven-day every-minute replay loop
5. unchanged logical rows are suppressed before runtime ingest
6. the benchmark artifact reports API request count, emitted record count,
   family coverage, and parity assertions against the MoonSleep worker field
   checklist
7. hosted MoonSleep proof shows TikTok remains quiet in steady state after the
   richness parity changes

## Current Gap

The Nex TikTok Business adapter had the right live-sync shape, but the
MoonSleep worker was richer in at least one attribution input:
`total_landing_page_view`.

The MoonSleep worker fetches TikTok snapshots for campaigns, ad groups, and ads,
then fetches daily campaign/ad group/ad reports and hourly delivery reports. Its
metrics include landing page views, purchases, ROAS, and payment value fields
that are directly useful to attribution.

## Local Resolution

Implemented locally as `tiktok-business@0.1.2`:

- report requests now include `total_landing_page_view` for campaign daily, ad
  group daily, ad daily, and advertiser hourly lanes
- report records derive `landing_page_views` and `link_clicks` alongside
  purchases, purchase value, ROAS, spend, impressions, CTR, CPC, and CPM
- campaign, ad group, and ad snapshots now include canonical entity metadata
  matching the MoonSleep worker's campaign/ad group/ad relationship model
- snapshot revision hashes include that canonical entity metadata so the
  enriched projection emits once, then suppresses unchanged rows normally
- the smart monitor cadence remains unchanged from `0.1.1`

## Local Proof

Offline package proof:

- `go test ./...` passed in
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business`

Live MoonSleep TikTok API proof:

- command:
  `source ~/.config/moonsleep/load.sh && TIKTOK_BUSINESS_LIVE_BENCHMARK=1 go test ./cmd/tiktok-business-adapter -run TestLiveTikTokBusinessLocalBenchmark -count=1 -timeout=15m -v`
- result: passed in `44.880s`
- artifact:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-business-local-benchmark/tiktok-business-local-benchmark-2026-04-27T17-16-05Z.json`
- 30-day backfill: `46` requests, `1,637` records, all seven TikTok families
  present
- richness parity: `total_landing_page_view` requested, all required report
  data levels present, and all required provider endpoints present
- simulated 10-minute steady-state monitor: `10` requests, `0` emitted records
- legacy 10-minute projection remains `150` requests and `4,070` records, so
  the smarter monitor posture is preserved

## Hosted Proof

Hosted MoonSleep package upgrade:

- target runtime: `srv-1c4b077a-1f2` at `https://t-e86786c3-537.nexushub.sh`
- packaged artifact:
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-business/dist/tiktok-business-0.1.2.tar.gz`
- package sha256:
  `45840fbd16ab0411ad71a9edc50c08b257b89db2618ba4d09f01c710cb995c80`
- preflight artifact:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-business-hosted-upgrade/preflight-2026-04-27T17-29-14-156Z.json`
- upgrade artifact:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-business-hosted-upgrade/upgrade-2026-04-27T17-30-13-565Z.json`
- result: upgraded from active `0.1.1` to active `0.1.2`; package health
  reported healthy and adapter version `0.1.2`

Hosted real-credential adapter proof:

- artifact:
  `/Users/tyler/nexus/state/artifacts/validation/tiktok-business-hosted-upgrade/postvalidate-2026-04-27T17-32-05-338Z.json`
- all required TikTok methods were registered
- MoonSleep TikTok connection `d3077645-b5b6-4297-b86c-b2df274acf07` remained
  connected and live sync remained enabled
- `adapters.connections.test` passed against advertiser `7563060383863488513`
- bounded hosted reads passed:
  `tiktok-business.campaigns.list` returned `4` campaigns,
  `tiktok-business.adgroups.list` returned `4` ad groups,
  `tiktok-business.ads.list` returned `76` ads, and
  `tiktok-business.reports.ad_daily.list` returned `14` rows for
  `2026-04-26`

Hosted runtime benchmark after the upgrade:

- artifact:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime-benchmark/moonsleep-hosted-runtime-benchmark-2026-04-27T17-33-31-979Z.json`
- samples per operation: `3`
- pressure window: `5` minutes
- all benchmarked runtime operations returned `0` errors
- adapter-pressure sample returned no records in the window
- public runtime p50s were approximately `278ms` for `apps.list`, `396ms` for
  `jobs.runs.list`, `277ms` for `runtime.health`, `319ms` for
  `attribution.pipeline.status`, and `528ms` for `attribution.summary`

## Follow-Up

- `ALSE-009` should run the same richness-parity and hosted package proof for
  Meta Ads.
- The hosted public URL still has network/proxy latency above the sub-100ms
  product target; previous localhost proof showed the on-box runtime itself is
  already much closer to the target for cheap reads.

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
