---
summary: "Align Frontdoor-hosted cleanroom executors to the same shared validation image family and ensure contract where truthful."
title: "VSB-006 Frontdoor And Hosted Cleanroom Image Family Alignment"
---

# VSB-006 Frontdoor And Hosted Cleanroom Image Family Alignment

## Goal

Align Frontdoor-hosted cleanroom executors to the same image family story as
local Nex proof lanes.

## Scope

- shared runtime base image philosophy
- hosted executor overlay definition
- explicit boundary between production runtime substrate and proof-only browser
  or capture overlays
- hosted cleanroom docs and executor entrypoints that consume the same ensure
  contract when truthful

## Acceptance

- local Nex and hosted cleanroom docs tell one coherent image family story
- Frontdoor executor paths can consume the shared image ensure contract or a
  thin compatible adapter
- proof-only hosted tooling is layered rather than forced into the production
  runtime image itself
- one hosted cleanroom lane documents or proves the aligned image family

## Validation

- focused Frontdoor executor or provider tests
- one hosted cleanroom rerun or truthful doc-backed proof
- `git diff --check`
