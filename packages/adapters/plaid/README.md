# Nexus Plaid Read-Only Adapter

This package is the cleanroom-first Nex adapter for read-only financial data
available through Plaid.

It provides typed methods for:

- institution product-coverage probes
- Item and account readback
- real-time balance snapshots
- credit-card liability facts
- cursor-based transaction synchronization with added, modified, and removed
  records

The package cannot initiate a payment, create a recipient, move money, alter a
bank account, scrape a bank login, or post an accounting journal.

## Current Boundary

Version `0.3.1` provides a Nex live monitor for already-authorized Plaid Items
and publishes the authoritative institution/Item account-contact identity that
Nex requires when creating durable connections. It also uses the provider Item
ID as the canonical connection account so retries collapse semantically
equivalent Item connections instead of creating duplicates. The
monitor emits append-only Item health snapshots, account snapshots, bounded
transaction-sync summaries and page evidence, and added/modified/removed
transaction changes.
Automatic backfill remains disabled; the first monitor pass starts from the
initial Transactions cursor and therefore projects the history Plaid makes
available for that Item.

The monitor is source acquisition only. It does not bind provider accounts to
accounting accounts, write an owned finance database, construct a journal, or
retire a prior source. Those remain separate reviewed consumer and cutover
steps.

## Credential Separation

The adapter deliberately separates two credential layers:

1. Plaid application credentials are process-level environment references:
   - `PLAID_CLIENT_ID`
   - one of `PLAID_SANDBOX_SECRET`, `PLAID_DEVELOPMENT_SECRET`, or
     `PLAID_PRODUCTION_SECRET`
   - on systemd hosts, the same values may be supplied through restricted
     credential files whose paths are named by `PLAID_CLIENT_ID_FILE` and the
     matching environment-specific `*_SECRET_FILE` variable
2. Each durable Nex connection supplies only one Plaid Item access token through
   its bound runtime credential.

The Item credential cannot override the application client id or secret.
Responses expose credential references, never credential values.

The default environment is `sandbox`. Production must be selected explicitly
through `PLAID_ENV=production` or the runtime connection configuration.

## Live Monitor

The monitor runs every 15 minutes by default. Operators may set
`NEXUS_PLAID_MONITOR_INTERVAL` to a duration from `1m` through `24h`.

Each successful pass emits:

- `item_health_snapshot`
- `account_snapshot`
- one bounded `transaction_sync_packet` summary
- one `transaction_sync_page` record per provider page
- zero or more `transaction_change` records

The sync packet is the authoritative handoff summary: it carries the starting
and next cursors, exact action counts, explicit cursor-commit decision, and
deterministic references to every bounded page-evidence record. Each page
record retains the provider response body in tamper-evident evidence without
duplicating the same body in one unbounded packet. Change records are
searchable append-only projections linked back to the summary packet.

Monitor output is paced so Nex can durably ingest large historical histories
without overwhelming its records ledger. `NEXUS_PLAID_EMIT_INTERVAL` may be
set from `10ms` through `1s`; the default is `50ms`, with a minimum `250ms`
pause after packet and page evidence.

The cursor is intentionally process-local. A monitor restart begins again from
the initial cursor and deterministically replays records rather than trusting a
host cursor that could have advanced ahead of Nex's records ledger. Within a
running monitor, a terminal or malformed sync leaves the prior cursor unchanged
and exits so Nex supervision can restart it.

## Accounting Safety

- Provider monetary numbers are decoded as base-10 lexemes, never binary
  floating point.
- Normalized money includes an exact decimal string and, when the currency
  exponent is known and conversion is exact, a base-10 minor-unit integer
  string.
- Provider response bodies and SHA-256 hashes remain attached to read results,
  including provider error responses. Evidence carries the exact HTTP body as
  base64 so its hash remains reproducible after adapter JSON serialization.
- Canonical source-payload hashes identify the provider body. Separate change
  identities bind provider transaction identity, change action, and the
  canonical payload hash.
- A posted transaction carrying a pending predecessor records that explicit
  supersession relationship.
- Removed transactions remain evidence; they are not deleted from history.
- A concurrent mutation during transaction pagination discards the partial
  normalized result, preserves the discarded pages and provider error as audit
  evidence, and restarts from the original cursor.
- Every fetched-page failure returns `completion_state = terminal_error`, keeps
  `next_cursor` at the caller's original cursor, sets
  `cursor_commit_allowed = false`, and exposes `terminal_error` evidence. Only
  `completion_state = complete` can set cursor commit permission.
- Credential-bearing HTTP redirects are never followed. Request collections,
  search queries, cursors, provider account identities, and Item identities are
  validated fail-closed before their results can be trusted.
- Item health fails closed when Plaid reports an Item error or a failure newer
  than the last successful update.
- Plaid credit-card transaction signs are preserved: positive is an outflow and
  negative is a payment, refund, or other credit. The adapter never translates
  that sign into a journal entry.

## Build And Test

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/plaid
go test ./...
go vet ./...
./scripts/package-release.sh
./scripts/plaid-adapter-launcher.sh adapter.info
nexus package validate .
```

All current tests use local synthetic HTTP fixtures. They do not call Plaid,
Chase, American Express, QuickBooks, Mercury, or any production service.

## Main Files

- `cmd/plaid-adapter/main.go` - Nex method declarations, runtime credential
  binding, connection identity, and health projection
- `internal/plaid/client.go` - read-only Plaid HTTP client and source evidence
- `internal/plaid/transactions.go` - cursor pagination and append-only change
  normalization
- `internal/plaid/decimal.go` - exact decimal and minor-unit conversion
- `internal/plaid/testdata/` - synthetic provider fixtures
- `adapter.nexus.json` - package and method declaration
- `SKILL.md` - agent-facing operating guide
- `TESTING.md` - validation ladder

## Remaining Production Cutover Gates

- Bind each already-authorized Plaid Item token to its own durable Nex
  connection on the target runtime without exposing the value to logs or an
  agent transcript.
- Install the package and Nex runtime on the MoonSleep ops host and prove
  restart rehydration for both connections.
- Add the reviewed MoonSleep source consumer that accepts only complete sync
  packets and explicit provider-account bindings.
- Keep historical Chase suffix `1396` separate from Plaid accounts `8374` and
  `4103` until reviewed identity evidence resolves the relationship.
- Run browser/Plaid parity and freshness checks before pausing the browser
  exporters. Do not delete the browser fallback during initial cutover.
- Add a verified Plaid webhook ingress later as a wake-up hint. The monitor
  remains the recovery path.

See [ADAPTER_SPEC_PLAID_READONLY.md](docs/specs/ADAPTER_SPEC_PLAID_READONLY.md)
and [PLAID_ADAPTER_VALIDATION.md](docs/validation/PLAID_ADAPTER_VALIDATION.md).
