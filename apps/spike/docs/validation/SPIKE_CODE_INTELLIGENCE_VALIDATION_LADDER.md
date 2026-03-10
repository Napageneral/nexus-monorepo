# Spike Code Intelligence Validation Ladder

**Status:** ACTIVE
**Last Updated:** 2026-03-07
**Related Specs:** `../specs/SPIKE_CODE_INTELLIGENCE_ARCHITECTURE.md`, `../specs/SPIKE_CODE_INTELLIGENCE_TOOL_CONTRACT.md`, `../specs/SPIKE_CURRENT_CODE_INDEX_MODEL.md`
**Related Workplans:** `../workplans/SPIKE_CODE_INTELLIGENCE_PLATFORM_WORKPLAN_2026-03-06.md`, `../workplans/SPIKE_LANGUAGE_BACKEND_DELIVERY_WORKPLAN_2026-03-06.md`

---

## Purpose

This ladder validates the code-intelligence stack from the bottom up.

Each rung proves one layer of the API and the supporting index beneath it
before we rely on that layer in recursive guide building or benchmark runs.

Do not skip rungs. Each higher rung assumes the lower rungs are already green.

---

## Current Milestone Status

As of 2026-03-07, the active app Spike implementation has automated and
real-repo validation for the first two code-intelligence cuts:

```text
[x] Rung 0: baseline build verification
[x] Rung 1: snapshot identity
[x] Rung 2: file inventory and classification
[x] Rung 3: semantic chunks
[x] Rung 4: capability matrix
[x] Rung 5: symbol resolution
[x] Rung 6: import graph
[x] Rung 7: search
[x] Rung 8: references
[x] Rung 9: call relationships
[x] Rung 10: context pack assembly
[x] Rung 10A: broad query planning
[x] Rung 10B: runtime surface synthesis
[x] Rung 10C: runtime surface evidence hygiene
[x] Rung 10D: narrow behavior query planning
[x] Rung 10E: behavior evidence clarification
[x] Rung 11: test impact
[ ] Rung 12+: still open
```

The real benchmark-relevant smoke currently proven is:

- `simple-login` resolves `check_suffix_signature`
- references surface route usage in `app/api/views/new_custom_alias.py`
- callers surface `new_custom_alias_v2`
- `context.pack` assembles `app/alias_suffix.py`,
  `app/api/views/new_custom_alias.py`,
  `app/dashboard/views/custom_alias.py`, and
  `app/oauth/views/authorize.py`
- `tests.impact` and `context.pack` surface benchmark-relevant tests including
  `tests/api/test_new_custom_alias.py` and `tests/test_alias_suffixes.py`

The current benchmark-relevant guide state proven in the active app Spike is:

- broad startup-health prompts now surface web-server, auth, dashboard,
  alias-management, email-handler, and job-runner roles with ordered runtime
  handoff steps
- broad guides now prefer runtime-oriented flows over test-only or obviously
  low-signal lexical edges when those runtime flows exist
- narrow behavior prompts now anchor the decisive route/helper/model path
  instead of regressing into a broad runtime guide
- the real `simple-login` custom-alias task now focuses the guide on
  `app/api/views/new_custom_alias.py`, `app/alias_suffix.py`, and related
  quota/rate-limit files rather than a repo-wide alias dump
- the real `simple-login` custom-alias task now extracts concrete 412/400
  response paths, helper return-`None` semantics, and quota-before-signature
  ordering facts from the anchored path

The next open benchmark-relevant rung is the recursive investigator itself:

- the guide still relies on single-pass indexed evidence instead of iterative
  clarification
- behavior-path answers still need stronger causal synthesis and direct mapping
  to rubric expectations
- benchmark comparison still needs the downstream `Codex baseline` vs
  `Codex + Spike guide` execution loop

---

## Rung 0: Baseline Build Verification

**What:** Confirm the active Spike service still builds and tests before adding
the new stack.

**Validation:**
```text
[ ] go build ./cmd/spike-engine succeeds
[ ] go test ./... passes in the Spike service repo
[ ] existing Spike ask behavior still runs on a prepared tree/index baseline
```

**Checkpoint:** Safe implementation baseline.

---

## Rung 1: Snapshot Identity

**What:** Create and inspect a topology-agnostic repository snapshot record.

**Validation:**
```text
[ ] snapshot can be created for one prepared benchmark repo
[ ] snapshot id is stable for the same repo + commit + schema version
[ ] snapshot status can be queried independently of any tree
[ ] snapshot records build timestamps and index schema version
```

**Checkpoint:** Snapshot identity exists as the root object for the current-code
index.

---

## Rung 2: File Inventory And Classification

**What:** Persist the source-file inventory and core metadata.

