# Cross-System Review: Adapters + Entity/IAM + Memory

## The End-to-End Data Flow

```
Adapter (Discord/iMessage/etc.)
  |
  | emits NexusEvent { event: {...}, delivery: { platform, sender_id, container_id, ... } }
  v
[Stage 1: ingest] -- dedupe, validate
  |
  v
[Stage 2: resolveIdentity] -- (platform, space_id, sender_id) -> contact -> entity -> PrincipalContext
  |  Auto-creates entity+contact if new sender
  |  Follows merged_into chain to canonical entity
  |  Attaches entity_tags to principal
  v
[Stage 3: resolveReceiver] -- who is being addressed (persona, agent)
  |
  v
[Stage 4: resolveAccess] -- IAM policy evaluation against principal (tags, entity_id, type)
  |  Loads policies, evaluates matches, applies grants
  |  Produces AuthorizationEnvelope (allow/deny/ask + permissions)
  v
[Stage 5: runAutomations] -- trigger evaluation
  |
  v
[Stage 6: routeSession] -- build session context
  |  memory-reader meeseeks fires at worker:pre_execution (blocking, 60s)
  |  Calls recall() -> injects <memory_context> into agent prompt
  v
[Stage 7: runAgent] -- LLM execution (agent has recall tool available)
  |
  v
[Stage 8: processResponse] -- format output
  |  memory-writer meeseeks fires at after:runAgent
  |  OR episode-based retain pipeline fires at memory:retain-episode
  |  Writer extracts facts -> links to entities -> kicks consolidation
  v
[Stage 9: deliverResponse] -- send reply back through adapter
```

### The Three Databases That Connect Everything

```
identity.db                    memory.db                    events.db
-----------                    ---------                    ---------
entities                       facts                        events
  id (ULID)  <-- - - - - - -  fact_entities.entity_id        is_retained
  name                         causal_links
  type                         episodes
  merged_into (union-find)     analysis_runs (observations)
  is_user                      mental_models
  source                         entity_id  - - - -> entities.id
entity_tags                    observation_facts
  tag (IAM anchor)             memory_processing_log
entity_cooccurrences
merge_candidates               embeddings.db
contacts                       ----------
  (platform, space_id,         embeddings (BLOB)
   sender_id) -> entity_id     vec_embeddings (sqlite-vec)
```

Cross-DB references are by convention (no FK enforcement between databases).

---

## FINDING 1: Identity Normalization Debt

