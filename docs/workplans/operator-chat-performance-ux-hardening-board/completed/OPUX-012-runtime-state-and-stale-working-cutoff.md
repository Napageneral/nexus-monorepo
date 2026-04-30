---
summary: "Project lane working state from current Nex runtime state so stale sessions do not appear to run forever."
title: "OPUX-012 - Runtime State And Stale Working Cutoff"
---

# OPUX-012 - Runtime State And Stale Working Cutoff

## Why

Several lanes showed `Working...` for hundreds of hours. The browser should not
infer active work from old transcript or session residue. Nex should project
the current lane runtime state explicitly.

## Required Outcomes

- Lane runtime state is computed server-side from current run/session state.
- Stale active indicators age out according to a documented runtime projection
  cutoff.
- The UI displays active, idle, failed, or stale states from the projection
  rather than guessing locally.
- Aborting a genuinely active run still routes through the canonical runtime
  command.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/chat-projection.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/api/server-methods/chat.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/ChatView.tsx`

## Acceptance

- Old lanes no longer display indefinite `Working...` unless a current active
  run exists.
- Active runs still show active status and can be aborted.
- Stale state is visible enough for debugging but not presented as live work.

## Validation

- Unit tests covering active, idle, failed, and stale run projections.
- Browser probe confirms no stale multi-hour working indicator on seeded old
  sessions.

## Closeout

Completed 2026-04-28.

Implemented the runtime projection cutoff in Nex rather than the browser:

- active, queued, or approval-waiting lane state older than two hours is
  projected as `idle`
- stale projected activity clears `active_request_id`
- stale projected activity sets `can_abort` to `false`
- stale projected activity gets the diagnostic subtitle `Stale active state
  aged out`
- fresh active session work remains active and abortable
- old failed lanes remain failed but not abortable
- the t3code fork maps the stale diagnostic subtitle into a non-pulsing
  `Stale` sidebar badge instead of `Working...`

Verification run:

- `pnpm vitest run src/api/chat-projection.test.ts src/api/server-methods/chat.test.ts`
- `pnpm vitest run src/nex/chat-adapter.test.ts src/store.test.ts src/components/Sidebar.logic.test.ts`
- `pnpm build` in `/Users/tyler/nexus/home/projects/nexus/nex`
- `pnpm build` in `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app`
- `pnpm build` in `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app`
- `pnpm exec tsx scripts/sync-operator-console-package.ts`
- `nexus runtime restart`
- live `chat.snapshot` for Echo returned stale proof-worker lanes as idle,
  non-abortable, and annotated with the stale subtitle
- browser probe selected Echo with zero `Working...`/`Working for` text present

## Dependencies

- OPUX-008 for measurement hooks.