**Validation:**
```text
[ ] all repository files are inventoried
[ ] each file records language classification
[ ] binary/generated/vendor files are marked explicitly
[ ] token estimate exists for indexed source files
[ ] file-level exclusions are inspectable
```

**Checkpoint:** Spike knows what corpus it is indexing and what is excluded.

---

## Rung 3: Semantic Chunks

**What:** Persist semantic chunks with spans and local structural context.

**Validation:**
```text
[ ] source files can be split into semantic chunks
[ ] each chunk has stable chunk id, path, and span
[ ] chunk scope chain is persisted when supported
[ ] source.chunk returns chunk text and metadata
[ ] source.context returns neighboring chunk or local definition context
```

**Checkpoint:** Chunk-layer retrieval works without LLM summarization.

---

## Rung 4: Capability Matrix

**What:** Record backend capabilities and explicit limitations per snapshot.

**Validation:**
```text
[ ] index.status reports supported and unsupported capabilities
[ ] backend engine identity is visible in responses
[ ] partial results report limitations instead of pretending completeness
```

**Checkpoint:** The system can say what it knows and what it cannot know.

---

## Rung 5: Symbol Resolution

**What:** Validate `symbol.resolve`.

**Validation:**
```text
[ ] symbol.resolve returns correct definitions on a real benchmark repo
[ ] ambiguous symbol names surface multiple candidates with warnings
[ ] response includes symbol kind, path, span, and owning chunk when available
[ ] unsupported languages or cases return explicit unsupported or partial status
```

**Checkpoint:** Agents can navigate to the right definition structurally.

---

## Rung 6: Import Graph

**What:** Validate `graph.imports` and `graph.importers`.

**Validation:**
```text
[ ] graph.imports returns direct imports/includes for a file or module
[ ] graph.importers returns reverse import/include results
[ ] limitations are explicit where reverse mapping is incomplete
```

**Checkpoint:** File and module relationship navigation works.

---

## Rung 7: Search

**What:** Validate `search.semantic`.

**Validation:**
```text
[ ] lexical and/or semantic hits can be returned over files, chunks, or symbols
[ ] results are snapshot-bound
[ ] returned hits carry path/span/type metadata
[ ] known decisive helper files surface for a targeted benchmark query
```

**Checkpoint:** The search layer can find likely evidence anchors.

---

## Rung 8: References

**What:** Validate `symbol.references`.

**Validation:**
```text
[ ] references can be located for a resolved symbol
[ ] file/span hits are structurally valid
[ ] local vs external distinction appears when derivable
[ ] partiality is reported honestly in dynamic languages
```

**Checkpoint:** Cross-file usage tracking works.

---

## Rung 9: Call Relationships

**What:** Validate `graph.callers` and `graph.callees`.

**Validation:**
```text
[ ] call relationships can be derived where the backend supports them
[ ] known caller/callee paths on a benchmark repo are found correctly
[ ] missing compile or project context downgrades to partial instead of silent failure
```

**Checkpoint:** The system can follow behavior chains structurally.

---

## Rung 10: Context Pack Assembly

**What:** Validate `context.pack`.

**Validation:**
```text
[ ] context.pack can assemble a structured pack around a task anchor
[ ] pack includes files, chunks, symbols, and relations
[ ] pack includes omissions and limitations explicitly
[ ] pack is usable by a downstream agent without rereading the whole repo
```

**Checkpoint:** The stable guide-building substrate exists.

## Rung 10A: Broad Query Planning

**What:** Validate source-first anchor planning for broad natural-language task
prompts.

**Validation:**
```text
[ ] broad prompts decompose into multiple high-signal subsystem probes
[ ] source runtime files are chosen as anchors before generic tests
[ ] low-signal static/plugin/public/vendor paths do not become guide anchors
[ ] real benchmark startup-health prompt surfaces multiple source anchors
```

**Checkpoint:** Broad benchmark prompts produce a guideable multi-anchor pack
instead of a single generic lexical anchor.

## Rung 10B: Runtime Surface Synthesis

**What:** Validate role-aware guide synthesis over the selected broad-query
anchors.

**Validation:**
```text
[x] broad runtime prompts name the major runtime surfaces explicitly
[x] each surfaced runtime role includes a representative file and symbol
[x] runtime checks reference those surfaced roles directly
[x] real startup-health prompt produces a source-first, role-aware guide
```

**Checkpoint:** Broad benchmark prompts produce a guide that explains what the
selected runtime surfaces do, not only where they live.

## Rung 10C: Runtime Surface Evidence Hygiene

**What:** Validate that surfaced guide evidence is runtime-oriented and not
dominated by low-signal lexical or test-only edges.

