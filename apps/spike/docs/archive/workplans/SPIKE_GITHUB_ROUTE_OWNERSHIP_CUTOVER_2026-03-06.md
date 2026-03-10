# Spike GitHub Route Ownership Cutover

**Status:** COMPLETED
**Last Updated:** 2026-03-06

---

## Purpose

This workplan defines the next narrow Spike gap-closure slice after the
manifest/runtime canonical cutover.

The customer-facing goal is:

1. Spike GitHub flows should land on canonical hosted route families.
2. Spike should stop exposing the old bespoke `/connectors/github/...` and
   `/github/webhook` HTTP surfaces.
3. The remaining Spike-owned HTTP surfaces should live under the canonical app
   namespace `/api/spike/...`.

This is a route-ownership cutover, not the full shared adapter connection
runtime cutover.

---

## Canonical Ownership Model

The active hosted and adapter specs require this split:

### Runtime/shared-adapter ingress

- `/auth/<service>/...`
- `/adapters/<service>/webhooks/...`

For GitHub in this slice:

- `/auth/github/callback`
- `/adapters/github/webhooks`

### Spike-owned HTTP control

Spike-owned product control endpoints belong under:

- `/api/spike/...`

For the surviving GitHub control surface in this slice:

- `/api/spike/github/installations/list`
- `/api/spike/github/installations/get`
- `/api/spike/github/setup`
- `/api/spike/github/repos`
- `/api/spike/github/branches`
- `/api/spike/github/commits`
- `/api/spike/github/remove`

---

## Legacy Routes To Delete

These should no longer exist after the cutover:

- `/github/webhook`
- `/connectors/github/install/start`
- `/connectors/github/install/callback`
- `/connectors/github/repos`
- `/connectors/github/branches`
- `/connectors/github/commits`
- `/connectors/github/remove`
- `/connectors/github/setup`

Reasoning:

1. `/github/webhook` is a bespoke provider webhook ingress outside the canonical
   shared adapter namespace.
2. `/connectors/github/install/callback` is a bespoke provider callback route
   outside the canonical shared adapter callback namespace.
3. the remaining `/connectors/github/...` routes are Spike-owned control
   endpoints and therefore belong under `/api/spike/...`.
4. install-start no longer needs a dedicated HTTP route in Spike because the UI
   already starts the flow through runtime methods.

---

## Explicit Non-Goals

This slice does not yet:

- implement the shared runtime connection-profile system for Spike
- replace `spike.connectors.github.*` runtime methods with final connection API
  vocabulary
- move GitHub provider secret ownership fully out of Spike
- rewrite Spike bindings from installation-centric state to stable shared
  `connection_id` records

Those remain later cutovers.

---

## Validation

Minimum validation:

1. focused Spike service tests pass with the canonical route families
2. no HTTP route registration remains for `/connectors/github/...`
3. no HTTP route registration remains for `/github/webhook`
