# Spike Recursive Guide Architecture Workplan

**Status:** ACTIVE
**Last Updated:** 2026-03-07
**Related Specs:** `SPIKE_RECURSIVE_GUIDE_ARCHITECTURE.md`, `SPIKE_GUIDE_FOR_AGENT_MODEL.md`, `SPIKE_INVESTIGATION_POLICY_MODEL.md`

---

## Goal

Move Spike toward a benchmark-winning guide-building architecture centered on:

1. a persistent per-commit current-code index that is graph, symbol, and AST
   oriented rather than tree-first
2. git-history memory ingested into the Nexus memory system
3. graph and static-analysis tooling integrations
4. an RLM-style recursive investigator
5. a stable guide artifact for downstream coding agents

---

## Customer And Operator Outcome

The operator should be able to prepare a repo once, ask benchmark tasks against
it repeatedly, review Spike's guide when desired, and hand that guide to a
downstream coding agent.

The stack should be evaluated on whether it improves downstream task success,
not on whether the internal architecture remains tree-shaped.

---

## Current Reality

## 1. Current Spike is tree-first

The active app Spike persists a PRLM tree over the corpus and runs asks through
an `interpret -> dispatch -> synthesize` flow.

This is useful for coverage and reuse, but it introduces lossy parent-child
boundaries and currently requires extra machinery to recover cross-branch or
cross-layer dependencies.

## 2. Current git history support is shallow

Spike already has a live git-history helper, but today it only provides:

- co-change partners
- directory velocity
- structural events such as adds, removes, renames, and big bangs

It does not yet ingest commits, diffs, or PRs into Nexus memory as retained
facts and observations.

## 3. Current-code indexing is filesystem-first

The active substrate surveys files, tokenizes file contents, and persists corpus
entries plus node/file assignments.

It does not yet provide a graph-first or symbol-first persistent code index.

## 4. There is no recursive investigator yet

Current asks do not reopen the investigation loop after synthesis. There is no
first-class recursive clarification model over current code, tool outputs, and
historical memory.

## 5. External tool capability is not integrated

Useful capabilities represented by tools such as code-chunk and llm-tldr are
not yet available as first-class lab or product investigation substrates.

---

## Active Spec Conflicts To Resolve

The new target state creates explicit conflicts with the current active Spike
spec corpus.

## 1. `SPIKE_GUIDE_FOR_AGENT_MODEL.md`

This spec still describes investigation as happening exhaustively across a tree.

It needs to become substrate-agnostic while preserving the guide contract.

## 2. `SPIKE_INVESTIGATION_POLICY_MODEL.md`

This spec is still centered on tree construction, child routing, and subtree
synthesis as the primary investigation abstraction.

It needs to be expanded so tree-based investigation becomes one policy family,
not the architectural center of gravity.

## 3. `SPIKE_DATA_MODEL.md`

This spec currently equates `AgentIndex` with a PRLM tree.

It needs a future reconciliation pass so the persistent current-code index is
defined independently from any one investigation topology.

---

## Workstreams

## Workstream 1: Spec Reconciliation

Objective:

- align the active Spike spec set with the new recursive guide architecture

Tasks:

- make the guide model substrate-agnostic
- update the investigation policy model to support recursive investigation and
  non-tree-first indexing
- reconcile the AgentIndex data model against a graph/symbol/AST-oriented index

Gate:

- active specs tell one coherent story about Spike's target architecture

## Workstream 2: Persistent Current-Code Index Design

Objective:

- define the per-commit index that underpins current-code investigation

Questions to settle:

- what entities are persisted beyond files and hashes
- how AST chunks are stored
- how symbols and references are stored
- how language coverage is handled
- which graph relations are first-class in the initial version
- how cached summaries and embeddings are versioned by commit

Gate:

- one concrete schema and build pipeline for a per-commit code index

## Workstream 3: Git-History Memory Ingest

Objective:

- map repository history into the Nexus memory system

Questions to settle:

