# web-journey

Use this adapter when you need first-party web journey ingest into Nex.

This is a source adapter. It owns a canonical first-party ingest contract, not
a provider-backed surface.

It owns:
- canonical browser journey event ingest
- `web_installation_id`-bound connection setup
- live freshness semantics for push-based browser events
- `record.ingest` emission for normalized web events
- journey metadata preservation for handoff and attribution evidence

It does not own:
- installation lifecycle and sender-token issuance
- attribution logic or reporting UI
- browser performance telemetry

Those belong to the `web-signals` and `attribution` apps.
