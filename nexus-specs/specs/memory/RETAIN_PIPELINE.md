# Retain Pipeline — Episode Lifecycle

**Status:** CANONICAL SPEC
**Last Updated:** 2026-03-02
**Related:** MEMORY_SYSTEM.md, MEMORY_WRITER.md, MEMORY_CONSOLIDATION.md

---

## Overview

The retain pipeline transforms raw events into extracted knowledge by grouping events into episodes, dispatching writer agents to extract facts, and then triggering consolidation. It handles both live event processing and historical backfill through a unified architecture.

---

## 1. Episode Grouping

Events are grouped into **episodes** — coherent conversation chunks that serve as the unit of processing for both extraction and consolidation. Structurally, an episode is a **set** in `memory.db` with `definition_id = 'retain'`. Events belonging to an episode are stored as `set_members`. The word "episode" is used conversationally throughout this spec to mean "a retain set."

### Two Clipping Rules

Episodes are clipped by **whichever threshold fires first**:

| Trigger | Condition | Config |
|---|---|---|
| Silence window | 90 minutes of silence in a thread | `gap_minutes: 90` |
| Token budget | Accumulated events reach 10k tokens | `max_tokens: 10000` |

**Time-gap clipping:** When no new events arrive in a thread for 90 minutes, the episode is closed and dispatched for retention. This is the natural conversation boundary.

**Token-limit clipping:** When accumulated events in a thread exceed ~10k tokens, the episode is clipped and dispatched immediately, even if the conversation is still active. The next event starts a new episode in the same thread. This keeps episodes small enough for reliable writer extraction.

Both clipping triggers flow through the identical retain pipeline. The consolidation agent naturally stitches knowledge across adjacent episodes — no explicit split-linking is needed because facts from the same thread share entities and the consolidation agent uses recall to discover related facts.

> **Design Decision: Why two clipping rules instead of one.**
>
> We considered several approaches for handling long conversations:
> 1. **Larger token budgets (30-50k):** Modern models can handle it, but reliable fact/entity extraction degrades with very long inputs. The writer's job is focused extraction, not summarization of long documents.
> 2. **Explicit split-linking (split_group_id, sequence_number):** Adds complexity to episode management and the writer needs special awareness of being "part 2 of 3." More machinery for modest benefit.
> 3. **Two independent clipping rules (chosen):** Clean separation. Each rule is just a different clipping trigger. Both produce normal episodes. The consolidation agent handles cross-episode knowledge stitching naturally through recall and entity overlap. No special split awareness needed.

Each episode (retain set) tracks:
- Platform
- Thread (with human-readable thread name where available)
- Participants (with resolved display names and entity links)
- Time range (first and last event timestamps)
- Event count
- Token estimate

### Episode Detection Mechanism

Episode detection uses a **hybrid approach: inline token-budget check + per-episode cron timer for the silence window**.

During `event.ingest`, after an event is stored, the pipeline slots it into an active episode:

1. **Look up** `pending_retain_triggers` for `(platform, container_id, thread_id)`.
2. **If no active episode exists** — create a new set in `memory.db` with `definition_id = 'retain'`, insert the event as a `set_member`, insert a `pending_retain_triggers` row, and schedule a 90-minute timer via the cron adapter.
3. **If an active episode exists and the silence gap has NOT been exceeded** — add the event as a `set_member` and update the trigger row. Then check the token budget:
   - **Under budget** — reset the timer to 90 minutes from now.
   - **Over budget** — clip immediately (create a `jobs` row with `type_id = 'retain_v1'`, fire the `episode-created` hookpoint), then start a fresh episode for this event.
4. **If the silence gap has been exceeded** — clip the old episode (create job, fire `episode-created`), then start a new episode with this event.

When the cron timer fires, it invokes the episode timeout handler directly as an internal runtime event — this does NOT go through the full pipeline (no principals to resolve, no access to check). The handler clips the episode: creates the `jobs` row with `type_id = 'retain_v1'` and fires the `episode-created` hookpoint.

#### `pending_retain_triggers` Table (runtime.db)

```sql
CREATE TABLE pending_retain_triggers (
    platform        TEXT NOT NULL,
    container_id    TEXT NOT NULL,
    thread_id       TEXT NOT NULL DEFAULT '',
    set_id          TEXT NOT NULL,
    first_event_at  INTEGER NOT NULL,
    last_event_at   INTEGER NOT NULL,
    token_estimate  INTEGER NOT NULL DEFAULT 0,
    event_count     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(platform, container_id, thread_id)
);
```

