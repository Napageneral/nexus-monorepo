# Cutover 06 — Reply Deletion, Automations, Memory Decouple, Cleanup

**Status:** ACTIVE
**Phase:** 0, 7–10 (executes last, after Phases 1–6)
**Target Spec:** [NEXUS_REQUEST_TARGET.md](../NEXUS_REQUEST_TARGET.md) · [AGENT_DELIVERY.md](../AGENT_DELIVERY.md)
**Source Directories:**
- `src/reply/` (90+ source files, hundreds of test files — DELETE)
- `src/nex/automations/hooks-runtime.ts` (targeted changes)
- `src/nex/pipeline.ts` (memory code removal — done in Phase 2)

---

## Part A: Reply Module Archive & Deletion

### Background

The reply module (`src/reply/`) is a legacy parallel code path for agent invocation. In the canonical architecture, all agent invocations go through:
```
pipeline → executeOperation → broker.runAgent()
```

The reply module duplicates automation hooks, memory reader injection, context assembly, typing, block streaming, delivery, and session management. It is being completely eliminated.

### Archive for Adapter SDK Reference

Before deletion, copy the entire `src/reply/` directory to a temporary reference location:

```bash
cp -r src/reply/ /tmp/nexus-reply-archive/
# or
cp -r src/reply/ ../nexus-reply-reference/
```

**Purpose:** The reply module contains typing mode resolution, block chunking strategies, and delivery patterns that should inform the adapter SDK. These patterns are NOT being extracted as code — they are being reimplemented at the adapter layer per AGENT_DELIVERY.md. The archive is reference material for adapter SDK authors.

### Specific patterns to document from the archive before deletion:

| Module | Pattern | Where it goes |
|--------|---------|--------------|
| `reply/typing.ts` | Typing controller state machine (start, seal, TTL) | Adapter SDK default typing helper |
| `reply/typing-mode.ts` | Typing mode resolution (instant/message/thinking/never) | Adapter SDK typing configuration |
| `reply/block-reply-coalescer.ts` | Text coalescer (min/max chars, idle timeout, paragraph break) | Adapter SDK default chunking helper |
| `reply/block-streaming.ts` | Chunking config resolution from channel capabilities | Adapter SDK chunking configuration |
| `reply/streaming-directives.ts` | Streaming text accumulator with inline directive parsing | Adapter SDK streaming handler |
| `reply/reply-dispatcher.ts` | Serialized outbound delivery queue | Adapter SDK delivery queue |
| `reply/normalize-reply.ts` | Reply normalization (strip silent tokens, sanitize) | Adapter SDK reply processing |
| `reply/model-selection.ts` | Fuzzy model matching with Levenshtein distance | Broker model resolution |
| `reply/agent-runner-execution.ts` | Error recovery taxonomy (context overflow, compaction) | Broker error handling |

### Deletion

After archiving:

```bash
rm -rf src/reply/
```

Then remove all imports referencing `src/reply/` from the rest of the codebase. Run a grep:
```bash
grep -r "from.*reply" src/ --include="*.ts" | grep -v "node_modules" | grep -v ".test.ts"
```

Fix every broken import. Most will be in:
- `src/nex/pipeline.ts` (already rewritten in Phase 2)
- `src/nex/stages/runAgent.ts` (already deleted in Phase 2)
- Channel handler files that call `runReplyAgent()`
- Any utility that imports from reply module

---

## Part B: Automations — Collapse evaluateDurableAutomations

### Current State

Two separate functions in `src/nex/automations/hooks-runtime.ts`:

**`evaluateDurableAutomations()`** (~line 1920):
- Hardcoded to `"runAutomations"` hookpoint
- No `broker` parameter — hooks can't launch sub-agents
- Runs ALL hooks concurrently (no blocking/async split)
- Returns **full outcome**: `DurableAutomationsOutcome` (evaluated, fired, handled, handled_by, messages, enrichment, routing_override, per-hook results)
- **Single caller**: `src/nex/stages/runAutomations.ts` (which is being deleted)

**`evaluateAutomationsAtHook()`** (~line 2009):
- Takes arbitrary `hookPoint` string parameter
- Requires `broker: BrokerDispatchHelpers` parameter
- Splits hooks into blocking (sequential) vs async (concurrent)
- Returns **enrichment only**: `Record<string, unknown>`
- **4 callers**: pipeline.ts (worker:pre_execution, after:runAgent, eventIngested), agent-runner-execution.ts (worker:pre_execution, after:runAgent)

### Target: One unified function

