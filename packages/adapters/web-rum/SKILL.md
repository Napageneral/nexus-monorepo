# Web RUM Adapter

Use this package for browser runtime telemetry ingest in the `web-rum`
sibling source-adapter family.

## What this package owns

- `web_installation_id`-bound adapter connection identity
- `capture` and `capture.batch`
- canonical browser runtime telemetry ingest
- `record.ingest` emission for normalized RUM rows
- freshness semantics for recent browser telemetry

## What this package does not own

- installation lifecycle and token issuance
- control-plane origin policy
- journey-event semantics
- attribution scoring or dashboard UX
- non-browser service telemetry

Keep the package distinct from `web-signals` and `web-journey`.
