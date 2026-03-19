# Frontdoor Server Class Pricing And Create Flow

**Status:** Active  
**Date:** 2026-03-19

## Customer Experience

Frontdoor server creation must make the commercial difference between `standard` and `compliant` obvious.

The customer must immediately understand:

1. `standard` is the cheaper default path
2. `compliant` is the regulated premium path
3. prices are shown in dollars
4. switching server class changes the visible plan prices
5. clicking create may take a short time before the new server detail appears

The current surface fails that bar because it shows:

- euro prices
- standard pricing even when `compliant` is selected
- weak progress feedback during the create request

## Canonical Pricing Model

Frontdoor plan pricing is product-owned and expressed in USD cents.

Canonical `standard` monthly prices:

- `cax11`: `$40/mo`
- `cax21`: `$60/mo`
- `cax31`: `$100/mo`

Canonical `compliant` monthly prices:

- `cax11`: `$400/mo`
- `cax21`: `$600/mo`
- `cax31`: `$1000/mo`

This is a hard cut.

No euro display remains on the hosted customer surface.

Customer-facing size labels are:

- `cax11`: `Small`
- `cax21`: `Medium`
- `cax31`: `Large`

Internal plan ids remain unchanged.

## Canonical Billing Rule

Hourly billing must derive from the same pricing model used by the create-server modal.

That means billing is no longer keyed only by `plan`.

Billing must be keyed by:

1. `server_class`
2. `plan`

If UI pricing and hourly billing disagree, the platform is lying. That is not acceptable.

## Plan Resolution

The `/api/plans` route must resolve plans by requested server class.

Canonical behavior:

- `GET /api/plans?server_class=standard` returns standard plan pricing
- `GET /api/plans?server_class=compliant` returns compliant plan pricing
- if `server_class` is omitted, Frontdoor defaults to `standard`

Returned payload should use USD-cent pricing fields that the hosted UI can render without provider-specific currency logic.

## Create Modal UX

The create-server modal must not look stuck after the user clicks create.

Canonical behavior:

1. disable inputs while the request is being submitted
2. show explicit progress copy inside the modal:
   - `Submitting provisioning request…`
   - `This can take 10–20 seconds.`
3. once the API returns the new server id:
   - close the modal
   - navigate to the server detail
   - show server-level provisioning status there

The create modal is not responsible for long-lived provisioning progress.  
It is responsible for making the initial request feel intentional rather than frozen.

## Non-Goals

This spec does not:

- redesign the entire billing system
- change plan ids
- expose raw provider brands in the customer UI
- add backward-compatibility pricing fields

## Validation

Validation for this spec requires:

1. `standard` plan cards show `$40`, `$60`, `$100`
2. `compliant` plan cards show `$400`, `$600`, `$1000`
3. switching class re-renders prices immediately
4. create modal shows explicit submission/provisioning copy while waiting
5. customer-facing plan labels show `Small`, `Medium`, `Large`
6. hourly billing derives from server class plus plan rather than plan alone
