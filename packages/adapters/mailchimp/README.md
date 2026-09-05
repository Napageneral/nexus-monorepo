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

`records.backfill.stage` is the staged form of the same window, for the Nex
runtime's worker-side historical import (the runtime's remote job worker runs
only adapters that implement it). It performs the same reads and emits the same
records, identities and receipt as `records.backfill`, but writes them as JSONL
chunk files under `stage_dir` (`chunk-NNNNN.jsonl`, `backfill_stage_chunk_records`
records each, default 1,000) with a `manifest.json` in the runtime's version-1
`jsonl_files` shape. A chunk is listed only once it is closed and the manifest
is replaced atomically, so the runtime imports chunks while the rest of the
window is still being staged; the manifest is the method's result and its
`mailchimp` block carries the window, the chunk size, `complete` and a cursor
(last record id and timestamp, campaign id). `stage_dir` must be empty or
absent (a temporary directory is created when it is omitted). A window that
fails part way keeps its closed chunks listed and never lists the partial one.

```bash
./dist/index.js records.backfill.stage --connection <connection-id> \
  --payload-json '{"since":"2026-02-01T00:00:00Z","to":"2026-08-23T21:53:00Z","stage_dir":"/path/to/empty/dir"}'
```

Every run emits its records in non-decreasing timestamp order: the
Transactional history is read first and merged into the campaigns, which are
emitted oldest first whatever order the provider lists them. The runtime resumes
an interrupted backfill from the last imported record's timestamp, and that
order makes the resume exact: everything before the resume point is already
stored, and the records at the resume second are read again and dedupe by
identity (the immutable store keys rows on platform, connection, account,
provider record id, version ref and payload digest, so an identical replay
creates no row and changed recipient activity creates a new row under the same
provider id). Rerunning a whole window is therefore always safe.

Every ingestion attempt writes an immutable sanitized history receipt
(`nexus_mailchimp_ingestion_run_v3`) with its exact window, mode and transport
(`stream` or `staged`, with the chunk size and count), the
campaign and recipient counts, the Transactional source (search or export),
export id and reason, cap/continuity/debt/candidate/row/matched/emitted/
deduplicated counts, result class, and output digest. Receipts never include
recipient addresses, message bodies, credentials, or raw provider error text.

Provider responses are retried only for throttling and transient server/network
failures, with bounded exponential backoff and request timeouts. Raw recipient
addresses are hashed before Nex ingestion and never appear in records or
receipts.
