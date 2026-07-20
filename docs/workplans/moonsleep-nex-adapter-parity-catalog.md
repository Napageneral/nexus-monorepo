---
summary: "MoonSleep provider integration inventory and the parity contract for converting each integration into a Nex adapter without capability or data loss."
title: "MoonSleep Nex Adapter Parity Catalog"
status: "ACTIVE INVENTORY"
date: "2026-07-20"
---

# MoonSleep Nex Adapter Parity Catalog

## Purpose

This catalog is the dispatch contract for provider-by-provider MoonSleep Nex adapter work.
It does not authorize provider calls, production cutover, domain writes, or retirement of an existing connector.

The architecture is:

1. a fresh MoonSleep-only Nex runtime owns adapter connections, immutable provider records, ingestion receipts, durable events, subscriptions, and work custody;
2. existing typed MoonSleep databases remain authoritative for their domains;
3. projectors consume committed Nex records through public operations and update typed MoonSleep domains through their existing governed interfaces;
4. existing provider actions remain available, but only behind the same or stronger grants, idempotency, approval, and provider-readback controls;
5. current timers and workers remain active until shadow parity, rollback, and owner-approved cutover are proven.

The initial inventory was produced from the local MoonSleep and Nex source trees. The MoonSleep checkout was at `abee5de6` with unrelated dirty work and the Nex umbrella checkout was at `ad66a961`; therefore exact deployment status must be rebound to a clean release commit inside each adapter lane.

Production bedrock readback on 2026-07-20: the fresh MoonSleep Nex service is enabled and healthy on the Ops VPS at release `00371fcbe76b1fe2c93b319a06dc75f37f241bbe`. It contains exactly the fresh entities `Casey`, `MoonSleep Ops`, and `Tyler`, zero contacts, zero personal-state markers, zero adapters, zero business records/events/search documents, and zero job definitions/subscriptions/schedules/runs/queue rows. PostgreSQL migrations `records_events_work_initial` and `record_search_projection` are applied. Verifier hardening subsequently merged to Nex main at `3dcfbd0b33b0f4720525cca93203a9994376fb02` and passed the full disposable VPS cleanroom; it changes the offline quiesced-state verifier, not the active runtime behavior. No adapter lane may treat this empty deployment as provider admission or cutover authority.

## Universal completion contract

An adapter is not complete because it can authenticate or return a sample page. Every lane must pass all nine gates:

1. **Fresh boundary** — connect only the approved MoonSleep account or workspace; import no personal Nex state.
2. **Source fidelity** — retain exact provider payload or bytes, SHA-256, stable external identity, provider timestamps, observation time, and revision/deletion semantics.
3. **Exhaustive backfill** — immutable staged pages and a complete manifest support resume, replay, gap detection, tamper detection, and cross-account rejection.
4. **Commit ordering** — poll or webhook cursor advances only after the record, receipt, and durable ingestion event commit.
5. **Typed parity** — compare every field used by every existing MoonSleep consumer, including null/zero distinctions, decimals, money, time zones, attachments, and relationships.
6. **Public projection seam** — project through public Nex and MoonSleep operations; adapters do not write private domain SQL directly.
7. **Action parity** — preserve every existing read and write operation with explicit grants, idempotency, approval boundaries, and provider readback.
8. **Shadow reconciliation** — run old and new connectors together until counts, IDs, fields, revisions, money, timestamps, and action outcomes reconcile over a representative period.
9. **Safe cutover** — retire old timers only after sustained parity, current-state readback, a tested rollback, and an owner-approved cutover receipt.

Each lane must also prove bounded credentials, rate-limit behavior, retries, dead-letter/readback, source freshness, last-attempt versus last-success state, and zero capability expansion.

## Primary adapter lanes

### 1. Shopify

