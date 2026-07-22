# Alibaba Messenger Shadow Workload

**Last Updated:** 2026-07-22
**Related:** [Alibaba Messenger Evidence Adapter](../specs/alibaba-messenger-evidence-adapter.md)

---

## Current gap

MoonSleep has a complete browser export and extraction pipeline plus an initial Nex adapter, but it still needs a repeatable production capture package, complete replay proof, shared Gmail projection, and an operator-facing Partner Desk organized around independent open loops.

## Closure sequence

1. Package and validate the read-only snapshot adapter.
2. Add an authenticated persistent-browser collector that produces immutable, incremental snapshots.
3. Add content-addressed attachment storage and Linux document extraction.
4. Backfill normalized messages into a disposable Nex cleanroom.
5. Project every source record into an explicit coverage disposition and zero or more reviewed Partner Open Loops.
6. Prove one complete Surewal conversation and all attachments through two cleanroom ingests with zero duplication.
7. Backfill the complete Alibaba corpus twice and reconcile record, entity, contact, conversation, attachment, coverage, and loop counts.
8. Connect the shared Gmail substrate without collapsing provider-native threads.
9. Deploy dormant, run a bounded production cohort, then enable continuous capture only after restart/replay/staleness proof.
10. Add reply drafting and sending later as a separate reviewed authority phase.

## Exit criteria

The pilot is ready for a live shadow connection when all package tests pass, install/connect and bounded backfill/monitor lanes pass, raw session material is absent from Nex records, every source record has explicit coverage, duplicate replay is harmless across records and projections, capture survives model outages, and expired Alibaba authentication becomes a visible operator action instead of silent staleness.
