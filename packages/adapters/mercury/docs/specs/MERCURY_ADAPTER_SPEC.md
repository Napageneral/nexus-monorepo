# Mercury Adapter Specification

## Purpose

Expose Mercury's reviewed public API through one canonical Nex package while
preserving strict separation between read evidence and future optional
payment preparation.

## Contract

- one package, two logical connection roles;
- 72 reflected public operations;
- 12 provider-internal Books operations excluded;
- 42 public GET operations reflected;
- 41 GET operations executable under exact role rules;
- card-PAN reveal excluded;
- 30 public non-GET operations reflected but physically disabled;
- no provider write in the `0.3.0` build;
- immutable records for nine declared families;
- bounded backfill and five-minute incremental monitoring;
- exact page capture receipts plus deterministic object revision identities.
- deterministic atomic facts bound to JSON-pointer evidence locations;
- versioned current observations written only through Nex memory APIs.

## Connection matrix

| Operation group | `primary_read` | `ap_request` |
| --- | --- | --- |
| General public GET | allowed | denied |
| Recipient and approval-request GET | temporary shadow allowed | allowed after credential health |
| Recipient and approval-request writes | denied | disabled |
| Other provider writes | disabled | disabled |
| Internal Books | absent | absent |
| Card-PAN reveal | excluded | excluded |

## Response boundary

The package returns:

- exact operation id;
- exact connection role;
- one or more bounded response pages;
- HTTP status and content type;
- exact body encoding and bytes;
- body SHA-256;
- next-page cursor when present;
- provider call count;
- explicit `provider_write_attempted=false`.

The provider body remains a string. Later extraction cannot silently rewrite
the original provider evidence.

## Network boundary

- official Mercury base URL by default;
- loopback override only in explicit cleanroom mode;
- redirects refused;
- 16 MiB response limit;
- at most three GET attempts;
- 429 and 5xx retry only;
- delay capped at five seconds;
- automatic pagination capped at 100 pages;
- repeated cursors fail closed.

## Record projection

- `account_snapshot` from Mercury account pages;
- `account_snapshot` from Mercury credit-account pages;
- `transaction_revision` from transaction pages;
- `recipient_revision` from recipient pages;
- `approval_request_revision` from approval-request pages;
- `payment_revision` when a transaction binds a request id;
- `scheduled_payment_observation` when an approval request has a scheduled date;
- `statement_revision` for each discovered Mercury account;
- `attachment_revision` from embedded transaction and recipient attachments;
- `api_capture_receipt` for every exact provider response page.

Provider object revisions use deterministic canonical JSON and content-addressed
external record ids. Capture receipts retain the exact page body and SHA-256.
Repeated content therefore reuses the same revision identity while changed
provider content creates a new immutable revision.

Backfill uses the requested transaction/statement start date. Monitoring polls
every five minutes, replays the prior 24 hours on start, and advances only after
a complete successful capture.

Mercury filters its transaction list by creation time, so the monitor reads a
transaction again until its status is final (sent, cancelled, failed or
reversed). A run's first poll reads the transactions of the last 45 days. While
a transaction created in the last week is open, the read reaches back to the
oldest such one once an hour; while an older one is open, back to the oldest
open one once a day. Within a run a transaction row is recorded only when it is
new to the run or Mercury changed it (its attachments' signed URLs left out),
never again unchanged. At a run's first poll a transaction created before the
24-hour replay is recorded only when it may have changed after an earlier run
read it: posted or failed within the replay (or with no such time), or
cancelled or reversed (no time to judge by). An open one is remembered and
recorded when it changes. A transaction still open at the 45-day edge is no
longer read again, and the log says so as an error.

## Fact and observation projection

The companion `mercury-provenance` binary consumes only rows returned by Nex
`records.list`. It re-hashes the canonical provider payload before extracting
facts. Each fact binds:

- one typed value;
- one hashed provider subject;
- one exact source Nex record;
- one provider payload SHA-256;
- one JSON-pointer evidence location;
- deterministic extractor identity;
- all authority fields false.

Supported facts cover account balances and lifecycle, transactions, recipients,
approval and scheduled-payment state, payments, statements, attachments and
page-level capture receipts. Decimal money becomes exact integer minor units.
Provider transaction classification is projected as
`transaction_classification`.

The resolver selects the latest effective and observed fact. Older differing
facts remain explicit contradictions. Equal-time conflicting values and missing
required facts produce unresolved observations rather than guesses.

Facts use `memory.facts.create` with content-addressed retention keys.
Observations use:

- `memory.elements.create` when no prior head exists;
- `memory.elements.get` when the logical observation is unchanged;
- `memory.elements.update` when new evidence creates an immutable successor.

The orchestration layer must supply the current Nex element id with each prior
observation. No code writes directly to `records.db` or `memory.db`.

## Deferred work

MAP-005 implements MoonSleep's read-only finance bridge. MAP-012 is the only
ticket that may introduce an approval-request actuator after separate
authorization.