- **Current MoonSleep seams:** `infra/ops-analytics/files/bin/ops-analytics-shopify-live-sync.py`, Dispatch, preorder tagging, inventory quota, Meta CAPI, commerce and finance evidence.
- **Nex starting point:** `packages/adapters/shopify`.
- **Sealed evidence:** source fidelity `3bf3f7c3`; resumable page staging `9fec5307`; customer identity projector `40790cd6`; dormant event-handoff gate `72f648f4`; exact-string provider envelope `75f66d7c`; exact-string MoonSleep order projection contract `4f6f0541`; explicit 1-50-record customer cohort proof method `92d9d9ef`.
- **Provider families:** customers, contacts, addresses, orders, lines, payments, refunds, products, variants, inventory, fulfillment, events, and fulfillment actions.
- **Completion:** finish product/refund/fulfillment parity, land the receipt-bound PostgreSQL-event-to-work handoff, project customer/order state, reconcile full history and incrementals, and preserve every Dispatch/Shopify action with readback. The customer job and subscription remain deliberately dormant until crash/replay proof closes the handoff gate.
- **Owner lane:** Unified Ops Shopify task. Do not duplicate it here.

### 2. Meta paid media

- **Current seams:** `ops-analytics-paid-media-sync.py`, `workers/ops-refresh`, and `scripts/ads-ops`.
- **Nex starting point:** `packages/adapters/meta-ads`.
- **Provider families:** accounts, campaigns, ad sets, ads, creatives, delivery, spend, conversions, placement, demographic, and hourly/daily breakdowns.
- **Typed consumers:** `fact_ad_delivery`, `fact_campaign_entity`, creative usage, attribution, and Overview.
- **Completion:** reproduce the full MoonSleep field matrix, creative/dark-post relationships, history windows, rate limits, and existing campaign/creative operations.

### 3. Meta organic, comments, and moderation

- **Current seams:** `ops-analytics-organic-snapshot-sync.py`, `scripts/instagram_comment_backfill_host.py`, and `workers/ops-refresh/src/moderation.ts`.
- **Nex starting point:** new adapter lane.
- **Provider families:** Instagram/Facebook profiles, pages, media, insights, comments, replies, attachments, hiding/deletion state, moderation decisions, and escalation receipts.
- **Typed consumers:** `fact_content_snapshot`, `fact_social_account_daily`, raw Instagram tables, comment and moderation tables.
- **Completion:** exhaustive history, stable revisions/deletions, attachment fidelity, comment lifecycle, and exact current hide/label/moderation actions.

### 4. Meta Conversions API

- **Current seams:** `workers/meta-capi` and `ops-analytics-meta-capi-ingest.py`.
- **Nex starting point:** new outbound/action adapter lane.
- **Provider families:** purchase, funnel, checkout, session, consent, identity-hash inputs, provider responses, and retry outcomes.
- **Completion:** deterministic event IDs, consent and hashing parity, bounded retries, partial-failure handling, and immutable provider receipts.

### 5. Google Ads

- **Current seams:** paid-media sync, `workers/shared/googleAds.ts`, and Google setup/update scripts.
- **Nex starting point:** `packages/adapters/google-ads`.
- **Provider families:** account through ad-level configuration and reporting, hourly/daily metrics, conversions, keywords, and settings.
- **Completion:** full GAQL field parity, decimal/timezone fidelity, conversion upload idempotency, and existing campaign/settings/keyword actions.

### 6. TikTok paid media

- **Current seams:** paid-media sync and shared ad tables.
- **Nex starting point:** `packages/adapters/tiktok-business`.
- **Provider families:** advertisers, campaigns, ad groups, ads, creatives, reports, breakdowns, and actions.
- **Completion:** complete rich fields, breakdowns, raw payloads, history, and current write operations.

### 7. TikTok organic

- **Current seams:** organic snapshot sync.
- **Nex starting point:** `packages/adapters/tiktok-display`.
- **Provider families:** profiles, videos, metrics, tokens, deletions, and revisions.
- **Completion:** complete pagination/history, token lifecycle, deletion semantics, and zero-versus-missing regression guards.

### 8. TikTok Shop

- **Current seams:** `domains/tiktok_shop.py`, `domains/marketplace_channels.py`, and five `ops-analytics-tiktok-*` scripts.
- **Nex starting point:** new adapter lane.
- **Provider families:** shops, OAuth, webhooks, orders, lines, customers, PII addresses, inventory, listings, aftersales, labels, tracking, and fulfillment feedback.
- **Completion:** signature validation, PII retention, full backfill, inventory/listing parity, labels, tracking, and existing fulfillment actions.

