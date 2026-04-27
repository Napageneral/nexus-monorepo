---
summary: "Review the hardened Nex fork against upstream t3code after performance and UX changes."
title: "OPUX-006 - Upstream Parity Visual Review Pass"
---

# OPUX-006 - Upstream Parity Visual Review Pass

## Why

Performance changes must not drift the fork back into a custom-looking shell.

## Required Outcomes

- side-by-side upstream and Nex-fork screenshots exist
- modified file list remains concentrated in approved seams
- preserved controls still look and behave like upstream

## Planned Changes

- rerun the parity diff commands
- capture side-by-side screenshots after UX hardening
- document any intentional visual deviation

## Current Notes

- source parity commands were rerun during the performance pass:
  upstream `src` file count is `245`, active fork `src` file count is `255`,
  removed upstream files are `0`, Nex-only files are `10`, and modified
  upstream files are `18`
- latest Nex cleanroom screenshot and recording bundle is
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/operator-chat-cleanroom/20260427T161830Z`
- this ticket remains open because the dedicated side-by-side upstream/Nex
  screenshot comparison has not been refreshed yet

## Exit Criteria

- reviewers can see what still matches upstream and what intentionally differs

## Validation

- parity review update
- screenshot bundle
