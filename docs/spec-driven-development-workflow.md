# Spec-Driven Development Workflow

**Status:** CANONICAL
**Last Updated:** 2026-04-02

---

## Purpose

This document defines the canonical workflow for spec-driven development across Nexus projects.

The goal is simple:

1. define the ideal target state clearly
2. identify every gap between that target state and reality
3. sequence the work to close the gaps
4. preserve a durable validation corpus and truthful operator procedure corpus
   for the finished system

The active documentation tree must always tell one coherent story. Specs,
workplans, validations, runbooks, and archives are different artifact types and
must not be mixed.

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

### 1a. Provider-backed adapters are full-surface by default

For provider-backed adapters, the target-state spec must describe one
canonical adapter package that:

- exposes the full upstream provider API surface
- preserves provider-native method names or a stable truthful mapping
- adds Nex-specific projection behavior for ingest, backfill, monitor, and
  normalization without hiding provider-native methods

Specs and workplans must not normalize a narrow selected write slice into the
target-state adapter model when the intended long-term design is full provider
coverage.

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

Validation ladders, matrices, support scripts, and proof profiles exist to
prove that the implementation matches the canonical specs.

Validation documents should reference the intended behavior, not historical
behavior.

The active validation corpus should stay thin and executable:

- each active validation doc should define the current proof contract rather
  than narrate every past proof run
- it should name the canonical proof harness, profile, or script, the pass/fail
  conditions, the expected review evidence, and any host-native exception
- it should treat artifact bundles and dated signoff receipts as supporting
  evidence, not as the active canonical proof surface

The latest validation ladder for a still-supported behavior remains part of the
active validation corpus even after the original implementation work is done.

For provider-backed adapters, the active validation corpus must cover all three
canonical proof lanes:

- install and connect proof
- backfill and monitor proof
- agent-use proof

An adapter is not complete when only one of those lanes is green.

Closure records, dated signoff packets, and one-off proof ledgers belong in
archive unless they still define the current proof path during a live handoff.

### 3g. Runbooks document the supported live procedure

Runbooks exist for current operator-facing or human-executed procedures.

They answer questions like:

- how a supported live procedure is performed today
- what steps an operator follows
- what preconditions, rollback rules, and safety checks apply

Runbooks may include:

- concrete commands
- current filesystem paths
- current service names
- operator checkpoints and rollback steps
- links to the canonical spec and validation ladder for the same behavior

Runbooks must not:

- redefine the target-state architecture
- replace canonical specs as the source of truth for contracts or models
- serve as the only proof corpus for whether a behavior works

If the procedure is historical, superseded, or campaign-specific rather than
the supported live path, it belongs in archive.

### 3a. Cleanroom validation is the default proof posture

For runtime-affecting work, the primary proof path must run in a disposable
cleanroom rather than against the operator's live local runtime.

The canonical cleanroom model is layered:

- keep a small host-level cleanroom kernel outside Nex for source-release,
  bootstrap, launcher, and substrate proof
- run most feature and integration validation inside runtime-managed sandboxes
  once that kernel already passes

For supported runtime behavior above bootstrap and substrate, the default active
proof lane is a fresh runtime-managed sandbox end-to-end run.

This applies especially to work involving:

- bootstrap and onboarding
- runtime state or storage
- apps and adapters
- identity and credentials
- hosted provisioning and install flows

The default outer cleanroom executor is Docker-backed or equivalently
containerized.

That outer layer is not the whole validation world.

When the behavior being proven does not require proving Nex bootstrap from
absolute zero, prefer runtime-managed sandbox validation over one-off host shell
glue.

Any validation lane that does not use a Docker-backed or otherwise explicitly
containerized cleanroom must justify the exception in the active validation
doc.

For hosted validation, the preferred target is also disposable:

- a fresh Frontdoor-managed hosted server surrogate
- provisioned through the same create/bootstrap/runtime-token/install seams
- but backed by a sandboxed local cleanroom substrate unless the behavior is
  explicitly provider-specific or compliance-bound

Live local dogfood is still important, but it is a secondary pass for:

- repair and forensics
- final operator confirmation
- behaviors that truly depend on an already-lived-in local runtime

### 3b. Golden-journey proof is the default review artifact

For user-facing or operator-facing runtime work, the default review artifact is
not a pile of tiny test recordings.

The default review shape is layered:

- one primary narrative proof run that demonstrates the feature in a human
  end-to-end flow
- smaller coverage tests that protect correctness and speed diagnosis

The primary narrative proof should usually be a cumulative golden journey that:

- starts from sandbox startup or fresh bootstrap when that is part of the
  feature story
- records the whole sandbox session, not only the browser surface
- shows the same sequence a human operator would care about
- proves the new feature integrated into the real product flow