### 9. TikTok Events API

- **Current seams:** Meta CAPI worker shares this outbound path.
- **Nex starting point:** new outbound/action lane.
- **Completion:** the same consent, deterministic ID, retry, partial-failure, and provider-receipt standards as Meta CAPI.

### 10. Gmail and Google Workspace

- **Current seams:** authenticated `gog` consumers, international concierge, PO-box reply monitor, lifecycle notifications, and other Gmail-adjacent jobs.
- **Nex starting point:** `packages/adapters/gog`.
- **Provider families:** mailboxes, threads, messages, headers, MIME, attachments, labels, drafts, sends, forwards, and history cursors.
- **Identity rule:** sender and recipients resolve to entities and contacts; approved Tyler, Casey, MoonSleep, partner, and vendor identities remain distinct.
- **Completion:** approved mailbox/conversation allowlists, exact MIME and attachment hashes, history/PubSub incremental sync, entity sender/recipients, and preservation of draft/send/forward/label actions.

### 11. Mailchimp Marketing and Transactional

- **Current seams:** campaign attribution backfill, product-review email sender, and Dispatch lifecycle messaging.
- **Nex starting point:** new adapters with distinct Marketing and Transactional connections.
- **Provider families:** audiences, members, tags, campaign/e-commerce attribution, templates, sends, delivery receipts, and bounces.
- **Completion:** exact member/campaign history, identity projection, send idempotency, template parity, and provider readback. Modern Mailchimp Inbox SMS history is not available through the public Marketing API and must not be invented.

### 12. Mercury

- **Current seams:** `ops/bookkeeping-local/refresh_mercury_raw.py`, finance source poller, and creator payout surfaces.
- **Nex starting point:** new adapter lane.
- **Provider families:** accounts, balances, transactions, attachments, recipients, payments, and status history.
- **Typed consumers:** finance source evidence, cash/card reconciliation, and creator payout records.
- **Completion:** exact money, account, attachment, revision/removal, and binding fidelity; preserve gated recipient/payment operations without granting book, journal, or accounting authority.

### 13. Plaid and card-source boundary

- **Current seams:** `ops/bookkeeping-local/plaid_card_source.py`, finance poller, and browser-export evidence.
- **Nex starting point:** cleanroom candidate under `packages/adapters/plaid`.
- **Provider families:** items, accounts, balances, liabilities, and added/modified/removed transactions.
- **Completion:** explicit owner enablement, secure Link binding, cursor/webhook correctness, and reconciliation to statements or browser exports. Current Chase/Amex OAuth constraints remain explicit.

### 14. QuickBooks Online

- **Current seams:** ops-internal OAuth, API runtime handlers, `quickbooks_oauth_postgres.sql`, and bookkeeping tools.
- **Nex starting point:** new adapter lane.
- **Provider families:** encrypted connections, company info, queries, reports, accounts, transactions, and journal plans/readbacks.
- **Completion:** encrypted refresh flow, exact object/report revisions and pagination, preserved read previews, and only explicitly approved account/journal actions. QBO and MoonSleep accounting remain authoritative.

### 15. ShipEngine and ShipStation

- **Current seams:** Dispatch, Returns, tracking jobs, and `scripts/shipstation_fulfillment.py`.
- **Nex starting point:** new adapter lane.
- **Provider families:** carriers, rates, parcels, labels, label bytes, costs, tracking, customs, webhooks, voids, and returns.
- **Completion:** exact parcel/rate/currency fidelity, label hashes, verified webhooks, tracking replay, purchase/void idempotency, and current routing behavior.

### 16. Amazon SP-API

- **Current seams:** `domains/amazon_spapi_client.py`, `domains/amazon_marketplace.py`, and Amazon timers/scripts.
- **Nex starting point:** new adapter lane.
- **Provider families:** marketplace accounts, listings, offers, inventory, orders, lines, customer PII, and shipment confirmation.
- **Completion:** LWA/SigV4, complete pagination, PII expiry, raw payloads, and current quantity/shipment actions.

### 17. Alibaba Messenger

