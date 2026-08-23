# Plaid Read-Only Adapter Validation

Status: cleanroom validation only

## Commands

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/plaid
go test -race ./...
go vet ./...
./scripts/package-release.sh
./scripts/plaid-adapter-launcher.sh adapter.info > /tmp/plaid-adapter-info.json
nexus package validate .
cat dist/plaid-0.3.2.tar.gz.sha256
```

## Required Readback

- six typed methods
- every method read-only
- every method remote mutation disabled
- institution coverage does not require an Item connection
- all Item-specific methods require a connection
- live monitor projection enabled and automatic backfill disabled
- monitor emits Item, account, bounded sync-summary, complete page-evidence,
  and transaction-change records without credential values
- monitor requests bounded provider pages and paces output for durable Nex
  ingestion under large histories
- terminal sync retains the prior cursor and emits non-committable evidence
- restricted credential files load application credentials and broad modes are
  rejected
- Item auth manifest contains only the Item token field
- application credential values absent
- every provider request pins Plaid API version `2020-09-14`

The release must build Darwin arm64, Linux arm64, and Linux amd64 static
binaries, include vendored dependencies, and produce the same normalized
archive SHA-256 on two consecutive runs. Read the exact current digest from the
generated `.sha256` sidecar; it is intentionally not embedded in the archive.
The normalizer uses Go's standard archive libraries, not platform-specific tar
creation flags, and the release accepts either `shasum` or `sha256sum`.

## Synthetic Provider Cases

Fixtures under `internal/plaid/testdata/` cover:

- Item transaction freshness
- two synthetic business-card accounts
- exact and over-precise balance values
- credit-card statement liability facts
- institution product coverage
- multi-page transaction sync
- provider mutation during pagination
- clean restart from the original cursor
- pending transaction removal and posted replacement
- modified and removed transaction changes
- canonical payload hashes separated from action-bound change identities
- exact success, retry, and terminal provider bytes surviving method JSON
  serialization with reproducible SHA-256 evidence
- provider error bodies retained as source evidence without allowing provider
  JSON to overwrite computed evidence
- malformed transactions and inexact money rejected
- malformed fetched pages, repeated/missing cursors, request-cap violations,
  response-identity violations, and credential-bearing redirects rejected
- terminal transaction results retaining the original cursor with commit
  permission false; complete results alone permit cursor commit
- Item health failing closed on current errors and newer failures

## Prohibited Side Effects

The validation lane must produce zero:

- Plaid network calls
- bank network calls
- Item creation
- Link-token creation
- Nex package installation
- Nex connection creation
- webhook registration
- QuickBooks writes
- owned-accounting writes
- bank, card, or Mercury writes
