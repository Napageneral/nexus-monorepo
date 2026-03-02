# Workplan 03 — Agent Workflows (Writer, Consolidator, Entity Resolution)

**Status:** ACTIVE
**Created:** 2026-02-27
**Specs:** ../MEMORY_WRITER.md, ../MEMORY_CONSOLIDATION.md, ../UNIFIED_ENTITY_STORE.md

---

## Overview

This workplan covers the agent-level workflow changes: how the writer resolves entities, how the consolidator processes facts, and the unified `consolidate_facts` tool. These changes improve the quality and reliability of the agent's work.

**Hard cutover policy.** No backwards compatibility, no migrations.

---

## W1. Entity Resolution: Agent-driven, search-first approach

**Spec:** MEMORY_WRITER.md § Step 4: Resolve Entities.

**Current code:** `create_entity` in `memory-writer-tools.ts` always generates a new ULID and INSERTs. No lookup or search before creation.

**The approach: Two-step entity creation with proactive suggestions.**

`create_entity` automatically searches canonical entities. If similar entities are found, the entity is NOT created — the tool returns the candidates and the agent must call `confirm_entity` to proceed. If no matches, the entity is created immediately with zero friction.

**The flow:**

1. Agent extracts "Ty" from conversation
2. Calls `create_entity("Ty", type="person")`
3. Tool internally runs `recall("Ty", scope=['entities'], canonical_only=true)`
4. **No matches?** → Entity created immediately, ID returned. Done.
5. **Matches found?** → Entity NOT created. Tool returns similar canonical entities.
6. Agent calls `confirm_entity` with decision:
   - `confirm_entity(use_existing="ent_tyler_brandt")` → use existing entity, no new creation
   - `confirm_entity(use_existing="ent_tyler_brandt", alias="Ty")` → create "Ty" alias entity + merge to canonical
   - `confirm_entity(create_new=true, name="Ty", type="person")` → create new entity (agent is sure this is a different person)

**What changes in code:**
1. Add `canonical_only` parameter to recall API (see Workplan 01 § S6)
2. Modify `create_entity` to search canonical entities before creating
   - If no similar results → create and return immediately
   - If similar results → return `status: "pending_confirmation"` with candidate list
3. Add new `confirm_entity` tool/CLI command with three modes:
   - `use_existing` — return existing entity ID
   - `use_existing + alias` — create alias entity + propose_merge
   - `create_new` — force-create the new entity
4. Register both as CLI commands (Workplan 01 § S5)

**What we decided NOT to do and why:**

| Approach | Considered | Verdict |
|---|---|---|
| Automatic lookup-before-create | Tool auto-deduplicates on normalized name | Rejected — people share names. Auto-dedup would merge different people silently. |
| Always create, merge after | Create entity for every mention, handle merging later | Rejected — creates 100k duplicate "Tyler" entities. Entity table becomes noisy. |
| Agent-driven manual search-first | Agent must remember to call recall before every create_entity | Rejected — extra cognitive load, agent might forget. Extra round trips. |
| **Two-step with proactive suggestions (chosen)** | Tool searches automatically, agent makes the judgment call | Chosen — zero friction for new entities, forced deliberation when matches exist. Agent has full context for judgment. No separate search step to forget. |

**Key insight:** Disambiguation is common, not rare. Multiple Tylers, Johns, Sarahs appear frequently in real conversations. The writer must treat this as first-class behavior. The two-step flow ensures the agent always sees the candidates and makes a deliberate choice.

---

## W2. Consolidation: Unified `consolidate_facts` tool

**Spec:** MEMORY_CONSOLIDATION.md § The `consolidate_facts` Tool.

**Current code:** Three separate tools:
- `create_observation` — creates observation, marks cited facts
- `update_observation` — updates observation, marks cited facts
- `mark_facts_consolidated` — marks facts without creating observation

**Replace with one unified tool:**

```
consolidate_facts(
  fact_ids: string[],         // required: which facts this covers
  text?: string,              // optional: observation text
  observation_id?: string     // optional: existing observation to update
)
```

**Three calling patterns:**

1. **New observation** — `consolidate_facts(fact_ids, text)` → creates observation + marks facts
2. **Update existing** — `consolidate_facts(fact_ids, text, observation_id)` → updates observation (new revision in chain) + marks facts
3. **Skip** — `consolidate_facts(fact_ids)` → marks facts consolidated without creating observation

