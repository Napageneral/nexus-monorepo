> **Status:** ARCHIVED — V2 track superseded by V3 canonical specs and NEXUS_REQUEST_TARGET.md memory system integration
> **Archived:** 2026-02-27

# Memory V2 Review UI Dashboard Spec

Status: ARCHIVED
Last updated: 2026-02-26
Owner: Memory V2 track

## 1. Customer Experience (Primary Requirement)

This UI exists so the operator can answer these questions fast, with confidence:

1. Did a backfill run succeed operationally?
2. Did retain produce good facts/entities from each episode?
3. Did consolidation produce sensible observations and causal links?
4. Can I trace every output back to source events and attachments?
5. What should I fix next (prompt, adapter ingest, attribution, consolidation)?

If the UI does not reduce review time and increase trust in extraction quality, it fails.

## 2. Current State (What Already Exists)

There is already an implemented Memory Review surface in Control UI:

- Route/tab: `/memory` in Control UI
- Frontend:
  - `/Users/tyler/nexus/home/projects/nexus/nex/ui/src/ui/views/memory.ts`
  - `/Users/tyler/nexus/home/projects/nexus/nex/ui/src/ui/controllers/memory-review.ts`
  - `/Users/tyler/nexus/home/projects/nexus/nex/ui/src/ui/types.ts` (`MemoryReview*` types)
- Backend:
  - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/server-methods/memory-review.ts`
  - Runtime operations in `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/control-plane/runtime-operations.ts`

Currently available:
- Backfill run list
- Per-run episodes
- Per-episode timeline (events + attachments)
- Per-episode outputs (facts/entities/observations/causal links)
- Global text search over facts/entities/observations

## 3. Problem Statement

Current UI is useful, but not yet sufficient for high-confidence quality review at larger scale.

Key gaps:

1. No formal operator workflow spec (what “good” review looks like).
2. No quality-focused issue surfaces (unknown entities, unlinked facts, unconsolidated facts, stale observations).
3. No relationship-first graph exploration (fact ↔ entity ↔ observation ↔ causal).
4. No strong run-to-run comparison view.
5. No standardized acceptance criteria tied to Memory Validation Ladder.

## 4. Hard-Cutover Decisions

1. Canonical review surface is Control UI `/memory` only.
2. No separate legacy review tooling is considered canonical.
3. The review UI must operate directly on ledgers (`nexus.db`, `memory.db`, `identity.db`, `events.db`) through `memory.review.*` methods.
4. Terminology follows Memory V2 specs exactly:
   - run, episode, fact, entity, observation, causal link, attachment.

## 5. Target UX (V1)

### 5.1 Run-Centric Review

Primary screen:
- Runs table with health metrics:
  - episode totals/statuses
  - facts/entities/observations created
  - failures
  - elapsed time

Actions:
- Open run
- Compare run against previous run (same platform/time window)

### 5.2 Episode Inspector (Operator Core View)

For selected episode, show:

1. Episode context
   - platform, thread, time range, event count, token estimate
2. Timeline
   - ordered events with sender, datetime, content, attachments
3. Retain outputs
   - facts with source attribution (`source_episode_id`, `source_event_id`)
   - linked entities per fact
4. Consolidation outputs
   - observations linked to facts
   - causal links

Operator goal: decide quickly whether extraction/consolidation behavior is correct.

### 5.3 Quality Triage Panel

Add run-scoped and global issue buckets:

1. unconsolidated_facts
2. facts_missing_source_episode_id
3. facts_without_entities
4. entities_unknown_or_identifier_like
5. stale_observations_recently_touched
6. episodes_failed

Each bucket must be drillable to concrete rows.

### 5.4 Search + Traverse

Search is not only lexical. It must support review traversal:

1. find entity -> show all linked facts -> show linked observations/causal links
2. find fact -> show source event(s), episode, entities, observations
3. find observation -> show supporting facts and newest head version

## 6. Backend Contract (V1/V1.1)

Keep existing APIs and expand incrementally.

Existing (retain):
- `memory.review.runs.list`
- `memory.review.run.get`
- `memory.review.run.episodes.list`
- `memory.review.episode.get`
- `memory.review.episode.outputs.get`
- `memory.review.search`

Add next:

1. `memory.review.quality.summary`
   - returns counts for all issue buckets in Section 5.3
2. `memory.review.quality.items.list`
   - paginated drill-down by issue bucket
3. `memory.review.entity.get`
   - entity detail + linked facts + linked observations
4. `memory.review.fact.get`
   - fact detail + provenance + links + causality
5. `memory.review.observation.get`
   - observation version chain + supporting facts + episode head linkage

## 7. Data/Query Rules

1. Source of truth is ledger data, no denormalized cache required for V1.
2. All timestamps returned as:
   - raw ms
   - ISO string
3. Episode outputs must include both:
   - flat lists
   - join tables (`fact_entities`, `observation_facts`) for precise traceability
4. Attachments are first-class in timeline payloads (not optional side channel).

## 8. UI Design Rules

1. Optimize for fast review loops, not “pretty dashboard” first.
2. Keep dense table + inspector layout with keyboard-friendly flow.
3. Every aggregate count must be clickable to rows.
4. Every row must link to provenance.
5. No hidden magic scoring in V1; show explicit fields.

## 9. Validation / Acceptance

This UI is accepted only when all conditions are true:

1. A reviewer can complete a full run audit (run -> episode -> outputs -> provenance) without SQL.
2. Reviewer can identify and list issue buckets from Section 5.3 in <5 minutes for a medium run.
3. Cross-link integrity holds:
   - fact -> source episode/event
   - fact -> entities
   - observation -> facts
   - causal link -> facts
4. Metrics in UI match SQL spot checks on ledgers.
5. Works against the same runs produced by:
   - `/Users/tyler/nexus/home/projects/nexus/nex/scripts/dev/memory-validation-ladder.sh`

## 10. Execution Plan

Phase A (baseline hardening)
1. Keep current memory review view as baseline.
2. Add quality summary API + panel.
3. Add issue drill-down view.
4. Add run-to-run compare (basic delta cards).

Phase B (deep inspection)
1. Add entity detail view.
2. Add fact detail view.
3. Add observation detail/version-chain view.

Phase C (operator speed)
1. Keyboard navigation and deep links.
2. Saved filters / query presets.
3. Export selected review findings to markdown/json.

## 11. Out of Scope (for this spec)

1. End-user “memory product” UX.
2. Full graph visualization engine.
3. Automatic fix actions from UI.
4. New memory extraction/consolidation logic changes.

---

This document is the canonical design target for the Memory Review UI track.
