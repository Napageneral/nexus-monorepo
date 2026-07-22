# Nexus Alibaba Messenger Adapter

This package projects MoonSleep's authenticated Alibaba Messenger browser captures into canonical Nex records. It is deliberately read-only: it has no supplier-message, order, payment, routing, or inventory mutation methods.

The browser collector is owned by MoonSleep because the authenticated browser profile and supplier evidence are MoonSleep operational data. The adapter consumes only the sanitized `adapter/` projection of a completed snapshot. Matching root and adapter completion receipts bind every projection file's digest and count. Raw encrypted account fields, chat tokens, signed attachment URLs, cookies, and other session material are never adapter input.

## Runtime configuration

```json
{
  "snapshot_root": "/var/lib/moonsleep/alibaba/snapshots",
  "object_root": "/var/lib/moonsleep/alibaba/objects",
  "account_label": "MoonSleep Alibaba",
  "account_id": "moonsleep-alibaba",
  "poll_interval_ms": 900000,
  "monitor_overlap_ms": 259200000,
  "attachment_text_limit": 30000
}
```

The monitor intentionally re-emits a rolling overlap window. Nex owns canonical deduplication by `(platform, external_record_id)`, so this provides at-least-once restart behavior without trusting an adapter-local cursor that could advance before durable persistence. Historical backfill accepts exact `--since` and optional `--to` bounds.

## Source boundary

Alibaba's Open Platform is not part of this release. The known-complete source is the existing authenticated browser capture. Capture produces immutable raw evidence and a separate sanitized projection; only the projection crosses into Nex.

Each emitted record preserves the exact sanitized provider JSON line plus its SHA-256 inside the adapter-defined payload. Nex metadata contains only provenance and revision fields. Attachment bytes are read only from the sealed snapshot/object roots and must match their recorded digest.

## Development

```bash
npm install
npm test
npm run lint
npm run build
nexus package validate .
```
