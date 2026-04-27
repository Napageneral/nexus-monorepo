---
summary: "Prove the true-fork shell against upstream by review and cleanroom validation, then close the reset board with truthful evidence."
title: "OTF-008 - Upstream Parity Review Proof And Cleanroom Closeout"
---

# OTF-008 - Upstream Parity Review Proof And Cleanroom Closeout

## Why

The reset only matters if the result actually behaves like upstream where the
products still overlap.

## Required Outcomes

- side-by-side upstream versus Nex-fork review evidence exists
- the embedded Nex surface passes recorded cleanroom proof
- the corpus points at the final canonical proof bundle

## Completion Evidence

- the fork is pinned to upstream t3code commit
  `28e481eb24dc7e790b6d1ea963f20024b6a2bbc4`
- a clean upstream package copy remains available at
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/upstream-apps-web`
- source parity review shows zero removed upstream `src` files, ten Nex-only
  source files, and eighteen modified upstream source files
- the modified file set is concentrated in expected route, bridge, sidebar,
  chat, action, feature-policy, and embed seams
- the parity review is captured at
  `/Users/tyler/nexus/home/projects/nexus/docs/validation/operator-chat-t3code-true-fork-parity-review.md`
- the recorded cleanroom proof passed and retained the whole-session recording
  bundle at
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T144405Z`

## File Ownership

Primary ownership for this ticket:

- operator-chat validation ladder
- operator-chat cleanroom proof board
- any parity-capture scripts or review artifacts added for the fork reset

## Planned Changes

- capture side-by-side upstream and Nex-fork review evidence
- rerun recorded cleanroom proof after the true-fork reset lands
- update the active corpus to point at the new proof bundle and parity evidence

## Exit Criteria

- reviewers can compare current upstream and the Nex fork directly
- the cleanroom proof for the embedded surface passes again
- the board closes with truthful evidence rather than aspiration

## Validation

- `diff -qr /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/upstream-apps-web/src /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app/src`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app build`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build`
- `bash /Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
