---
summary: "Restore an upstream-like route model so /chat stays clean and lane identity only enters the route when explicitly selected."
title: "OTF-003 - Route Parity And Clean Chat Index Restoration"
---

# OTF-003 - Route Parity And Clean Chat Index Restoration

## Why

The route model must preserve upstream selected-chat behavior while mapping the
selected object to a Nex lane.

## Required Outcomes

- route structure is again recognizably upstream
- `/chat` is a clean index state
- lane selection uses an upstream-like selected-chat route model
- implicit default selection does not dirty the URL

## Completion Evidence

- the active local route files match the upstream route file set
- `/chat` stays a clean index state until the operator explicitly selects a lane
- selected manager and worker lanes deep-link through the upstream selected
  thread route slot
- worker-lane reload now requests lane-specific hydration and retries empty
  selected-lane hydration until the lane detail read model lands
- the host-managed cleanroom proof passed through the worker send/reload segment
  at `/tmp/operator-chat-proof-bundle-2ffHNj`
- the recorded cleanroom proof passed at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T144405Z`

## File Ownership

Primary ownership for this ticket:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/routes/`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/router.ts`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src/nex/chat-adapter.ts`

## Planned Changes

- keep the upstream-like chat layout route and selected-chat route
- reuse the selected-route slot for lane identity rather than inventing a new
  global query-param model
- keep `/chat` clean until the user explicitly selects a lane
- preserve deep linking for explicitly opened manager or worker lanes
- add or tighten proof coverage around reload after explicit worker-lane
  selection

## Exit Criteria

- route ownership is recognizably upstream
- default lane selection no longer dirties the URL
- explicit lane navigation still works for both manager and worker lanes
- worker-lane reload shows the correct selected-lane transcript

## Validation

- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app build`
- `NEXUS_CLEANROOM_FULL_SESSION_RECORDING=0 bash /Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-host.sh`
- `bash /Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
