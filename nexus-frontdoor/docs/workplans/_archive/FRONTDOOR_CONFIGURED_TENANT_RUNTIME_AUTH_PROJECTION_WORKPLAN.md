---
title: "Frontdoor Configured Tenant Runtime Auth Projection Workplan"
summary: "Close the local shell/runtime auth gap where configured tenant tokens are shadowed by null server rows."
---

# Frontdoor Configured Tenant Runtime Auth Projection Workplan

## Goal

Make local Frontdoor shell-profile runtime/app proxying use the correct direct
runtime auth token whenever a configured tenant token exists and the persisted
server row does not yet carry one.

## Phase 1: Reconcile projection rules

- identify all server-to-runtime projection paths
- introduce one shared resolution rule for effective runtime auth token
- ensure persisted non-empty server tokens still win over config

## Phase 2: Startup hydration

- during Frontdoor boot, detect configured tenants that match persisted server
  rows
- if the server row is missing `runtimeAuthToken` and config provides one,
  hydrate the effective projection from config
- persist the token back to the server row when safe

## Phase 3: Proxy correctness

- ensure `/runtime/*` proxying uses the effective token
- ensure `/app/*` proxying uses the effective token
- ensure direct local package lifecycle HTTP uses the effective token

## Phase 4: Regression coverage

- add a test where:
  - config tenant has `runtimeAuthToken`
  - persisted server row exists with `runtimeAuthToken = null`
  - `/runtime/health` proxies successfully using the configured token
- preserve existing tests for hosted JWT path and explicit persisted server
  token path

## Phase 5: Live validation

- restart local runtime/frontdoor
- verify `/runtime/health` succeeds via Frontdoor shell profile
- verify local Spike purchase/install/launch smoke passes end to end
