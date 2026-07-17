# Nexus Alibaba Messenger Adapter

This package projects authenticated Alibaba Messenger exports into canonical Nex records. It is deliberately read-only: it has no supplier-message, order, payment, routing, or inventory mutation methods.

The browser collector is owned by MoonSleep because the authenticated browser profile and supplier evidence are MoonSleep operational data. The adapter consumes only completed snapshot directories and removes raw encrypted account fields, chat tokens, signed attachment URLs, and other session material before emitting records.

## Runtime configuration

```json
{
  "snapshot_root": "/var/lib/moonsleep/alibaba/snapshots",
  "repo_root": "/srv/moonsleep-v1",
  "account_label": "MoonSleep Alibaba",
  "account_id": "moonsleep-alibaba",
  "poll_interval_ms": 900000,
  "monitor_overlap_ms": 259200000,
  "attachment_text_limit": 30000
}
```

The monitor intentionally re-emits a rolling overlap window. Nex owns canonical deduplication by `(platform, external_record_id)`, so this provides at-least-once restart behavior without trusting an adapter-local cursor that could advance before durable persistence.

## Development

```bash
npm install
npm test
npm run lint
npm run build
nexus package validate .
```
