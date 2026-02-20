# Memory Writer V2

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-20
**Supersedes:** ../roles/MEMORY_WRITER.md
**Related:** MEMORY_SYSTEM_V2.md, UNIFIED_ENTITY_STORE.md, ../../runtime/RUNTIME_ROUTING.md

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout. Facts/episodes live in `memory.db`. Entities live in `identity.db`. Embeddings live in `embeddings.db`.

---

## Overview

The Memory-Writer is a meeseeks that transforms NexusEvents into facts and entities. It replaces both the old 7-stage Go pipeline and the Hindsight 10-step retain pipeline with an agentic approach.

**The agent IS the extractor.** There is no `extract_facts()` tool. The agent's role prompt teaches it to read an episode of events, identify facts and entities, resolve entities, and check for duplicates. The tools it uses are for database operations (searching and writing), not for the extraction logic itself.

---

## Trigger

> **Full design:** See `MEMORY_V2_RETAIN_PIPELINE.md` for episode grouping, boundary detection, and the scheduled-event trigger mechanism.

The Memory-Writer is triggered per **episode**, not per event. Events accumulate in their thread/channel, and when an episode boundary is detected (90-minute conversation gap, token budget exceeded, or end-of-day flush), the writer receives:

1. **The full episode** -- an array of NexusEvents in chronological order, with deliveryContext on each
2. **Episode metadata** -- platform, thread_id, event count, token estimate

The same pipeline works for all event types: iMessages, emails, agent turns, Discord messages, etc. The writer's role prompt teaches it how to handle each type. Events are searchable in short-term memory (via recall) before the writer processes them.

---

## Role Design

The Memory-Writer is role-based. Its behavior comes from its ROLE.md prompt, not from hardcoded pipelines.

### What the Role Prompt Teaches

1. **Fact extraction** -- Read the event and surrounding context. Identify atomic facts (durable knowledge, not ephemeral state). Each fact is a natural language sentence.

2. **Entity identification** -- Identify all entities mentioned: people, organizations, projects, locations, concepts. Use specific identifiers from the deliveryContext when available (sender_id, platform handles).

3. **Deduplication** -- Before inserting a fact, search for similar existing facts. If a near-duplicate exists (semantically similar, same time period), skip it.

4. **Entity resolution** -- For each entity, search the entity store for existing matches. Use context, co-occurrence patterns, and the PII extraction pipeline to resolve. When confident, merge. When uncertain, create merge candidates.

5. **Self-improvement** -- The writer learns over time which events are worth processing, which entity resolutions are tricky, and how to optimize its extraction patterns. It can update its own ROLE.md and create helper scripts to refine its approach.

> **Note:** The writer does NOT create causal links or mental models. Causal links are detected by the consolidation pipeline, which sees the full fact graph across episodes and platforms. Mental models are created by the reflect skill. See `MEMORY_SYSTEM_V2.md` and `MEMORY_REFLECT_SKILL.md`.

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

propose_merge(entity_a_id, entity_b_id, confidence, reason)
    Create a merge candidate for review.
    If confidence is above auto-merge threshold, executes the merge directly.
```

These may be exposed as tools, CLI commands, or direct API calls -- the exact mechanism is an implementation detail. The important thing is that the agent has these capabilities.

---

## Workflow

```
Episode boundary detected (conversation gap / token budget / EOD flush)
    |
    v
Memory-Writer receives: episode (array of NexusEvents in chronological order)
    |
    v
Agent reads all events in the episode, noting deliveryContext on each
    |
    v
Agent extracts facts across the episode:
    - Reads the content + conversation flow
    - Identifies atomic durable knowledge (not ephemeral state)
    - Each fact is a natural language sentence
    - Consolidates related information from multiple messages into single facts
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
    v
Agent completes. System runs post-agent steps:
    |
    +---> Generate embeddings for new facts (algorithmic)
    +---> Mark episode events as is_retained=TRUE
    +---> Queue episode-batched consolidation for new facts (background)
