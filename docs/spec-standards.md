# Spec Standards

**Status:** CANONICAL
**Last Updated:** 2026-03-10

---

## Purpose

These conventions define how governance, canonical specs, proposals, workplans, validation docs, and archived material should be written and maintained across Nexus projects.

This document complements:
- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/governance/spec-driven-development-workflow.md)

The workflow defines the process.
This document defines the writing and organization standards.

---

## Core Principles

1. The active tree must tell one coherent story.
2. Canonical specs describe only the finished system.
3. Workplans describe only gap closure.
4. Validation documents describe how to prove the specs.
5. Historical material stays searchable, but not active.

---

## Artifact Classes

### Canonical specs

Target-state build documents.

Characteristics:
- stable filenames
- no migration residue
- no temporary compatibility language
- no status labels like `DESIGN`, `TODO`, `seed`, or `not started`

### Proposals

Exploratory design documents that are not yet canonical.

Characteristics:
- may contain open questions
- may contain competing options
- may later be promoted into canonical specs

### Workplans

Execution plans for closing the gap between code and specs.

Characteristics:
- may reference current code and legacy behavior
- may include sequencing, deletions, cutovers, and blockers
- are temporary by nature

### Validation docs

Documents that prove the implementation matches the canonical specs.

Characteristics:
- pass/fail oriented
- may include smoke checks, test matrices, runbooks, or scripts

### Reference docs

Useful background material that is not a build target.

Characteristics:
- historical decisions
- upstream analysis
- capability matrices
- implementation inventories

### Archive

Historical material no longer active.

Characteristics:
- superseded specs
- completed workplans
- retired validations
- abandoned proposals

---

## Header Format

Every active canonical, proposal, validation, or reference doc should begin with:

```md
# Document Title

**Status:** CANONICAL | PROPOSAL | VALIDATION | REFERENCE
**Last Updated:** YYYY-MM-DD
**Related:** optional related document paths

---
```

Rules:
- `Status` is required.
- `Last Updated` is required for active docs.
- `Related` is optional but encouraged when a doc is part of a cluster.

Workplans may use either this same header format or a short workplan-specific preamble, but they must still clearly identify themselves as workplans.

---

## Allowed Statuses

Use these statuses in active docs:

| Status | Meaning |
|--------|---------|
| **CANONICAL** | Locked target-state document. Build from this. |
| **PROPOSAL** | Open design draft under active discussion. |
| **VALIDATION** | Active proof/runbook/test-oriented document. |
| **REFERENCE** | Useful context, not a build target. |

Do not use these statuses in the active tree:
- `DESIGN`
- `DRAFT`
- `TODO`
- `seed`
- `not started`
- `superseded`
- `active` as a spec status

If a document still fits one of those descriptions, it belongs in `proposals/`, `workplans/`, or `archive/`, not in the active canonical spec path.

---

## Naming Rules

### Canonical specs

Prefer stable descriptive names without dates.

Good:
- `communication-model.md`
- `jobs-schedules-and-dags.md`
- `access-control.md`

Bad:
- `BATCH_5_NOTES.md`
- `NEW_TODO_SPEC.md`
- `REDESIGN_2026-03-01.md`

### Workplans

Dated filenames are acceptable when they identify an execution cycle.

Good:
- `final-nex-api-review.md`
- `identity-cutover-2026-03-10.md`

### Proposals

Names should describe the open design question clearly.

Good:
- `environment-redesign.md`
- `job-runtime-and-dag-engine.md`

### Archive

Archived documents may keep historical names and dates.

---

## Directory Layout

Preferred project layout:

```text
docs/
  governance/
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
2. `docs/proposals/` contains active open design drafts.
3. `docs/workplans/` contains active execution plans.
4. `docs/validation/` contains active validation material.
5. `docs/archive/` contains anything no longer active.
6. Governance docs that apply across projects should live in a shared non-product-specific location such as `docs/governance/`.

---

## Writing Rules

### Canonical specs

Canonical specs should:
- describe only the intended final system
- define nouns and boundaries clearly
- avoid migration language
- avoid compatibility framing
- avoid implementation residue unless it is part of the actual target-state contract

Canonical specs should not:
- talk about “for now”
- mention old systems as live alternatives
- embed workplan execution steps
- embed validation ladder checklists

### Workplans

Workplans should:
- reference the canonical specs they are implementing
- describe the current gap
- define sequencing and cutover steps
- stay honest as execution reveals new work

Workplans should not:
- redefine product behavior
- quietly override the canonical specs

### Validation docs

Validation docs should:
- reference the canonical intended behavior
- define explicit pass/fail conditions
- stay current with the active spec set

### Reference docs

Reference docs should:
- clearly say they are reference-only
- avoid looking like active canonical build targets

---

## Cross-References

Rules:
1. Prefer absolute repository paths in cross-project governance references when clarity matters.
2. Prefer stable canonical docs over historical mirrors.
3. If a canonical doc moves, leave a forwarding stub in the old location until active references are updated.
4. Archived documents may still reference archived material, but active docs should prefer the active canonical location.

---

## Promotion Rules

### Proposal -> Canonical spec

Promote only when:
1. the customer/operator experience is clear
2. the main object model is settled
3. conflicts with the active canon are resolved

### Workplan -> Archive

Archive when:
1. the execution scope is complete
2. the relevant validation passes
3. the remaining active gap no longer belongs in that workplan

### Canonical spec -> Archive

Archive when a newer canonical document fully supersedes it.

Do not leave superseded canonical docs in the active reading path.

---

## Non-Negotiable Outcome

At any point, an active documentation tree should make it easy to answer:

1. What is the intended system?
2. What is still being designed?
3. What work is actively being executed?
4. How do we prove the system works?
5. Which documents are historical only?

If those answers are not obvious, the docs need cleanup.
