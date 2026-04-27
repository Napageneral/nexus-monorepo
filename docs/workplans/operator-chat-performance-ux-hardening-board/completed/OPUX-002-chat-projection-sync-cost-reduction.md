---
summary: "Reduce chat.snapshot latency by cutting unnecessary full projection synchronization work from the hot path."
title: "OPUX-002 - Chat Projection Sync Cost Reduction"
---

# OPUX-002 - Chat Projection Sync Cost Reduction

## Why

`chat.snapshot` should return a current read model, not rebuild historical event
projection for every lane on every request.

## Required Outcomes

- default snapshot no longer scans every historical message for every lane
- duplicate event backfill avoids per-event existence queries
- selected-lane detail remains correct
- replay semantics remain monotonic and gap-aware

## Planned Changes

- separate cheap lane synchronization from expensive historical event backfill
- only backfill message/approval events when needed for replay correctness
- avoid per-event `SELECT` checks where a unique event id can be inserted
  idempotently
- preserve the existing `chat.replay` contract

## Completion Evidence

- `synchronizeChatProjection` now reads existing replay lane ids once and skips
  historical message/approval event backfill for unchanged lanes that already
  have replay events
- projection backfill now uses idempotent `INSERT OR IGNORE` for synthetic
  replay events instead of checking existence before every insert
- focused chat projection/server/storage tests pass
- runtime build passes
- live `chat.snapshot` returned in about `0.22s` after runtime restart

## Exit Criteria

- focused chat projection/server tests pass
- live `chat.snapshot` no longer hits the default runtime timeout
- cleanroom proof remains green

## Validation

- `pnpm vitest run src/api/chat-projection.test.ts src/api/server-methods/chat.test.ts src/storage/agents.chat-projection.test.ts`
- `nexus runtime call chat.snapshot --json`
- `pnpm build` in `/Users/tyler/nexus/home/projects/nexus/nex`
