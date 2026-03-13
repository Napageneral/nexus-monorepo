# API Contract Alignment Review (2026-03-12)

**Status:** ACTIVE
**Scope:** Canonical spec-corpus review against the API contract model and transport surface model hard cutover

---

## Purpose

This document reviews the active Nex and frontdoor spec corpus against the
canonical target state locked in:

1. [API_CONTRACT_MODEL.md](../API_CONTRACT_MODEL.md)
2. [TRANSPORT_SURFACE_MODEL.md](../TRANSPORT_SURFACE_MODEL.md)

The goal is to separate:

1. canon that is already aligned
2. canon that needs targeted rewrite
3. supporting/reference material that still encodes legacy residue

This is a hard-cut alignment review. It is not a migration compatibility
document.

---

## Customer Experience

The desired experience is:

1. a developer can identify whether they are using Frontdoor API, Nex API,
   Adapter API, or App API
2. they can discover available methods and schemas quickly
3. transports do not change capability
4. browser launch does not pretend to be an operation
5. compatibility routes have one clear owner

If the spec corpus cannot tell that story cleanly, the implementation will
continue to drift.

---

## Canonical Target State Summary

The reviewed target state is:

1. four top-level API contracts:
   - Frontdoor API
   - Nex API
   - Adapter API
   - App API
2. HTTP and WebSocket are the main public Nex transports
3. `stdio` is the canonical internal child-process transport
4. browser document launch is not an operation
5. `apps.open.*` is not canonical
6. pseudo-surfaces such as `adapter.cli` and `internal.clock` are not
   canonical
7. route families and compatibility endpoints must belong to frontdoor, app,
   or adapter ownership rather than a separate "ingress family" taxonomy
8. OpenAPI and SDKs should project from the canonical API contracts

---

## Canonical Specs Already Aligned

### Strongly aligned

1. [NEX_ARCHITECTURE_AND_SDK_MODEL.md](../NEX_ARCHITECTURE_AND_SDK_MODEL.md)
   - already states that operations are the API
   - already states all operations are available on all surfaces
   - already treats surfaces as transport, not API
   - already points toward OpenAPI/JSON Schema generation from the taxonomy

2. [hosted/HOSTED_APP_PLATFORM_CONTRACT.md](../hosted/HOSTED_APP_PLATFORM_CONTRACT.md)
   - already keeps frontdoor and runtime responsibilities distinct
   - already frames runtime APIs as app-use and discovery/status surfaces

3. frontdoor hosted routing specs such as:
   - [FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md)
   - already align to the frontdoor-vs-runtime responsibility split

These do not need conceptual replacement. They need terminology cleanup and
cross-linking.

---

## Canonical Or Supporting Specs That Need Rewrite

### 1. `NEX_ARCHITECTURE_AND_SDK_MODEL.md`

This document is mostly aligned, but still needs precise cleanup in three
places:

1. `App Service Binaries | stdio / HTTP / gRPC`
   - target state should not present HTTP/gRPC as equally canonical for
     runtime-managed child processes
   - long-term canonical internal child-process transport is `stdio`
   - HTTP/WS are public Nex transports
   - gRPC remains reserved future distributed-service transport

2. Caller table still centers WebSocket for UI/app traffic
   - that is fine as a preference
   - it must not imply HTTP is a lesser or partial runtime API projection

3. app/browser launch story should explicitly avoid pseudo-operations
   - the document should say `/app/<appId>/` is browser document routing
   - not a dynamic operation family

### 2. `API_DESIGN_BATCH_5.md`

This is the most important canonical API-design doc still encoding old
taxonomy.

Conflicts:

1. it still frames "Nex API vs Adapter SDK" without the fuller four-contract
   split
2. it still treats `record.ingest` as the "genuinely external-facing" live
   ingress exception
3. it still centers external ingress around adapter emission into Nex

Why this matters:

The new canon is tighter:

