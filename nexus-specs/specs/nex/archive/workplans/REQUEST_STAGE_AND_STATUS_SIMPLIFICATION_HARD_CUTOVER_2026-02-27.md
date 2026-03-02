# Request Stage + Status Simplification Hard Cutover (2026-02-27)

**Status:** ARCHIVED — absorbed into `../NEXUS_REQUEST_TARGET.md`
**Archived:** 2026-02-27 — 5-stage pipeline and RequestStatus enum are canonical in TARGET.
**Mode:** Hard cutover (no backwards compatibility)
**Related:**
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/NEXUS_REQUEST.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/UNIFIED_RUNTIME_OPERATION_MODEL.md`  
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/workplans/REQUEST_PIPELINE_SIMPLIFICATION_INDEX_2026-02-27.md`

---

## 1) Customer Experience Goal (First)

The request object should be easy to explain in one sentence:

"A request moves through stages, has one status, and keeps a simple trace."

If understanding a single request requires translating between phase/outcome/ingress variants, the model is not usable.

---

## 2) Research Baseline

Current runtime behavior:

1. Stage names are already stage-based in code:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/stages/types.ts`
2. Top-level request status currently includes:
   - `processing`, `completed`, `skipped`, `denied`, `handled_by_automation`, `failed`
   - source: `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/request.ts`
3. `handled_by_automation` is set when `request.triggers.handled === true`:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/pipeline.ts`
4. `entities.type` persists as open text, not closed enum:
   - `/Users/tyler/nexus/home/projects/nexus/nex/src/db/identity.ts`

---

## 3) Locked Decisions

1. Canonical term is `Stage`.
2. Canonical top-level request completion field is `status`; no `RequestOutcome` object.
3. `entity.type` remains an arbitrary `string`.
4. Top-level adapter metadata uses `adapter` naming (not `ingress` naming).
5. Trace entry name is `StageTrace`, not `RequestTraceEntry`.
6. Remove `mutated_fields` from trace contract.

---

## 4) Canonical Status Model

Canonical request status values:

1. `processing`
2. `completed`
3. `denied`
4. `failed`

Notes:

1. `handled_by_automation` becomes an automation semantic, not a top-level status.
2. `skipped` is removed from canonical runtime status. Duplicate/filtered events should be represented as explicit stage exit reason in trace.

---

## 5) Canonical Stage Model

Canonical stage list:

1. `receiveEvent`
2. `resolvePrincipals`
3. `resolveAccess`
4. `runAutomations`
5. `assembleContext`
6. `runAgent`
7. `deliverResponse`
8. `finalize`

No phase aliases. No alternate "pipeline language" objects.

---

## 6) Canonical Request Shape (Simplified)

```ts
type RequestStatus = "processing" | "completed" | "denied" | "failed";

type StageName =
  | "receiveEvent"
  | "resolvePrincipals"
  | "resolveAccess"
  | "runAutomations"
  | "assembleContext"
  | "runAgent"
  | "deliverResponse"
  | "finalize";

type StageTrace = {
  stage: StageName;
  started_at: number;
  duration_ms: number;
  exit_reason?: string;
  error?: string;
  error_stack?: string;
};

type AdapterContext = {
  name: string;       // adapter identity (example: discord, control.ws)
  protocol: string;   // transport type (example: ws, http, internal)
  account_id?: string;
};

type NexusRequest = {
  request_id: string;
  created_at: number;
  stage: StageName;
  status: RequestStatus;

  adapter: AdapterContext;
  event: EventContext;
  delivery: DeliveryContext;

  sender?: SenderContext;
  receiver?: ReceiverContext;
  access?: AccessResolution;
  automations?: AutomationResolution;
  agent?: AgentExecution;
  response?: ResponseContext;
  delivery_result?: DeliveryResult;

  trace: StageTrace[];
};
```

---

## 7) Hard Deletions

Delete from canonical request docs and contracts:

1. `RequestPhase` naming and fields.
2. `RequestOutcome` object and parallel "outcome" values.
3. `RequestIngress` naming and `origin` field.
4. `RequestTraceEntry.mutated_fields`.
5. Any static enum constraints for `entity.type`.

---

## 8) Out Of Scope For This Cut

1. Queueing behavior redesign (`queue_mode` lifecycle semantics).
2. Access policy grammar redesign.
3. Persona binding redesign.

