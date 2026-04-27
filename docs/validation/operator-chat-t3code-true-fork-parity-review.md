---
summary: "Review contract and latest evidence for proving nex-operator-chat remains a true upstream t3code fork with thin Nex seams."
title: "Operator Chat t3code True Fork Parity Review"
---

# Operator Chat t3code True Fork Parity Review

## Purpose

This validation document proves that `nex-operator-chat` is rooted in the
actual upstream t3code web app rather than a custom recreation.

The proof answers:

- which upstream commit the fork is based on
- which source files were added, removed, or modified
- whether drift is concentrated in explicit Nex seams
- whether the embedded Nex-backed surface still passes the cleanroom operator
  journey

## Canonical Inputs

- upstream repository: `/Users/tyler/nexus/home/projects/t3code`
- upstream commit: `28e481eb24dc7e790b6d1ea963f20024b6a2bbc4`
- preserved upstream package copy:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/upstream-apps-web`
- active Nex fork:
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app`
- cleanroom ladder:
  `/Users/tyler/nexus/home/projects/nexus/nex/docs/validation/operator-chat-cleanroom-validation-ladder.md`

## Review Commands

Run these from any shell:

```bash
diff -qr \
  /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/upstream-apps-web/src \
  /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src
```

```bash
comm -23 \
  <(cd /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/upstream-apps-web/src && find . -type f | sort) \
  <(cd /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src && find . -type f | sort)
```

```bash
comm -13 \
  <(cd /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/upstream-apps-web/src && find . -type f | sort) \
  <(cd /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src && find . -type f | sort)
```

## Latest Review Result

Latest source parity result:

- upstream `src` file count: `165`
- active fork `src` file count: `175`
- removed upstream `src` files: `0`
- Nex-only `src` files: `10`
- modified upstream `src` files: `18`

Nex-only files:

- `src/components/NexContextSheet.tsx`
- `src/index.ts`
- `src/mount.tsx`
- `src/nex/chat-adapter.ts`
- `src/nex/chat-types.ts`
- `src/nex/embed-config.ts`
- `src/nex/feature-policy.ts`
- `src/nex/native-api.ts`
- `src/nex/ws-rpc-client.ts`
- `src/runtimeBrowserClient.ts`

Modified upstream files are limited to expected fork seams:

- route and mount ownership
- native API and websocket bridge ownership
- agent/lane sidebar remap
- chat workspace and header remap
- lane-action controls
- feature-policy styling and viewport behavior
- selected-lane recovery and replay behavior

## Cleanroom Evidence

The latest captured cleanroom proof passed at:

- `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T144405Z`

That bundle includes:

- `videos/full-session.webm`
- `review/full-session-recording.json`
- `playwright/results.json`
- screenshots for initial state, lane-action create/invoke, approvals, manager
  send, worker send, delivery switching, and replay recovery

The focused host-managed debug bundle that unblocked worker-lane reload is:

- `/tmp/operator-chat-proof-bundle-2ffHNj`

## Pass Condition

This parity review passes when:

- upstream provenance is pinned
- no upstream `src` files are removed without explicit justification
- additions are Nex seam files rather than a parallel custom shell
- modified upstream files map to bridge, route, read-model, feature-policy, or
  embed seams
- the embedded fork passes the operator-chat cleanroom proof
