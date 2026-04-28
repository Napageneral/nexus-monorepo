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

## Dependencies

- OPUX-008 for measurement hooks.
