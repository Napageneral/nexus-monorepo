# Memory Writer V2

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-16
**Supersedes:** ../roles/MEMORY_WRITER.md
**Related:** MEMORY_SYSTEM_V2.md, UNIFIED_ENTITY_STORE.md

---

## Overview

The Memory-Writer is a meeseeks that transforms NexusEvents into facts, entities, and causal links. It replaces both the old 7-stage Go pipeline and the Hindsight 10-step retain pipeline with an agentic approach.

**The agent IS the extractor.** There is no `extract_facts()` tool. The agent's role prompt teaches it to read events, identify facts and entities, resolve entities, check for duplicates, and identify causal relationships. The tools it uses are for database operations (searching and writing), not for the extraction logic itself.

---

## Trigger

The Memory-Writer fires on an `eventIngested` hook. When an event arrives in the Events Ledger, the writer is triggered with:

1. **The event itself** -- full NexusEvent with deliveryContext
2. **Thread context** -- the last N events from the same thread/session for conversational context

The same hook works for all event types: iMessages, emails, agent turns, Discord messages, etc. The writer's role prompt teaches it how to handle each type.

---

## Role Design

The Memory-Writer is role-based. Its behavior comes from its ROLE.md prompt, not from hardcoded pipelines.

### What the Role Prompt Teaches

1. **Fact extraction** -- Read the event and surrounding context. Identify atomic facts (durable knowledge, not ephemeral state). Each fact is a natural language sentence.

2. **Entity identification** -- Identify all entities mentioned: people, organizations, projects, locations, concepts. Use specific identifiers from the deliveryContext when available (sender_id, platform handles).

3. **Deduplication** -- Before inserting a fact, search for similar existing facts. If a near-duplicate exists (semantically similar, same time period), skip it.

4. **Entity resolution** -- For each entity, search the entity store for existing matches. Use context, co-occurrence patterns, and the PII extraction pipeline to resolve. When confident, merge. When uncertain, create merge candidates.

5. **Causal link identification** -- Look for cause-effect relationships between the new facts and between new and existing facts. Causal language includes: "because", "therefore", "led to", "resulted in", "caused by", "due to", "as a result of". When in doubt, don't create a link -- false causal links are worse than missing ones.

6. **Self-improvement** -- The writer learns over time which events are worth processing, which entity resolutions are tricky, and how to optimize its extraction patterns. It can create its own mental models to assist with future extraction.

### What the Role Prompt Does NOT Do

- Does not generate embeddings (algorithmic, post-agent)
- Does not run consolidation (separate background job)
- Does not create episodes (separate algorithmic process + consolidation)
- Does not compute temporal/semantic/entity links (read-time)

---

## Tools

The Memory-Writer has access to a small set of database operation tools:

### Search (Read)

```
recall(query, params)
    The unified memory search API.
    Params: scope, entity, time_after, time_before, channel, max_results, budget
    Used for: deduplication, finding related facts, entity resolution lookups
```

### Write

```
insert_fact(text, as_of, ingested_at, source_event_id, metadata)
    Store a new fact in the facts table.
    Returns: fact_id

create_entity(name, type, normalized, source)
    Create a new entity in the entity store.
    Returns: entity_id

link_fact_entity(fact_id, entity_id)
    Create a junction entry linking a fact to an entity.
    Also updates entity_cooccurrences for all entity pairs in the fact.

insert_causal_link(from_fact_id, to_fact_id, strength)
    Store a causal relationship between two facts.

propose_merge(entity_a_id, entity_b_id, confidence, reason)
    Create a merge candidate for review.
    If confidence is above auto-merge threshold, executes the merge directly.
```

These may be exposed as tools, CLI commands, or direct API calls -- the exact mechanism is an implementation detail. The important thing is that the agent has these capabilities.

---

## Workflow

```
Event arrives via eventIngested hook
    |
    v
Memory-Writer receives: NexusEvent + thread context (last N events)
    |
    v
Agent reads event content and deliveryContext
    |
    v
Agent extracts facts:
    - Reads the content + surrounding context
    - Identifies atomic durable knowledge (not ephemeral state)
    - Each fact is a natural language sentence
    |
    v
For each fact:
    |
    +---> Dedup check: recall(fact_text, time_range=nearby)
    |     If duplicate found -> skip
    |
    +---> Entity extraction: identify entities in the fact
    |     For each entity:
    |         Search entity store: recall(entity_name, scope=['entities'])
    |         If match found -> use existing entity_id
    |         If no match -> create_entity(name, type)
    |         If ambiguous -> propose_merge() or create new + merge_candidate
    |
    +---> Insert fact: insert_fact(text, as_of, source_event_id, ...)
    |
    +---> Link entities: link_fact_entity(fact_id, entity_id) for each entity
    |
    +---> Causal analysis: look for cause-effect relationships
          With other new facts from this batch
          With existing facts found during dedup search
          insert_causal_link(cause_fact, effect_fact, strength)
    |
    v
Agent completes. System runs post-agent steps:
    |
    +---> Generate embeddings for new facts (algorithmic)
    +---> Queue consolidation job for new facts (background)
```

