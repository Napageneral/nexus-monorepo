# Memory — Elements/Sets/Jobs Implementation Workplan Index

**Status:** ACTIVE
**Created:** 2026-03-01
**Canonical Specs:** ../MEMORY_STORAGE_MODEL.md, ../MEMORY_SYSTEM.md, ../MEMORY_WRITER.md, ../MEMORY_CONSOLIDATION.md, ../RETAIN_PIPELINE.md, ../MEMORY_RECALL.md, ../UNIFIED_ENTITY_STORE.md

---

## Context

The canonical spec is **MEMORY_STORAGE_MODEL.md**. These workplans are the ordered implementation plan to get the codebase from its current state to the spec.

**Hard cutover policy.** No backwards compatibility, no migrations, no deprecation. We clean house.

---

## Workplan Documents

| Document | What It Covers | Severity |
|---|---|---|
| **01_SCHEMA.md** | Full rewrite of `db/memory.ts` — unified elements/sets/jobs schema, FTS5, seed data | Full Rewrite |
| **02_IDENTITY.md** | `db/identity.ts` — `sender_id` → `contact_id` rename, `space_id` usage, ripple through codebase | Moderate |
| **03_WRITER_TOOLS.md** | `memory-writer-tools.ts` — rewrite all tools for elements/sets/jobs, add job wrapping, rename tools | Heavy |
| **04_RECALL.md** | `recall.ts` — unified FTS via `elements_fts`, discriminated union result types, `processing_log` queries | Heavy |
| **05_PIPELINE.md** | `retain-dispatch.ts`, `retain-episodes.ts`, meeseeks automations — sets, job tracking, injection rename | Moderate |
| **06_TESTS.md** | All test files — schema helpers, tool mocks, assertion updates | Moderate |

---

## Phase Dependency Graph

```
Phase 1: Schema (01_SCHEMA.md)
    ↓
    ├── Phase 2: Identity (02_IDENTITY.md)     [parallel-safe with Phase 3]
    │
    ├── Phase 3: Writer Tools (03_WRITER_TOOLS.md)  [parallel-safe with Phase 2]
    │       ↓
    │       └── Phase 5: Pipeline (05_PIPELINE.md)  [depends on Phase 3]
    │
    └── Phase 4: Recall (04_RECALL.md)  [depends on Phase 1]

Phase 6: Tests (06_TESTS.md)  [follows all other phases]
```

**Execution order:**
1. **Phase 1** — Schema rewrite. Foundation for everything. Nothing compiles until this is done.
2. **Phase 2 + Phase 3** — Identity rename + Writer tools. These can be worked in parallel since they touch different files. Phase 3 is heavier.
3. **Phase 4** — Recall rewrite. Depends on the new schema (elements_fts, processing_log queries). Can overlap with late Phase 3 work.
4. **Phase 5** — Pipeline & dispatch. Depends on writer tools being done (job wrapping pattern established there). Includes meeseeks automation updates.
5. **Phase 6** — Tests. Final pass after all production code is stable.

---

## Key Design Decisions (Summary)

Captured in detail in MEMORY_STORAGE_MODEL.md. Quick reference:

| Decision | Chosen | Why |
|---|---|---|
| Unified elements table | Single table with `type` discriminator | FTS/entity-links/version-chains for ALL types; zero schema changes for new types |
| Sets as separate table | Own table, not elements | Different shape (members vs. content); cleaner job input FK |
| Polymorphic set membership | `member_type` discriminator | One junction table vs. three; simpler "what's in this set?" queries |
| Processing log over is_consolidated | `(target_type, target_id, job_type_id)` tuples | Multi-job-type tracking; re-processing via DELETE; provenance via job_id |
| Jobs wrapping meeseeks | Create job row before meeseeks, record outputs after | Adds provenance layer without changing meeseeks dispatch pattern |
| Hard cutover | No migration | Dev/test data not preserved; schema is source of truth |
| Contact rename | `sender_id` → `contact_id`, `sender_name` → `contact_name` | Cleaner naming, aligns with spec terminology |
| Unified FTS | Single `elements_fts` covering all types | Previously only facts had FTS; observations used LIKE |
| Tool renames | `link_fact_entity` → `link_element_entity`, etc. | Reflects generalized element model |
| Episode detection | Hybrid inline token-budget + cron timer for silence window | Inline clips on budget; cron timers for silence; crash recovery on startup |
| Contacts schema | Locked-in with `id` PK, `contact_id`/`contact_name`, `origin` field | `UNIQUE(platform, space_id, contact_id)`; `origin` tracks provenance ('adapter', 'writer', 'manual') |

---

## Archived

Archived workplans are in `_archive/`.

---

## Deferred

- **Review UI Dashboard** — useful but not blocking
- **Vision recall strategies** (temporal, link expansion, MPFP, cross-encoder) — specced but deferred
- **Mental model lifecycle / auto-refresh** — deferred; reflect skill handles freshness at query time
- **CLI tool subcommands** — deferred to after core schema/tool alignment; simple wrappers once functions are extracted
- **Automations/jobs table consolidation** — potential future unification of `hook_invocations` with `jobs`; approved as-is for now

---

## Validation Policy

After each phase:
- `npm run build` — must compile with zero errors
- `npm test` — must pass
- Manual verification against a test ledger where applicable
- Each workplan includes its own specific validation steps
