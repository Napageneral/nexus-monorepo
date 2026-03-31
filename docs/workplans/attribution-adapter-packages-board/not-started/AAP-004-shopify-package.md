# AAP-004 Shopify Package

## Goal

Land the shared Shopify backend outcome package for attribution products in
Nex.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/shopify-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-intelligence-board/in-progress/AIL-002-moonsleep-parity-matrix-for-core-attribution.md`

## Current Gap

- no shared Shopify package exists today
- row-level order and line-item truth are not available as a shared contract
- checkout-surviving bridge evidence is not yet preserved in a reusable way

## Acceptance

1. a shared Shopify package exists and is installable
2. setup, health, backfill, and monitor all work through Nex
3. order and line-item row families are emitted with provider-native ids
4. bridge evidence passthrough is preserved without app-specific remapping
5. cleanroom validation proves real credentialed ingest