```typescript
export interface AutomationsOutcome {
  evaluated: string[];
  fired: string[];
  handled?: boolean;
  handled_by?: string;
  enrichment?: Record<string, string>;
  agent_overrides?: {
    session_key?: string;
    persona_path?: string;
    model?: string;
    provider?: string;
    queue_mode?: string;
    role?: string;
  };
  results?: Array<{
    automation_id: string;
    invocation_id: string;
    duration_ms: number;
    error?: string;
  }>;
}

export async function evaluateAutomationsAtHook(
  hookPoint: string,
  request: NexusRequest,
  runtime: StageRuntime,
  services: { ledgerClient: LedgerClient; memoryClient: MemoryClient; llmClient: LLMClient },
  broker?: BrokerDispatchHelpers,  // optional now
): Promise<AutomationsOutcome> {
  // 1. Load automations matching this hookPoint
  // 2. Split into blocking (sequential) and async (concurrent)
  // 3. Run blocking hooks first, collect results
  // 4. Run async hooks concurrently, collect results
  // 5. Assemble and return full AutomationsOutcome
}
```

### Changes:
1. Make `broker` parameter optional (was required)
2. Widen return type from `Record<string, unknown>` to `AutomationsOutcome`
3. Move outcome-assembly logic from `evaluateDurableAutomations` into `evaluateAutomationsAtHook`
4. DELETE `evaluateDurableAutomations` function entirely
5. RENAME `DurableAutomationsOutcome` → `AutomationsOutcome`
6. Update all callers to use the unified function
7. Callers that only need enrichment: destructure `{ enrichment }` from result

### Caller updates:

| Caller | Current | Target |
|--------|---------|--------|
| `stages/runAutomations.ts` | Calls `evaluateDurableAutomations()` | FILE DELETED (Phase 2) |
| `pipeline.ts` (worker:pre_execution) | Calls `evaluateAutomationsAtHook()`, gets enrichment | Calls unified function, uses `{ enrichment }` |
| `pipeline.ts` (after:runAgent) | Calls `evaluateAutomationsAtHook()`, fire-and-forget | Calls unified function, fire-and-forget |
| `pipeline.ts` (eventIngested) | Calls `evaluateAutomationsAtHook()`, fire-and-forget | Moves to hookpoint system |
| `agent-runner-execution.ts` | Calls `evaluateAutomationsAtHook()` | FILE DELETED (reply module deletion) |

After all Phase 2 + reply deletion, the only callers are pipeline hookpoints using the unified function.

### Additional cleanup:
- Remove `routing_override` from automation output — session targeting (target_kind, from_turn_id, label_hint, smart) is broker-internal
- Rename `TriggerContext` → `AutomationContext` across the codebase (this is mostly done in Phase 1 via request.ts, but grep for any remaining references)

---

## Part C: Memory Decouple

### What to remove from pipeline.ts (covered in Phase 2, listed here for completeness)

**1. `queueRetainEvent()` call (pipeline.ts lines 552-568):**
```typescript
// DELETE this entire block:
if (!failed && stageSet.has("receiveEvent")) {
  const nexusDb = runtime.dependencies.ledgers?.nexus;
  if (nexusDb) {
    try {
      queueRetainEvent(nexusDb, { ... });
    } catch { }
  }
}
```

**2. Background retain flush (pipeline.ts lines 570-741):**
```typescript
// DELETE this entire 170-line block:
if (!failed && stageSet.has("receiveEvent") && !retainFlushInFlight) {
  // ... episode loading, retain/consolidate dispatching ...
}
```

**3. Module-level state (pipeline.ts line 134):**
```typescript
// DELETE:
let retainFlushInFlight = false;
```

**4. Memory imports (pipeline.ts lines 8-19):**
```typescript
// DELETE all memory imports:
import { loadUnconsolidatedEpisodeFactIds, markEpisodeEventsRetained, runHookAndRequireSuccess } from "../memory/retain-dispatch.js";
import { buildEpisodeConsolidationNexusEvent, buildEpisodeRetainNexusEvent, listDueRetainTriggers, loadEpisodesForTrigger, queueRetainEvent, refreshRetainTriggerWindow } from "../memory/retain-live.js";
```

### What stays

- `pending_retain_triggers` table in runtime.db — stays (episode detection workstream uses it)
- Memory system itself (`src/memory/`) — stays, becomes event-driven subscriber
- The hookpoint `worker:pre_execution` (memory-reader) — stays but fires via hookpoint system, not inline

### Memory architecture in target state

