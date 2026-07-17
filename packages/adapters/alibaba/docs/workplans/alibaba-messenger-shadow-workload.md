# Alibaba Messenger Shadow Workload

**Last Updated:** 2026-07-17
**Related:** [Alibaba Messenger Evidence Adapter](../specs/alibaba-messenger-evidence-adapter.md)

---

## Current gap

MoonSleep has a complete manual export and extraction pipeline but no unattended browser capture, shared content-addressed evidence store, canonical Nex projection, durable interpretation job, or operator-facing quarantine queue.

## Closure sequence

1. Package and validate the read-only snapshot adapter.
2. Add an authenticated persistent-browser collector that produces immutable, incremental snapshots.
3. Add content-addressed attachment storage and Linux document extraction.
4. Backfill normalized messages into a disposable Nex cleanroom.
5. Add a MoonSleep interpretation job with subscription-first Codex execution and narrowly classified API fallback.
6. Persist proposed claims with evidence links and explicit quarantine reasons.
7. Prove restart, overlap replay, inference outage, and authentication-expiry behavior.
8. Deploy as a shadow workload with all remote and business mutations disabled.

## Exit criteria

The pilot is ready for a live shadow connection when all package tests pass, the cleanroom install/connect and backfill/monitor lanes pass, raw session material is absent from Nex records, duplicate replay is harmless, capture survives model outages, and expired Alibaba authentication becomes a visible operator action instead of silent staleness.