**Implementation:**
1. Create new `consolidate_facts` function that internally dispatches to create/update/skip logic
2. For Pattern 1: Same logic as current `create_observation` (generate ID, insert analysis_run, link fact_ids, generate embedding)
3. For Pattern 2: Same logic as current `update_observation` (resolve head, create new version with parent_id, link fact_ids, generate embedding)
4. For Pattern 3: Same logic as current `mark_facts_consolidated` (mark facts, stale mental models — wait, we're removing staleMentalModelsForFacts)
5. Remove the three old tools
6. Register as CLI command (Workplan 01 § S5)

**This is important for the consolidator role prompt.** The three patterns should be clearly explained with examples. The consolidator must understand: "you MUST handle every fact in the episode through one of these three patterns. Unhandled facts trigger a retry pass."

---

## W3. Consolidation: Post-processing retry for missed facts

**Spec:** MEMORY_CONSOLIDATION.md § Post-Processing and Retry.

**Current code:** No post-processing check for unconsolidated facts.

**New behavior:**

After the consolidator meeseeks completes:

```typescript
// In memory-consolidate-episode.ts, after meeseeks returns:
const unconsolidated = db.prepare(
  'SELECT id FROM facts WHERE source_episode_id = ? AND is_consolidated = FALSE'
).all(episodeId);

if (unconsolidated.length > 0) {
  // Dispatch retry consolidation with focused payload
  dispatchConsolidator(episodeId, {
    fact_ids: unconsolidated.map(f => f.id),
    is_retry: true,
    message: "These facts were not handled in the previous consolidation pass. Process each one now."
  });
} else {
  // All facts handled — record completion
  recordConsolidationComplete(episodeId);
}
```

**Retry rules:**
- Maximum 1 retry (no infinite loops)
- Retry gets the same tools and context, but only the missed fact IDs
- If retry also leaves unconsolidated facts → log as quality issue, move on
- **Consolidation coverage** metric: `consolidated / total` per episode — trackable in analysis_runs

---

## W4. Writer role prompt: Capture payload interpretation guide

**Spec:** RETAIN_PIPELINE.md § Participants as Legend.

**No code change — role prompt content.** The writer's ROLE.md in its workspace should explain:

1. The participants block is the Rosetta Stone — full identity mapping shown once
2. Events use only entity_name for clean readability
3. Four identity fields per participant: `contact_id` (platform ID), `contact_name` (platform display name), `entity_id` (canonical entity ULID), `entity_name` (canonical name)
4. When writing facts, always use the `entity_name` (canonical name), never the `contact_id` or `contact_name`
5. When extracting entities, use `entity_id` from participants to link facts to existing entities — don't create new entities for participants who are already resolved

This is important context that will help the writer interpret the payload correctly and produce higher-quality facts.

---

## W5. Consolidator role prompt: Capture consolidation patterns

**Spec:** MEMORY_CONSOLIDATION.md § The `consolidate_facts` Tool.

**No code change — role prompt content.** The consolidator's ROLE.md should explain:

1. You MUST explicitly handle every fact from the episode
2. Three patterns for `consolidate_facts`:
   - New observation: `consolidate_facts(fact_ids, text)` — when facts form a new cluster worth synthesizing
   - Update existing: `consolidate_facts(fact_ids, text, observation_id)` — when facts extend an existing observation
   - Skip: `consolidate_facts(fact_ids)` — when facts are ephemeral, already captured, or don't warrant synthesis
3. Any unhandled facts will trigger a retry pass — so be thorough
4. Use `resolve_observation_head` before updating to get the current HEAD
5. Use `recall` to find related existing observations before creating new ones

---

## Execution Order

1. **W2** — Build the unified `consolidate_facts` tool (can be done independently)
2. **W3** — Add post-processing retry logic
3. **W1** — Entity resolution (depends on `canonical_only` recall param from Workplan 01)
4. **W4 + W5** — Role prompt updates (after tools are stable)

---

## Open Questions

### Entity creation: Search-first vs tool-level dedup?

The current plan is agent-driven search-first. But there's a variant worth considering:

**Tool-level search-and-suggest:** `create_entity` could internally search canonical entities with the normalized name, and if it finds matches, return them alongside the new entity ID — letting the agent see "I created entity X, but FYI these existing entities look similar: [Y, Z]". This gives the agent information without making the decision for it.

This is NOT blocking — the agent-driven approach works. But it could reduce the number of recall calls the agent needs to make. Worth revisiting after initial implementation.

### is_owner on participants

Current plan: keep `is_owner` flag on participants. It tells the writer whose memory this is (which participant is the system owner). The writer needs this for perspective — "Tyler mentioned he likes coffee" vs "someone mentioned they like coffee."

If this proves unnecessary, it can be dropped later. Low risk to keep.

---

## Validation

- After W2: Test `consolidate_facts` with all three patterns against a test ledger
- After W3: Test that unconsolidated facts trigger a retry, and that the retry processes them
- After W1: Run a backfill with canonical_only entity search and verify entity resolution quality
- After W4+W5: Run a full pipeline (writer → consolidator) and verify facts are properly attributed and consolidated
