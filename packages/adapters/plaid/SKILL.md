---
name: plaid-readonly
description: Use the cleanroom Plaid adapter to inspect institution coverage, Plaid Items, accounts, real-time balances, credit liabilities, and cursor-based transaction changes without bank or accounting writes.
---

# Plaid Read-Only Financial Data

Use this package only for read-only source discovery and evidence capture.

## Safety Boundary

- Never request or perform payments, transfers, recipient changes, bank-account
  changes, accounting posts, or bank-login scraping.
- Never print Plaid application secrets or Item access tokens.
- Never place application credentials inside an Item connection credential.
- Treat every returned provider object as source evidence, not a journal entry.
- Do not call a card liability reconciled until the owned accounting source
  account binding, transaction changes, statement evidence, and balance
  snapshot agree.

## Methods

- `plaid.institutions.coverage`
  - no Item connection required
  - probes requested product coverage by institution ids or a search query
- `plaid.item.get`
  - reads Item identity, products, errors, consent expiration, and transaction
    update freshness
- `plaid.accounts.list`
  - reads accounts and provider-reported balances
- `plaid.accounts.balance.get`
  - requests a current balance snapshot for all or selected provider accounts
- `plaid.liabilities.get`
  - reads credit-card statement, payment, minimum-payment, due-date, and overdue
    facts when the institution exposes them
- `plaid.transactions.sync`
  - consumes a prior cursor and returns a final cursor plus added, modified, and
    removed changes and append-only transaction-change records

All six methods are declared `read` with remote mutation disabled.

## Correct Workflow

1. Confirm the package is still cleanroom-only and automatic projection is
   disabled.
2. Probe institution coverage for the required products.
3. After separately approved Plaid Link onboarding, inspect Item health.
4. List accounts and bind each provider account to an approved owned-accounting
   source account.
5. Capture a balance or liability snapshot.
6. Run transaction sync using the last committed cursor.
7. Persist every raw page, evidence hash, change, and restart event before
   advancing the owned consumer cursor.
8. Quarantine ambiguous mappings. Do not infer posting authority from a source
   match.

## Cursor Rule

Only commit `next_cursor` after the complete response and its evidence packet
are durably accepted. If the provider reports a mutation during pagination, the
adapter restarts from the original cursor and does not mix partial pages from
different attempts.

Require all three completion signals before committing a cursor:

- `completion_state` is `complete`
- `cursor_commit_allowed` is `true`
- `terminal_error` is `null`

Any fetched-page provider, pagination, cursor, or normalization failure returns
an observable `terminal_error`, leaves `next_cursor` at the original committed
cursor, and sets `cursor_commit_allowed` to `false`. Preserve the base64 body in
each evidence object; it is the lossless source for recomputing
`payload_sha256` across the JSON method boundary.

## Money Rule

Use `decimal` and exact `minor_units` strings from normalized money. If
`minor_units_exact` is false, keep the decimal string and raw provider payload
for review; never round silently.

Plaid credit-card transaction amounts preserve the provider convention:
positive means purchase/outflow, while negative means a payment, refund, or
other credit. Do not turn that sign into a journal without reviewed accounting
policy.

## Cleanroom Validation

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/plaid
go test ./...
go vet ./...
./scripts/package-release.sh
./scripts/plaid-adapter-launcher.sh adapter.info
nexus package validate .
```

Do not install, connect, deploy, or run against live Plaid credentials as part
of this cleanroom validation.
