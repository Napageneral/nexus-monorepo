---
summary: "Measure operator chat runtime snapshot cost and identify the first real hot path before UI polish."
title: "OPUX-001 - Runtime Snapshot Baseline And Hot Path Map"
---

# OPUX-001 - Runtime Snapshot Baseline And Hot Path Map

## Why

The Chat tab cannot feel snappy if the runtime snapshot path exceeds the API
timeout before React can render.

## Required Outcomes

- live and cleanroom snapshot timings are captured
- payload size, lane count, and selected transcript size are recorded
- the first backend hot path is identified
- the next optimization ticket has concrete evidence

## Current Evidence

- `nexus runtime call chat.snapshot --json` against the live workspace timed out
  after the default 10s runtime timeout on 2026-04-27
- the likely first hot path is `synchronizeChatProjection`, which currently
  performs full lane projection and historical message/approval event
  backfill work before every snapshot response
- after OPUX-002 optimization, the same call returned in about `0.22s` with
  `116` lanes, `24` selected-lane messages, and a `154 KB` payload

## File Ownership

- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/chat-projection.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/server-methods/chat.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`

## Planned Changes

- add a repeatable runtime probe if none exists
- measure live runtime behavior without treating live dogfood as final proof
- map expensive code paths and move implementation work into OPUX-002

## Exit Criteria

- the timeout is reproduced or measured
- the hot-path diagnosis is written down
- OPUX-002 has enough specificity to implement a targeted fix

## Validation

- before: `time nexus runtime call chat.snapshot --json` timed out after the
  default 10s runtime timeout
- after: `time nexus runtime call chat.snapshot --json` returned in about
  `0.22s`
- `pnpm vitest run src/api/chat-projection.test.ts src/api/server-methods/chat.test.ts src/storage/agents.chat-projection.test.ts`
