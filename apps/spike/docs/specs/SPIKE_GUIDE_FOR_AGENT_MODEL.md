# Spike Guide For Agent Model

**Status:** CANONICAL
**Last Updated:** 2026-03-06

---

## Purpose

This document defines Spike's target-state operating model for large-context
codebase investigation.

Spike has one operating mode:

- `guide-for-agent`

Spike exists to investigate a large repository corpus, assemble the most
relevant evidence, and hand a downstream agent a context pack plus a concrete
investigation guide.

Direct human review of Spike's output is an operator checkpoint, not a separate
product mode.

---

## Customer Experience

The intended Spike experience is:

1. the operator points Spike at a prepared repository corpus
2. the operator gives Spike a task or question
3. Spike investigates the corpus exhaustively across its available
   investigation substrates
4. Spike returns an evidence-backed guide
5. the operator may review that guide
6. a downstream agent uses the guide to do the live execution, validation, or
   runtime research the task still requires

Spike is optimized for repositories that are too large for a single agent pass
to reason over reliably.

---

## Core Model

### 1. Coverage and reconciliation are the default

Spike should prefer complete and reconcilable evidence over premature pruning.

If an investigation strategy has a choice between:

- broader evidence gathering
- or early simplification that risks missing decisive evidence

the default bias is toward broader evidence gathering.

### 2. Investigation may use multiple substrates

Spike may investigate through any combination of:

- current-code indexing
- tree or graph views over that index
- static-analysis tools
- git-history memory
- recursive follow-up loops

The guide contract is stable even when the investigation substrate changes.

### 3. Recursive clarification is allowed and expected

Spike should be able to continue investigating when first-pass evidence exposes:

- unresolved helper behavior
- contradictions across files or layers
- historical context that changes the likely answer
- missing evidence needed for a reliable guide

Spike does not need to finalize after one linear pass if the guide is not yet
good enough to hand off.

### 4. Completion and accuracy beat efficiency

Spike is allowed to spend work exploring irrelevant branches if that is what it
takes to avoid missing a relevant branch.

Efficiency work is secondary to correctness and coverage.

### 5. Evidence is local and explicit

Spike must:

- cite exact file paths when possible
- name concrete functions, classes, endpoints, jobs, or commands when possible
- distinguish evidence from inference
- say explicitly when nothing relevant was found in a scope

Spike must not:

- invent file paths or symbols
- claim runtime observations it did not actually obtain
- present speculation as evidence

### 6. Static analysis and runtime validation are different outputs

Spike is primarily a codebase investigation system.

If the task asks for behavior that requires runtime observation, network calls,
logs, database state, or interactive confirmation, Spike should not fabricate
that result.

Instead Spike should:

- describe what the code strongly suggests
- identify the exact files and flows involved
- produce concrete runtime checks for the downstream agent

---

## Guide Contract

The canonical Spike output is a guide for a downstream agent.

That guide should contain:

1. `task understanding`
2. `evidence-backed findings`
3. `relevant files, symbols, and flows`
4. `open uncertainties`
5. `runtime checks for the downstream agent`
6. `suggested handoff plan`

Spike may include a provisional answer, but that answer is part of the guide.
It is not a separate operating mode.

---

## Non-Goals

Spike is not:

- a heuristic router that prunes most of the investigation space before inspection
- a replacement for the downstream agent that performs end-to-end runtime work
- a system that optimizes first for cheapest-token routing over completeness

---

## Enforcement Rule

Any Spike ask/investigation design that reduces coverage must justify itself
against this model.

The default behavior remains:

- broad evidence gathering
- recursive clarification when needed
- evidence-heavy synthesis
- guide-for-agent output
