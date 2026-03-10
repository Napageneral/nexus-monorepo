# Spike Current-Code Index Model

**Status:** CANONICAL
**Last Updated:** 2026-03-06
**Related:** SPIKE_RECURSIVE_GUIDE_ARCHITECTURE.md, SPIKE_DATA_MODEL.md

---

## Purpose

This document defines the target-state persistent current-code index used by
Spike to investigate a repository at a pinned commit.

The current-code index is the reusable truth layer for what exists in the code
now. It is independent from any one investigation topology.

Spike may investigate through a tree, a graph-oriented recursive investigator,
or a hybrid approach. The current-code index exists beneath those choices.

---

## Customer Experience

The intended operator experience is:

1. point Spike at a repository and commit
2. Spike builds or reuses a durable current-code index for that snapshot
3. later asks reuse that index instead of rediscovering the codebase from
   scratch
4. recursive investigation uses the index to resolve files, chunks, symbols,
   references, and structural relations quickly

The operator should think of the current-code index as the prepared code truth
plane for a pinned snapshot, not as a cached answer to one prompt.

---

## Core Thesis

### 1. The current-code index is per-commit and immutable in meaning

The indexed corpus is one repository snapshot at one commit.

The index may be rebuilt or enriched, but its semantic identity remains tied to:

- repository identity
- commit identity
- index schema version

If the code changes, a new snapshot identity exists.

### 2. The index is graph, symbol, and AST oriented

The index must expose structural relationships that help answer codebase QnA
tasks:

- where symbols are defined
- where symbols are referenced
- how files import or depend on each other
- where call relationships are derivable
- how a code path crosses helpers, config, tests, and handlers

This is a better substrate for guide-building than a file inventory alone.

### 3. The index is topology-agnostic

The current-code index does not commit Spike to a tree-first runtime.

The same index may support:

- tree-based orientation
- recursive graph traversal
- hybrid retrieval and synthesis
- benchmark experimentation across multiple investigation policies

---

## Core Objects

### Repository Snapshot

A `RepositorySnapshot` identifies the indexed current-code corpus.

It must include:

- stable repository identifier
- pinned commit SHA
- source root path or worktree identity
- index schema version
- build metadata and timestamps

### Source File

A `SourceFile` records one file in the snapshot.

It should capture:

- path
- content hash
- language
- byte size
- token estimate
- parse status
- generated/binary/vendor classification when applicable

### Code Chunk

A `CodeChunk` is a contextualized code unit derived from one file.

Chunks should prefer semantic boundaries over raw byte windows.

They may represent:

- module preamble
- class or type block
- function or method block
- constant or config block
- residual free code region

Each chunk should preserve enough context to be useful independently:

- owning file
- byte or line span
- surrounding scope chain
- imports or nearby definitions when relevant
- stable content hash

### Symbol

A `Symbol` is a named program entity defined in the snapshot.

Examples:

- function
- method
- class
- type
- interface
- constant
- route handler
- CLI command registration

Each symbol should capture:

- canonical name
- qualified name when applicable
- file and span
- language kind
- owner symbol or scope when applicable
- chunk membership

### Edge

An `Edge` is a structural relation between indexed objects.

Important edge families include:

- import or include
- symbol reference
- call
- inheritance or implementation
- route to handler binding
- test-to-production linkage

Not every language supports every edge family equally. The index must preserve
which edges are derived confidently and which are unavailable.

### Artifact

An `Artifact` is a reusable derived output attached to the snapshot or its
objects.

Examples:

- embeddings
- cached chunk summaries
- cached file summaries
- search expansions
- retrieved context packs

Artifacts are secondary to the structural index but are still first-class.

---

## Required Query Capabilities

The persistent current-code index must support queries such as:

- list files matching a path or classification
- fetch file metadata and contents
- fetch semantic chunks for a file or span
- resolve symbol definitions by name or qualified name
- find symbol references
- find imports and reverse imports
- find callers and callees where derivable
- traverse outward from one file, chunk, or symbol by relation type
- retrieve contextual code packs around a target
- search across files, chunks, and symbols with reusable metadata

Spike's recursive investigator should be able to move between these query
surfaces naturally.

---

## Build Responsibilities

The index build pipeline must, at minimum:

1. inventory all files in the pinned snapshot
2. classify language and detect clearly non-code assets
3. parse supported languages and extract semantic chunks
4. extract symbols and structural edges where available
5. persist reusable summaries, embeddings, and query metadata as artifacts
6. record build completeness and parser coverage explicitly

Incomplete parsing is allowed. Silent ambiguity is not.

If a language adapter cannot derive call edges, the index should say so.

---

## Design Requirements

### Reusable Across Many Tasks

The same snapshot index should be reused across multiple benchmark or product
tasks on the same commit.

### Friendly To Recursive Investigation

The index should make it easy to chase a dependency chain such as:

- route
- imported helper
- model or service method
- config gate
- test evidence

without forcing a parent-child tree synthesis boundary first.

### Friendly To Historical Cross-Reference

The index should be linkable to git-history memory so that a recursive
investigator can move from:

- current symbol or file

to:

- commits that changed it
- co-changed files
- retained facts and observations about its evolution

### Friendly To Comparative Evaluation

The index must allow multiple investigation runtimes to operate over the same
prepared snapshot so the benchmark harness can compare strategies cleanly.

---

## Non-Goals

The persistent current-code index is not:

- itself a user-facing final answer
- permanently defined by a PRLM tree
- limited to file-level retrieval only
- dependent on one specific static-analysis implementation

---

## Enforcement Rule

Any Spike design that equates the current-code index with a tree must justify
why a tree is required for the index itself rather than only for one
investigation policy.
