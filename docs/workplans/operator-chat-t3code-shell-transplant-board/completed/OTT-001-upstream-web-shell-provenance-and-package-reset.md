# OTT-001 Upstream Web Shell Provenance And Package Reset

## Goal

Reset `nex-operator-chat` around a real upstream-derived `t3code` web app
structure instead of the current custom React replacement.

## Why

The desired product direction is to preserve upstream `t3code` shell quality,
not to keep repainting a local imitation.

## Scope

- record the upstream commit and provenance for the transplant
- replace the current custom package baseline with an upstream-derived app
  structure
- carry over the upstream app entrypoints, shell layout, component system,
  router shape, and theme stack
- remove the current placeholder UI baseline from the fork center of gravity

## Implementation Notes

- the fork center of gravity remains `packages/apps/nex-operator-chat/app`
- the preferred provenance source is upstream `apps/web`
- this ticket should establish a durable vendoring pattern so future upstream
  diffs stay auditable
- preserve shell primitives first; data-model remapping happens in later
  tickets

## Acceptance

- `nex-operator-chat` clearly reads as an upstream-derived web fork
- the package tree and app entrypoints preserve the upstream shell structure
- provenance is documented in the fork package or adjacent docs
- the current custom sidebar and workspace scaffold no longer define the app

## Validation

- `pnpm install`
- `pnpm build`
- package-level test pass for the reset baseline

## Current Result

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/README.md`
  now records the upstream provenance and inspected commit for the fork
- the package tree now preserves upstream-style app entrypoints through
  `main.tsx`, `router.tsx`, `routes/__root.tsx`, and `_chat.index.tsx`
- upstream-derived shell primitives in `AppSidebarLayout.tsx`, `Sidebar.tsx`,
  `ChatView.tsx`, `ProjectScriptsControl.tsx`, and `index.css` now define the
  app baseline
- the previous local placeholder sidebar and workspace scaffold no longer
  define the package center of gravity
