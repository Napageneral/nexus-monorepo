# Spike Recursive Guide Architecture

**Status:** CANONICAL
**Last Updated:** 2026-03-06
**Related:** SPIKE_GUIDE_FOR_AGENT_MODEL.md, SPIKE_INVESTIGATION_POLICY_MODEL.md, SPIKE_OBJECT_TAXONOMY.md

---

## Purpose

This document defines Spike's target-state architecture for building
high-quality research guides and context packs for downstream coding agents.

Spike's primary job is not to replace the execution agent. Spike's job is to
assemble the best possible evidence-backed guide so that a downstream coding
agent can validate, test, execute, and finish the task with less wasted search.

---

## Customer Experience

The intended Spike experience is:

1. an operator points Spike at a repository and a pinned commit
2. Spike builds or reuses a persistent current-code index for that commit
3. Spike builds or reuses git-history memory for that repository
4. the operator gives Spike a task or benchmark prompt
5. Spike investigates recursively across current code, structural tools, and
   historical memory until it is satisfied it has assembled a strong guide
6. Spike returns one guide and context pack for a downstream coding agent
7. the operator may review the guide before handing it to the execution agent
8. the downstream agent uses Spike's guide to run code, perform checks, and
   validate behavior in the live environment

Spike should feel like a persistent research substrate for large codebases, not
like a one-shot prompt wrapper over a repo checkout.

---

## Core Thesis

### 1. Present truth and historical truth are different but complementary

The current repository state answers:

- what is true now
- what symbols, flows, and behaviors exist now
- what exact code path currently governs a behavior

Git history answers:

- how the current state came to be
- what moved, merged, split, or was renamed
- what files and subsystems tend to change together
- what intent, invariant, or rationale was attached to a change

Spike should use both.

### 2. The best guide builder is multi-substrate

Spike should not rely on a single substrate for codebase research.

Its investigation should combine:

- a persistent current-code index
- git-history memory
- graph and static-analysis tools
- recursive investigation loops

### 3. Tree partitioning is optional, not defining

A tree over the corpus may still be useful as one index or investigation policy.

It is not Spike's defining architectural commitment.

Spike's defining commitment is:

- persistent structured understanding of code and history
- recursive evidence gathering until a guide is good enough to hand off

### 4. Guide quality matters more than elegance of internal decomposition

If a recursive investigator over an index, graph, and memory system produces a
better guide than a fixed tree, that is the correct direction for Spike.

---

## Architecture

## 1. Persistent Current-Code Index

Spike maintains a durable per-commit index over the current codebase.

This index is not inherently tree-first.

It should persist, at minimum:

- file inventory
- file hashes
- token counts
- language classification
- AST-aware chunks
- symbol definitions
- symbol references
- import relationships
- call relationships when derivable
- embeddings and search metadata
- cached code summaries and other reusable investigation artifacts

The persistent current-code index is the reusable knowledge plane for the code
that exists at a pinned commit.

It exists so that repeated questions over the same repo or commit do not require
full rediscovery from scratch.

## 2. Git-History Memory

Spike ingests repository history into the Nexus memory system.

Commits, pull requests, and related historical artifacts are treated as memory
events that can be retained, consolidated, recalled, and reflected on.

The intended pipeline is:

1. git history enters Nexus as events
2. retain extracts durable facts from diffs, commit messages, PR text, and
   structural change patterns
3. consolidation produces observations about subsystem evolution, coupling,
   ownership, renames, invariants, and recurring failure patterns
4. recall and reflect surface those learnings during codebase investigation

Git-history memory is not a substitute for reading current code. It is a second
evidence plane that explains how the code evolved and what relationships have
historically mattered.

## 3. Graph And Static-Analysis Tools

Spike should use graph-oriented and static-analysis-oriented tooling as first-
class investigation capabilities.

This includes capabilities such as:

- AST-aware chunking
- symbol resolution
- import graph traversal
- call graph traversal
- context and impact queries
- code slicing and dependency tracing

These capabilities may be implemented natively or provided through integrated
tools. Spike's architecture should treat them as stable investigation
substrates, not as incidental debug helpers.

## 4. Recursive Investigation

Spike investigates recursively.

The intended loop is:

1. inspect currently available evidence
2. form a provisional explanation or partial answer
3. identify unresolved dependencies, contradictions, or missing evidence
4. gather more evidence from the most useful substrate
5. repeat until the guide is sufficient or the system reaches a bounded terminal
   reason

Recursive investigation may materialize sub-investigators or scoped queries, but
it is not required to follow a fixed parent-child tree topology.

The recursive investigator should be able to:

- revisit a prior scope
- resolve imported helpers before finalizing
- cross-check route code against helpers, config, tests, and handlers
- move between current code, tool outputs, and git-history memory naturally

### Query Planning Before Deep Investigation

For broad natural-language benchmark or operator prompts, Spike should not rely
on one whole-query lexical search to choose its first anchor.

Before deep investigation starts, Spike should:

1. normalize the incoming task prompt into a small set of high-signal
   subsystem probes
2. search those probes independently against the current-code index
3. prefer diverse source-code anchors over generic, test-only, or low-signal
   asset hits
4. assemble a first-pass multi-anchor pack that spans the distinct runtime or
   behavioral surfaces implied by the prompt

Examples:

- a startup-health question may require separate anchors for web server, auth,
  email handler, dashboard, and job runner surfaces
- a behavior question may require separate anchors for route, helper, model,
  error handler, and tests

This query-planning phase is part of recursive investigation, not an optional
afterthought.

### Behavior-Path Query Planning For Narrow Prompts

Broad runtime prompts and narrow behavior prompts should not be planned the same
way.

For narrow behavior prompts, Spike should:

1. extract the highest-signal path, helper, and validation phrases from the
   prompt
2. prefer those phrases over generic domain terms like `alias`, `server`, or
   `user`
3. anchor the guide on the specific route, helper, model, and test files that
   explain the behavior in question
4. avoid injecting broad runtime-surface synthesis unless the prompt is
   actually about broad runtime readiness or operational validation

Examples:

- a `custom alias` prompt about signed suffix validation should prioritize
  `new_custom_alias`, `check_suffix_signature`, `alias_suffix`, quota checks,
  and related tests
- it should not surface a generic web-server guide just because the prompt
  mentions `server console`

This distinction matters because behavior questions are decided by a small
causal path, not by a broad operational map of the whole repo.

### Runtime Surface Synthesis Before Final Guide Assembly

For broad codebase QnA prompts, selecting the right source anchors is
necessary but not sufficient.

Before final guide assembly, Spike should synthesize the selected anchors into
explicit runtime surfaces such as:

- web server bootstrap
- auth or sign-in surface
- dashboard or user-facing UI surface
- alias-management surface
- email-handler surface
- job-runner or worker surface

For each surface, Spike should:

1. choose the best representative source file and actionable symbol
2. recover the most relevant local flows and validation surfaces
3. describe what that surface is responsible for in the current codebase
4. suggest the most direct runtime checks a downstream agent should perform

The final guide should therefore explain what the selected runtime surfaces do,
not only list anchor files and generic caller edges.

### Runtime Surface Evidence Hygiene

Role-aware surface selection is still not sufficient if the surfaced evidence is
dominated by low-signal lexical edges, test-only callers, or generic helper
noise.

Before final guide assembly, Spike should prefer evidence that helps a
downstream coding agent understand how the live system behaves:

1. prefer runtime source-to-source flows over test-only flows when describing a
   runtime surface
2. suppress clearly low-signal lexical edges such as single-letter callees,
   generic builtins, or utility noise that does not help runtime validation
3. surface tests as validation artifacts, but do not let test callers become
   the primary explanation of a runtime surface
4. produce runtime checks and handoff steps that follow the operator's expected
   execution path across the surfaced roles

Examples:

- the auth surface should prefer `login -> LoginForm` and runtime redirect or
  post-auth behavior over `test_* -> login`
- the web-server surface should highlight `create_app`, `create_light_app`, and
  `/health` rather than generic lexical calls
- the email-handler surface should describe mail-forward handling behavior and
  point to the most relevant mail-handler tests as supporting validation

The guide should therefore read like a research brief for runtime validation,
not like a raw dump of every recovered lexical edge.

### Behavior Evidence Clarification Before Final Guide Assembly

For narrow behavior prompts, selecting the right route/helper/model path is
still not enough if the guide does not extract the concrete facts encoded in
that path.

Before final guide assembly, Spike should run a clarification pass over the
anchored behavior path that attempts to recover:

1. concrete response outcomes such as status codes and returned error strings
2. concrete logging outcomes such as debug or warning messages
3. direct helper semantics such as whether a verifier returns `None` on failure
4. local ordering facts such as whether quota checks happen before signature
   validation or domain validation
5. explicit unresolved claims that still require runtime confirmation when the
   static evidence is insufficient

Examples:

- a `custom alias` signed-suffix prompt should not stop at
  `new_custom_alias_v2 -> check_suffix_signature`; it should extract the 412
  expired response path, the warning log string, the helper return-`None`
  behavior in `app/alias_suffix.py`, and the ordering between quota,
  signature, and suffix validation checks
- the guide should mark rate-limit header absence as runtime-confirmation-needed
  unless the code path provides direct static evidence for that absence

This clarification pass is part of recursive investigation. Its job is to turn
the right anchored path into the concrete facts a downstream agent needs.

## 5. Guide Assembly

Spike returns one final guide artifact for the downstream coding agent.

That guide remains stable even as the internal investigation strategy evolves.

The guide should contain:

1. task understanding
2. evidence-backed findings
3. relevant files, symbols, and flows
4. open uncertainties
5. runtime checks for the downstream agent
6. suggested handoff plan

The downstream agent should be able to use the guide as a research pack, not
just as a prose answer.

---

## Role Of Tree-Based Investigation

Tree-based investigation remains valid when it improves:

- coverage over very large corpora
- repeated-query amortization
- inspectable intermediate summaries
- parallel first-pass orientation

Tree-based investigation is not mandatory.

Spike may use:

- tree-first investigation
- graph-first investigation
- recursive retrieval over indexed code and memory
- hybrid approaches that combine them

The operator should be able to evaluate these strategies on the same corpus and
task.

---

## Default Target Stack

Spike's intended guide-building stack is:

1. persistent per-commit current-code index
2. git-history memory built on Nexus events -> facts -> observations
3. graph and static-analysis capabilities over the current codebase
4. recursive investigation policy for evidence gathering
5. stable guide-for-agent output contract for downstream execution agents

---

## Design Advantages

This architecture is intended to outperform single-substrate systems by
combining:

- current code truth
- historical intent and coupling
- structural linkage between symbols and files
- recursive clarification when first-pass evidence is incomplete
- persistent reuse across repeated tasks on the same repositories

---

## Non-Goals

Spike is not:

- a patch-generation agent whose main job is to run the repo and make edits
- permanently defined by a fixed PRLM tree over the corpus
- a system that values elegant decomposition over final guide quality
- a substitute for the downstream coding agent that performs live runtime work

---

## Enforcement Rule

Any Spike design that preserves a tree-first architecture must justify itself in
terms of guide quality, benchmark performance, operator leverage, or persistent
reuse.

The burden is not on recursive investigation to prove why it should exist.
The burden is on any fixed investigation structure to prove why it still earns
its place.
