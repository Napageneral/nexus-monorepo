# CPO-017 — Finance Migration

**State:** not started
**Depends on:** CPO-013
**Repositories:** Nex core, MoonSleep Finance

## Goal

Move approved Finance domain objects onto uniform projected identity and
revision semantics while preserving ledger and provider action custody.

## Scope

- Review and register Financial Account, Cash/Card Account, Financial
  Transaction, Invoice, Invoice Line, Payment, Payment Application, Journal
  Entry, Journal Line, and Accounting Period as approved.
- Reduce Invoice Revision and other duplicated revision nouns to generic Object
  Revisions unless independent identity survives review.
- Remove Finance-local semantic Observation authority and source-record bridge
  objects.
- Project from Nex Records, Facts, and Observations; preserve ledger/provider
  readbacks as evidence.

## Acceptance

- One canonical semantic history exists per Finance object.
- Credit memos remain Invoice profiles and payment allocations remain declared
  relationships/supporting objects according to the approved model.
- Posting, payment, and provider authority remain separate from projections.
- Reconciliation and close reads retain exact monetary and source lineage.

## Validation

- AP, payment matching, transaction revision, journal balance, period close,
  late evidence, replay, restart, and source-ledger parity suites.
