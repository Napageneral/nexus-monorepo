# Frontdoor Runtime Operator Package Auth Workplan

## Goal

Replace legacy `runtimeAuthToken` usage in Frontdoor package operator relays
with trusted runtime bearer tokens derived from the selected server principal.

## Phase 1: Token derivation

- add a single helper in `src/server.ts` that:
  - accepts the selected `ServerRecord`
  - optionally accepts the acting `SessionRecord`
  - resolves a server-scoped principal
  - mints a trusted runtime bearer token via `mintRuntimeAccessToken(...)`

## Phase 2: Package relay cutover

- update direct runtime HTTP package calls for:
  - install app
  - install adapter
  - upgrade app
  - upgrade adapter
  - uninstall app
  - uninstall adapter
- update SSH package calls to use the same bearer token for runtime operator
  endpoints after staging

## Phase 3: Public route audit

- thread the acting `SessionRecord` from public Frontdoor routes into package
  lifecycle helpers
- keep internal/autoprovision flows working via server-owner fallback

## Phase 4: Validation

- add focused tests proving package operator relays use minted trusted tokens
- build Frontdoor
- deploy Frontdoor to production
- rerun the real public API adapter upgrade that previously failed with
  `Unauthorized`
- continue into production backfill validation
