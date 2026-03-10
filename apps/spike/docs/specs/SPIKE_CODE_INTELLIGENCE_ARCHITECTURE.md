# Spike Code Intelligence Architecture

**Status:** CANONICAL
**Last Updated:** 2026-03-06
**Related:** SPIKE_CURRENT_CODE_INDEX_MODEL.md, SPIKE_CODE_INTELLIGENCE_TOOL_CONTRACT.md, SPIKE_RECURSIVE_GUIDE_ARCHITECTURE.md

---

## Purpose

This document defines how Spike's code-intelligence stack works end to end.

It explains:

1. how the persistent current-code index is built
2. where language servers and parser-backed analyzers fit
3. where chunking and higher-level analysis tools fit
4. how the stable agent-facing tool contract is served
5. how the recursive investigator consumes this stack to build a guide

The intent is to make Spike's code-intelligence system feel like persistent,
agent-facing IDE navigation and structural search over a pinned repository
snapshot.

---

## Customer Experience

The intended operator experience is:

1. point Spike at a repository and pinned commit
2. Spike builds or reuses a persistent current-code index for that snapshot
3. Spike exposes a stable code-intelligence API over that snapshot
4. a recursive investigator uses the API to resolve symbols, navigate code, and
   assemble a context pack
5. Spike returns a guide for a downstream coding agent

The operator should not need to care which low-level engine answered a given
navigation question.

The operator should care only that:

- the query results are structurally correct
- the system states when a result is partial or unsupported
- repeated tasks on the same repo reuse prepared code understanding

---

## Core Thesis

### 1. Spike should expose IDE-grade capabilities to agents

The most useful codebase QnA primitives are not raw text search primitives.

They are code-intelligence primitives such as:

- go to definition
- find references
- find implementations
- inspect callers and callees
- inspect imports and reverse imports
- retrieve relevant surrounding code context

Spike should expose these primitives through a stable tool contract.

### 2. The stack is layered

No single tool solves the whole problem.

Spike's code-intelligence system should combine:

- persistent snapshot and storage management
- semantic chunking and source structuring
- language-specific navigation engines
- graph materialization
- search and reusable artifacts
- a stable agent-facing tool contract

### 3. Uniform contract, non-uniform engines

Go, TypeScript, Python, and C should all expose the same tool surface to the
investigator, but they do not need to use the same internal engine.

Uniformity belongs at the contract layer, not necessarily at the backend layer.

### 4. Precision and reuse both matter

The system should use precise language-aware tooling where possible, but it
should also persist the resulting structures so repeated tasks do not require
fresh on-demand navigation from scratch.

---

## Stack Layers

## Layer 1: Snapshot And Storage

Spike first defines a `RepositorySnapshot`.

This snapshot is the stable identity for all later code-intelligence work.

It includes:

- repository identity
- pinned commit SHA
- source root path
- index schema version
- build timestamps

All later API queries are snapshot-bound.

This layer owns:

- snapshot metadata
- file inventory
- language classification
- build status
- capability coverage records

## Layer 2: Semantic Chunking

Spike then converts source files into contextualized semantic chunks.

This layer is responsible for:

- parsing source into structural units
- creating chunks around meaningful boundaries
- storing chunk spans and scope chain
- attaching local context such as imports or neighboring definitions

`code-chunk`-class capability belongs conceptually at this layer.

Its role is not to answer the final guide question directly. Its role is to
produce strong structural context units for retrieval, search, and pack
assembly.

## Layer 3: Language Intelligence Adapters

Spike then enriches the snapshot with language-aware navigation data.

This layer is responsible for:

- symbol definitions
- references
- imports and reverse imports
- implementations when supported
- callers and callees when derivable

Language servers and compiler-service-style engines belong here.

Examples by language:

- Go: `gopls`-class or Go-native analysis
- TypeScript: `tsserver` / TypeScript language-service-class analysis
- Python: Jedi-class or Pyright-class analysis
- C: `clangd`-class or libclang-class analysis

This layer is where Spike gets the precise, IDE-like navigation behavior.

## Layer 4: Graph Materialization

Spike persists relations derived from the chunking and language-intelligence
layers.

This includes:

- import/include edges
- reference edges
- call edges
- implementation edges
- file-to-test linkage
- route/config/handler linkage when a backend can derive it

The important idea is that these relations become part of the persistent index,
not only ephemeral responses from an editor-like service.

## Layer 5: Search And Artifacts

Spike persists reusable secondary artifacts over the snapshot.

These include:

- BM25-style lexical search artifacts
- embeddings
- cached summaries
- preassembled context fragments

