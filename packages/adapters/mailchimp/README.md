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

Every ingestion attempt writes an immutable sanitized history receipt with its
exact window, cap/continuity/debt/candidate/emitted/deduplicated counts, result class,
and output digest. Receipts never include recipient addresses, message bodies,
credentials, or raw provider error text.

Provider responses are retried only for throttling and transient server/network
failures, with bounded exponential backoff and request timeouts. Raw recipient
addresses are hashed before Nex ingestion and never appear in records or
receipts.