- what counts as a git event: commit only, or commit + PR + review metadata
- how diffs are represented in events and attachments
- what the retain payload for git history looks like
- what facts and observations should be extracted from history
- how subsystem-level historical mental models are refreshed

Gate:

- one concrete history-to-memory ingest design over a target repo

## Workstream 4: Graph And Static-Analysis Tooling

Objective:

- expose graph and static-analysis capability to the lab and later Spike

Questions to settle:

- which external tools are used only for lab benchmarking
- which capabilities are reimplemented or integrated in-product
- how licensing constraints affect use of external tools
- what minimum tool surface is needed for the first experiments

Gate:

- first runnable lab tool surface for symbol/context/impact-style queries

## Workstream 5: Recursive Investigator Runtime

Objective:

- design and implement the guide-building loop

Questions to settle:

- recursion state model
- hypothesis and follow-up representation
- stopping criteria
- bounded execution and liveness
- how the investigator chooses among code index, graph tools, and history memory
- what artifacts are preserved per step

Gate:

- first end-to-end guide run over a benchmark task with recursive follow-up

## Workstream 6: Benchmark Harness And Comparison

Objective:

- measure whether the new stack improves downstream benchmark performance

Questions to settle:

- exact run artifact schema
- guide handoff format for Codex
- baseline agent configuration
- judging surface and result persistence
- first task subset for iteration

Gate:

- judged baseline vs Spike-guided comparisons on real benchmark tasks

---

## Prioritized First Experiments

## 1. External Lab Baseline

Run one or more benchmark tasks using:

- Codex as the downstream model
- llm-tldr-class and code-chunk-class capability in the lab
- no tree dependency

Purpose:

- establish how much raw performance is available from a recursive, tool-heavy
  stack before additional productization work

## 2. Minimal Persistent Current-Code Index

Build a minimal per-commit code index over one prepared benchmark repo.

Suggested starting targets:

- `simple-login/app`
- `kitty`

Purpose:

- prove durable index reuse across repeated tasks

## 3. Minimal Git-History Memory Ingest

Take one target repo and ingest its commit history into Nexus memory.

Purpose:

- test whether git-history recall surfaces useful facts for codebase QnA tasks

## 4. First Recursive Guide Builder

Use the code index, tool surface, and history recall to produce one guide for a
real benchmark prompt.

Purpose:

- compare guide quality against the current tree-based Spike output

## 5. Downstream-Agent Comparison

---

## Immediate Cut: Broad Query Planning For Guide Building

### Problem

The first guide-builder slice works well on targeted symbol or path prompts but
still performs poorly on broad benchmark prompts.

Observed failure mode on `simple-login`:

- a broad runtime-health task anchored on `app/models.py:User`
- static/plugin search hits could still appear in raw search results
- the guide over-weighted heuristic tests because it failed to establish
  multiple runtime anchors from the prompt itself

### Intended Customer Outcome

When an operator gives Spike a broad task such as:

- "how do I know the web server, email handler, and job runner are up?"
- "what code paths prove users can sign in and manage aliases?"

Spike should produce a guide anchored on the relevant subsystems, not on one
generic high-frequency class or on test files.

### Scope

Add a query-planning layer ahead of `context.pack` and `guide.build` that:

1. decomposes a natural-language prompt into a small set of high-signal probes
2. searches those probes independently
3. scores candidate hits with source-first and low-signal-path-aware rules
4. selects multiple diverse source anchors when the prompt spans multiple
   subsystems
5. leaves tests as supporting evidence instead of first anchors

### Acceptance Criteria

- the broad `simple-login` startup-health task surfaces source anchors in
  `job_runner.py`, `email_handler.py`, `app/dashboard/`, `app/auth/`, or other
  similarly relevant runtime files before defaulting to generic model classes
- `relevant_files` stays free of static/plugin asset files for the guide
- broad prompts produce at least two distinct source anchors when the prompt
  clearly names multiple runtime surfaces
- tests remain supporting evidence instead of dominating the guide

### Validation

- add a focused fixture test proving broad-query decomposition prefers source
  runtime surfaces over tests and static assets
- rerun the real `simple-login` broad task prompt and inspect the guide output

