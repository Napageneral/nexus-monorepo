# Spike Code Intelligence Tool Contract

**Status:** CANONICAL
**Last Updated:** 2026-03-06
**Related:** SPIKE_CURRENT_CODE_INDEX_MODEL.md, SPIKE_RECURSIVE_GUIDE_ARCHITECTURE.md

---

## Purpose

This document defines the stable agent-facing tool contract for Spike's
persistent current-code index.

The goal is to expose code-intelligence capability to recursive investigators
and downstream agents through a uniform API, even though the underlying
language-specific engines differ.

Spike should feel less like "grep plus an LLM" and more like "persistent
IDE-grade code navigation and structural search for agents."

---

## Customer Experience

The intended operator and agent experience is:

1. Spike indexes a pinned repository snapshot
2. the investigator asks structured questions of that index
3. the index answers with files, chunks, symbols, edges, and limitations
4. the investigator uses those answers to build a guide for the downstream
   coding agent

The same tool contract should work across Go, TypeScript, Python, and C.

The underlying engines may vary by language. The outward contract should not.

---

## Design Goals

The contract must:

1. expose the most useful code-navigation primitives for codebase QnA
2. preserve explicit provenance and limitations
3. degrade honestly when a language backend cannot derive a relation
4. support recursive investigation over files, symbols, and graph relations
5. remain stable even if Spike changes parsers, analyzers, or index storage

---

## Contract Principles

### 1. Every query is snapshot-bound

Every tool call is against one pinned `snapshot_id`.

The contract never mixes results across commits implicitly.

### 2. Every response must report completeness

Every response must indicate whether the result is:

- `complete`
- `partial`
- `unsupported`
- `blocked`

The response must also report why when it is not complete.

### 3. Structural truth beats heuristic prose

The tool contract should return structured results first.

Free-form prose may be attached as an aid, but the primary result should be
files, spans, symbols, edges, and limitations.

---

## Common Request Fields

All tool requests should support the following shared fields when relevant:

- `snapshot_id`
- `language`
- `path`
- `symbol_query`
- `target_id`
- `limit`
- `budget`
- `include_source`
- `include_context`

Not every tool uses every field.

---

## Common Response Fields

All tool responses should return a common envelope:

```json
{
  "ok": true,
  "snapshot_id": "simple-login:2cd6ee7",
  "tool": "symbol.resolve",
  "status": "complete",
  "backend": {
    "language": "python",
    "engine": "jedi+ast",
    "version": "engine-version"
  },
  "warnings": [],
  "limitations": [],
  "result": {}
}
```

Response fields:

- `ok`: whether the tool executed successfully
- `status`: `complete | partial | unsupported | blocked`
- `backend`: the language backend that produced the answer
- `warnings`: soft concerns such as ambiguous matches
- `limitations`: explicit capability boundaries
- `result`: tool-specific payload

---

## Tool Families

## 1. Index Lifecycle

### `index.build`

Build or refresh the current-code index for a snapshot.

Request:

```json
{
  "snapshot_id": "repo:commit",
  "root_path": "/abs/path/to/repo"
}
```

Response result:

- file counts
- parser coverage by language
- symbol counts
- edge counts
- artifact counts

### `index.status`

Return current readiness and coverage.

Response result:

- build status
- language coverage
- unsupported capabilities
- stale or missing artifacts

---

## 2. Source Retrieval

### `source.file`

Fetch a file and its indexed metadata.

Response result:

- path
- language
- token estimate
- classification
- source text when requested

### `source.chunk`

Fetch one semantic chunk by chunk id or file/span selection.

Response result:

- chunk id
- file path
- span
- scope chain
- nearby definitions or imports when available
- chunk source text when requested

### `source.context`

Fetch a contextual code pack around a file, symbol, or chunk.

Response result:

- anchor target
- primary chunk(s)
- neighboring chunk(s)
- directly relevant imports or local definitions

---

## 3. Symbol Navigation

### `symbol.resolve`

Resolve a symbol name to one or more definitions.

Response result:

- symbol id
- name
- qualified name when available
- kind
- path
- span
- owning chunk id

### `symbol.references`

Find references to a symbol.

Response result:

- reference count
- file/span hits
- local vs external distinction when derivable

### `symbol.implementations`

Find implementations of an interface, abstract member, or protocol-like target
when supported by the backend.

Response result:

- implementation symbols
- file/span hits

---

## 4. Structural Graph Queries

### `graph.callers`

Find callers of a symbol when the backend can derive call edges.

### `graph.callees`

Find callees from a symbol or function body when the backend can derive call
edges.

### `graph.imports`

Return direct imports or includes for a file or module.

### `graph.importers`

Return reverse imports or includes for a file or module.

### `graph.neighbors`

Traverse outward from a file, chunk, or symbol by edge type.

Request:

```json
{
  "snapshot_id": "repo:commit",
  "target_id": "symbol:check_suffix_signature",
  "edge_types": ["call", "reference", "import"],
  "depth": 2,
  "limit": 50
}
```

Response result:

- visited nodes
- traversed edges
- truncation metadata

---

## 5. Search And Assembly

### `search.semantic`

Search over files, chunks, symbols, and cached artifacts.

Response result:

- ranked hits
- hit type
- path and span
- excerpt or summary

### `context.pack`

Assemble the best structured pack for a target question.

The output should be optimized for an investigator or downstream coding agent,
not for end-user prose.

Response result:

- anchor targets
- supporting files and chunks
- relevant symbols
- graph relations
- explicit omissions and limitations

### `tests.impact`

Return likely tests touching a file, symbol, or path.

Response result:

- matched tests
- match rationale
- direct vs heuristic classification

---

## Language Backend Expectations

## Go

The Go backend should be strong on:

- definitions
- references
- imports
- package graph
- call edges

Go should generally provide the most complete static answers because the tool
ecosystem and language semantics are friendly to this kind of analysis.

## TypeScript

The TypeScript backend should be strong on:

- definitions
- references
- imports
- project graph
- call edges for statically visible symbols

It should explicitly mark uncertainty around dynamic property access, reflection
patterns, or framework indirection the backend cannot resolve confidently.

## Python

The Python backend should be strong on:

- file and chunk structure
- definitions
- imports
- some references and call edges

It should explicitly report that dynamic dispatch and runtime monkey-patching
can reduce completeness.

## C

The C backend should be strong on:

- definitions
- references
- include graph
- call edges when compilation context is available

It should explicitly report when missing compilation metadata, macros, or build
flags limit completeness.

---

## Non-Goals

This contract does not require:

- one shared parser for all languages
- one shared analysis engine for all languages
- identical completeness across all languages

The requirement is a stable tool contract, not uniform implementation internals.

---

## Enforcement Rule

Any Spike code-intelligence backend must expose capability through this stable
contract or a compatible future successor.

Language-specific implementation details must remain replaceable without forcing
the recursive investigator or downstream agent to relearn the tool surface.
