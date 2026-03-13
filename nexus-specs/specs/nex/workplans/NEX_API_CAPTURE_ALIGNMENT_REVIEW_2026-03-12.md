# Nex API Capture Alignment Review

**Status:** ACTIVE REVIEW
**Last Updated:** 2026-03-12
**Related:**
- `../NEX_API_CAPTURE_AND_PUBLICATION_MODEL.md`
- `../API_CONTRACT_MODEL.md`
- `../TRANSPORT_SURFACE_MODEL.md`
- `../OPENAPI_CONTRACT_ARTIFACT_MODEL.md`

---

## Purpose

Review the active Nex and Frontdoor spec corpus against the canonical API capture and publication model.

The question being answered is:

1. which specs already align to the target state
2. which specs still carry legacy taxonomy or ownership residue
3. what needs to be rewritten before the Nex API contract layer is implemented

---

## Customer Experience Target

A developer should be able to answer all of these quickly:

1. what is the Frontdoor API
2. what is the Nex API
3. what is an App API
4. what is an Adapter API
5. where is each one defined in code
6. where is each one published in OpenAPI
7. how HTTP and WebSocket relate to the same Nex methods

Any spec that obscures those answers is now a liability.

---

## Aligned Canonical Docs

### 1. `API_CONTRACT_MODEL.md`

**Assessment:** aligned

Why:

1. locks the four top-level API contracts
2. rejects “ingress family” as a top-level category
3. makes browser routes non-operations
4. states ownership rules clearly

No rewrite needed before implementation.

### 2. `TRANSPORT_SURFACE_MODEL.md`

**Assessment:** aligned

Why:

1. transport is below API contract ownership
2. core/app methods are transport-neutral
3. `stdio` is treated as canonical internal child-process transport
4. internal dispatch sources are not surfaces
5. `apps.open.*` is explicitly rejected

No rewrite needed before implementation.

### 3. `OPENAPI_CONTRACT_ARTIFACT_MODEL.md`

**Assessment:** aligned

Why:

1. central `contracts/` publication tree is explicit
2. OpenAPI is a projection, not sole source of truth
3. ownership is split by Frontdoor/Nex/App/Adapter contract families

No rewrite needed before implementation.

### 4. `NEX_API_CAPTURE_AND_PUBLICATION_MODEL.md`

**Assessment:** aligned

Why:

1. explicitly requires dedicated code-facing contract layers
2. distinguishes code ownership from published artifacts
3. correctly models Nex as operation-first, not route-first

This is the canonical implementation target.

### 5. `NEX_ARCHITECTURE_AND_SDK_MODEL.md`

**Assessment:** mostly aligned

Why:

1. already treats operations as the API and surfaces as transport
2. already describes `stdio` as child-process IPC
3. already supports generated SDK/OpenAPI direction

Caveat:

- it still describes some client/service details in a more mixed historical style than the new capture model
- it is directionally correct, but should later be tightened to reference the dedicated Nex API contract layer directly

This is not a blocker for implementation.

### 6. `FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md`

**Assessment:** aligned

Why:

1. keeps Frontdoor as the hosted platform API owner
2. keeps tenant runtime domain separate from frontdoor shell domain
3. preserves the distinction between shell routing and runtime API

This is compatible with the new Frontdoor API capture model.

---

## Supporting Specs That Need Rework

### 1. `API_DESIGN_BATCH_5.md`

**Assessment:** partially stale

Why:

1. still frames the main split as “Nex API vs Adapter SDK” instead of the now-canonical four-contract model
2. still treats some adapter SDK verbs as part of the runtime taxonomy discussion in a way that is too implementation-bound
3. still uses older language around “external API” vs “internal subprocess protocol” without the cleaner Frontdoor/App/Adapter contract ownership model

Needed rewrite:

1. reframe the document under Frontdoor API / Nex API / Adapter API / App API
2. remove the remaining implication that adapter SDK verbs are a co-equal public taxonomy
3. align examples to the new contract ownership model

### 2. `ingress/RUNTIME_API_BOUNDARY_AND_EXTENSION_OWNERSHIP.md`

**Assessment:** stale and misleading

Why:

1. still uses “control-plane” as the main noun for too many things
2. still treats OpenAI/OpenResponses compatibility and webhook ingress as a special cross-cutting ingress concept instead of resolving ownership to App API or Adapter API
3. still reflects a gateway-removal era narrative rather than the new API-capture model

Needed rewrite:

1. stop using this as a canonical API ownership document
2. split remaining valid operational content from stale taxonomy
3. move API ownership language to the four-contract model

### 3. `delivery/ADAPTER_SYSTEM.md`

**Assessment:** stale and directly conflicting

Why:

1. still defines `adapter-cli` as a transport
2. still uses `transport: "ws" | "http" | "internal" | "adapter-cli"`
3. conflates transport, caller class, and adapter contract

Needed rewrite:

1. replace `adapter-cli` with `stdio` in the model
2. separate transport from adapter API ownership
3. make clear that adapter subprocess protocol is not a top-level public API category

---

## Codebase Alignment Reality

The code still lags the canonical docs.

### Frontdoor code

Current ownership is still too embedded in:

- `nexus-frontdoor/src/server.ts`

First-wave improvement exists in:

- `nexus-frontdoor/src/openapi/frontdoor-contract.ts`

But the real target should become:

- `nexus-frontdoor/src/api/`

### Nex code

Current ownership is split across:

- `nex/src/nex/runtime-api/runtime-operations.ts`
- `nex/src/nex/runtime-api/http-control-routes.ts`
- `nex/src/nex/runtime-api/http-control-operation-resolver.ts`
- `nex/src/nex/runtime-api/server-methods.ts`
- `nex/src/nex/runtime-api/server/ws-connection/message-handler.ts`

This is the core implementation gap.

The docs now say there should be a dedicated Nex API layer.

That code layer now exists as:

- `nex/src/nex/runtime-api/`

---

## Main Alignment Conclusions

### Conclusion 1

The new canonical docs are coherent enough to implement against.

### Conclusion 2

The remaining blocking confusion is no longer in the newest canonical docs.
It is in older supporting specs and in code organization.

### Conclusion 3

The next meaningful move is not more top-level architecture.
It is a hard-cut implementation workplan for:

1. dedicated Nex API contract layer
2. later dedicated Frontdoor API route-contract layer
3. removal of stale transport and adapter taxonomy residue

---

## Rewrite Priority

### Immediate

1. `API_DESIGN_BATCH_5.md`
2. `ingress/RUNTIME_API_BOUNDARY_AND_EXTENSION_OWNERSHIP.md`
3. `delivery/ADAPTER_SYSTEM.md`

### Soon After Nex API Layer Lands

1. tighten `NEX_ARCHITECTURE_AND_SDK_MODEL.md` references to the dedicated Nex API layer
2. add references to generated contract publication under `contracts/`

---

## Recommendation

Proceed with the Nex API hard cut now.

The canonical docs are strong enough.
The remaining supporting docs should be rewritten in parallel or immediately after the implementation lands.
They should not block the dedicated Nex API layer from being built.
