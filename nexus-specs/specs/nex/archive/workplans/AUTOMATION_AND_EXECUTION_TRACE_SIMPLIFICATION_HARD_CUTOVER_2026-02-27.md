# Automation + Execution Trace Simplification Hard Cutover (2026-02-27)

**Status:** ARCHIVED — absorbed into `../NEXUS_REQUEST_TARGET.md`
**Archived:** 2026-02-27 — AutomationContext, agent_overrides, StageTrace, and hook semantics are canonical in TARGET.
**Mode:** Hard cutover (no backwards compatibility)
**Related:**
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/stages/runAutomations.ts`  
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/hooks-runtime.ts`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/NEXUS_REQUEST.md`

---

## 1) Customer Experience Goal (First)

Automation behavior should be answerable with two plain questions:

1. Did any automation run and do something?
2. Did automation fully handle the request or should agent execution continue?

If users cannot answer these from one request row, the model is too complex.

---

## 2) Research Baseline

Current runtime behavior:

1. `runAutomations` records:
   - `automations_evaluated`
   - `automations_fired`
   - `handled`
   - `handled_by`
   - `automation_results`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/stages/runAutomations.ts`
2. Durable automation outcome model includes:
   - `evaluated`, `fired`, `handled`, `handled_by`, `results`
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/hooks-runtime.ts`
3. Pipeline currently translates `handled=true` into top-level `status=handled_by_automation`:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/pipeline.ts`

---

## 3) Direct Answers To Unresolved Questions

1. What is the difference between `fired` and `handled`?
   - `fired`: automation ran and produced an effect (message, routing override, tool invoke, enrichment event).
   - `handled`: automation claims full ownership of response path, so agent stage is skipped.

2. What is `handled_by`?
   - Stable automation id that set `handled=true`.

3. Why is `handled_by_automation` confusing as top-level status?
   - It duplicates meaning that already exists in automation fields and creates ambiguous status vocabulary.

4. What should happen to `OperationSideEffects` / `OperationExecution` wrappers?
   - Remove them from canonical request model.

5. What is in `output` and `side_effects`?
   - Canonical output is `response`.
   - Observable effects are represented directly by:
     - `response.tool_calls`
     - `delivery_result`
     - `automations.results`
     - `trace`

---

## 4) Locked Decisions

1. Keep one automation section on request: `automations`.
2. Keep `fired`, `handled`, `handled_by` semantics with strict definitions above.
3. Remove top-level status `handled_by_automation`.
4. Remove `OperationSideEffects` type entirely.
5. Remove wrapper `OperationExecution` from request-level contract.

---

## 5) Canonical Automation Section

```ts
type AutomationResult = {
  id: string;
  fired: boolean;
  duration_ms: number;
  error?: string;
};

type AutomationResolution = {
  evaluated: string[];
  fired: string[];
  handled: boolean;
  handled_by?: string;
  routing_override?: {
    persona_ref?: string;
    session_label?: string;
    target_kind?: "session" | "new_session" | "fork";
    from_turn_id?: string;
    label_hint?: string;
    smart?: boolean;
  };
  enrichment?: Record<string, unknown>;
  results?: AutomationResult[];
};
```

---

## 6) Stage Behavior Contract

1. `runAutomations` always sets `automations.evaluated`.
2. `runAutomations` sets `automations.fired` for automations that produced effects.
3. If `automations.handled=true`, pipeline skips `runAgent`.
4. Final top-level status semantics remain:
   - `completed` when request handled successfully (including automation-only path)
   - `denied` when access/identity denies
   - `failed` on runtime error/delivery failure

---

## 7) Hard Deletions

1. Remove `status=handled_by_automation` from canonical status docs/types.
2. Remove any request schema sections for:
   - `OperationSideEffects`
   - `OperationExecution.side_effects`
3. Remove "kind/ref/data" side effect payload wrappers where they are not consumed by runtime behavior.

---

## 8) Validation Requirements

1. Automation fires but does not handle:
   - `automations.fired` non-empty
   - `automations.handled=false`
   - agent stage runs
2. Automation handles:
   - `automations.handled=true`
   - `automations.handled_by` set
   - agent stage skipped
   - final status `completed`
3. No request schemas/tests expect `handled_by_automation` status or side-effect wrapper objects.

