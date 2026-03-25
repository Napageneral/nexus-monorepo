# Frontdoor Internal Creator Bypass And Create Server Modal

**Status:** CANONICAL
**Date:** 2026-03-18

## Customer Experience

Frontdoor must support two distinct realities without mixing them:

1. normal customer accounts follow the hosted billing and free-tier rules
2. internal dogfooding creators must be able to provision and operate servers without getting blocked by customer billing limits

The product surface must stay honest:

- customer-facing server creation still presents `standard` vs `compliant`
- customer billing rules stay intact for normal accounts
- internal creator bypass is an infrastructure/operator capability, not a customer feature

The create-server modal must also be legible:

- `Standard` and `Compliant` choices must read cleanly
- copy must not overflow or collide
- the modal must explain the difference briefly, not with dense marketing text

## Canonical Internal Bypass Rule

The canonical internal bypass list is `frontdoor.devCreatorEmails`.

Hard cut:

- `devCreatorEmails` is not just an access hint
- `devCreatorEmails` is the canonical internal creator bypass for hosted provisioning and hosted billing enforcement

If a normalized user email is present in `frontdoor.devCreatorEmails`, Frontdoor must treat that creator as an internal dogfooding creator.

## Internal Creator Bypass Behavior

For internal dogfooding creators:

1. hosted server creation must not be blocked by:
   - `payment_required`
   - `free_tier_plan_limit`
   - `free_tier_server_limit`
2. app-driven zero-server provisioning must not be blocked by those same billing gates
3. hosted billing must not suspend active servers for an account whose owner/admin membership includes a `devCreatorEmails` user

This is an explicit product rule for internal operation. It is not a hidden one-off database edit.

## Account Scope

Billing suspension is account-scoped, so the bypass must also resolve at the account level.

Canonical account-level rule:

- if an account has an owner or admin member whose normalized email appears in `frontdoor.devCreatorEmails`, that account is treated as internally exempt from hosted billing enforcement

That rule is required so the hourly billing job and the create-server paths behave coherently for the same internal account.

## UI Contract

The create-server modal must use short copy only.

Canonical class copy:

- `Standard`: `Lower-cost general workloads.`
- `Compliant`: `Required for HIPAA-sensitive apps.`

The class choice controls must also override generic button whitespace rules so the copy wraps normally.

## Non-Goals

This spec does not:

- change customer billing rules
- expose an “internal creator” concept in the hosted UI
- add provider branding to the customer surface
- introduce backwards-compatibility paths

## Validation

Validation for this spec requires:

1. an internal creator email in `frontdoor.devCreatorEmails`
2. live server creation from that account with zero balance
3. no `free_tier_server_limit` or `payment_required` rejection for that internal creator
4. create-server modal text wrapping correctly on the hosted UI
