# Workplan: Unify Session Routing System

**Status:** COMPLETED — commit ed16d4474
**Created:** 2026-03-04
**Spec References:**
- [SESSION_ROUTING_UNIFICATION.md](../SESSION_ROUTING_UNIFICATION.md)
- [WORKSPACE_PRIMITIVE.md](../WORKSPACE_PRIMITIVE.md)
- [API_DESIGN_BATCH_4.md](../API_DESIGN_BATCH_4.md)

**Dependencies:** WP5 (Workspace Primitive — `workspace_id` must exist for persona→workspace_id migration)

---

## Goal

Unify three conflicting session key derivation systems into one canonical flow: pipeline computes canonical key via `buildSessionKey()`, policy templates can override, automations can override on top of that. One field on `NexusRequest` (`session_routing`) is the source of truth. Simultaneously migrate persona_id → workspace_id on sessions/threads tables and rename workspace_path → working_dir on turns table.

**Hard cutover. No backwards compatibility.**

---

## Current State

### Three Separate Systems

1. **System A: `buildSessionKey()`** (`src/nex/session.ts`) — Produces 5 canonical formats (dm:, group:, email:, system:, worker:) from sender/delivery/receiver context
2. **System B: Policy Session Templates** (`src/iam/policies.ts`) — Each policy can override with `session.key` template, but current DM templates produce wrong format (`dm:{sender.id}` instead of `dm:{sender}:{receiver}`)
3. **System C: Ad-hoc Fallbacks** — Scattered across resolvePrincipals, hooks-runtime, resolveAccess

### The Discard Problem

`resolveAccessStage` calls policy evaluation which produces routing (session_label, persona_ref, queue_mode), then throws it away when building the stripped-down `AccessContext`. Control plane works around this with `accessMutator` callback injection.

### Database Schema Issues

- `sessions` table has `persona_id` column (should be `workspace_id`)
- `threads` table has `persona_id` column (should be `workspace_id`)
- `turns` table has `workspace_path` column (should be `working_dir`)
- No unified place to track session routing resolution source

---

## Target State

### New Field: `request.session_routing`

```typescript
export interface SessionRouting {
  session_key: string;        // the resolved session key
  workspace_id?: string;      // replaces persona_ref
  queue_mode?: QueueMode;
  source: 'canonical' | 'policy' | 'automation' | 'explicit';
}
```

Added to `NexusRequest` as a top-level field, separate from both `access` and `agent`.

### Resolution Order

```
1. Explicit override (routing_override.session_key from caller)
   ↓ if not set
2. Policy template (matched policy has session.key)
   ↓ if not set
3. Canonical computation (buildSessionKey() from resolved principals)
   ↓ after all three evaluated
4. Automation override (automations.agent_overrides.session_key)
```

### Database Schema Changes

**sessions table:**
```sql
ALTER TABLE sessions RENAME COLUMN persona_id TO workspace_id;
```

**threads table:**
```sql
ALTER TABLE threads RENAME COLUMN persona_id TO workspace_id;
```

**turns table:**
```sql
ALTER TABLE turns RENAME COLUMN workspace_path TO working_dir;
```

### Fixed Bootstrap Policy Templates

Remove broken DM templates that produce incomplete session keys:

| Policy | Current Template | Target |
|--------|-----------------|--------|
| owner-full-access | `dm:{sender.id}` | **Remove** — use canonical default |
| operator-full-access | `dm:{sender.id}` | **Remove** — use canonical default |
| member-safe-access | `dm:{sender.id}` | **Remove** — use canonical default |
| customer-sandbox | `dm:{sender.id}` | **Remove** — use canonical default |
| system-memory-retain | `system:memory-retain:{platform}` | **Keep** — intentional override |
| system-default | `system:{platform}` | **Keep** — matches canonical |

Most policies will have `session: { workspace_id: "workspace-main" }` without a `key` field. The canonical `buildSessionKey()` produces the correct key.

---

## Changes Required

### Database Schema

**File:** Migration script or manual SQL

1. **sessions table:** `ALTER TABLE sessions RENAME COLUMN persona_id TO workspace_id;`
2. **threads table:** `ALTER TABLE threads RENAME COLUMN persona_id TO workspace_id;`
3. **turns table:** `ALTER TABLE turns RENAME COLUMN workspace_path TO working_dir;`

### New Code

**File:** `src/nex/request.ts`

Add `SessionRouting` interface and add `session_routing?: SessionRouting` to `NexusRequestSchema`.

```typescript
export interface SessionRouting {
  session_key: string;
  workspace_id?: string;  // replaces persona_ref
  queue_mode?: QueueMode;
  source: 'canonical' | 'policy' | 'automation' | 'explicit';
}
```

**File:** `src/nex/stages/resolveSessionRouting.ts` (new helper, or inline in resolveAccess)

