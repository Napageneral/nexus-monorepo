# OCH-006 t3code Fork Baseline And Surface Deletion

## Goal

Create the Nex-owned `t3code` web fork and delete unsupported upstream
surfaces immediately.

## Why

The hard cut is a Nex-owned chat microfrontend, not a drop-in stock `t3code`
app. Unsupported project, thread, worktree, terminal, diff, and checkpoint
surfaces should not linger as dead weight in the fork.

## Scope

- establish the Nex-owned fork location in the repo and record upstream
  provenance
- preserve the React shell, timeline rendering, and provider/model picker
  patterns that survive the cut
- delete project/worktree/git/terminal/diff/runtime-mode surfaces immediately
  rather than hiding them behind flags
- set the fork up as a lane-based chat microfrontend base rather than a stock
  `project -> thread` app

## Implementation Notes

- the fork center of gravity is upstream `apps/web`
- the shell pieces worth carrying forward are:
  - `src/main.tsx`
  - `src/router.ts`
  - `src/components/AppSidebarLayout.tsx`
  - `src/components/ChatView.tsx`
  - `src/components/chat/MessagesTimeline.tsx`
  - `src/components/chat/ProviderModelPicker.tsx`
- the first rewrite seam is the sidebar/thread model:
  - `src/components/Sidebar.tsx`
  - `src/components/Sidebar.logic.ts`
  - `src/store.ts`
  - `src/types.ts`
  - `src/routes/_chat.$threadId.tsx`
- the unsupported upstream surfaces that should be deleted in the fork are:
  - `ChatHeader.tsx`
  - `BranchToolbar*.tsx`
  - `GitActionsControl*.tsx`
  - `ProjectScriptsControl.tsx`
  - `ProjectFavicon.tsx`
  - `PullRequestThreadDialog.tsx`
  - `ThreadTerminalDrawer.tsx`
  - terminal state/context helpers
  - `DiffPanel*.tsx`
  - diff-rendering helpers
  - runtime-mode toggle controls

## Provenance

- upstream reference inspected at commit
  `c6f57a106493e893233a38b3b1132978c942c88e`

## Acceptance

- the fork is owned from within the Nex repo structure
- unsupported upstream surfaces are deleted rather than hidden behind flags
- the remaining shell is the minimal viable base for the Nex lane-based chat UI

## Completion Notes

- a new package boundary now exists at
  `packages/apps/nex-operator-chat/app`
- the fork baseline includes:
  - package metadata and Vite/TypeScript config
  - a mountable React app entrypoint and exported mount surface
  - sidebar layout shell
  - sidebar scaffold
  - chat workspace scaffold
  - lane-oriented chat types
  - a Nex-native chat controller and store scaffold
  - provenance documentation
- the deleted stock surfaces are absent from the baseline by design

## Validation

- `pnpm install`
- `pnpm build`
- `pnpm test`

## Notes

- the original offline-only install blocker was resolved by completing a normal
  dependency fetch/install lane for `packages/apps/nex-operator-chat/app`
- unsupported upstream project, worktree, terminal, diff, and runtime-mode
  surfaces remain absent from the Nex-owned baseline rather than hidden behind
  flags
