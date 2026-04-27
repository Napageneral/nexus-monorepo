---
summary: "Remove or gate unsupported t3code surfaces through a narrow policy layer instead of broad shell rewrites."
title: "OTF-006 - Unsupported Surface Policy And Thin Feature Gates"
---

# OTF-006 - Unsupported Surface Policy And Thin Feature Gates

## Why

Nex does not currently expose several upstream product nouns, but removing them
should not require reauthoring the whole shell.

## Required Outcomes

- IDE, git, PR, terminal, diff, checkpoint, and worktree surfaces are removed
  or gated cleanly
- the remaining shell still looks and behaves like upstream
- Nex-only surfaces do not sprawl into the base layout

## Completion Evidence

- unsupported upstream controls are gated through the fork feature-policy seam
  rather than broad layout rewrites
- IDE, git, PR, terminal, diff, checkpoint, and worktree controls are absent
  from the active operator-facing Chat flow
- lane actions remain exposed through the upstream-style action creation and
  invocation path
- linked public context and delivery selection live in an explicit context
  sheet instead of a default always-open right rail

## File Ownership

Primary ownership for this ticket:

- preserved upstream shell files that expose unsupported controls
- any new local feature-policy layer introduced by the fork

## Planned Changes

- identify the smallest policy seam that can gate unsupported controls
- remove or hide upstream-only product nouns without reauthoring base shell
  behavior
- ensure any Nex-only surface such as linked public context stays auxiliary and
  intentionally invoked

## Exit Criteria

- unsupported controls are absent
- preserved controls still feel exactly like upstream where they remain
- Nex-only additions do not dominate the default viewport

## Validation

- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app typecheck`
- `pnpm --dir /Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app build`
- `bash /Users/tyler/nexus/home/projects/nexus/nex/scripts/e2e/operator-chat-cleanroom-capture.sh`
