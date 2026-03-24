# Nex Operator Console Package Validation Cutover

## Goal

Prove that the extracted operator console works through the canonical package lane rather than the local sync shortcut.

## Required Outcomes

1. `nexus package validate` passes for `app/`
2. `nexus package release` produces a tarball
3. Frontdoor publish accepts the release artifact
4. runtime install works from the published app package

## Hard Rules

1. no fallback to kernel-owned UI assets
2. no local-sync-only validation claims
3. fix only the real package gaps exposed by the canonical lane
