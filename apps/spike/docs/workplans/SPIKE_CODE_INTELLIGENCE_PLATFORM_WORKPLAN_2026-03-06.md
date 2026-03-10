# Spike Code Intelligence Platform Workplan

**Status:** ACTIVE
**Last Updated:** 2026-03-07
**Related Specs:** `../specs/SPIKE_CODE_INTELLIGENCE_ARCHITECTURE.md`, `../specs/SPIKE_CODE_INTELLIGENCE_TOOL_CONTRACT.md`, `../specs/SPIKE_CURRENT_CODE_INDEX_MODEL.md`

---

## Goal

Build the shared platform beneath Spike's code-intelligence API.

This workplan covers the parts that are common to all languages:

1. snapshot identity and storage
2. file inventory and classification
3. semantic chunk persistence
4. graph and artifact persistence
5. tool gateway and response normalization
6. recursive-investigator integration points

Language-specific backend delivery is tracked separately.

---

## Customer And Operator Outcome

The operator should be able to prepare a repository snapshot once and then ask
structured code-intelligence questions repeatedly without rebuilding the
repository understanding from scratch.

The operator should also be able to see, for each snapshot:

- what was indexed
- what capabilities are available
- what is partial or unsupported
- what reusable artifacts already exist

---

## Current Gap

Spike today has:

- filesystem survey
- tree partitioning
- LLM hydration
- some shallow git-history statistics

Spike does not yet have:

- a topology-agnostic current-code index
- a stable code-intelligence API
- persisted symbol and graph relations
- capability reporting per snapshot
- a shared substrate that recursive and tree-based investigation can both use

---

## Workstream 1: Snapshot Core

### Objective

Introduce the shared snapshot identity and storage model for the current-code
index.

### Deliverables

- snapshot registry
- file inventory table(s)
- snapshot status and timestamps
- per-snapshot capability metadata

### Questions to settle

- snapshot key shape
- rebuild vs refresh semantics
- artifact versioning by schema and backend

### Acceptance

The system can create and inspect a snapshot for one benchmark repo without any
tree dependency.

---

## Workstream 2: File Inventory And Classification

### Objective

Persist repository files and their basic metadata.

### Deliverables

- path inventory
- language classification
- generated/binary/vendor classification
- token estimates
- parse eligibility flags

### Questions to settle

- how aggressive generated-file filtering should be
- how classification decisions are recorded

### Acceptance

The operator can inspect one snapshot and see which files are indexable code,
which are excluded, and why.

---

## Workstream 3: Semantic Chunk Layer

### Objective

Persist semantic chunks with enough context for retrieval and pack assembly.

### Deliverables

- chunk table(s)
- chunk-to-file relation
- scope chain metadata
- contextualized chunk text

### Questions to settle

- canonical chunk id shape
- chunk boundary policy
- how much local context is duplicated into chunk artifacts

### Acceptance

The system can retrieve a chunk, its span, and its surrounding structural
context for any supported source file.

---

## Workstream 4: Graph And Artifact Persistence

### Objective

Persist the structural relations and reusable artifacts needed by the tool
contract.

### Deliverables

- symbol table(s)
- edge table(s)
- search artifacts
- cached summaries and pack fragments

### Questions to settle

- edge typing and confidence model
- when to persist backend-derived results eagerly vs lazily
- how search artifacts are invalidated

### Acceptance

The system can answer structural queries from persisted state without always
reaching into a live backend.

---

## Workstream 5: Tool Gateway

### Objective

Serve the stable code-intelligence tool contract over the prepared snapshot.

### Deliverables

- request routing by snapshot and tool name
- common response envelope
- completeness and limitation reporting
- backend fallback rules

### Questions to settle

- transport surface: in-process package first, CLI wrapper second, remote API
  later
- caching rules for live-backend fallbacks
- concurrency and cancellation behavior

### Acceptance

The first milestone tools return structurally correct normalized responses with
explicit completeness status.

---

## Workstream 6: Recursive-Investigator Integration

### Objective

Make the code-intelligence platform consumable by the recursive guide builder.

### Deliverables

- tool selection hints
- context-pack assembly hooks
- provenance and artifact recording for guide generation

### Questions to settle

- what a recursive step records
- how context-pack budget is enforced
- how unresolved dependencies are represented

### Acceptance

The recursive investigator can consume the milestone tools without custom
language-specific branching in its main logic.

---

## Recommended Sequence

1. snapshot core
2. file inventory and classification
3. semantic chunk layer
4. graph and artifact persistence
5. tool gateway
6. recursive-investigator integration

This sequence is required because later layers depend on stable storage and
normalized snapshot identity.

---

## Immediate First Cut

The first useful shared platform cut should support:

- snapshot creation
- file inventory
- chunk persistence
- capability reporting
- normalized responses for:
  - `index.build`
  - `index.status`
  - `source.file`
  - `source.chunk`
  - `search.semantic`

This is the smallest coherent base for backend integration.

## Immediate Second Cut

The next useful shared platform cut should support persisted structural
relations and first-pass pack assembly:

- persisted best-effort references
- persisted best-effort call edges
- normalized responses for:
  - `symbol.references`
  - `graph.callers`
  - `graph.callees`
  - `context.pack`

This cut exists to close the exact benchmark failure mode already observed:
Spike must be able to connect route code to helpers, models, handlers, and
tests across files without depending on a tree-only synthesis pass.

### Acceptance

- one snapshot build persists reference rows and call rows
- `symbol.references` returns structurally valid hits on fixture repos
- `graph.callers` and `graph.callees` return useful best-effort results with
  explicit partiality
- `context.pack` assembles one reusable evidence pack from anchors, supporting
  chunks, relations, and limitations
- the second cut validates on at least one real SWE-Atlas repo, not just
  synthetic fixtures
