# GBP-005 Google Business Profile Credential Validation

## Goal

Validate the GBP package against real Google credentials and sampled upstream
provider data.

## Proof Posture

Primary proof should run in cleanroom first with injected local credentials or
runtime-managed credential binding.

Live local confirmation can follow after the cleanroom path passes.

## Acceptance

1. credentialed health succeeds against visible GBP account scope
2. backfill emits the required row families against real provider data
3. monitor replay proves fresh ingest safely
4. sampled emitted rows match upstream account, location, performance, and
   review values
5. no secrets are written into active docs or committed artifacts

## Current Status

As of March 31, 2026:

- MoonSleep Google OAuth re-consent completed successfully and the stored
  token now includes `https://www.googleapis.com/auth/business.manage`
- direct Google token inspection confirms both `business.manage` and
  `adwords`
- live `adapter.health` no longer fails on scope
- the current blocker is Google Business Profile project access or quota:
  `mybusinessaccountmanagement.googleapis.com` returns
  `429 RESOURCE_EXHAUSTED` with `quota_limit_value = 0` for project
  `822804320930`

This means credential validation is in progress but blocked on GBP project
approval rather than on Nex adapter auth or request construction.
