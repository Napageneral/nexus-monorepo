---
summary: "Exhaustive MoonSleep execution inventory and migration contract for adopting Nex schedules, durable events, subscriptions, principals, work custody, and receipts without rewriting proven executors."
title: "MoonSleep Nex Job Migration Catalog"
status: "ACTIVE INVENTORY"
date: "2026-07-20"
---

# MoonSleep Nex Job Migration Catalog

## Purpose and boundary

This catalog inventories MoonSleep's current recurring and event-driven execution planes and defines how they move under Nex custody without losing functionality.

Inventory base: `/Users/tyler/nexus/home/projects/moonsleep-v1`.

Discovered surfaces:

- 60 repository-cataloged systemd timers plus 5 live-host additions found during the production re-audit;
- 63 timer unit files currently present on the Ops VPS, of which 58 are active and 57 are enabled;
- 5 active continuous systemd service instances across Meta CAPI, creative embedding, and three read-only Gmail sources;
- 4 Cloudflare ops-refresh crons that seed 43 typed jobs across six queues plus dead-letter handling;
- 1 Cloudflare ops-internal review-publication cron;
- Shopify, ShipEngine, and TikTok webhook lanes;
- 1 scheduled GitHub production-drift workflow;
- 4 relevant local launchd candidates;
- 1 paused MoonSleep job in Tyler's personal Nex, which must not be imported;
- Nex memory jobs and other personal-runtime maintenance, which are explicitly excluded.

The catalog is an implementation map, not evidence that every repository-declared timer is currently installed. Exact host activation must be read back at each cutover.

Production Nex baseline on 2026-07-21: `moonsleep-nex.service` is enabled, active, and healthy at release `c43eeb790b79e2aca0044d9c499223a7a057e80b`; its runtime stays loopback-bound while the reviewed Tailscale operator path provides private access. PostgreSQL owns the seven canonical work lanes and currently has zero definitions, subscriptions, schedules, runs, queue rows, idempotency rows, or dispatch receipts; the corresponding SQLite business planes remain empty. The host timers below remain authoritative, and the empty Nex deployment activated no replacement trigger or executor.

## Common Nex job contract

Every migrated job follows the same rules.

1. Register the existing executable first; do not rewrite it merely to adopt Nex.
2. Assign an explicit service principal with only its existing provider-read, typed-domain-write, provider-mutation, email-send, artifact-publication, or infrastructure authority.
3. Trigger through either a Nex schedule or a durable source/event subscription.
4. Derive idempotency from source revision, schedule window, partition, and job revision.
5. Store a Nex work receipt that points to the existing typed-domain run, artifact, or provider receipt.
6. Preserve scheduled, source-observed, execution, and read-model-publication clocks, plus latest attempt, last success, last-known-good, and freshness.
7. Shadow Nex scheduling while the old scheduler remains authoritative.
8. Reconcile source hashes, record/row counts, typed-row hashes, watermarks, action receipts, and freshness.
9. Cut over one scheduler at a time while preserving the executable and rollback.
10. Preserve consequential functionality through exact grants; there is no blanket read-only downgrade.

Parity classes:

- **R** — read-only computation or monitor; compare result, status, and alert-decision hashes.
- **T** — typed-domain projector; compare identities, row counts, hashes, and freshness.
- **A** — consequential action; require shadow decision parity, idempotency, provider readback, kill switch, and rollback.
- **I** — infrastructure; catalog and observe it in Nex while systemd remains executor and scheduler initially.

## Exhaustive systemd timer inventory

All timer definitions are under `infra/ops-analytics/files/systemd/`.

