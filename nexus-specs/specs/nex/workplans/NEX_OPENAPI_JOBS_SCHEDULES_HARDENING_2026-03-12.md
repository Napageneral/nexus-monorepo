# Nex OpenAPI Jobs And Schedules Hardening 2026-03-12

## Customer Experience

A developer reading `contracts/nex/openapi.yaml` should be able to understand the operational work-runtime API without reverse-engineering job and schedule handlers.

This pass hardens:

1. `jobs.*` operational methods
2. `schedules.*` operational methods

## Scope

In scope:

1. `jobs.list`
2. `jobs.get`
3. `jobs.create`
4. `jobs.update`
5. `jobs.delete`
6. `jobs.invoke`
7. `jobs.runs.list`
8. `jobs.runs.get`
9. `jobs.queue.list`
10. `jobs.queue.get`
11. `jobs.cancel`
12. `jobs.retry`
13. `jobs.requeue`
14. `schedules.list`
15. `schedules.get`
16. `schedules.create`
17. `schedules.update`
18. `schedules.delete`
19. `schedules.trigger`

Out of scope:

1. DAG APIs
2. config APIs
3. memory APIs
4. channel APIs

## Research Summary

Existing stable record schemas already exist in the protocol layer for:

1. `JobDefinitionSchema`
2. `JobRunSchema`
3. `ScheduleRecordSchema`

The remaining gap was publication wiring plus one missing local schema family:

1. queue entry shape
2. wrapper result shapes
3. request schemas for the few job methods that still lacked protocol params exports

Representative live handler behavior is already stable in:

1. `nex/src/nex/runtime-api/server-methods/jobs.ts`
2. `nex/src/nex/runtime-api/server-methods/schedules.ts`
3. `nex/src/nex/runtime-api/server-methods/schedules.test.ts`

## Hard-Cut Decisions

1. Reuse existing protocol record schemas where available.
2. Add local Nex component schemas only for queue rows and wrapper result shapes.
3. Publish concrete request schemas for the remaining untyped job methods.
4. Validate representative live handler outputs against the published response envelopes.

## Validation

Required:

1. `pnpm contracts:generate:nex`
2. `pnpm exec vitest run src/nex/runtime-api/openapi/nex-contract.test.ts`

Success criteria:

1. targeted jobs/schedules methods no longer publish generic payload schemas
2. representative live outputs from real handlers conform to the published schemas
