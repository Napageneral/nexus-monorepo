# Request Pipeline Simplification Index (2026-02-27)

**Status:** ARCHIVED — all sub-workplans absorbed into `../NEXUS_REQUEST_TARGET.md`
**Archived:** 2026-02-27 — Pipeline stages, status, access, automation, and credential decisions are canonical in TARGET.
**Mode:** Hard cutover (no backwards compatibility)
**Scope:** Terminology and data model simplification for request pipeline, access resolution, automation semantics, and credential model direction.

---

## 1) Customer Experience Goal (First)

Nex should feel obvious to operate and reason about:

1. One request model, with language people already use (`stage`, not `phase`).
2. Minimal top-level status semantics (no duplicate "outcome" objects and no ambiguous states).
3. Clear access behavior when sender lacks permission, including explicit owner approval UX.
4. Automation fields that explain behavior directly (`fired`, `handled`) without hidden meaning.
5. Entity model remains open and practical (`entity.type` is a free string, not a closed enum list).

---

## 2) Research Baseline (Code + Specs)

Ground truth in runtime code as of 2026-02-27:

1. Stage names are already canonical in runtime (`receiveEvent`, `resolvePrincipals`, `resolveAccess`, `runAutomations`, `assembleContext`, `runAgent`, `deliverResponse`, `finalize`) in:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/stages/types.ts`
2. Request status currently includes `handled_by_automation` and `skipped` in:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/request.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/pipeline.ts`
3. Access model currently includes `data_access` levels and policy `queue_mode` modifiers in:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/request.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/policies.ts`
4. `resolveAccess` can create `permission_requests` (`policy_ask`) and deny in same stage in:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/stages/resolveAccess.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/authorize.ts`
5. ACL approval and grant lifecycle exists in control plane + identity ledger:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods/acl-requests.ts`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/iam/grants.ts`
6. Durable automation scripts are file-backed via `automations.script_path`:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/db/hooks.ts`
7. `entities.type` is stored as plain `TEXT` (open string) in:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/db/identity.ts`

---

## 3) Locked Simplification Directives

1. Keep `Stage` terminology everywhere. Do not introduce `Phase`.
2. Do not add `RequestOutcome` object. Use one top-level `status`.
3. Remove `DataAccessLevel` from canonical request model until explicit enforcement exists.
4. Keep `entity.type` as arbitrary string.
5. Prefer `adapter` naming for adapter-origin metadata on `NexusRequest`.
6. Rename trace vocabulary to `StageTrace`; remove speculative trace fields that do not have runtime value (`mutated_fields`).
7. Strip speculative execution wrappers (`OperationSideEffects`, overloaded `OperationExecution`) from canonical request model.

---

## 4) Spec Package Map

1. Request model and naming cutover:
   - `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/workplans/REQUEST_STAGE_AND_STATUS_SIMPLIFICATION_HARD_CUTOVER_2026-02-27.md`
2. Access resolution UX + policy/grant lifecycle:
   - `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/workplans/RESOLVE_ACCESS_UX_AND_POLICY_CLARIFICATION_HARD_CUTOVER_2026-02-27.md`
3. Automation and execution semantics cleanup:
   - `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/workplans/AUTOMATION_AND_EXECUTION_TRACE_SIMPLIFICATION_HARD_CUTOVER_2026-02-27.md`
4. Credential model follow-up thread:
   - `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/workplans/CREDENTIAL_MODEL_RUNTIME_DB_WORKSTREAM_2026-02-27.md`

---

## 5) Explicit Unanswered Question Coverage

1. "Why `Stage` vs `Phase` and why new names?"  
   Answered by hard-locking `Stage` terminology and removing alternate naming.
2. "Handled vs completed difference?"  
   Answered by reducing top-level status and moving automation handling semantics into automation fields.
3. "What is `DataAccessLevel` and how does it enforce?"  
   Answered by removing it from canonical model pending real enforcement.
4. "Who creates grants and what is approval UX?"  
   Answered with concrete owner approval flow and permission request lifecycle.
5. "How does principal resolution become access resolution?"  
   Answered with the current compiler path and simplified policy match model.
6. "Where are policies defined/stored?"  
   Answered with YAML/bootstrap source of truth and policy path behavior.
7. "What do automation fields mean (`fired`, `handled`, `handled_by`)?"  
   Answered with single definitions and lifecycle semantics.
8. "What are `OperationSideEffects` / `OperationExecution` output fields?"  
   Answered by removing these wrappers and keeping one response + trace model.
9. "Can credentials move from config pointers into runtime DB?"  
   Answered with a dedicated workstream and phased migration spec.

---

## 6) Execution Order

1. Align and merge these workplans first.
2. Update canonical docs (`NEXUS_REQUEST.md`, `NEX.md`, `ACCESS_CONTROL_SYSTEM.md`) to match this package.
3. Execute code cutover in one pass with no compatibility aliases.
4. Validate by schema/type checks, stage-flow tests, and control-plane ACL request tests.

