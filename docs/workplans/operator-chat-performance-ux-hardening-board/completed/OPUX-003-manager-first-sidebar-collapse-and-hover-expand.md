---
summary: "Make the t3code sidebar manager-first for Nex by keeping worker lanes collapsed until explicit expansion."
title: "OPUX-003 - Manager-First Sidebar Collapse And Hover Expand"
---

# OPUX-003 - Manager-First Sidebar Collapse And Hover Expand

## Why

Most operators should see manager/agent lanes first. Worker lanes should be
available but not visually dominant.

## Completion Evidence

- the upstream project/thread shell is preserved
- embedded Nex agent rows now select the manager lane directly
- worker lanes are collapsed by default unless a deep-linked worker is selected
- worker reveal is isolated to a secondary hover/focus expand affordance
- non-filesystem Nex rows no longer use folder fallback icons

## Required Outcomes

- agent rows are primary and selectable: complete
- worker lanes are collapsed by default: complete
- expansion is a deliberate secondary action: complete
- hover/focus affordance stays close to upstream t3code behavior: complete

## Changed Surfaces

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/Sidebar.tsx`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/ProjectFavicon.tsx`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/e2e/07-operator-chat.spec.ts`

## Exit Criteria

- default `/chat` shows agent rows, not expanded worker lists
- selecting an agent opens the manager lane
- expanding an agent reveals worker lanes
- deep-linked worker lanes expand their parent enough for orientation

## Validation

- `pnpm typecheck` in `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app`
- `pnpm build` in `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app`
- `pnpm build` in `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app`
- `pnpm test -- src/ui/navigation.browser.test.ts` in `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app`
