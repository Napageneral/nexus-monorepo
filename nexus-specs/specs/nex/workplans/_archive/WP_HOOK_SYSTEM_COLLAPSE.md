# Workplan: Hook System Unification

**Status:** COMPLETED — commit 9c3da712c
**Created:** 2026-03-04
**Spec References:**
- [HOOK_SYSTEM_UNIFICATION.md](../HOOK_SYSTEM_UNIFICATION.md)
- [API_DESIGN_BATCH_4.md](../API_DESIGN_BATCH_4.md)
- [MEESEEKS_PATTERN.md](../../agents/MEESEEKS_PATTERN.md)

**Dependencies:** None (foundational, should be done early)

---

## Goal

Collapse four separate hook systems into one: the `automations` table and `evaluateAutomationsAtHook()` become the only hook execution path. Establish 19 canonical hook points with colon-delimited naming. Internal hooks, NEXPlugin methods, and OpenClaw plugin hooks are absorbed, mapped, or eliminated.

**Hard cutover. No backwards compatibility.**

---

## Current State

### Four Separate Systems

1. **System 1: Automations (DB-backed)** — Target system. `automations` table + `evaluateAutomationsAtHook()`. Currently uses 6 hook points: `worker:pre_execution`, `episode-created`, `episode-retained`, `command:execute`, `runtime:startup`, `runAutomations` (legacy)

2. **System 2: Internal Hooks** — In-process callbacks registered via `registerInternalHook()`, fired by `triggerInternalHook()`. Uses `type:action` naming. Hook points: `command:new`, `command:reset`, `command:stop`, `command:compact`, `command:status`, `command:model`, `session:start`, `session:end`, `agent:bootstrap`, `runtime:startup`

3. **System 3: NEXPlugin** — Typed plugin interface with methods like `afterAcceptRequest()`, `afterResolvePrincipals()`, etc. Called by `runAfterStagePlugins()` in pipeline. CamelCase naming.

4. **System 4: OpenClaw Plugin** — Upstream inherited hooks with snake_case naming: `before_agent_start`, `agent_end`, `session_start`, `session_end`, etc.

### Naming Inconsistencies

- Automations: `episode-created` (hyphenated)
- Internal hooks: `command:new` (colon-delimited)
- NEXPlugin: `afterAcceptRequest` (camelCase)
- OpenClaw: `before_agent_start` (snake_case)
- Spec says: `episode:created` / `nex:startup` (colon-delimited)
- Code uses: `episode-created` / `runtime:startup` (mixed)

---

## Target State

### One System: Automations

All hook execution goes through:
1. `automations` table in nexus.db
2. `evaluateAutomationsAtHook(hookPoint: string, context: HookContext)` runtime function

Internal hooks, NEXPlugin, and OpenClaw plugins are eliminated as separate systems.

### 19 Canonical Hook Points

Colon-delimited, lowercase naming convention:

#### Pipeline Hooks (6)

| Hook Point | Blocking? | Description |
|-----------|----------|-------------|
| `after:acceptRequest` | yes | After event parsing and request creation |
| `after:resolvePrincipals` | yes | After entity resolution |
| `after:resolveAccess` | yes | After IAM policy evaluation |
| `before:executeOperation` | yes | Before operation dispatch |
| `after:executeOperation` | yes | After operation completes |
| `after:finalizeRequest` | no | After persistence and cleanup |

#### Broker Hooks (1)

| Hook Point | Blocking? | Description |
|-----------|----------|-------------|
| `worker:pre_execution` | yes | Before agent LLM execution (memory injection) |

#### Memory Hooks (2)

| Hook Point | Blocking? | Description |
|-----------|----------|-------------|
| `episode:created` | no | Episode clipped, ready for retention |
| `episode:retained` | no | Writer completed, facts extracted |

#### Lifecycle Hooks (5)

| Hook Point | Blocking? | Description |
|-----------|----------|-------------|
| `runtime:startup` | no | Daemon has started |
| `runtime:shutdown` | no | Daemon is shutting down |
| `session:start` | no | Session created or resumed |
| `session:end` | no | Session archived or closed |
| `agent:bootstrap` | yes | Agent first-run initialization |

