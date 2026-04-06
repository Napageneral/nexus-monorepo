# MHAR-005 Hosted Connection Setup Backfill And Freshness Baseline

## Goal

Connect the real MoonSleep upstreams to the hosted runtime, run the full
backfills, and establish the first trustworthy freshness baseline there.

## Scope

- Meta Ads
- Google Ads
- TikTok Business
- Shopify
- attribution app bindings across acquisition, website, and backend roles

## Acceptance

1. all blocking MoonSleep upstreams connect successfully on the hosted runtime
2. full backfills complete there
3. attribution materialization produces expected core facts there
4. one baseline snapshot records counts, freshness state, and any known gaps

## Findings

Connected hosted MoonSleep upstreams on `srv-1c4b077a-1f2`:

- Meta Ads
- Google Ads
- TikTok Business
- Shopify

Attribution scopes and website installations already minted there:

- `moonsleep-hosted-safe-shadow`
- `moonsleep-hosted-demo-shadow`
- `moonsleep-prod-shadow`

Baseline hosted artifacts now exist:

- runtime setup summary:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-hosted-runtime-setup-2026-04-05.json`
- hosted prod-shadow preflight:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-hosted-runtime/moonsleep-prod-shadow-preflight-2026-04-06T01-09-27-908Z.json`
- hosted post-replay snapshot baseline:
  `/Users/tyler/nexus/state/artifacts/validation/moonsleep-shadow-snapshots/moonsleep-shadow-snapshot-2026-04-06T01-15-44-322Z.json`

Materialized baseline after explicit replay:

- spend:
  `26791.380505`
- purchases:
  `594`
- purchase value:
  `117408.86`
- outcomes:
  `5000`
- gross revenue:
  `195258.57`
- pipeline counts:
  - `ad_facts=1150`
  - `web_events=1`
  - `business_outcomes=6776`
  - `outcome_attributions=3079`

This closes the hosted connection and baseline lane. The next gate is not raw
hosted ingest anymore; it is soak and repeated freshness proof over time.
