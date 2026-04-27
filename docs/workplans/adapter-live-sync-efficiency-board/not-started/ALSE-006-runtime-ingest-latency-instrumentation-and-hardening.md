# ALSE-006 Runtime Ingest Latency Instrumentation And Hardening

## Goal

Make the tenant runtime truthful and resilient under adapter ingest pressure.

## Scope

- add real request-latency instrumentation for hosted runtime handlers
- measure event-loop lag and ingest-path contention
- harden the ingest path where adapter chatter still amplifies runtime latency
- ensure cheap API reads stay responsive while monitors are active

## Acceptance

1. the runtime exposes truthful latency measurements for hosted request handlers
   instead of only pipeline averages
2. event-loop lag or equivalent runtime saturation signals are observable
3. cheap reads remain responsive during normal monitor load
4. any required runtime-side ingest hardening is captured in the validation
   corpus and proven on the MoonSleep hosted server

## Why This Exists

Even after replay work moved off the request path, the current tenant runtime
still suffers because adapter `record.ingest` traffic and API reads contend on
the same hot path.

April 27, 2026 hosted evidence:

- MoonSleep `runtime.db` grew to about `56GB` and filled the root disk
- the growth was dominated by runtime request/event telemetry:
  `bus_events` had about `60.6M` rows and `nexus_requests` had about `7.5M`
  rows before compaction
- compacting those telemetry tables recovered the server from effectively full
  disk to about `23%` used
- after compaction, the same tables quickly regrew under adapter ingest load;
  one short sample had about `91k` `bus_events` and about `10.7k`
  `nexus_requests`
- common event types included `nex.request.stage`, `acl.decision`,
  `nex.request.started`, `nex.request.completed`, and `record.ingested`
- runtime-side hardening needs a retention/TTL or bounded-ring posture for
  request/event traces, plus a lower-volume tracing policy for high-frequency
  `record.ingest`
- this ticket should also cover package-manager resilience when disk pressure
  exists; the Shopify upgrade extracted the release but did not complete the
  registry flip while the runtime was unhealthy
