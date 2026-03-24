# Adapter Connections List Hard Cut

**Status:** ACTIVE  
**Last Updated:** 2026-03-19

---

## Purpose

Restore the local operator-facing execution baseline by hard-cutting the shared
adapter contract from `adapter.accounts.list` to
`adapter.connections.list`.

The immediate customer-facing problem is:

1. Dispatch baseline read surfaces are now restored and truthful
2. but all Dispatch-relevant adapter connections still show `error`
3. because the runtime refuses to register installed adapter packages
4. so real Dispatch execution is blocked at the adapter layer rather than the
   app layer

This workplan hard-cuts that contract drift so Nex runtime, the shared adapter
SDKs, and the installed adapter packages all speak one canonical connection-list
surface.

---

## Research Summary

Current live facts:

1. local runtime is healthy and Dispatch is active at `1.0.50`
2. `dispatch.overview`, `dispatch.connections.list`,
   `dispatch.policies.list`, `dispatch.queue.list`, and
   `dispatch.runs.list` all work live
3. `nexus adapters connections list --json` shows all live connections in
   `error` with `Adapter not registered: <id>`
4. `runtime_packages` shows installed adapters such as `slack`, `jira`, `git`,
   `eve`, and `linkedin` in `failed`
5. the common `last_error` is adapter runtime introspection failing on
   `operations[1]`
6. installed adapter binaries emit `adapter.info` payloads that still declare
   `adapter.accounts.list`
7. current adapter source and the shared adapter SDKs still declare
   `adapter.accounts.list`
8. Nex core adapter validation now expects `adapter.connections.list`

Implication:

1. this is not a Dispatch-specific bug
2. this is not a stale manifest-only problem
3. this is an active contract mismatch across Nex core, the shared adapter
   SDKs, and multiple adapter packages
4. installed adapters cannot rehydrate until that contract is cut over

Active source scope now confirmed:

1. shared adapter SDKs in:
   - `packages/adapters/nexus-adapter-sdks/nexus-adapter-sdk-go`
   - `packages/adapters/nexus-adapter-sdks/nexus-adapter-sdk-ts`
2. live blocking adapters:
   - `slack`
   - `jira`
   - `git`
   - `eve`
   - `linkedin`
3. additional active adapter packages with the same stale handler or published
   contract:
   - `apple-maps`
   - `callrail`
   - `confluence`
   - `device-headless`
   - `discord`
   - `google`
   - `meta-ads`
   - `twilio`
   - plus active openapi-only residue in `gog`, `patient-now-emr`, `qase`,
     `telegram`, `whatsapp`, and `zenoti-emr`
4. active nearby consumer:
   - `packages/apps/nex-operator-console`
5. active adapter openapi/spec/skill surfaces still teaching the stale
   operation name across multiple adapter packages

---

## Target Customer Experience

The local operator should be able to:

1. restart Nex and have installed adapters register successfully
2. see adapter connections in truthful runtime state instead of permanent
   `Adapter not registered`
3. open Dispatch and inspect connection state that reflects real adapter
   registration
4. proceed into real Dispatch execution testing without adapter contract drift
   blocking the path

No compatibility shim is acceptable here.
There should be one canonical adapter connection-list contract in source and in
live installed packages.

---

## Hard-Cut Rules

1. no fallback support for `adapter.accounts.list`
2. no dual contract where Nex core accepts both names
3. no partial repo migration that leaves shared SDKs and adapter packages on
   different vocabularies
4. no leaving stale installed adapter packages active after source truth
   changes

---

## Implementation Sequence

### Phase 1. Canonical contract definition

1. locate the canonical Nex core adapter operation contract
2. confirm the intended semantics for `adapter.connections.list`
3. identify every source of `adapter.accounts.list` across:
   - Nex core
   - shared adapter SDKs
   - installed adapter packages
   - current adapter package repos
   - active docs/specs/workplans that define target state

Exit criteria:

1. one canonical connection-list operation name is locked
2. every active source of the stale name is inventoried

### Phase 2. Shared SDK hard cut

1. update the shared adapter SDKs to emit and handle
   `adapter.connections.list`
2. rename the relevant SDK handler surface from account-list semantics to
   connection-list semantics
3. remove stale `adapter.accounts.list` references from active SDK docs and
   tests
4. keep the public type and field names aligned with connection semantics
   rather than preserving account-list aliases

Exit criteria:

1. new adapter binaries built from the SDK emit `adapter.connections.list`
2. SDK tests and validation surfaces align with the new contract

### Phase 3. Adapter package hard cut

1. update the active adapter packages currently blocking local dogfooding:
   - `slack`
   - `jira`
   - `git`
   - `eve`
   - `linkedin`
2. update the remaining active adapter packages that still expose the stale
   handler or publish the stale operation name
3. rename adapter handler wiring, tests, and active docs from
   `adapter.accounts.list` to `adapter.connections.list`
4. cut over active nearby consumers that call the stale method directly
5. rebuild package artifacts from current source

Exit criteria:

1. active adapter source no longer advertises `adapter.accounts.list`
2. rebuilt adapter binaries pass `adapter.info` validation against Nex core
3. active nearby consumers no longer call `adapter.accounts.list`
4. active published adapter contracts no longer advertise
   `adapter.accounts.list`

### Phase 4. Local package reinstall / upgrade

1. stage rebuilt adapter artifacts under the canonical package staging root
2. upgrade the installed adapter packages through the runtime package operator
3. verify durable package state and active release pointers

Exit criteria:

1. installed adapter packages are rebuilt from the cut-over source
2. `runtime_packages` no longer reports adapter validation failure on startup

### Phase 5. Live operator validation

1. restart or rehydrate runtime as needed
2. validate:
   - `nexus adapters connections list --json`
   - `dispatch.connections.list`
   - `dispatch.overview`
3. confirm the next blocker, if any, is deeper workflow/policy setup rather
   than adapter registration failure

Exit criteria:

1. adapters register successfully
2. Dispatch sees truthful adapter-backed connection state
3. real Dispatch execution testing can continue

---

## Validation

### Source validation

Prove:

1. shared SDK tests reflect `adapter.connections.list`
2. active adapter package tests reflect `adapter.connections.list`
3. no active source package still emits `adapter.accounts.list`

### Package validation

Prove:

1. rebuilt adapter artifacts validate and release cleanly
2. installed adapter package state moves from `failed` to `active`

### Live operator validation

Prove:

1. runtime restart rehydrates adapters without validation failure
2. `nexus adapters connections list --json` no longer shows
   `Adapter not registered`
3. Dispatch can proceed past adapter-baseline blocking issues
