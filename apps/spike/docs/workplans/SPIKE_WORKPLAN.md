# Spike Workplan

**Status:** ACTIVE
**Last Updated:** 2026-03-08

---

## Purpose

This is the active implementation workplan for bringing Spike into alignment
with the canonical Spike specs.

It reflects the current target state:

- Spike owns repositories, worktrees, indexes, ask requests, and other
  product-specific objects
- Nex owns sessions, turns, messages, tool calls, and durable execution
  history

This workplan supersedes the older "unified spike.db owns everything" plan.

**HARD CUTOVER. NO BACKWARD COMPATIBILITY.**

---

## Customer Target

The intended customer experience is:

1. install Spike as a normal hosted app
2. connect a repository through a shared adapter flow exposed by Spike
3. build or reuse an `AgentIndex`
4. ask questions against that index
5. inspect ask-request status and linked execution history cleanly

The intended operator experience is:

1. one clear product database for Spike-specific state
2. one clear execution ledger in Nex for sessions and transcripts
3. no duplicate broker/session model inside Spike

---

## Guiding Rules

1. Do not keep a private Spike broker as a compatibility layer.
2. Do not redesign the UI against the legacy broker/session model.
3. Do not let `spike.db` remain a catchall transcript store.
4. Do not reintroduce `tree` as the default customer-facing noun where the
   target state now says `AgentIndex`.

---

## Phase 1: Canonical Spec Baseline

### Goal

Lock the active Spike specs around the new ownership and storage boundary.

### Scope

- `SPIKE_SESSION_AND_EXECUTION_OWNERSHIP.md`
- `SPIKE_STORAGE_BOUNDARY.md`
- `SPIKE_DATA_MODEL.md`
- related taxonomy/package alignment

### Exit criteria

- active specs no longer describe Spike as the owner of generic sessions and
  transcripts
- active specs describe `ask request` as the product object linked to Nex
  execution

Status: complete in docs, pending code follow-through.

---

## Phase 2: Broker And Session Ownership Cutover

### Goal

Remove the Spike-local broker from the primary ask/session path.

Primary execution workplan:

- `SPIKE_PHASE_2_BROKER_AND_SESSION_OWNERSHIP_CUTOVER_2026-03-08.md`

### Scope

- replace Spike-local session orchestration with canonical Nex agent/session
  APIs
- remove `spike.sessions.*` as a first-class long-term product surface
- remove direct `/sessions/*` HTTP ownership from Spike
- stop treating `service/internal/broker/` as the surviving execution core

### Concrete changes

1. identify the exact Nex API calls Spike will use for ask execution and
   history inspection
2. rewrite ask execution to create or resolve Nex sessions instead of local
   broker sessions
3. delete the losing broker/session control surfaces

### Exit criteria

- a Spike ask produces Nex-owned session history
- Spike no longer owns a private transcript ledger as the primary path

---

## Phase 3: Storage Boundary Cutover

### Goal

Make `spike.db` a product-only store.

### Scope

- remove Spike-owned session/turn/message/tool-call tables from the target
  schema
- rewrite `ask_requests` to store Nex execution linkage
- remove storage assumptions that treat transcript history as Spike-owned

### Concrete changes

1. rewrite `service/internal/spikedb/schema.go`
2. rewrite any PRLM store compatibility layers still persisting ask/session
   data under the old shape
3. update tests to assert product metadata in `spike.db` and execution history
   in Nex-owned ledgers

### Exit criteria

- `spike.db` contains product state only
- linked Nex execution identifiers are present where ask-request inspection
  needs them

---

## Phase 4: Vocabulary And API Surface Cutover

### Goal

Align the public Spike contract to the canonical object model.

### Scope

- remove `tree_id` from surviving app-facing ask/request flows
- align manifest method params and responses to `AgentIndex`
- resolve the fate of `tree_versions` as either deleted residue or explicitly
  redesigned lineage

### Concrete changes

1. rewrite manifest methods that still speak `tree_id`
2. rewrite handler payloads and returned shapes
3. delete or redesign tree-version-specific APIs

### Exit criteria

- `AgentIndex` / `index_id` is the stable customer-facing object for ask flows
- legacy tree-centric APIs are gone or explicitly redesigned

---

## Phase 5: UI Surface Rewrite

### Goal

Replace the legacy inspector/dashboard surfaces with a UI that matches the new
backend boundary.

### Scope

- redesign request inspection around `ask request`
- present Nex-owned session history as linked execution detail
- remove tree-version and broker-centric inspector assumptions

### Concrete changes

1. define the surviving Spike UI surfaces from scratch against the active specs
2. replace the current inspector instead of incrementally patching it
3. keep runtime transport on the shared bridge

### Exit criteria

- no active customer-facing UI depends on legacy Spike broker nouns
- the main ask and inspect flows tell one coherent story

---

## Phase 6: Integration And Configuration Cleanup

### Goal

Align Spike's GitHub and hosted-configuration behavior to the active specs.

### Scope

- callback and webhook ownership cleanup
- shared adapter connection usage
- config and secret delivery cleanup

### Concrete changes

1. delete legacy `/connectors/github/...` and `/github/webhook` ownership
2. move remaining provider behavior to shared adapter/runtime or canonical
   app-owned routes
3. replace undocumented env inheritance with explicit hosted contracts

### Exit criteria

- shared adapter and Spike binding ownership are clear in code
- no legacy ingress routes remain as the product contract

---

## Phase 7: Hosted Lifecycle Fidelity

### Goal

Make the published package, install flow, and runtime lifecycle match the docs.

### Scope

- published package determinism
- install/upgrade capability checks
- frontdoor shell validation

### Exit criteria

- local, published, and installed package state converge
- frontdoor launch and runtime bridge validation are part of release confidence

---

## Deferred Until After This Work

These are important, but they come after the boundary cleanup above:

- Git history / GitHub record ingest into Nex records and memory
- further memory-aware guide generation on top of Nex memory outputs
- broader UI product polish beyond the post-broker rewrite

The broker/session/storage cutover is the prerequisite for that later work.
