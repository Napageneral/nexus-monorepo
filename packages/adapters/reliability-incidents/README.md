# Reliability Incidents Adapter

The Reliability Incidents adapter is a first-party Nex source adapter for portable operational reliability evidence.

Each source instance becomes one Nex reliability channel. Each incident becomes a thread. Each lifecycle transition becomes one immutable external record. An exact replay is suppressed. Same-event corrections are retained as Nex record revisions; operator-visible corrections should use a new `updated` event so the correction is independently searchable in the incident timeline.

The adapter is push-based and exposes two source-owned commands through `adapter.serve.start`:

- `incident.capture`
- `incident.capture.batch`

`incident.capture.batch` accepts `replay: true` next to `incident_events` for compatibility with the 0.1.x producer and replay operator. Since 0.1.2 the adapter keeps no ledger of its own: every event is emitted, and the runtime's immutable Record store dedupes by identity (platform, connection, provider record id, payload digest), so re-delivering retained source history (an outbox the source never deletes) is always safe: an exact replay is a store-side no-op, changed content for the same event id is a new record. The batch result still reports `emitted`, `deduped`, `revised`, and `replayed`; the last three are always 0.

Runtime connection configuration requires:

```json
{
  "source_id": "moonsleep-production",
  "display_name": "MoonSleep Production",
  "environment": "production"
}
```

The canonical source payload is documented in [the JSON Schema](./api/incident-transition.schema.json) and [the package spec](./docs/specs/reliability-incidents-adapter.md).

The adapter has no remote-mutation methods. It cannot restart a service, deploy code, acknowledge an incident at the source, or execute remediation.