`llm-tldr`-class capability is closest to this layer plus the graph layer from
the perspective of agent consumption.

In practice, `llm-tldr` is best treated as:

- a strong lab baseline
- a design reference for useful higher-level queries

It is not required to be Spike's production dependency in the target state.

## Layer 6: Stable Tool Gateway

Spike then exposes one stable tool contract over the prepared snapshot.

This contract is defined in:

- `SPIKE_CODE_INTELLIGENCE_TOOL_CONTRACT.md`

The tool gateway is responsible for:

- routing requests to the correct snapshot
- selecting the relevant backend or persisted structure
- normalizing results into one response envelope
- surfacing completeness, warnings, and limitations

## Layer 7: Recursive Investigator

Finally, Spike's recursive investigator consumes the tool gateway.

It does not need to know whether a result came from:

- persisted chunk metadata
- a Go analyzer
- a TypeScript language service
- a Python navigation engine
- a C compilation-aware backend

It only needs to know:

- what was found
- how certain it is
- what should be explored next

---

## Role Of External Tools

## `code-chunk`

`code-chunk` is conceptually a chunking and contextualization substrate.

It is most relevant for:

- semantic chunk creation
- contextualized chunk text
- chunk metadata useful for retrieval

It is not the full code-intelligence system.

## Language Servers And Compiler Services

Language servers and compiler-service-style tools are the precision navigation
engines behind the contract.

They are most relevant for:

- definitions
- references
- implementations
- call and import relationships

They are the closest analog to IDE navigation functionality.

## `llm-tldr`

`llm-tldr` is conceptually a higher-level analysis surface that already exposes
queries similar to what Spike should eventually provide.

It is most relevant for:

- lab baselines
- oracle comparisons
- learning which higher-level structural queries are most useful

It should inform Spike's design without being confused for the whole target
architecture.

---

## Build Flow

The target-state build flow is:

1. register or resolve the repository snapshot
2. scan all source files and classify them
3. parse files into semantic chunks
4. extract symbols
5. derive structural edges
6. persist search artifacts and summaries
7. persist capability coverage and limitations
8. mark the snapshot index as queryable

The output of this flow is not a guide. It is the prepared code-intelligence
substrate that guides can later be built on top of.

---

## Query Flow

The target-state query flow is:

1. receive a tool request bound to one snapshot
2. resolve which persisted structures can answer it directly
3. fall back to a language-specific backend when direct persisted data is
   insufficient
4. normalize the result into the stable response envelope
5. record completeness, warnings, and limitations
6. optionally persist newly derived reusable artifacts

This design avoids forcing every query to behave like a live editor session
while still allowing precision navigation when needed.

---

## Per-Language Model

## Go

Go should be the strongest backend.

Expected strengths:

- definitions
- references
- package graph
- imports
- callers and callees
- implementations

Expected weaknesses:

- build-tag edge cases
- generated code and vendor noise

## TypeScript

TypeScript should also be a strong backend.

Expected strengths:

- definitions
- references
- imports
- project graph
- many call relationships

Expected weaknesses:

- framework indirection
- dynamic property access
- runtime-only behavior

## Python

Python should be strong on structure and honest on limits.

Expected strengths:

- file and chunk structure
- definitions
- imports
- context assembly

Expected weaknesses:

- dynamic dispatch
- monkey-patching
- runtime imports
- some reference and call relationships

## C

C should be strong when compilation context is available.

Expected strengths:

- definitions
- references
- include graph
- callers and callees

Expected weaknesses:

- macro-heavy code
- missing compile commands
- generated files and platform flags

---

## Guide-Building Example

A recursive investigator handling a codebase QnA task should be able to do the
following:

1. start from a user prompt
2. identify the anchor route, file, or symbol
3. resolve the helper symbols it depends on
4. inspect imports and neighboring chunks
5. follow calls into model, service, config, or handler layers
6. retrieve likely tests and supporting code
7. assemble one context pack and guide

This is the intended behavior behind the code-intelligence tool contract.

The recursive investigator should not need to reconstruct this behavior through
ad hoc text search if the current-code index and tool gateway are working
correctly.

---

## Non-Goals

This architecture does not require:

- one parser implementation for all languages
- one backend engine for all navigation features
- a tree-shaped runtime as the primary reasoning structure
- production dependence on any one lab baseline tool

---

## Enforcement Rule

Any Spike code-intelligence implementation must preserve:

1. a stable snapshot-bound tool contract
2. explicit completeness reporting
3. replaceable language-specific backends
4. persistent reuse of derived code understanding across repeated tasks