#### Command Hooks (5)

| Hook Point | Blocking? | Description |
|-----------|----------|-------------|
| `command:new` | no | User started a new session (`/new` command) |
| `command:execute` | no | Command executed |
| `command:reset` | no | Session reset |
| `command:stop` | no | Agent execution stopped |
| `command:compact` | no | Manual compaction triggered |

### 5 Bundled Automations (Confirmed)

| Name | Hook Point | Blocking | Workspace | Description |
|------|-----------|----------|-----------|-------------|
| memory-reader | `worker:pre_execution` | yes | workspace/memory-reader | Pre-execution memory context injection |
| memory-writer | `episode:created` | no | workspace/memory-writer | Extract facts and entities from episodes |
| memory-consolidator | `episode:retained` | no | workspace/memory-consolidator | Build observations, detect causal links |
| command-logger | `command:execute` | no | (none) | Log command execution |
| boot-md | `runtime:startup` | no | (none) | Run BOOT.md on daemon start |

---

## Changes Required

### Database Schema

No schema changes — `automations` table already exists in nexus.db. Only change is renaming hook points in existing rows.

**Data migration:**
```sql
-- Rename hyphenated to colon-delimited
UPDATE automations SET hook_point = 'episode:created' WHERE hook_point = 'episode-created';
UPDATE automations SET hook_point = 'episode:retained' WHERE hook_point = 'episode-retained';

-- Remove legacy runAutomations
DELETE FROM automations WHERE hook_point = 'runAutomations';
```

### New Code

**File:** `src/nex/automations/hook-points.ts` (new file)

Define canonical hook point registry:

```typescript
export type HookPointCategory = 'pipeline' | 'broker' | 'memory' | 'lifecycle' | 'command';

export interface HookPointDefinition {
  name: string;
  category: HookPointCategory;
  blocking: boolean;
  description: string;
}

export const HOOK_POINTS: Record<string, HookPointDefinition> = {
  // Pipeline hooks
  'after:acceptRequest': {
    name: 'after:acceptRequest',
    category: 'pipeline',
    blocking: true,
    description: 'After event parsing and request creation',
  },
  'after:resolvePrincipals': {
    name: 'after:resolvePrincipals',
    category: 'pipeline',
    blocking: true,
    description: 'After entity resolution',
  },
  'after:resolveAccess': {
    name: 'after:resolveAccess',
    category: 'pipeline',
    blocking: true,
    description: 'After IAM policy evaluation',
  },
  'before:executeOperation': {
    name: 'before:executeOperation',
    category: 'pipeline',
    blocking: true,
    description: 'Before operation dispatch',
  },
  'after:executeOperation': {
    name: 'after:executeOperation',
    category: 'pipeline',
    blocking: true,
    description: 'After operation completes',
  },
  'after:finalizeRequest': {
    name: 'after:finalizeRequest',
    category: 'pipeline',
    blocking: false,
    description: 'After persistence and cleanup',
  },

  // Broker hooks
  'worker:pre_execution': {
    name: 'worker:pre_execution',
    category: 'broker',
    blocking: true,
    description: 'Before agent LLM execution',
  },

  // Memory hooks
  'episode:created': {
    name: 'episode:created',
    category: 'memory',
    blocking: false,
    description: 'Episode clipped, ready for retention',
  },
  'episode:retained': {
    name: 'episode:retained',
    category: 'memory',
    blocking: false,
    description: 'Writer completed, facts extracted',
  },

  // Lifecycle hooks
  'runtime:startup': {
    name: 'runtime:startup',
    category: 'lifecycle',
    blocking: false,
    description: 'Daemon has started',
  },
  'runtime:shutdown': {
    name: 'runtime:shutdown',
    category: 'lifecycle',
    blocking: false,
    description: 'Daemon is shutting down',
  },
  'session:start': {
    name: 'session:start',
    category: 'lifecycle',
    blocking: false,
    description: 'Session created or resumed',
  },
  'session:end': {
    name: 'session:end',
    category: 'lifecycle',
    blocking: false,
    description: 'Session archived or closed',
  },
  'agent:bootstrap': {
    name: 'agent:bootstrap',
    category: 'lifecycle',
    blocking: true,
    description: 'Agent first-run initialization',
  },

  // Command hooks
  'command:new': {
    name: 'command:new',
    category: 'command',
    blocking: false,
    description: 'User started a new session',
  },
  'command:execute': {
    name: 'command:execute',
    category: 'command',
    blocking: false,
    description: 'Command executed',
  },
  'command:reset': {
    name: 'command:reset',
    category: 'command',
    blocking: false,
    description: 'Session reset',
  },
  'command:stop': {
    name: 'command:stop',
    category: 'command',
    blocking: false,
    description: 'Agent execution stopped',
  },
  'command:compact': {
    name: 'command:compact',
    category: 'command',
    blocking: false,
    description: 'Manual compaction triggered',
  },
};

export function getHookPoint(name: string): HookPointDefinition | null {
  return HOOK_POINTS[name] ?? null;
}

export function listHookPoints(category?: HookPointCategory): HookPointDefinition[] {
  const all = Object.values(HOOK_POINTS);
  if (!category) return all;
  return all.filter(h => h.category === category);
}
```

