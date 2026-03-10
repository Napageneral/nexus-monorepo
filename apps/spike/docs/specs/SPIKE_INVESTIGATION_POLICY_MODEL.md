# Spike Investigation Policy Model

**Status:** CANONICAL
**Last Updated:** 2026-03-06

---

## Purpose

This document defines Spike's target-state investigation architecture for
large-context codebase research.

It complements:

- `SPIKE_GUIDE_FOR_AGENT_MODEL.md`
- `SPIKE_OBJECT_TAXONOMY.md`

This document does not redefine Spike's output contract. It defines how Spike
organizes, executes, and hardens an investigation while keeping policy choices
modular.

---

## Customer Experience

The intended Spike investigation experience is:

1. an operator prepares a repository corpus as a Spike index
2. the operator gives Spike a task
3. the operator selects a policy profile or uses the default profile
4. Spike investigates the corpus according to that policy profile
5. Spike returns one final guide for the downstream agent
6. the guide includes evidence, uncertainty, missing branches, and concrete
   runtime follow-up checks when needed

The operator should not need to recover useful work from orphaned subtree runs.
The primary artifact is always one final guide.

The operator should also be able to compare policy profiles on the same corpus
and task without changing Spike's guide contract.

---

## Design Goals

Spike's investigation system must satisfy all of the following:

1. preserve Spike's completion-first, evidence-heavy guide-for-agent model
2. allow multiple policy families for tree formation, routing, pruning,
   synthesis, and execution
3. keep the orchestration kernel stable while policies change
4. preserve completed evidence and explicit branch state even when root
   completion is slow, blocked, or fails
5. make missing or degraded coverage explicit instead of silently hiding it
6. support reliable local and hosted execution with operator-visible progress
   and terminal reasons

---

## Core Model

### 1. Spike has a stable investigation kernel

Spike owns one investigation kernel that is not policy-specific.

The kernel is responsible for:

- investigation substrate persistence and run state
- ask request persistence
- recursive execution orchestration
- guide assembly boundaries
- provenance and observability
- cancellation and terminal status handling

The kernel must not hardcode one permanent routing, pruning, or synthesis
strategy into the orchestration flow.

### 2. Behavior changes through policy surfaces

Spike behavior varies through explicit policy surfaces.

Canonical policy surfaces are:

- `TreeConstructionPolicy`
- `RoutingPolicy`
- `ScopeClassifier`
- `SynthesisPolicy`
- `ExecutionPolicy`

These policy surfaces are independent concepts even when one profile supplies
defaults for several of them together.

When a run uses a non-tree-first investigation substrate, the same conceptual
surfaces still apply:

- index or partition construction instead of only literal tree construction
- traversal or revisit behavior instead of only child routing
- reconciliation across recursive evidence instead of only subtree synthesis

Tree-specific policy names remain useful because tree-based investigation is
still one valid policy family. They are not meant to imply that all Spike
investigation must remain tree-shaped forever.

### 3. A policy profile is a named composition

A `PolicyProfile` is a named composition of concrete policies for one
investigation run.

A profile may be attached:

- when creating an index
- when executing an ask
- when running evaluation experiments

The same task and corpus may be run under multiple policy profiles for
comparison.

### 4. Guide contract stays stable across policy profiles

Policy changes affect how Spike investigates and assembles evidence.

Policy changes do not redefine the downstream artifact. The output remains one
guide-for-agent response following the canonical guide contract in
`SPIKE_GUIDE_FOR_AGENT_MODEL.md`.

---

## Policy Surfaces

### TreeConstructionPolicy

`TreeConstructionPolicy` defines how Spike partitions a corpus into nodes when
the investigation profile uses a structured partition such as a tree.

It is responsible for:

- structural grouping
- bundle and roll-up behavior
- capacity targets
- minimum node sizes
- file-internal chunking rules when enabled
- treatment of generated or virtual nodes

The policy may optimize for different goals such as balanced fan-out,
directory fidelity, semantic grouping, or model-era context capacity.

### RoutingPolicy

`RoutingPolicy` defines how an investigator dispatches or revisits work across
sub-scopes.

It is responsible for:

- exhaustive broadcast vs selective dispatch
- dispatch ordering
- prioritization hints
- revisit behavior
- any adaptive routing logic

The default Spike routing policy is exhaustive dispatch over the immediately
available sub-scopes.

That default exists because Spike is optimized for large-context codebase QnA
and should prefer coverage over early pruning.

### ScopeClassifier

`ScopeClassifier` defines whether a node scope requires a live model turn or a
deterministic local response.

It is responsible for classifying scopes such as:

