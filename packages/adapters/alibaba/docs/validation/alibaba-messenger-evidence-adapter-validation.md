# Alibaba Messenger Evidence Adapter Validation

**Status:** VALIDATION
**Last Updated:** 2026-07-22
**Related:** [Alibaba Messenger Evidence Adapter](../specs/alibaba-messenger-evidence-adapter.md)

---

## Required proof lanes

### Package proof

Pass when tests, TypeScript checks, build, package validation, and release packaging succeed from a fresh dependency install.

### Install and connect proof

Pass when a disposable Nex runtime installs the package, binds a read-only connection to a fixture snapshot root, and reports the latest complete snapshot without exposing a remote mutation method.

### Backfill and monitor proof

Pass when bounded backfill emits only records inside the requested `since`/`to` window, monitor replays a rolling overlap, repeated external record ids remain stable, and an incomplete snapshot is ignored.

### Evidence safety proof

Pass when message text and extracted document text are searchable, attachments carry verified SHA-256 values, exact sanitized provider JSON plus its digest survives in opaque payload, and emitted records contain no raw capture objects, chat tokens, encrypted session identifiers, cookies, or signed provider URLs.

Every sealed attachment row must have one exact disposition: linked to its captured parent message, or emitted as explicit unresolved orphan evidence. The sum of linked and orphan attachment records must equal the sealed receipt count.

### Failure proof

Pass when missing snapshots, disagreeing completion receipts, digest/count drift, unsafe file metadata, invalid timestamps, expired browser authentication, and attachment extraction failures are surfaced explicitly. Capture and canonical raw-record ingest must not depend on successful interpretation.

### Agent-use proof

Pass when a cleanroom job can search a known supplier statement, retrieve the supporting message and attachment hash, and produce only a proposed source-linked claim.

## Human-shaped golden journey

1. Start a fresh runtime and install the Alibaba adapter package.
2. Bind the fixture connection and run a bounded backfill.
3. Search for `Vessel booking and ETA` and inspect the exact supplier message and attachment SHA-256.
4. Add a newer snapshot containing one new message and one repeated message.
5. Run monitor once and verify stable external ids allow Nex to persist only the new canonical record.
6. Stop Partner Desk projection, add another supplier message, and verify capture plus Nex ingest continue.
7. Restore projection and verify the backlog produces reviewed open-loop proposals with complete source coverage and no business mutation.

The primary proof artifact should retain the cleanroom command transcript, package identity, record search output, duplicate readback, and the proposed claim with its evidence links.

## Current proof receipt — 2026-07-17

Passed:

- package tests, TypeScript check, build, and `nexus package validate`
- disposable Docker cleanroom install plus two identical bounded protocol backfills
- stable `message:cleanroom-message-1` external id and stable attachment SHA-256 across replay
- incomplete-snapshot exclusion and raw session-material exclusion
- direct read-only projection of the current completed MoonSleep snapshot: 61 records and 14 attachments

Not yet claimed:

- package installation and connection creation inside a disposable full Nex runtime
- ingestion into the live Nex record store, live search readback, or live monitor registration
- VPS capture/authentication proof or production timer activation

Those remaining lanes require a committed production source revision and the one-time Alibaba browser authentication ceremony. They do not authorize supplier, payment, routing, inventory, or promise mutations.
