# AIL-002 MoonSleep Parity Matrix For Core Attribution

## Status

In progress.

## Goal

Build one authoritative parity matrix between MoonSleep's working core
attribution behavior and the target shared Nexus package set.

## Evidence Base

This matrix is based on MoonSleep at commit `6272779` on 2026-03-30 and the
current shared Nex adapter packages under `packages/adapters/`.

Primary MoonSleep sources reviewed:

- `/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/sync.py`
- `/Users/tyler/nexus/home/projects/moonsleep-v1/analytics/build_models.py`
- `/Users/tyler/nexus/home/projects/moonsleep-v1/workers/meta-capi/src/index.ts`

Primary Nexus sources reviewed:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/google/`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/patient-now-emr/`

## Scope

This pass covers the core attribution substrate only:

- paid acquisition facts
- website first-party inputs
- backend outcome inputs
- bridge and attribution evidence required for reconciliation

It intentionally excludes:

- comment moderation
- creative management
- weblabs

## MoonSleep Upstream Inventory

MoonSleep currently pulls or materializes these core attribution inputs:

| Surface | MoonSleep datasets |
|---|---|
| Meta Ads | `meta_ads_campaigns`, `meta_ads_daily`, `meta_ads_adset_daily`, `meta_ads_ad_daily`, `meta_ads_hourly` |
| TikTok Ads | `tiktok_ads_campaigns`, `tiktok_ads_adgroups`, `tiktok_ads_ads`, `tiktok_ads_campaign_daily`, `tiktok_ads_adgroup_daily`, `tiktok_ads_ad_daily`, `tiktok_ads_hourly` |
| Cloudflare traffic | `cloudflare_zone_daily`, `cloudflare_rum_pages`, `cloudflare_rum_referrers` |
| Website first-party bridge | `checkout_attribution`, `funnel_events`, `order_attribution` |
| Backend outcomes | `shopify_orders_raw`, `shopify_orders`, `shopify_line_items` |

Important correction:

- MoonSleep does not currently ingest Google Ads performance facts in
  `analytics/sync.py`.
- MoonSleep does preserve Google click ids such as `gclid`, `gbraid`,
  `wbraid`, and includes Google Ads conversion-upload plumbing in
  `workers/meta-capi/src/index.ts`.
- The shared Nex Google adapter is therefore a forward-looking shared substrate
  for the attribution product, not a direct MoonSleep metrics parity target.
- MoonSleep also has a separate TikTok Display API path for
  `tiktok_display_profile` and `tiktok_display_videos`, but that sits outside
  this core attribution matrix because it is not part of the minimum paid
  attribution substrate.

## Parity Matrix