| # | Timer | Current trigger and function | Current state or authority | Nex disposition |
|---:|---|---|---|---|
| 1 | `alibaba-supplier-intelligence` | Boot +10m; 30m after completion; captures Alibaba evidence and shadow interpretation | Private evidence artifacts; disabled unless explicitly enabled | Scheduled R; provider-read principal; exact evidence/artifact hashes |
| 2 | `allocation-parity` | Daily 08:05 CT; compares allocation ledger and legacy projection | Read-only; Gmail only on unexplained drift | Scheduled R; comparison and alert-decision parity |
| 3 | `amazon-channel-sync` | Boot +2m; every 5m; listings/inventory to channel quota state | Shadow by default; allowlisted live inventory authority | Scheduled T plus separate A inventory grant |
| 4 | `amazon-fulfillment-submit` | Boot +4m; every 5m; confirmed fulfillment queue to Amazon | Dry-run by default; consequential submit gate | Prefer event A; provider confirmation and idempotency required |
| 5 | `amazon-order-ingest` | Boot +3m; every 5m; orders to commerce-channel tables | Import gate; no Dispatch projection | Adapter schedule then record event projector; T |
| 6 | `component-cover-tripwire` | Every 10m; order/component coverage monitor | Read-only with critical Gmail alert | Scheduled R; alert grant only |
| 7 | `creative-annotation-agent` | Boot +12m; every 10m; up to 90s jitter | Gemini/model calls and bounded annotation writes | Reviewed-creative subscription plus schedule backstop; T |
| 8 | `creative-data-health` | Boot +3m; every 15m; creative freshness/health | May call bounded rebuild endpoint | Scheduled R with separate A rebuild grant |
| 9 | `creative-gemini-embedding` | Boot +5m; every 15m; media to embeddings | Gemini calls and embedding rows/jobs | Embedding-needed subscription plus backstop; T |
| 10 | `creative-index-rebuild` | Boot +3m; every 15m; rebuilds search/materialized creative models | Two ordered internal POST writes | Scheduled T; receipt each ordered call and partial state |
| 11 | `creative-ingest` | Boot +2m; every minute; R2/source media ingest | Deterministic media/content/artifact writes | Adapter/event ingest; T by source and media hashes |
| 12 | `creative-lab-queue` | Daily 04:40 CT; recomputes lab priority queue | Internal read-model write | Scheduled T |
| 13 | `creative-resolve-warm` | Boot +3m; every 5m; warms identity/asset resolution | Internal cache/read-model write | Scheduled T with freshness receipt |
| 14 | `creative-shot-proposals` | Boot +8m; every 5m; model-generated shot proposals | Proposal artifacts only; no approval | Subscription plus backstop; T |
| 15 | `creative-upload-recover` | Boot +2m; every 2m; repairs interrupted uploads | Internal repair with randomized delay | Scheduled repair T; stable upload identity |
| 16 | `creative-usage-linking-review` | Boot +5m; every 10m; safe auto-linking up to 50 | Writes only allowed creative usage links | Subscription plus batch schedule; T with candidate/decision receipt |
| 17 | `creator-mercury-payout-sync` | Boot +3m; every 15m; Mercury evidence to payout readiness | No payment initiation | Scheduled T; Mercury-read and creator-domain-write only |
| 18 | `creator-payout-run-draft` | Monday 08:00 CT; creates closed-week draft | Draft only; no payment | Scheduled T with draft-only grant |
| 19 | `dashboard-publication-monitor` | Daily 23:55; checks committed publication coverage | Read-only monitor/alert | Scheduled R |
| 20 | `dispatch-route-retry` | Every minute at second 15; retries route estimates | Internal route state; provider rate lookups | Retry-requested subscription plus backstop; T/A as applicable |
| 21 | `finance-source-poll` | Boot +5m; 15m after completion; Mercury and disabled Plaid evidence | Host-installed, enabled, and active; zero QBO/journal/payment/filing authority; source ownership still requires exact repository binding | Register dormant scheduled R; preserve hash chain and accounting boundary |
| 22 | `fulfillment-daily-digest` | Daily 08:15 CT; Dispatch/tracking/inventory digest | Gmail send | Scheduled A with exact recipients/template and message receipt |
| 23 | `fulfillment-tracking-sync` | Boot +3m; 10m after completion; ShipEngine tracking | Typed tracking/cost writes; gated Shopify fulfillment/tracking actions | Adapter poll plus projector; provider action separate A |
| 24 | `health-collector` | Boot +2m; every 2m; host/DB/Redis/backup health | Infrastructure read and alert | I; retain systemd authority, ingest receipts only |
| 25 | `inventory-eta-publish` | Every minute at second 20; publishes ETA model | Publication only; local untracked duplicate candidate | Defer pending ownership; likely quota-decision subscription |
| 26 | `inventory-invariant-sweep` | Daily 06:45 CT; inventory invariants | Read-only with Gmail incidents | Scheduled R |
| 27 | `moderation-executor` | Hourly with up to 5m jitter; analyzes moderation queue | Can apply matches/auto-hide under policy | Subscription; split analysis T from hide A grant |
| 28 | `node-cutoff-waves` | Every 15m; plans cutoff waves, labels, packets | Planner plus feature-gated consequential executor | Schedule/event hybrid A; exact cohort and provider receipts |
| 29 | `organic-snapshot-sync` | Boot +2m; every 10m; social organic snapshots | Provider reads, typed writes, token state | Provider adapters plus T projectors |
| 30 | `overview-publication-repair` | Every minute at second 25; refreshes stale Overview | Bounded internal refresh | Stale-publication subscription plus backstop; T |
| 31 | `paid-delivery-tripwire` | Boot +2m; every 5m; delivery/billing red alert | Provider reads and incident emails | Scheduled R plus alert A; stable incident deduplication |
| 32 | `paid-linkage-reconcile` | Daily 05:10 CT; live ads versus creative links | Read-only; Gmail on new gaps | Scheduled R |
| 33 | `paid-media-enrichment-meta` | Boot +4m; 10m after completion; Meta rich breakdowns | Provider read and typed writes | Meta enrichment record families and T projector |
| 34 | `paid-media-enrichment-tiktok` | Boot +5m; 10m after completion; TikTok rich breakdowns | Provider read and typed writes | TikTok enrichment record families and T projector |
| 35 | `paid-media-fast-google` | Boot +2m; 10m after completion; recent Google delivery | Provider read and paid-domain writes | Google adapter and T projector |
| 36 | `paid-media-fast-meta` | Boot +2m; 10m after completion; recent Meta delivery | Provider read and paid-domain writes | Meta adapter and T projector |
| 37 | `paid-media-fast-tiktok` | Boot +2m; 10m after completion; recent TikTok delivery | Provider read and paid-domain writes | TikTok paid adapter and T projector |
| 38 | `paid-media-full-sync` | Boot +7m; hourly after completion; rich rolling repair | Provider read and reconciliation writes | Scheduled repair/reconcile T |
| 39 | `paid-media-sync-meta-entities` | Boot +6m; 10m after completion; entity/hourly sync | Provider read and typed writes | Meta entity families and T projector |
| 40 | `paid-media-sync` | Boot +2m; 10m after completion; legacy aggregate | Deliberately disabled in favor of split units | Retire as provenance; do not migrate |
| 41 | `paid-platform-history-sync` | Hourly at minute 12; platform configuration history | Immutable/history tables and watermarks | Adapter ingestion plus history T projector |
| 42 | `postgres-backup` | Daily 00:15 CT with jitter; logical/restic/R2 backup | Infrastructure data copy and retention | I; retain systemd, observe immutable backup receipt |
| 43 | `preorder-tags` | Every 10m; applies Shopify preorder tags | Shopify mutation under `--apply` | Order-revision subscription A; exact Shopify readback |
| 44 | `product-review-email-send` | Hourly minute 17; sends eligible review invitations | Mailchimp Transactional send with advisory locks/dedup | Event/schedule A; stable invitation and provider message receipt |
| 45 | `refresh-ledger-maintenance` | Daily 00:40 CT; summarizes and retains refresh ledgers | Bounded internal maintenance | I/T; keep runner and attach maintenance receipt |
| 46 | `restore-validate` | Daily 02:30 CT; isolated latest-backup restore proof | Destructive only inside isolated validation target | I; retain systemd and observe restore receipt |
| 47 | `returns-tracking-sync` | Boot +6m; 30m after completion; return tracking | Monotonic typed updates; no refund | Adapter poll/projector T |
| 48 | `shipment-preparing-email-backstop` | Every 10m at minute 3; shipment lifecycle messages | Email send only under exact gate | Event subscription plus backstop A |
| 49 | `shopify-live-reconcile` | Every 10m at second 35; 120m lookback | Shopify read and typed-domain repair writes | Shopify reconciliation schedule; T |
| 50 | `shopify-live-sync` | Every minute at second 5; 10m lookback | Orders/lines/refunds/touches to facts, attribution, queues | Shopify incremental adapter/projector T; preserve until parity |
| 51 | `shopify-quota-push` | Every 5m; inventory decisions to Shopify and ETA | Shadow/live gate; Shopify inventory mutation | Event decision plus separate A executor and readback |
| 52 | `shot-review-notify` | Every 30m; notifies on new proposal blob | Gmail send once per new proposal identity | Event subscription A-alert |
| 53 | `tag-overrides` | Every 10m at minute 5; Shopify/Dispatch overrides | Typed Dispatch override writes | Order/tag subscription T |
| 54 | `texas-franchise-tax-counter` | Daily 02:35 CT; Shopify/Ops read-only counter | Hash-chained artifacts; zero filing/payment authority; local untracked candidate | Register dormant scheduled R with immutable receipt/freshness |
| 55 | `tiktok-aftersales-ingest` | Boot +11m; every 30m; aftersales intake | Dry-run/import gate | TikTok Shop adapter/projector T |
| 56 | `tiktok-channel-sync` | Boot +5m; every 30m; listings/inventory to quota state | Shadow default; live inventory gate | Adapter plus separate A inventory executor |
| 57 | `tiktok-display-token-refresh` | Boot +2m; every 12h; refreshes OAuth token | Credential mutation only | Scheduled credential-refresh A with narrow secret pointer |
| 58 | `tiktok-label-sync` | Boot +9m; every 10m; labels to Dispatch | Dry-run/readback/apply gates | Adapter/event T; narrow label action only if required |
| 59 | `tiktok-order-ingest` | Boot +7m; every 5m; orders to commerce-channel tables | Dry-run/import; no Dispatch projection | Adapter/projector T |
| 60 | `tiktok-tracking-feedback` | Boot +13m; every 15m; movement readback | Confirmed feedback records; no broad submit in current unit | Scheduled/event T; any future provider submission gets separate A |

