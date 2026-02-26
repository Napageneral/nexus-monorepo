# Resolve-Route Legacy Stack Removal Hard Cutover (2026-02-26)

**Status:** Execution Spec (Hard Cutover)  
**Scope:** Remove legacy OpenClaw route resolver stack and all dependent runtime surfaces in core NEX  
**Owners:** NEX runtime / control-plane / outbound routing  
**Related:**  
- `../ENTITY_SYMMETRIC_ROUTING_AND_PERSONA_BINDING.md`  
- `../RUNTIME_ROUTING.md`  
- `../CANONICAL_SESSION_ROUTING_CONTROL_PLANE_CUTOVER_2026-02-26.md`

---

## 1. Customer Experience Target

1. Session routing is deterministic and identity-first everywhere.
2. No hidden legacy route synthesis (`resolveAgentRoute`, `agent:*` peer-route derivation).
3. Outbound mirroring never guesses a session from provider-specific target parsing.
4. Core runtime behavior is NEX-native only; legacy OpenClaw routing stack is gone.

---

## 2. Research Findings (Current Runtime)

## 2.1 Canonical NEX path already exists and is authoritative

1. Sender + receiver resolution: `src/nex/stages/resolvePrincipals.ts`
2. Receiver resolved via contacts/entities: `src/nex/stages/resolveReceiver.ts`
3. Canonical session keys: `src/nex/session.ts` (`buildSessionKey`)

Canonical key families in runtime:
1. `dm:{sender_entity_id}:{receiver_entity_id}`
2. `group:{platform}:{container_id}:{receiver_entity_id}`
3. `email:{platform}:{container_id}:{receiver_entity_id}`
4. `worker:{ulid}`
5. `system:{purpose}`

## 2.2 Legacy resolver stack is still live

Primary legacy resolver:
1. `src/routing/resolve-route.ts`

Live dependent codepaths:
1. LINE legacy ingress context:
   - `src/line/bot-message-context.ts`
2. Outbound session mirror route fallback:
   - `src/infra/outbound/outbound-session.ts`
   - called by:
     - `src/nex/control-plane/server-methods/send.ts`
     - `src/infra/outbound/message-action-runner.ts`
3. Plugin runtime API exposure:
   - `src/plugins/runtime/index.ts`
   - `src/plugins/runtime/types.ts`
4. Legacy extension API type export:
   - `src/extensions-api/index.ts`

## 2.3 Secondary legacy residue tied to route-era behavior

1. Legacy bindings helper:
   - `src/routing/bindings.ts`
2. Legacy config type/schema for route bindings:
   - `src/config/types.agents.ts` (`AgentBinding`)
   - `src/config/zod-schema.agents.ts` (`BindingsSchema`)
3. Health command still uses bindings map:
   - `src/commands/health.ts`

---

## 3. Locked Decisions

1. Hard cutover only. No compatibility fallback.
2. `resolve-route` is removed, not wrapped.
3. Outbound mirror session derivation must not parse targets into synthetic sessions.
4. Mirror writes are allowed only when session key is explicit/canonical from caller/context.
5. NEX ingress and session identity remain canonical and entity-based.

---

## 4. Implementation Plan

## Phase A: Remove legacy route API surfaces

1. Remove `resolveAgentRoute` from plugin runtime API:
   - `src/plugins/runtime/index.ts`
   - `src/plugins/runtime/types.ts`
2. Remove deprecated type export:
   - `RoutePeerKind` from `src/extensions-api/index.ts`
3. Remove any remaining non-test imports of `routing/resolve-route`.

## Phase B: Remove LINE legacy route path from core

1. Delete `resolveAgentRoute` dependency in `src/line/bot-message-context.ts`.
2. Replace with NEX-native routing handoff or remove legacy LINE ingress context path where superseded by adapter runtime.
3. Ensure no line runtime path constructs route/session via `resolve-route`.

## Phase C: Remove outbound legacy route fallback

1. Remove `src/infra/outbound/outbound-session.ts` legacy session synthesis logic.
2. Update callsites:
   - `src/nex/control-plane/server-methods/send.ts`
   - `src/infra/outbound/message-action-runner.ts`
3. New behavior:
   - If explicit `sessionKey` is provided: mirror to it.
   - If not provided: do not synthesize mirror session key from target parsing.
   - Keep delivery behavior unchanged.

## Phase D: Delete resolver + tests

1. Delete:
   - `src/routing/resolve-route.ts`
   - `src/routing/resolve-route.test.ts`
2. Remove orphaned imports/usages.

## Phase E: Remove bindings residue

1. Remove runtime helper:
   - `src/routing/bindings.ts`
2. Remove config/schema entries:
   - `AgentBinding` in `src/config/types.agents.ts`
   - `BindingsSchema` in `src/config/zod-schema.agents.ts`
   - top-level `bindings` in `src/config/zod-schema.ts`
3. Remove usage in `src/commands/health.ts`.
4. Remove/adjust tests that assert bindings behavior.

## 4.1 Execution Status (2026-02-26)

Completed in code:
1. Phases A-D are fully implemented (legacy `resolve-route` stack removed from runtime surfaces and callsites).
2. Phase E is implemented as a hard cut:
   - removed `AgentBinding`/`BindingsSchema`/top-level `bindings` config support in runtime schema/types.
   - removed `agents` CLI binding UX (`--bind`, `--bindings`, binding helper modules).
   - removed residual `removedBindings` control-plane response field and updated protocol/tests.
   - retained explicit legacy rejection: `routing.bindings` and top-level `bindings` now fail with removed-key errors.
3. Validation:
   - targeted suites for commands/config/control-plane/extensions pass.
   - full `tsc --noEmit` has one pre-existing unrelated failure in `server-methods/adapter-connections.ts`.

Follow-up completion in this pass:
1. Removed dead legacy control-plane modules:
   - `src/nex/control-plane/session-utils.ts`
   - `src/nex/control-plane/session-utils.fs.ts`
   - module-specific legacy tests/guardrail for those files.
2. Updated remaining guardrail to enforce removal (files must stay deleted and unimported).
3. Updated stale `agents-mutate` test mock from `session-utils` to `agents-list`.
4. Validation after this follow-up:
   - `pnpm tsc --noEmit` passes.
   - targeted control-plane suites pass.

---

## 5. Validation Plan

1. Typecheck:
   - `pnpm tsc --noEmit`
2. Targeted test suites for touched areas:
   - plugins runtime tests
   - outbound send/message-action tests
   - control-plane send tests
   - config schema tests
   - health command tests
3. Grep invariants (non-test runtime files):
   - no `resolve-route`
   - no `resolveAgentRoute`
   - no `buildAgentSessionKey(`
   - no top-level config `bindings` routing usage

---

## 6. Acceptance Criteria

1. No non-test runtime references to `src/routing/resolve-route.ts`.
2. Outbound mirror path has zero synthetic session derivation from `to` target parsing.
3. Plugin runtime no longer exposes legacy route resolver APIs.
4. Core config/runtime no longer depends on legacy `bindings` route model.
5. Build passes and targeted tests pass.

---

## 7. Risks and Handling

1. External plugin code expecting `channel.routing.resolveAgentRoute`.
   - Hard cut: remove API and fail fast at compile/runtime for stale plugins.
2. Legacy tests coupled to route synthesis.
   - Rewrite or delete tests to canonical behavior.
3. Dirty workspace from parallel agents.
   - Apply minimal, path-scoped edits only; do not revert unrelated files.
