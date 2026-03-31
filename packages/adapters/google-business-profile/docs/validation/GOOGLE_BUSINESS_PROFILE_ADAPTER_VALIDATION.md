# Google Business Profile Adapter Validation

Current validation is package-local plus live OAuth and health probing.

## Local Proof

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/google-business-profile

go test ./...
mkdir -p ./bin
go build -o ./bin/google-business-profile-adapter ./cmd/google-business-profile-adapter
./bin/google-business-profile-adapter adapter.info
```

## Current Result

- `go test ./...` passes for the package
- a real MoonSleep Google re-consent on March 31, 2026 minted a new refresh
  token with both `adwords` and `business.manage`
- direct Google tokeninfo validation confirms the stored token now includes
  `business.manage`
- live `adapter.health` now reaches the official Google Business Profile
  Account Management API, but the Google Cloud project is still blocked with
  `429 RESOURCE_EXHAUSTED` and quota metadata showing
  `quota_limit_value = 0` for `mybusinessaccountmanagement.googleapis.com`
- credentialed cleanroom proof has not been retained yet because the provider
  project is still blocked before account enumeration can complete
- provider parity spot-check has not been retained yet for the same reason

## Next Proof Steps

1. request Google Business Profile API basic access for project
   `822804320930` so the effective quota is no longer `0`
2. rerun `adapter.health` against the real GBP connection
3. run cleanroom `records.backfill` plus monitor proof
4. retain sampled upstream parity artifacts for account, location,
   performance, and review rows
