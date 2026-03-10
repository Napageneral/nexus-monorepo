# Spike Validation Ladder

**Status:** ACTIVE
**Last Updated:** 2026-03-08

---

## Purpose

This ladder validates the implementation against the active Spike target-state
specs.

It replaces the older ladder that assumed `spike.db` was the owner of broker
and transcript state.

**HARD CUTOVER. NO BACKWARD COMPATIBILITY.**

---

## How To Use This Ladder

Each rung represents a dependency-ordered checkpoint.

Do not skip rungs. Each rung should leave Spike in a coherent working state that
still matches the active specs.

---

## Rung 0: Spec Baseline

**What to validate**

The active Spike docs all describe the same ownership boundary.

**Checks**

```text
[ ] Active specs include session/execution ownership and storage boundary docs
[ ] No active Spike spec says Spike owns generic sessions, turns, messages, or tool calls
[ ] Active data model treats ask requests as product records linked to Nex execution
```

**Checkpoint**

The spec set is internally coherent.

---

## Rung 1: Ask Execution Uses Nex Session Ownership

**What to validate**

Spike ask execution no longer depends on the private Spike broker as the
surviving session owner.

**Checks**

```text
[ ] Spike service has a canonical app-service -> Nex runtime caller path
[ ] `spike.ask` still returns a final answer from the Spike product surface
[ ] Spike creates or resolves a deterministic root Nex session key for each ask request
[ ] DAG prompt steps execute through Nex runtime calls rather than local broker execution
[ ] Spike persists per-step execution linkage for request/node/phase/attempt
[ ] A Spike ask creates or resolves execution through canonical Nex session APIs
[ ] Ask execution returns or persists a canonical Nex session key
[ ] No new ask flow depends on a Spike-local broker session as the source of truth
```

**Checkpoint**

Spike can ask questions without treating its private broker as the durable
execution ledger.

---

## Rung 1A: Execution Context Fidelity

**What to validate**

The Nex-backed execution path preserves the execution controls Spike actually
needs.

**Checks**

```text
[ ] Each `AgentIndex` resolves to one stable Nex `workspace_id` for ask execution
[ ] Each DAG prompt step passes the concrete sandbox path as turn `working_dir`
[ ] The Nex execution path accepts and records `agent_config_id`
[ ] Spike preserves node/phase-specific prompt behavior through Nex execution inputs
[ ] The final answer still comes from the surviving Spike DAG synthesis path rather than an ad hoc transcript shortcut
```

**Checkpoint**

Spike still behaves like Spike even though Nex now owns execution and
transcript history.

---

## Rung 2: `spike.db` Is Product-Only Storage

**What to validate**

Spike storage matches the new storage boundary.

**Checks**

```text
[ ] `spike.db` contains Spike product tables such as repositories, worktrees, indexes, and ask requests
[ ] `ask_requests` stores Nex execution linkage such as `nex_session_key`
[ ] `ask_request_executions` stores request/node/phase execution linkage only
[ ] No active ask flow relies on `root_turn_id` as the durable execution anchor
[ ] Spike-local schema no longer owns canonical `sessions`, `turns`, `messages`, or `tool_calls` tables
[ ] Tests no longer assert transcript ownership inside `spike.db`
```

**Checkpoint**

`spike.db` is a product DB, not a transcript ledger.

---

## Rung 3: API Vocabulary Matches The Specs

**What to validate**

Surviving Spike APIs use the canonical object model.

**Checks**

```text
[ ] Active ask/request methods use `index_id`
[ ] Legacy `tree_id` does not survive in the primary ask/request path
[ ] `spike.sessions.*` is removed or no longer presented as a Spike-owned long-term surface
[ ] `/sessions/*` is removed or no longer presented as a Spike-owned long-term surface
[ ] Any surviving lineage/version API matches the active specs rather than legacy `tree_versions` residue
```

**Checkpoint**

Spike tells one object story externally.

---

## Rung 4: UI Surfaces Match The New Backend Boundary

**What to validate**

The UI no longer reflects the old broker/tree inspector model.

**Checks**

```text
[ ] Main ask flow is index-centric
[ ] Request inspection is ask-request-centric
[ ] UI does not require `tree_id` for the primary inspection flow
[ ] Transcript/timeline views read from linked Nex session history
[ ] Browser transport still uses the shared runtime bridge
```

**Checkpoint**

The UI matches the active product model.

---

## Rung 5: Integration Ownership Is Clean

**What to validate**

GitHub callback and webhook ownership matches the active specs.

**Checks**

```text
[ ] No legacy `/connectors/github/...` routes remain as the canonical product surface
[ ] No legacy `/github/webhook` route remains as the canonical product surface
[ ] Shared adapter connection flow works with Spike-owned bindings
[ ] Browser session state is not the routing mechanism for machine callbacks
```

**Checkpoint**

Integration ownership is explicit and correct.

---

## Rung 6: Hosted Configuration And Lifecycle Are Deterministic

**What to validate**

Spike behaves like a normal hosted app package.

**Checks**

```text
[ ] Published package and installed package match the tested source
[ ] Runtime lifecycle supports the documented install/upgrade path
[ ] Frontdoor shell loads `/app/spike/`
[ ] Runtime bridge connects successfully through frontdoor
```

**Checkpoint**

Hosted operation is deterministic enough to trust the docs.

---

## Rung 7: End-To-End Product Flow

**What to validate**

The full Spike workflow matches the target state.

**Checks**

```text
[ ] Connect repository through the intended adapter/profile flow
[ ] Build or reuse an `AgentIndex`
[ ] Submit an ask request against that index
[ ] `spike.ask` returns a final answer while using Nex-owned execution history underneath
[ ] Ask request links to Nex-owned execution history
[ ] Nex session and turn history show the expected `workspace_id`, `agent_config_id`, and `working_dir`
[ ] Inspect the request and session history successfully
[ ] No Spike-local broker transcript ownership is required anywhere in the flow
```

**Checkpoint**

Spike is operating as the intended Nex-native code research product.
