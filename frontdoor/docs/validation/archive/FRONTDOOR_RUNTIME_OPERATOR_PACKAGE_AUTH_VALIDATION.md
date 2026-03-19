# Frontdoor Runtime Operator Package Auth Validation

## Rung 1: Unit proof

- direct runtime package helpers receive a trusted bearer token, not
  `server.runtimeAuthToken`
- public route calls pass the acting session into package helpers
- no-session internal flows still resolve a server-owner fallback principal

## Rung 2: Build proof

- `pnpm vitest run` passes for the new package auth coverage
- `pnpm build` passes in `nexus-frontdoor`

## Rung 3: Production HTTP proof

- publish a new package release
- call Frontdoor public package upgrade API
- pass if the API succeeds
- fail if Frontdoor returns `runtime_upgrade_failed` or `Unauthorized`

## Rung 4: Downstream proof

- after upgrade, use the same public/API-authenticated flow to rerun git
  adapter backfill
- pass if records are imported or the adapter returns an explicit provider
  failure
