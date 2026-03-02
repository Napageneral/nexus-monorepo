# Memory Writer — Meeseeks Specification

**Status:** CANONICAL SPEC
**Last Updated:** 2026-03-02
**Related:** MEMORY_SYSTEM.md, RETAIN_PIPELINE.md, MEMORY_CONSOLIDATION.md

---

## Overview

The Memory Writer is a meeseeks agent that reads conversation episodes and extracts durable knowledge as facts and entities. It is forked from the manager agent session, inheriting full situational context. It is dispatched when the `episode-created` hookpoint fires — triggered when an episode clips via token budget or silence timer.

The writer uses `nexus memory <subcommand>` CLI commands that are always available to all agents. What makes the writer special is its **role prompt** — detailed instructions for the extraction workflow, not a unique tool surface.

---

## Episode Payload

The episode payload is the contract between the retain pipeline and the writer. It includes the episode's events and a participants block identifying the people in the conversation.

Each participant object in the payload:

```json
{
    "contact_id": "+16319056994",
    "contact_name": "Casey A.",
    "entity_id": "ent_casey_adams",
    "entity_name": "Casey Adams"
}
```

- `contact_id` — the platform-local identifier for the contact (phone number, email, handle)
- `contact_name` — the display name from the contact record (may be abbreviated)
- `entity_id` — the canonical entity ID, if the contact has been resolved to an entity
- `entity_name` — the full canonical entity name

The writer uses `contact_name` and `entity_name` for coreference resolution — mapping pronouns and generic references in message content back to named individuals.

---

## Role and Purpose

The writer's job is narrow and focused:
1. Read the episode's events
2. Extract entities from message content
3. Extract durable facts from the episode
4. Resolve entities against the existing memory store
5. Write facts with entity links
6. Done

The writer does NOT:
- Generate embeddings (algorithmic post-processing)
- Run consolidation (separate meeseeks)
- Create episodes (pipeline handles this)
- Create causal links (consolidation meeseeks)
- Create or update mental models (Reflect skill)
- Create observations (consolidation meeseeks)
- Mark events as retained (post-processing)

---

## CLI Tools Used

These tools are always available to all agents as `nexus memory <subcommand>` CLI commands. The CLI sends IPC requests to the NEX daemon, which executes the core function and returns JSON to stdout. The function signatures below describe the core contract; the CLI surface maps parameters to `--flag` arguments. See `environment/interface/cli/COMMANDS.md` for the full CLI grammar.

| Tool | Usage in Writer Workflow |
|---|---|
| `recall` | Context gathering, thread lookback |
| `insert_fact` | Store extracted facts |
| `create_entity` | Create entity — auto-searches canonical entities, returns suggestions if similar exist |
| `confirm_entity` | Confirm entity decision when create_entity finds matches |
| `link_element_entity` | Link facts to entities |
| `propose_merge` | Propose entity merges when confident |
| `write_attachment_interpretation` | Store interpretation of an attachment |
| `read_attachment_interpretation` | Read existing interpretation of an attachment |

---

## Writer Workflow

### Step 1: Read the Episode

Read all events in the episode. Understand the conversation flow, who is talking, and what was discussed.

Use the participants list and sender names to understand who each person is. The payload provides canonical display names for known contacts.

### Step 2: Extract Entities

Identify all entities mentioned in **message content** (NOT from metadata).

Entity types:
- **People** — full names when known, otherwise best identifier
- **Organizations** — companies, teams, departments
- **Groups** — named groups with membership
- **Projects/Products** — named initiatives
- **Locations** — cities, venues, addresses (when significant)
- **Concepts** — only when topic-defining ("machine learning", "wedding planning")

**Entities are identities, not identifiers.** Do NOT create entities for phone numbers, email addresses, or platform handles. These are contact bindings stored in the identity layer. When someone mentions a phone number or email in conversation, store it as a fact about the person (e.g., "Tyler's email is tyler@example.com"), not as a separate entity.

### Step 3: Extract Durable Facts

Extract facts worth remembering long-term from the episode's message content and attachments.

