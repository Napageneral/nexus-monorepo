# Spec-Driven Development Workflow

**Status:** CANONICAL
**Last Updated:** 2026-03-10

---

## Purpose

This document defines the canonical workflow for spec-driven development across Nexus projects.

The goal is simple:

1. define the ideal target state clearly
2. identify every gap between that target state and reality
3. sequence the work to close the gaps
4. validate the finished system against the target state only

The active documentation tree must always tell one coherent story. Specs, workplans, validations, and archives are different artifact types and must not be mixed.

---

## Core Rules

### 1. Specs define the ideal state only

Canonical spec documents describe the intended system as if it were already complete.

They may include:

- the customer experience
- the conceptual model
- object definitions
- APIs, contracts, schemas, and data models
- reasoning, tradeoffs, and rejected alternatives

They must not include:

- migration instructions
- phased rollout notes
- compatibility shims
- references to legacy systems as part of the target state
- "v1 for now" compromises unless they are truly part of the intended long-term design

If a reader took only the active spec set, they should be able to faithfully reimplement the project.

When a system has overlapping nouns or historically messy vocabulary, the active spec set should include a dedicated taxonomy document early in the cycle. Other specs should reference that taxonomy instead of redefining terms ad hoc.

### 2. Workplans describe gap closure, not the target state

Workplans exist to move the codebase from current reality to the canonical specs.

They contain:

- gap analysis
- sequencing
- implementation phases
- file-level changes
- deletions and cutovers
- temporary blockers and open execution questions

They do not redefine the product or platform. If a workplan discovers a target-state conflict, the spec must be updated first.

### 3. Validation documents validate the specs

Validation ladders, test plans, smoke checks, and scripts exist to prove that the implementation matches the canonical specs.

Validation documents should reference the intended behavior, not historical behavior.

### 4. Archive finished or superseded material

Completed workplans, superseded specs, stale validations, and abandoned proposals do not stay in the active tree.

They move to archive so that:

- the active tree stays clean
- agents do not treat stale documents as live truth
- historical context remains easy to search

### 5. Customer experience comes before implementation detail

Every spec pass starts from the user and operator experience:

- what the customer sees
- what the operator does
- what must feel simple and reliable

Only after that is clear should the docs lock the underlying APIs, schemas, and internals.

### 6. Hard cutover is the default

Canonical specs describe the post-cutover architecture.

Backward compatibility, compatibility aliases, migration bridges, and transitional dual systems belong in workplans only.

### 7. Independent alignment review happens repeatedly

After each major phase, a separate review pass should compare:

- new specs vs existing specs
- specs vs code
- specs vs workplans
- specs vs validation ladders

This keeps conflicts small and local instead of letting them accumulate.

---

## Canonical Artifact Types

### `proposals/`

Exploratory drafts that are still being researched or debated.

Characteristics:

- not authoritative
- may contain open questions
- may be discarded
- may later be promoted into canonical specs
- if a document is labeled `DRAFT`, `DESIGN`, `seed`, `TODO`, or `not started`, it belongs here or in `workplans/`, never in `specs/`

### `specs/`

The authoritative target-state documents.

Characteristics:

- stable names
- no migration residue
- one coherent story
- source of truth for implementation and validation
- must not be labeled `DRAFT`, `DESIGN`, `seed`, `TODO`, `not started`, or `superseded`

### `workplans/`

Execution documents that close the gap between code and specs.

Characteristics:

- may be phased
- may reference current code and legacy behavior
- may include sequencing, deletion, and cutover details
- temporary by nature

### `validation/`

Validation ladders, test matrices, scripts, and runbooks that prove the system behaves according to the specs.

Characteristics:

- iterative
- updated as specs change
- can include manual and automated checks
- active until the current target state is fully validated

### `archive/`

Historical material that should remain searchable but not active.

Characteristics:

- superseded specs
- completed workplans
- retired validations
- abandoned proposals

---

## Canonical Directory Layout

For a project repository, the preferred documentation layout is:

```text
docs/
  proposals/
  specs/
  workplans/
  validation/
  archive/
    proposals/
    specs/
    workplans/
    validation/
```

Rules:

1. `docs/specs/` contains only active canonical specs.
2. `docs/workplans/` contains only active execution plans.
3. `docs/validation/` contains only active validation ladders and support scripts.
4. `docs/archive/` contains anything no longer active.
5. If exploratory drafts exist, `docs/proposals/` should exist and those drafts belong there, not in `docs/specs/`.
6. `docs/specs/` must not contain files whose own status is `DRAFT`, `DESIGN`, `seed`, `TODO`, `not started`, or `superseded`.

