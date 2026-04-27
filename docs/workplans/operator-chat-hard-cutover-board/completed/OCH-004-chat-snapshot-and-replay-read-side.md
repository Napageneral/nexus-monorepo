# OCH-004 Chat Snapshot And Replay Read Side

## Goal

Implement the read side of the operator chat contract before command-side UI
integration begins.

## Why

The microfrontend should bootstrap and recover from a real Nex snapshot and
replay contract, not from ad hoc runtime calls stitched together in the client.

## Scope

- implement `chat.snapshot`
- implement `chat.replay`
- assemble lane detail from canonical ledgers at one consistent chat sequence
- implement reset-required behavior when contiguous replay is unavailable
- prove sequence-gap recovery semantics at the contract level

## Acceptance

- `chat.snapshot` returns one internally consistent chat read model
- `chat.replay` returns ordered events after a supplied sequence
- replay gaps can be detected and recovered deterministically
- the read side uses the session ledger as the primary transcript source

## Completed Work

- implemented `chat.snapshot` against the Nex-owned projection/read side
- implemented `chat.replay` against the durable chat event log in `agents.db`
- assembled lane detail from the session ledger, linked public conversation
  records, and permission-request approvals
- added deterministic `reset_required` behavior when replay continuity is
  broken
- replaced the previous `UNAVAILABLE` stubs for snapshot/replay with live
  runtime handlers

## Validation

- `pnpm exec vitest run src/api/server-methods/chat.test.ts src/storage/agents.schema-cutover.test.ts src/storage/agents.chat-projection.test.ts src/capabilities/chat/index.test.ts src/capabilities/core-runtime.test.ts src/api/runtime-operations.conformance.test.ts src/api/openapi/nex-contract.schema-registry.test.ts`

## Notes

- the read side currently emits lane, message, and approval replay events from
  the durable projection/event log; richer activity-event normalization remains
  follow-on work
