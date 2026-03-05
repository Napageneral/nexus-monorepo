# Workplan: Unify Session Routing

**Status:** COMPLETED — superseded by WP4, commit ed16d4474
**Created:** 2026-03-03
**Spec:** [SESSION_ROUTING_UNIFICATION.md](../SESSION_ROUTING_UNIFICATION.md)
**Scope:** ~25 files (6 core + ~19 mechanical downstream)

---

## Goal

Unify three separate session key derivation systems into one: pipeline computes canonical key via `buildSessionKey()`, policy templates can override, automations can override on top. One field on `NexusRequest` (`session_routing`) is the source of truth.

**Hard cutover. No backwards compatibility.**

---

## Phase 1: Core Infrastructure (~6 files)

These changes establish the new system. Can be done and tested independently.

### 1.1 Add `SessionRouting` to NexusRequest

**File:** `src/nex/request.ts`

- Add `SessionRouting` type: `{ session_key, persona_ref?, queue_mode?, source }`
- Add `session_routing?: SessionRouting` to `NexusRequestSchema`
- Keep `request.agent.session_key` for now (will become derived in Phase 2)

### 1.2 Make `resolveAccessStage` preserve IAM routing

**File:** `src/nex/stages/resolveAccess.ts`

- After policy evaluation (line ~68), extract `authAccess.routing`
- Reconcile: if policy had explicit `session.key`, use template result. Otherwise leave for canonical computation.
- Write `persona_ref` and `queue_mode` to `request.session_routing`
- Session key gets set in next step (needs resolved principals)

### 1.3 Compute canonical session key in pipeline

**File:** `src/nex/stages/resolveAccess.ts` (or a new `resolveSessionRouting` helper)

- After principals are resolved and access is evaluated, call `buildSessionKey()` with the resolved sender/receiver entities
- Apply resolution order: explicit override > policy template > canonical
- Write final `request.session_routing.session_key`

### 1.4 Update `buildSessionKey()` to accept new types

**File:** `src/nex/session.ts`

- Add overload that accepts `{ sender: Entity, receiver?: Entity, routing: Routing }`
- Internal logic unchanged — same canonical formats
- Legacy overload remains during migration

### 1.5 Remove ad-hoc session key in resolvePrincipals

**File:** `src/nex/stages/resolvePrincipals.ts`

- Remove the ad-hoc `{platform}:{container_id}:{sender.id}` session key construction at line ~268
- Don't set `request.agent.session_key` here — it's now set via `request.session_routing`

### 1.6 Update hooks-runtime `toSessionKey()`

**File:** `src/nex/automations/hooks-runtime.ts`

- Replace `toSessionKey()` (line ~442) to read from `request.session_routing.session_key`
- Keep fallback to `request.agent?.session_key` during transition
- Update `AutomationsOutcome.agent_overrides.session_key` to write to `request.session_routing`

---

## Phase 2: Downstream Consumers (~19 files)

Mechanical migration: point all session key reads at `request.session_routing.session_key`. These can be done incrementally.

### Control plane

| File | Change |
|------|--------|
| `src/nex/control-plane/iam-authorize.ts` | Remove `accessMutator` session key injection — pipeline does this now |
| `src/nex/control-plane/boot.ts` | Use `session_routing` for `BOOT_SYSTEM_SESSION_KEY` |
| `src/nex/control-plane/server-work.ts` | Use `session_routing` for `system:work:item:{id}` |
| `src/nex/control-plane/server-cron.ts` | Use `session_routing` for cron session keys |
| `src/nex/control-plane/server-methods/agent.ts` | Read from `session_routing` |
| `src/nex/control-plane/server-methods/system.ts` | Read from `session_routing` |
| `src/nex/control-plane/tools-invoke-http.ts` | Read from `session_routing` |
| `src/nex/control-plane/server-methods/acl-requests.ts` | Read from `session_routing` |

### Pipeline and infrastructure

| File | Change |
|------|--------|
| `src/nex/ingress-metadata.ts` | Align `routing_override.session_label` → `routing_override.session_key` |
| `src/nex/tool-invoke.ts` | Read from `session_routing` |
| `src/nex/session-queue.ts` | Read from `session_routing` |
| `src/nex/events.ts` | Bus events use `session_key` (standardize from `session_label`) |

### Agent subsystem

| File | Change |
|------|--------|
| `src/routing/session-key.ts` | No logic change — just verify it handles all canonical formats |
| `src/sessions/session-key-utils.ts` | Same |
| `src/agents/workspace-run.ts` | Read from `session_routing` (or keep reading `agent.session_key` if it's derived) |
| `src/agents/agent-scope.ts` | Same |
| `src/agents/bash-tools.exec.ts` | Same |
| `src/agents/tools/agents-list-tool.ts` | Same |
| `src/agents/pi-tools.policy.ts` | Same |

---

## Phase 3: Fix Bootstrap Policy Templates

**File:** `src/iam/policies.ts`

| Policy | Current Template | Target |
|--------|-----------------|--------|
| owner-full-access | `dm:{sender.id}` | Remove `key` — use canonical default |
| operator-full-access | `dm:{sender.id}` | Remove `key` — use canonical default |
| member-safe-access | `dm:{sender.id}` | Remove `key` — use canonical default |
| customer-sandbox | `dm:{sender.id}` | Remove `key` — use canonical default |
| system-memory-retain | `system:memory-retain:{platform}` | Keep — intentional override |
| system-default | `system:{platform}` | Keep — matches canonical format |

Most bootstrap policies were using `dm:{sender.id}` which doesn't match the canonical `dm:{sender}:{receiver}` format anyway. Removing the explicit key and falling through to `buildSessionKey()` is actually a fix.

---

## Phase 4: Naming Cleanup

Standardize across codebase:

| Find | Replace With |
|------|-------------|
| `session_label` (in schemas, SQL, types) | `session_key` |
| `sessionLabel` (in TypeScript) | `sessionKey` |

Touch points: `IAMAccessRouting.session_label`, `IngressRoutingOverride.session_label`, bus event fields, audit log columns, session DB operations.

---

## Phase 5: Derive `request.agent.session_key`

Once all consumers read from `request.session_routing`:

- Make `request.agent.session_key` a derived value set once during agent context finalization
- Value comes from `request.session_routing.session_key` (with automation override applied)
- No code writes to `request.agent.session_key` directly
- Eventually consider removing `session_key` from `AgentContext` entirely (just read from `session_routing`)

---

## Phase 6: Tests

| File | Scope |
|------|-------|
| `src/nex/session.test.ts` | New overload, same canonical formats |
| `src/nex/stages/resolveAccess.test.ts` | Verify routing is preserved |
| `src/iam/policies.test.ts` | Updated bootstrap templates |
| `src/nex/automations/hooks-runtime.hookpoints.test.ts` | New session key read path |
| `src/nex/control-plane/server-methods/agent.test.ts` | Session routing field |
| `src/agents/workspace-run.test.ts` | Canonical key parsing still works |

---

## Execution Notes

- **Phase 1 is the critical path.** Everything else follows mechanically.
- **Phase 2 can be incremental** — keep `request.agent.session_key` as a backward-compatible alias during migration.
- **Phase 3 is a behavioral fix** — the current DM templates are actually producing wrong keys (`dm:entity-abc` instead of `dm:entity-abc:entity-xyz`). The control plane's `accessMutator` was masking this bug.
- **Phase 4 (naming) can be done anytime** but is best done alongside Phase 2 to avoid double-touching files.
- **Phase 5 is the final cleanup** once everything reads from the new source.
