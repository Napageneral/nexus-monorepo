# OCH-002 Durable Chat Projection And Event Log

## Goal

Add the durable projection and replayable event log that back the operator chat
contract.

## Why

The operator chat surface requires authoritative snapshots, globally ordered
chat events, and replay recovery.
Those guarantees need a Nex-owned projection and durable event log rather than
best-effort live websocket delivery.

## Scope

- define projection storage for lane summaries
- define projection storage for lane hierarchy
- define projection storage for conversation-scope correlation
- define projection storage for selected delivery target
- define the durable ordered chat event log
- keep projection state derived from canonical ledgers and runtime events

## Acceptance

- Nex has a durable storage model for the operator chat projection
- the chat event log has one monotonic sequence for the operator chat surface
- projection state is sufficient to back replay and lane-directory reads
- the projection does not become a second source of truth for transcript
  messages, public records, approvals, or model truth

## Completed Work

- added durable `agents.db` storage for `chat_lanes`,
  `chat_lane_conversation_links`, `chat_lane_delivery_bindings`, and
  `chat_events`
- added the `0015_chat-projection-and-event-log` migration and idempotent
  cutover helper
- added storage APIs for lane upserts, lane lookup/listing, conversation-link
  management, delivery-binding management, and monotonic event insertion/replay
- proved fresh-install and upgrade/cutover behavior with focused schema tests

## Validation

- `pnpm exec vitest run src/storage/agents.schema-cutover.test.ts src/storage/agents.chat-projection.test.ts`
- `pnpm exec oxfmt --check src/storage/agents.ts src/storage/agents.schema-cutover.test.ts src/storage/agents.chat-projection.test.ts src/storage/migrations/agents/helpers.ts src/storage/migrations/agents/index.ts src/storage/migrations/agents/schema.ts src/storage/migrations/agents/migrations/0015_chat-projection-and-event-log.ts`

## Notes

- the durable chat event log is replayable and monotonic, but it is still fed
  by the operator-chat projection/read side rather than by live runtime
  normalizers; that live-feed work lands in the subsequent tickets
