# Spike Code Intelligence Tooling Workplan

**Status:** ACTIVE
**Last Updated:** 2026-03-06
**Related Specs:** `../specs/SPIKE_CODE_INTELLIGENCE_ARCHITECTURE.md`, `../specs/SPIKE_CODE_INTELLIGENCE_TOOL_CONTRACT.md`, `../specs/SPIKE_CURRENT_CODE_INDEX_MODEL.md`
**Related Detailed Workplans:** `SPIKE_CODE_INTELLIGENCE_PLATFORM_WORKPLAN_2026-03-06.md`, `SPIKE_LANGUAGE_BACKEND_DELIVERY_WORKPLAN_2026-03-06.md`

---

## Goal

Build the shared code-intelligence API for Spike's current-code index across
the benchmark languages:

1. Go
2. TypeScript
3. Python
4. C

The target is not one universal parser. The target is one stable agent-facing
contract with language-specific backends behind it.

This document is the umbrella planning summary for the code-intelligence push.
Detailed execution for the shared platform and the language-specific backends
is captured in the related detailed workplans listed above.

---

## Operator Outcome

The operator should be able to point Spike at any pinned benchmark repo and get
the same tool surface back:

- resolve symbol
- find references
- inspect callers and callees
- inspect imports and importers
- assemble contextual code packs
- identify likely test impact

The operator should not need to think about which backend engine implements
that capability for a given language.

---

## Shared Work Required Before Language-Specific Work

These pieces are common regardless of language:

1. snapshot identity and storage model
2. file inventory and classification
3. semantic chunk persistence
4. unified tool envelope and response status model
5. artifact persistence for search and summaries
6. test harness for tool correctness on benchmark repos

Until these exist, per-language work will not compose cleanly.

---

## Language Backends

## Go

### Why it is attractive

- highest task count in the benchmark: `38`
- strong static semantics
- strong official tooling
- likely best first return on effort

### What it takes

- package and module loading
- definition and reference resolution
- import graph extraction
- call edge extraction
- chunk extraction for investigator context packs

### Hard parts

- workspace and module layout edge cases
- build tags
- generated code and vendored directories

### Expected completeness

High.

Go should be the strongest and earliest backend.

---

## TypeScript

### Why it is attractive

- second-highest task count: `31`
- good official language-service tooling
- multiple benchmark repos depend heavily on framework or project wiring

### What it takes

- project graph loading from `tsconfig`
- definition and reference resolution
- import graph extraction
- static call edges where available
- chunk extraction for investigator context

### Hard parts

- monorepo config boundaries
- generated types
- framework indirection
- dynamic property access

### Expected completeness

High for structure and navigation, lower for highly dynamic runtime behavior.

---

## Python

### Why it matters

- `29` tasks across two repos
- important for `simple-login`-style reasoning

### What it takes

- AST or parser-backed chunking
- definition lookup
- import graph extraction
- best-effort references
- best-effort call edges

### Hard parts

- dynamic dispatch
- monkey-patching
- runtime imports
- decorators and metaprogramming patterns

### Expected completeness

Medium.

Python should expose strong structure and honest limits rather than pretending
to have perfect static resolution.

---

## C

### Why it matters

- `26` tasks
- all concentrated in `kovidgoyal/kitty`, which is strategically important

### What it takes

- compilation-aware indexing
- definition and reference resolution
- include graph extraction
- call edge extraction
- chunk extraction over C files and related headers

### Hard parts

- compilation database availability
- macros
- generated code
- platform-specific compile flags

### Expected completeness

Potentially high when compilation metadata is available, but more fragile than
Go or TypeScript.

---

## Recommended Build Order

## Global benchmark ROI order

1. Go
2. TypeScript
3. Python
4. C

Reason:

- Go and TypeScript give the strongest combination of task count and tooling
  maturity
- Python matters, but its static completeness ceiling is lower
- C has strong value but is concentrated in one repo and depends more heavily on
  compile context

## User-priority order

1. Go
2. TypeScript
3. C
4. Python

Reason:

- `kitty` is a priority target, so C deserves earlier attention than its raw
  generality would suggest

---

## Capability Milestones

## Milestone 1

Shared core plus:

- `index.build`
- `index.status`
- `source.file`
- `source.chunk`
- `symbol.resolve`
- `graph.imports`
- `search.semantic`

This is the minimum cut that already beats grep.

## Milestone 2

Add:

- `symbol.references`
- `graph.importers`
- `context.pack`
- `tests.impact`

This is the first good guide-building layer.

## Milestone 3

Add:

- `graph.callers`
- `graph.callees`
- `symbol.implementations`
- `graph.neighbors`

This is where the recursive investigator starts to feel meaningfully better
than file search.

---

## Validation Targets

The tooling should be validated against real benchmark repos:

- Go: `drakkan/sftpgo` or `foxcpp/maddy`
- TypeScript: `simple-login/app`
- Python: `paperless-ngx/paperless-ngx` or `secdev/scapy`
- C: `kovidgoyal/kitty`

Each validation pass should answer:

- does `symbol.resolve` land on the correct definition
- do references and imports match repo reality
- do caller and callee queries expose decisive paths
- does `context.pack` assemble the right supporting files
- are limitations reported honestly when the backend is incomplete

---

## Recommended Immediate Sequence

1. lock the stable tool contract
2. build the shared snapshot and storage layer
3. implement Go backend first
4. implement TypeScript backend second
5. implement C or Python next depending whether benchmark ROI or `kitty`
   priority dominates
6. wire the recursive investigator on top only after the first three or four
   tools are genuinely useful

This keeps the core clean and gets us to benchmark-relevant signal fastest.
