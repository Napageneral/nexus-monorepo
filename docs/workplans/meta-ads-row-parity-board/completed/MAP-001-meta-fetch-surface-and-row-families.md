# MAP-001 Meta Fetch Surface And Row Families

## Goal

Expand the shared `meta-ads` package from campaign-level metric envelopes into
the required Meta provider row families.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/meta-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/proposals/attribution-adapters/meta-ads-record-mapping.md`

## Current Gap

- the package currently fetches only campaign-level daily insights
- the package does not fetch campaign snapshots, ad-set rows, ad rows, or
  hourly account rows
- the package currently emits many metric-only records per upstream row

## Acceptance

1. the package fetches the required Meta Graph surfaces for:
   - campaign snapshots
   - campaign daily
   - ad-set daily
   - ad daily
   - account hourly
2. each provider row family has a concrete row builder in the package
3. emitted records preserve the source row rather than only derived metrics
