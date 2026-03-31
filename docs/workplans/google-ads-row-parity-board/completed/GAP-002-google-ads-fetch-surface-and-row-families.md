# GAP-002 Google Ads Fetch Surface And Row Families

## Goal

Expand the shared Google Ads acquisition package from metric-only output into
the required Google Ads provider row families.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`

## Current Gap

- the current package emits metric fragments instead of one record per provider
  row
- the current fetch path does not preserve the Google Ads row families MoonSleep
  relies on for ops reporting
- account-access discovery, daily campaign rows, ad-group rows, ad rows, and
  hourly replay rows are not all represented as first-class families

## Acceptance

1. the package fetches the required Google Ads row families for:
   - `account_access_snapshot`
   - `campaign_daily`
   - `ad_group_daily`
   - `ad_daily`
   - `campaign_hourly`
2. each family has a concrete row builder in the package
3. emitted records preserve the source row rather than only derived metrics
4. required Google ids, dates, statuses, and performance measures are retained
   for every emitted family