### Live-host additions found after the 60-row repository inventory

| # | Timer | Current trigger and function | Current state or authority | Nex disposition |
|---:|---|---|---|---|
| 61 | `ais-sync` | Disabled host timer; reviewed-vessel AIS evidence sync | Provider/source evidence only; no inventory or routing authority | Scheduled R adapter intake; immutable observation/source receipt |
| 62 | `backup-alert-unsnooze` | One-shot transient timer that removes the temporary backup-alert snooze and re-runs health collection | Infrastructure control only | I; keep as explicit incident/runbook receipt rather than a durable business schedule |
| 63 | `creative-organic-source-backfill` | Every four hours; TikTok and Instagram source recovery through yt-dlp/Graph fallbacks | Provider reads and creative-source writes | Scheduled repair T; preserve per-source provenance and fallback identity |
| 64 | `inbound-transport-sync` | Disabled host timer; inbound transport evidence sync | Transport evidence/read-model writes only | Scheduled R/T after transport adapter admission; no receipt/inventory authority |
| 65 | `supply-email-ingest` | Roughly every 30 minutes; captures reviewed supply Gmail evidence | Approved-mailbox read and bounded supply evidence writes | Gmail-record subscription/projector with mailbox, participant, attachment, and thread provenance |

The production re-audit found `finance-source-poll` installed, enabled, and active. `inventory-eta-publish` and `texas-franchise-tax-counter` remain absent from the live host and must not be described as shipped. The five additions above are live-host facts; their exact source/release ownership must be rebound before any migration or cutover.