**The Problem (user's #5):**
`buildDeliveryEntityName()` in `src/iam/identity.ts` creates `{platform}:{sender_id}` canonical names:
- `imessage:+14155550000`
- `sms:+14155550000` (same person, different entity!)
- `discord:user42`
- `slack:T12345:U67890`

Phone numbers and emails are platform-independent identifiers that should NOT be prefixed. Platform-local IDs (Discord, Slack, Telegram numeric IDs) DO need prefixes.

**Current state:** No normalization at all. Same phone from iMessage and SMS = two entities. Only LLM-driven merge unifies them post-hoc.

**Spec gap:** UNIFIED_ENTITY_STORE.md describes entity enrichment by the writer but doesn't specify an ingest-time normalization policy. The delivery taxonomy docs focus on message routing, not identity canonicalization.

**Proposed fix:**
1. Canonicalize at entity creation time in `resolveExternalPrincipalContext()`:
   - Phone numbers → E.164 format, no platform prefix (just `+14155550000`)
   - Emails → lowercase, no platform prefix (just `user@example.com`)
   - Platform-local IDs → keep prefix (`discord:user42`, `slack:T12345:U67890`)
   - Shortcodes → new type `shortcode`, not `phone` (prevents mis-normalization)
2. Entity `type` field refines:
   - `phone` → E.164 phone number
   - `email` → email address
   - `shortcode` → SMS shortcode
   - `discord_handle`, `slack_user`, `telegram_user` → platform-local
3. Contact table keeps full `(platform, space_id, sender_id)` tuple (unchanged)
4. Entity name becomes the CANONICAL identifier, contacts map platform-specific paths to it
5. Adapter-driven contact preload: adapters can emit known contacts (address book sync) so the writer has a reference set to resolve against

**Cross-system impact:**
- Adapters: No change (they emit raw platform IDs)
- Identity: New normalization logic in entity creation path
- Memory: Writer gets better entity quality, fewer spurious merge proposals
- IAM: No change (works on entity_id, tags, type)

---

## FINDING 2: `relationship` Field Gap

**The Problem:**
- IAM policies can match on `principal.relationship` (e.g., `relationship: partner`)
- POLICIES.md shows examples: `principal: { relationship: "partner" }`
- BUT: the `entities` table has NO `relationship` column
- `resolveExternalPrincipalContext()` NEVER populates `relationship` on PrincipalContext
- The field is always `undefined` at runtime

**Spec says:** UNIFIED_ENTITY_STORE.md explicitly dropped `relationship` from entities, saying it should be stored as facts.

**Options:**
A) **Entity tags approach:** Use tags like `relationship:partner`, `relationship:family`. IAM matching converts `principal.relationship: X` → check if `principal.tags` includes `relationship:X`. Simple, consistent with existing tag infrastructure.
B) **Derived field:** At identity resolution time, query facts linked to the entity to derive relationship. Too slow for pipeline-speed evaluation.
C) **Restore column:** Add `relationship TEXT` back to entities. Simple but contradicts the "facts store relationships" design principle.

**Recommendation:** Option A — entity tags. Update POLICIES.md to document that `principal.relationship` is matched via `entity_tags` with `relationship:` prefix. Update `resolveExternalPrincipalContext()` to extract `relationship:*` tags and set `principal.relationship`. Update the spec to be explicit about this bridge.

---

## FINDING 3: `entity_cooccurrences` — Schema Without Implementation

- Table exists in identity.db schema
- Spec describes it feeding into entity resolution scoring (Hindsight 3-signal scorer: name 0.5, co-occurrence 0.3, temporal 0.2)
- `link_fact_entity` tool in `cortex-memory-writer-tools.ts` DOES update co-occurrences (found at line ~590)
- But NO read-side code uses co-occurrence data for merge candidate scoring
- The consolidation pipeline proposes merges via LLM judgment, not algorithmic scoring

**Decision needed:** Is co-occurrence-driven merge scoring planned, or should the table definition be kept but acknowledged as future work?

---

## FINDING 4: `channel` vs `platform` — Mixed Naming in Code AND Specs

### In Specs:
- `adapter-protocol.schema.json`: AdapterInfo uses `channel` (NOT `platform`)
- OUTBOUND_INTERFACE.md: DeliveryTarget uses `channel` field
- ADAPTER_SYSTEM.md: uses `PlatformCapabilities` (not `ChannelCapabilities`)
- Multiple UPSTREAM_REVIEW files: still use `peer_id`/`peer_kind`
- `container_kind` enum: includes both `dm` and `direct` (undefined relationship)

### In Code:
- `src/utils/delivery-context.ts`: Separate legacy `DeliveryContext` type using `channel`
- `src/channels/registry.ts`: `ChatChannelId`, `CHAT_CHANNEL_ORDER`
- `PrincipalContext`: Legacy transform from `{channel, identifier}` to `{platform, identifier}`
- `access_log` table: has BOTH `channel TEXT` and `platform TEXT` columns
- `IngressMetadata`: accepts `channel` as deprecated alias for `platform`

**This is a widespread consistency problem.** The canonical term is `platform` but `channel` persists in ~40% of surfaces.

---

## FINDING 5: `cortex` Naming — Why `src/cortex-memory-v2/`?

