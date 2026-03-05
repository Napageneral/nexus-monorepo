# Memory Consolidation — Meeseeks Specification

**Status:** CANONICAL
**Last Updated:** 2026-03-02
**Related:** MEMORY_SYSTEM.md, RETAIN_PIPELINE.md, MEMORY_WRITER.md

---

## Overview

The Memory Consolidator is a meeseeks agent that processes the facts extracted from an episode set and connects them into the broader memory graph. It creates observations (elements with `type = 'observation'`), detects causal relationships (element links), and proposes entity merges. It is dispatched when the `episode-retained` hookpoint fires — triggered after the writer completes successfully and produces facts.

Like the writer, the consolidator uses `nexus memory <subcommand>` CLI commands that are always available to all agents. The CLI sends IPC requests to the NEX daemon, which executes the core functions and returns JSON to stdout. Its role prompt provides specific workflow instructions for consolidation.

---

## Role and Purpose

The consolidator's job has two parts:

1. **Tie episode facts into the broader memory graph** — find related existing fact elements and observation elements via recall, create new observations or update existing ones, link facts to observations, detect causal relationships between facts via element links.

2. **Review new entities for potential merges** — compare entities created or referenced during extraction against existing entities, propose merges with reasoning when entities appear to be the same person/thing.

---

## CLI Tools Used

All tools below are invoked as `nexus memory <subcommand>` CLI commands. The function signatures in per-tool specs describe the core contract; the CLI surface maps parameters to `--flag` arguments. See `environment/interface/cli/COMMANDS.md` for the full CLI grammar.

| Tool | Usage in Consolidation Workflow |
|---|---|
| `recall` | Find related facts, observations, entities |
| `consolidate_facts` | The primary consolidation action — see below |
| `resolve_element_head` | Find the latest version of an observation's element chain |
| `insert_element_link` | Record causal relationships between fact elements |
| `propose_merge` | Propose entity merges discovered during consolidation |

### The `consolidate_facts` Tool

This is the consolidator's primary tool. It serves three calling patterns through one interface. Under the unified storage model, facts and observations are both elements (`elements WHERE type = 'fact'` and `elements WHERE type = 'observation'` respectively). The `consolidate_facts` tool creates observation elements, links them to fact elements via `set_members`, and records processing in the `processing_log`.

```
consolidate_facts(
  fact_ids: string[],         // required: which fact element IDs this action covers
  text?: string,              // optional: observation text, if creating/updating one
  observation_id?: string     // optional: existing observation element to update
)
```

**Pattern 1 — New observation:**
```
consolidate_facts(fact_ids=["f1","f2"], text="Tyler prefers morning meetings and blocks his calendar before 10am")
```
Creates a new observation element from the cited fact elements. Records a `processing_log` entry for each fact.

**Pattern 2 — Update existing observation:**
```
consolidate_facts(fact_ids=["f3"], text="Updated: Tyler prefers morning meetings...", observation_id="obs_xxx")
```
Updates the existing observation element (creating a new revision in the element version chain). Records a `processing_log` entry for each fact.

**Pattern 3 — Skip (no observation warranted):**
```
consolidate_facts(fact_ids=["f4","f5"])
```
Records a `processing_log` entry for each fact without creating an observation element. Used when facts are ephemeral, duplicative of existing knowledge, or don't warrant synthesis.

**The consolidator MUST explicitly handle every fact from the episode set.** Each fact element must be passed to `consolidate_facts` in one of the three patterns. This deliberate acknowledgment ensures nothing is silently missed.

---

## Consolidation Workflow

### Step 1: Receive Episode Facts

The consolidator receives the episode set's fact element IDs (written by the writer) and the episode context. The episode set is a `sets` row; fact IDs are derived from the job's `input_set_id` via `set_members`.

### Step 2: Discover Related Knowledge

Use `recall` to search for:
- Existing observation elements related to the episode's fact elements/entities
- Other fact elements that share `element_entities` with the episode's facts
- Prior fact elements that may be causally connected via `element_links`

### Step 3: Process Facts

For each fact element or cluster of related fact elements:

1. **Assess:** Does this fact add to an existing observation, start a new one, or not warrant an observation?
2. If extending an existing observation → `resolve_element_head` to find the current HEAD of the observation element chain, then `consolidate_facts(fact_ids, text, observation_id=HEAD.id)` (Pattern 2)
3. If creating a new observation → `consolidate_facts(fact_ids, text)` (Pattern 1)
4. If no observation warranted → `consolidate_facts(fact_ids)` (Pattern 3)

**Observation head strategy:**
- Default: update the latest head observation element for relevant matches
- Branch only when the new facts are semantically distinct from the current head
- Use recency as a tie-breaker before creating a new branch

### Step 4: Detect Causal Relationships

Look for causal connections between fact elements:
- Temporal sequence with logical causation ("Tyler interviewed at Anthropic" → "Tyler accepted the offer" → "Tyler started at Anthropic")
- Decision chains ("Team decided to use SQLite" → "Migrated from Postgres")
- Consequence relationships ("Project deadline moved up" → "Scope was cut")

Record with `insert_element_link(from_element_id, to_element_id, strength, reason)`.

### Step 5: Propose Entity Merges

Compare entities referenced in the episode set (via `element_entities`) against the broader entity store. If two entities appear to be the same person/thing:
- `propose_merge(entity_a_id, entity_b_id, confidence, reason)`
- High confidence: merge executes immediately
- Lower confidence: recorded as merge candidate for operator review

### Step 6: Done

The consolidator reports completion. Post-processing checks for fact elements without `processing_log` entries.

---

## Post-Processing and Retry

After the consolidator meeseeks completes:

1. **Coverage check:** Query all fact elements for this episode set that lack a `processing_log` entry: `SELECT e.id FROM elements e JOIN set_members sm ON sm.member_id = e.id AND sm.member_type = 'element' WHERE sm.set_id = ? AND e.type = 'fact' AND e.id NOT IN (SELECT target_id FROM processing_log WHERE target_type = 'element' AND job_id = ?)`
2. **If all facts processed:** Success. Mark the consolidation job as complete in `jobs`.
3. **If unprocessed facts remain:** This means the agent missed, skipped, or errored on some facts.
   - Dispatch a **retry consolidation** focused on ONLY the remaining unprocessed fact elements.
   - The retry receives a targeted payload: "These facts were not handled in the previous pass. Process them now."
   - If the retry also fails to process all facts, log as a quality issue and move on (no infinite loop).

**Consolidation coverage** is a trackable quality metric: `processed_facts / total_episode_set_facts`. This surfaces incomplete consolidations for review.

---

## Key Semantics

### One Consolidation Per Episode Set

Each episode set triggers exactly one consolidation job (plus optional retry). The episode set is the cluster unit — no internal topic sub-clustering loop inside the consolidator.

### Idempotency

Consolidation runs are tracked as `jobs`:
- `job_type = 'consolidate_v1'`
- `input_set_id = <episode_set_id>`
- `UNIQUE(type_id, input_set_id)` prevents duplicate runs

A rerun on the same episode set does not create duplicate observation elements or job records.

### Observation Versioning

Observation elements form version chains via `parent_id`. When an observation is updated, the new element version becomes the head. Agents and recall follow the chain to find the current head via `resolve_element_head`. A non-head observation element has a successor — detecting this is how you determine staleness.

> **Design Decision: Deliberate fact acknowledgment vs automatic marking.**
>
> We considered two approaches:
> 1. **Fully automatic post-processing:** After the consolidator finishes, mark ALL episode set facts as processed automatically. Simple, but you lose visibility into what the agent actually processed vs missed.
> 2. **Deliberate agent acknowledgment (chosen):** The agent must explicitly call `consolidate_facts` for every fact element. Post-processing then DETECTS gaps (fact elements without `processing_log` entries) rather than silently filling them. This gives a clean quality metric and enables targeted retry for missed facts.
>
> The `consolidate_facts` tool unifies what was previously three separate tools (`create_observation`, `update_observation`, and `mark_facts_consolidated`) into one clean interface with three calling patterns. The agent's cognitive load is minimal — just include every fact element ID in exactly one `consolidate_facts` call.

---

## Self-Improvement

Like the writer, the consolidator has a dedicated workspace that persists across invocations. It can refine its own consolidation strategies, entity merge heuristics, and observation patterns over time.
