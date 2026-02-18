# Discord Adapter: I/O Extraction + Policy Surface (IAM + Manager Integration)

**Status:** DESIGN SPEC  
**Last Updated:** 2026-02-18  
**Related:**
- `../../ADAPTER_SYSTEM.md`
- `../../INBOUND_INTERFACE.md`
- `../../OUTBOUND_INTERFACE.md`
- `../../OUTBOUND_TARGETING.md`
- `../../CHANNEL_DIRECTORY.md`
- `../../../iam/ACCESS_CONTROL_SYSTEM.md`
- `../../../iam/POLICIES.md`
- `../../../iam/PAIRING_UX.md`
- `CHANNEL_SPEC.md`
- `ONBOARDING.md`
- `UPSTREAM_REVIEW.md`

---

## Goal

Extract Discord out of in-process "channels" into an external Nexus adapter binary that:

- does transport + normalization only (I/O adapter)
- emits a high-fidelity `NexusEvent` for every inbound Discord message event we care about
- preserves structured delivery targeting fields end-to-end (`peer_kind`, `peer_id`, `thread_id`, `reply_to_id`)
- moves all access control and "should we respond" decisions out of the adapter and into Nexus (IAM + Manager/automations)

This document is the "policy surface map" for the Discord migration: what stays in the adapter vs what becomes IAM policy vs what becomes Manager/automation behavior.

---

## Non-Goals

- Recreating OpenClaw's in-process gating behavior inside the adapter.
- Designing the Manager's full rule/learning system here (we only define what responsibilities move there).
- Defining the global identity directory (see `CHANNEL_DIRECTORY.md` for channel directory; identity directory lives elsewhere).

---

## Key Design Decisions (Do Not Re-litigate)

1. **IAM is the only security boundary.**
The adapter MUST NOT be relied on for allow/deny decisions.

2. **Pairing is IAM-backed permission-request UX.**
The adapter MUST NOT DM pairing codes or pairing prompts.

3. **Structured delivery targeting is mandatory.**
Adapters MUST preserve:
- `delivery.channel`
- `delivery.peer_kind` (`dm|group|channel`)
- `delivery.peer_id` (conversation container)
- `delivery.thread_id` (thread/topic id when applicable)
- `delivery.reply_to_id` (message id being replied to when applicable)

4. **Directory is split.**
- Channel directory (per-channel, per-account targets/threads) is owned by NEX Adapter Manager.
- Identity directory (cross-channel entities) is separate.

5. **Behavioral response gating belongs to Manager/automations, not IAM and not the adapter.**
Examples: "require mention", "don't respond in noisy groups", "quiet hours", "respond only in threads".

Rationale: IAM should answer "is this allowed?" not "is this worth replying to?".

---

## Terminology (Discord)

- `peer_id`: Discord channel id.
  - DMs: DM channel id.
  - Guilds: the text channel id (or forum channel id, etc).