New stage logic to compute and reconcile session routing:
1. Check for explicit override from `routing_override.session_key`
2. Extract policy template result if present
3. Fall through to canonical `buildSessionKey()`
4. Write to `request.session_routing` with appropriate source tag
5. Preserve `workspace_id` and `queue_mode` from policy

### Modified Files

#### Core Pipeline

**File:** `src/nex/session.ts`

1. Add new-type-aware overload for `buildSessionKey()`:
   ```typescript
   export function buildSessionKey(input: {
     sender: Entity;
     receiver?: Entity;
     routing: Routing;
   }): string;
   ```
2. Keep legacy overload for backward compatibility during transition
3. Internal logic unchanged — same 5 canonical formats

**File:** `src/nex/stages/resolveAccess.ts`

1. After policy evaluation (line ~111), extract `authorization.access.routing` (session_label, persona_ref, queue_mode)
2. After principals are resolved, call new session routing logic:
   - If `routing_override.session_key` present, use it (source: 'explicit')
   - Else if policy had `session.key` template, use expanded template (source: 'policy')
   - Else call `buildSessionKey()` with new signature (source: 'canonical')
3. Build `request.session_routing` with resolved session_key, workspace_id (from persona_ref), queue_mode, source
4. Keep `request.access` simplified (no routing sub-object)

**File:** `src/nex/stages/resolvePrincipals.ts`

1. Remove ad-hoc session key construction at line ~268 (`{platform}:{container_id}:{sender.id}`)
2. Don't set `request.agent.session_key` here — now set via `request.session_routing`

**File:** `src/nex/automations/hooks-runtime.ts`

1. Replace `toSessionKey()` helper (line ~442) to read from `request.session_routing.session_key`
2. Keep fallback to `request.agent?.session_key` during transition
3. Update automation hook runtime to write `agent_overrides.session_key` to `request.session_routing` (update source to 'automation')

#### IAM and Policies

**File:** `src/iam/policies.ts`

1. Update `PolicySessionSchema`:
   ```typescript
   const PolicySessionSchema = z.object({
     workspace_id: z.string(),       // renamed from persona_ref
     key: z.string().optional(),     // template override; omit for canonical
   });
   ```
2. Fix bootstrap policy templates:
   - owner-full-access: remove `key: "dm:{sender.id}"`, keep only `workspace_id: "workspace-main"`
   - operator-full-access: remove `key: "dm:{sender.id}"`, keep only `workspace_id: "workspace-main"`
   - member-safe-access: remove `key: "dm:{sender.id}"`, keep only `workspace_id: "workspace-main"`
   - customer-sandbox: remove `key: "dm:{sender.id}"`, keep only `workspace_id: "workspace-main"`
   - system-memory-retain: keep `key: "system:memory-retain:{platform}"`, set `workspace_id: null`
   - system-default: keep `key: "system:{platform}"`, set `workspace_id: null`

**File:** `src/iam/types.ts`

1. Update `IAMAccessRouting` interface:
   ```typescript
   export interface IAMAccessRouting {
     agent_id?: string;
     workspace_id?: string;      // renamed from persona_ref
     session_label: string;      // will be renamed to session_key in Phase 4
     queue_mode: QueueMode;
   }
   ```

**File:** `src/iam/authorize.ts`

1. Update references from `persona_ref` to `workspace_id` in policy evaluation
2. Ensure `applySessionTemplate()` function handles both old and new template variables

#### Control Plane

**File:** `src/nex/control-plane/iam-authorize.ts`

1. **Remove `accessMutator` callback** — pipeline now handles session key resolution directly
2. Update to read from `request.session_routing.session_key` instead of injecting it

**File:** `src/nex/control-plane/boot.ts`

1. Use `session_routing` for `BOOT_SYSTEM_SESSION_KEY` constant
2. Update boot sequence to reference `request.session_routing.session_key`

**File:** `src/nex/control-plane/server-work.ts`

1. Use `session_routing` for work item session keys (`system:work:item:{id}`)
2. Update work dispatch to read from `request.session_routing.session_key`

**File:** `src/nex/control-plane/server-cron.ts`

1. Use `session_routing` for cron session keys
2. Update cron job execution to reference `request.session_routing.session_key`

**File:** `src/nex/control-plane/server-methods/agent.ts`

1. Read from `session_routing.session_key` instead of `agent.session_key` or ad-hoc computation
2. Update agent method implementations to use new field

**File:** `src/nex/control-plane/server-methods/system.ts`

1. Read from `session_routing.session_key`
2. Update system operations

**File:** `src/nex/control-plane/tools-invoke-http.ts`

1. Read from `session_routing.session_key`

**File:** `src/nex/control-plane/server-methods/acl-requests.ts`

1. Read from `session_routing.session_key`
2. Update ACL request handling

#### Infrastructure

