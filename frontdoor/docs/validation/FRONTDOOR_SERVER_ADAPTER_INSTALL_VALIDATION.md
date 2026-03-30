---
summary: "Transitional validation ladder for Frontdoor-managed adapter install while the canonical hosted proof moves onto the sandbox-backed cleanroom substrate."
read_when:
  - You are validating Frontdoor public adapter install routes
  - You are migrating older local-hosted evidence onto the hosted cleanroom lane
title: "Frontdoor Server Adapter Install Validation"
---

# Frontdoor Server Adapter Install Validation

**Status:** TRANSITIONAL ACTIVE VALIDATION

## Purpose

This ladder proves that Frontdoor can manage adapter install on a server and
that the installed Confluence adapter works through the runtime.

This document is no longer the canonical hosted substrate. The canonical hosted
proof path is the sandbox-backed cleanroom lane under `HCI-003`. The local
hosted evidence below is a stepping stone and regression reference until that
lane replaces it completely.

## Rung 1: Public route contract

Pass when:

- `GET /api/servers/:serverId/adapters` returns `200`
- `GET /api/servers/:serverId/adapters/:adapterId/install-status` returns `200`
- `POST /api/servers/:serverId/adapters/:adapterId/install` returns `200`

Current evidence:

- covered in `frontdoor/src/server.test.ts`
- local runtime path proves the public API exists and is callable
- this is contract evidence only, not the final hosted cleanroom proof

## Rung 2: Durable package state

Pass when:

- Frontdoor writes `frontdoor_server_package_installs` for the adapter
- status transitions to `installed`
- active version matches the requested release

Current evidence:

- covered in `installAdapterOnServer()` plus `frontdoor_server_package_installs`
- public route tests verify `installed` state and `active_version`

## Rung 3: Runtime activation

Pass when:

- runtime operator install succeeds
- runtime package health for the adapter is healthy
- adapter is queryable through runtime adapter surfaces

Current evidence:

- local hosted adapter route test proves direct runtime install transport selection
- Nex runtime package-operator tests already prove adapter activation and health
- canonical hosted proof still needs the sandbox-backed cleanroom target

## Rung 4: Live Confluence connection

Pass when:

- a Confluence connection can be created against the installed adapter
- health succeeds with the live tenant credential

Open evidence target:

- `nex/src/api/server.frontdoor-confluence-adapter.live.test.ts`

## Rung 5: Historical ingest

Pass when:

- backfill runs successfully
- Confluence records appear in Nex records
- contacts and channels materialize correctly

Open evidence target:

- same live test as Rung 4

## Rung 6: Freshness and write-read coherence

Pass when:

- monitor starts successfully
- `confluence.pages.create` creates a Confluence page
- monitor ingests that page back as canonical `record.ingest`
- `confluence.pages.move_to_trash` moves the page to trash

Open evidence target:

- same live test as Rung 4

## Rung 7: Restart safety

Pass when:

- Frontdoor-selected server still resolves after restart
- installed adapter package remains active
- the Confluence connection still works after restart

Current status:

- still pending as a distinct sandbox-backed hosted cleanroom proof step
