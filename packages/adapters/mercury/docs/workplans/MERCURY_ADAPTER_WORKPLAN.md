# Mercury Adapter Workplan

**Status:** MAP-002 AND MAP-003 IMPLEMENTED; MAP-004 THROUGH MAP-012 PENDING
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

Status: implemented in `0.2.0`.

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

## MAP-002 and MAP-003 Acceptance

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
- nine exact record families are reflected and emitted
- unchanged provider objects retain the same external revision id
- changed provider objects create a new external revision id
- every page is bound to an exact capture receipt
- tampered, incomplete or internally inconsistent captures fail closed
- the AP connection cannot escape recipient and approval-request reads
- backfill and monitor handlers are exposed through the normal Nex runtime

## Production Boundary

MAP-002 and MAP-003 are source-only until the cleanroom and release artifact
gates pass. Production shadow ingestion then remains read-only and requires
credential-pointer validation plus a serialized deployment window.
