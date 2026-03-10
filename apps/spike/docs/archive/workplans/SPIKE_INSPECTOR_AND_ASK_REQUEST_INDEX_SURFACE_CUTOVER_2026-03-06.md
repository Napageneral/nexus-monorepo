# Spike Inspector And Ask-Request `index_id` Surface Cutover

**Status:** SUPERSEDED
**Last Updated:** 2026-03-06

---

## Purpose

Superseded by the 2026-03-08 Spike spec reset that moved UI redesign behind
the broker/session ownership cutover and the `spike.db` storage-boundary
cutover.

This document is retained only as historical context for the earlier
incremental-inspector path.

This workplan defines the next Spike vocabulary cutover after the primary ask
flow moved to `index_id`.

The customer-facing goal is:

1. a user selects or lands on an `AgentIndex`
2. the user opens the request timeline / inspector for that same `AgentIndex`
3. Spike's ask-request and inspector surfaces speak `index_id`, not `tree_id`

This slice is larger than the primary ask cutover because the inspector UI,
ask-request methods, and tree-version browsing are still coupled.

---

## Current Drift

The current request-inspection surface still uses the old tree vocabulary in
multiple connected places:

1. `app/app.nexus.json` still declares:
   - `spike.ask-requests.get`
   - `spike.ask-requests.list`
   - `spike.ask-requests.inspect`
   - `spike.ask-requests.timeline`
   with `tree_id`
2. `service/cmd/spike-engine/serve.go` and
   `service/cmd/spike-engine/nex_handlers.go` still accept `tree_id` for those
   methods and still emit `tree_id` on `askRequestRecord`
3. `app/dist/inspector.html` still:
   - prompts for `tree_id`
   - builds request payloads with `tree_id`
   - reads `tree_id` query params
   - renders `tree_id` values inside the request timeline workflow
4. the inspector page currently uses `tree_id` as the bridge between:
   - tree version browsing
   - ask-request listing
   - request inspection

That means the main Spike UI now asks by `index_id`, but the follow-up request
inspection workflow still asks the user to think in `tree_id`.

---

## Target State

After this cutover:

1. the ask-request runtime methods and manifest use `index_id`
2. the ask inspector UI uses `index_id` in forms, request payloads, query
   params, and rendered records
3. `askRequestRecord` exposes `index_id` on the public API surface
4. the inspector workflow no longer asks the customer to know a `tree_id`

Internal DB tables and helper functions may still continue to store/query the
same string in legacy `tree_id` columns until a later storage-model cutover.

---

## Design Constraint

This work cannot be implemented as a trivial search-and-replace because the
inspector currently mixes two concepts:

1. `AgentIndex` as the active customer-facing object
2. `tree version` browsing as a legacy diagnostic workflow

Before implementation, Spike needs one explicit decision:

- whether tree-version browsing remains an active inspector feature and is
  re-expressed in index-oriented language
- or whether that browsing residue is demoted/removed from the active customer
  inspector

Until that decision is made, a partial rename would create another mixed-state
surface.

---

## In Scope

Once the above decision is made, this slice should cover:

1. `app/app.nexus.json` ask-request method schemas
2. `service/cmd/spike-engine/serve.go`
3. `service/cmd/spike-engine/nex_handlers.go`
4. `app/dist/inspector.html`
5. focused ask-request / inspector tests

---

## Explicit Non-Goals

This slice does not yet:

- rename the full sessions API surface
- rename sync/jobs/status surfaces
- migrate DB column names away from `tree_id`
- redesign PRLM internals

---

## Validation

Minimum validation for the eventual implementation:

1. focused Spike tests pass for ask-request and inspector flows
2. manifest validation passes
3. the inspector page no longer requires or emits `tree_id` on its public ask
   inspection workflow
