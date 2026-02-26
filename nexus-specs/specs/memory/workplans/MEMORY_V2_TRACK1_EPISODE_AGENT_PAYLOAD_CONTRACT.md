# MEMORY V2 Track 1: Episode Agent Payload Contract (Writer)

## Status
Draft for implementation

## Objective
Replace noisy writer episode payload formatting with a stable, human-readable contract centered on participants, message content, reply chains, and attachments.

## Customer Experience Goal
Operators can read a writer payload quickly and verify:
1. Who said what.
2. When each message happened (local readable datetime).
3. What messages reply to.
4. What attachments exist and where they are.

Payload should avoid metadata noise that causes extraction drift.

## Hard Cutover Principle
No compatibility mode for the writer payload contract.
- Writer task prompt and payload move to the new schema in one cutover.
- Old payload fields not in contract are removed from writer-facing episode payload.

## Current Problems
1. Writer payload includes internal/noisy fields (`direction`, deep `metadata`, nested delivery IDs).
2. Sender identity uses inconsistent forms (`me`, raw identifiers).
3. Attachments are not consistently available to episode writer sessions.
4. Timestamp readability is poor for manual QA.

## Canonical Writer Payload Contract

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

## Field Rules

### Top-level
- `platform`: required
- `thread`: required
- `participants`: required, deduplicated
- `events`: required, chronological ascending

### Event Fields
- `event_id`: required
- `sender_id`: required, participant reference
- `datetime_local`: required, timezone-aware human-readable string
- `content`: required object
  - `content.type`: one of `text|reaction|membership|image|audio|video|file`
  - `content.value`: message text value (can be empty when content is attachment-only)
- `reply_to_event_id`: optional
- `attachments`: required array (empty allowed)

### Excluded from Writer Payload
- `direction`
- raw `delivery` object
- raw per-event metadata blobs
- writer-only bookkeeping fields (`event_count`, `token_estimate`, `episode_id`)

## Sender Identity Rules
- Normalize owner sender to `participant_id = "owner"`.
- Non-owner phone senders use normalized E.164 when possible.
- Participant display names come from best available resolved name.

## Attachment Naming Rules
- Use `attachments` terminology exclusively for event media.
- Do not use `artifacts` in episode/message payload contracts.

## Content Model Decision
Keep content as object model:
- `content: { type, value }`

Do not split into separate conditional `content_type` + `content` in writer payload.

## Prompt Contract Updates (Writer Task)
Writer task header must include:
1. Facts/entities must come from event content and attachments, not metadata IDs.
2. Metadata IDs (`thread_id`, `sender_id`, `container_id`, platform IDs) are disambiguation only.
3. Contacts/handle entities from delivery metadata are adapter/runtime-owned, not writer-created.

## Source Files Expected to Change
- `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-episodes.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-live.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/meeseeks/memory-retain-episode.ts`
- tests under:
  - `/Users/tyler/nexus/home/projects/nexus/nex/src/memory/retain-episodes.test.ts`
  - `/Users/tyler/nexus/home/projects/nexus/nex/src/nex/automations/meeseeks/memory-retain-episode.test.ts`

## Validation Plan

### Contract Tests
1. Writer payload contains required top-level keys (`platform`, `thread`, `participants`, `events`).
2. Each event has `content: {type,value}`.
3. No event includes raw `direction`, `delivery`, or metadata blobs.
4. `sender_id` values all resolve to listed participant IDs.
5. Datetime format is human-readable and timezone explicit.

### Runtime Spot-Check
Query recent writer user messages in `agents.db` and verify payload text matches contract.

## Acceptance Criteria
1. Writer payload is readable and compact for operator QA.
2. Payload contains only fields relevant to extraction decisions.
3. No metadata-derived entity extraction pressure from payload structure.
4. Attachment references are consistently present in episode events.
5. Existing retain pipeline behavior remains functionally correct.
