---
summary: "Reintegrate the true-fork chat app into the operator console host and revalidate the app builds."
title: "OTF-007 - Console Host Reintegration And Build Validation"
---

# OTF-007 - Console Host Reintegration And Build Validation

## Why

The upstream-fork reset still needs to mount cleanly inside the existing Nex
operator console.

## Required Outcomes

- console host mounts the restored fork correctly
- runtime connection handoff still works
- operator console and chat app both build and test cleanly

## Completion Evidence

- the operator console host mounts the restored forked microfrontend entrypoint
- runtime connection handoff still reaches the Nex-backed chat bridge
- the console build passes after the fork reset and embedded route changes
- the cleanroom proof opens `/chat` through the operator console host rather
  than a standalone chat-only app

## File Ownership

Primary ownership for this ticket:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/console/components/chat-microfrontend-host.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/console/pages/chat.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app`

## Planned Changes

- reconnect the console host to the restored fork entrypoint
- preserve runtime handoff and embedded mounting semantics
- validate package builds and test suites again after reintegration

## Exit Criteria

- the console host mounts the true-fork app rather than the derivative shell
- runtime handoff remains stable
- both packages validate cleanly

## Validation

- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app build`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build`
- `bash /Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
