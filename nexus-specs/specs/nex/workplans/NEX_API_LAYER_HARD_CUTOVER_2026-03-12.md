# Nex API Layer Hard Cutover

**Status:** ACTIVE WORKPLAN
**Last Updated:** 2026-03-12
**Related:**
- `../NEX_API_CAPTURE_AND_PUBLICATION_MODEL.md`
- `../API_CONTRACT_MODEL.md`
- `../TRANSPORT_SURFACE_MODEL.md`
- `../OPENAPI_CONTRACT_ARTIFACT_MODEL.md`
- `./NEX_API_CAPTURE_ALIGNMENT_REVIEW_2026-03-12.md`

---

## Purpose

Define the hard cutover required to consolidate Nex API ownership under the existing `runtime-api/` layer and publish the Nex API as a canonical OpenAPI artifact.

This workplan assumes:

1. Frontdoor API and AIX App API are being hardened separately
2. the transport-surface hard cut is landing in parallel
3. there is no backward-compatibility requirement

---

## Customer Experience

A developer should be able to answer these questions instantly:

1. where is the canonical Nex API defined in code
2. where are its request/response schemas
3. how does HTTP project it
4. how does WebSocket project it
5. where is the published Nex OpenAPI artifact

The system should not require a developer to read five control-plane files to understand one method.

---

## Target Code Shape

Use the existing dedicated Nex API layer under:

- `nex/src/nex/runtime-api/`

Canonical structure:

```text
nex/src/nex/runtime-api/
  runtime-operations.ts
  protocol/
  http-runtime-api-routes.ts
  http-runtime-api-operation-resolver.ts
  http-runtime-api-handlers.ts
  server-methods/
  openapi/
    nex-contract.ts
```

The exact file names may vary, but ownership must stay inside `runtime-api/`.

---

## Canonical Ownership Rules

### The Nex API layer owns

1. operation ids
2. operation categories
3. actions
4. IAM resources
5. request schemas
6. response schemas
7. transport projection metadata for HTTP and WebSocket
8. OpenAPI generation inputs for the HTTP projection

### The Nex API layer does not own

1. Frontdoor routes
2. browser document routing
3. app-specific method definitions
4. adapter-owned external HTTP contracts
5. handler implementation logic

Handlers consume the Nex API layer.
They do not define it.

---

## Current Code Gaps

### 1. Taxonomy and routing are split

Current split:

- `nex/src/nex/runtime-api/runtime-operations.ts`
- `nex/src/nex/runtime-api/http-runtime-api-routes.ts`
- `nex/src/nex/runtime-api/http-runtime-api-operation-resolver.ts`

Problem:

1. operation ownership is mixed with transport projection
2. static routes are separate from the operation registry
3. projection logic is owned by the right layer, but schema richness and naming consistency are still incomplete

### 2. Handler registry and API registry are mixed

Current handler aggregation:

- `nex/src/nex/runtime-api/server-methods.ts`

Problem:

1. runtime API inventory and handler wiring are still too closely coupled
2. several handlers still expose schemas only implicitly through implementation, not through the contract layer

### 3. WebSocket path is not projected from the same contract layer

Current path:

- `nex/src/nex/runtime-api/server/ws-connection/message-handler.ts`

Problem:

1. WebSocket dispatch is operationally correct but not clearly driven by a dedicated API contract layer
2. protocol/bootstrap concerns and ordinary operation dispatch remain too close together

### 4. Published Nex OpenAPI needs hardening

Current artifact exists at:

- `contracts/nex/openapi.yaml`

Problem:

1. inventory coverage is in place, but not every request/response shape is richly captured yet
2. SDK generation and external method discovery still need richer schema coverage and conformance checks

---

## Hard Cut Phases

### Phase 1 — Consolidate The Dedicated Nex API Contract Layer

Keep `nex/src/nex/runtime-api/` as the canonical Nex API layer and remove residual ownership elsewhere.

Initial minimum cut:

1. keep operation descriptor ownership in `runtime-api/runtime-operations.ts`
2. define canonical request/response schema ownership adjacent to the registry and protocol layer
3. define operation categories explicitly:
   - protocol
   - core
   - event

4. keep handlers in `runtime-api/server-methods/`, but make them strict consumers of the registry

### Phase 2 — Move HTTP Projection Ownership

Replace the current scattered HTTP ownership with Nex API projection ownership.

Targets:

1. keep HTTP route ownership in `nex/src/nex/runtime-api/http-runtime-api-routes.ts`
2. keep HTTP resolver ownership in `nex/src/nex/runtime-api/http-runtime-api-operation-resolver.ts`
3. make `/runtime/operations/<method>` and static HTTP routes derive from one HTTP projection model

### Phase 3 — Move WebSocket Projection Ownership

Targets:

1. keep WebSocket projection logic inside `runtime-api/`
2. leave handshake/bootstrap mechanics as protocol-specific code, but make ordinary method dispatch consume the canonical Nex API contract layer

### Phase 4 — Generate Canonical Nex OpenAPI

Once the transport hard cut is in place:

1. keep generator input under `runtime-api/openapi/`
2. publish `contracts/nex/openapi.yaml`
3. publish `contracts/nex/openapi.lock.json`
4. harden request/response schemas domain by domain

### Phase 5 — Rewrite Tests From Scratch

Delete or rewrite old tests that assume the old scattered ownership model.

Tests should prove:

1. operation inventory is canonical
2. HTTP projection inventory is canonical
3. WebSocket projection inventory is canonical
4. published OpenAPI matches the HTTP projection
5. handler wiring covers the canonical operation registry

---

## Files Expected To Change

### Canonical API layer

1. `nex/src/nex/runtime-api/runtime-operations.ts`
2. `nex/src/nex/runtime-api/http-runtime-api-routes.ts`
3. `nex/src/nex/runtime-api/http-runtime-api-operation-resolver.ts`
4. `nex/src/nex/runtime-api/openapi/...`

### Existing files to gut or reduce

1. `nex/src/nex/runtime-api/runtime-operations.ts`
2. `nex/src/nex/runtime-api/http-runtime-api-routes.ts`
3. `nex/src/nex/runtime-api/http-runtime-api-operation-resolver.ts`
4. `nex/src/nex/runtime-api/server/ws-connection/message-handler.ts`
5. `nex/src/nex/runtime-api/server-methods.ts`

### Tests to rewrite

1. runtime operation conformance tests
2. HTTP resolver tests
3. any tests encoding surface-specific allowlist assumptions

---

## Design Constraints

1. no backward compatibility shim
2. no dual ownership between old control-plane files and new API layer
3. no pseudo-canonical mirrors
4. HTTP and WebSocket must project the same ordinary Nex API methods
5. `apps.open.*` and other pseudo-operation residue must not survive into the new Nex API contract layer

---

## Validation Ladder

### Rung 1

Nex API operation registry exists under `nex/src/nex/runtime-api/`.

### Rung 2

HTTP projection derives from that registry, not from scattered route logic.

### Rung 3

WebSocket dispatch derives from that registry for ordinary methods.

### Rung 4

Static HTTP route inventory and `/runtime/operations/<method>` inventory are generated from the same contract layer.

### Rung 5

`contracts/nex/openapi.yaml` is generated from the HTTP projection.

### Rung 6

Generator output is deterministic and CI-checked.

### Rung 7

Conformance tests prove published Nex OpenAPI and live runtime projection match.

---

## Recommendation

Proceed with a hard cut.

Do not create a second parallel `src/nex/api/` layer now that `runtime-api/` already exists.
Consolidate ownership under `runtime-api/`, harden the contract there, and delete remaining scattered ownership once handler consumption is switched over.
