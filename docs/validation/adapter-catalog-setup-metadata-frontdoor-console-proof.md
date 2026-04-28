---
summary: "Validation ladder for proving adapter setup metadata from published Frontdoor catalog through local runtime and Operator Console setup."
title: "Adapter Catalog Setup Metadata Frontdoor Console Proof"
---

# Adapter Catalog Setup Metadata Frontdoor Console Proof

## Purpose

This validation document defines the proof required before the adapter catalog
setup metadata work is considered complete.

## Validation Ladder

1. Shared schema tests pass for representative setup descriptors.
2. Package release tests prove descriptor generation for Go and TypeScript
   adapters.
3. Frontdoor tests prove published adapter catalog responses include setup
   metadata.
4. Runtime tests prove `adapters.catalog.list` preserves published setup
   metadata and prefers live `adapter.info` for registered adapters.
5. Console tests prove single-method, multi-method, success, failure, cancel,
   and add-another-account flows.
6. Cleanroom proof installs a runtime, points it at deployed Frontdoor, opens
   Console, selects a published adapter, completes setup, and observes a
   durable connection row only after success.
7. Live dogfood proof repeats the flow on the operator's local runtime.

## Required Evidence

- command output for package, Frontdoor, runtime, and Console tests
- `/api/adapters/catalog` sample showing setup metadata
- `adapters.catalog.list` sample showing setup metadata
- Console screenshots for method picker and configure screen
- Console screenshot showing no durable row before setup completion
- Console screenshot showing durable row after setup completion
- cleanroom run summary
- live dogfood run summary

## Local Evidence On 2026-04-27

- `pnpm test -- src/cli/package-cli/validate.test.ts src/cli/package-cli/release.test.ts src/api/server-methods/adapter-catalog.test.ts` passed in `nex`.
- `pnpm test -- src/ui/controllers/integrations.test.ts src/ui/views/integrations.test.ts` passed in Operator Console.
- `pnpm build` passed in Operator Console.
- `pnpm lint` passed in Frontdoor.
- `pnpm vitest run src/openapi/frontdoor-contract.test.ts` passed in Frontdoor.
- `pnpm vitest run src/publish-adapter-release.test.ts src/openapi/frontdoor-contract.test.ts src/server.test.ts -t "lists published adapters from the package registry|publishAdapterRelease"` passed for focused Frontdoor catalog/publish coverage.
- `go test ./...` passed in `packages/adapters/nexus-adapter-sdks/nexus-adapter-sdk-go`.
- `nexus package validate` passed for 28 of 29 local adapter packages; the only
  failure is the retired local `git` tombstone, which is not active in the
  deployed Frontdoor catalog.
- Direct `adapter.info` checks confirmed setup methods for Telegram and WhatsApp after rebuilding their entrypoints.

## Deployed Frontdoor Evidence On 2026-04-27

- `nexus-frontdoor.service` is active on `frontdoor.nexushub.sh`.
- `https://frontdoor.nexushub.sh/api/adapters/catalog` returned `ok: true`.
- The deployed catalog returned 28 published adapters.
- `missingSetup` was `[]`; every published adapter has setup descriptor
  methods.
- No active deployed catalog entry was returned for `git` or
  `nexus-adapter-git`.
- Representative deployed setup methods:
  - `gog`: `google_oauth_managed`, `gog_existing_auth`
  - `jira`: `jira_cloud_api_token`
  - `linkedin`: `linkedin_oauth`
  - `slack`: `slack_socket_mode`, `slack_user_token`
  - `telegram`: `telegram_bot_token`
  - `whatsapp`: `whatsapp_session_upload`

## Local Runtime Evidence On 2026-04-27

- `nexus runtime call adapters.catalog.list --json` returned 29 local catalog
  entries.
- 28 entries were published and merged from deployed Frontdoor metadata.
- The only unpublished entry was the retired local `git` tombstone.
- The local runtime preserved setup methods for the deployed sample set:
  - `gog`: `google_oauth_managed`, `gog_existing_auth`
  - `jira`: local registered method `atlassian_api_key`, with a drift
    diagnostic against the deployed `jira_cloud_api_token` descriptor
  - `linkedin`: `linkedin_oauth`
  - `slack`: `slack_socket_mode`, `slack_user_token`
  - `telegram`: `telegram_bot_token`
  - `whatsapp`: `whatsapp_session_upload`

## Live Console Evidence On 2026-04-27

- The in-app browser loaded the local Operator Console at
  `http://127.0.0.1:18789/app/console/connectors`.
- The Add App modal showed `29 adapters in catalog · 28 published · 28
  connectable now`.
- The Published catalog section showed 28 entries and included published-only
  adapters.
- Selecting Slack kept the table at 12 durable rows before and after selection,
  proving no draft row was created before setup completion.
- Selecting Slack opened the setup modal with the two published methods:
  `Slack Bot (Socket Mode)` and `Slack User Token`.
- Selecting Telegram opened a single-method setup screen directly, with the
  `bot_token` secret setup question and a `Connect` action.
- Selecting WhatsApp opened a file-upload setup screen inside the modal with
  `filePath`, optional `fileName`, and `Upload File`; the durable row count
  stayed unchanged before setup completion.
- A controller regression test now covers duplicate catalog rows and proves the
  normalized catalog prefers published setup metadata while preserving installed
  state.

Screenshot artifacts:

- [Published catalog modal](/Users/tyler/nexus/home/projects/nexus/docs/validation/adapter-catalog-console-published-catalog-proof.png)
- [Slack multi-method setup modal](/Users/tyler/nexus/home/projects/nexus/docs/validation/adapter-catalog-console-slack-proof.png)

## Failure Rules

The proof fails if:

- any supported published adapter lacks setup metadata without an explicit
  documented holdback
- Console discovers adapters from durable connection rows
- selecting an adapter creates a durable connection row before setup succeeds
- existing connections prevent starting another setup attempt
- Frontdoor deployed catalog differs from the local proof catalog without a
  recorded reason
