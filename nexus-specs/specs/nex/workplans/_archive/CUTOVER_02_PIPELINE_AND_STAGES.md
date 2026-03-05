# Cutover 02 — Pipeline & Stages Rewrite

**Status:** COMPLETE (ARCHIVED)
**Phase:** 2 (depends on Phase 1)
**Target Spec:** [NEXUS_REQUEST_TARGET.md](../NEXUS_REQUEST_TARGET.md) · [AGENT_DELIVERY.md](../AGENT_DELIVERY.md)
**Source Files:**
- `src/nex/stages/index.ts` (43 lines → rewrite)
- `src/nex/stages/types.ts` (rewrite — stage type definitions)
- `src/nex/pipeline.ts` (787 lines → rewrite)
- `src/nex/nex.ts` (large — rewrite processEvent)
- `src/nex/stages/*.ts` (individual stage files — delete or rewrite)

---

## Summary

Rewrite the pipeline from 8 stages to 5 stages. Remove the two-phase split from `nex.ts`. Move SessionQueue inside the broker. Remove inline memory retain code. Automations become hookpoints at stage boundaries instead of a dedicated stage.

---

## Stage Changes

### Current 8 stages (src/nex/stages/index.ts):
```
receiveEvent → resolvePrincipals → resolveAccess → runAutomations →
assembleContext → runAgent → deliverResponse → finalize
```

### Target 5 stages:
```
acceptRequest → resolvePrincipals → resolveAccess → executeOperation → finalizeRequest
```

### Stage Mapping

| Current Stage | Target | Action |
|--------------|--------|--------|
| `receiveEvent` | `acceptRequest` | RENAME + simplify |
| `resolvePrincipals` | `resolvePrincipals` | REWRITE (Entity instead of SenderContext/ReceiverContext) |
| `resolveAccess` | `resolveAccess` | REWRITE (simplified AccessContext) |
| `runAutomations` | — | DELETE as stage. Automations fire as hookpoints at stage boundaries. |
| `assembleContext` | — | DELETE as stage. Part of executeOperation/broker. |
| `runAgent` | — | DELETE as stage. Part of executeOperation/broker. |
| `deliverResponse` | — | DELETE as stage. Agent-driven delivery via tools. |
| `finalize` | `finalizeRequest` | RENAME + simplify |
| — | `executeOperation` | NEW stage. Dispatches to operation handlers. |

---

## File: `src/nex/stages/index.ts`

### Current (lines 20-40):
```typescript
export interface NEXPipelineStages {
  receiveEvent: ReceiveEventStage;
  resolvePrincipals: ResolvePrincipalsStage;
  resolveAccess: ResolveAccessStage;
  runAutomations: RunAutomationsStage;
  assembleContext: AssembleContextStage;
  runAgent: RunAgentStage;
  deliverResponse: DeliverResponseStage;
  finalize: FinalizeStage;
}
```

### Target:
```typescript
export type PipelineStageName =
  | "acceptRequest"
  | "resolvePrincipals"
  | "resolveAccess"
  | "executeOperation"
  | "finalizeRequest";

export interface PipelineStages {
  acceptRequest: AcceptRequestStage;
  resolvePrincipals: ResolvePrincipalsStage;
  resolveAccess: ResolveAccessStage;
  executeOperation: ExecuteOperationStage;
  finalizeRequest: FinalizeRequestStage;
}

// Stage function signatures
export type AcceptRequestStage = (
  request: NexusRequest,
  runtime: StageRuntime,
) => Promise<void>;

export type ResolvePrincipalsStage = (
  request: NexusRequest,
  runtime: StageRuntime,
) => Promise<void>;

export type ResolveAccessStage = (
  request: NexusRequest,
  runtime: StageRuntime,
) => Promise<void>;

export type ExecuteOperationStage = (
  request: NexusRequest,
  runtime: StageRuntime,
) => Promise<void>;

export type FinalizeRequestStage = (
  request: NexusRequest,
  runtime: StageRuntime,
) => Promise<void>;
```

### Files to DELETE:
- `src/nex/stages/assembleContext.ts` — logic moves into broker
- `src/nex/stages/runAgent.ts` — logic moves into broker (this is 3600+ lines)
- `src/nex/stages/deliverResponse.ts` — agent-driven delivery replaces this
- `src/nex/stages/runAutomations.ts` — automations are hookpoints now

### Files to REWRITE:
- `src/nex/stages/receiveEvent.ts` → rename to `acceptRequest.ts`, update types
- `src/nex/stages/resolvePrincipals.ts` → rewrite to produce Entity objects
- `src/nex/stages/resolveAccess.ts` → rewrite for simplified AccessContext
- `src/nex/stages/finalize.ts` → rename to `finalizeRequest.ts`