### In Code:
- `src/cortex-memory-v2/` — the main knowledge graph / recall directory
- `src/memory/` — the lower-level embedding plumbing
- `src/iam/cortex-entities.ts` — entity helpers
- `src/agents/tools/cortex-memory-writer-tools.ts` — writer tools
- `CORTEX_V2_EMBEDDING_MODEL_ID` constant
- `cortex_client` in stage runtime types
- `AssembledContext.cortex` field

### In Specs:
- All "cortex" references were cleaned up in the previous session
- Specs now say "Memory System" everywhere

**The code never got the rename.** The "cortex" name is vestigial from when the memory system was a separate Go process called "Cortex." It should be renamed to align with specs.

**Proposed rename:**
- `src/cortex-memory-v2/` → `src/memory/knowledge/` (or merge into `src/memory/`)
- `cortex-entities.ts` → `identity-entities.ts`
- `cortex-memory-writer-tools.ts` → `memory-writer-tools.ts`
- `CORTEX_V2_*` constants → `MEMORY_*`
- `cortex_client` → `memory_client`
- `AssembledContext.cortex` → `AssembledContext.memory`

---

## FINDING 6: Two Parallel Adapter Architectures

### In Code:
- **Process-boundary adapters** via `AdapterManager` (JSONL protocol) — spec-aligned, few adapters use this
- **In-process adapters** (Discord, iMessage, Signal, etc.) — bypass protocol entirely, use platform SDKs directly

### In Specs:
- Specs describe ONLY the process-boundary architecture
- No spec acknowledges in-process adapters

**Both architectures feed into the same pipeline** — identity resolution works the same way. But the in-process adapters don't go through `stampAdapterInboundEvent()` integrity checking.

**Decision needed:** Is the long-term goal to migrate all adapters to process-boundary? Or should specs acknowledge both patterns?

---

## FINDING 7: Two Parallel Writer Paths

### In Code:
- **Per-turn writer** (`memory-writer` meeseeks at `after:runAgent`) — processes individual turns
- **Episode-based writer** (`memory-retain-episode` meeseeks at `memory:retain-episode`) — processes batched episodes via retain-live scheduling

Both exist, with deduplication via `memory_processing_log`.

### In Specs:
- MEMORY_WRITER_V2.md describes episode-based writing only
- MEMORY_V2_RETAIN_PIPELINE.md describes the retain pipeline (episode-based)
- The per-turn writer is NOT documented in current specs

**Decision needed:** Is the per-turn writer intentional (e.g., for real-time extraction during long conversations) or legacy from before the episode-based approach?

---

## FINDING 8: `adapter-sdk/` Directory is Empty

- `src/adapter-sdk/` exists but has zero files
- ADAPTER_SDK.md and ADAPTER_SDK_TYPESCRIPT.md spec a full SDK
- All adapter protocol logic lives in `src/nex/adapters/protocol.ts` instead
- The SDK is mentioned as a deliverable but never implemented

---

## FINDING 9: Spec File Naming / V2 Labeling

Current memory spec files carry vestigial "V2" labels:
- `MEMORY_SYSTEM_V2.md` → This IS the memory system now
- `MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md`
- `MEMORY_V2_RETAIN_PIPELINE.md`
- `MEMORY_WRITER_V2.md`
- `MEMORY_INJECTION.md` subtitle: "Memory Reader V2"

The "V2" was useful during design to distinguish from V1. Now that V1 is archived and V2 is implemented, it's noise.

**Proposed rename:**
- `MEMORY_SYSTEM_V2.md` → `MEMORY_SYSTEM.md`
- `MEMORY_V2_INFRASTRUCTURE_WORKPLAN.md` → `MEMORY_INFRASTRUCTURE_WORKPLAN.md`
- `MEMORY_V2_RETAIN_PIPELINE.md` → `MEMORY_RETAIN_PIPELINE.md`
- `MEMORY_WRITER_V2.md` → `MEMORY_WRITER.md`
- Fix `MEMORY_INJECTION.md` subtitle