For a centralized spec repository such as `nexus-specs`, the same logical split still applies even if the directory names differ. The important constraint is semantic, not cosmetic:

- active target-state docs must be clearly separate from workplans
- active docs must be clearly separate from archives
- repos may use per-artifact `_archive/` subdirectories instead of a shared `docs/archive/` tree, but the active vs archived split must remain obvious

---

## Workflow

### 1. Research

Outputs:

- customer experience understanding
- code and doc inventory
- known contradictions
- open questions

Gate:

- the customer and operator experience is understood before low-level design starts

### 2. Discuss and write the target-state specs

Outputs:

- new or revised canonical specs
- stable naming
- ideal-state APIs, schemas, and data models

Gate:

- the intended system is explicit enough to implement from the spec set alone

### 3. Compare new specs to existing specs

Outputs:

- conflict list across the active spec corpus
- resolved naming and architecture disagreements
- updates to the new canonical specs where needed

Gate:

- the active spec set has one coherent story

### 4. Gap analysis against code

Outputs:

- a code-vs-spec delta inventory
- identified missing code
- identified residue to delete
- resolved technical conflicts discovered during inspection

Gate:

- the implementation gap is concrete rather than hand-wavy

### 5. Write workplans

Outputs:

- one or more sequenced workplans
- dependency ordering
- implementation phases
- explicit cutovers and deletions

Gate:

- the path from current code to target state is executable

### 6. Design or update the validation ladder

Outputs:

- validation ladders
- supporting scripts
- explicit pass/fail criteria tied to the specs

Gate:

- there is a concrete way to prove the target state works

### 7. Full spec/workplan/archive alignment pass

Outputs:

- stale docs moved to archive
- active indexes updated
- remaining contradictions resolved

Gate:

- the active tree is clean before implementation proceeds deeply

### 8. Implementation

Outputs:

- code changes aligned to the specs and workplans

Gate:

- no implementation change should intentionally drift from the active specs

### 9. Continuous validation and workplan updates

Outputs:

- passing intermediate checks
- workplan corrections when real implementation findings require them

Gate:

- workplans stay honest as implementation reveals real effort

### 10. Final validation ladder completion

Outputs:

- a complete pass of the active validation ladder

Gate:

- the system is proven against the current target-state specs

### 11. Independent final gap review

Outputs:

- a fresh code-vs-spec review by a separate agent or reviewer
- any remaining gaps turned back into spec refinement or implementation work

Gate:

- no known mismatch remains between active code and active specs

### 12. Archive completed workplans

Outputs:

- completed workplans moved out of the active tree

Gate:

- the active documentation tree is back to a clean steady state

---

## Alignment Checkpoints

Independent review is expected after Steps 2 through 6 and again after Step 10.

Recommended review questions:

1. Does the customer experience still make sense?
2. Do any active specs disagree with each other?
3. Does the code currently violate the new spec?
4. Does the workplan accidentally redefine target-state behavior?
5. Does the validation ladder still test the right thing?

If the answer to any of these is "yes, there is a mismatch", fix the higher-order artifact first:

- spec issue -> fix the spec
- execution issue -> fix the workplan
- proof issue -> fix the validation ladder
- implementation issue -> fix the code

---

## Naming and File Rules

### Canonical specs

Prefer stable filenames without dates for active canonical specs.

Examples:

- `HOSTED_INSTALL_AND_UPGRADE_LIFECYCLE.md`
- `NEX_APP_MANIFEST_AND_PACKAGE_MODEL.md`

### Workplans and validations

Dated filenames are acceptable when they help track a planning cycle, but only while the document is active.

### Archived documents

Archived documents may keep historical names and dates.

---

## Promotion and Archive Rules

### Proposal -> Spec

Promote a proposal into `specs/` only when:

1. the customer experience is clear
2. the main object model and vocabulary are settled
3. conflicts with the active spec set are understood

### Active Spec -> Archive

Archive an active spec when it is superseded by a newer canonical spec.

### Active Workplan -> Archive

Archive an active workplan when:

1. its implementation is complete
2. the active validation ladder passes for its scope
3. a fresh review finds no remaining gap that still belongs in that workplan

### Active Validation -> Archive

Archive a validation doc when the target state it validates is no longer active.

---

## Non-Negotiable Outcome

At any point in time, the active documentation tree must answer these questions cleanly:

1. What is the intended system?
2. What work remains to achieve it?
3. How do we prove it works?
4. Which older documents are no longer active?

If the repo cannot answer those questions quickly, the documentation system is out of alignment and must be cleaned up.
