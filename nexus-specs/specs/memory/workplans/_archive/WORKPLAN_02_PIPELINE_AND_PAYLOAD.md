# Workplan 02 — Retain Pipeline & Episode Payload

**Status:** ACTIVE
**Created:** 2026-02-27
**Specs:** ../RETAIN_PIPELINE.md, ../UNIFIED_ENTITY_STORE.md

---

## Overview

This workplan covers the retain pipeline changes: episode clipping rules, payload format with the participants-as-legend pattern, identity resolution for sender names, and contacts schema alignment. These changes improve what the writer sees and how identity is represented.

**Hard cutover policy.** No backwards compatibility, no migrations. Clean house.

---

## P1. Episode Types: Two clipping rules

**Spec:** RETAIN_PIPELINE.md § Episode Grouping — Two clipping rules: time_gap (90min) and token_limit (10k).

**Current code:** `retain-episodes.ts` `groupEventsIntoEpisodes()` already supports both `gapMinutes` and `episodeTokenBudget` parameters. Default token budget is ~6000.

**Changes:**
1. Bump `episodeTokenBudget` default from 6000 to 10000
2. Update episode_definitions seeded in `db/memory.ts`:
   ```sql
   INSERT INTO episode_definitions (id, name, strategy, config_json, ...)
   VALUES ('time_gap', 'time_gap', 'thread_time_gap', '{"gap_minutes":90}', ...);

   INSERT INTO episode_definitions (id, name, strategy, config_json, ...)
   VALUES ('token_limit', 'token_limit', 'token_budget', '{"max_tokens":10000}', ...);
   ```
3. Verify live retain path (`retain-live.ts`) respects both thresholds
4. Verify backfill path uses the same thresholds
5. Both episode types flow through the identical writer dispatch and post-processing

**Why two types instead of alternatives:**

| Approach | Considered | Verdict |
|---|---|---|
| Larger budget (30-50k) | Models can handle it, but extraction quality degrades with very long inputs | Rejected — writer's job is focused extraction, not long document summarization |
| Explicit split-linking | `split_group_id`, `sequence_number` on episodes | Rejected — adds machinery for modest benefit; consolidation handles cross-episode knowledge naturally |
| Two independent types (chosen) | Each clipping trigger produces a normal episode | Chosen — clean separation, consolidation stitches knowledge across episodes via recall and entity overlap |

---

## P2. Payload: Participants as legend with 4 identity fields

**Spec:** RETAIN_PIPELINE.md § Participants as Legend, Events as Clean Narrative.

**Current code:** `EpisodeParticipant` in `retain-episodes.ts` has `participant_id`, `display_name`, `is_owner`.

**Changes to `retain-episodes.ts`:**

1. Update `EpisodeParticipant` interface:
   ```typescript
   interface EpisodeParticipant {
     contact_id: string;       // raw platform identifier
     contact_name: string;     // platform display name
     entity_id: string | null; // canonical entity ULID (null if unresolved)
     entity_name: string;      // canonical entity name (fallback: contact_name → contact_id)
     is_owner: boolean;
   }
   ```

2. Update participant resolution in `groupEventsIntoEpisodes()`:
   - Current: resolves display_name from metadata
   - New: also resolve entity_id and entity_name via identity store lookup
   - Lookup chain: `sender_id` → contact lookup (platform, contact_id) → `entity_id` → `entities.name`
   - Fallback: `entity_name = contact_name || contact_id`, `entity_id = null`

3. The four fields serve different purposes:
   - `contact_id` → routing/delivery, provenance
   - `contact_name` → what the platform shows, debugging
   - `entity_id` → linking facts to entities in the memory graph
   - `entity_name` → what the writer uses in facts

**This is a critical blurb for the writer role prompt:** The participants block is the Rosetta Stone. It maps each conversation participant across all identity dimensions once at the top. Events then use only the canonical entity name for clean readability.

---