### File to CREATE:
- `src/nex/stages/executeOperation.ts` — dispatches to operation handlers

---

## File: `src/nex/pipeline.ts` (787 lines → rewrite)

### What to DELETE

**1. The 8-stage loop (lines 326-527)**
Replace with a 5-stage loop. The loop structure stays the same (iterate stages, call `runStage`, check early exit, run after-stage hooks), but with 5 stages instead of 8.

**2. Inline memory retain code (lines 552-741)**
This entire 190-line block handles:
- `queueRetainEvent()` call after receiveEvent (lines 552-568)
- Background retain flush with episode loading, retain/consolidate dispatching (lines 570-741)

DELETE ALL OF IT. Memory is event-driven in the target architecture. The pipeline does not call memory functions.

**3. Inline `eventIngested` hook fire (lines 530-549)**
This fires automations when an event is ingested but the pipeline early-exits (denied/handled). In the target architecture, this becomes a hookpoint at the `afterAcceptRequest` boundary.

DELETE the inline block. The hookpoint system handles it.

**4. The `worker:pre_execution` automation evaluation inside runAgent (lines 446-484)**
This evaluates memory-reader and other pre-execution hooks inline inside the runAgent stage. In the target architecture, this is a hookpoint at the `beforeExecuteOperation` boundary.

DELETE — this entire block is inside the stage that's being deleted.

**5. The `after:runAgent` automation fire-and-forget (lines 494-508)**
Same — becomes an `afterExecuteOperation` hookpoint.

**6. `assembled_context` tracking (lines 307, 411-435)**
The pipeline currently tracks `assembled_context` as a return value so it can be passed to `runAgent`. In the target architecture, context assembly is inside `executeOperation`/broker, not a pipeline concern.

DELETE the `assembled_context` variable and return type field.

**7. Stage plugin hooks for deleted stages (lines 136-153)**
Remove hook names for deleted stages: `afterRunAutomations`, `afterAssembleContext`, `afterRunAgent`, `afterDeliverResponse`.

### What to KEEP (modified)

**1. `runStage()` helper function (lines 231-272)**
Keep the structure. Update to use `StageTrace` instead of `PipelineTrace`, call `appendStageTrace` instead of `appendPipelineTrace`.

**2. Plugin hook system (lines 136-196)**
Keep but update hook names:

```typescript
type PluginAfterHookName =
  | "afterAcceptRequest"
  | "afterResolvePrincipals"
  | "afterResolveAccess"
  | "afterExecuteOperation"
  | "afterFinalizeRequest";

const STAGE_PLUGIN_HOOKS: Record<PipelineStageName, PluginAfterHookName | null> = {
  acceptRequest: "afterAcceptRequest",
  resolvePrincipals: "afterResolvePrincipals",
  resolveAccess: "afterResolveAccess",
  executeOperation: "afterExecuteOperation",
  finalizeRequest: null,  // finalize has onFinalize instead
};
```

**3. `shouldEarlyExit()` (lines 125-131)**
Update for new status values:
```typescript
function shouldEarlyExit(request: NexusRequest): boolean {
  return request.status === "denied" || request.status === "skipped";
}
```
Note: no more `"handled_by_automation"` — that's now `status: "completed"` + `automations.handled === true`. Whether to early-exit on `automations.handled` is a hookpoint concern, not a pipeline concern. The `executeOperation` stage checks `automations.handled` and skips agent invocation if true.

**4. `runNEXPipelineStages()` (lines 274-761)**
Rewrite to run 5 stages:

```typescript
export async function runPipelineStages(
  request: NexusRequest,
  stagesToRun: PipelineStageName[],
  opts?: PipelineOptions,
): Promise<void> {
  // same structure as today but:
  // - 5 stages instead of 8
  // - no assembled_context tracking
  // - no inline memory code
  // - hookpoints fire after each stage via plugin system
  // - automations evaluate at hookpoints, not as a stage
}
```

**5. `runNEXPipeline()` entry point (lines 763-786)**
Rewrite to use new stage names:

```typescript
export async function runPipeline(
  rawInput: unknown,
  opts?: PipelineOptions,
): Promise<NexusRequest> {
  const input = parseNexusInput(rawInput);
  const request = createNexusRequest(input, {
    request_id: opts?.request_id,
    created_at: opts?.created_at ?? (opts?.now ?? Date.now)(),
  });
  await runPipelineStages(
    request,
    ["acceptRequest", "resolvePrincipals", "resolveAccess", "executeOperation", "finalizeRequest"],
    opts,
  );
  return request;
}
```

