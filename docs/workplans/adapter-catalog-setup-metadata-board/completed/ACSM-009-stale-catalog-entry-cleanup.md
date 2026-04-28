# ACSM-009 Stale Catalog Entry Cleanup

## Goal

Clean up catalog drift that would confuse operators during Add App setup.

## Why

The deployed Frontdoor registry previously contained a stale
`nexus-adapter-git` release while the local package tree contained a retired
`git` tombstone. Some published adapter versions also lagged local package
versions.

## Scope

- audit stale Frontdoor package ids against local adapter manifests
- remove or deactivate stale legacy package entries
- align package ids for current adapters
- add a catalog drift check to the publish or validation flow
- update board matrix after cleanup

## Acceptance

- stale `nexus-adapter-git` no longer appears as an active published adapter
- current adapter package ids match published catalog ids
- publish validation flags local package versions newer than published releases
- Frontdoor catalog no longer exposes retired package entries as setup options

## Completion Notes

- Operator approval was granted on 2026-04-27.
- The deployed Frontdoor catalog no longer returns active `git` or
  `nexus-adapter-git` setup options.
- Published package versions were refreshed for adapters that had lagged local
  source versions, including Meta Ads, Shopify, TikTok Business, and TikTok
  Display.
- The local runtime still reports the retired `git` tombstone as unpublished
  local inventory; that is intentionally not an active Frontdoor catalog entry.
