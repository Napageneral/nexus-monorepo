# ACSM-007 Frontdoor Publish All Adapters

## Goal

Republish every supported adapter into Frontdoor with setup descriptor metadata.

## Why

The Console modal's Published catalog section must come from Frontdoor and
should show the full supported adapter set, not only installed local adapters.

## Scope

- build adapter packages with generated setup descriptors
- publish all supported adapters to the Frontdoor package registry
- update stale published versions for Meta Ads, Shopify, and TikTok Business
- remove or replace stale legacy Git package state
- record publish outputs and release ids

## Acceptance

- Frontdoor package registry contains the supported adapter set
- every published adapter release has setup descriptor metadata
- stale versions are updated to current local package versions
- stale legacy Git state is removed or marked unavailable
- `/api/adapters/catalog` returns the expected adapter count and setup methods

## Completion Notes

- Operator approval was granted on 2026-04-27.
- 28 supported adapter releases were published into the deployed Frontdoor
  package registry with generated setup descriptor metadata.
- The retired local `git` tombstone was not published as an active Frontdoor
  catalog entry.
- `https://frontdoor.nexushub.sh/api/adapters/catalog` returned 28 published
  adapters and `missingSetup: []`.
