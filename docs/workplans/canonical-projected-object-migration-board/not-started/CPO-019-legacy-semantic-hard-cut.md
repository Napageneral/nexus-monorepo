# CPO-019 — Legacy Semantic Hard Cut

**State:** not started
**Depends on:** CPO-014, CPO-015, CPO-016, CPO-017, CPO-018
**Repositories:** Nexus umbrella, Nex core, MoonSleep

## Goal

Delete superseded semantic architecture after every owning family has completed
its canonical cutover.

## Scope

- Retire object-registry v1 and publish v2 as the sole semantic registry.
- Delete the separate Observation target-adapter declaration system.
- Delete MoonSleep per-object target adapters and hard-coded resolver branches.
- Remove active compatibility objects, fallback readers, duplicate graph heads,
  and semantic writers.
- Retain only generated historical vocabulary decoding, exact instance aliases,
  source custody, and optional non-authoritative read models.
- Regenerate human-readable catalogs from v2.

## Acceptance

- Source searches find no active per-object MoonSleep resolver or target-adapter
  declaration.
- No read model, receipt, evidence row, or compatibility noun is a registry
  entry.
- All supported historical packets replay through the generated decoder.
- Domain tables retained for performance are demonstrably non-authoritative.

## Validation

- Dead-code and declaration census, exhaustive historical replay, no-fallback
  fault injection, clean bootstrap, and full regression suite.
