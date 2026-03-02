# Agent Ingest Persona Selector Cutover (2026-02-26)

**Status:** ARCHIVED — superseded by `NEXUS_REQUEST_TARGET.md`
**Archived:** 2026-02-27 — persona_ref replaced by persona_path (absolute filesystem path on Entity). Canonical in TARGET.
**Scope:** `event.ingest` (`ingress_type: "agent"`) selector field naming

---

## 1. Customer Experience Target

1. Operators and internal callers choose **which persona context runs** with `personaRef`.
2. Session routing stays identity/session-key driven; persona selection does not imply hidden session rewrites.
3. API field names should communicate intent directly: this is a persona selector, not an entity receiver id.

---

## 2. Problem

`event.ingest` agent payload still uses `agentId` for persona selection in the schema and handler path.  
That naming now conflicts with the model where:

1. receiver routing is entity-based, and
2. persona is a bindable/swappable identity context.

---

## 3. Locked Decisions

1. Hard cutover only: `agentId` is removed from `AgentParamsSchema`.
2. New selector key is `personaRef`.
3. No compatibility alias, no dual-read, no silent remap.
4. This pass is limited to the agent-ingest payload path; true agent-management APIs are unchanged.

---

## 4. Implementation Scope

1. Schema:
   - Rename `AgentParamsSchema.agentId` -> `personaRef`.
2. Handler:
   - Read `request.personaRef`.
   - Keep validation semantics identical (known persona check, session persona consistency check).
   - Update error text to persona terminology.
3. Runtime caller:
   - `agent-via-runtime` sends `personaRef` in `event.ingest` agent payload.
4. Tests:
   - Update control-plane agent handler and agent e2e tests to use `personaRef`.

---

## 5. Non-Goals

1. Renaming all `agentId` fields across the control plane.
2. Changing `agent.identity.get` request/response shape.
3. Modifying agent/entity CRUD APIs.

---

## 6. Acceptance Criteria

1. `event.ingest` + `ingress_type:"agent"` rejects legacy `agentId` input via schema validation.
2. `personaRef` successfully selects known persona context.
3. Persona/session mismatch checks still fail closed.
4. Targeted typecheck/tests pass.

---

## 7. Validation Plan

1. `pnpm -C /Users/tyler/nexus/home/projects/nexus/nex exec tsc --noEmit`
2. `pnpm -C /Users/tyler/nexus/home/projects/nexus/nex exec vitest run src/nex/control-plane/server-methods/agent.test.ts`
3. `pnpm -C /Users/tyler/nexus/home/projects/nexus/nex exec vitest run --config vitest.e2e.config.ts src/nex/control-plane/server.agent.runtime-server-agent-a.e2e.test.ts`