### Target `pipeline.ts` structure:

```
Imports
PipelineOptions interface
runStage() helper
shouldEarlyExit() helper
Plugin hook helpers (sortPlugins, runAfterStagePlugins, etc.)
runPipelineStages() — the 5-stage loop
runPipeline() — convenience entry point
```

Estimated size: ~200-250 lines (down from 787).

---

## File: `src/nex/nex.ts` — processEvent rewrite

### Current two-phase split

Today `processEvent()` does:

**Phase 1** (inline):
```typescript
await runNEXPipelineStages(seed,
  ["receiveEvent", "resolvePrincipals", "resolveAccess", "runAutomations"], opts);
```

**Phase 2** (inside SessionQueue.enqueue):
```typescript
this.sessionQueue.enqueue(laneSessionLabel, {
  run: async () => {
    await runNEXPipelineStages(seed,
      ["assembleContext", "runAgent", "deliverResponse", "finalize"], opts);
  }
});
```

### Target architecture

The pipeline runs all 5 stages. SessionQueue is INSIDE the broker, not at the `nex.ts` level.

```typescript
async processEvent(input: unknown, opts = {}): Promise<NexusRequest> {
  const parsed = parseNexusInput(input);
  const request = createNexusRequest(parsed, {
    created_at: Date.now(),
    request_id: opts.request_id,
  });

  await runPipelineStages(request,
    ["acceptRequest", "resolvePrincipals", "resolveAccess", "executeOperation", "finalizeRequest"],
    {
      ledgers: this.ledgers,
      policies: this.options.policies,
      plugins: this.options.plugins,
      broker: this.broker,  // NEW — broker passed as a dependency
      // ... other deps
    },
  );

  return request;
}
```

**What happens inside `executeOperation`:**
1. The stage dispatches based on `request.operation`
2. For `event.ingest`: checks if receiver is a local agent (entity type "agent" + has persona)
3. If yes → calls `this.broker.runAgent(request)` — broker owns SessionQueue internally
4. If no (e.g., webhook, system event) → handles directly
5. For other operations (`event.backfill`, `config.*`, `acl.*`, etc.) → dispatches to the appropriate handler

**The broker is a dependency**, not a stage. It's passed into the pipeline via options. The `executeOperation` stage calls into it.

### What to DELETE from nex.ts

1. `this.sessionQueue` — SessionQueue instance moves into broker
2. `this.sessionQueueMode` — broker-internal
3. `this.sessionQueueSettings` — broker-internal
4. `deriveRequestedQueueMode()` — broker-internal
5. `deriveRequestedQueueSettings()` — broker-internal
6. `resolveEffectiveQueueSettings()` — broker-internal
7. `normalizeQueueSettings()` — broker-internal
8. `resolveOrCreateQueueSessionLabel()` — broker-internal
9. `buildDurableQueueItemPayload()` — broker-internal
10. `PreprocessedQueueItem` type — broker-internal
11. The entire Phase 1 / Phase 2 split logic
12. `buildDuplicateInboundResult()` — dedup moves into `acceptRequest` stage
13. `hasSeenInboundEvent()` — dedup moves into `acceptRequest` stage
14. `linkAbortSignals()` — broker-internal

### What to KEEP from nex.ts (modified)

1. `NEX` class structure and constructor
2. `AdapterManager` lifecycle management
3. `loadMonitorsFromConfig`, `startMonitorsFromConfig`
4. Backfill orchestration
5. Pipeline metrics tracking
6. `enqueueRequest()` — for internal request dispatching (memory retain, sub-agents)

---

## New File: `src/nex/stages/executeOperation.ts`

This is the operation dispatcher. Structure:

```typescript
import type { NexusRequest } from "../request.js";
import type { StageRuntime } from "./types.js";

export async function executeOperationStage(
  request: NexusRequest,
  runtime: StageRuntime,
): Promise<void> {
  const handler = runtime.operationHandlers[request.operation];
  if (!handler) {
    throw new Error(`Unknown operation: ${request.operation}`);
  }
  await handler(request, runtime);
}
```

Operation handlers are registered on the runtime:

```typescript
interface StageRuntime {
  now: () => number;
  dependencies: {
    ledgers?: LedgerConnections;
    policies?: ACLPolicy[];
    broker?: Broker;
    // ...
  };
  operationHandlers: Record<string, OperationHandler>;
}

type OperationHandler = (request: NexusRequest, runtime: StageRuntime) => Promise<void>;
```

