# Mercury Adapter Workplan

**Status:** MAP-002 IMPLEMENTED; MAP-003 THROUGH MAP-012 PENDING
**Spec:** `docs/specs/MERCURY_ADAPTER_SPEC.md`
**Validation:** `docs/validation/MERCURY_ADAPTER_VALIDATION.md`

## Customer Goal

Make Mercury a canonical Nex source for MoonSleep banking and accounts-payable
evidence while preserving a strict separation between:

- provider observations
- immutable Nex records
- derived finance facts
- accounting projections
- any future payment-request actuation

The initial package must ingest evidence without creating recipients, requesting
payments, moving money, editing provider data, posting journals, or granting any
tax, distribution, or cutover authority.

## Delivery Map

### MAP-002: provider contract

- lock the official Mercury OpenAPI inventory
- expose all public operations for discovery
- execute only approved read operations
- fail every provider mutation before any network call
- separate primary-read and AP-request credential roles
- preserve exact response bytes and SHA-256 provenance

### MAP-003: immutable record projection

- capture bounded provider pages
- canonicalize and hash exact revisions
- project account, transaction, recipient, approval-request, payment,
  scheduled-payment, statement, attachment, and capture-receipt families
- keep provider object identity distinct from content revision identity
- support idempotent backfill and incremental monitor adoption

### MAP-004 through MAP-006: facts and finance bridge

- derive typed observations from immutable records
- reconcile transactions, balances, recipients, approval states, and scheduled
  payments
- publish read-only finance projections with exact record references
- retain disagreement and missing-data states rather than guessing

### MAP-007 through MAP-010: accounts-payable evidence

- ingest invoice evidence through approved source adapters
- parse candidate invoice totals and due dates with explicit ambiguity states
- match recipients and historical payments without creating provider objects
- create a maker-checker proposal that requires owner approval

### MAP-011 and MAP-012: optional actuation

- remain disabled until the AP-request token passes its separate network and
  least-privilege gate
- require an exact approved proposal, idempotency key, duplicate guard, and
  terminal provider readback
- never approve or release a payment on Tyler's behalf

## MAP-002 Acceptance

- `go test ./... -count=1` passes
- `go vet ./...` passes
- the package builds reproducibly
- `nexus package validate .` passes
- runtime reflection contains 72 public operations: 42 reads and 30 writes
- all 30 write operations fail before network access
- card-number reveal fails before network access
- GET retry and pagination behavior is bounded and tested
- the package contains no credential material
- provider-write and accounting authority remain false

## Production Boundary

MAP-002 is source-only. It authorizes neither installation nor a live provider
call. Production shadow ingestion begins only after MAP-003 has cleanroom proof,
an exact release artifact, credential-pointer validation, and a serialized
deployment window.