## Continuous systemd workers

| Worker | Input and state | Migration |
|---|---|---|
| `ops-analytics-meta-capi-ingest.service` | Loopback bridge from worker/webhook payloads into PostgreSQL; restart-always | Keep as adapter transport initially; accepted payloads become durable Nex records/events |
| `ops-analytics-creative-gemini-embedding-worker.service` | Polls embedding queue every 10s, batch 4, maximum 6 attempts | Replace polling only after Nex lease/retry/queue parity; executor can remain unchanged |
| `ops-analytics-helpdesk-readonly-v1-gmail-source@{casey,historic-tyler,tyler}.service` | Three enabled, active read-only Gmail source instances with separate mailbox custody | Keep as source executors; emit exact message/thread/attachment records and receipts through the Gmail adapter before replacing any source loop |

The ops API and cloudflared services are runtimes, not catalog jobs.

## Cloudflare ops-refresh plane

Sources:

- `workers/ops-refresh/wrangler.toml`
- `workers/ops-refresh/src/index.ts`
- `workers/ops-refresh/src/queuePolicy.mjs`

Cron seeds:

| Cron | Seed jobs |
|---|---|
| Every minute | `recent_serve_publish`, `live_dispatch` |
| Every 5 minutes | `recent_moderation` |
| Minute 15 hourly | `reconcile_historical` |
| 03:00 daily | `repair_dispatch` |

Durable queue lanes are critical, live, secondary, background, reconcile, and dead-letter, with legacy drain and parking/dead-letter seams.

All 43 typed jobs:

