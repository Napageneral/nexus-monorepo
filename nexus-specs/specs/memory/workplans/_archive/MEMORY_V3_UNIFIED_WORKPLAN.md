# Memory V3 — Unified Workplan Index

**Status:** ACTIVE
**Created:** 2026-02-27
**Canonical Specs:** ../MEMORY_SYSTEM.md, ../RETAIN_PIPELINE.md, ../MEMORY_WRITER.md, ../MEMORY_CONSOLIDATION.md, ../MEMORY_RECALL.md, ../UNIFIED_ENTITY_STORE.md, ../skills/*.md

---

## Context

This index replaces all prior workplans and track documents, which are archived V2 execution artifacts. The canonical specs define the target state. These workplans are the single plan to get there.

**Hard cutover policy.** No backwards compatibility, no migrations, no deprecation. We clean house.

---

## Workplan Documents

| Document | What It Covers | Key Changes |
|---|---|---|
| **WORKPLAN_01_SCHEMA_AND_CLI.md** | Schema alignment, CLI audit/migration, recall restructuring | Remove is_stale, fix mental models, gut V1 CLI, add memory tool CLI commands, hybrid recall results |
| **WORKPLAN_02_PIPELINE_AND_PAYLOAD.md** | Episode types, payload format, identity schema | Two episode clipping rules, participants-as-legend (4 identity fields), events use entity_name, contacts schema, drop platform prefix |
| **WORKPLAN_03_AGENT_WORKFLOWS.md** | Entity resolution, consolidation workflow | Agent-driven search-first entity resolution, unified consolidate_facts tool (3 patterns), post-processing retry for missed facts |

---

## Cross-Workplan Dependencies

```
Workplan 01 (Schema + CLI)
  └─ S6 (recall restructuring, canonical_only param) ──→ Workplan 03 W1 (entity resolution)
  └─ S5 (CLI tool commands) ──→ Workplan 03 W2 (consolidate_facts as CLI)

Workplan 02 (Pipeline + Payload)
  └─ P2+P3 (payload format) ──→ Workplan 03 W4 (writer role prompt)
  └─ P4+P5 (identity schema) ──→ Workplan 02 P2 (participant resolution)
```

**Suggested execution order:**
1. Workplan 01: Schema + CLI (foundation)
2. Workplan 02: Pipeline + Payload (data flow)
3. Workplan 03: Agent Workflows (agent behavior)

---

## Key Design Decisions (Summary)

These are captured in detail in the canonical specs. Quick reference:

| Decision | Chosen | Rejected Alternative | Why |
|---|---|---|---|
| event_date storage | Not stored (derived via source_event_id) | Denormalized column | Redundant, sync risk, cross-DB join already happens |
| Staleness tracking | Revision chains (parent_id) | is_stale boolean | Chain is the truth; boolean was redundant denormalization nothing consumed |
| Mental model subtypes | Just `pinned` boolean | subtype field | Over-engineering; pinned covers the only meaningful distinction |
| Entity resolution | Agent-driven, search-first | Tool auto-dedup on name | People share names; agent has context the tool doesn't |
| Platform identifiers | No prefix, compound key | Prefixed identifiers | Compound (platform, contact_id) key already prevents collisions |
| Episode clipping | Two types (90min + 10k tokens) | Larger budget / explicit split-linking | Clean separation; consolidation handles cross-episode stitching |
| Fact marking | Deliberate agent acknowledgment | Fully automatic post-processing | Agent acknowledgment gives quality visibility; post-processing detects gaps |
| Recall results | Hybrid (grouped + ranked) | Flat list with metadata bag / grouped only | Best of both worlds; discriminated union gives type safety |
| Consolidation tool | Unified consolidate_facts (3 patterns) | Separate create/update/skip tools | One tool surface, three behaviors; simpler for agent |

---

## Deferred

- **Review UI Dashboard** — useful but not blocking
- **Vision recall strategies** (temporal, link expansion, MPFP, cross-encoder) — specced but deferred
- **Mental model lifecycle / auto-refresh** — deferred; reflect skill handles freshness at query time
- **Codex throughput benchmarks** — already completed
