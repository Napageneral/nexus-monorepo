# Memory — Elements/Sets/Jobs Implementation Workplan Index

**Status:** ✅ COMPLETE
**Created:** 2026-03-01
**Canonical Specs:** ../MEMORY_STORAGE_MODEL.md, ../MEMORY_SYSTEM.md, ../MEMORY_WRITER.md, ../MEMORY_CONSOLIDATION.md, ../RETAIN_PIPELINE.md, ../EPISODE_DETECTION.md, ../MEMORY_RECALL.md, ../UNIFIED_ENTITY_STORE.md

---

## Context

The canonical spec is **MEMORY_STORAGE_MODEL.md**. These workplans are the ordered implementation plan to get the codebase from its current state to the spec.

**Hard cutover policy.** No backwards compatibility, no migrations, no deprecation. We clean house.

---

## Active Workplans

None — all workplans complete.

## Completed (Archived)

| Document | What It Covered | Archived |
|---|---|---|
| `_archive/01_SCHEMA.md` | Full rewrite of `db/memory.ts` — 14-table Elements/Sets/Jobs schema | ✅ |
| `_archive/02_IDENTITY.md` | `db/identity.ts` — contacts rewrite, `sender_id`→`contact_id`, `source`→`origin` | ✅ |
| `_archive/03_WRITER_TOOLS.md` | `memory-writer-tools.ts` — 12 tool rewrites for elements/sets/jobs | ✅ |
| `_archive/04_RECALL.md` | `recall.ts` — unified FTS, discriminated union types, `processing_log` queries | ✅ |
| `_archive/05_PIPELINE.md` | `retain-dispatch.ts`, `retain-episodes.ts`, meeseeks automations — sets, job tracking, injection rename | ✅ |
| `_archive/06_TESTS.md` | All test files — cron service deps, schema helpers, assertion updates | ✅ |
| `_archive/07_EPISODE_DETECTION.md` | CronService JSON→SQLite migration, episode detection via cron timers, delete pending_retain_triggers | ✅ |

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

Phase 7: Episode Detection (07_EPISODE_DETECTION.md)  [depends on Phase 5]
    Part A: CronService JSON→SQLite migration
    Part B: Episode detection via cron timers, delete pending_retain_triggers
```

**Execution order:**
1. **Phase 1** — Schema rewrite. Foundation for everything. Nothing compiles until this is done.
2. **Phase 2 + Phase 3** — Identity rename + Writer tools. These can be worked in parallel since they touch different files. Phase 3 is heavier.
3. **Phase 4** — Recall rewrite. Depends on the new schema (elements_fts, processing_log queries). Can overlap with late Phase 3 work.
4. **Phase 5** — Pipeline & dispatch. ✅ Complete. Sets, job tracking, injection rename, hookpoints all done. D11 deferred to Phase 7.
5. **Phase 7** — Episode detection & CronService migration. Depends on Phase 5 for set creation helpers. Two parts: CronService SQLite migration (Part A), then episode detection rewrite (Part B).
6. **Phase 6** — Tests. Final pass after all production code is stable.

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
| Episode detection | Per-episode CronService timers + inline token-budget check | Cron emits `episode.timeout` internal event; no polling; crash recovery via `runMissedJobs()`; see EPISODE_DETECTION.md |
| CronService storage | SQLite `cron_jobs` table in runtime.db | Replaces JSON file; enables high-frequency upserts for episode timers; one table replaces `pending_retain_triggers` |
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
