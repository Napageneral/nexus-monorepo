# GAP-005 MoonSleep Google Credential Validation

## Goal

Validate the Google Ads row-parity package against real MoonSleep Google Ads
credentials and sampled upstream provider data.

## Proof Posture

Primary proof should run in cleanroom first with injected local credentials or
runtime-managed credential binding.

Live local confirmation can follow after the cleanroom path passes.

## Current Gap

- no Google Ads row-parity cleanroom proof exists yet
- no sampled upstream parity artifacts exist yet for the shared Google Ads
  package
- no real MoonSleep validation has been recorded for backfill or live monitor
  on the Google Ads acquisition surface

## Acceptance

1. credentialed health succeeds against the MoonSleep Google Ads account scope
2. backfill emits all required row families against real provider data
3. sampled emitted rows match upstream ids, dates, impressions, clicks, cost,
   `cost_micros`, conversions, and `conversions_value`
4. replay of recent windows shows correct dedupe for unchanged rows and new
   arrivals for changed rows
5. no secrets are written into active docs or committed artifacts