**The Test:** "Would this be useful to recall in 6 months?" If no, skip it.

**Extract:**
- Personal info: names, relationships, roles, background
- Preferences: likes, dislikes, habits, interests
- Significant events: milestones, decisions, achievements, life changes
- Plans and goals: future intentions, deadlines, commitments
- Expertise: skills, knowledge, certifications
- Important context: projects, problems, constraints, decisions
- Sensory and emotional details that characterize experiences or people
- Identity information mentioned in conversation (phone numbers, emails, addresses)
- Information from attachments that contributes durable context

**Do NOT extract:**
- Generic greetings and pleasantries
- Filler: "thanks", "ok", "got it", "sure"
- Process chatter: "let me check", "one moment"
- Ephemeral state: current location, what someone is doing right now
- The literal content of tool calls or code blocks (extract what was DECIDED, not the implementation)

**Fact format:** Each fact is a single natural language sentence. Concise but complete. Include WHO, WHAT, and WHEN when available. Consolidate related information into one fact when possible.

**Critical rule: Always use entity names.** Every fact must reference people by name, never by pronouns or generic terms. No "a contact said...", no "the sender mentioned...", no "they discussed..." — always "Casey asked Tyler about..." or "Emily said she would..."

### Step 4: Resolve Entities

Entity resolution uses a **two-step tool flow** that proactively surfaces similar entities for the agent to decide on.

**Step 4a: Call `create_entity` for each extracted entity.**

`create_entity` automatically searches canonical entities for similar matches. Two outcomes:

- **No similar entities found** → entity is created immediately, ID returned. Zero friction.
- **Similar canonical entities found** → entity is NOT created. The tool returns the similar entities and requires the agent to call `confirm_entity` to proceed.

**Step 4b: When similar entities are found, call `confirm_entity` with your decision.**

Three options:
- `confirm_entity(use_existing=<entity_id>)` — this is the same person/thing, use the existing entity
- `confirm_entity(use_existing=<entity_id>, alias=<name>)` — this is the same person by a different name; creates the alias entity AND merges it to the canonical
- `confirm_entity(create_new=true, name=<name>, type=<type>)` — this is genuinely a different entity with a similar name; create it

**Disambiguation guidance:**

- **Co-occurrence context:** If "Sarah" always appears alongside engineering entities, and you see "Sarah" in an engineering context, it's probably the same Sarah.
- **Conversation context:** The participants list, the platform, and the topic all help disambiguate.
- **Name variations:** "Ty", "Tyler", "Tyler Brandt" may all be the same person — or not.

**Disambiguation is common, not an edge case.** You may know multiple people named Tyler, John, Sarah, etc. Always use the conversation context (thread, participants, topic, prior facts) to determine which person is being referenced. Don't default to "it's probably the same person" — do the work.

> **Design Decision: Two-step entity creation with proactive suggestions.**
>
> We considered three approaches:
> 1. **Automatic lookup-before-create:** Tool auto-deduplicates on normalized name. Rejected — people share names, auto-dedup would merge different people.
> 2. **Agent-driven search-first:** Agent must manually call recall before every create_entity. Rejected — adds cognitive load (agent must remember to search), extra round trips, and the agent might skip the search.
> 3. **Proactive suggestions (chosen):** `create_entity` automatically searches and returns similar entities when found. The agent is forced to make a deliberate decision but doesn't have to remember to search. When no matches exist, it's frictionless (single call). The tool handles the search, the agent handles the judgment.
>
> The `confirm_entity` step ensures no entity is silently created when there might be a match. This prevents entity fragmentation while keeping the agent in control of resolution decisions.

### Step 5: Write Facts and Link Entities

For each fact:
1. `insert_fact(text, as_of, source_event_id?, metadata?)`
   - `source_episode_id` is auto-injected by runtime — do not set manually
   - Set `as_of` to when the thing actually happened (resolve relative dates)
   - `ingested_at` is set by runtime automatically
2. `link_element_entity(fact_id, entity_id)` for each entity in the fact