Events are added to `set_members` in real-time as they arrive — the set is the "open episode." When the episode clips, the set is already fully populated; the pipeline just creates the job and fires the hook.

#### Crash Recovery

On startup, scan `pending_retain_triggers`. For each row:
- If `last_event_at + 90min < now` — clip immediately.
- Otherwise — reschedule the timer for the remaining time.

### Fact Sets

Sets can also be constructed from **other sets or collections of facts** for consolidation purposes. This is important because the same structural concept — a set as a grouping container — serves both the extraction layer (events to facts) and the consolidation layer (facts to observations).

---

## 2. Filtering

Not every event stream is worth retaining. Filters determine which events/episodes enter the retain pipeline.

**Filters apply to:**
- Spam and automated noise (ride-share updates, marketing emails, bot notifications)
- Events that have already been processed by the retain pipeline (tracked via `processing_log` entries with `job_type_id = 'retain_v1'`)
- User-configured exclusions (specific threads, platforms, senders)

**Filters do NOT exclude:**
- Small episodes. A 1-2 message exchange can contain meaningful durable knowledge. Episode size is never a filter criterion.

Filters are stored as SQL WHERE clauses in the `memory_filters` table in `runtime.db`.

---

## 3. Short-Term Memory

Events in episodes that haven't closed yet (neither the silence window nor the token budget has been reached) are searchable as **short-term memory** via the recall API. They appear as `type: 'event'` results.

This ensures agents can access very recent context even before the retain pipeline processes it. Once events are processed by the writer and recorded in the `processing_log` as processed by `retain_v1`, they transition from short-term memory to the fact layer.

---

## 4. Episode Payload Assembly

When an episode finalizes, the pipeline builds a **writer payload** — the contract between the pipeline and the writer agent.

### Payload Structure

```json
{
  "platform": "imessage",
  "thread": {
    "thread_id": "imessage:+16319056994",
    "thread_name": "Casey Adams",
    "container_kind": "direct"
  },
  "participants": [
    {
      "contact_id": "owner",
      "contact_name": "Tyler Brandt",
      "entity_id": "ent_tyler_brandt",
      "entity_name": "Tyler Brandt"
    },
    {
      "contact_id": "+16319056994",
      "contact_name": "Casey A.",
      "entity_id": "ent_casey_adams",
      "entity_name": "Casey Adams"
    }
  ],
  "events": [
    {
      "event_id": "imessage:...",
      "sender_name": "Tyler Brandt",
      "datetime_local": "Mon, Feb 23, 2026, 09:03:25 PM CST",
      "content": { "type": "text", "value": "Yes" }
    }
  ]
}
```

### Participants as Legend, Events as Clean Narrative

The **participants block is the Rosetta Stone** — it maps every identity dimension once at the top of the payload. The writer uses it to understand who is who, then reads events using only canonical entity names.

This is a deliberate design choice. The writer sees clean, human-readable names in the event flow ("Casey Adams: Hey, are you free tonight?") while the participants block provides the full identity context when needed: platform identifier, platform display name, canonical entity ID and name.

### Payload Rules

**Thread:**
- `thread_id` — canonical thread identifier
- `thread_name` — human-readable name (resolved from contacts/entities where available)
- `container_kind` — direct, group, channel, etc.

**Participants (the legend):**
- `contact_id` — raw platform identifier (`+16319056994`, `discord_123456`, `owner` for system owner)
- `contact_name` — display name from the platform/contact list ("Casey A." in iMessage, "CaseyA_99" in Discord)
- `entity_id` — canonical entity ULID from the identity store
- `entity_name` — canonical entity name ("Casey Adams")

> **Design Decision: No `is_owner` flag on participants.**
>
> We considered adding `is_owner: boolean` to mark the system owner participant. We chose not to because:
> 1. The writer should extract facts objectively from all participants, not bias toward an "owner."
> 2. If the owner needs to be identified (e.g., for perspective in the role prompt), that belongs in the system prompt or session context — not repeated on every participant in every payload.
> 3. The owner concept doesn't generalize cleanly to organizations, multi-user systems, or group conversations where ownership is ambiguous.

The four identity fields serve different purposes:
- `contact_id` → routing/delivery, provenance tracking
- `contact_name` → what the platform shows, useful for debugging
- `entity_id` → linking facts to entities in the memory graph
- `entity_name` → what the writer uses to reference people in facts

When identity resolution can't fully resolve (new contact, no entity yet): `entity_name` falls back to `contact_name`, then to `contact_id`. `entity_id` may be null for unresolved participants.

