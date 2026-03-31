# WIB-002 Collector Ingest And Durable Records

## Status

Completed.

## Outcome

The shared collector ingest and durable record scaffold now exists at:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/app.nexus.json`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/hooks/install.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/methods/index.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/app/methods/store.ts`

## Resolution

The collector app now accepts and stores canonical website events with:

- single-event ingest
- batch ingest
- contract validation
- `received_at`
- `website_installation_id`
- deduplication by installation scope plus `event_id`
- durable sqlite-backed storage

The collector remains focused on preservation and transport, not attribution
decisions.