### Step 6: Done

If no durable facts were found in the episode, that's fine. The writer can complete with zero writes for trivial episodes (greetings, filler, automated messages).

---

## Coreference Resolution

This is crucial for fact quality. When conversation text uses generic references alongside names, the writer MUST resolve them:

- "my roommate" + "Emily" in participants → use "Emily" in facts
- "the manager" + "Sarah" in prior context → use "Sarah"
- "he said" when sender is known from event metadata → use the person's name

The metadata (participants list with display names, sender information) is specifically useful here — it tells the writer who the people in the conversation are. Use metadata for disambiguation, extract from content.

**Rule: Never extract a fact using a pronoun or generic term when you can identify the person by name.**

---

## Thread Lookback

For sparse episodes (1-2 messages, replies building on prior conversation), the writer needs context from immediately prior events/episodes to understand what's being discussed.

The `recall` tool supports thread-aware lookback:
- `recall("conversation context", thread_lookback_events=8)` — peek at the 8 most recent prior events in the same thread
- `recall("prior messages", thread_id=<thread_id>, thread_lookback_events=12)` — explicit thread + lookback count

This is essential for making sense of messages like "sounds good, let's do it" — meaningless without knowing what "it" refers to. The writer should use thread lookback whenever an episode is sparse or conversational context is ambiguous.

---

## Attachment Interpretation

When episodes contain events with attachments (images, documents, audio), the writer can store and retrieve interpretations using `write_attachment_interpretation` and `read_attachment_interpretation`.

The `attachments` table uses a composite primary key `(event_id, id)`. The `attachment_interpretations` table has primary key `(event_id, attachment_id)` with a composite foreign key referencing `attachments(event_id, id)`.

- `read_attachment_interpretation(event_id, attachment_id)` — check if an interpretation already exists for this attachment
- `write_attachment_interpretation(event_id, attachment_id, interpretation)` — store the writer's interpretation of the attachment content

Interpretations capture what the attachment contains and contribute to fact extraction. If an attachment has already been interpreted (e.g., by a prior writer run), the existing interpretation can be read and used without reprocessing.

---

## Temporal Handling

The writer is responsible for setting `as_of` correctly:

- **`as_of`** — When the thing actually happened. For events with a specific date ("Emily's wedding was June 15, 2025"), use that date. For general conversation facts ("Tyler likes coffee"), use the event's timestamp. For relative dates ("yesterday", "last week"), resolve to absolute using the event's `datetime_local` as reference.

- **`ingested_at`** — Set by runtime automatically.

- **Event timestamp** — not stored on the fact. Derived via `source_event_id` → `events.timestamp` when needed for "what was discussed when" queries.

The writer doesn't need to worry about event_date or ingested_at — just set `as_of` correctly and optionally provide `source_event_id` for provenance.

---

## Platform-Specific Guidance

### iMessage / SMS
- Messages are short. Thread lookback is essential for context.
- Phone numbers mentioned in conversation are facts about people, not entities.
- Participants should have display names from contact seeding.

### Discord
- Messages are short and informal. Threads provide important context.
- Server/container structure tells you the community context.
- Discord handles are platform-local identifiers (not entities).

### Email (Gmail)
- Subject line often contains the key topic.
- Email threads can be long — focus on what's new in this message.
- CC/BCC lists reveal organizational relationships.
- Email addresses mentioned in conversation are facts about people, not entities.

### Agent Turns
- You receive the full turn: user message + agent response + tool calls.
- Extract what was DECIDED or LEARNED, not the mechanics.
- Don't extract the agent's reasoning steps or tool invocations as facts.

---

## Self-Improvement

The writer has a dedicated workspace directory that persists across invocations. After completing a run, the writer can update its workspace to improve future performance:

- **ROLE.md** — refine extraction strategies as it learns what works
- **Helper scripts** — common patterns, entity disambiguation rules, platform-specific extraction patterns, false positive patterns to avoid

These updates persist across invocations. This is a specced capability — the mechanics are in place but need testing and refinement.
