# Nex OpenAPI Completion Roadmap 2026-03-12

## Customer Experience

A developer using Nex should be able to:

1. find the full published Nex contract at `contracts/nex/openapi.yaml`
2. trust that it covers every HTTP-capable Nex runtime method
3. understand real request and response shapes for those methods without reading handler code
4. rely on conformance tests proving the published schemas match live handler behavior

The contract is already inventory-complete. The remaining work is schema hardening and conformance, domain by domain.

## Current State

Completed hardening passes:

1. `apps.*` first slice
2. `auth.tokens.*`
3. `agents.sessions.imports.list`
4. `agents.sessions.list`
5. `agents.sessions.preview`
6. `agents.sessions.resolve`
7. `jobs.*`
8. `schedules.*`
9. `config.*`
10. `credentials.*`
11. `entities.*`
12. `groups.*`
13. `contacts.*`
14. `workspaces.*`
15. `channels.*` data and status slice
16. `runtime.*` first slice
17. `records.*` first slice
18. `events.*` first slice
19. `skills.*` first slice
20. `models.get`
21. `talk.mode`
22. `wizard.cancel`
23. `productControlPlane.call`

Current published state:

1. `contracts/nex/openapi.yaml` publishes `274` paths and `274` operations
2. `contracts/nex/openapi.yaml` publishes `236` component schemas
3. the published Nex contract currently has `0` remaining generic request/response method schemas
4. domain conformance is enforced in `nex/src/nex/runtime-api/openapi/nex-contract.test.ts`

## Hard-Cut Rules

1. No backward-compat contract shims.
2. Publish only stable, live-backed shapes.
3. Reuse existing protocol schemas where they already exist.
4. Add local Nex OpenAPI component schemas only when the runtime already has stable shapes but the protocol layer does not yet export them.
5. Every hardening pass must add or extend conformance tests.

## Domain Phases

### Phase 1: Sessions Read

Status: completed.

### Phase 2: Jobs And Schedules

Target:

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

Reason:
- stable DB-backed records
- reusable protocol record schemas already exist for jobs/schedules
- direct handler tests already exist for schedules

### Phase 3: Config

Target:

1. `config.get`
2. `config.schema`
3. `config.set`
4. `config.patch`
5. `config.apply`
6. `update.run`

Reason:
- highly operator-visible
- good e2e coverage already exists
- contract currently too generic

### Phase 4: Adapters Connections + Adapter Surface

Target:

1. `adapters.connections.*`
2. `adapter.*` runtime methods
3. `adapters.methods`

Reason:
- high external product impact
- many payload shapes already stable

### Phase 5: Channels

Target:

1. `channels.*`

Reason:
- core runtime experience
- likely broad and multi-shape, so needs focused treatment

### Phase 6: Entities / Contacts / Groups / Credentials

Target:

1. `entities.*`
2. `contacts.*`
3. `groups.*`
4. `credentials.*`

Reason:
- identity/API foundation
- likely benefits from shared component schemas

### Phase 7: Jobs Adjacent / DAGs / Workspaces

Target:

1. `dags.*`
2. `workspaces.*`
3. any remaining work-runtime methods

### Phase 8: Records / Events / Tools / Skills / Memory / Remaining Runtime

Target:

1. `record.ingest`, `records.*`
2. `events.*`
3. `tools.*`
4. `skills.*`
5. `memory.*`
6. remaining runtime/system methods

Reason:
- final completion phase after the more product-visible operational domains are solid

Status:
- records/events/skills/remaining runtime publication is completed for the stable public slice
- deeper domain hardening can continue as ordinary contract maintenance, not completion work

## Validation Model

Each phase must do all of the following:

1. update `nex/src/nex/runtime-api/openapi/nex-contract.ts`
2. extend `nex/src/nex/runtime-api/openapi/nex-contract.test.ts` and add focused tests where needed
3. regenerate `contracts/nex/openapi.yaml`
4. prove the targeted methods no longer publish generic request/response schemas where stable shapes exist
5. validate representative live handler outputs against the published response envelopes

## Completion Criteria

The Nex API contract is considered complete when:

1. every HTTP-capable runtime method appears in `contracts/nex/openapi.yaml`
2. generic request/response schemas remain only for methods whose runtime contract is not yet stable enough to publish more narrowly
3. every remaining generic method is explicitly justified in a follow-up workplan or removed from the public API surface
4. the Nex contract test suite provides domain-by-domain conformance for all published stable shapes

## Completion Status

Status: completed.

Completion evidence:

1. every currently published HTTP-capable runtime method appears in `contracts/nex/openapi.yaml`
2. there are `0` remaining generic request/response method schemas in the published Nex OpenAPI artifact
3. domain conformance is passing in `nex/src/nex/runtime-api/openapi/nex-contract.test.ts`
4. the Nex OpenAPI publication path is now in steady-state maintenance rather than backlog completion mode
