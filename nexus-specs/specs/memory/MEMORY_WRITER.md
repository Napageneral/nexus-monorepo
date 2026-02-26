# Memory Writer

**Status:** DESIGN SPEC
**Last Updated:** 2026-02-23
**Supersedes:** ../roles/MEMORY_WRITER.md
**Related:** MEMORY_SYSTEM.md, UNIFIED_ENTITY_STORE.md, ../../runtime/RUNTIME_ROUTING.md

> **Canonical reference:** See [DATABASE_ARCHITECTURE.md](../DATABASE_ARCHITECTURE.md) for the authoritative database layout. Facts/episodes live in `memory.db`. Entities live in `identity.db`. Embeddings live in `embeddings.db`.

---

## Overview

The Memory-Writer is a meeseeks that transforms episode payloads (thread + participants + events) into facts and entities. It replaces both the old 7-stage Go pipeline and the Hindsight 10-step retain pipeline with an agentic approach.

**The agent IS the extractor.** There is no `extract_facts()` tool. The agent's role prompt teaches it to read an episode of events, identify facts and entities, resolve entities, and check for duplicates. The tools it uses are for database operations (searching and writing), not for the extraction logic itself.

---

## Trigger

> **Full design:** See `RETAIN_PIPELINE.md` for episode grouping, boundary detection, and the scheduled-event trigger mechanism.

The Memory-Writer is triggered per **episode**, not per event. Events accumulate in their thread/channel, and when an episode boundary is detected (90-minute conversation gap, token budget exceeded, or end-of-day flush), the writer receives:

1. **The full episode payload** -- thread + participants + events in chronological order
2. **Per-event extraction fields** -- sender, local datetime, content object, reply link, attachments

The same pipeline works for all event types: iMessages, emails, agent turns, Discord messages, etc. The writer's role prompt teaches it how to handle each type. Events are searchable in short-term memory (via recall) before the writer processes them.

---

## Role Design

The Memory-Writer is role-based. Its behavior comes from its ROLE.md prompt, not from hardcoded pipelines.

### What the Role Prompt Teaches

1. **Fact extraction** -- Read the event and surrounding context. Identify atomic facts (durable knowledge, not ephemeral state). Each fact is a natural language sentence.

2. **Entity identification** -- Identify all entities mentioned: people, organizations, groups, projects, locations, concepts. Entities are identities (the "who"), not identifiers (phone numbers, emails, handles). Use participant display names + sender mapping from the payload.

3. **Deduplication** -- Before inserting a fact, search for similar existing facts. If a near-duplicate exists (semantically similar, same time period), skip it.

4. **Entity resolution** -- For each entity, search the entity store for existing matches. Use context, co-occurrence patterns, and the PII extraction pipeline to resolve. When confident, merge. When uncertain, create merge candidates.

5. **Self-improvement** -- The writer learns over time which events are worth processing, which entity resolutions are tricky, and how to optimize its extraction patterns. It can update its own ROLE.md and create helper scripts to refine its approach.

> **Note:** The writer does NOT create causal links or mental models. Causal links are detected by the consolidation pipeline, which sees the full fact graph across episodes and platforms. Mental models are created by the reflect skill. See `MEMORY_SYSTEM.md` and `skills/MEMORY_REFLECT_SKILL.md`.

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
    Params: scope, entity, time_after, time_before, platform, thread_id, thread_lookback_events, max_results, budget
    Used for: deduplication, finding related facts, entity resolution lookups, sparse-thread lookback
```

### Write

```
insert_fact(text, as_of, ingested_at, source_event_id?, metadata?)
    Store a new fact in the facts table.
    Runtime assigns source_episode_id automatically for writer episode sessions.
    source_event_id remains optional for precise single-event attribution.
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
Memory-Writer receives: episode payload (thread + participants + events in chronological order)
    |
    v
Agent reads all events in the episode, using participant/sender mapping on each event
    |
    v
Agent extracts facts across the episode:
    - Reads event content + attachments + conversation flow
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
    +---> Insert fact: insert_fact(text, as_of, source_event_id?, ...)
    |         source_episode_id is attached by runtime automatically
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

Consolidation runs as a background process after the Memory-Writer completes an episode. It performs one consolidation agent invocation per retained episode, matches episode facts against existing observations/facts, and applies create/update/link actions. Observations are stored as `analysis_runs` with `type='observation'`, each chained to its predecessor via `parent_id` for history.

The writer does NOT run consolidation directly -- it only queues the job. The consolidation pipeline runs one agent invocation per retained episode and handles observation create/update decisions, causal link detection, cross-platform entity merge proposals, and mental model refresh triggers.

> **Full design:** See `RETAIN_PIPELINE.md` for the complete consolidation pipeline spec, including batching strategy, observation prompts, and execution details.

---

## Episode Context: What the Writer Receives

The writer receives a contract payload purpose-built for extraction (not raw delivery metadata):

```json
{
  "platform": "imessage",
  "thread": {
    "thread_id": "imessage:+16319056994",
    "thread_name": "Casey Adams",
    "container_type": "direct"
  },
  "participants": [
    {
      "participant_id": "owner",
      "display_name": "Tyler Brandt",
      "is_owner": true,
      "identity_type": "owner"
    },
    {
      "participant_id": "+16319056994",
      "display_name": "Casey Adams",
      "is_owner": false,
      "identity_type": "phone"
    }
  ],
  "events": [
    {
      "event_id": "imessage:...",
      "sender_id": "owner",
      "datetime_local": "Mon, Feb 23, 2026, 09:03:25 PM CST",
      "content": { "type": "text", "value": "Yes" },
      "reply_to_event_id": "imessage:...",
      "attachments": []
    }
  ]
}
```