---

## Consolidation (Background Job)

Consolidation runs after the Memory-Writer completes. It processes facts with `is_consolidated = FALSE` and synthesizes them into observations.

### How It Works

For each unconsolidated fact:

1. **Recall related content** -- Search for existing observations and facts related to this fact's text.

2. **Evaluate worthiness** -- Not every fact merits an observation. If no related facts exist and the fact is isolated, mark it as consolidated and move on. Only create observations when facts cluster together meaningfully.

3. **Find or create knowledge-episode** -- If related content exists:
   - If an existing observation/episode covers this topic: extend the episode (new version, parent_id chain) with the source events behind this fact
   - If no existing episode: create a new knowledge-episode grouping the related source events

   4. **Run observation analysis** -- Execute the observation analysis type against the episode:
   - Single LLM call: new fact + existing observation text -> create/update actions
   - Extracts durable knowledge, not ephemeral state
   - Handles contradictions with temporal markers ("used to X, now Y")
   - New analysis_run created (parent_id -> previous run for history)
   - Observation text stored in `analysis_runs.output_text` (no facet needed)

5. **Mark consolidated** -- Set `is_consolidated = TRUE` on the fact.

6. **Trigger mental model refresh** -- If any mental models are configured for auto-refresh after consolidation, queue refresh jobs.

### Consolidation Prompt (from Hindsight, adapted)

The observation analysis type uses a prompt that instructs the LLM to:
- Extract DURABLE KNOWLEDGE from facts, not ephemeral state
- "User moved to Room 203" -> "Room 203 exists" (not "User is in Room 203")
- Preserve specific details (names, locations, numbers)
- Handle contradictions: "Alex used to love pizza but now hates it"
- Never merge facts about different people or unrelated topics
- Return empty array if fact contains no durable knowledge

### Execution

Consolidation uses the existing Cortex parallel worker system. Each fact is processed independently -- no batching of multiple facts into one LLM call. This makes it simple, parallelizable, and crash-recoverable.

If we want to make consolidation agentic later, each fact can be forked as a lightweight meeseeks. For now, simple LLM extraction is sufficient.

---

## Event Context: What the Writer Receives

### NexusEvent DeliveryContext

| Field | Example | Use |
|-------|---------|-----|
| `channel` | "discord" | Entity type hint, source_channel metadata |
| `sender_id` | "coolgamer42#1234" | Entity name for sender |
| `sender_name` | "Cool Gamer" | Display name, alias candidate |
| `peer_id` | "server/channel" | Thread context for pulling surrounding messages |
| `peer_kind` | "dm" / "group" / "channel" | Context for extraction |
| `thread_id` | "thread_abc" | Thread grouping |

### Thread Context

The last N events from the same thread/session. Gives the writer conversational context for better extraction. For iMessages: the recent messages in the conversation. For agent turns: the recent turns in the session.

### What Does NOT Flow Through

- Agent tool calls and reasoning chains (not available as events)
- System prompts (filtered out)
- For richer agent session extraction: future enhancement to fork the agent session ledger

---

## Self-Improvement

The Memory-Writer meeseeks follows the standard meeseeks self-improvement pattern:

- **ROLE.md** -- Can be updated by the writer to refine extraction strategies
- **Scripts** -- Can create helper scripts for common patterns
- **Mental models** -- Can create its own mental models that assist with entity resolution and extraction (e.g., "Known entity disambiguation rules", "Common false positive patterns")

These persist across invocations, making the writer more effective over time.

---

## Differences from Prior Systems

| Aspect | Cortex V1 (Go pipeline) | Hindsight (retain pipeline) | Memory-Writer V2 |
|--------|------------------------|---------------------------|-------------------|
| **Architecture** | 7-stage algorithmic pipeline | 10-step pipeline + background consolidation | Agentic: agent IS the extractor |
| **Extraction** | Hardcoded stages | LLM extraction with fixed prompt | Agent with role prompt (self-improving) |
| **Entity resolution** | Contact import + extracted | 3-signal scorer (name/cooccurrence/temporal) | Agentic: uses context, PII pipeline, co-occurrence |
| **Deduplication** | UNIQUE constraints | Cosine >0.95 in 24hr window | Agent searches and decides |
| **Links** | Relationships table (structured triples) | 4 link types in memory_links at write time | Only causal links at write time |
| **Consolidation** | None (observation-log at read time) | Background job per fact, 1 LLM call each | Background job, existing parallel worker |
| **Input format** | Structured Go types | content + context string | Full NexusEvent + thread context |
| **Self-improvement** | None | None | ROLE.md, scripts, mental models |

---

## See Also

- `MEMORY_SYSTEM_V2.md` -- Full memory architecture
- `UNIFIED_ENTITY_STORE.md` -- Entity store details
- `../roles/MEMORY_WRITER.md` -- Previous writer spec (superseded)
- `../roles/MEMORY_READER.md` -- Reader spec (to be updated)
