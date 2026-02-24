# IAM Policy Architecture Unification

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-23  
**Scope:** Runtime IAM policy evaluation, tool/permission composition, routing authorization, legacy-path consolidation  
**Related:** `ACCESS_CONTROL_SYSTEM.md`, `POLICIES.md`, `GRANTS.md`, `AUDIT.md`, `TOOL_APPROVALS.md`

---

## 1. Why This Spec Exists

Current runtime authorization behavior is functionally rich but architecturally fragmented. Access outcomes are influenced by multiple layers that are not modeled as a single canonical pipeline.

This creates three practical problems:

1. **Inconsistent behavior across call paths**  
Some paths evaluate ACL policies directly; other paths inject `request.access` manually or apply secondary policy filters later.

2. **Difficult debugging and review**  
Human operators cannot answer "why was this tool allowed/denied" from one source of truth.

3. **Policy evolution risk**  
Adding new scopes (contacts/entities/personas/roles) is error-prone if policy logic stays distributed.

This spec defines a single architecture for policy compilation and enforcement before any additional implementation work.

---

## 2. Evidence of Fragmentation (Current State)

### 2.1 ACL Evaluation Path (Primary)

- `nex/src/nex/stages/resolveAccess.ts`  
  Evaluates ACL policies + grants and writes `request.access`.
- `nex/src/iam/policies.ts`  
  Merges matching policies into `AccessContext`.

### 2.2 Secondary Tool Policy Path (Parallel)

- `nex/src/agents/pi-tools.policy.ts`
- `nex/src/agents/tool-policy.ts`
- `nex/src/nex/tool-invoke.ts`

These apply profile/provider/group/subagent policy filtering independently of ACL, then filter tool lists again.

### 2.3 Request-Level Hard Overrides

- `nex/src/cortex-memory-v2/retain-access.ts`  
  Directly injects `request.access` with `tools=["*"]`, `credentials=["*"]`, `data_access=full`.
- `nex/src/auto-reply/reply/agent-runner-execution.ts`  
  Constructs synthetic `NexusRequest` with inline allow permissions.

### 2.4 Duplicate Grant Application Logic

- `nex/src/nex/stages/resolveAccess.ts` has `applyGrantResources(...)`
- `nex/src/nex/control-plane/iam-authorize.ts` has another `applyGrantResources(...)`

Same semantic function in two different places.

---

## 3. Design Goals

### 3.1 Primary Goals

1. **One canonical policy compiler** for every runtime request.
2. **One canonical decision envelope** consumed by downstream stages.
3. **Deterministic, explainable results** with full provenance.
4. **No path-specific permission injection** outside the compiler.
5. **Flexible selectors** for contacts, entities, personas, roles, relationships, and context.

### 3.2 Secondary Goals

1. Preserve current behavior where intentional.
2. Keep migration incremental and low-risk.
3. Maintain compatibility with grants and audit subsystems.

---

## 4. Canonical Authorization Model

### 4.1 Compiler Input

`AuthorizationInput` (conceptual):

- `principal`: resolved sender identity
- `receiver`: resolved target (persona/system/entity)
- `delivery`: platform/space/container/thread context
- `operation`: event/hook/method metadata (e.g. `memory:retain-episode`, control-plane method)
- `agent_request`: desired role/persona/session/model/toolset hints
- `timestamp`: authoritative runtime receive time

### 4.2 Compiler Output

`AuthorizationEnvelope` (canonical):

- `decision`: `allow | deny | ask`
- `matched_policy` and contributing policy list
- `permissions`:
  - `tools: { allow: string[], deny: string[] }`
  - `credentials: string[]`
  - `data_access: none|minimal|contextual|full`
- `routing`:
  - `persona`
  - `session_label`
  - `queue_mode`
- `constraints`:
  - role caps (manager/worker/unified)
  - sandbox caps
  - execution hints
- `provenance`:
  - policy/grant IDs
  - merge notes
  - deny reasons

Every execution path must use this envelope; no path may bypass it.

---

## 5. Layering Rules (Normative)

Authorization is composed in this strict order:

1. **ACL policy evaluation** (`POLICIES.md` semantics)
2. **Grant augmentation** (`GRANTS.md`)
3. **Role caps** (manager/worker/unified hard safety constraints)
4. **Execution environment caps** (sandbox/runtime constraints)
5. **Optional profile overlays** (agent/provider/group/subagent policies), but only as declarative compiler inputs
6. **Final normalization** to concrete allow/deny lists

### 5.1 Single Enforcement Point

Enforcement must happen using the finalized envelope:

- Stage path (`runAgent`)
- Direct tool invocation path (`tools.invoke`)
- Control-plane authorization path

No additional hidden filters after enforcement.

---

## 6. Legacy Path Treatment

### 6.1 `auto_reply_worker` and Synthetic Requests

