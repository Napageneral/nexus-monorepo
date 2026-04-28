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
- selected-lane older-history fetch
- lane runtime state freshness for active, idle, failed, and stale sessions

The probe should capture lane count, selected message count, payload byte size,
cursor/window metadata, replay event count, and wall-clock duration.

## Browser Probe

The browser probe must measure:

- console shell first paint
- runtime WebSocket connected
- chat microfrontend bundle loaded
- first `chat.snapshot` response
- time to first visible sidebar lane
- time to selected transcript visible
- time to Echo send/reply reconciliation
- time to context sheet open
- scroll operation responsiveness over a seeded large transcript
- transferred JavaScript and font asset sizes

The browser probe must include a stale-storage scenario where
`localStorage.nexus.control.settings.runtimeUrl` points at an unreachable
runtime while the page is loaded from `/app/console/*`. The expected result is
that the Console still connects to the current runtime origin.

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
- the Chat bundle and font assets have an explicit budget or justified module
  inventory
- the left rail shows manager/agent rows first with worker lanes collapsed by
  default
- selected-lane history is ledger-backed, cursor-friendly, and deduped against
  live events
- Echo send/reply produces exactly one user row and one assistant row
- stale old sessions do not display indefinite active work state
- transcript scrolling remains responsive with large seeded history
- viewport fit does not require page-level browser scrolling for normal use

## Latest Passing Proof

Latest cleanroom proof:

- bundle:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z`
- result:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z/result.json`
- recording:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z/videos/full-session.webm`
- metrics:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z/operator-chat-performance-metrics.json`

Measured values from the passed run:

- `/chat` first ready: `1,280ms`
- manager lane visible after ready: `21ms`
- context sheet open: `97ms`
- document overflow after manager open: `0px`
- large transcript reload ready: `894ms`
- transcript scroll height: `20,092px`
- transcript programmatic scroll exercise: `42.3ms`
- transcript wheel-scroll delta: `1,060px`