For agentic and operator-facing flows, that journey should usually use the same
manager, worker, operator, capability-discovery, and adapter seams that the
real product flow uses instead of a lower-level shortcut.

The smaller coverage suite is still required.

But its debug media is secondary. Successful runs should retain only the
minimal media needed for diagnosis or audit, while the golden-journey artifact
is the thing a reviewer watches first.

### 3c. Human-shaped validation scripts must be explicit before execution

When an agent proposes a user-facing or operator-facing validation run, it must
surface the exact validation script before execution.

That script should include:

- what the validating agent will say
- what buttons, commands, or product actions it will take
- what external messages or prompts it will send
- what expected outcomes it is checking
- which steps are happy-path proof versus edge-case or failure-case proof

The point is to prevent agents from inventing synthetic, un-human phrasing that
technically exercises a feature without truthfully validating it.

The validation script may live in:

- the active workplan ticket
- the validation ladder
- or the owning Dispatch job packet once Dispatch becomes the primary operator
  surface

Until that script is explicit, the validation plan is incomplete.

When the validation lane is run-backed, the same script should attach to the
owning run as structured review data so the reviewer does not have to recover
it from logs after execution.

### 3d. Structured validation profiles own ticket-level proof lanes

Dispatch-run ticket validation must not depend on ad hoc shell command strings
or environment-variable topology switches as the primary contract.

The canonical model is:

- the policy selects a structured validation profile
- the profile resolves to a reusable cleanroom-backed execution primitive
- the profile defines adapter, connection, credential, and evidence needs
- the review surface shows the intended human proof, not shell glue

For ticket-level golden-journey proof:

- the default executor is a Docker-backed cleanroom
- the default proof posture prefers real adapters and real connected accounts
- fake adapters or synthetic remotes are for lower-level deterministic harnesses
  and regression isolation, not the main review proof

For user-facing and operator-facing behavior, the profile should usually drive a
manager-to-worker or operator-style journey through the normal runtime seams
when that is the truthful product flow.

The profile may compile down to one or more reusable job definitions, but the
stable operator-facing noun is the validation profile, not a raw command list.

### 3e. Candidate artifacts separate implementation from signoff validation

For Dispatch-run ticket execution, the implementation sandbox and the signoff
validation cleanroom are not the same contract.

The canonical model is:

- the implementation worker may use its own sandbox for fast local checks and
  iteration
- the implementation stage emits an explicit candidate artifact
- the validating stage consumes that candidate artifact in a fresh cleanroom
- the primary demo artifact comes from the validation cleanroom, not the
  implementation sandbox

This means:

- signoff validation must not silently fall back to the policy base ref or the
  operator's ambient checkout
- the candidate artifact may be a workspace snapshot, patch bundle, installable
  runtime bundle, or container image, but it must be explicit and reproducible
- validation profiles and runners own environment projection and candidate
  materialization
- ticket-specific validation scripts own the behavior being proven

Implementation-local testing is still useful and expected.

It is just not the same thing as the clean signoff proof a reviewer should
trust.

### 3f. Warm implementation substrates own startup speed, not validation truth

For Dispatch-run implementation work, the system should distinguish three
different reusable layers:

- base sandbox image
- warm implementation substrate
- fresh per-run implementation sandbox

The canonical rules are:

- base images are toolchain- and profile-oriented and should not be rebuilt per
  commit by default
- warm implementation substrates are repo- and dependency-keyed and may be
  refreshed much more often than images
- implementation workers should start from a preflighted warm substrate when
  the repo supports it
- signoff validation should still happen in a fresh cleanroom against the
  selected candidate artifact

This means:

- Nex should run substrate preflight before the worker is attached
- substrate-prep should be a first-class job boundary between `hydrate_repo`
  and `implementing`
- workers should not spend critical-path budget on dependency install, command
  shim repair, or first-time repo smoke checks unless the ticket is explicitly
  about that substrate work

The canonical image/substrate split is:

- create a new image when the execution platform changes
- create or refresh a warm substrate when the repo execution state changes

So commit or lockfile changes should normally create a new substrate, not a new
image.

### 4. Archive finished or superseded material

Completed workplans, superseded specs, obsolete validation docs, superseded
runbooks, and abandoned proposals do not stay in the active tree.

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

Archive a runbook when:

- the supported live procedure changes and a newer runbook supersedes it
- the underlying behavior is no longer part of the supported system
- it was only a one-off operational campaign or rollout packet

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

### 5b. Provider-backed adapters must specify full provider surface plus projection

When the system being designed is a provider-backed adapter, the target-state
spec must distinguish two different concerns clearly:

- the full provider-native method surface the adapter exposes
- the Nex projection contract that governs ingest normalization and runtime
  semantics

Rules:

- do not narrow the outward provider method surface by default just because a
  smaller product slice feels easier to describe
