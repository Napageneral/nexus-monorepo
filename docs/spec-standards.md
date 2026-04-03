# Spec Standards

**Status:** CANONICAL
**Last Updated:** 2026-04-02

---

## Purpose

These conventions define how governance, canonical specs, proposals, workplans,
runbooks, validation docs, and archived material should be written and
maintained across Nexus projects.

This document complements:
- [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)

The workflow defines the process.
This document defines the writing and organization standards.

---

## Core Principles

1. The active tree must tell one coherent story.
2. Canonical specs describe only the finished system.
3. Workplans describe only gap closure.
4. Validation documents define and preserve the proof corpus for canonical behavior.
5. Runbooks define the supported live procedure, not the target-state design.
6. Workplan hygiene is mandatory; stale workplans do not stay active.
7. Historical material stays searchable, but not active.

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
- written as thin proof contracts, matrices, or support scripts rather than
  narrative proof ledgers
- may remain active after the paired implementation workplan is complete
- should describe the latest proof path for a still-supported behavior
- should name the canonical proof harness, profile, or script plus the expected
  evidence and explicit pass/fail conditions
- should be revised, not archived, when the behavior remains canonical but the
  proof method changes
- should default to runtime-managed sandbox end-to-end proof for
  runtime-affecting behavior once the bootstrap/substrate cleanroom kernel
  passes
- should keep host-native proof as an explicit exception, not a silent parallel
  default
- should prefer human-shaped manager, worker, or operator journeys when that is
  the truthful product flow
- should not become artifact ledgers or closure-history dashboards

### Runbooks

Operator-facing or human-executed procedure documents.

Characteristics:
- describe the supported live procedure today
- may include concrete commands, paths, service names, and rollback steps
- may reference current operational constraints without redefining the
  underlying target-state design
- should point back to the canonical spec and active validation ladder where
  relevant
- should archive when superseded or when they were only rollout/campaign
  procedures

### Signoff records

Dated closure proofs for a specific implementation or rollout milestone.

Characteristics:
- historical evidence for a concrete completion event
- usually belong in `validation/archive/` unless they still define the current
  handoff proof path
- may summarize a full validation run
- do not replace the durable validation ladder for the same behavior

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
- obsolete, superseded, or campaign-specific validations
- abandoned proposals
- historical signoff records when they no longer belong on the active reading
  path

---

## Header Format

Every active canonical, proposal, runbook, validation, or reference doc should begin with:

```md
# Document Title

**Status:** CANONICAL | PROPOSAL | RUNBOOK | VALIDATION | REFERENCE
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
| **RUNBOOK** | Active supported operator or human procedure. |
| **VALIDATION** | Active proof contract, matrix, or support script. |
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
  runbooks/
  validation/
  archive/
    proposals/
    specs/
    workplans/
    runbooks/
    validation/
```

Rules:
1. `docs/specs/` contains only active canonical specs.
2. `docs/proposals/` contains active open design drafts.
3. `docs/workplans/` contains active execution plans.
4. `docs/runbooks/` contains active supported procedures and operator playbooks.
5. `docs/validation/` contains thin active proof contracts, matrices, and
   support scripts.
6. `docs/archive/` contains anything no longer active.
7. Governance docs that apply across projects should live in a shared non-product-specific location such as `docs/governance/`.

These index rules apply across all project-local docs trees in the workspace,
including runtime, frontdoor, apps, and adapters.

Index docs should stay structural and low-churn:

1. explain subtree purpose, boundaries, and reading posture
2. point to a small number of durable anchor entrypoints only when they are
   genuinely stable
3. prefer filesystem discovery for leaf docs instead of mirroring the tree
4. avoid acting as exhaustive registries, active dashboards, or archive ledgers

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
- be narrowed or archived once parts of the scope are no longer genuinely open
- keep board-style execution lanes truthful about whether they are still active

Workplans should not:
- redefine product behavior
- quietly override the canonical specs
- remain at the active root as closure residue after the board is fully
  complete

Board-style workplans should:

1. stay at the active root only while they still own real open work
2. archive as whole directories once all tickets are complete and no open scope
   remains
3. keep closure or proof context in validation and archive rather than using
   the active root as a historical dashboard
4. delete empty shell boards that never became meaningful execution surfaces
   instead of letting them linger as ambiguous residue

### Validation docs

Validation docs should:
- reference the canonical intended behavior
- define explicit pass/fail conditions
- stay current with the active spec set
- remain active when they are still the latest proof path for a live behavior
- avoid stale campaign-specific framing if they are intended to be part of the
  durable validation corpus
- name the primary Docker-backed or equivalently containerized proof path for
  runtime-affecting behavior
- treat runtime-managed sandbox end-to-end proof as the default active lane
  once the bootstrap/substrate cleanroom kernel passes
- explain explicitly when a runtime-affecting validation lane is not
  Docker-backed
- explain explicitly when a validation lane requires host-native proof
- treat live local runtime checks as secondary dogfood unless the behavior
  specifically requires live-state validation
- prefer human-shaped manager, worker, or operator journeys over low-level
  shortcuts when that is the truthful product flow
- keep artifact bundles and dated proof receipts as supporting evidence rather
  than the primary active reading surface

### Runbooks

Runbooks should:
- describe the supported live procedure only
- include concrete commands, paths, rollback steps, and safety checks when
  those are part of the current procedure
- reference the canonical target-state spec rather than restating it
- reference the active validation ladder where proof matters
- archive promptly when superseded by a newer supported procedure

Runbooks should not:
- redefine contracts, schemas, or the target-state architecture
- quietly absorb validation ladders
- remain active when they describe only one-off rollout or historical recovery
  paths

### Signoff records

Signoff records should:
- clearly identify the dated completion event they certify
- summarize the proof that passed
- point back to the durable validation ladder where relevant

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
4. for board-style workplans, the entire board should archive together once the
   lane is complete rather than leaving a completed board at the active root

### Validation -> Archive

Archive when:
1. the behavior is removed from canon
2. a newer validation doc supersedes it for the same behavior
3. the doc is a one-off campaign proof rather than part of the durable
   validation corpus
4. the doc is a dated signoff snapshot or artifact-ledger packet that no
   longer defines the current proof path

Do not archive when:
1. the workplan completed
2. the code landed
3. one dated signoff record already exists while the same active proof contract
   still governs the behavior

### Runbook -> Archive

Archive when:
1. a newer supported procedure supersedes it
2. it becomes a historical rollout or campaign-specific playbook
3. the behavior it operates is no longer active

### Canonical spec -> Archive

Archive when a newer canonical document fully supersedes it.

Do not leave superseded canonical docs in the active reading path.

---

## Non-Negotiable Outcome

At any point, an active documentation tree should make it easy to answer:

1. What is the intended system?
2. What is still being designed?
3. What work is actively being executed?
4. How does an operator perform the supported live procedure?
5. How do we prove the system works?
6. Which documents are historical only?

If those answers are not obvious, the docs need cleanup.