---

## Immediate Cut: Runtime Surface Synthesis

### Problem

Broad-query planning now produces a compact, source-first anchor set on the
real `simple-login` startup-health task, but the final guide is still too
shallow.

Observed failure mode:

- the guide lists the right runtime files
- the guide still relies on generic lexical callers and references
- the guide does not yet clearly explain what each runtime surface is
  responsible for
- the downstream handoff still feels like "look here and validate" instead of a
  real research guide

### Intended Customer Outcome

When Spike produces a guide for a broad runtime prompt, the operator should be
able to see distinct surfaces such as:

- web server bootstrap
- auth / sign-in
- dashboard / alias UI
- email handling
- job runner

and understand which file and symbol represent each surface, what each surface
does, and what the downstream agent should verify at runtime.

### Scope

Add a role-aware synthesis layer on top of `context.pack` and `guide.build`
that:

1. maps broad prompts onto canonical runtime surfaces
2. selects the best representative file and actionable symbols for each surface
3. recovers local flows that actually belong to that surface
4. emits stronger evidence-backed findings and runtime checks from those
   surfaces

### Acceptance Criteria

- the real `simple-login` startup-health task guide explicitly names the web
  server, auth/sign-in, email handler, and job runner surfaces
- the guide cites concrete files and actionable symbols for those surfaces
- the guide's runtime checks are specific to those surfaces instead of generic
  "review the file" guidance
- the broad-query fixture test proves guide output includes source runtime
  symbols and flows, not only file paths

## Immediate Cut: Runtime Surface Evidence Hygiene

### Problem

Role-aware synthesis now selects the right major surfaces on the real
`simple-login` startup-health task, but the surfaced evidence is still noisier
than a downstream coding agent should have to parse.

Observed failure mode:

- some surface findings still prioritize lexical or test-only flows
- some flows include generic or low-signal callees that do not help runtime
  reasoning
- runtime checks are more useful than before, but they still include redundant
  generic validation items after the role-aware checks
- the final handoff still feels partially like an index dump rather than a
  focused runtime research brief

### Intended Customer Outcome

When Spike produces a runtime guide, the operator should see:

- the major runtime surfaces
- a small number of meaningful runtime flows for each surface
- validation artifacts attached to those surfaces without overwhelming the main
  explanation
- a handoff plan that follows the likely runtime path a coding agent should
  execute

### Scope

Harden the role-aware guide layer so it:

1. prefers runtime source-to-source flows over test-only flows
2. filters low-signal lexical edges from surfaced guide evidence
3. keeps tests as supporting validation surfaces instead of the main runtime
   explanation
4. emits more sequential runtime checks and handoff steps derived from the
   surfaced runtime roles

### Acceptance Criteria

- the real `simple-login` startup-health task guide still names the key runtime
  surfaces explicitly
- the auth, email-handler, and job-runner findings no longer lead with
  `test_* -> ...` style flows when runtime flows exist
- obvious low-signal lexical callees are suppressed from surfaced guide
  findings
- runtime checks read as a role-by-role validation path instead of a generic
  dump of caller paths and test files
- the broad-query fixture proves surfaced flows are runtime-oriented when such
  flows exist

## Immediate Cut: Narrow Behavior Query Planning

### Problem

The guide is now materially better on broad runtime prompts, but narrow
behavior prompts can still over-expand and miss the decisive path.

Observed failure mode:

- prompts about `custom alias` signed-suffix behavior can still anchor too many
  files
- generic terms like `server` in `server console` can incorrectly trigger
  runtime-surface synthesis
- the decisive route/helper/model path can be diluted by broader alias or API
  surfaces

### Intended Customer Outcome

For a narrow behavior question, the guide should feel like a causal-path
investigation, not a runtime readiness walkthrough.

The operator should quickly see the specific route, helper, model, and tests
that determine the behavior in question.

### Scope

Tighten query planning so it:

1. extracts higher-signal compound probes from narrow prompts
2. prefers behavior-path phrases over generic domain tokens
3. only applies runtime-surface synthesis for genuinely broad operational
   prompts
