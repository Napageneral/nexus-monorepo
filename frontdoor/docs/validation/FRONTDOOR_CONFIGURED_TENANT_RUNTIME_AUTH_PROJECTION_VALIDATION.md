---
title: "Frontdoor Configured Tenant Runtime Auth Projection Validation"
summary: "Validation ladder for local Frontdoor shell/runtime auth projection."
---

# Frontdoor Configured Tenant Runtime Auth Projection Validation

## Rung 0: Baseline failure capture

- confirm the broken state before fix:
  - app install succeeds
  - `/runtime/health` returns `401`
  - runtime itself is healthy and has the app active

## Rung 1: Unit regression

- test persisted-null server row + configured tenant token
- pass if Frontdoor proxies `/runtime/health` with the configured direct token

## Rung 2: Hosted-path non-regression

- existing tests for frontdoor-minted runtime JWT path stay green
- existing tests for persisted `runtimeAuthToken` path stay green

## Rung 3: Local runtime proxy proof

- log into local Frontdoor
- verify `/runtime/health` returns `200`
- verify `/runtime/api/apps` returns `spike` after install

## Rung 4: Customer flow proof

- purchase Spike
- install Spike on `tenant-dev`
- verify install status is `installed`
- launch `/app/spike/?server_id=tenant-dev`
- pass if launch returns `200` or redirect success
