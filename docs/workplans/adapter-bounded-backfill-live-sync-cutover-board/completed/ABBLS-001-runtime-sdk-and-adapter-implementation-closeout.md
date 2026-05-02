---
summary: "Runtime, SDK, and adapter implementation closeout for bounded backfill and durable live-sync semantics."
title: "ABBLS-001 Runtime SDK And Adapter Implementation Closeout"
---

# ABBLS-001 Runtime SDK And Adapter Implementation Closeout

## Status

Completed.

## Scope

Close the code-level cutover for:

- Nex runtime monitor-first activation
- bounded `since`/`to` backfill plumbing
- worker-owned adapter backfill sessions
- TS and Go SDK backfill window contracts
- touched adapter handlers and provider-specific upper-bound behavior

## Completed Work

- Runtime activation starts live sync first when supported, captures a monitor
  anchor, and queues bounded backfill to that anchor.
- Manual `adapters.connections.backfill` accepts and preserves `to`.
- Worker sessions forward `to` to staged adapter backfill.
- Bounded backfill does not pause active monitors.
- Unbounded or forced replay is marked maintenance replay and may pause monitor
  execution.
- TS and Go adapter SDKs expose backfill windows.
- Changed adapters accept the new SDK handler shape.
- Provider paths honor `to` where the provider has a usable timestamp or upper
  bound.

## Evidence

- Nex runtime targeted tests passed:
  - `src/runtime/domains/adapters/manager.backfill.test.ts`
  - `src/api/internal-jobs/adapter-backfill.test.ts`
  - `src/api/server-methods/adapter-connections.test.ts`
- Bounded capability forwarding test passed:
  - `src/api/server-methods/adapter-capabilities.test.ts -t "passes bounded backfill windows"`
- TS SDK tests, build, and typecheck passed.
- Go SDK tests passed.
- Touched Go adapter packages passed `go test ./...`.
- Jira Docker cleanroom smoke passed:
  - `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-jira-cleanroom/20260502T212725Z`

## Residual Risk

Full core `tsc` is still blocked by unrelated pre-existing repository-wide type
errors. The adapter-specific targeted tests for this cutover are green.