| Surface | MoonSleep behavior | Current Nex adapter state | Gap to close |
|---|---|---|---|
| Meta Ads | Fetches campaign catalog plus daily campaign, ad set, ad, and hourly insights. Preserves `campaign_id`, `campaign_name`, `adset_id`, `adset_name`, `ad_id`, `ad_name`, `impressions`, `reach`, `clicks`, `spend`, `cpc`, `cpm`, `ctr`, `actions`, `action_values`, and campaign metadata such as status, objective, budget, start, and update timestamps. | `meta-ads` package exists and supports `adapter.health`, `records.backfill`, `adapter.monitor.start`, and canonical `record.ingest`. Current emitted records are metric-shaped campaign facts such as `ad_spend`, `ad_impressions`, `ad_clicks`, `ad_conversions`, `ad_reach`, `ad_cost_per_result` with campaign metadata attached. | Add provider parity for campaign catalog rows, ad set rows, ad rows, hourly rows, purchase value or `action_values`, and landing-page-view level metrics if available. Decide whether the shared substrate should emit row-shaped provider facts, metric-shaped records, or both. |
| TikTok Ads | Fetches campaign, ad group, and ad catalogs plus daily campaign, ad group, ad, and advertiser-hourly performance. Preserves `spend`, `impressions`, `clicks`, `ctr`, `cpc`, `cpm`, `complete_payment`, `complete_payment_roas`, `value_per_complete_payment`. Backfill windows are chunked to 30 days for daily reports and 1 day for hourly reports. | No shared `tiktok-business` adapter package is present in `packages/adapters/`. TikTok Display is also not yet packaged separately in Nex. | Build the shared `tiktok-business` adapter with Nex-native setup, backfill, monitor, and canonical ingest. Match MoonSleep field coverage first, then validate the separate `tiktok-display` supporting surface against MoonSleep's connected profile. |
| Google Ads | MoonSleep currently captures Google click ids and uses them in attribution and conversion-upload flows, but it does not currently ingest Google Ads performance rows in `analytics/sync.py`. | `google` package exists and supports Nex-native setup, health, backfill, and monitor. Current Google Ads ingest is metric-shaped and emits spend, impressions, clicks, conversions, plus derived CPC and CPA with campaign, ad group, and ad ids in metadata. The same package also includes Google Business Profile surfaces that are outside this core attribution scope. | Lock the canonical Google Ads contract for the attribution layer independently of MoonSleep parity. Separate Ads requirements from Business Profile so the attribution app can depend on the acquisition portion without dragging unrelated surfaces into the core model. |
| Cloudflare traffic | Pulls `cloudflare_zone_daily`, `cloudflare_rum_pages`, and `cloudflare_rum_referrers` through Cloudflare GraphQL. Preserves daily requests, page views, uniques, request path page loads, visits, and referrer-host page loads and visits. | No shared `cloudflare` adapter package is present in `packages/adapters/`. | Decide whether Cloudflare belongs as a shared adapter or whether only website first-party inputs are required for the first product slice. If retained, build a dedicated Cloudflare adapter focused on traffic and RUM facts rather than MoonSleep-specific database access. |
| Website first-party inputs | Pulls `checkout_attribution`, `funnel_events`, and `order_attribution` from D1. Preserves session identity, click ids (`fbclid`, `fbc`, `fbp`, `gclid`, `gbraid`, `wbraid`, `ttclid`, `msclkid`, `ttp`), UTMs, page and referrer data, checkout ids and tokens, event names, event groups, product and variant ids, and attribution match evidence. MoonSleep browser and worker code also persist `ms_*` bridge fields into Shopify note attributes. | No shared website input package exists yet in Nex. The current adapters directory does not contain a generic site collector or first-party web SDK package. | Build a shared website input package family. It should own SDK or install paths, collector ingest, canonical web event and bridge schemas, session identity rules, click-id and UTM capture, and proof steps for browser-to-backend bridge persistence. |
| Shopify backend outcomes | Pulls paginated Shopify orders and flattens them into `shopify_orders_raw`, `shopify_orders`, and `shopify_line_items`. Preserves order ids, timestamps, currency, totals, statuses, cart or checkout tokens, source and landing or referrer fields, customer ids and email, plus MoonSleep bridge fields from note attributes such as `ms_initiate_checkout_event_id`, `ms_fbclid`, `ms_fbc`, `ms_fbp`, and `ms_utm_*`. Line items preserve product, variant, SKU, vendor, quantity, and price. | No shared `shopify` adapter package is present in `packages/adapters/`. | Build a shared Shopify adapter with setup, health, backfill, and monitor. Preserve generic order and line-item truth plus a configurable bridge-field passthrough for attribution evidence that survives checkout. |
| EMR backend outcomes | MoonSleep does not currently use an EMR backend for this path. | `patient-now-emr` package exists but is aggregate-metric oriented. It validates credentials and emits canonical metric records without PHI. | Decide whether EMR support for the attribution app needs aggregate metrics only or row-level business outcomes such as lead, appointment, procedure, and revenue events. The current PatientNow adapter is directionally useful but not yet a parity match for the future backend outcome contract. |

## Sync Pattern Comparison

MoonSleep and the current Nex adapters are aligned on the broad operational
shape:

- credentials are resolved per upstream
- historical backfill is explicit
- freshness is maintained through repeat sync

The important structural difference is the data contract:

- MoonSleep stores row-shaped provider tables keyed by upstream ids and dates
- current Nex acquisition adapters emit metric-shaped `record.ingest` envelopes
  with dimensions attached in metadata

That difference matters because the attribution intelligence app wants both:

- durable provider-native row parity for joins, replay, and auditability
- normalized app-owned facts for dashboard and attribution computation

## Immediate Conclusions

1. We can absolutely use MoonSleep code as the exact parity source for Meta,
   TikTok, Cloudflare, Shopify, and website bridge fields.
2. Google Ads needs a product decision rather than a MoonSleep parity copy,
   because MoonSleep currently uses Google mostly as attribution evidence and
   conversion-upload plumbing rather than as a pulled paid-media fact source.
3. The shared website input package is a first-class workstream, not an
   afterthought. MoonSleep's best attribution evidence lives there.
4. Shared adapters should preserve provider-native identifiers and enough raw
   facts for replay, even if the attribution app later materializes a more
   normalized `ad_performance_fact`.

## Ticket Impact

This matrix sharpens the next tickets:

- `AIL-003` should cover Meta Ads, TikTok Business, and Google Ads acquisition
  adapters with explicit field-level output contracts.
- `AIL-004` should own the website input package family plus collector and
  bridge installation contract.
- `AIL-005` should own Shopify first, then EMR-style backend outcomes.

## Acceptance

This ticket is done when:

1. the MoonSleep-to-Nex parity baseline is explicit and stable
2. each provider surface is classified as:
   - existing and usable
   - existing but insufficient
   - missing
3. later adapter tickets can reference this matrix as the baseline contract
