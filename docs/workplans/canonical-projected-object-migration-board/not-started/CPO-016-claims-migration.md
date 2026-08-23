# CPO-016 — Claims Migration

**State:** not started
**Depends on:** CPO-013
**Repositories:** Nex core, MoonSleep

## Goal

Move Carrier Incident, Carrier Case, Carrier Recovery Receipt, and approved
Claims identities onto the generic projected-object substrate.

## Scope

- Consolidate provider case, support ticket, intervention, investigation, and
  retrieval-case language into Carrier Case profiles.
- Treat provider events, source communications, audit waves, and value proofs
  according to the canonical eligibility test.
- Project Claims state from accepted Observations with exact Dispatch and
  Finance relationships.
- Remove Claims-specific resolver and target-adapter authority.

## Acceptance

- One Carrier Case identity covers the approved provider process profiles.
- Recovery requires exact receipt identity and does not follow provider status
  alone.
- Unresolved shipment references remain evidence, not invented packages.
- Claims projection grants no provider action authority.

## Validation

- Full 15-label Claims corpus, case-profile transitions, recovery reconciliation,
  missing-reference, replay, and cross-domain relationship tests.