```

---

## Consolidation (Background Job)

> **Full design:** See `MEMORY_V2_RETAIN_PIPELINE.md` for the complete consolidation architecture.

Consolidation runs after the Memory-Writer completes an episode. It processes all new facts from that episode together — **episode-batched**, not per-fact. This gives the consolidation prompt full context about related facts from the same conversation.

### How It Works

For each batch of new facts from a completed episode:

1. **Recall related content** -- Search for existing observations related to the new facts.

2. **Cluster facts by topic** -- Group the new facts into topic clusters. Each cluster gets its own observation (or updates an existing one).

3. **For each cluster, find or create knowledge-episode** -- If related content exists:
   - If an existing observation/episode covers this topic: extend the episode (new version, parent_id chain)
   - If no existing episode: create a new knowledge-episode grouping the source events

4. **Run observation analysis** -- Single LLM call per cluster: new facts + existing observation text → create/update actions
   - Extracts durable knowledge, not ephemeral state
   - Handles contradictions with temporal markers ("used to X, now Y")
   - New analysis_run created (parent_id → previous run for history)
   - Observation text stored in `analysis_runs.output_text`

5. **Detect causal links** -- The consolidation pipeline identifies cause-effect relationships across the full fact graph (cross-episode, cross-platform). This is where `causal_links` rows are created — the writer does NOT create them.

6. **Propose cross-platform entity merges** -- When facts from different platforms reference similar entities, consolidation proposes merges.

7. **Mark consolidated** -- Set `is_consolidated = TRUE` on all processed facts.

8. **Trigger mental model refresh** -- If any mental models are configured for auto-refresh after consolidation, queue refresh jobs.

### Consolidation Prompt (from Hindsight, adapted)

The observation analysis type uses a prompt that instructs the LLM to:
- Extract DURABLE KNOWLEDGE from facts, not ephemeral state
- "User moved to Room 203" → "Room 203 exists" (not "User is in Room 203")
- Preserve specific details (names, locations, numbers)
- Handle contradictions: "Alex used to love pizza but now hates it"
- Never merge facts about different people or unrelated topics
- Return empty array if facts contain no durable knowledge

### Execution

Consolidation uses the existing Cortex parallel worker system. Facts from each episode are processed together in a single LLM call per topic cluster. This is more accurate than per-fact consolidation because the model sees related facts together and can create better observations.

---

## Episode Context: What the Writer Receives

The writer receives a full episode: an array of NexusEvents in chronological order. The prompt is framed as "This is a conversation episode containing N messages from [platform]. Extract durable knowledge."

### NexusEvent DeliveryContext

| Field | Example | Use |
|-------|---------|-----|
| `platform` | "discord" | Entity type hint, source_platform metadata |
| `sender_id` | "coolgamer42#1234" | Entity name for sender |
| `sender_name` | "Cool Gamer" | Display name, alias candidate |
| `peer_id` | "server/channel" | Thread context for pulling surrounding messages |
| `peer_kind` | "dm" / "group" / "channel" | Context for extraction |
| `thread_id` | "thread_abc" | Thread grouping |

### Episode as Conversation Context

The full episode provides conversational context. Unlike the old per-event approach (which needed separate "thread context" lookups), the episode already contains the full conversation window. For iMessages: a conversation with a 90-minute gap between episodes. For agent turns: a session or portion of a session. For email: a thread grouped by In-Reply-To headers.

### What Does NOT Flow Through (Currently)

- Agent tool calls and reasoning chains (not currently in the event representation)
- System prompts (filtered out)

> **Future enhancement:** Agent turns have richer metadata (tool_calls, reasoning) that standalone events don't. The event representation should be enriched to include full turn metadata so the writer can extract what was DECIDED. See `MEMORY_V2_RETAIN_PIPELINE.md` "What About Agent Turns?" section. Until then, the writer extracts from the user message + agent response text only.

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

These persist across invocations, making the writer more effective over time.

> **Note:** The writer does NOT create mental models. Mental model CRUD belongs exclusively in the reflect skill (`MEMORY_REFLECT_SKILL.md`). The writer focuses on fact extraction, entity identification, and deduplication.

---

## Differences from Prior Systems

| Aspect | Cortex V1 (Go pipeline) | Hindsight (retain pipeline) | Memory-Writer V2 |
|--------|------------------------|---------------------------|-------------------|
| **Architecture** | 7-stage algorithmic pipeline | 10-step pipeline + background consolidation | Agentic: agent IS the extractor |
| **Extraction** | Hardcoded stages | LLM extraction with fixed prompt | Agent with role prompt (self-improving) |
| **Entity resolution** | Contact import + extracted | 3-signal scorer (name/cooccurrence/temporal) | Agentic: uses context, PII pipeline, co-occurrence |
| **Deduplication** | UNIQUE constraints | Cosine >0.95 in 24hr window | Agent searches and decides |
| **Links** | Relationships table (structured triples) | 4 link types in memory_links at write time | No links at write time; causal links detected by consolidation |
| **Consolidation** | None (observation-log at read time) | Background job per fact, 1 LLM call each | Episode-batched: all facts from episode consolidated together |
| **Input format** | Structured Go types | content + context string | Full episode (array of NexusEvents in chronological order) |
| **Self-improvement** | None | None | ROLE.md, scripts (no mental models — those belong to reflect skill) |

---

## See Also

- `MEMORY_SYSTEM_V2.md` -- Full memory architecture
- `MEMORY_V2_RETAIN_PIPELINE.md` -- Episode-based retain pipeline (episode grouping, filtering, consolidation batching)
- `MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md` -- Recall parity, writer scope changes
- `MEMORY_REFLECT_SKILL.md` -- Deep research and mental model creation (the only path for mental model CRUD)
- `UNIFIED_ENTITY_STORE.md` -- Entity store details
- `../roles/MEMORY_WRITER.md` -- Previous writer spec (superseded)
- `../roles/MEMORY_READER.md` -- Reader spec (to be updated)
- `../../runtime/RUNTIME_ROUTING.md` -- Runtime routing, `propagateMergeToSessions()`, session alias behavior
