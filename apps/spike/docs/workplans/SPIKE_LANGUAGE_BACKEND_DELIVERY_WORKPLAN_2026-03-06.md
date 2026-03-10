# Spike Language Backend Delivery Workplan

**Status:** ACTIVE
**Last Updated:** 2026-03-06
**Related Specs:** `../specs/SPIKE_CODE_INTELLIGENCE_ARCHITECTURE.md`, `../specs/SPIKE_CODE_INTELLIGENCE_TOOL_CONTRACT.md`

---

## Goal

Deliver language-specific backends behind the shared Spike code-intelligence
contract for the benchmark languages:

1. Go
2. TypeScript
3. Python
4. C

This workplan focuses on the backend adapters and their per-language acceptance
criteria.

---

## Delivery Strategy

We are not building one universal parser.

We are building one stable contract with multiple backend implementations that
all normalize into the same response envelope.

Each backend must expose:

- supported capabilities
- unsupported capabilities
- explicit partiality when the backend cannot produce complete results

---

## Backend 1: Go

### Target role

The strongest and earliest backend.

### Build tasks

1. package and module loading
2. symbol definition extraction
3. reference extraction
4. import graph extraction
5. call graph extraction
6. implementation lookup

### First milestone tools

- `symbol.resolve`
- `graph.imports`
- `symbol.references`
- `graph.callers`
- `graph.callees`

### Acceptance repos

- `foxcpp/maddy`
- `drakkan/sftpgo`

### Success bar

Go should reach the highest completeness of any backend in the first wave.

---

## Backend 2: TypeScript

### Target role

High-value backend for benchmark coverage and app-style repos.

### Build tasks

1. project graph loading
2. symbol definition extraction
3. reference extraction
4. import graph extraction
5. implementation lookup where supported
6. call-relationship extraction where statically visible

### First milestone tools

- `symbol.resolve`
- `graph.imports`
- `symbol.references`
- `graph.importers`
- `context.pack`

### Acceptance repos

- `simple-login/app`
- `grafana/grafana`

### Success bar

TypeScript should be strong on navigation and honest about dynamic framework
edges it cannot prove.

---

## Backend 3: Python

### Target role

Critical for `simple-login`-style reasoning even if static completeness is
lower.

### Build tasks

1. AST-backed structure extraction
2. definition lookup
3. import graph extraction
4. best-effort references
5. best-effort call relationships

### First milestone tools

- `symbol.resolve`
- `graph.imports`
- `source.context`
- `tests.impact`

### Acceptance repos

- `paperless-ngx/paperless-ngx`
- `secdev/scapy`

### Success bar

Python should feel very useful for context and navigation while reporting
partiality clearly when static analysis cannot close the gap.

---

## Backend 4: C

### Target role

Strategically important because of `kitty`.

### Build tasks

1. acquire or construct compilation context
2. definition lookup
3. reference extraction
4. include graph extraction
5. call relationship extraction
6. chunking across C and headers

### First milestone tools

- `symbol.resolve`
- `symbol.references`
- `graph.imports`
- `graph.callers`

### Acceptance repo

- `kovidgoyal/kitty`

### Success bar

C should be strong when compilation context is available and explicit when it
is not.

---

## Recommended Order

## Benchmark ROI order

1. Go
2. TypeScript
3. Python
4. C

## User-priority order

1. Go
2. TypeScript
3. C
4. Python

The initial execution order should probably be:

1. Go
2. TypeScript
3. C on `kitty`
4. Python

This balances benchmark leverage and your specific target interest.

---

## Shared Backend Rules

Every backend must:

1. normalize into the stable response envelope
2. record explicit limitations
3. persist reusable derived structures when possible
4. avoid pretending complete static truth when the language model cannot
   provide it

---

## Backend Completion Gates

No backend is considered delivered until:

1. milestone tools work on a real benchmark repo
2. completeness and limitations are reported honestly
3. the validation ladder rungs for that backend pass
4. the recursive investigator can consume the backend through the shared
   contract without custom one-off logic