**File:** `src/nex/control-plane/server-methods/automations.ts` (extend existing)

Add `automations.hookpoints.list` operation handler:

```typescript
import { listHookPoints, type HookPointCategory } from '../../automations/hook-points.js';

export function handleAutomationsHookpointsList(
  params: { category?: HookPointCategory }
) {
  const hookPoints = listHookPoints(params.category);
  return { hookPoints };
}
```

### Modified Files

#### System 2: Internal Hooks → Absorbed

**File:** `src/nex/automations/internal-hooks.ts` (or wherever `registerInternalHook` lives)

**Delete this file entirely.** All functions (`registerInternalHook`, `triggerInternalHook`, internal hook registry) are removed.

**Files that currently register internal hooks:**

Search for: `registerInternalHook(` and convert each registration to an automation.

Example locations (based on typical patterns):
- `src/commands/agent/command-handlers.ts` — command hooks
- `src/nex/control-plane/boot.ts` — runtime:startup
- `src/sessions/lifecycle.ts` — session:start, session:end
- `src/agents/bootstrap.ts` — agent:bootstrap

**Migration pattern:**

```typescript
// Old:
registerInternalHook('command:new', async (context) => {
  // handler code
});

// New:
// Create an automation in the database or bundled registry:
{
  id: 'builtin-command-new-handler',
  name: 'Command New Handler',
  hook_point: 'command:new',
  blocking: 0,
  script_path: 'builtin://command-new-handler',
  // ... other fields
}

// The handler code becomes a bundled automation script
```

**Files that trigger internal hooks:**

Search for: `triggerInternalHook(` and replace with `evaluateAutomationsAtHook(hookPoint, context)`.

#### System 3: NEXPlugin → Becomes Implementation

**File:** `src/nex/plugin.ts` (or wherever NEXPlugin interface is defined)

**Keep the interface** but rename methods to match canonical hook points and make it clear it's internal implementation:

```typescript
// Old:
export interface NEXPlugin {
  afterAcceptRequest?(request: NexusRequest, runtime: StageRuntime): Promise<void>;
  afterResolvePrincipals?(request: NexusRequest, runtime: StageRuntime): Promise<void>;
  afterResolveAccess?(request: NexusRequest, runtime: StageRuntime): Promise<void>;
  // ...
}

// New:
export interface NEXPluginInternal {
  // These methods emit hook points by calling evaluateAutomationsAtHook()
  emitAfterAcceptRequest?(request: NexusRequest, runtime: StageRuntime): Promise<void>;
  emitAfterResolvePrincipals?(request: NexusRequest, runtime: StageRuntime): Promise<void>;
  emitAfterResolveAccess?(request: NexusRequest, runtime: StageRuntime): Promise<void>;
  // ...
}
```

**File:** `src/nex/stages/*.ts` (all pipeline stages)

Update calls from `runAfterStagePlugins('afterAcceptRequest')` to explicitly emit hook point:

```typescript
// Old:
await runAfterStagePlugins('afterAcceptRequest', request, runtime);

// New:
await evaluateAutomationsAtHook('after:acceptRequest', {
  request,
  runtime,
});
```