- treat provider-native methods as part of the canonical adapter interface when
  a trustworthy provider contract exists
- specify the Nex projection contract explicitly:
  - canonical record families
  - stable external ids
  - channel, container, and thread mapping
  - backfill strategy
  - live sync or monitor strategy
  - normalization and attachment handling
- keep provider-surface decisions and projection decisions separate so one can
  expand without destabilizing the other

OpenAPI or equivalent provider contracts can generate broad method coverage,
but they do not by themselves define Nex ingest, channel semantics, or durable
runtime truth. Specs must define both layers explicitly.

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

### 7b. Corpus hygiene and active-doc governance are explicit policy

Corpus cleanup is not a free-form editorial exercise.

When agents or humans are changing the active documentation tree, the intended
target shape should be agreed before broad edits begin.

Rules:

1. root and subtree index docs should explain structure, boundaries, and
   reading posture rather than act as exhaustive registries of every leaf file
2. fully completed board-style workplans should archive as whole directories
   rather than remaining at the active root as closure residue
3. active specs must not contain phase, backport, cutover, deferred-execution,
   or similar implementation-transition language; that material belongs in
   workplans or archive
4. validation indexes should point to durable active validation docs, not live
   sandbox artifact paths, board residue, or ephemeral proof folders
5. when one concept spans multiple active docs, the corpus should designate one
   anchor doc for that concept and supporting docs should defer to it instead of
   restating the same target-state model repeatedly

The filesystem remains searchable truth for leaf discovery.
Indexes exist to reduce ambiguity, not to mirror the whole tree forever.

### 7c. Board lifecycle must be truthful

Board-style workplans are active execution surfaces, not permanent closure
dashboards.

Rules:

1. a board is active only while it still owns real open work
2. a board may keep many completed tickets visible while the broader lane
   remains open
3. once every ticket is complete and no open scope remains, archive the whole
   board directory
4. if the only remaining value is proof or closure context, that context should
   live in validation and archive rather than keeping the board at the active
   root
5. empty shell boards should not remain at the active root:
   - delete them if they never became meaningful execution surfaces
   - archive them only if they carry real historical context worth preserving
6. when one board supersedes another, archive the older board and let the
   successor board or active workplan explain the lineage

Completed boards are historical execution records.
They should stay searchable, but they should not compete with active work at
the root.

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

Workplans may also use a board-style subtype when a lane benefits from atomic
ticket movement and parallel execution:

- folder name should normally end with `-board`
- one folder per execution lane
- one board `README.md` describing purpose, canonical inputs, scope, and the
  active ticket set
- status subfolders such as:
  - `not-started/`
  - `in-progress/`
  - `completed/`
- one `README.md` inside each status subfolder describing the movement rule
- one ticket file per bounded execution unit
- ticket filenames should use a stable short prefix such as `SCW-001` or
  `CAI-003`
- moving the ticket file between status folders is the status change
- the board `README.md` should be linked from the active workplan index like
  any other active workplan

Board-style workplans are still workplans, not a new artifact type.
They exist to make subagent dispatch, status movement, and closure hygiene
cleaner on larger or more parallelizable lanes.

Prefer a board-style workplan when:

- the lane has more than a few bounded implementation units
- different tickets can be dispatched independently to subagents
- status movement matters more than one long narrative workplan
- the lane is likely to stay active across multiple implementation or cleanup
  rounds

Additional board rules:

1. the board `README.md` owns scope, canonical inputs, and the ticket list
2. each ticket file owns one bounded execution unit with goal, scope,
   acceptance, validation, and dependencies
3. completed tickets may remain in the active board while the broader lane is
   still open so closure state stays visible
4. the whole board archives only when the lane is actually complete or
   superseded
5. if a ticket discovers target-state conflict, update the spec before moving
   implementation forward
6. until Dispatch can durably own board state and review artifacts, the repo
   workplan board remains the canonical planning surface even if execution is
   mirrored into Dispatch
7. once Dispatch is ready, the preferred operator-facing execution surface is a
   Dispatch board backed by the same canonical specs, tickets, and validation
   rules rather than a second ad hoc workflow

### `runbooks/`

Live operator procedures and playbooks.

Characteristics:

- current supported procedure, not target-state design
- may reference concrete commands, hosts, paths, and rollback steps
- may reference current operational constraints that are not part of the
  enduring architecture
- should point back to canonical specs and active validation ladders where
  relevant
- should archive when superseded, historical, or campaign-specific

### `validation/`

Active proof contracts, matrices, and supporting scripts that define the
current proof path for canonical behavior.

Characteristics:

- maintained as the proof corpus for active canonical behavior
- updated as specs or proof methods change
- written as thin proof contracts, not narrative proof ledgers
- may remain active after implementation work completes when they are still the
  current proof path for a live behavior
