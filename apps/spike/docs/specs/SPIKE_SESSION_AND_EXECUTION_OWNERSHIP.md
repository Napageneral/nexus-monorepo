# Spike Session And Execution Ownership

**Status:** CANONICAL
**Last Updated:** 2026-03-08

---

## Purpose

This document defines the target-state ownership boundary for Spike session
history, agent execution, and ask orchestration.

It exists to remove the old split-brain where Spike owned both product metadata
and a private broker/session ledger.

Shared Nex rules come from:

- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/agents/agents-database-reference.md`
- `SPIKE_OBJECT_TAXONOMY.md`
- `SPIKE_APP_AND_PACKAGE_MODEL.md`
- `SPIKE_PRODUCT_CONTROL_PLANE.md`

This document applies those platform rules to Spike.

---

## Customer Experience

The intended Spike experience is:

1. the user selects an `AgentIndex`
2. the user asks Spike a question about that index
3. Spike creates a product-level `ask request`
4. Spike launches or attaches to execution through canonical Nex agent/session
   APIs
5. Nex records the session, turns, messages, and tool calls in `agents.db`
6. Spike shows ask-request status and linked session history without owning a
   second transcript system

The customer should experience one coherent system:

- Spike owns the code-research product workflow
- Nex owns generic execution and communication history

---

## Canonical Decision

### 1. Spike does not own a private broker

Spike must not remain the primary owner of:

- sessions
- turns
- messages
- tool calls
- generic execution orchestration

Those responsibilities belong to Nex.

### 2. Nex owns durable execution history

The canonical system of record for generic execution history is Nex's agents
ledger in `agents.db`.

Nex owns:

- session identity and lifecycle
- thread ancestry
- turn history
- message history
- tool-call history
- subagent lineage
- execution metadata needed for audit, replay, and operator visibility

### 3. Spike owns product orchestration

Spike remains responsible for:

- repository selection and sync
- `git mirror` and `worktree` management
- `AgentIndex` creation and lifecycle
- ask-request creation and product status
- guide/context-pack preparation
- product-specific UX and domain rules

Spike asks Nex to execute work. Spike does not become the ledger of record for
that work.

---

## Ownership Split

| Layer | Owns |
|---|---|
| Frontdoor | accounts, servers, hosted routing, package install/upgrade orchestration |
| Hosted runtime | app lifecycle, runtime transport, shared adapter execution, runtime request dispatch |
| Nex agents/session system | sessions, threads, turns, messages, tool calls, execution history, `agents.db` |
| Spike app | repositories, `git mirror`, `worktree`, `AgentIndex`, ask-request product records, guide artifacts, Spike-specific orchestration |

---

## Ask Request Contract

### Ask requests are Spike product objects

An `ask request` is not a session.

An ask request represents one Spike product action:

- the selected `AgentIndex`
- the prompt or operator intent
- any Spike-owned guide/context inputs
- product status and result summary
- the linkage to Nex-owned execution

### Nex sessions are execution records

The linked Nex session is the durable execution record for that ask request.

Spike ask requests must link to canonical Nex execution identifiers rather than
copying the transcript into `spike.db`.

Target-state linkage is:

- a canonical Nex `session key` or label
- enough Nex ledger linkage to resolve the associated thread/turn history
- optional cached preview fields in Spike for UI convenience only

### One ask request, one primary execution lineage

The normal case is:

- one ask request
- one primary Nex session lineage

If a Spike ask fans out into subagents or child sessions, that branching still
remains Nex-owned session history. Spike may reference it, but does not own or
re-store it.

---

## Execution Rules

### Canonical execution path

When Spike needs agentic execution, it must use canonical Nex agent/session
surfaces.

Examples include:

- session resolution
- session creation or reuse
- ask/session history inspection
- transcript/timeline reads
- session archival or lifecycle mutation

Spike must not add a second private execution API beside Nex's canonical
session system.

### Product-local work that remains Spike-owned

Not every Spike operation is a generic session.

Spike still owns product-specific control-plane work such as:

- syncing repositories
- materializing worktrees
- building or refreshing indexes
- maintaining Spike-local product metadata

Deterministic product jobs may remain Spike-local.

The hard cutover applies to generic agent execution and transcript ownership,
not to every background task Spike performs.

### Hydration and agentic background work

If a future Spike pipeline step requires true agent-session semantics
(conversation, tool-call lineage, reusable session history), that step must go
through Nex's agent/session system rather than reviving a Spike-local broker.

---

## UI And Product Implications

The active UI model must follow this ownership split:

1. Spike primary surfaces are index-centric and ask-request-centric
2. session/timeline views are projections over Nex session history linked from
   Spike ask requests
3. no customer-facing Spike surface should require understanding legacy
   Spike-local broker ids
4. diagnostic transcript views must read from Nex-owned history, not a private
   Spike ledger

This is why UI redesign should follow this spec instead of preserving the
legacy inspector model.

---

## Non-Negotiable Rules

1. Spike does not own generic session, turn, message, or tool-call tables.
2. `spike.db` is not the system of record for execution transcripts.
3. Nex `agents.db` is the durable execution ledger for Spike asks.
4. Ask requests remain first-class Spike product records.
5. Spike may cache summary fields for UX, but not duplicate full transcript
   ownership.
6. No backward-compatible broker layer should survive as a parallel long-term
   execution path.