**Mapping NEXPlugin methods to hook points:**

| NEXPlugin Method | Hook Point |
|-----------------|-----------|
| `afterAcceptRequest` | `after:acceptRequest` |
| `afterResolvePrincipals` | `after:resolvePrincipals` |
| `afterResolveAccess` | `after:resolveAccess` |
| `afterExecuteOperation` | `after:executeOperation` |
| `onFinalize` | `after:finalizeRequest` |
| `onError` | (not a hook point — internal error handler) |

**File:** `src/nex/pipeline.ts`

Remove `runAfterStagePlugins()` helper function entirely. Each stage now directly calls `evaluateAutomationsAtHook()`.

#### System 4: OpenClaw Plugin → Mapped or Dropped

**File:** `src/agents/openclaw-plugin-adapter.ts` (or wherever OpenClaw plugin hooks are handled)

Map OpenClaw hooks to canonical hook points or drop them:

| OpenClaw Hook | Maps To | Action |
|--------------|---------|--------|
| `before_agent_start` | `worker:pre_execution` | Map |
| `agent_end` | `after:executeOperation` | Map |
| `before_compaction` | `command:compact` | Map |
| `after_compaction` | (none) | Drop |
| `message_received` | (none) | Drop — covered by pipeline |
| `message_sending` | (none) | Drop — covered by pipeline |
| `message_sent` | (none) | Drop — covered by pipeline |
| `before_tool_call` | (none) | Drop — not in initial 19 |
| `after_tool_call` | (none) | Drop — not in initial 19 |
| `tool_result_persist` | (none) | Drop — not in initial 19 |
| `session_start` | `session:start` | Map |
| `session_end` | `session:end` | Map |
| `runtime_start` | `runtime:startup` | Map |
| `runtime_stop` | `runtime:shutdown` | Map |

**Implementation:**

If OpenClaw plugin adapter exists, update it to translate OpenClaw hook names to canonical names before calling `evaluateAutomationsAtHook()`.

If no OpenClaw plugins are actively used, simply remove the adapter code entirely.

#### Bundled Automations

**File:** `src/nex/automations/bundled/registry.ts`

Update bundled automation definitions to use canonical hook point names:

```typescript
// Old:
export const BUNDLED_AUTOMATIONS = [
  {
    id: 'memory-writer',
    hook_point: 'episode-created',  // hyphenated
    // ...
  },
  // ...
];

// New:
export const BUNDLED_AUTOMATIONS = [
  {
    id: 'memory-writer',
    hook_point: 'episode:created',  // colon-delimited
    // ...
  },
  // ...
];
```

**File:** `src/nex/automations/seeder.ts`

Update seeder to use canonical hook point names when inserting automations.

#### Hook Point Emitters

**Files where hook points are emitted:**

Update all locations that emit hook points to use canonical names:

1. **Pipeline stages** (`src/nex/stages/*.ts`):
   - acceptRequest → emit `after:acceptRequest`
   - resolvePrincipals → emit `after:resolvePrincipals`
   - resolveAccess → emit `after:resolveAccess`
   - executeOperation → emit `before:executeOperation` and `after:executeOperation`
   - finalizeRequest → emit `after:finalizeRequest`

2. **Broker** (`src/agents/broker.ts`):
   - Before LLM execution → emit `worker:pre_execution`

3. **Memory pipeline** (`src/memory/retain-dispatch.ts`):
   - After episode clip → emit `episode:created`
   - After writer completes → emit `episode:retained`

4. **Lifecycle events**:
   - `src/nex/control-plane/boot.ts` → emit `runtime:startup`
   - `src/nex/control-plane/shutdown.ts` → emit `runtime:shutdown`
   - `src/sessions/lifecycle.ts` → emit `session:start`, `session:end`
   - `src/agents/bootstrap.ts` → emit `agent:bootstrap`

5. **Command handlers** (`src/commands/agent/command-handlers.ts`):
   - New session command → emit `command:new`
   - Any command execution → emit `command:execute`
   - Reset command → emit `command:reset`
   - Stop command → emit `command:stop`
   - Compact command → emit `command:compact`