- should name the canonical proof harness, profile, or support script plus
  explicit pass/fail conditions
- should default to a Docker-backed or equivalently containerized layered
  cleanroom, with runtime-managed sandbox end-to-end proof as the default
  active lane once bootstrap and substrate proof already passes
- should explain any host-native or otherwise non-containerized exception
  explicitly in the active validation doc
- should prefer human-shaped golden journeys over low-level shortcuts for
  user-facing or operator-facing flows
- may cite artifact bundles only as supporting evidence, not as the primary
  canonical index

Active validation docs fall into two active subtypes:

1. canonical validation ladders and matrices
   - define the latest proof contract for a still-supported behavior
   - stay active while the behavior remains canonical
2. supporting scripts, harness descriptors, or validation profiles
   - support the active proof contract without replacing it as narrative canon

Historical validation material belongs in archive:

- dated signoff or closure records
- one-off campaign or migration proof
- artifact-ledger docs and proof-bundle indexes
- any validation packet that no longer defines the current proof path

Validation docs for user-facing flows should also distinguish two evidence
layers:

1. primary golden-journey review artifact
   - the main demo proof a human reviewer watches
   - normally one whole-sandbox session recording plus structured receipts
2. secondary debug artifact set
   - traces, per-test logs, screenshots, and optional per-test video
   - kept for diagnosis, not as the first review surface

### `archive/`

Historical material that should remain searchable but not active.

Characteristics:

- superseded specs
- completed workplans
- superseded or historical runbooks
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
    some-workplan.md
    some-board/
      README.md
      not-started/
      in-progress/
      completed/
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
2. `docs/workplans/` contains only active execution plans.
3. board-style workplans may live under `docs/workplans/<board-name>/` when a lane benefits from atomic tickets and folder-based status movement.
4. `docs/runbooks/` contains only active supported procedures and operator playbooks.
5. `docs/validation/` contains only active proof contracts, matrices, and
   support scripts for still-supported behavior.
6. `docs/archive/` contains anything no longer active.
7. If exploratory drafts exist, `docs/proposals/` should exist and those drafts belong there, not in `docs/specs/`.
8. `docs/specs/` must not contain files whose own status is `DRAFT`, `DESIGN`, `seed`, `TODO`, `not started`, or `superseded`.

For board-style workplans:

1. each ticket lives in exactly one status folder
2. moving the ticket file between status folders is the status change
3. each ticket must be atomic enough for one bounded implementation lane
4. each ticket must define acceptance and validation
5. the board README is the index and shared context for all tickets on that lane
6. when the board is fully complete, archive the whole board folder or keep it only until a paired closure ticket retires it

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
- board-style ticket folders when the lane benefits from atomic execution units
- dependency ordering
- implementation phases
- explicit cutovers and deletions

Gate:

- the path from current code to target state is executable

### 6. Design or update the validation ladder

Outputs:

- validation ladders
- supporting scripts
- thin active proof contracts
- reusable proof paths when the implemented behavior materially changes
  runtime-facing or provisioning behavior
  - host-level Docker or VM cleanrooms for bootstrap and substrate proof
  - runtime-managed sandbox campaigns for most feature and integration proof
- explicit pass/fail criteria tied to the specs

Gate:

- there is a concrete layered cleanroom-first way to prove the target state
  works

### 7. Full spec/workplan/archive alignment pass

Outputs:

- stale or superseded docs moved to archive
- active indexes updated
- remaining contradictions resolved
- workplan hygiene pass completed
- validation docs classified as active proof corpus, signoff record, or archive
- active proof lanes aligned to sandbox-e2e-first posture and explicit
  host-native exceptions

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
- a dated signoff or closure record, archived unless it is still the current
  handoff proof surface

Gate:

- the system is proven against the current target-state specs, starting from a
  Docker-backed disposable cleanroom unless the behavior explicitly requires a
  lived-in local runtime

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
3. it is a one-off campaign proof, dated signoff snapshot, or artifact-ledger
   packet and no longer the correct proof path
4. it mainly captures historical evidence rather than the current executable
   proof contract

Do not archive a validation doc merely because:

1. the paired workplan completed
2. the code landed
3. a signoff record already exists while the same active proof contract still
   governs the behavior

### Active Runbook -> Archive

Archive an active runbook when:

1. a newer supported procedure supersedes it
2. the procedure becomes historical, campaign-specific, or no longer supported
3. the underlying behavior leaves the active product or platform surface

---

## Non-Negotiable Outcome

At any point in time, the active documentation tree must answer these questions cleanly:

1. What is the intended system?
2. What work remains to achieve it?
3. How does an operator perform the supported live procedure?
4. How do we prove it works?
5. Which older documents are no longer active?

If the repo cannot answer those questions quickly, the documentation system is out of alignment and must be cleaned up.
