# AAP-001 Meta Ads Package Parity

## Goal

Align the shared `meta-ads` package with the canonical Meta Ads adapter spec.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/meta-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/proposals/attribution-adapters/meta-ads-record-mapping.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/meta-ads-row-parity-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/meta-ads/docs/specs/ADAPTER_SPEC_META_ADS.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`

## Current Gap

- Meta parity is now established across implementation, cleanroom validation,
  provider-row parity, and package-local signoff material
- detailed execution now lives in:
  - `/Users/tyler/nexus/home/projects/nexus/docs/workplans/meta-ads-row-parity-board/README.md`

## Board Snapshot

- `MAP-001` complete: row families and row-shaped builders are landed
- `MAP-002` complete: revision-aware record identity and richer payload mapping
  are landed
- `MAP-003` complete: replay-safe backfill and monitor semantics are landed
- `MAP-004` complete: MoonSleep credential validation proves the runtime path
- `MAP-005` complete: package docs, validation corpus, and signoff are synced

## Acceptance

1. `meta-ads` emits the required Meta Ads row families from the canonical spec
2. provider-native ids and action payloads are preserved
3. setup, health, backfill, and monitor all use the same runtime connection
   model
4. package docs and validation align with the canonical spec
5. cleanroom validation proves real credentialed ingest

## Status

This ticket is complete. The next provider lane can start.