- Dispatch: `live_dispatch`, `repair_dispatch`.
- Recent: `recent_shopify`, `recent_meta`, `recent_tiktok_paid`, `recent_google_paid`, `recent_instagram_snapshots`, `recent_tiktok_display`, `recent_creative_index`, `recent_creator_rights`, `recent_serve_publish`, `recent_supporting_serve_publish`, `recent_organic_serve_publish`, `recent_performance_selector_publish`, `recent_moderation`.
- Repair: `repair_shopify`, `repair_meta`, `repair_tiktok_paid`, `repair_google_paid`, `repair_instagram_snapshots`, `repair_tiktok_display`, `repair_creative_index`, `repair_moderation`.
- Reconcile: `reconcile_historical`, `reconcile_historical_partition`, `reconcile_yesterday_hourly`, `reconcile_yesterday_daily`, `reconcile_last_2d_hourly`, `reconcile_last_2d_daily`, `reconcile_last_3d_hourly`, `reconcile_last_3d_daily`, `reconcile_last_7d_hourly`, `reconcile_last_7d_daily`, `reconcile_last_14d_hourly`, `reconcile_last_14d_daily`, `reconcile_last_14d_weekly`, `reconcile_last_30d_hourly`, `reconcile_last_30d_daily`, `reconcile_last_30d_weekly`, `reconcile_last_90d_hourly`, `reconcile_last_90d_daily`, `reconcile_last_90d_weekly`, `reconcile_all_time_weekly`.

Current reliability state includes `ops_refresh_runs`, `ops_refresh_dead_letters`, daily summaries, serving coverage, watermarks, stable intent/run identifiers, active-run exclusion, leases, heartbeats, retries, coalescing, downstream chains, and dead-letter archival.

Migration sequence for this plane:

1. register all definitions and external run/dead-letter receipt references in Nex;
2. activate no replacement schedules;
3. replace one Cloudflare scheduling lane at a time;
4. retain the existing worker until lease, retry, coalescing, partition, and chain parity pass;
5. do not retire host provider timers merely because a similarly named monitor exists.

## Other cron and event lanes

### Product review snapshot publication

`workers/ops-internal/wrangler.toml` schedules a 10-minute R2 publication job. Map it to a scheduled publication principal with review-read and R2-publication grants; compare object hash, count, visibility, and freshness.

### Shopify paid and cancelled webhook fan-out

The Meta CAPI worker currently couples attribution, preorder tagging, Meta Purchase, Google offline conversion, optional TikTok Purchase, and provider attempt mirroring. Nex should ingest the Shopify revision once and give each consumer a separate idempotent subscription and retry history. Preserve each existing send authority with a provider-specific principal, and keep the webhook until every consumer proves replay parity.

### ShipEngine tracking webhook

The ops API verifies signatures, deduplicates `dispatch_tracking_webhook_receipts`, updates package state, appends tracking events, and updates costs/returns. Map provider webhook to immutable record/event and tracking projector; retain polling as reconciliation.

### TikTok Shop webhook

The API verifies signatures and deduplicates source hashes into `tiktok_shop_webhook_receipts`. Polling currently performs most ingestion. Treat the webhook as an early event source but keep polls until completeness is measured.

## Scheduled GitHub workflow

`.github/workflows/prod-drift-check.yml` runs daily at 13:00 UTC. It performs read-only SSH checks of deployed API and host artifact hashes. Keep GitHub Actions as executor initially and attach the workflow run and drift report as the Nex receipt.

Push/manual deployment workflows are not periodic jobs.

## Local launchd and private-machine jobs

| Job | Current state and authority | Disposition |
|---|---|---|
| `co.moonsleep.po-box-address-replies` | Hourly plist exists but is disabled/unloaded; reads Gmail/ShipEngine; apply mode may update a guarded Shopify address and reproject Dispatch | Keep disabled; later narrow manual/on-demand workflow, not automatic broad agent |
| `com.moonsleep.card-export.chase` | Daily 07:10 plist exists, not loaded; private browser read to mode-0600 hashed accounting artifacts | Local executor only after explicit private-machine scheduling policy |
| `com.moonsleep.card-export.amex` | Daily 07:30 plist exists, not loaded; same boundary | Same |
| `co.moonsleep.analytics-fast-refresh` | Definition exists in installer; actual plist absent | Retire or leave uninstalled; do not migrate before canonical Postgres jobs |

## Personal Nex and memory exclusion

