---
summary: "Gap analysis and execution plan for Frontdoor server-scoped adapter install."
read_when:
  - You are implementing Frontdoor adapter install routes
  - You need the delta from current app-only public install APIs
title: "Workplan Frontdoor Server Adapter Install API"
---

# Workplan Frontdoor Server Adapter Install API

**Status:** PARTIALLY COMPLETE

## Purpose

This workplan turns the canonical hosted adapter install surface into concrete
implementation work.

The target-state spec is
[Frontdoor Server Adapter Install API](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/FRONTDOOR_SERVER_ADAPTER_INSTALL_API.md).

## Customer Experience First

The target customer flow is:

1. create or select a server
2. install Confluence from Frontdoor onto that server
3. confirm package install status from Frontdoor
4. use that installed adapter inside the runtime to create a live Confluence connection
5. validate ingest and write flows

The operator should not need to drop down to `/api/operator/packages/install`.

## Current Reality

What already exists:

- Frontdoor has public app install/list/status routes
- Frontdoor has generic package registry tables and server package install state
- Frontdoor has generic package transport helpers that already accept `kind = "adapter"`
- Nex runtime now supports `kind = "adapter"` package install and restart-safe activation
- Frontdoor already has public adapter install/list/status routes
- Frontdoor already chooses between direct runtime install and SSH/SCP delivery
- Frontdoor server tests already cover local adapter install through the public API

What is still missing:

- no completed live credentialed proof of the full Frontdoor-managed Confluence flow
- no archived validation evidence tying package install to connection setup, ingest, send, and delete
- no restart proof for the full hosted stepping-stone flow after a live Confluence connection exists

## Gap Analysis

### Gap 1: Live hosted proof is separate from route existence

`server.ts` already exposes:

- `GET /api/servers/:serverId/adapters`
- `GET /api/servers/:serverId/adapters/:adapterId/install-status`
- `POST /api/servers/:serverId/adapters/:adapterId/install`

Impact:

- route existence alone does not prove the customer can use an installed adapter
- we still need the live proof that package install leads to a working Confluence connection inside Nex

### Gap 2: Live Confluence validation is not yet archived as the canonical hosted proof

The local direct-runtime transport exists and is covered in `server.test.ts`, and
there is already a dedicated live-stack test file in `nex` for the exact hosted
Confluence flow.

Impact:

- the remaining work is validation execution and doc alignment, not route invention

### Gap 3: Restart safety still needs to be treated as part of the hosted proof

Package install restart safety exists at the runtime/operator layer, but the
full hosted flow should also prove that:

1. Frontdoor still resolves the selected server after restart
2. the adapter package remains installed
3. the live Confluence connection still works

Impact:

- without this, the hosted stepping-stone proof is still incomplete

## Execution Plan

### Phase 1: Archive the implemented route and transport layer

Status:

- completed in code
- partially documented

Archive evidence:

- `server.ts` route handlers for adapter list/status/install
- `installAdapterOnServer()` public install path
- `installPackageViaRuntimeHttp()` local hosted transport
- `server.test.ts` local runtime adapter install coverage

Exit criteria:

- docs no longer claim the adapter install API is missing
- docs clearly separate implemented package lifecycle from pending live connection proof

### Phase 2: Lock the canonical hosted validation target

Implement:

- document the exact hosted stepping-stone flow:
  - Frontdoor login
  - `POST /api/servers`
  - `POST /api/servers/select`
  - `POST /api/runtime/token`
  - `POST /api/servers/:serverId/adapters/:adapterId/install`
  - runtime `adapters.connections.custom.*`
  - runtime `adapters.connections.backfill`
  - runtime `channels.send`
  - runtime `channels.delete`

Exit criteria:

- the active work is framed around the real customer journey, not just package install internals

### Phase 3: Run and harden the live Confluence hosted test

Implement:

- execute `server.frontdoor-confluence-adapter.live.test.ts` against the real Confluence credential set
- fix any runtime, setup-flow, ingest, or delivery mismatches exposed by the live run
- preserve non-destructive page create/delete cleanup behavior

Exit criteria:

- the hosted Confluence flow is green from server creation through delete cleanup

### Phase 4: Validate the hosted stepping stone end to end

Implement:

- archive the live validation evidence in the validation ladder
- include restart expectations if the live run proves stable enough
- record any remaining platform gaps separately from adapter behavior gaps

Exit criteria:

- the local hosted Frontdoor-to-runtime-to-Confluence proof is canonical and repeatable