**Validation:**
```text
[x] surface findings prefer runtime flows over test-only flows when both exist
[x] obvious low-signal lexical callees are suppressed from surfaced findings
[x] tests remain attached as validation artifacts rather than the main runtime explanation
[x] runtime checks and handoff steps follow the surfaced roles in operator-friendly order
```

**Checkpoint:** Broad benchmark prompts produce a focused runtime research guide
instead of a lexical edge dump.

## Rung 10D: Narrow Behavior Query Planning

**What:** Validate that narrow behavior prompts anchor the decisive route/helper/model path
instead of regressing into broad operational guidance.

**Validation:**
```text
[x] narrow prompts extract high-signal compound probes from the question
[x] generic wording like `server console` does not trigger a web-server guide section by itself
[x] decisive route/helper/model files are surfaced for a behavior-path prompt
[x] a dedicated fixture proves narrow behavior prompts do not over-expand into a broad runtime guide
```

**Checkpoint:** Behavior questions produce a causal-path guide instead of a repo-wide runtime map.

## Rung 10E: Behavior Evidence Clarification

**What:** Validate that narrow behavior guides extract concrete facts from the
anchored route/helper/model path instead of stopping at file selection.

**Validation:**
```text
[x] narrow guides extract concrete status or response outcomes when the route code provides them
[x] narrow guides extract concrete log messages when the route/helper code provides them
[x] helper semantics such as `return None on failed verification` are surfaced when directly encoded
[x] local ordering facts are surfaced when directly visible in the code path
[x] unresolved claims remain marked for runtime confirmation instead of being fabricated
```

**Checkpoint:** Behavior questions produce a concrete research brief over the anchored path.

---

## Rung 11: Test Impact

**What:** Validate `tests.impact`.

**Validation:**
```text
[ ] likely relevant tests can be surfaced for a file or symbol
[ ] direct graph-backed matches are distinguished from heuristic matches
[ ] returned tests are actually present in the repo
```

**Checkpoint:** The stack can connect code evidence to validation surfaces.

---

## Rung 12: Go Backend

**What:** Validate Go backend milestone coverage on a real repo.

**Validation:**
```text
[ ] symbol.resolve is correct on a Go benchmark repo
[ ] symbol.references is correct on a Go benchmark repo
[ ] graph.imports works on Go packages
[ ] graph.callers/callees works on at least one known path
[ ] completeness is high and limitations are sparse
```

**Checkpoint:** Go backend is production-worthy for first benchmark experiments.

---

## Rung 13: TypeScript Backend

**What:** Validate TypeScript backend milestone coverage on a real repo.

**Validation:**
```text
[ ] symbol.resolve is correct on a TypeScript benchmark repo
[ ] symbol.references returns real project usages
[ ] graph.imports/importers works across the project graph
[ ] context.pack returns useful code packs for a real task
[ ] dynamic/runtime-only uncertainty is reported explicitly
```

**Checkpoint:** TypeScript backend is benchmark-usable.

---

## Rung 14: Python Backend

**What:** Validate Python backend usefulness and honesty on a real repo.

**Validation:**
```text
[ ] symbol.resolve works on a Python benchmark repo
[ ] graph.imports is useful and structurally correct
[ ] context.pack can assemble relevant supporting files
[ ] partiality is reported for dynamic edges the backend cannot prove
```

**Checkpoint:** Python backend is useful even when not perfectly complete.

---

## Rung 15: C Backend

**What:** Validate C backend with real compile context.

**Validation:**
```text
[ ] compile context is available or explicitly missing
[ ] symbol.resolve works on a C benchmark repo
[ ] symbol.references works on a C benchmark repo
[ ] include graph is useful and correct
[ ] call relationships work when compile context supports them
```

**Checkpoint:** C backend is strong enough to support `kitty` research.

---

## Rung 16: Recursive Investigator Consumption

**What:** Validate that the recursive investigator can use the tool contract.

**Validation:**
```text
[ ] investigator consumes the shared tool envelope without backend-specific branching
[ ] unresolved dependencies trigger follow-up tool calls
[ ] investigator assembles one guide/context pack artifact
[ ] provenance of tool-derived evidence is preserved
```

**Checkpoint:** The code-intelligence API is usable as an investigation substrate.

---

## Rung 17: Benchmark-Relevant Task Reproduction

**What:** Validate that the new stack fixes a known benchmark-style miss.

**Validation:**
```text
[ ] on the simple-login custom alias task, the stack connects:
    [ ] route code
    [ ] helper behavior
    [ ] model/quota behavior
    [ ] handler/response behavior
    [ ] relevant tests
[ ] the resulting context pack is materially better than the old tree-only guide
```

**Checkpoint:** The stack is ready for judged baseline-vs-guided experiments.
