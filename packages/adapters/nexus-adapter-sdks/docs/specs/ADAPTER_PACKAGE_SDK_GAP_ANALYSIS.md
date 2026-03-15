---
summary: "Gap analysis of all adapter packages against the current shared SDK, package-method, IAM, and validation model."
title: "Adapter Package SDK Gap Analysis"
---

# Adapter Package SDK Gap Analysis

## Purpose

This document answers one practical question:

- which adapter packages still need migration work before the adapter author flow
  is truly operational end to end

The target author experience is:

1. update canonical specs
2. update shared SDKs and package kit
3. update concrete adapter packages
4. run shared hosted lifecycle proof
5. run package-specific validation ladder

This gap analysis exists because the shared SDK cutover is now partially real,
but the package fleet is split across:

- current packages already close to the new contract
- legacy packages still written against older Go SDK field names and event types
- packages that vendor private SDK forks
- TypeScript adapters that still import old `NexusEvent` / `newEvent` names

## Customer Experience

The intended experience for a package author or agent should be:

1. pick up one shared SDK surface
2. declare `adapter.info` in the canonical shape
3. emit canonical `record.ingest`
4. use the runtime-owned `NEXUS_ADAPTER_STATE_DIR`
5. package the adapter through the shared package kit
6. validate via one shared hosted ladder plus one package-local ladder

Today that experience is not consistent across the adapter fleet.

## Canonical Target State

Every adapter package should converge on:

- the shared SDK workspace under
  `/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks`
- canonical `adapter.info` including `methods`
- canonical `record.ingest` emission rather than flat `NexusEvent`
- canonical state root via `NEXUS_ADAPTER_STATE_DIR`
- package-local spec/workplan/validation docs
- package manifest + release script

Non-goals:

- backwards compatibility with older SDK field names
- preserving vendored SDK forks indefinitely
- continuing to treat legacy event types as acceptable

## Shared SDK Status

The shared SDK layer is now materially ahead of many packages.

Shared layer now implemented:

- Go SDK `AdapterInfo.methods`
- TS SDK `AdapterInfo.methods`
- stronger TS contract round-trip tests
- shared `NEXUS_ADAPTER_STATE_DIR` helpers
- package-kit support for `hooks/` and `assets/`

That means package migration is now the main remaining work.

## Inventory

### Category A: Shared-Go packages already close to the current surface

These packages build against the shared Go SDK workspace and passed after the
`methods` cutover with only small package-local updates.

| Adapter | SDK source | Current state | Remaining gap |
| --- | --- | --- | --- |
| `apple-maps` | shared Go SDK | Green | None beyond ongoing method declaration evolution |
| `callrail` | shared Go SDK | Green | None beyond ongoing method declaration evolution |
| `google` | shared Go SDK | Green | None beyond ongoing method declaration evolution |
| `meta-ads` | shared Go SDK | Green | None beyond ongoing method declaration evolution |
| `twilio` | shared Go SDK | Green | None beyond ongoing method declaration evolution |

These are the current reference examples for Go package shape.

### Category B: Shared-Go packages still on legacy handler and result surfaces

These packages compile directly against the shared Go SDK workspace, but they
still use older field names or old request/result shapes. They fail as soon as
the shared SDK is treated as authoritative.

| Adapter | Primary evidence | Required migration |
| --- | --- | --- |
| `device-headless` | `AdapterServeStart`, `req.Account`, `AdapterHealth.Account` | rename to current SDK handler names and `ConnectionID` fields |
| `device-android` | same pattern as headless | same migration as headless |
| `device-macos` | same pattern as headless | same migration as headless |
| `device-ios` | same pattern as headless | same migration as headless |
| `jira` | mixed old surface: `AdapterMonitorStart`, `DeliverySend`, setup/account fields | remove CLI shim, move to current monitor/backfill/send handlers and current result/request fields |
| `patient-now-emr` | `EventBackfill`, `AdapterMonitorStart`, `NexusEvent`, old health fields | full event-surface cutover to canonical `record.ingest` |
| `gog` | `DeliverySend`, `EventBackfill`, `NexusEvent`, `NEXUS_GOG_STATE_DIR` | same as patient-now plus state-dir cutover |
| `zenoti-emr` | `EventBackfill`, `AdapterMonitorStart`, `NexusEvent` | same as patient-now |

### Category C: Packages that still vendor private Go SDK forks

These packages may be locally green, but they are not on the canonical shared
SDK path yet.