1. generic reusable bridges belong to Adapter API
2. product-specific compatibility endpoints belong to App API
3. route ownership matters more than whether something eventually normalizes
   into a Nex runtime operation

This doc needs a rewrite so it stops acting like "external-facing" is a single
concept.

### 3. `ingress/RUNTIME_API_BOUNDARY_AND_EXTENSION_OWNERSHIP.md`

This supporting spec still says:

1. OpenAI/OpenResponses compatibility belongs to adapters
2. all non-control-plane protocol bridges are adapter-managed
3. adapter bridges must construct canonical `record.ingest`

That is now too rigid.

New target:

1. compatibility endpoints can belong to App API or Adapter API depending on
   ownership
2. "control-plane" is no longer the right contrast term for the API split
3. route ownership should resolve to frontdoor, app, or adapter

This spec needs a targeted rewrite, not a small terminology patch.

### 4. `delivery/ADAPTER_SYSTEM.md`

This supporting spec is materially misaligned.

Conflicts:

1. it uses `transport: "ws" | "http" | "internal" | "adapter-cli"`
2. it still presents adapter CLI bridge language as part of the active model
3. it blurs runtime operations, adapter protocol, and transport

This file should either:

1. be rewritten against the new API contract model
2. or be downgraded to reference/history until rewritten

### 5. ingress supporting docs

The following docs still carry older "ingress" framing that likely needs a
full pass:

1. [ingress/INGRESS_CREDENTIALS.md](../ingress/INGRESS_CREDENTIALS.md)
2. [ingress/SINGLE_TENANT_MULTI_USER.md](../ingress/SINGLE_TENANT_MULTI_USER.md)

They still use:

1. trust-zone framing around "control-plane vs ingress"
2. compatibility APIs as ingress-owned concepts
3. runtime ingress as a first-class taxonomy bucket

Some of their security/identity content is still valuable, but the API ownership
story is stale.

---

## Reference / Historical Material With Expected Drift

These are not blockers, but they contain old vocabulary and should not be used
as active truth:

1. [OPERATION_TAXONOMY.md](../OPERATION_TAXONOMY.md)
   - still contains `apps.open.<app_id>`
2. archived runtime-operation-model docs
3. older ingress-control-plane unification workplans
4. `ADAPTER_INTERFACE_UNIFICATION.md`
   - already labeled historical/reference

No rewrite urgency unless those docs are still being used as live planning
inputs.

---

## Frontdoor Alignment

The frontdoor canon is mostly compatible with the new split.

What is aligned:

1. hosted routing and shell ownership belongs to frontdoor
2. runtime public methods are not frontdoor-owned semantics
3. platform control-plane fulfillment is distinct from runtime method
   semantics

What needs attention:

1. frontdoor docs should cross-link to the new API contract model so the
   Frontdoor API vs Nex API split is explicit
2. any lingering language that treats app launch as a runtime operation should
   be removed as code/spec cleanup proceeds

---

## Summary Of Required Spec Actions

### Must update soon

1. `NEX_ARCHITECTURE_AND_SDK_MODEL.md`
2. `API_DESIGN_BATCH_5.md`
3. `ingress/RUNTIME_API_BOUNDARY_AND_EXTENSION_OWNERSHIP.md`
4. `delivery/ADAPTER_SYSTEM.md`

### Should follow immediately after

1. `ingress/INGRESS_CREDENTIALS.md`
2. `ingress/SINGLE_TENANT_MULTI_USER.md`
3. frontdoor hosted docs cross-links and terminology cleanup

### Can remain historical/reference

1. `OPERATION_TAXONOMY.md`
2. archived workplans and archived unified runtime-operation docs

---

## Recommendation

Do the next planning and implementation work against:

1. `API_CONTRACT_MODEL.md`
2. `TRANSPORT_SURFACE_MODEL.md`

Then rewrite the conflicting canonical/supporting specs to match those
documents, rather than trying to infer the target state from older ingress or
adapter docs.
