---
summary: "Reduce default Chat load cost by pruning unused t3code feature imports and removing remote first-paint asset dependencies."
title: "OPUX-009 - Chat Bundle And Asset Budget"
---

# OPUX-009 - Chat Bundle And Asset Budget

## Why

The runtime connection can be fast while Chat still feels slow because the
embedded t3code fork ships a large default bundle and remote font dependency.
The Nex fork should preserve upstream Chat visual behavior without loading
terminal, worktree, diff, checkpoint, IDE, or pull-request surfaces on the
default path.

## Required Outcomes

- Bundle analysis identifies the largest default Chat chunks and their import
  owners.
- Unused code-oriented t3code surfaces are removed from the default Chat import
  graph.
- Fonts and required visual assets are served locally or bundled so first paint
  does not depend on remote font CSS.
- A bundle budget is recorded in the validation output.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/console/components/chat-microfrontend-host.ts`
- Vite build configuration for the Console and Chat packages where needed.

Preserve the upstream t3code Chat shell visual language. This ticket is not a
custom redesign.

## Acceptance

- Default Chat bundle size decreases or the remaining size is justified with a
  concrete module list.
- Remote font CSS is no longer required for the runtime-served Console Chat
  first paint.
- Upstream parity-sensitive components still render correctly.

## Validation

- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app build`
- Browser probe from OPUX-008 with transferred asset sizes captured.

## Dependencies

- OPUX-008 for measured before/after evidence.

## Result

Status: completed on 2026-04-28.

Default-path pruning:

- Converted syntax highlighting to dynamically import `@pierre/diffs` only when
  rendering a code fence.
- Moved diff panel content, diff worker provider, terminal drawer, branch
  toolbar, pull-request dialog, git actions, and open-in-editor controls behind
  dynamic imports.
- Removed remote Google Fonts CSS imports from the runtime-served Console
  first-paint styles.

Measured bundle effect:

- Standalone chat entry decreased from about `1.8 MB` to `1.28 MB` minified.
- Runtime-embedded chat entry decreased from about `2.72 MB` to `2.06 MB`
  transferred script payload.
- Deferred chunks now hold the t3code code/worktree surfaces: terminal drawer,
  branch toolbar, git actions, PR dialog, diff panel/provider, and syntax
  highlighter language payloads.

Remaining justified default payload:

- The chat entry still includes core t3code shell, router/store, sidebar,
  composer, markdown rendering, command/action controls, and Nex bridge code.
- The sidebar still carries upstream sortable/project-list machinery; OPUX-013
  owns the manager-first sidebar parity pass and can decide whether to preserve
  or defer sortable behavior for Nex agent lanes.

Validation evidence:

- `pnpm build` passed in
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app`.
- `pnpm build` passed in
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app`.
- `pnpm exec tsx scripts/sync-operator-console-package.ts` synced console
  release `1.0.0` into
  `/Users/tyler/nexus/state/packages/installed/app/console/releases/1.0.0`.
- Browser probe clean run completed in `932ms`, with runtime connected, sidebar
  present, no console errors, no remote font resources, console shell
  `448858` bytes, and embedded chat script `2063530` bytes.
- Browser probe with poisoned persisted runtime URL still connected to
  `ws://127.0.0.1:18789`; it completed in `5091ms`, with no console errors and
  the same local-only script resources.
