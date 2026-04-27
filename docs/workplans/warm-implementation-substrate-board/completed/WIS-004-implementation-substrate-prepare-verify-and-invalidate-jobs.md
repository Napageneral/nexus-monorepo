# WIS-004 Implementation Substrate Prepare, Verify, And Invalidate Jobs

## Goal

Make warm substrate preparation a first-class Nex job boundary instead of an
implicit worker bootstrap side effect.

## Scope

- add `implementation_substrate.prepare`
- add `implementation_substrate.verify`
- add `implementation_substrate.invalidate`
- deduplicate concurrent prep for the same substrate key
- publish receipts and health state suitable for Dispatch to depend on

## Acceptance

- Nex can prepare, verify, and invalidate warm implementation substrates
  through explicit job primitives
- concurrent requests for the same substrate key do not repeat equivalent prep
  work unnecessarily
- the resulting prepared substrate has durable health and receipt state
