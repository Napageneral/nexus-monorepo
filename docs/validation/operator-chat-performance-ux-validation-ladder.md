---
summary: "Cleanroom-backed validation ladder for operator Chat performance, scrolling, sidebar behavior, and viewport fit."
title: "Operator Chat Performance UX Validation Ladder"
---

# Operator Chat Performance UX Validation Ladder

## Goal

Prove that the t3code-backed Nex Chat tab is fast and usable with real-world
lane and transcript volume.

## Supporting Checks

Run these before a cleanroom performance proof:

```bash
pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck
pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build
pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app build
pnpm vitest run src/api/chat-projection.test.ts src/api/server-methods/chat.test.ts src/storage/agents.chat-projection.test.ts
```

## Runtime Probe

The runtime probe must measure:

- `chat.snapshot` with no explicit lane
- `chat.snapshot` with a manager lane
- `chat.snapshot` with a worker lane
- `chat.replay` after a recent sequence

The probe should capture lane count, selected message count, payload byte size,
and wall-clock duration.

## Browser Probe

The browser probe must measure:

- time to first visible sidebar lane
- time to selected transcript visible
- time to context sheet open
- scroll operation responsiveness over a seeded large transcript

## Cleanroom Proof

The proof should extend the existing operator-chat cleanroom path rather than
creating a second product harness:

- `/Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/e2e/07-operator-chat.spec.ts`

The performance proof may add a dedicated scenario if the golden journey would
become too noisy.

## Pass Conditions

Pass when:

- default `chat.snapshot` returns inside the runtime API timeout
- explicit selected-lane snapshots return within a bounded budget
- `/chat` first usable state is measurable and stable in cleanroom
- the left rail shows manager/agent rows first with worker lanes collapsed by
  default
- transcript scrolling remains responsive with large seeded history
- viewport fit does not require page-level browser scrolling for normal use