#### Runtime Function

**File:** `src/nex/automations/hooks-runtime.ts`

Ensure `evaluateAutomationsAtHook()` is the canonical entry point:

```typescript
export async function evaluateAutomationsAtHook(
  hookPoint: string,
  context: HookContext
): Promise<AutomationsOutcome> {
  // 1. Query automations table for matching hook_point
  // 2. Filter by trigger conditions
  // 3. Execute scripts in priority order
  // 4. Handle blocking vs non-blocking
  // 5. Apply circuit breakers
  // 6. Track invocations in hook_invocations table
  // 7. Return combined outcome
}
```

Verify this function:
- Accepts canonical hook point names (colon-delimited)
- Queries `automations.hook_point` column
- Respects `blocking` flag
- Tracks telemetry in `hook_invocations` table

### Deleted Files/Code

**Files to delete entirely:**

1. `src/nex/automations/internal-hooks.ts` — System 2 registry and API
2. `src/nex/plugin.ts` — NEXPlugin interface (or rename to internal implementation helper)
3. `src/agents/openclaw-plugin-adapter.ts` — If exists and unused

**Code patterns to remove:**

- All calls to `registerInternalHook()`
- All calls to `triggerInternalHook()`
- All calls to `runAfterStagePlugins()` (replaced with direct `evaluateAutomationsAtHook()` calls)
- Any OpenClaw plugin hook handling if unused

### Operations to Register

**New operation:**

`automations.hookpoints.list` — List available hook points (returns the 19 canonical definitions)

Wire handler: `handleAutomationsHookpointsList()` from `src/nex/control-plane/server-methods/automations.ts`

---

## Execution Order

### Phase 1: Canonical Hook Point Registry

**Define the standard:**

1. **Create hook point registry** — New file `src/nex/automations/hook-points.ts` with 19 canonical definitions
2. **Add operation handler** — Extend `src/nex/control-plane/server-methods/automations.ts` with `automations.hookpoints.list`
3. **Register operation** — Wire into control plane

At this point, the canonical list exists but isn't enforced yet.

### Phase 2: Database Migration

**Update existing automation rows:**

4. **Run SQL migration:**
   ```sql
   UPDATE automations SET hook_point = 'episode:created' WHERE hook_point = 'episode-created';
   UPDATE automations SET hook_point = 'episode:retained' WHERE hook_point = 'episode-retained';
   DELETE FROM automations WHERE hook_point = 'runAutomations';
   ```

5. **Update bundled automation registry** — Change `src/nex/automations/bundled/registry.ts` to use canonical names
6. **Update seeder** — Change `src/nex/automations/seeder.ts` to use canonical names

### Phase 3: System 2 (Internal Hooks) → Absorbed

**Eliminate internal hook registry:**

