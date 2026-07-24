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
- no provider write in the `0.1.0` build.

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

## Deferred work

MAP-003 implements immutable record revisions, backfill and monitor. MAP-004
implements deterministic facts and observations. MAP-012 is the only ticket
that may introduce an approval-request actuator after separate authorization.