| Adapter | Vendored SDK path | Current gap |
| --- | --- | --- |
| `confluence` | `./nexus-adapter-sdk-go` | package behavior partly aligned, but still pinned to a private SDK fork and old field names inside that fork |
| `git` | `./nexus-adapter-sdk-go` | package code and tests still center `NexusEvent`, `DeliverySend`, `EventBackfill` |
| `slack` | `./third_party/adapter-sdk-go` | package and vendored SDK still use old Go SDK naming and request fields |
| `qase` | `./sdk/nexus-adapter-sdk-go` | package code is closer to the current surface, but still forks SDK ownership and has not yet adopted the shared workspace path |

These packages require two separate moves:

1. package-code cutover where needed
2. dependency cutover from vendored fork to shared SDK workspace

### Category D: TypeScript adapters still using old event-builder names

These packages depend on the shared TS SDK workspace, but package code still
imports older TS adapter symbols.

| Adapter | Primary evidence | Required migration |
| --- | --- | --- |
| `discord` | imports `newEvent` and `type NexusEvent` | move to `newRecord`, `AdapterInboundRecord`, current helper names |
| `telegram` | imports `newEvent` and `type NexusEvent` | same migration as Discord |
| `whatsapp` | imports `newEvent` and `type NexusEvent` | same migration as Discord |

### Category E: Package with local SDK fork but low immediate migration pressure

| Adapter | Status | Note |
| --- | --- | --- |
| `qase` | package code appears near-current | still should converge on the shared Go SDK to stop another private contract fork from persisting |

## Gap Types

### Gap 1: Old Go handler names

Legacy names still present in packages or vendored forks:

- `AdapterMonitorStart`
- `AdapterServeStart`
- `DeliverySend`
- `DeliveryDelete`
- `DeliveryReact`
- `DeliveryEdit`
- `EventBackfill`

Current shared Go SDK expects the narrower current field names.

### Gap 2: Old request/result identity fields

Legacy package code still uses:

- `req.Account`
- `AdapterHealth.Account`
- `AdapterSetupResult.Account`

Current shared contract uses `connection_id`-based fields.

### Gap 3: Old inbound event type

Legacy packages and vendored forks still center:

- `NexusEvent`
- event builders returning `NexusEvent`

Canonical target is:

- `record.ingest`
- `AdapterInboundRecord`
- current shared builders/helpers

### Gap 4: Vendored SDK forks

Vendored SDK forks create three problems:

1. package code can stay green while drifting from the canonical workspace SDK
2. bug fixes have to be copied across forks
3. agents cannot rely on one shared authoring surface

### Gap 5: Non-canonical state-dir handling

The canonical writable state root is now:

- `NEXUS_ADAPTER_STATE_DIR`

Remaining drift still includes package-specific env vars like:

- `NEXUS_GOG_STATE_DIR`

### Gap 6: TS package code lagging behind the TS SDK

The TS SDK itself is already on `record.ingest`, but the three TS adapters still
import older names from an earlier version of the SDK surface.

## Recommended Migration Order

The right order is not alphabetical.

### 1. Shared SDK layer

Already completed in this tranche.

Keep this fixed while migrating packages.

### 2. Shared-Go legacy packages that directly consume the shared SDK

Do these next because they are the cleanest proof that package authors can
follow the shared SDK without private forks.

Recommended order:

1. `device-headless`
2. `device-android`
3. `device-macos`
4. `device-ios`
5. `jira`
6. `patient-now-emr`
7. `gog`
8. `zenoti-emr`

### 3. Vendored-Go packages

Recommended order:

1. `qase`
2. `confluence`
3. `git`
4. `slack`

Qase is lowest-risk because package code already appears close to the current
shared surface.

### 4. TypeScript adapters

Recommended order:

1. `telegram`
2. `whatsapp`
3. `discord`

Discord is the heaviest TS package and should come last in that tranche.

## Validation Expectations

Each package migration should prove four things:

1. package builds against the shared SDK surface it is supposed to use
2. `adapter.info` includes canonical `methods`
3. ingress emits canonical `record.ingest`
4. package-local validation still passes

Vendored fork removal adds a fifth proof:

5. no local SDK fork remains in `go.mod` / package dependency wiring

## Conclusion

The shared SDK cutover is not the main remaining unknown anymore.

The real remaining work is package propagation, and it now splits cleanly into
three tranches:

1. shared-Go legacy packages
2. vendored-Go package convergence
3. TS package convergence

That is the right unit of planning and execution for the next migration pass.