- `thread_id`: Discord thread channel id (threads are channels in Discord's model).
- `reply_to_id`: Discord message id this message references as a reply.

---

## Responsibilities Split

### Adapter Responsibilities (I/O Only)

The Discord adapter MUST:

- Implement the adapter protocol commands per `ADAPTER_SYSTEM.md` (at least `info`, `monitor`, `send`; ideally `accounts`, `health`, `backfill`).
- Normalize inbound Discord events to `NexusEvent` and emit JSONL on stdout for `monitor`.
- Implement outbound delivery mechanics for `send`/`stream` (chunking, code-fence preservation, markdown table conversion, thread routing, reply references).
- Preserve thread/reply targeting fields via `OUTBOUND_TARGETING.md`.
- Include enough metadata for NEX to make correct IAM and behavioral decisions.

The Discord adapter MUST NOT:

- decide "allow/deny/ask" or implement allowlists as a security boundary
- implement pairing DM prompts/codes
- implement "require mention" gating (except as a purely optional performance filter that is explicitly non-authoritative)

### Minimal Transport-Safety Filters (Allowed)

The adapter MAY implement transport-safety filters that are not "policy":

- Ignore events authored by the adapter's own bot user id (loop prevention).
- De-duplicate by Discord message id (at-least-once gateway delivery).
- Drop events that are not messages (unless explicitly supported as `content_type` like reactions).

These are correctness and stability concerns, not access control.

### Nexus Responsibilities

NEX is responsible for:

- Ingesting events from adapters and recording them (event ledger, agents ledger, audit).
- Upserting the channel directory entries (passive population) per `CHANNEL_DIRECTORY.md`.
- Resolving sender identity (principal) from `(channel, sender_id)`.
- Applying IAM policies (`allow|deny|ask`) and creating permission requests on `ask`.
- Orchestrating Manager/automation behavior that decides "respond vs observe".
- Executing outbound sends through the adapter manager (including thread/reply routing).

### IAM Responsibilities (Access Control)

IAM is responsible for:

- DMs: unknown sender -> `ask` by default (permission request), not "pairing in adapter".
- Groups/channels: unknown sender -> `deny` by default.
- Allowlisting by principal, and optionally scoping by delivery context (channel/account/peer).

See `PAIRING_UX.md`, `POLICIES.md`.

### Manager/Automation Responsibilities (Behavior)

Manager/automations are responsible for:

- mention gating and other behavioral response rules
- deciding whether to respond publicly vs privately
- writing channel-specific norms into skills and reusing them
- optional: sending canned "pending approval" messages (if desired) based on IAM decisions

---

## Required Event Normalization (Discord -> NexusEvent)

The Discord adapter SHOULD emit one `NexusEvent` per Discord message event (create/edit as separate events if we choose to support edits).

### Required Fields

`NexusEvent` fields MUST include:

- `channel = "discord"`
- `account_id` (adapter account receiving the message)
- `event_id = "discord:<discord_message_id>"`
- `timestamp` (unix ms; message timestamp)
- `content` (best-effort text; may be empty if attachments-only)
- `content_type = "text"` for normal messages (other content types if supported)
- `sender_id` (discord user id)
- `sender_name` (best-effort display name)
- `peer_kind` (`dm` if DM channel; otherwise `group` or `channel` per your peer_kind taxonomy)
- `peer_id` (discord channel id)
- `thread_id` (discord thread channel id when applicable)
- `reply_to_id` (referenced discord message id when message is a reply)

### Required Metadata (For Policy + UI + Directory)

`event.metadata` SHOULD include:

- `guild_id` (string or null)
- `guild_name` (best-effort)
- `channel_id` (same as `peer_id`)
- `channel_name` (best-effort)
- `channel_type` (best-effort enum/string)
- `thread_id` (same as `thread_id` when present)
- `thread_name` (best-effort)
- `thread_parent_id` (best-effort; parent channel id for a thread)
- `message_id` (same as the message id used in `event_id`)
- `author_is_bot` (boolean)
- `mentions_bot` (boolean; whether the bot user was mentioned)
- `mentioned_user_ids` (string array; best-effort)
- `attachment_count` (number)
- `attachments` (optional array with `{ id, filename, content_type, size_bytes, url }` if available)

Notes:

- The adapter should not attempt to resolve the "owner principal" or implement allowlists. It should only report facts and identifiers.
- `mentions_bot` is an important behavioral input for Manager rules, and MUST be correct when possible.

---

## Outbound Targeting (Discord Send Semantics)

The adapter MUST implement outbound targeting per `OUTBOUND_TARGETING.md`.

### Routing Rules

- If `to.thread_id` is present, send to that thread channel id.
- Else send to `to.peer_id`.
- If `to.reply_to_id` is present, include Discord `message_reference` with that id.

### Chunking Rules

Follow Discord platform constraints (see `CHANNEL_SPEC.md`) and preserve fenced code blocks:

- Do not split in the middle of a fence.
- If a single fenced block exceeds the limit, split by closing/reopening the fence.

This is a delivery mechanic and belongs in the adapter.

---

## Policy Surface Inventory: What Moves Where

This is the critical migration map.

The "upstream" references in this section refer to the current in-process Discord implementation:

- `nex/src/discord/monitor/message-handler.preflight.ts`
- `nex/src/discord/monitor/allow-list.ts`
- `nex/src/discord/monitor/native-command.ts`

| Behavior / Knob | What It Does Today (In-Process) | New Home | Notes |
|---|---|---|---|
| DM policy (open/pair/disabled) | Controls whether DMs are accepted; "pair" triggers pairing UX. | IAM + pairing UX | Unknown DM should be `ask` by default (permission request). No pairing messages from adapter. |
| Guild/channel allowlists | Drops events not in allowlisted guilds/channels. | IAM | Adapter may emit all events; IAM is the boundary. |
| User allowlists/blocklists | Drops events from disallowed users. | IAM | Identity mapping + policies/grants. |
| Require mention in guild channels | Only respond when bot is mentioned. | Manager/automation | This is behavioral, not access control. Still ingest is valuable for context. |
| Thread-only response rules | Prefer/respond only in threads. | Manager/automation | Adapter must preserve `thread_id`. |
| Slash-command gating / "native command" path | Special-cases bot commands. | Manager/automation (or dedicated automation) | Keep transport mechanics in adapter; decision/routing is behavioral. |
| Pairing code prompt messages | DMs the user a code, requests approval. | Control plane + IAM permission requests | Unified permission request UI replaces bespoke pairing UX inside adapter. |
| Reaction acknowledgements | Adds reactions to indicate seen/queued/etc. | Manager/automation | Implement via outbound `react` if supported, or a generic "ack" stage later. |
| Debounce / duplicate suppression | Prevent repeated processing of rapid events. | Adapter (dedupe) + NEX (idempotency) | Transport-level dedupe is OK; policy-level debouncing belongs in NEX. |
| "Ignore bots/system" | Drops bot-authored messages. | Adapter (loop prevention) + optional IAM/Manager | Minimum is loop prevention for self. Broader bot-ignore should be a policy decision. |

---

## Default IAM Policy Stance (Recommended)

These defaults are intentionally safe.

- Owner principal: allow.
- Unknown principal in DMs: `ask`.
- Unknown principal in groups/channels: `deny`.
- Known principal in DMs: allow according to policy/grant.
- Known principal in groups/channels: deny unless explicitly allowed by policy/grant.

See `iam/PAIRING_UX.md` for the generic pairing flow.

---

## Pairing / Approval UX (Current vs Future)

### Scenario: Unknown User DMs The Discord Bot

Current in-process behavior (OpenClaw-style):

1. DM arrives in Discord.
2. In-process code checks DM policy and allowlists.
3. If unknown and pairing enabled, bot sends a pairing message/code to the user.
4. Message is dropped from the agent pipeline until approved.

Proposed NEX behavior (IAM-backed permission request):

1. DM arrives in Discord.
2. Adapter emits a `NexusEvent` with delivery context and metadata.
3. `resolveIdentity` cannot map `(discord, sender_id)` to a principal -> principal is `unknown`.
4. IAM evaluates the request and returns `ask` (default).
5. NEX creates an `acl_permission_requests` record and stops the pipeline for this event.
6. Control plane notifies the owner with approve/deny options.
7. On approval, NEX writes:
   - identity mapping `(discord, sender_id) -> principal_id`
   - allow policy or time-bounded grant
8. Subsequent DMs resolve to the principal and proceed normally.

Optional behaviors (not required for correctness):

- An automation can send a DM like "pending approval" when the request is created.
- An automation can send a DM like "approved" after approval.

The adapter does not own this UX.

---

## Implementation Phases (Discord Migration)

### Phase A: I/O Adapter Extraction (Start Here)

- Implement external Discord adapter binary (TypeScript is acceptable).
- Implement `info`, `monitor`, `send` to protocol contract level at minimum.
- Ensure outbound supports `thread_id` and `reply_to_id`.
- Emit the required metadata fields so IAM + Manager can make decisions.
- No policy gating inside adapter beyond minimal transport safety.

### Phase B: IAM Defaults + Permission Request Loop

- Implement or configure default IAM policies for Discord.
- Ensure IAM has enough context fields available (channel/account/peer fields, plus metadata like `guild_id` if used).

### Phase C: Manager/Automation Policy Pack

- Add channel-specific behavioral rules as Manager learnings/skills and automations:
  - mention gating
  - group noise handling
  - thread preferences
  - response format norms (e.g. no markdown tables; use code blocks)

---

## Open Questions (Track Explicitly)

1. Should `peer_kind` for Discord guild channels be `group` or `channel` (or both via metadata)?
2. Should IAM conditions first-class `guild_id` and `channel_id` matching, or should we rely on `peer_id` scoping only?
3. Do we need an explicit "ingest-only" decision type distinct from `allow` that means "do not respond" (Manager stage), or is "allowed but Manager decides to be silent" sufficient?
4. Do we want the adapter to implement an active directory listing command early, or rely on passive population via inbound events (recommended default per `CHANNEL_DIRECTORY.md`)?
