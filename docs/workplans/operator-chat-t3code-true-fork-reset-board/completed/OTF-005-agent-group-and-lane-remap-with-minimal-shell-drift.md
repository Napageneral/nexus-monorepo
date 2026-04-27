---
summary: "Remap upstream project and thread presentation onto agent groups and lanes while keeping shell drift tightly constrained."
title: "OTF-005 - Agent Group And Lane Remap With Minimal Shell Drift"
---

# OTF-005 - Agent Group And Lane Remap With Minimal Shell Drift

## Why

The operator chat product still needs Nex nouns, but the shell should keep
feeling like upstream.

## Required Outcomes

- top-level groups map to directly chatable agents
- nested rows map to worker lanes
- direct manager lanes remain primary and workers stay collapsed until expanded
- row density, hover states, timestamps, and active-state treatment stay close
  to upstream behavior

## Completion Evidence

- upstream project/thread grammar is preserved as the agent/lane presentation
  model
- top-level rows show directly chatable agents first
- worker lanes remain nested under the agent group and require explicit
  expansion or deep-link selection
- row density, active state, hover treatment, timestamps, and previews are kept
  inside the upstream sidebar shell instead of a custom agent-lane layout
- the recorded cleanroom proof covers manager-lane selection and direct
  worker-lane chat from the same global Chat tab

## File Ownership

Primary ownership for this ticket:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/Sidebar.tsx`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/Sidebar.logic.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/components/ChatView.tsx`

## Planned Changes

- remap project groups to top-level agent groups
- remap thread rows to direct manager and worker lanes
- preserve upstream row sizing, hover behavior, active treatment, and ordering
  semantics as closely as possible
- keep worker lanes collapsed until explicit expansion

## Exit Criteria

- operators mostly see the manager/direct-agent surface first
- worker lanes feel like a truthful nested extension of upstream thread rows
- the shell still visually reads as upstream rather than a custom agent app

## Validation

- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build`
- `bash /Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