Current behavior manually constructs access and tool allowlists. This is an upstream-style remnant and should be treated as a compatibility shim.

**Required end-state:**

- auto-reply generated requests still use synthetic event payloads if needed
- but authorization must be compiled by canonical compiler (not hardcoded access blocks)

### 6.2 Internal Memory Retain Overrides

Current retain paths call `applyInternalRetainAccess(...)`.

**Required end-state:**

- define explicit internal principal + operation policies
- canonical compiler grants equivalent permissions
- remove manual access injection from retain paths

---

## 7. Policy Expressiveness Model

To support permissions across contacts/entities/personas/roles, policy matching must support all of the following selector classes:

### 7.1 Subject Selectors (Who)

- `principal.type` (`owner|known|unknown|system|agent|webhook`)
- `principal.entity_id`
- `principal.relationship` (partner/family/friend/work/etc)
- `principal.tags[]`
- `principal.contact_handle` (normalized channel identifier)

### 7.2 Receiver Selectors (Target)

- `receiver.type` (`persona|system|entity|unknown`)
- `receiver.persona_id`
- `receiver.entity_id`

### 7.3 Context Selectors (Where/When)

- `delivery.platform`
- `delivery.space_id`
- `delivery.container_id`
- `delivery.thread_id`
- `delivery.container_kind`
- `time windows` / day-of-week

### 7.4 Operation Selectors (What path)

- hook point (`memory:retain-episode`, etc.)
- event type
- control-plane method
- session class (`main`, `worker`, `automation`, etc.)

### 7.5 Resource Selectors (What permissions)

- tool names/groups
- credentials
- data access tier
- queue/routing modifiers

---

## 8. Tool Surface Strategy

Tool availability should be defined as:

`ToolCatalog ∩ ACLAllows ∩ RoleCaps ∩ EnvCaps ∩ OptionalProfileAllows - Denies`

### 8.1 Practical Direction

- keep tool catalog centralized (`createNexusTools`)
- keep role caps centralized (manager/worker restrictions)
- represent profile/provider/group/subagent policies as compiler inputs
- avoid re-running independent ad hoc policy chains inside `tool-invoke`

This preserves flexibility while making behavior explainable and reviewable.

---

## 9. Explainability Requirements

The system must provide first-class "why" output.

### 9.1 Required Diagnostic Surface

`nexus iam explain` (or equivalent API) should emit:

- input context summary
- matched policies (ordered by priority)
- denied policies
- grants applied
- final tool allow list + deny list
- deltas introduced at each layer

### 9.2 Audit Linkage

Every decision should include stable IDs that correlate:

- access decision logs
- grant usage
- request IDs
- session labels

---

## 10. Migration Plan (No Behavioral Big Bang)

### Phase 0: Freeze and Observe

- no further policy logic proliferation
- instrument policy source provenance on decisions

### Phase 1: Introduce Compiler API

- add `compileAuthorizationEnvelope(input)` module
- call it from existing `resolveAccess` path first

### Phase 2: Migrate Internal Paths

- retain live/backfill use compiler; remove manual retain access injection
- auto-reply worker request construction uses compiler

### Phase 3: Migrate Control Plane

- `iam-authorize` delegates to shared compiler/grant helper
- remove duplicated grant merge logic

### Phase 4: Consolidate Tool Enforcement

- unify stage and `tools.invoke` enforcement against compiler output
- remove duplicated policy filtering chains not represented in compiler

### Phase 5: Tighten Spec + Tests

- update all IAM docs with final precedence and data model
- add parity tests for live/backfill/auto-reply/control-plane

---

## 11. Acceptance Criteria

This spec is considered implemented when:

1. Every runtime authorization decision comes from one compiler.
2. No path directly writes broad `request.access` permissions outside compiler.
3. `auto_reply_worker` and retain paths no longer bypass canonical policy compilation.
4. Tool enforcement path is deterministic and identical for stage + invoke surfaces.
5. A single explain output can fully reconstruct why a tool was allowed/denied.
6. Existing IAM docs are updated to match the actual precedence and architecture.

---

## 12. Cross-Spec Alignment Changes Required

Before implementation, update the following docs for consistency:

1. `ACCESS_CONTROL_SYSTEM.md`  
   Add canonical compiler model and layer order.

2. `POLICIES.md`  
   Clarify relationship between ACL policy merge and downstream role/env/profile caps.

3. `TOOL_APPROVALS.md`  
   Explicitly place approvals/grants inside canonical compiler lifecycle.

4. `README.md`  
   Add this document as required reading for implementation.

5. `upstream/README.md`  
   Keep as reference only; clearly mark non-normative.

---

## 13. Non-Goals

This spec does not define:

1. Full UI design for policy editing.
2. Final schema for persona/account ownership modeling.
3. Memory writer prompt/tooling behavior details.

Those are separate tracks; this document only defines IAM policy architecture unification.

