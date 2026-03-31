# Shopify Adapter Workplan

**Status:** COMPLETE
**Spec:** `docs/specs/ADAPTER_SPEC_SHOPIFY.md`
**Validation:** `docs/validation/SHOPIFY_ADAPTER_VALIDATION.md`

## Customer Goal

Keep `shopify` as the shared adapter package for Shopify order and fulfillment
ingest.

The package should:

- use Nex-managed connection identity
- backfill and monitor canonical Shopify order and line-item rows
- retain checkout bridge evidence as metadata
- remain installable and restart-safe as a shared package

## Current Package Scope

Current target surface:

- `adapter.info`
- `adapter.health`
- `adapter.connections.list`
- `adapter.monitor.start`
- `records.backfill`

## Active Work Surface

There is no active architecture rewrite in scope.

The package is now at steady-state completeness and contract truthfulness:

- keep `connection_id` canonical
- keep shop and order ids as provider metadata
- keep row-shaped Shopify records stable
- keep bridge evidence and downstream attribution fields explicit
- keep managed-profile behavior product-agnostic
- keep package-local docs current
- keep the runtime caveat tracked outside the adapter package itself

## Reopen Conditions

Open a new implementation slice only if one of these becomes true:

- storefront or app-specific credential URLs reappear
- `connection_id` stops being the operational identity
- backfill and monitor diverge
- row shape regresses or drops bridge evidence
- package install, health, or restart rehydration regresses
