# Memory System

**Status:** CANONICAL
**Last Updated:** 2026-03-01

---

## Spec Documents

Read in this order:

| Document | What It Covers |
|---|---|
| **MEMORY_SYSTEM.md** | Master architecture: 4 layers, entity dependency, lifecycle, tool architecture |
| **MEMORY_STORAGE_MODEL.md** | Storage schema: elements, sets, jobs — the unified storage model with full SQL, design decisions, and example flows |
| **RETAIN_PIPELINE.md** | Episode lifecycle: grouping, filtering, short-term memory, payload assembly, writer dispatch, post-processing |
| **MEMORY_WRITER.md** | Writer meeseeks: workflow, extraction rules, entity resolution, coreference, temporal handling |
| **MEMORY_CONSOLIDATION.md** | Consolidation meeseeks: observations, causal links, entity merges, automatic post-processing |
| **MEMORY_RECALL.md** | Recall API: retrieval strategies (current + vision), parameters, budget control, fusion, embeddings |
| **UNIFIED_ENTITY_STORE.md** | Identity layer dependency: entities, contacts, merge chains, identifier policy, adapter contact seeding |
| **FACT_GRAPH_TRAVERSAL.md** | Graph traversal patterns for relationship queries |

## Skill Documents

| Document | What It Covers |
|---|---|
| **skills/MEMORY_INJECTION.md** | Pre-execution injection meeseeks: forked from session, two exit paths, post-processing |
| **skills/MEMORY_SEARCH_SKILL.md** | Search skill prompt: hierarchical retrieval, query decomposition, staleness, budget |
| **skills/MEMORY_REFLECT_SKILL.md** | Reflect skill prompt: deep research, mental model creation, evidence guardrails |

## Active Workplans (Elements/Sets/Jobs)

| Document | What It Covers |
|---|---|
| **workplans/INDEX.md** | Index document: phase dependency graph, execution order, design decision summary |
| **workplans/01_SCHEMA.md** | Phase 1: Full rewrite of `db/memory.ts` — unified elements/sets/jobs schema, FTS5, seed data |
| **workplans/02_IDENTITY.md** | Phase 2: `db/identity.ts` — `sender_id` → `contact_id` rename, `space_id` usage, ripple through codebase |
| **workplans/03_WRITER_TOOLS.md** | Phase 3: `memory-writer-tools.ts` — rewrite all tools for elements/sets/jobs, add job wrapping, rename tools |
| **workplans/04_RECALL.md** | Phase 4: `recall.ts` — unified FTS via `elements_fts`, discriminated union result types, `processing_log` queries |
| **workplans/05_PIPELINE.md** | Phase 5: Retain dispatch, meeseeks automations — sets, job tracking, injection rename |
| **workplans/06_TESTS.md** | Phase 6: All test files — schema helpers, tool mocks, assertion updates |

## Archived

All other documents in `workplans/_archive/` and `nex/docs/memory-v2-tracks/` are archived execution artifacts from earlier planning sprints. They are NOT canonical and should NOT be used as a source of truth. The spec documents above and the active workplans are the source of truth.

| Directory | Contents |
|---|---|
| `workplans/_archive/` | Archived workplans from earlier planning sprints |
| `nex/docs/memory-v2-tracks/` | Track 00-11 execution journals covering access parity, prompt design, tool surface, identity normalization, validation ladder, review UI phases, scale validation, throughput benchmarks, parity closeout |
