# Spec-Driven Development Workflow

**Status:** CANONICAL
**Last Updated:** 2026-03-16

---

## Purpose

This document defines the canonical workflow for spec-driven development across Nexus projects.

The goal is simple:

1. define the ideal target state clearly
2. identify every gap between that target state and reality
3. sequence the work to close the gaps
4. preserve a durable validation corpus for the finished system

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

The latest validation ladder for a still-supported behavior remains part of the
active validation corpus even after the original implementation work is done.

### 4. Archive finished or superseded material

Completed workplans, superseded specs, obsolete validation docs, and abandoned
proposals do not stay in the active tree.

They move to archive so that:

- the active tree stays clean
- agents do not treat stale documents as live truth
- historical context remains easy to search

Archive a validation doc only when:

- the behavior is no longer part of canon
- a newer validation doc supersedes it for the same behavior
- it is a one-off campaign proof and not part of the durable validation corpus

Do not archive a validation doc merely because:

- the implementation work landed
- the paired workplan is archived
- one dated signoff pass already succeeded

### 5. Customer experience comes before implementation detail

Every spec pass starts from the user and operator experience:

- what the customer sees
- what the operator does
- what must feel simple and reliable

Only after that is clear should the docs lock the underlying APIs, schemas, and internals.

### 5a. Consolidate fragmented target state before implementation

When the intended architecture is currently split across:

- multiple active specs
- workplans carrying target-state decisions
- partial overlap across domains

the next step is to write one consolidated canonical spec before continuing
implementation.

That umbrella spec should:

- describe the customer experience first
- unify naming and object boundaries
- absorb target-state decisions that accidentally landed in workplans
- become the document neighboring specs defer to for the shared area

Do not implement from a pile of half-authoritative documents.
Consolidate first, then align the surrounding canon.

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

### 7a. Workplan hygiene is mandatory and recurring

Workplan cleanup is not an end-of-project nicety. It is part of the workflow.

Rules:

- active workplans must describe only real open work
- completed or superseded workplans must be archived promptly
- partially stale workplans must be narrowed or split
- active workplan indexes must reflect only genuine open execution fronts
- a broader domain may stay active while a narrower completed workplan for that
  domain archives

### 8. Customer-specific exemplars do not replace generic canon

Real customer runtimes are essential for research, validation, and dogfooding.

But active canonical specs should describe the generic target-state architecture,
not one person's named local setup.

Rules:

- use generic nouns in active specs
- keep customer-specific cutovers, inventories, and examples in workplans or
  validation docs
- only include a customer-specific example in a canonical spec when it is
  clearly marked as non-normative and genuinely improves understanding

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

Validation ladders, test matrices, scripts, runbooks, and signoff records that
prove the system behaves according to the specs.

Characteristics:

- maintained as the proof corpus for active canonical behavior
- updated as specs or proof methods change
- can include manual and automated checks
- may remain active after implementation work completes

Validation docs fall into three subtypes:

1. canonical validation ladders
   - the latest proof path for a still-supported behavior
   - stays active while the behavior remains canonical
2. signoff or closure records
   - dated proof snapshots for a specific completion event
   - historical by nature, even when linked from the active validation index
3. campaign or migration validation
   - narrow one-off rollout proof
   - archives once superseded or no longer the right proof path

### `archive/`

Historical material that should remain searchable but not active.

Characteristics:

- superseded specs
- completed workplans
- obsolete, superseded, or campaign-specific validation docs
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
- one consolidated umbrella spec when the target state is fragmented across
  multiple active docs
- stable naming
- ideal-state APIs, schemas, and data models

Gate:

- the intended system is explicit enough to implement from the spec set alone

### 3. Compare new specs to existing specs

Outputs:

- conflict list across the active spec corpus
- redirected or trimmed neighboring specs when one new umbrella spec becomes
  the canonical owner of a shared architecture area
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

- stale or superseded docs moved to archive
- active indexes updated
- remaining contradictions resolved
- workplan hygiene pass completed
- validation docs classified as active proof corpus, signoff record, or archive

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
- recurring workplan hygiene and archive updates
- validation ladder updates when the proof method changes but the behavior
  remains canonical

Gate:

- workplans stay honest as implementation reveals real effort

### 10. Final validation corpus refresh and signoff

Outputs:

- a complete pass of the active validation ladder for the implemented scope
- refreshes to any validation ladders whose proof steps changed during
  implementation
- a dated signoff or closure record when the slice is complete

Gate:

- the system is proven against the current target-state specs

### 11. Independent final gap review

Outputs:

- a fresh code-vs-spec review by a separate agent or reviewer
- any remaining gaps turned back into spec refinement or implementation work

Gate:

- no known mismatch remains between active code and active specs

### 12. Final workplan hygiene and archive pass

Outputs:

- completed workplans moved out of the active tree
- partial or superseded workplans narrowed or archived
- active workplan indexes trimmed to real open fronts

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

If the older spec still contains unique valid detail, move that detail into the
new canonical owner first, then archive the superseded document.

### Active Workplan -> Archive

Archive an active workplan when:

1. its implementation is complete
2. the active validation ladder passes for its scope
3. a fresh review finds no remaining gap that still belongs in that workplan

### Active Validation -> Archive

Archive a validation doc when:

1. the behavior it validates is no longer part of canon
2. a newer validation doc supersedes it for the same behavior
3. it is a one-off campaign proof and no longer the correct proof path

Do not archive a validation doc merely because:

1. the paired workplan completed
2. the code landed
3. a signoff record already exists

---

## Non-Negotiable Outcome

At any point in time, the active documentation tree must answer these questions cleanly:

1. What is the intended system?
2. What work remains to achieve it?
3. How do we prove it works?
4. Which older documents are no longer active?

If the repo cannot answer those questions quickly, the documentation system is out of alignment and must be cleaned up.
