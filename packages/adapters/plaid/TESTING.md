# Plaid Read-Only Adapter Testing

The current validation lane is synthetic and network-isolated from Plaid and
all financial providers.

## Focused Tests

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/plaid
go test ./...
```

The suite proves:

- every declared provider method is read-only and remote mutation is disabled
- the package manifest and adapter reflection agree on the six-method surface
- global app credential references remain separate from per-Item connection
  credential references
- the default environment is sandbox
- exact decimal and minor-unit conversion does not use binary floating point
- unknown or over-precise currency values are preserved without silent rounding
- exact provider payload bytes survive method serialization as base64 and
  reproduce their SHA-256 evidence hashes
- provider error bodies remain hash-bound evidence on terminal and retryable
  failures
- credential-bearing redirects are never followed, including when a supplied
  HTTP client would otherwise follow them
- provider error JSON cannot overwrite locally computed raw/evidence fields
- request collections and query/count values enforce their manifest caps in
  executable code before a provider call
- Item, accounts, balance, liability, and institution coverage normalization
- cursor pagination restarts from the original cursor after concurrent mutation
- discarded pagination attempts remain visible as audit evidence
- pending-to-posted linkage and removal changes are append-only
- change identity is stable across different observation timestamps
- source-payload hashes remain independent of change action
- malformed transactions and non-exact money fail closed
- malformed fetched pages and missing/repeated cursors return observable
  terminal evidence, retain the original cursor, and forbid cursor commit
- successful syncs alone return `complete`, authorize cursor commit, and carry
  no terminal error
- empty/duplicate account ids, empty Item ids, and credit liabilities without a
  returned account/currency binding fail closed
- liability APR percentages and money fields remain exact decimal values
- health freshness comes from the provider update timestamp, not local fetch
  time, and Item errors or newer failures prevent a connected projection
- monitor reflection is enabled while automatic backfill remains disabled
- one poll emits Item, account, complete sync-packet, and transaction-change
  records bound to the selected Nex connection
- emitted records contain credential references but never credential values
- terminal sync evidence is emitted before failure, and the prior cursor is
  retained
- restricted systemd credential files can supply application credentials while
  broad file modes fail closed

## Build And Reflection

```bash
./scripts/package-release.sh
./scripts/plaid-adapter-launcher.sh adapter.info | jq .
```

Pass criteria:

- operations contain adapter reflection, connection listing, health, and the
  live monitor
- all six provider methods have `action = read`
- all six provider methods have `mutates_remote = false`
- automatic monitor is enabled and automatic backfill remains disabled
- no credential value appears in reflection output

## Package Validation

```bash
nexus package validate /Users/tyler/nexus/home/projects/nexus/packages/adapters/plaid
```

The release script builds deterministic static binaries for Darwin arm64,
Linux arm64, and Linux amd64, includes vendored Go dependencies, and emits a
SHA-256 sidecar for the normalized archive. A standard-library Go writer
normalizes archive ordering, ownership, timestamps, and executable modes, so
packaging does not depend on BSD, GNU, or BusyBox tar flags. Run it twice and
require identical archive hashes.

## Static Safety Audit

```bash
rg -n 'payments|transfer|recipient|\/link\/token\/create' \
  cmd internal adapter.nexus.json
rg -n 'float32|float64|ParseFloat' cmd internal
```

Any endpoint capable of money movement or Link-token creation fails the current
scope. Documentation may mention prohibited actions when describing the safety
boundary; executable code and method declarations may not expose them.

## Live Validation Gate

Package installation, target-runtime connection creation, credential migration,
webhook configuration, owned-accounting ingestion, and browser-source
retirement remain separate production actions. Version `0.3.2` cleanroom
validation proves the adapter-side monitor and evidence contract without
calling Plaid or writing MoonSleep finance data.
