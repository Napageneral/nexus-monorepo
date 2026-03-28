---
summary: "Sequenced workplan for migrating the adapter package fleet onto the canonical shared SDK, method, IAM, and validation model."
title: "Adapter Package SDK Propagation Workplan"
---

# Adapter Package SDK Propagation Workplan

## Purpose

This workplan turns the adapter package SDK gap analysis into an execution plan.

The goal is not merely to patch compilation.
The goal is to make the package author experience operational:

1. specs define the contract
2. shared SDKs encode that contract
3. concrete adapter packages consume that contract directly
4. shared hosted validation plus package-local validation prove readiness

## Customer Experience

The desired customer and author experience is:

1. every adapter package feels like it is built on one common platform
2. no package depends on a private adapter SDK fork to function
3. no package exposes a stale event or setup shape
4. package-local docs match the actual runtime and validation flow

The user or agent working inside an adapter repo should not have to guess:

- which SDK surface is canonical
- whether `Account` or `ConnectionID` is correct
- whether inbound records are `NexusEvent` or `record.ingest`
- whether package state should live in a package-private env var or the runtime-owned state root

## Scope

In scope:

- shared-Go legacy packages
- vendored-Go package convergence
- TS package convergence
- package-local docs and validation updates where contract changes require them

Out of scope:

- changing canonical platform docs again
- adding backwards compatibility to the SDKs
- cloud/runtime product work unrelated to adapter package migration

## Phase 0: Shared SDK Lock

Status: complete

Already done:

- shared Go SDK `methods`
- shared TS SDK `methods`
- `NEXUS_ADAPTER_STATE_DIR` helpers
- stronger TS contract tests
- package-kit staging of hooks/assets

This phase should not be reopened except for migration-blocking fixes.

## Phase 1: Shared-Go Control Adapter Tranche

Packages:

- `device-headless`
- `device-android`
- `device-macos`
- `device-ios`

Goal:

- move the device adapters from old setup/control/health field names to the
  current shared Go SDK surface

Required changes:

- rename old handler fields to current `AdapterOperations` names
- replace `req.Account` usage with current connection-based request fields
- replace `AdapterHealth.Account` / `AdapterSetupResult.Account` with current
  connection-id fields
- rerun package tests against the shared Go SDK workspace

Validation:

- `go test ./...` in each package
- verify derived runtime reflection still describes control/setup operations correctly

## Phase 2: Shared-Go Mixed Atlassian Tranche

Package:

- `jira`

Goal:

- move Jira off its mixed manual shim + older handler naming surface

Required changes:

- remove CLI pre-dispatch shims for backfill if no longer needed
- rename `AdapterMonitorStart` and `DeliverySend` usage to the current SDK surface
- convert setup result/request fields from `Account` to connection-id fields
- ensure `records.backfill` is wired through the normal shared SDK path
- keep package-local docs aligned to the final command surface

Validation:

- `go test ./...`
- confirm setup, health, monitor, send, backfill command wiring still matches docs

## Phase 3: Shared-Go Historical-Ingest Tranche

Packages:

- `patient-now-emr`
- `gog`
- `zenoti-emr`

Goal:

- cut these packages off the old event model and onto canonical ingress

Required changes:

- replace `EventBackfill` with current backfill handler field
- replace legacy monitor handler names with current ones
- replace `NexusEvent` builders and return types with canonical inbound record builders
- replace old request/result `Account` fields with connection-id fields
- move any package-private state env to `NEXUS_ADAPTER_STATE_DIR`

Package-specific notes:

- `gog` also needs explicit replacement of `NEXUS_GOG_STATE_DIR`
- all three packages need doc updates because their existing workplans/specs still
  describe older event naming

Validation:

- `go test ./...`
- spot-check emitted record shape through package-local tests or fixtures

## Phase 4: Vendored-Go SDK Convergence Tranche

Packages:

- `qase`
- `confluence`
- `git`
- `slack`

Goal:

- remove private SDK forks and converge these packages onto the shared Go SDK workspace

### 4A. Qase

Required changes:

- change `go.mod` to use the shared Go SDK workspace
- keep package code on the current shared surface
- add explicit `methods` declaration if still missing

### 4B. Confluence

Required changes:

- switch `go.mod` from local vendored SDK fork to the shared SDK workspace
- remove vendored SDK directory when package is green
- convert remaining package code from old request/result `Account` field names
  to connection-id fields
- keep `NEXUS_ADAPTER_STATE_DIR` as the only canonical state root

### 4C. Git

Required changes:

- switch `go.mod` from vendored SDK to shared SDK workspace
- replace `NexusEvent` builders with canonical inbound record builders
- replace old handler names and delivery field names
- update tests that currently assert `NexusEvent`
- update package docs that still describe `NexusEvent`

### 4D. Slack

Required changes:

- switch `go.mod` from `third_party/adapter-sdk-go` to the shared SDK workspace
- replace package usage of old request fields like `req.Account`
- remove vendored SDK fork when green

Validation for Phase 4:

- `go test ./...` in each package
- no vendored adapter SDK path remains active in package dependency wiring

## Phase 5: TypeScript Adapter Convergence

Packages:

- `telegram`
- `whatsapp`
- `discord`

Goal:

- move TS adapter package code onto the current TS SDK surface already present in
  the shared workspace

Required changes:

- replace `newEvent` with `newRecord`
- replace `type NexusEvent` with current canonical inbound record types
- update helper code that indexes into old `NexusEvent` field names
- ensure declared capabilities are reflected correctly
- rerun build + tests against the shared TS SDK workspace

Recommended order:

1. Telegram
2. WhatsApp
3. Discord

Validation:

- `pnpm test`
- `pnpm lint`
- `pnpm build`

## Phase 6: Documentation And Validation Hygiene

Goal:

- ensure package-local docs are no longer teaching stale SDK or event surfaces

Required changes:

- update package-local specs/workplans/validation ladders where they still say:
  - `NexusEvent`
  - `EventBackfill`
  - `DeliverySend`
  - package-private state env vars
- ensure package READMEs reflect the real authoring and validation path

This phase should happen package-by-package during earlier phases rather than as
one giant cleanup at the end.

## Execution Order

1. Phase 1: device adapters
2. Phase 2: Jira
3. Phase 3: patient-now, gog, zenoti
4. Phase 4: Qase, Confluence, Git, Slack
5. Phase 5: Telegram, WhatsApp, Discord
6. Phase 6: close remaining doc drift

## Validation Ladder

Every migrated package must pass:

1. package-local build/test
2. package-local contract checks for derived runtime reflection
3. ingress proof for canonical `record.ingest`
4. state-dir proof for `NEXUS_ADAPTER_STATE_DIR` if package has mutable state
5. shared hosted lifecycle proof where that package is already installable
6. package-specific ladder where available

## Completion Criteria

This workplan is complete when:

1. no adapter package depends on stale SDK field names
2. no adapter package requires vendored SDK forks for correctness
3. no adapter package emits or documents flat `NexusEvent` as the canonical runtime contract
4. all adapter packages build against either:
   - the shared SDK workspace
   - or a consciously temporary fork that has a tracked retirement step
5. package-local docs and validation ladders match the final command and ingress model
