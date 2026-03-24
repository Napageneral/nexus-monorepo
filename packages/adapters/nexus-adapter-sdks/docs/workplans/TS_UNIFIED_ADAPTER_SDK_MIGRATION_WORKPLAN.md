# TS Unified Adapter SDK Migration Workplan

## Purpose

Migrate the remaining TypeScript adapters onto the unified TS SDK authoring
surface after the method-first outward hard cut.

## Customer Experience

After this tranche, a TS adapter author should see the same top-level shape in
Telegram, Discord, and WhatsApp:

- `defineAdapter(...)`
- SDK-derived `adapter.info`
- single-source outward method declaration
- shared credential/target/retry/record helpers

The author should not see:

- bundled outward channel-operation-style authoring
- a second `delivery`-first outward surface

## Scope

This tranche covers:

1. `discord`
2. `whatsapp`
3. `telegram`

It does not include:

- Go SDK cutover
- work/content adapter migration
- shared contract canon decisions

## Research Summary

### Discord

Discord is the right proof for:

- `defineAdapter(...)`
- raw `ingest.monitor`
- raw `records.backfill`
- truthful namespaced stream method behavior
- shared credential and target helpers

### WhatsApp

WhatsApp is the right proof for:

- `defineAdapter(...)`
- shared target helpers
- shared retry and sleep helpers
- shared record helpers
- truthful `whatsapp.send`

### Telegram

Telegram is the right proof for:

- `defineAdapter(...)`
- reply/thread target helpers
- truthful `telegram.send`

## Implementation Steps

1. Replace manual `adapter.info` with `defineAdapter(...)`
2. remove bundled outward `channels.*` assumptions from package code
3. declare truthful outward methods once under `methods`
4. keep provider-specific socket/gateway behavior adapter-local
5. validate package tests and builds

## Non-Negotiable Rules

1. no top-level `delivery` authoring survives this tranche
2. no bundled outward channel-operation contract survives this tranche
3. outward communication must use truthful platform namespaces
4. this tranche does not add compatibility aliases

## Validation

Green bar for this tranche:

1. `pnpm test` in `nexus-adapter-sdk-ts`
2. `pnpm build` in `nexus-adapter-sdk-ts`
3. `pnpm test` in `discord`
4. `pnpm build` in `discord`
5. `pnpm test` in `whatsapp`
6. `pnpm build` in `whatsapp`
7. `pnpm test` in `telegram`
8. `pnpm build` in `telegram`