Tyler's existing personal Nex contains one paused MoonSleep definition: `moonsleep.international_shipping_concierge.record_ingested`. Do not import its definition, runs, records, or state into the fresh MoonSleep runtime. If retained, reconstruct it from reviewed MoonSleep source after policy review.

Exclude all memory reader/writer, retention, consolidation, memory-link enrichment, and related personal context jobs. They are outside this program.

## Duplicates and simplification opportunities

1. Explicitly assign each current step to adapter, immutable source record/event, typed projector, action, publication, or health monitor.
2. Use Shopify as the reference vertical to collapse duplicated minute sync, wide reconcile, webhook fan-out, tags, quota, and monitoring only after parity.
3. Consolidate paid-media source ingestion while keeping rich breakdown/history projectors.
4. Express the creative ingest/index/embedding/annotation/proposal/link/health sequence as a visible DAG without rewriting processors.
5. Choose one ETA publisher; quota push and the untracked ETA timer overlap.
6. Compare and retire one of the duplicate Mercury creator-payout wrappers.
7. Label tracking webhook as event-primary and poll as reconciliation-backstop.
8. Add an allowlisted stable record-family event property only after the core contract is reviewed; consumers still hydrate and validate the committed record.
9. Centralize provider mutation authority as principals and grants rather than scattered environment flags.
10. Preserve exact `OnUnitActiveSec` versus `OnUnitInactiveSec` behavior instead of normalizing schedules blindly.

## Full PostgreSQL event-to-work contract

The production `moonsleep-postgres-v1` profile supersedes the transitional split-plane design. PostgreSQL owns immutable records, ingest receipts, durable events, identity observations, job definitions, event subscriptions, dispatch receipts, idempotency, runs, queues, leases, retries, and dead letters. SQLite work and identity planes remain empty for this profile.

The atomic dispatch contract is:

1. PostgreSQL commits a new immutable provider revision and its ingest receipt.
2. The same transaction commits the durable `record.ingested` event.
3. Every enabled matching subscription is snapshotted and receives one durable dispatch receipt, one idempotency identity, one run, and one queue row.
4. Exact replay of the provider revision creates no record, event, dispatch receipt, run, queue row, identity observation, or counter growth.
5. Workers lease with server time and `FOR UPDATE SKIP LOCKED`; ownership-bound renew, completion, retry, expiry recovery, and dead-letter transitions stay in PostgreSQL.
6. Generic `events.publish` cannot forge the reserved `record.ingested` type.

Subscription filters remain top-level bounded objects over the reviewed safe property allowlist. Scalar, array, nested, malformed, oversized, or raw-provider-data filters fail closed. Production activation remains a separate governed gate: install the job and subscription inactive, prove the bounded cohort and complete two-pass backfill, restart and replay, then atomically enable the exact job/subscription pair. Pre-activation records are handled only by explicit cohort/backfill methods and are not silently reinterpreted.

Acceptance covers migration apply/reapply, exact dispatch receipt binding, strict filters, zero/one/multiple targets, concurrent lease exclusion, crash recovery, poisoned work, retries/dead letters, kill switch, restart, replay, empty SQLite business planes, and zero residue.

## Prioritized migration sequence

1. Register the catalog, existing executors, principals, grants, sources, outputs, and external receipt pointers; activate nothing.
2. Shadow a read-only cohort: production drift, publication monitor, allocation parity, inventory invariants, paid tripwire, finance source poll, Texas counter, and digest preview.
3. Complete the Shopify adapter, customer/order/address projectors, PostgreSQL-native event activation, replay, and reconciliation while the current timer remains authoritative.
4. Split Shopify webhook fan-out into attribution, tags, creator refresh, route retry, and provider conversion subscriptions.
5. Move paid and organic source ingestion adapter-by-adapter while retaining history/enrichment projectors.
6. Move ShipEngine and TikTok to webhook-primary plus poll-reconciliation.
7. Register the creative/creator DAG with unchanged processors.
8. Move marketplace, fulfillment, inventory, email, moderation, label, and cutoff actions only with shadow decisions, provider readback, kill switch, and rollback.
9. Keep backup, restore, and host health under systemd; Nex observes their receipts.
10. Defer memory automation, automatic concierge, and private-browser schedules.

## Central conclusion

MoonSleep already has good processors, typed domain tables, run ledgers, watermarks, and safety gates. Nex's immediate value is a single searchable catalog plus durable triggers, subscriptions, principals, receipts, retries, and event lineage around those components. Rewriting every executable would destroy working fidelity without adding value.
