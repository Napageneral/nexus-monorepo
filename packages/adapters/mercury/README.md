# Nexus Mercury Adapter

Canonical read-only Mercury adapter for Nex and MoonSleep financial evidence.

The package has two explicit logical connection roles:

- `primary_read` for accounts, balances, transactions, statements and the
  reviewed public read surface;
- `ap_request` for recipient and approval-request reads and a future,
  separately authorized payment-preparation actuator.

The current `0.1.0` build is read-only. It reflects all 72 public operations so
the provider contract is inspectable, but:

- only reviewed public GET operations can reach Mercury;
- all 30 public non-GET operations fail before a network request;
- Mercury's 12 provider-internal Books operations are not reflected;
- card-PAN reveal fails before a network request;
- the `ap_request` credential remains unusable until its Mercury IP whitelist
  is separately repaired.

The proven `primary_read` connection may temporarily shadow recipient and
approval-request GETs. It cannot invoke provider mutations.

## Exact Provider Binding

- registry: `gn5944jmrvahbit`
- OpenAPI: `3.0.0`
- provider API: `1.0.0`
- source SHA-256:
  `73c6d6d9183a930f9411d44ebdacecde4b1c3bdcce558efdfd07160e140e1fc9`
- 84 operations: 72 public, 12 internal

See `api/openapi.lock.json` and
`internal/catalog/operations.catalog.json`.

## Build

```bash
mkdir -p ./bin
go build -trimpath -buildvcs=false -o ./bin/mercury-adapter ./cmd/mercury-adapter
```

## Test

```bash
go test ./... -count=1
go vet ./...
```

The fake-provider suite covers:

- exact method reflection;
- connection-role enforcement;
- zero-call write and sensitive-read rejection;
- path and query encoding;
- bounded pagination;
- 401, 403, 404, 409, 429 and 5xx handling;
- bounded retry;
- binary evidence encoding;
- secret-safe errors;
- base-URL and redirect boundaries.

## Runtime Context

The adapter uses the normal Nex runtime credential seam. Setup records:

- `connection_role`: `primary_read` or `ap_request`;
- `api_token`: a secret field.

The provider token is never accepted in method payloads, query parameters or
package configuration.

## Method Examples

```bash
./bin/mercury-adapter adapter.info
./bin/mercury-adapter adapter.connections.list
./bin/mercury-adapter adapter.health --connection mercury-primary
./bin/mercury-adapter mercury.api.getAccounts \
  --connection mercury-primary \
  --payload-json '{}'
./bin/mercury-adapter mercury.api.listTransactions \
  --connection mercury-primary \
  --payload-json '{"query":{"start":"2026-01-01","limit":1000},"auto_paginate":true,"max_pages":20}'
```

Successful reads retain exact provider response bytes as either UTF-8 JSON or
base64, plus SHA-256. Structured fact extraction begins in the next tranche;
MAP-002 does not normalize accounting facts or emit records.

## Authority

This package has no payment, recipient-create, provider-write, journal, tax,
bank-transfer, distribution or production-cutover authority.
