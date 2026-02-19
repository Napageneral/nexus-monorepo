# Memory Writer V2

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-18
**Supersedes:** ../roles/MEMORY_WRITER.md
**Related:** MEMORY_SYSTEM_V2.md, UNIFIED_ENTITY_STORE.md, ../../runtime/RUNTIME_ROUTING.md

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout. Facts/episodes live in `memory.db`. Entities live in `identity.db`. Embeddings live in `embeddings.db`.

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
    Params: scope, entity, time_after, time_before, platform, max_results, budget
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
| `platform` | "discord" | Entity type hint, source_platform metadata |
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

## Delivery-Sourced Entities and Contacts Contract

The memory-writer must cooperate with the delivery pipeline and the contacts/routing system. This section defines the contract.

### Delivery-Sourced Entities Exist in identity.db

When a message arrives from a previously-unknown sender, the delivery pipeline auto-creates an entity in the unified entity store (`identity.db`) with:

- `source = 'delivery'`
- `type` = a platform-specific handle type (e.g., `discord_handle`, `phone`, `email`)
- `name` = the raw handle (e.g., `tyler#1234`, `+15551234567`, `alice@example.com`)

These entities are **sparse** -- they contain only the platform handle as a name. They have no facts, no observations, no enrichment. They exist so that the routing system can map a sender to a session immediately, before the memory-writer has ever seen a message from that sender.

### Discovering and Enriching Delivery-Sourced Entities

When extracting entities from a conversation, the memory-writer **must** check for existing delivery-sourced entities and prefer linking to them over creating new ones. Specifically:

1. **Match on handle.** When the writer identifies an entity from a deliveryContext (e.g., `sender_id = "tyler#1234"` on a Discord platform), it should search the entity store for a delivery-sourced entity with a matching handle before creating a new entity. Use `recall(sender_id, scope=['entities'])` or equivalent.

2. **Link facts to the existing entity.** If a delivery-sourced entity is found, all extracted facts about that sender should be linked to it via `link_fact_entity()`. Do not create a second entity for the same handle.

3. **Promote to person on real-name discovery.** When the writer learns a real name for a handle (e.g., a Discord message says "Hey, I'm Tyler" or context makes it clear), the writer should:
   - Create a new entity with `type = 'person'`, `source = 'inferred'`, `name = 'Tyler'`
   - Merge the delivery-sourced handle entity into the new person entity via `propose_merge()` with high confidence
   - The handle becomes an alias on the canonical person entity

### Conversational Contact Discovery

People mention contact information in conversation: "my email is abc@gmail.com", "you can reach me at 555-1234", "my Discord is coolgamer42". When the writer detects this:

1. **Create an entity for the mentioned contact info.** For example:
   - `create_entity(name="abc@gmail.com", type="email", source="inferred")`
   - `create_entity(name="555-1234", type="phone", source="inferred")`

2. **Merge into the sender's canonical entity.** The mentioned contact info belongs to the person who said it (or the person it was said about, from context). Use `propose_merge()` to merge the contact entity into their canonical entity.

3. **Do NOT create a contact row in `identity.db`.** Contacts in the routing system are created only by actual delivery events (a real message arriving from that address). Conversationally-mentioned contact info enriches the entity in `identity.db` but does not create a routable contact. The delivery pipeline owns contact creation.

### CRITICAL: Propagate Merges to Sessions

**After every entity merge, the writer MUST call `propagateMergeToSessions()`.** This is not optional. Without this call, session routing breaks -- the old entity's sessions become orphaned, and messages from the merged handle will create new sessions instead of continuing existing ones.

```
propagateMergeToSessions(winnerId, loserId)
    Synchronously creates session aliases in agents.db so that
    all sessions previously associated with loserId are now
    reachable via winnerId. This ensures routing continuity
    after an entity merge.
```

This function lives in the runtime routing layer. See `../../runtime/RUNTIME_ROUTING.md` for the full function signature, behavior, and guarantees.

The call must happen **synchronously** as part of the merge operation, not as a background job. If `propagateMergeToSessions()` fails, the merge itself should be rolled back or retried.

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
- `../../runtime/RUNTIME_ROUTING.md` -- Runtime routing, `propagateMergeToSessions()`, session alias behavior
