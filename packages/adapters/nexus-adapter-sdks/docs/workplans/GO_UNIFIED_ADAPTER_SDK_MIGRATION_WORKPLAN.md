---
summary: "Workplan for hard-cutting the Go SDK and the first settled Go adapters to the unified authoring model."
title: "Go Unified Adapter SDK Migration Workplan"
---

# Go Unified Adapter SDK Migration Workplan

## Goal

Hard-cut the shared Go SDK from low-level `AdapterOperations` authoring to the
unified `DefineAdapter(...)` authoring model, then migrate the first settled Go
adapters onto that surface.

## Customer Experience

After this work:

1. a Go adapter author should mostly write provider logic
2. package metadata, operations, and methods should be declared once
3. default accounts and health should not be reimplemented everywhere
4. shared credentials, target parsing, retry, record, and polling helpers
   should be easy to reuse

## Research Findings

Current state:

- the Go SDK protocol/types are mostly current
- generic adapter-native method execution already exists
- adapter authors still hand-build `AdapterInfo` and `AdapterOperations`
- the same connection/account/health/target plumbing repeats across adapters

Representative proof adapters:

- Jira: setup + health + monitor + backfill + delivery
- CallRail: classic polling ingest and connection-backed accounts/health
- Google: multi-monitor composition and polling helpers

## Phases

## Phase 1: Shared Go SDK Contract

Create the unified Go authoring layer in the shared SDK:

- add `DefineAdapter(...)`
- add single-source method declaration helpers
- add connection/client context types
- derive `AdapterInfo` from the top-level declaration
- derive runtime handlers from the same declaration

Files:

- `nexus-adapter-sdk-go/define.go`
- `nexus-adapter-sdk-go/types.go`
- `nexus-adapter-sdk-go/adapter.go`
- `nexus-adapter-sdk-go/README.md`

## Phase 2: Helper Lift

Add the first high-leverage helper tranche:

- credential helpers
- target helpers
- retry/sleep helpers
- message-record helpers
- backfill helper

Files:

- `nexus-adapter-sdk-go/credentials.go`
- `nexus-adapter-sdk-go/targets.go`
- `nexus-adapter-sdk-go/retry.go`
- `nexus-adapter-sdk-go/event.go`
- `nexus-adapter-sdk-go/monitor.go`

## Phase 3: Shared SDK Validation

Add focused tests for:

- derived `adapter.info`
- single-source methods
- default accounts
- default health
- send target helpers
- retry helpers
- polling helpers

Files:

- `nexus-adapter-sdk-go/define_test.go`
- `nexus-adapter-sdk-go/targets_test.go`
- `nexus-adapter-sdk-go/retry_test.go`
- existing SDK tests as needed

## Phase 4: Proof Adapter Migration

Migrate the first settled Go adapters:

- Jira
- CallRail
- Google

These prove:

- setup + delivery + provider methods
- simple poll monitor/backfill
- composite poll monitor orchestration

Files:

- `jira/cmd/jira-adapter/main.go`
- `callrail/cmd/callrail-adapter/main.go`
- `google/cmd/google-adapter/main.go`

## Phase 5: Shared-SDK Fleet Propagation

After the proof adapters are green, propagate the same authoring model through
the remaining adapters that already consume the shared Go SDK directly.

Target tranche:

- Apple Maps
- Meta Ads
- Twilio
- PatientNow EMR
- Zenoti EMR
- Device Headless
- Device Android
- Device macOS
- Device iOS
- Gog

These are the packages where the work is primarily authoring-surface cleanup,
not SDK-fork convergence.

Status:

- completed

## Phase 6: Vendored-Fork Convergence

Hard-cut the remaining Go adapters that were still pinned to local SDK forks
back onto the shared SDK workspace and the unified authoring surface.

Target tranche:

- Git
- Qase
- Slack
- Confluence

This phase includes:

- updating `go.mod` replaces to the shared SDK workspace
- switching package imports off private SDK module paths
- replacing hand-built `AdapterOperations` entrypoints with `DefineAdapter(...)`
- removing old request-shape fallbacks like `req.Account` / `req.To`
- cutting tests over to canonical `AdapterInboundRecord`

Status:

- completed

## Phase 7: Validation

Run:

- shared Go SDK tests
- proof adapter tests
- propagated shared-SDK adapter tests
- proof adapter builds
- vendored-fork convergence package tests and builds

Minimum pass set:

```bash
cd /Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-sdks/nexus-adapter-sdk-go
go test ./...

cd /Users/tyler/nexus/home/projects/nexus/adapters/jira
go test ./...

cd /Users/tyler/nexus/home/projects/nexus/adapters/callrail
go test ./...

cd /Users/tyler/nexus/home/projects/nexus/adapters/google
go test ./...

cd /Users/tyler/nexus/home/projects/nexus/adapters/git
go test ./...

cd /Users/tyler/nexus/home/projects/nexus/adapters/qase
go test ./...

cd /Users/tyler/nexus/home/projects/nexus/adapters/slack
go test ./...

cd /Users/tyler/nexus/home/projects/nexus/adapters/confluence
go test ./...
```

## Follow-On Tranche

After the Go adapter fleet is converged, the next high-leverage step is not more
adapter cutover. It is carrying the same authoring-model lessons into the app
tooling surface.