7. **Find all `registerInternalHook()` calls** — Grep for registrations
8. **Convert to automations** — Each internal hook handler becomes either:
   - A bundled automation (if it's core functionality)
   - A registered automation in the DB (if it's plugin-like)
9. **Find all `triggerInternalHook()` calls** — Replace with `evaluateAutomationsAtHook()`
10. **Delete internal hook system** — Remove `src/nex/automations/internal-hooks.ts`

### Phase 4: System 3 (NEXPlugin) → Becomes Implementation

**Pipeline stages emit hook points:**

11. **Update acceptRequest stage** — Call `evaluateAutomationsAtHook('after:acceptRequest', ...)`
12. **Update resolvePrincipals stage** — Call `evaluateAutomationsAtHook('after:resolvePrincipals', ...)`
13. **Update resolveAccess stage** — Call `evaluateAutomationsAtHook('after:resolveAccess', ...)`
14. **Update executeOperation stage** — Call `evaluateAutomationsAtHook('before:executeOperation', ...)` and `evaluateAutomationsAtHook('after:executeOperation', ...)`
15. **Update finalizeRequest stage** — Call `evaluateAutomationsAtHook('after:finalizeRequest', ...)`
16. **Delete `runAfterStagePlugins()` helper** — Remove from `src/nex/pipeline.ts`
17. **Rename or remove NEXPlugin interface** — It's now internal implementation detail

### Phase 5: System 4 (OpenClaw Plugin) → Mapped or Dropped

**Handle upstream plugin system:**

18. **If OpenClaw adapter exists** — Update `src/agents/openclaw-plugin-adapter.ts` to map OpenClaw hook names to canonical names
19. **If no OpenClaw plugins are used** — Delete adapter entirely
20. **Drop unmapped hooks** — Remove any code handling `before_tool_call`, `after_tool_call`, `message_received`, etc.

### Phase 6: Hook Point Emitters

**Update all locations that emit hooks:**

21. **Broker** — Update `src/agents/broker.ts` to emit `worker:pre_execution`
22. **Memory pipeline** — Update `src/memory/retain-dispatch.ts` to emit `episode:created`, `episode:retained`
23. **Boot/shutdown** — Update `src/nex/control-plane/boot.ts` and shutdown handler to emit `runtime:startup`, `runtime:shutdown`
24. **Session lifecycle** — Update `src/sessions/lifecycle.ts` to emit `session:start`, `session:end`
25. **Agent bootstrap** — Update `src/agents/bootstrap.ts` to emit `agent:bootstrap`
26. **Command handlers** — Update `src/commands/agent/command-handlers.ts` to emit `command:new`, `command:execute`, `command:reset`, `command:stop`, `command:compact`

### Phase 7: Runtime Verification

**Ensure automation execution works correctly:**

27. **Verify `evaluateAutomationsAtHook()` signature** — Ensure it accepts canonical hook point names
28. **Verify blocking behavior** — Test that blocking automations wait, non-blocking fire-and-forget
29. **Verify circuit breaker** — Test consecutive error handling
30. **Verify telemetry** — Check `hook_invocations` table populates correctly

### Phase 8: Tests

**Comprehensive testing:**

31. **Unit test hook point registry** — `src/nex/automations/hook-points.test.ts`
32. **Unit test automation evaluation** — `src/nex/automations/hooks-runtime.test.ts`
33. **Integration test pipeline hooks** — Verify all 6 pipeline hooks fire correctly
34. **Integration test memory hooks** — Verify episode:created, episode:retained
35. **Integration test lifecycle hooks** — Verify runtime:startup, session:start, etc.
36. **Integration test command hooks** — Verify all 5 command hooks
37. **End-to-end test bundled automations** — Verify memory-reader, memory-writer, memory-consolidator, command-logger, boot-md all work
38. **Operation handler test** — Test `automations.hookpoints.list`

---

## Critical Path Notes

- **Phase 1 (registry) is foundational** — defines the canonical list
- **Phase 2 (DB migration) is data integrity** — must happen before code changes
- **Phase 3-5 are the unification** — eliminate separate systems
- **Phase 6 is the implementation** — wire hook points into all the right places
- **Phase 7 verifies runtime behavior** — ensure automation execution works
- **Phase 8 tests end-to-end** — comprehensive verification

---

## Risk Mitigation

1. **Phased rollout:** Can keep internal hooks working temporarily during Phase 3 (call both old and new systems), then remove old system once verified
2. **Hook point validation:** Add runtime validation that hook points match canonical list (warn on unknown hook points)
3. **Backwards compatibility for external plugins:** If external automations use old hook point names, add alias mapping temporarily
4. **Telemetry verification:** Ensure hook_invocations table tracks all executions for debugging
5. **Circuit breaker safety:** Verify consecutive error limits prevent runaway failures
6. **Blocking hook timeout:** Ensure blocking hooks have reasonable timeouts (don't hang pipeline forever)
7. **Migration verification:** Test on staging with real automation workloads before production cutover

---

## Post-Unification Benefits

After completion, the system has:
- **One hook execution path** — easier to debug, trace, and optimize
- **19 canonical hook points** — clear, documented extension points
- **Consistent naming** — colon-delimited everywhere
- **Full telemetry** — all hook invocations tracked in DB
- **Circuit breakers** — automatic error handling
- **Workspace-driven meeseeks** — manifest determines context injection (via WP5)
- **First-class API** — `automations.*` operations expose full lifecycle

This unification is foundational for WP7 (if automation API is next) and makes the hook system comprehensible to external developers.