---

## FINDING 10: Spec Organization — Adapter Docs

The adapter spec directory has 57 files. Key organizational issues:
- `ADAPTER_INTERFACES.md` is marked ARCHIVED but still in the active directory (not in `_archive/`)
- DeliveryTarget defined in 3 places (schema, OUTBOUND_INTERFACE, OUTBOUND_TARGETING)
- ChannelCapabilities defined in 3 places
- 4 UPSTREAM_REVIEW files still use legacy `peer_id`/`peer_kind` field names
- `DELIVERY_DIRECTORY_SCHEMA.md` lives in `specs/runtime/` not under adapters or data

---

## FINDING 11: `dm` vs `direct` Container Kind

The `container_kind` enum includes both `"dm"` and `"direct"`:
- Spec schema: `"dm" | "direct" | "group" | "channel"`
- Code Zod: `z.enum(["dm", "direct", "group", "channel"])`
- `normalizeContainerKind()` defaults unknown values to `"direct"` but does NOT collapse `dm` ↔ `direct`
- No documentation explains when to use which

**Decision needed:** Pick one and normalize the other. Or define them as distinct (DM = 1:1, direct = 1:1 but within a server?).

---

## PROPOSED ACTION PLAN

### Phase 1: Spec Alignment (docs only, no code)

1. **Write IDENTITY_NORMALIZATION.md** — new spec documenting the canonical name policy (phone/email = platform-independent, platform-local IDs = prefixed), the `relationship` → entity_tags bridge, and the adapter contact preload interface.

2. **Fix `channel`→`platform` in remaining specs:**
   - `adapter-protocol.schema.json` AdapterInfo: `channel` → `platform`
   - `OUTBOUND_INTERFACE.md` DeliveryTarget: `channel` → `platform`
   - `ADAPTER_SYSTEM.md`: `PlatformCapabilities` → `ChannelCapabilities` (match schema)
   - 4 UPSTREAM_REVIEW files: `peer_id`/`peer_kind` → `container_id`/`container_kind`

3. **Resolve `dm` vs `direct`** — pick one canonical value, document it.

4. **Rename memory spec files** — drop V2 from all 4 filenames and titles. Fix MEMORY_INJECTION subtitle.

5. **Move `ADAPTER_INTERFACES.md`** to `_archive/`.

6. **Move `DELIVERY_DIRECTORY_SCHEMA.md`** from `specs/runtime/` into the appropriate subsystem directory.

7. **Document the two writer paths** — update MEMORY_WRITER.md to acknowledge both per-turn and episode-based triggering.

8. **Document the in-process adapter pattern** — add a section to ADAPTER_SYSTEM.md or INTERNAL_ADAPTERS.md.

### Phase 2: Code Alignment (implementation changes)

9. **Rename `src/cortex-memory-v2/`** and all cortex-named files/constants.

10. **Implement identity normalization** in `resolveExternalPrincipalContext()`.

11. **Wire `relationship` through entity_tags** in identity resolution.

12. **Clean up `channel` references** in code (utils/delivery-context.ts, access_log schema, IngressMetadata).

13. **Normalize `dm`↔`direct`** in `normalizeContainerKind()`.

---

## QUESTIONS FOR DISCUSSION

1. **Per-turn writer vs episode writer:** Keep both? Remove per-turn? The episode-based approach is more efficient but per-turn gives faster feedback.

2. **In-process vs process-boundary adapters:** Long-term strategy? Should Discord/iMessage eventually become external processes?

3. **`entity_cooccurrences` usage:** Implement algorithmic merge scoring, or leave as LLM-only judgment?

4. **`dm` vs `direct`:** Which survives?

5. **Adapter SDK:** Still planned? Or is `src/nex/adapters/protocol.ts` sufficient?

6. **Memory dir rename:** `src/cortex-memory-v2/` → `src/memory/knowledge/` vs merging into `src/memory/`?