- empty scopes
- binary-only scopes
- generated-only scopes
- non-code asset scopes
- mixed scopes that still warrant live investigation

The classifier is not a routing policy. It does not decide whether a branch is
globally important. It decides how a scope should be handled once reached.

Its primary value is preventing low-signal scopes from consuming live model
turns when a deterministic "nothing relevant here" or "non-code asset scope"
response is more correct and more reliable.

### SynthesisPolicy

`SynthesisPolicy` defines how an investigator combines gathered evidence into
one upward response.

It is responsible for:

- evidence combination rules
- uncertainty handling
- missing-branch reporting
- strict vs partial child completion requirements
- handoff structure for the downstream agent

The default Spike synthesis policy is evidence-heavy and explicit.

Parents should:

- preserve relevant findings from children
- include meaningful local evidence from their own scope
- report branches that were unavailable, failed, timed out, or returned no
  relevant evidence

The default synthesis stance is strict completion.

By default, an investigator should not emit its final upward synthesis until
every directly dispatched branch has reached a terminal branch outcome.

Alternative synthesis policies may allow degraded completion, but that is a
policy choice, not the default Spike contract.

### ExecutionPolicy

`ExecutionPolicy` defines how live investigation work is executed and bounded.

It is responsible for:

- per-node deadlines
- retry behavior
- cancellation propagation
- concurrency bounds
- progress heartbeat expectations
- terminal reason normalization
- provider execution mode and transport selection

Execution policy may use different runtime substrates and transports, including
stdio app-server flows, request/response APIs, streaming APIs, SSE, or
WebSocket-based transports.

Those transport choices are execution details. They must not redefine Spike's
investigation semantics or guide contract.

---

## Default Profile

Spike's default policy profile is:

- filesystem-oriented partition construction
- exhaustive routing to all direct children
- deterministic self-pruning for empty and clearly non-code scopes
- strict-complete evidence-heavy synthesis
- bounded, cancellable execution with operator-visible terminal reasons

This default profile preserves Spike's original completion-first philosophy
while still requiring explicit branch accounting and bounded execution.

Alternative profiles may use graph-first or recursive retrieval-oriented
investigation over the same prepared corpus.

---

## Reliability Requirements

### 1. One ask must yield one terminal root artifact

Every ask must end in one terminal root outcome:

- completed guide
- failed guide with explicit terminal reason
- cancelled guide with explicit terminal reason

Some policy profiles may also allow:

- completed guide with degraded coverage

`running` is not a terminal state.

### 2. Branch failure must be observable

If a subtree fails, stalls, times out, or is cancelled, that branch outcome
must be recorded and surfaced upward.

The operator and downstream agent must be able to distinguish:

- no relevant evidence found
- scope intentionally handled without a live model turn
- execution failure
- timeout
- cancellation

### 3. Cancellation must propagate cleanly

Interactive and hosted runs must support clean cancellation.

Cancellation must:

- stop live work where possible
- persist terminal branch/request state
- preserve already completed evidence
- avoid orphaning the root request in a non-terminal state

### 4. Completion-first does not mean unbounded execution

Spike should prefer coverage over cheap pruning, but each branch must still
have bounded execution behavior.

Bounded execution is part of correctness because an investigation that never
finishes cannot hand off a guide to the downstream agent.

By default, "wait for completion" means "wait until each branch reaches a
terminal outcome," not "allow an unbounded silent stall to hold the root open
forever."

### 5. Observability is part of the product

Spike must expose enough state for an operator to understand:

- which policy profile ran
- which branches completed
- which branches were classified deterministically
- which branches degraded and why
- whether the final guide represents full or partial coverage

---

## Policy Selection And Evaluation

Spike is designed for comparative policy experimentation.

Operators must be able to evaluate different policy profiles on the same corpus
and task without changing the surrounding harness.

This is especially important for benchmark workflows where teams may want to
compare:

- exhaustive routing vs selective routing
- different partition topologies and capacities
- different scope classifiers
- different synthesis tolerances
- different execution substrates or provider transports

The evaluation surface should vary policies, not fork Spike into separate
products.

---

## Non-Goals

This model does not make Spike:

- a single hardcoded routing strategy
- an all-or-nothing subtree barrier that hides useful partial work
- a transport-specific system tied permanently to SSE, WebSocket, or one agent
  runtime
- a heuristic cost-minimizer that optimizes away coverage by default
- a system where silent branch stalls are treated as meaningful progress

---

## Enforcement Rule

Any Spike change that hardcodes investigation behavior into the kernel must
justify why that behavior is truly invariant rather than a policy choice.

If the behavior can plausibly vary across future Spike experiments, it belongs
behind an explicit policy surface.
