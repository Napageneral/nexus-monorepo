# MAP-005 Docs Validation And Signoff

## Goal

Close the Meta row-parity implementation with synced package docs, active
validation material, and signoff artifacts.

## Current Gap

- package-local contract docs, validation docs, and README now reflect the
  row-shaped Meta contract
- retained cleanroom and provider parity artifacts now exist and are linked from
  active validation material
- broader board signoff can now treat Meta as validated and move to the next
  provider lane

## Acceptance

1. package docs and umbrella docs tell the same Meta contract story
2. active validation docs prove the row-shaped Meta adapter behavior
3. the broader attribution-adapter board can treat Meta as validated and move
   to the next provider lane

## Findings

- package-local spec now explicitly describes the five emitted row families:
  `campaign_snapshot`, `campaign_daily`, `adset_daily`, `ad_daily`, and
  `account_hourly`
- package-local validation now references the retained MoonSleep cleanroom proof
  and the host-side provider parity artifact
- package-local workplan and README now describe the row-shaped contract rather
  than the older smaller metric story
- umbrella validation material for `MAP-004` now points to the same proof set,
  so the package and umbrella docs tell one contract story

## Status

This ticket is complete.
