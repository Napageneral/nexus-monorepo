# Changelog

## 0.2.3 (2026-09-05)

- `records.backfill.stage`: the staged form of an explicit backfill window, for
  the Nex runtime's worker-side historical import (the remote job worker runs
  only adapters that implement it). The same reads, records, identities, order
  and receipt as `records.backfill`, written as JSONL chunk files
  (`chunk-NNNNN.jsonl`, `backfill_stage_chunk_records` per file, default 1,000)
  with a `manifest.json` (version 1, `jsonl_files`) that lists a chunk only once
  it is closed and is replaced atomically, so the runtime imports chunks while
  the rest of the window is still being staged. The manifest is the method's
  result; its `mailchimp` block carries the window, the chunk size, `complete`
  and a cursor (last record id and timestamp, campaign id). A window that fails
  part way keeps the closed chunks listed and never lists the partial one.
- Records leave every run in non-decreasing timestamp order: the Transactional
  history is read first and merged into the campaigns, which are emitted oldest
  first whatever order the provider lists them. A run the runtime resumes from
  the last imported record's timestamp therefore continues where it stopped
  (`since` is the resume point; the campaign listing starts one second early so
  a campaign sent in that second is read again and dedupes by identity). As a
  consequence a window the export cannot cover now fails closed before any
  record is emitted.
- Transactional export rows no longer carry the export id in their metadata
  (the receipt's `transactional_export_id` keeps that provenance): the immutable
  store hashes record metadata into the row identity, so a row served by a
  second export (a resumed run, a window with other bounds) now dedupes instead
  of landing as a second revision under the same provider id.
- Receipts (`nexus_mailchimp_ingestion_run_v3`, additive) carry `transport`
  (`stream` or `staged`) and, for staged runs, `stage_chunk_records` and
  `stage_chunk_count`.
- Contract: ten read-only methods; `records.backfill.stage` is declared in the
  package manifest like the other adapters that stage (the runtime owns the id
  and never registers it as a catalog method).

## 0.2.2 (2026-09-04)

- Explicit backfill windows use the Transactional activity export whenever the
  recent search is capped or the window starts beyond the search horizon
  (`transactional_search_horizon_days`, default 7): checkpointed export id,
  search-identity reuse for rows the search also returned, one emission per
  provider record id, closed failure when the export returns fewer rows than
  the search saw, replacement of a checkpointed export the provider no longer
  knows, no retry of Mailchimp application errors.
- `mailchimp.backfill.plan`: read-only window plan (campaigns, record and
  read-call estimates, Transactional path) without creating an export.
- Receipts move to `nexus_mailchimp_ingestion_run_v3`; recorded-fixture
  provider stub for the tests and lab rehearsals.

## 0.2.1 and earlier (2026-08-14 to 2026-08-17)

- Read-only Marketing and Transactional history adapter: hourly monitor with a
  durable closed-window cursor, capped current-tail admission, recipient email
  hashing, sanitized ingestion receipts, receipt-backed runtime installer.
