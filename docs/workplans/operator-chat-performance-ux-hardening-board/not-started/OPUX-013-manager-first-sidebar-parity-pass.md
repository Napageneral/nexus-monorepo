---
summary: "Refine the t3code sidebar mapping so agent rows look and behave like upstream rows without folder semantics."
title: "OPUX-013 - Manager-First Sidebar Parity Pass"
---

# OPUX-013 - Manager-First Sidebar Parity Pass

## Why

The operator wants the t3code visual and behavioral shell preserved, but with
Nex nouns: agents first, subagents/workers behind explicit expansion. The
sidebar should not look like a filesystem folder list.

## Required Outcomes

- Agent rows are primary rows with upstream-like spacing, hover, active, and
  overflow behavior.
- Expand affordance is hidden until hover/focus and opens worker lanes.
- Worker lanes are collapsed by default for normal entry.
- Deep-linked worker lanes expand their parent just enough for orientation.
- Non-filesystem rows do not use folder semantics or folder icons.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/Sidebar.tsx`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/ProjectFavicon.tsx`
- Related CSS modules or styling surfaces in the t3code fork.

## Acceptance

- Visual review against upstream t3code shows the row mechanics are preserved.
- The default view shows manager/agent rows, not every worker.
- Expanding an agent does not trigger unnecessary global snapshot refresh.

## Validation

- Side-by-side screenshots with upstream t3code.
- Browser test for default collapsed sidebar, hover/focus affordance, and
  worker expansion.

## Dependencies

- OPUX-010 for lazy worker detail.