**File:** `src/nex/ingress-metadata.ts`

1. Rename `routing_override.session_label` to `routing_override.session_key` in schema
2. Update ingress metadata parsing

**File:** `src/nex/tool-invoke.ts`

1. Read from `session_routing.session_key`

**File:** `src/nex/session-queue.ts`

1. Read from `session_routing.session_key`
2. Update queue operations

**File:** `src/nex/events.ts`

1. Standardize bus event fields: `session_label` → `session_key`
2. Update event payload schemas

#### Agent Subsystem

**File:** `src/routing/session-key.ts`

1. No logic change — verify `resolveAgentIdFromSessionKey()` handles all canonical formats
2. Update any references from `session_label` to `session_key`

**File:** `src/sessions/session-key-utils.ts`

1. No logic change — verify `parseAgentSessionKey()` handles all canonical formats

**File:** `src/agents/workspace-run.ts`

1. Read from `session_routing.session_key` (or keep reading `agent.session_key` if derived)
2. Update workspace resolution

**File:** `src/agents/agent-scope.ts`

1. Read from `session_routing.session_key`

**File:** `src/agents/bash-tools.exec.ts`

1. Read from `session_routing.session_key`

**File:** `src/agents/tools/agents-list-tool.ts`

1. Read from `session_routing.session_key`

**File:** `src/agents/pi-tools.policy.ts`

1. Read from `session_routing.session_key`

#### Database Adapters

**File:** `src/db/agents.ts`

1. Update SQL schema constants:
   - sessions table: `persona_id` → `workspace_id`
   - threads table: `persona_id` → `workspace_id`
   - turns table: `workspace_path` → `working_dir`
2. Update TypeScript interfaces:
   ```typescript
   export interface SessionRow {
     workspace_id: string;  // was persona_id
     // ...
   }
   export interface UpsertThreadInput {
     workspace_id?: string | null;  // was persona_id
     // ...
   }
   export interface InsertTurnInput {
     working_dir?: string | null;  // was workspace_path
     // ...
   }
   ```
3. Update all SQL query strings that reference old column names

**File:** `src/db/hooks.ts`

1. Update hook invocation tracking to use `session_key` terminology

**File:** `src/db/identity.ts`

1. Update entity/contact resolution to use `session_key` terminology where applicable

#### Session and Memory Systems

**File:** `src/sessions/ledger-session-meta.ts`

1. Update to use `workspace_id` instead of `persona_id`

**File:** `src/sessions/ledger-entry.ts`

1. Update to use `workspace_id` instead of `persona_id`

**File:** `src/memory/ledger-sessions.ts`

1. Update memory session queries to use `workspace_id` column

**File:** `src/memory/manager.ts`

1. Update memory manager to use `workspace_id`

**File:** `src/memory/retain-dispatch.ts`

1. Update retention dispatch to use `session_key` terminology

**File:** `src/memory/qmd-manager.ts`

1. Update QMD manager references

#### Automations and Meeseeks

**File:** `src/nex/automations/meeseeks/memory-injection.ts`

1. Update to read from `request.session_routing.session_key`

**File:** `src/nex/automations/meeseeks/memory-retain-episode.ts`

1. Update to use `session_key` terminology

**File:** `src/nex/automations/meeseeks/memory-consolidate-episode.ts`

1. Update to use `session_key` terminology

**File:** `src/agents/tools/memory-writer-tools.ts`

1. Update to use `session_key` terminology

### Deleted Files/Code

None — this is a unification and rename, not a removal.

### Operations to Register

None — no new RPC operations, just internal pipeline changes.

---

## Execution Order

### Phase 1: Infrastructure (Critical Path)

**Must be done first, atomic:**

1. **Database migrations** — Run ALTER TABLE statements for persona_id→workspace_id (sessions, threads) and workspace_path→working_dir (turns)
2. **Add `SessionRouting` to NexusRequest** — Define interface in `src/nex/request.ts`
3. **Update `buildSessionKey()` signature** — Add new overload in `src/nex/session.ts`
4. **Fix `resolveAccessStage`** — Preserve routing from policy evaluation, compute canonical key, write to `request.session_routing`
5. **Remove ad-hoc session key in `resolvePrincipals`** — Stop setting it there
6. **Update `hooks-runtime` toSessionKey()** — Read from new field

At this point, the new system is functional. Everything after this is mechanical migration.

### Phase 2: Database Adapters

**Update schema interfaces and SQL:**

7. Update `src/db/agents.ts` — Change all `persona_id` to `workspace_id`, `workspace_path` to `working_dir` in types and SQL
8. Update `src/db/hooks.ts` — Terminology fixes
9. Update `src/db/identity.ts` — Terminology fixes

### Phase 3: IAM and Policy System

**Update policy evaluation and bootstrap templates:**

