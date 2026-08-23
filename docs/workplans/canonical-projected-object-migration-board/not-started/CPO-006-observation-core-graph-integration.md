# CPO-006 — Observation and Core Graph Integration

**State:** not started
**Depends on:** CPO-005
**Repository:** Nex core

## Goal

Make direct Observation targeting and revision-linked Core Graph behavior
uniform consequences of canonical registration.

## Scope

- Validate target addresses, attribute paths, relationship slots, target types,
  and cardinality from the registry catalog.
- Allow registered target addresses before first materialization while returning
  a resolver miss until the first revision exists.
- Queue deterministic reprojection when accepted Observation heads change.
- Publish current and historical graph relationships from Object Revisions.
- Remove the need for MoonSleep per-object target adapters.

## Acceptance

- Every registered MoonSleep type is directly targetable without extra
  declaration.
- Observations never mutate object rows directly.
- Historical revision edges remain readable after head advancement.
- No graph edge implies external action authority.

## Validation

- First-materialization, successor, exact-replay, relationship replacement,
  set-cardinality, invalid-target, and historical-graph tests.
- Clean restart and SQLite/PostgreSQL parity.