**Events (chronological ascending):**
- `event_id` — unique event identifier
- `sender_name` — the **canonical entity name** of the sender (resolved from participants legend), NOT a raw identifier. This is always the `entity_name` for that participant.
- `datetime_local` — timezone-aware human-readable string
- `content` — always `{ type, value }` where type is one of: text, reaction, membership. Media types (image, audio, video, file) are NOT content types — they are attachment media types. An event with an image has `type: "text"` (possibly empty) with an attachment that has `media_type: "image"`.
- `reply_to_event_id` — **only present when non-null** (omit entirely if no reply)
- `attachments` — **only present when non-empty** (omit entirely if no attachments). Hydrated from the normalized `attachments` table, colocated under each event.

### Attachment Shape (when present)

```json
{
  "id": "...",
  "filename": "...",
  "mime_type": "...",
  "media_type": "image|video|audio|document|file",
  "size_bytes": 12345,
  "local_path": "...",
  "url": "..."
}
```

### What Is Excluded

The writer payload deliberately excludes:
- Direction logic (inbound/outbound is derived from `sender_id` vs `receiver_id`, not shown to the writer)
- Raw `delivery` object
- Raw per-event metadata blobs
- Bookkeeping fields (`event_count`, `token_estimate`, `set_id`)
- Numeric timestamps (only human-readable `datetime_local`)

**Metadata is for disambiguation only.** The writer extracts facts from event content and attachments. Metadata identifiers (`thread_id`, `sender_id`, `container_id`, platform IDs) are never extracted as facts or entities — they exist only to help the writer resolve who said what.

---

## 5. Adapter Contact Seeding (Prerequisite)

Quality memory extraction depends on contacts already existing in the identity store before retain runs. This is NOT a step in the retain pipeline — it's an **adapter lifecycle step**.

When an adapter is connected and begins its backfill:
1. The adapter seeds contacts into the identity store (canonical identifier → display name → entity)
2. This happens as part of adapter setup, before any memory backfill starts
3. The memory system simply depends on contacts existing when it runs

**This is a required change to the adapter and identity system.** See `UNIFIED_ENTITY_STORE.md` § Adapter Contact Seeding for the full contract.

Without proper contact seeding, the writer receives phone numbers instead of names, entity resolution fragments across platforms, and extracted facts reference "a contact" instead of real people.

---

## 6. Writer Dispatch

When an episode clips (via silence timeout or token budget), the `episode-created` hookpoint fires:

1. The pipeline builds the episode payload (section 4 above)
2. The `episode-created` hookpoint dispatches a **Memory Writer meeseeks**, forked from the current manager agent session:
   - The writer inherits the manager's full context (situational awareness)
   - The writer's role prompt provides extraction-specific workflow instructions
   - The episode payload is provided as the task content
   - Runtime auto-assigns the `source_set_id` (linking facts to their originating processing set/job) — the writer doesn't do this manually
   - All CLI tools are available (same as any agent)
3. The writer executes: reads events, extracts entities and facts, resolves entities via recall, writes facts with entity links
4. On completion, the hookpoint records the invocation result and triggers post-processing

See `MEMORY_WRITER.md` for the full writer specification.

---

## 7. Post-Writer Processing

After the writer meeseeks completes successfully:

1. **Embedding generation** — algorithmic, not agentic. Each new fact gets an embedding vector from the configured embedding provider. Stored in `embeddings.db`.

2. **Events marked retained** — a `processing_log` entry with `job_type_id = 'retain_v1'` is recorded for all processed events, transitioning them from short-term memory to the fact layer.

3. **Consolidation dispatched** — the `episode-retained` hookpoint fires carrying the `set_id` and `fact_ids`, triggering the consolidation meeseeks.

See `MEMORY_CONSOLIDATION.md` for the consolidation specification.

---

## 8. Live vs Backfill

The retain pipeline is architecturally unified across live and backfill paths:

- **Live:** Events arrive in real-time, episodes close after 90-minute silence or 10k-token limit (whichever fires first), writer dispatches automatically
- **Backfill:** Historical events are loaded, episodes are constructed from the historical record, writers are dispatched in batches with concurrency control

Both paths use the same episode payload format, the same writer role, and the same post-processing. The only differences are operational: backfill has batch orchestration, concurrency limits, resume/idempotency guards, and progress tracking via `backfill_runs` in `runtime.db`.

**Critical:** Live and backfill must have identical access, permissions, and tool availability. Any drift between the two paths is a bug.
