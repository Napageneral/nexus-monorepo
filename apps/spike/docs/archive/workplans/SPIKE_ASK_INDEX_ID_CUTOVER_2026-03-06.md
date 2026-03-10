# Spike Ask `index_id` Cutover

**Status:** COMPLETED
**Last Updated:** 2026-03-06

---

## Purpose

This workplan closes the most immediate remaining customer-facing vocabulary
drift in Spike's primary ask flow.

The customer experience to preserve is:

1. the user creates or selects an `AgentIndex`
2. the user asks Spike a question about that selected index
3. Spike accepts and returns `index_id` in that ask flow

This is a hard cutover of the primary ask contract. It is not the full
`tree_id` to `index_id` migration for every legacy Spike surface.

---

## Current Drift

The main Spike UI already asks with `index_id`, but the live ask contract still
diverges in three places:

1. `app/app.nexus.json` still declares `spike.ask` with `tree_id`
2. `service/cmd/spike-engine/nex_handlers.go` still requires `tree_id` in
   `nexAsk`
3. `service/cmd/spike-engine/serve.go` and `cmd/spike-engine/main.go` still use
   `tree_id` as the request/response field for direct `/ask` and `spike ask`

This means the highest-value customer action in Spike is still on a split
contract even though the product vocabulary is now `AgentIndex`.

---

## Target State

After this cutover:

1. `spike.ask` manifest params require `index_id`
2. `nexAsk` accepts only `index_id`
3. direct `/ask` request/response JSON uses `index_id`
4. `spike ask` uses `--index-id` and emits `index_id` in JSON mode
5. legacy `tree_id` ask payloads are rejected on the cutover surfaces

Internal PRLM/oracle implementation may still use a tree-shaped runtime model,
but the public ask surface is `AgentIndex` keyed by `index_id`.

---

## In Scope

### Runtime and package contract

Update:

- `app/app.nexus.json`
- `service/cmd/spike-engine/nex_handlers.go`
- `service/cmd/spike-engine/serve.go`

So the canonical ask contract is `index_id`.

### CLI wrapper

Update `service/cmd/spike-engine/main.go` so the developer-facing `spike ask`
wrapper matches the same ask contract.

### Tests

Update and add focused tests to prove:

1. ask JSON payloads and responses use `index_id`
2. hosted/runtime ask entrypoints reject legacy `tree_id`-only payloads

---

## Explicit Non-Goals

This slice does not yet:

- rename `spike.sync`, sessions, ask-requests, or tree-version APIs
- redesign the inspector around `AgentIndex`
- rename internal DB tables or PRLM store primitives
- remove all remaining `tree_id` references from the codebase

Those require a broader index-surface workplan.

---

## Validation

Minimum validation:

1. focused Spike tests pass for:
   - CLI ask JSON shape
   - remote ask JSON shape
   - runtime ask validation rejecting legacy `tree_id`
   - direct `/ask` validation rejecting legacy `tree_id`
2. `app/app.nexus.json` validates successfully under the canonical manifest
   parser
3. the main Spike UI still calls `spike.ask` with `index_id`

## Completion Notes

Completed on 2026-03-06.

Validated by:

1. full `go test ./cmd/spike-engine`
2. canonical manifest validation with zero errors and zero warnings
3. direct verification that `app/dist/index.html` still calls `spike.ask`
   with `index_id`
