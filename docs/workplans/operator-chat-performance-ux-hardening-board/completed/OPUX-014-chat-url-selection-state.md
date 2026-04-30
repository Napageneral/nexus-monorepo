---
summary: "Make Chat URL lane selection deterministic so stale lane params do not produce confusing default states."
title: "OPUX-014 - Chat URL Selection State"
---

# OPUX-014 - Chat URL Selection State

## Why

The operator saw default lane parameters appear when clicking the Chat tab.
Chat entry should be deterministic: no lane means neutral picker, valid lane
means selected lane, invalid lane clears itself.

## Required Outcomes

- Top-level Console navigation to Chat uses `/app/console/chat` without a
  default lane parameter.
- Selecting a lane writes a lane parameter.
- Invalid or stale lane parameters clear back to neutral picker after snapshot.
- Returning from other Console tabs does not resurrect stale lane state.

## Scope

Owned surfaces:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/ui/navigation.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/ui/app.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/console/components/chat-microfrontend-host.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`

## Acceptance

- Clicking the Chat nav item does not add a lane by itself.
- Valid lane deep links remain supported.
- Invalid lane deep links clear visibly and do not leave the UI half-selected.

## Validation

- Console navigation browser tests.
- OPUX-008 browser probe for neutral Chat entry and selected-lane entry.

## Dependencies

- OPUX-008 for entry-state probe coverage.

## Closeout

Source already carried the hard-cutover URL lane selection path: the Console
Chat page passes the lane query parameter into the embedded t3code fork, the
host updates the URL when the embedded route changes, and Console navigation
only clears stale `lane` parameters when leaving Chat.

The runtime-served Console package was stale. It still served a bundle without
`initialLaneId`, `onLaneSelectionChange`, or Chat-preserving lane navigation.
The Console and Chat microfrontend apps were rebuilt, the Console package was
synced into the runtime package store, and the runtime was restarted.

Verification:

- `pnpm --dir packages/apps/nex-operator-console/app test -- --run src/ui/navigation.browser.test.ts`
- `pnpm --dir packages/apps/nex-operator-chat/app test -- --run src/nex/chat-adapter.test.ts src/store.test.ts`
- `pnpm --dir packages/apps/nex-operator-chat/app build`
- `pnpm --dir packages/apps/nex-operator-console/app build`
- `NEXUS_OPERATOR_CONSOLE_REUSE_PREBUILT=1 pnpm --dir nex exec tsx scripts/sync-operator-console-package.ts`
- `nexus runtime restart`
- runtime-served `/app/console/chat?lane=lane%3Aagent%3Aentity-assistant`
  now serves `assets/index-DCbXsNz0.js`
- runtime-served bundles contain `initialLaneId`, `onLaneSelectionChange`, lane
  query writes, lane query clears, and `chat.microfrontend.load`