4. validates this behavior on the real `simple-login` custom-alias task shape

### Acceptance Criteria

- a `custom alias` signed-suffix prompt anchors `new_custom_alias`-path files
  rather than a generic alias-management surface
- the guide surfaces `app/api/views/new_custom_alias.py`,
  `app/alias_suffix.py`, and quota-related model logic when those files are in
  the indexed snapshot
- generic `server console` wording does not trigger a web-server guide section
  by itself
- a dedicated fixture proves narrow behavior prompts do not regress back into
  broad runtime guidance

## Immediate Cut: Behavior Evidence Clarification

### Problem

Narrow behavior prompts now anchor the correct route/helper/model path, but the
guide still stops one step short of the concrete facts the downstream agent
actually wants.

Observed failure mode:

- the `custom alias` guide finds `new_custom_alias.py`, `alias_suffix.py`, and
  `models.py`
- the guide still does not explicitly extract the 412/400/201 response paths,
  log strings, helper return semantics, or local validation ordering from those
  files
- the operator still has to manually read the anchored files to reconstruct the
  important behavior facts

### Intended Customer Outcome

For a narrow behavior question, the guide should feel like a research brief
over the decisive path, not just a focused index.

The operator should see the concrete statuses, messages, logs, and ordering
facts that the anchored route/helper/model path implies, plus any claims that
still require runtime confirmation.

### Scope

Add one clarification pass after narrow prompt anchoring that:

1. inspects the anchored behavior chunks directly
2. extracts concrete response, log, helper-semantic, and ordering facts when
   the code provides them
3. appends those facts as evidence-backed findings
4. upgrades runtime checks so the downstream agent knows exactly what to
   validate live versus what is already statically grounded

### Acceptance Criteria

- the `custom alias` guide explicitly states the expired-suffix 412 response
  path from `new_custom_alias.py`
- the guide explicitly states the helper return-`None` behavior from
  `app/alias_suffix.py`
- the guide explicitly states that quota validation happens before signature
  validation when the route code shows that ordering
- claims that are not directly proven statically stay marked as runtime
  confirmation items instead of being fabricated
- a focused fixture proves these extracted findings appear in the guide output

Run:

1. Codex baseline
2. Codex with Spike guide

Purpose:

- measure whether the guide actually improves benchmark success

---

## Open Decisions That Must Be Squared Away Early

1. whether the first current-code index is built in the lab first or directly in
   the Spike app
2. whether git-history ingest starts with commit-only events or includes PR and
   review context from day one
3. whether llm-tldr remains a lab-only baseline because of licensing constraints
4. what the first recursive investigator execution model is: direct in Spike,
   separate lab orchestrator, or both
5. what minimum guide artifact format is sufficient for Codex handoff and judge
   persistence

---

## Recommended Immediate Sequence

1. reconcile the active Spike specs around the new architecture
2. stand up the external-tool benchmark baseline in the lab
3. design the minimal persistent current-code index
4. design the git-history-to-memory ingest path
5. build the first recursive guide run against one benchmark task

This sequence gets real benchmark signal quickly while still building toward the
long-term product architecture.

---

## Immediate Guide Builder Cut

Before the full recursive runtime exists, Spike should ship one minimal
guide-builder artifact on top of the current-code index and `context.pack`.

This cut should:

- preserve the canonical guide contract sections
- remain snapshot-bound
- include the full structured `context.pack`
- produce concrete runtime checks and handoff steps for a downstream agent
- avoid pretending that heuristic relations are fully proven

### Acceptance

- one `guide.build` path exists in the active app Spike service
- the guide contains:
  - `task understanding`
  - `evidence-backed findings`
  - `relevant files, symbols, and flows`
  - `open uncertainties`
  - `runtime checks for the downstream agent`
  - `suggested handoff plan`
- the guide is validated on at least one real SWE-Atlas repo/query

This cut is intentionally not the full recursive runtime. It is the first
stable guide artifact that downstream agents and benchmark harnesses can
consume while the deeper recursive loop continues to evolve.
