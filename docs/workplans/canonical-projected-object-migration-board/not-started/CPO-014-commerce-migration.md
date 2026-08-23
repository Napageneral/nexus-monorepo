# CPO-014 — Commerce Migration

**State:** not started
**Depends on:** CPO-013
**Repositories:** Nex core, MoonSleep, commerce packages

## Goal

Move MoonSleep Commerce Order, Order Line, Refund, Return Case, and approved
supporting identities onto the generic projected-object substrate.

## Scope

- Reconfirm object eligibility and consolidated relationship vocabulary.
- Register complete canonical declarations.
- Project from provider Records, Facts, and accepted Observations.
- Preserve provider IDs as evidence and stable identity inputs without making
  provider tables semantic owners.
- Cut canonical reads and remove duplicate semantic heads.

## Acceptance

- Customer, Contact, and Entity identities remain native and are not copied.
- Orders retain exact provider lineage, revisions, lines, refunds, and
  fulfillment relationships.
- Current ingestion and historical replay converge idempotently.
- Provider writes remain outside projection authority.

## Validation

- Bounded current and historical cohorts, guest/deleted/customer-change cases,
  restart, replay, provider-free reproject, and source/read parity.
