# Changelog

## 0.1.2 (2026-09-08)

- The adapter keeps no dedupe ledger (Nex P-9.3 item 4): the SQLite file
  `reliability-incidents.sqlite` under `NEXUS_ADAPTER_STATE_DIR` is neither
  created nor read, and the state directory is no longer required for capture.
  Every event is emitted; the runtime's immutable Record store dedupes by
  identity (platform, connection, provider record id, payload digest), so an
  exact replay is a store-side no-op and changed content for the same event id
  is a new record, exactly what the ledger produced. Measured before the change
  on the production store: 22,458 records over 22,448 distinct provider ids
  against 22,120 ledger rows; the producer delivers each event once from its
  outbox, so the ledger only ever short-circuited the retry of a failed batch.
- `incident.capture.batch` still accepts `replay: true` and still reports
  `emitted`, `deduped`, `revised` and `replayed`; the last three are always 0.
- Health no longer reports `last_event_at` (it came from the ledger).
- The adapter-side identity-drift rejection (an event id reused for a different
  incident or source) is gone with the ledger; the producer's outbox owns
  event-id uniqueness.
