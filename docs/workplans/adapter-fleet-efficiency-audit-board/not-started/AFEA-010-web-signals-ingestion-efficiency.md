# AFEA-010 Web Signals Ingestion Efficiency

## Goal

Make `web-journey` and `web-rum` efficient under high event volume without
weakening event coverage.

## Current Gap

`web-journey` performs per-event SQLite dedupe work and has no visible pruning
policy. `web-rum` relies on event ids for external record ids but does not
perform adapter-local dedupe for duplicate browser sends before ingest.

Primary files:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/src/adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/companion-pixels/index.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-rum/src/adapter.ts`

## Scope

- reuse SQLite connections and prepared statements for web-journey dedupe
- wrap batch dedupe writes in transactions
- add TTL or count-based pruning for dedupe stores
- add bounded batch policy for maximum events and payload bytes
- add web-rum duplicate-event suppression and tests
- bound companion-pixel browser memory with TTL or max size

## Acceptance

1. duplicate browser sends do not produce duplicate ingest traffic
2. batch ingest cost is bounded and benchmarked
3. dedupe stores do not grow forever
4. large-batch partial failure semantics are documented and tested