10. Update `src/iam/policies.ts` — Fix bootstrap templates (remove broken DM keys, rename persona_ref→workspace_id in schema)
11. Update `src/iam/types.ts` — Rename `IAMAccessRouting.persona_ref` to `workspace_id`
12. Update `src/iam/authorize.ts` — Handle workspace_id in policy evaluation
13. Update `src/nex/control-plane/iam-authorize.ts` — Remove accessMutator workaround

### Phase 4: Control Plane Consumers

**Point all control plane operations at new field:**

14. Update `src/nex/control-plane/boot.ts`
15. Update `src/nex/control-plane/server-work.ts`
16. Update `src/nex/control-plane/server-cron.ts`
17. Update `src/nex/control-plane/server-methods/agent.ts`
18. Update `src/nex/control-plane/server-methods/system.ts`
19. Update `src/nex/control-plane/tools-invoke-http.ts`
20. Update `src/nex/control-plane/server-methods/acl-requests.ts`

### Phase 5: Pipeline Infrastructure

**Update ingress, events, queuing:**

21. Update `src/nex/ingress-metadata.ts` — Rename session_label to session_key
22. Update `src/nex/tool-invoke.ts`
23. Update `src/nex/session-queue.ts`
24. Update `src/nex/events.ts` — Standardize event field names

### Phase 6: Agent Subsystem

**Update agent runtime and tools:**

25. Update `src/agents/workspace-run.ts`
26. Update `src/agents/agent-scope.ts`
27. Update `src/agents/bash-tools.exec.ts`
28. Update `src/agents/tools/agents-list-tool.ts`
29. Update `src/agents/pi-tools.policy.ts`
30. Verify `src/routing/session-key.ts` (no changes needed)
31. Verify `src/sessions/session-key-utils.ts` (no changes needed)

### Phase 7: Session and Memory Systems

**Update session metadata and memory subsystems:**

32. Update `src/sessions/ledger-session-meta.ts`
33. Update `src/sessions/ledger-entry.ts`
34. Update `src/memory/ledger-sessions.ts`
35. Update `src/memory/manager.ts`
36. Update `src/memory/retain-dispatch.ts`
37. Update `src/memory/qmd-manager.ts`

### Phase 8: Automations and Meeseeks

**Update automation runtime and bundled meeseeks:**

38. Update `src/nex/automations/meeseeks/memory-injection.ts`
39. Update `src/nex/automations/meeseeks/memory-retain-episode.ts`
40. Update `src/nex/automations/meeseeks/memory-consolidate-episode.ts`
41. Update `src/agents/tools/memory-writer-tools.ts`

### Phase 9: Naming Cleanup (Global Find/Replace)

**Standardize terminology across entire codebase:**

42. Global find/replace: `session_label` → `session_key` (in schemas, types, SQL)
43. Global find/replace: `sessionLabel` → `sessionKey` (in TypeScript code)

### Phase 10: Derive `request.agent.session_key`

**Make agent session_key a derived value:**

44. Make `request.agent.session_key` read from `request.session_routing.session_key` during agent context finalization
45. Remove all direct writes to `request.agent.session_key`

### Phase 11: Tests

**Update test suites:**

46. `src/nex/session.test.ts` — New overload tests
47. `src/nex/stages/resolveAccess.test.ts` — Verify routing preserved
48. `src/iam/policies.test.ts` — Updated bootstrap templates
49. `src/nex/automations/hooks-runtime.hookpoints.test.ts` — New session key read path
50. `src/nex/control-plane/server-methods/agent.test.ts` — Session routing field
51. `src/agents/workspace-run.test.ts` — Canonical key parsing
52. All integration tests — Verify end-to-end routing

---

## Critical Path Notes

- **Phase 1 is atomic** — must be completed in a single commit to avoid broken state
- **Database migrations must run before code deployment** — column renames break old code immediately
- **Phases 2-8 can be incremental** — keep `request.agent.session_key` as backward-compatible alias during migration
- **Phase 3 (bootstrap policy fix) is a behavioral correction** — current DM templates produce wrong keys, masked by accessMutator workaround
- **Phase 9 (naming) should be done before Phase 10** to avoid double-touching files
- **Phase 10 is the final cleanup** once all consumers read from new source

---

## Risk Mitigation

1. **Backwards compatibility during transition:** Keep `request.agent.session_key` working by deriving it from `request.session_routing.session_key` until all consumers migrate
2. **Database migration safety:** Run migrations on staging first, verify all queries work with new column names
3. **Policy template fix verification:** Test that canonical `buildSessionKey()` produces correct DM format before removing explicit templates
4. **Automation override safety:** Ensure automation hooks can still override session keys after unification
5. **Session key parsing:** Verify all parsers (`resolveAgentIdFromSessionKey`, `parseAgentSessionKey`) handle the 5 canonical formats correctly
