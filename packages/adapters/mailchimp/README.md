# Mailchimp adapter

This package ingests read-only communication evidence from Mailchimp Marketing
and Mailchimp Transactional into Nex. It exposes bounded provider reads for
campaigns, campaign content, recipient activity, Transactional messages, and
Transactional templates.

There is deliberately no send, campaign mutation, template mutation, contact
mutation, or remote-delete method. Recipient email addresses are normalized to
SHA-256 identities before records enter Nex; raw addresses remain available
only in direct provider read responses to an authorized caller.

The two provider products use separate credential fields:

- `marketing_api_key` (or `MAILCHIMP_API_KEY`)
- `transactional_api_key` (or `MAILCHIMP_TRANSACTIONAL_API_KEY`)

The hourly monitor bootstraps from a bounded 48-hour window, then advances a
durable closed-window cursor with a five-minute restart overlap. Marketing
campaign content is stored once; per-recipient delivery evidence refers to that
campaign record instead of repeating HTML thousands of times.

Transactional current-tail ingestion uses a durable overlapping cursor.
Mailchimp caps each recent search response at 1,000 messages and its date
filters are day-granular, so a capped response is admitted only when its oldest
message still overlaps the previous durable cursor. A lost overlap fails closed
without advancing the cursor. A first-run capped tail may establish a current
high-water, but the receipt explicitly records the inaccessible historical
portion as backfill debt instead of claiming it complete. Stable provider
message and revision identity deduplicates the overlapping reads.

Explicit backfills (`records.backfill`) promise historical coverage, so the
recent search vouches for a window only when it is uncapped and the window
starts inside the search horizon (`transactional_search_horizon_days`, default
7). Otherwise the adapter pulls the provider's activity export for the same
whole days, checkpoints the export id before polling, and emits one record per
row. Rows the search also returned reuse the search identity
(`transactional:<message id>`, correlated on send second, recipient hash, and
subject); rows only the export knows land under a stable export identity
(`transactional:export:<sha256>`), because Mailchimp's activity export carries
no message id. An export that returns fewer rows than the search saw fails the
run closed with that reason instead of truncating silently. Every emitted
provider record id is emitted once per run.

`mailchimp.backfill.plan` is a read that reports, for a window, the sent
campaigns, the record and read-call estimates, and which Transactional path
the window would take; it never creates an export and writes no state.

Every ingestion attempt writes an immutable sanitized history receipt
(`nexus_mailchimp_ingestion_run_v3`) with its exact window and mode, the
campaign and recipient counts, the Transactional source (search or export),
export id and reason, cap/continuity/debt/candidate/row/matched/emitted/
deduplicated counts, result class, and output digest. Receipts never include
recipient addresses, message bodies, credentials, or raw provider error text.

Provider responses are retried only for throttling and transient server/network
failures, with bounded exponential backoff and request timeouts. Raw recipient
addresses are hashed before Nex ingestion and never appear in records or
receipts.
