---
summary: "Reset packages/apps/nex-operator-chat/app to a vendored upstream apps/web baseline with minimal structural drift."
title: "OTF-002 - Package Reset To Upstream apps/web Baseline"
---

# OTF-002 - Package Reset To Upstream apps/web Baseline

## Why

The current package only partially mirrored upstream.
We needed the real upstream app structure in place before applying Nex patches.

## Required Outcomes

- `nex-operator-chat/app` mirrors upstream `apps/web` package structure as
  closely as practical
- upstream scripts, dependencies, route files, and shell entry points are
  restored where compatible
- vendored files remain byte-identical unless a Nex patch is explicitly needed

## Implementation Notes

- the pinned upstream baseline is
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/upstream-apps-web`
- the baseline source commit is upstream `t3code` commit `28e481eb`
- the active app has the same upstream route file set and the same upstream
  package script/dependency surface
- the active app currently has `255` source files versus `245` upstream source
  files because it adds the explicit Nex seam files under `src/nex`, mount
  entrypoints, and the context sheet
- the remaining non-build diffs are concentrated in upstream shell files that
  host the Nex seam: `Sidebar.tsx`, `ChatView.tsx`, route entry files,
  `nativeApi.ts`, `wsNativeApi.ts`, `wsRpcClient.ts`, `router.ts`,
  `uiStateStore.ts`, and the feature-gated CSS
- generated `dist/`, `node_modules/`, and `tsconfig.tsbuildinfo` are local
  build artifacts and are not part of the upstream-drift review surface

## Validation

- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck`

Both passed on 2026-04-27.
