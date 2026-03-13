# Spike Integrations And Callback Ownership

**Status:** CANONICAL
**Last Updated:** 2026-03-05

---

## Purpose

This document defines the target-state ownership model for Spike integrations,
callbacks, and webhooks.

It applies the canonical hosted routing and callback rules to Spike-specific
integration flows.

Shared hosted rules come from:

- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/runtime-access-and-routing.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/packages-and-control-planes.md`
- `/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/FRONTDOOR_OBJECT_TAXONOMY.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-connections.md`
- `SPIKE_OBJECT_TAXONOMY.md`

---

## Customer Experience

The customer-facing integration experience is:

1. the user launches Spike through the frontdoor shell profile
2. the user starts an external integration flow from inside Spike
3. the provider callback or webhook lands on the correct hosted surface without
   requiring URL guesswork
4. machine-facing webhook routing does not depend on browser sessions
5. direct tenant-origin access remains available for runtime-facing and
   callback-capable flows

The customer should not need to understand whether a flow is frontdoor-owned,
runtime-owned, or app-owned. The contract must still be explicit in the specs.

---

## Ownership Split

### Frontdoor-owned

Frontdoor owns:

- frontdoor identity callbacks
- frontdoor billing and provisioning flows
- any global ingress endpoint needed to dispatch a provider that only supports a
  single global webhook or callback URL

Spike does not redefine these flows.

### Runtime-owned

The runtime owns reusable shared-adapter ingress under:

- `/auth/<service>/...`
- `/adapters/<service>/webhooks/...`

Spike should use runtime-owned callback surfaces when the integration is part of
the reusable runtime connection system rather than a Spike-only product flow.

### Spike-owned

Spike owns product-specific external callbacks and webhooks under:

- `/app/spike/callbacks/...`
- `/app/spike/webhooks/...`

Spike-owned flows remain app-owned even when they are launched from the
frontdoor shell profile.

---

## Routing Profiles

### Human launch profile

Humans launch Spike through the frontdoor shell profile:

- `https://frontdoor.nexushub.sh/app/spike/`

The browser-facing Spike shell is not the canonical machine-facing callback or
webhook origin.

### Tenant-origin profile

The tenant origin is the canonical direct runtime origin for:

- machine-facing traffic
- app-owned callbacks
- app-owned webhooks
- future custom domains

Canonical base origin:

- `https://t-<tenantId>.nexushub.sh`

Spike callback and webhook routes must be valid under this profile without any
browser-session routing assumptions.

---

## Spike Connection Contract

Spike consumes shared adapter connections through Spike-owned connection
profiles.

Spike depends on the shared `github` adapter package and presents app-facing
connection profiles such as:

- `spike-managed-github-app`
- `bring-your-own-github-app`
- `personal-access-token`

Rules:

1. Spike does not own generic GitHub provider auth/setup logic.
2. Spike does not own reusable GitHub provider webhooks.
3. Spike owns only Spike-specific binding behavior on top of shared adapter
   connections.
4. Browser session lookup is not part of the webhook routing contract.

---

## GitHub-Specific Rules

GitHub is the primary Spike integration, so the target-state rules are explicit.

### GitHub App installation callback

The GitHub App installation callback is not Spike-owned in the canonical model.

It belongs to the shared GitHub adapter ingress under the runtime-owned adapter
surface.

Spike-specific context is carried by the selected Spike connection profile, not
by moving the provider callback into the Spike app namespace.

### GitHub webhook ingress

GitHub App webhooks are treated according to provider capability:

1. If GitHub flow design supports unique per-tenant webhook targets, use the
   tenant-origin shared GitHub adapter webhook surface directly.
2. If GitHub provides only one global webhook endpoint for the app, frontdoor
   owns the ingress endpoint and dispatches internally using stable external
   identifiers such as installation IDs.

In either case:

- browser sessions are never the dispatch mechanism
- tenant and app/profile routing must be derivable without a logged-in browser

---

## Credential Delivery Rules

Spike consumes integration credentials through explicit hosted runtime/app
configuration surfaces.

Target-state rules:

1. shared adapter connection state lives in the runtime/shared adapter layer
2. Spike-managed credentials are resolved by Spike connection profile through
   the frontdoor gateway to the Spike product control plane, not by provider
   service alone
3. undocumented frontdoor process-env inheritance is not the canonical Spike
   integration contract
4. Spike stores Spike-specific binding state, not generic provider auth state

This keeps Spike integration behavior portable across install, upgrade, and
multi-tenant deployments.

---

## Promotion Rule

If a Spike-specific integration flow becomes broadly reusable across products,
the flow should be promoted into a shared adapter/runtime contract and removed
from Spike-local ownership.

Until then, Spike-local product callbacks and webhooks remain app-owned.