Built-in operation handlers:
- `"event.ingest"` — check if receiver is local agent → broker.runAgent(). Otherwise just persist event.
- `"event.backfill"` — run backfill job
- `"memory.backfill"` — run memory backfill
- Future: `"config.*"`, `"acl.*"`, `"contacts.import"`, etc.

---

## Stage Implementation Notes

### `acceptRequest` (renamed from receiveEvent)

Responsibilities per spec:
- Parse and stamp the request envelope
- Assign IDs
- Normalize transport
- Deduplicate via `UNIQUE(platform, event_id)` — attempt INSERT, if conflict → set status to "skipped"

The current `receiveEvent` stage already does most of this. Rewrite to:
- Use canonical Routing/Payload types
- Move dedup check here (currently in `nex.ts` via `hasSeenInboundEvent()`)
- Don't call `queueRetainEvent()` — memory is decoupled

### `resolvePrincipals` (rewrite)

The current stage resolves SenderContext/ReceiverContext. Rewrite to:
- Resolve `routing.sender` → canonical Entity via contacts table
- Resolve `routing.receiver` → canonical Entity via contacts table
- Auto-create Entity rows for unknown senders (with appropriate type: "person", "business", etc.)
- Resolve recipients from `payload.recipients` → Entity[]
- Hydrate `entity.tags` from `entity_tags` table (active rows)
- Hydrate `entity.persona_path` from `entity_persona` table
- Set `agent.session_key` and `agent.persona_path` if receiver is an agent entity
- Update `container_participants` in identity.db

### `resolveAccess` (rewrite)

Rewrite to produce simplified AccessContext:
- Binary allow/deny (no "ask" on bus)
- `"ask"` internally resolved to "deny" + permission_request row
- No data_access, no routing sub-object
- Permissions: tools (allow/deny lists) + credentials

### `finalizeRequest` (renamed from finalize)

- Persist pipeline trace via NexusRequest upsert
- Set final status
- No delivery result tracking (agent-driven delivery records its own outbound events)

---

## Hookpoint Integration

After each stage, the hookpoint system fires:

```
acceptRequest → [hookpoint: afterAcceptRequest] → upsert NexusRequest
resolvePrincipals → [hookpoint: afterResolvePrincipals] → upsert NexusRequest
resolveAccess → [hookpoint: afterResolveAccess] → upsert NexusRequest
executeOperation → [hookpoint: afterExecuteOperation] → upsert NexusRequest
finalizeRequest → done
```

The NexusRequest is upserted (persisted) after each stage completes. This provides durability — if the process crashes mid-pipeline, the last completed stage is recorded.

Automations that were previously evaluated during the `runAutomations` stage now fire at the `beforeExecuteOperation` hookpoint. The `worker:pre_execution` memory-reader fires there too.

---

## Mechanical Checklist

### stages/index.ts
- [ ] Define new `PipelineStageName` type (5 stages)
- [ ] Define new `PipelineStages` interface (5 stage functions)
- [ ] Export new stage type signatures
- [ ] Delete imports of removed stage types

### Stage files
- [ ] Rename `receiveEvent.ts` → `acceptRequest.ts`, update stage function
- [ ] Rewrite `resolvePrincipals.ts` — Entity resolution instead of SenderContext/ReceiverContext
- [ ] Rewrite `resolveAccess.ts` — simplified AccessContext
- [ ] Create `executeOperation.ts` — operation dispatcher
- [ ] Rename `finalize.ts` → `finalizeRequest.ts`
- [ ] DELETE `runAutomations.ts`
- [ ] DELETE `assembleContext.ts`
- [ ] DELETE `runAgent.ts` (3600+ lines)
- [ ] DELETE `deliverResponse.ts`

### pipeline.ts
- [ ] Rewrite stage loop for 5 stages
- [ ] Update plugin hook names
- [ ] Delete all inline memory code (lines 530-741)
- [ ] Delete assembled_context tracking
- [ ] Update shouldEarlyExit() for new status values
- [ ] Rename PipelineTrace → StageTrace throughout
- [ ] Rename appendPipelineTrace → appendStageTrace
- [ ] Update return type (no more assembled_context)
- [ ] Rename runNEXPipeline → runPipeline (optional)

### nex.ts
- [ ] Remove SessionQueue from NEX class (moves to broker)
- [ ] Remove all queue-related helper functions
- [ ] Remove two-phase pipeline split
- [ ] Rewrite processEvent() to run all 5 stages in one call
- [ ] Pass broker as dependency to pipeline
- [ ] Move dedup check into acceptRequest stage
- [ ] Remove inline memory code references
- [ ] Update all type imports from request.ts