## P3. Payload: Events use entity_name only

**Spec:** RETAIN_PIPELINE.md § Payload Rules — Events use canonical entity name.

**Current code:** `EpisodeEvent` has `sender_id: string`. Display names only in participants.

**Changes to `retain-episodes.ts`:**

1. Update `EpisodeEvent` interface:
   ```typescript
   interface EpisodeEvent {
     event_id: string;
     sender_name: string;       // canonical entity_name (NOT sender_id)
     datetime_local: string;
     timestamp: number;         // kept internally, not shown in payload
     content: EpisodeMessageContent;
     reply_to_event_id?: string;  // omitted when null
     attachments?: unknown[];     // omitted when empty
   }
   ```

2. During event construction, resolve `sender_id` → participant → `entity_name`
3. Omit `attachments` when empty array (currently always included)
4. Omit `reply_to_event_id` when null

**Why show entity_name in events instead of sender_id:** The writer extracts facts using names ("Casey asked Tyler about..."). If the event shows `+16319056994: Hey are you free tonight?`, the writer has to cross-reference the participants list for every message. By showing the canonical name directly, the writer sees clean narrative: `Casey Adams: Hey are you free tonight?`

---

## P4. Contacts schema: Align field names

**Spec:** UNIFIED_ENTITY_STORE.md § Contacts — `contact_id`, `contact_name`, entity link.

**Current code:** `identity.ts` contacts use `sender_id` and `sender_name`.

**Changes to `db/identity.ts`:**
1. Rename `sender_id` → `contact_id` in contacts table
2. Rename `sender_name` → `contact_name` in contacts table
3. Update `ContactRow` interface
4. Update all references throughout codebase (grep for `sender_id`, `sender_name` in identity context)
5. Ensure `UNIQUE(platform, contact_id)` constraint

**Hard cutover:** Drop and recreate the contacts table. No column rename migration needed.

---

## P5. Identifier policy: Drop platform prefixes

**Spec:** UNIFIED_ENTITY_STORE.md § Identifier Policy — No platform prefixes. Universal identifiers use `phone`/`email` as platform.

**Current code:** Platform-scoped identifiers may be stored with platform context baked into the identifier. Need to verify.

**Changes:**
1. Ensure identifiers are stored as raw values (no `discord:` prefix)
2. Universal identifiers (phone, email) use abstract platform names:
   - Phone numbers → `platform = 'phone'`, `contact_id = '+16319056994'`
   - Email addresses → `platform = 'email'`, `contact_id = 'tyler@anthropic.com'`
3. Platform-local identifiers use their platform name:
   - Discord → `platform = 'discord'`, `contact_id = '123456789'`
   - Slack → `platform = 'slack'`, `contact_id = 'U01ABCDEF'`
4. Update adapter contact seeding to follow this convention
5. The `(platform, contact_id)` compound key handles collision prevention

---

## P6. Identity: Add `source` field to entities

**Spec:** UNIFIED_ENTITY_STORE.md — Entities have `source TEXT` ('adapter', 'writer', 'manual').

**Current code:** Entities table missing `source` column.

**Changes:**
1. Add `source TEXT` to entities table in `db/identity.ts`
2. `create_entity` tool sets `source = 'writer'`
3. Adapter contact seeding sets `source = 'adapter'`
4. Manual creation (if any) sets `source = 'manual'`

---

## Execution Order

1. **P4 + P5 + P6** — Identity schema changes (contacts rename, prefix policy, entity source)
2. **P2 + P3** — Payload format (participants legend, events entity_name)
3. **P1** — Episode types (mostly config, depends on payload being correct)

---

## Validation

After each step:
- `npm run build && npm test`
- After P2+P3: Build a test episode payload and verify the structure matches spec
- After P1: Run a backfill with the new token budget and verify episodes clip correctly
- After P4+P5: Verify contact seeding produces correct `(platform, contact_id)` pairs