- **Current seams:** sanitized browser-export tooling and completed snapshots under `ops/alibaba-indexeddb-export`.
- **Nex starting point:** `packages/adapters/alibaba`.
- **Provider families:** suppliers, conversations, messages, senders, recipients, and attachments.
- **Completion:** preserve completed-snapshot intake, overlap/replay, attachment hashes, entity participants, and strict exclusion of browser session/authentication material.

### 18. First-party journey and RUM

- **Current seams:** storefront tracking, CAPI worker/ingest, and `analytics/sync.py`.
- **Nex starting point:** `packages/adapters/web-journey` and `packages/adapters/web-rum` scaffolds.
- **Provider families:** funnel, session, checkout, attribution, consent, and storefront performance events.
- **Completion:** real browser installation, stable event IDs, batching/retry behavior, and field-by-field parity with current event contracts.

### 19. Maritime AIS and inbound transport evidence

- **Current seams:** `ops-analytics-ais-sync.py`, `ops-analytics-inbound-transport-sync.py`, Supply Globe read models, and the `supply_transport_*` / `supply_vessel_*` tables.
- **Nex starting point:** new bounded transport-evidence adapter lane; do not fold it into commerce fulfillment.
- **Provider families:** reviewed vessel identities, AIS observations, voyage/leg evidence, source captures, transport milestones, and explicit source confidence.
- **Completion:** bind each observation to the reviewed vessel/source identity, preserve provider and observation clocks, retain exact source evidence and confidence, distinguish observed from projected vessel state, and reconcile the existing Supply Globe without creating inventory receipt, routing, payment, or supplier-communication authority.

## Later or bounded lanes

- **YouTube organic:** preserve API/RSS/yt-dlp fallback provenance, pagination, history, revisions, deletions, and freshness.
- **Coda:** low-priority workpaper source; either ingest stable doc/table/row revisions or explicitly retire after Postgres owns equivalent facts.
- **Cloudflare:** keep deployment/control authority separate; add only bounded analytics, rendering, queue, R2, or deployment-receipt sources when useful.
- **Vercel:** optionally ingest immutable deployment/build events; do not recreate the retired Git corpus.
- **GitHub:** existing Nex adapter may provide PR/run/release evidence later; it is not an operational-record substitute.
- **Gemini, OpenAI/Codex:** treat as model-call executors with prompt/model/input/output receipts rather than provider data adapters.
- **Anthropic:** catalog-only until a concrete MoonSleep consumer is confirmed.

## Credential-only and code-only discrepancies

Credential names were inventoried without reading values.

- Configured with no confirmed active connector: Stripe, EasyPost, Shippo, PayPal payouts, Anthropic, and some Vercel/GitHub capabilities.
- Connector code without locally confirmed credential names: Amazon SP-API, YouTube Data API, and an explicit ShipEngine key. Production host state may differ.
- Gmail uses `gog` OAuth state rather than ordinary environment variables.
- QBO company authorization is encrypted in MoonSleep storage.
- Plaid is presently owner-disabled/unconfigured.
- California and Florida tax portals are credentialed manual/compliance sources. Keep them as bounded, approval-gated portal evidence workflows rather than promoting them to a nineteenth primary adapter or granting Nex filing/payment authority.

## Dispatch waves

Provider lanes should be assigned narrowly; a single Meta or TikTok task is too broad.

1. Shopify customer/order vertical already in progress.
2. Gmail read/history and entity participants.
3. Meta paid, Google Ads, TikTok paid.
4. Meta organic/comments, TikTok organic, YouTube.
5. Mercury, Plaid/card, QuickBooks.
6. ShipEngine/ShipStation, Amazon, TikTok Shop.
7. Meta CAPI, TikTok Events API, first-party journey/RUM.
8. Mailchimp and Alibaba.

The exact order may change with business urgency, but every lane uses the same completion contract and does not retire its old executor early.

## Relationship to the jobs migration

Adapters produce committed records and durable source events. They do not themselves own every downstream action.

- polling and webhooks become adapter ingestion work;
- typed domain projectors subscribe to committed record events;
- periodic reconciliation remains a scheduled job;
- consequential provider writes remain separate, explicitly granted action jobs;
- current executors may remain shell, Worker, API, or service processes while Nex first owns definition, trigger, custody, idempotency, and receipts.

The separate MoonSleep job catalog maps every current timer and worker into that model.
