# Reliability Incidents Adapter

The Reliability Incidents adapter is a first-party Nex source adapter for portable operational reliability evidence.

Each source instance becomes one Nex reliability channel. Each incident becomes a thread. Each lifecycle transition becomes one immutable external record. An exact replay is suppressed. Same-event corrections are retained as Nex record revisions; operator-visible corrections should use a new `updated` event so the correction is independently searchable in the incident timeline.

The adapter is push-based and exposes two source-owned commands through `adapter.serve.start`:

- `incident.capture`
- `incident.capture.batch`

`incident.capture.batch` accepts `replay: true` next to `incident_events`. It bypasses the adapter's own exact-replay suppression for that batch so retained source history (an outbox the source never deletes) can be re-delivered after the adapter state has already seen it; the runtime's immutable Record store still dedupes by identity, the adapter still records each acceptance, and an event id reused for a different incident is still rejected. The batch result reports `replayed` (events the suppression would have dropped) next to `emitted`, `deduped`, and `revised`.

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
