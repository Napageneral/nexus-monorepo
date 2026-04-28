---
summary: "Add repeatable timing evidence for Console Chat boot, runtime connection, snapshot, paint, and scroll readiness."
title: "OPUX-008 - Perf Instrumentation And Browser Probe"
---

# OPUX-008 - Perf Instrumentation And Browser Probe

## Why

The current operator reports mix several distinct failures: runtime connection
delay, chat bundle load, snapshot latency, render cost, and scroll jank. The
next optimization pass needs measured phase timings so fixes target the real
cost centers.

## Required Outcomes

- Console Chat emits first-party performance marks for shell load, runtime
  connection, chat bundle load, and snapshot response.
- A repeatable Playwright probe records those timings for `/app/console/chat`
  against a live or cleanroom runtime.
- The probe can poison persisted runtime settings and verify runtime-served
  console pages still connect to the current origin.
- The metrics output is JSON and suitable for cleanroom artifact capture.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/ui/app-runtime.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/console/components/chat-microfrontend-host.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/e2e/`

Do not change product behavior beyond adding low-overhead timing and the probe.

## Acceptance

- The probe reports phase timings and failure reason when Chat does not become
  usable.
- A stale stored `runtimeUrl` cannot reproduce a runtime-served Chat connection
  failure.
- Existing Console and Chat tests still pass.

## Completion Evidence

- Added runtime connection timing around `runtime.websocket.connect`.
- Added bridge timing for Chat runtime calls such as `chat.snapshot`.
- Added chat microfrontend load and mount timings.
- Added `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/scripts/operator-chat-perf-probe.mjs`.
- Synced the rebuilt Console bundle into the installed runtime-served package.
- Local probe against `/app/console/chat` captured:
  - Console shell script: about `449 KB`
  - Chat microfrontend script: about `2.72 MB`
  - remote font CSS requests still on first paint
  - `chat.snapshot` at about `4.0s` in one run and `0.7s` in a repeated stale-storage run
  - stale stored `runtimeUrl = ws://127.0.0.1:9` still resolved to `ws://127.0.0.1:18789`

## Validation

- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app test -- --run src/ui/storage.test.ts`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app build`
- The new browser probe against `/app/console/chat`

## Dependencies

None.