1. Event ingested → stored in events table
2. Episode detection runs (using pending_retain_triggers — separate workstream)
3. When episode boundary detected → `episode-created` event fires
4. `memory-writer` automation subscribes → runs retain
5. After retain → `memory-consolidator` chains off results

The pipeline has ZERO memory code. Memory is fully decoupled.

---

## Part D: Delivery Tool Consolidation

### Current state

AGENT_DELIVERY.md spec shows two separate tools:
- `reply_to_caller(content)` — reply on same channel
- `send_message(platform, target, content, ...)` — send to explicit target

### Target: One consolidated tool

Per user decision, these should be ONE tool. The tool should be smart enough to:
- If no platform/target specified → reply on the inbound channel (same as reply_to_caller)
- If platform/target specified → send to that target (same as send_message)

```typescript
// Single delivery tool:
agent_deliver({
  content: string;
  // Optional targeting — if omitted, replies on inbound channel
  platform?: string;
  target?: string;
  account_id?: string;
  thread_id?: string;
  reply_to_id?: string;
})
```

### Action items:
- [ ] Update AGENT_DELIVERY.md spec to show one consolidated tool
- [ ] Remove the two-tool section, replace with single tool
- [ ] Update the architecture diagram in the spec
- [ ] The actual tool implementation is broker work, not part of this cutover

---

## Part E: Final Cleanup

### Dead import sweep

After all phases complete, sweep the entire codebase for:
- Imports from deleted modules (reply/, deleted stage files)
- References to deleted types (SenderContext, ReceiverContext, EventContext, DeliveryContext, etc.)
- References to old field names (delivery.platform, event.event_id, triggers.*, response.*, delivery_result.*)

```bash
# Find broken imports
grep -r "from.*reply" src/ --include="*.ts"
grep -r "SenderContext\|ReceiverContext\|EventContext\|DeliveryContext" src/ --include="*.ts"
grep -r "TriggerContext\|ResponseContext\|DeliveryResult" src/ --include="*.ts"
grep -r "request\.event\.\|request\.delivery\.\|request\.sender\.\|request\.receiver\.\|request\.triggers\.\|request\.response\.\|request\.delivery_result\." src/ --include="*.ts"
grep -r "request\.pipeline\b" src/ --include="*.ts"  # should be request.stages
grep -r "PipelineTrace" src/ --include="*.ts"  # should be StageTrace
grep -r "appendPipelineTrace\|parseNexusEvent" src/ --include="*.ts"  # renamed functions
```

### Test file updates

Every test file that constructs NexusRequest objects, mock events, or references old types needs updating. This is mechanical but voluminous. Key test directories:
- `src/nex/*.test.ts`
- `src/nex/stages/*.test.ts`
- `src/nex/automations/*.test.ts`
- `src/db/*.test.ts`

### Status value update

Search for `"handled_by_automation"` across the codebase and replace with the new pattern (`status: "completed"` + check `automations.handled`).

```bash
grep -r "handled_by_automation" src/ --include="*.ts"
```

---

## Mechanical Checklist

### Reply Module
- [ ] Archive `src/reply/` to reference location
- [ ] Document adapter SDK patterns from archive
- [ ] Delete `src/reply/` directory
- [ ] Fix all broken imports across codebase
- [ ] Remove all reply-related exports from barrel files

### Automations
- [ ] Make `broker` parameter optional in `evaluateAutomationsAtHook`
- [ ] Widen return type to `AutomationsOutcome`
- [ ] Move outcome-assembly logic from `evaluateDurableAutomations` into unified function
- [ ] Delete `evaluateDurableAutomations` function
- [ ] Rename `DurableAutomationsOutcome` → `AutomationsOutcome`
- [ ] Remove `routing_override` from automation output
- [ ] Rename TriggerContext → AutomationContext in all remaining references
- [ ] Update all callers

### Memory
- [ ] Delete `queueRetainEvent()` call from pipeline (Phase 2)
- [ ] Delete background retain flush from pipeline (Phase 2)
- [ ] Delete memory imports from pipeline (Phase 2)
- [ ] Delete `retainFlushInFlight` module state (Phase 2)
- [ ] Verify memory system still works as event-driven subscriber

### Delivery
- [ ] Update AGENT_DELIVERY.md — consolidate two tools into one
- [ ] Update architecture diagram in spec

### Final Sweep
- [ ] Grep for all broken imports and fix
- [ ] Grep for all deleted type references and fix
- [ ] Grep for old field access patterns and fix
- [ ] Update all test files for new types
- [ ] Replace "handled_by_automation" status with new pattern
- [ ] Run full test suite
- [ ] Fix all failures