Extraction rule:
- Facts/entities come from `events[].content` + `events[].attachments` only.
- Thread/sender/platform IDs are context/disambiguation only, not extraction targets.

### Episode as Conversation Context

The full episode provides primary context. For sparse episodes, the writer can use `recall(..., thread_id, thread_lookback_events)` to pull recent prior thread events.

### What Does NOT Flow Through (Currently)

- Agent tool calls and reasoning chains (not currently in the event representation)
- System prompts (filtered out)

> **Future enhancement:** Agent turns have richer metadata (tool_calls, reasoning) that standalone events don't. The event representation should be enriched to include full turn metadata so the writer can extract what was DECIDED. See `RETAIN_PIPELINE.md` "What About Agent Turns?" section. Until then, the writer extracts from the user message + agent response text only.

---

## Adapter-Sourced Entities and Contacts Contract

The memory-writer must cooperate with the delivery pipeline and the contacts/routing system. This section defines the contract.

### Adapter-Sourced Entities Exist in identity.db

When a message arrives from a previously-unknown sender, the delivery pipeline auto-creates:

1. **A person entity** in `identity.db` with:
   - `source = 'adapter'`
   - `type = 'person'` (always — entities are identities, never identifiers)
   - `name` = `sender_name` from the delivery context, or a placeholder like `'Unknown (discord:coolgamer42)'` if no name is available

2. **A contact row** in `identity.db` binding `(platform, space_id, sender_id)` to the entity.

These adapter-sourced entities may be sparse — they might only have a display name. They exist so that the routing system can map a sender to a session immediately, and so that facts can start accumulating against the entity from the first message.

### Discovering and Enriching Adapter-Sourced Entities

When extracting entities from a conversation, the memory-writer **must** check for existing adapter-sourced entities and prefer linking to them over creating new ones. Specifically:

1. **Match on sender.** When the writer identifies an entity from event sender mapping, search for the existing adapter-sourced person entity. The adapter pipeline already created it — look it up by participant display name and contact linkage `(platform, sender_id)`.

2. **Link facts to the existing entity.** If an adapter-sourced entity is found, all extracted facts about that sender should be linked to it via `link_fact_entity()`. Do not create a second entity for the same person.

3. **Update name on real-name discovery.** When the writer learns a real name for a placeholder entity (e.g., a Discord message says "Hey, I'm Tyler" or context makes it clear), the writer should either:
   - Update the existing entity's name directly (if it's a placeholder like "Unknown (discord:coolgamer42)")
   - Or create a new person entity with the real name and merge the placeholder into it via `propose_merge()` with high confidence

### Conversational Contact Discovery

People mention contact information in conversation: "my email is abc@gmail.com", "you can reach me at 555-1234", "my Discord is coolgamer42". When the writer detects this:

1. **Store as a fact about the person.** For example:
   - `insert_fact(text="Tyler's email is abc@gmail.com", ...)` and link to Tyler's entity
   - `insert_fact(text="Sarah's phone number is 555-1234", ...)` and link to Sarah's entity

2. **Do NOT create entities for identifiers.** Phone numbers, email addresses, and handles are not entities. They are attributes of people, stored as facts.

3. **Do NOT create a contact row in `identity.db`.** Contacts in the routing system are created only by actual delivery events (a real message arriving from that address). Conversationally-mentioned contact info is stored as facts about the person entity. The delivery pipeline owns contact creation.

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

> **Note:** The writer does NOT create mental models. Mental model CRUD belongs exclusively in the reflect skill (`skills/MEMORY_REFLECT_SKILL.md`). The writer focuses on fact extraction, entity identification, and deduplication.

---

## Differences from Prior Systems

| Aspect | Memory System V1 (Go pipeline) | Hindsight (retain pipeline) | Memory-Writer V2 |
|--------|------------------------|---------------------------|-------------------|
| **Architecture** | 7-stage algorithmic pipeline | 10-step pipeline + background consolidation | Agentic: agent IS the extractor |
| **Extraction** | Hardcoded stages | LLM extraction with fixed prompt | Agent with role prompt (self-improving) |
| **Entity resolution** | Contact import + extracted | 3-signal scorer (name/cooccurrence/temporal) | Agentic: uses context, PII pipeline, co-occurrence |
| **Deduplication** | UNIQUE constraints | Cosine >0.95 in 24hr window | Agent searches and decides |
| **Links** | Relationships table (structured triples) | 4 link types in memory_links at write time | No links at write time; causal links detected by consolidation |
| **Consolidation** | None (observation-log at read time) | Background job per fact, 1 LLM call each | One consolidation agent invocation per retained episode |
| **Input format** | Structured Go types | content + context string | Contract payload with thread + participants + events |
| **Self-improvement** | None | None | ROLE.md, scripts (no mental models — those belong to reflect skill) |

---

## See Also

- `MEMORY_SYSTEM.md` -- Full memory architecture
- `RETAIN_PIPELINE.md` -- Episode-based retain pipeline (episode grouping, filtering, consolidation batching)
- `workplans/INFRASTRUCTURE_WORKPLAN.md` -- Recall parity, writer scope changes
- `skills/MEMORY_REFLECT_SKILL.md` -- Deep research and mental model creation (the only path for mental model CRUD)
- `UNIFIED_ENTITY_STORE.md` -- Entity store details
- `../../_archive/MEMORY_WRITER.md` -- Previous writer spec (superseded)
- `skills/MEMORY_INJECTION.md` -- Read-path memory injection meeseeks
- `../../runtime/RUNTIME_ROUTING.md` -- Runtime routing, `propagateMergeToSessions()`, session alias behavior
