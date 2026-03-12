# TS Unified Adapter SDK Migration Workplan

## Purpose

Migrate the remaining TypeScript adapters onto the unified TS SDK authoring
surface introduced in:

- `/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/docs/specs/UNIFIED_ADAPTER_SDK_API.md`

## Customer Experience

After this tranche, a TS adapter author should see the same top-level shape in
Telegram, Discord, and WhatsApp:

- `defineAdapter(...)`
- SDK-derived `adapter.info`
- single-source method declaration when methods exist
- shared credential/target/retry/record helpers

The author should not see three different styles of low-level operation wiring.

## Scope

This tranche covers:

1. `nexus-adapter-discord`
2. `nexus-adapter-whatsapp`

It does not include:

3. Go SDK cutover
4. Jira method work

Those remain separate because another agent is already changing the Go/Jira
surface.

## Research Summary

### Discord

Discord is the right proof for:

- `defineAdapter(...)`
- raw `ingest.monitor`
- raw `records.backfill`
- `channels.stream`
- shared credential and target helpers

Discord should not be forced into polling helpers because its monitor is
gateway-based.

### WhatsApp

WhatsApp is the right proof for:

- `defineAdapter(...)`
- shared target helpers
- shared retry and sleep helpers
- shared record helpers

WhatsApp should keep its socket/session behavior adapter-local.

## Implementation Steps

1. Replace manual `adapter.info` in Discord and WhatsApp with `defineAdapter(...)`
2. Remove manual `adapter.accounts.list` where the SDK default is sufficient
3. Move token/target/retry boilerplate to SDK helpers
4. Keep provider-specific socket/gateway logic in the adapter packages
5. Validate package tests and builds

## Validation

Green bar for this tranche:

1. `pnpm test` in `nexus-adapter-sdk-ts`
2. `pnpm build` in `nexus-adapter-sdk-ts`
3. `pnpm test` in `nexus-adapter-discord`
4. `pnpm build` in `nexus-adapter-discord`
5. `pnpm test` in `nexus-adapter-whatsapp`
6. `pnpm build` in `nexus-adapter-whatsapp`

