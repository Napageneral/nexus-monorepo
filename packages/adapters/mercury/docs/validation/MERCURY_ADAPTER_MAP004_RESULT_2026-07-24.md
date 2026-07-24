# Mercury Adapter MAP-004 Result - 2026-07-24

## Exact source

- source commit:
  `41960faea4248bd75cc53084af0c0d2dc9c6c64b`
- source tree:
  `d6be3caa2834ada73483186f52417d8db700b5e3`
- parent:
  `3f94b4aed234de47ecda7d0c94964c312afbd300`
- package version: `0.3.0`
- `mercury-adapter` SHA-256:
  `5721a47403247701ada6ad74b11a185aed060ebbdd32a3c956945159d294e735`
- `mercury-provenance` SHA-256:
  `3473852945c2d45954dcac359a771b59fd832c009bebf220ad9dab6204766a39`
- release archive SHA-256:
  `6f8e84905144e306768fc68376db428c5e0397579771e88ab000cdd46d3923a0`

An independent Git-archive build reproduced both binary hashes.

## Static and focused validation

- Go tests: 56 started, 56 passed across 4 packages
- `go vet ./...`: passed
- `nexus package validate .`: passed with no errors or warnings
- `git diff --check`: passed
- reflected public provider methods remain 72
- provider writes attempted: 0
- no direct `records.db` or `memory.db` write exists
- no new schema field named `kind` exists

## Executable Nex runtime cleanroom

A disposable isolated Nex runtime on loopback accepted exact canonical
`record.ingest` calls and exposed the stored rows through `records.list`.

The cleanroom proved:

- full canonical provider bytes and SHA-256 survive the public record-ingest
  boundary in stored metadata;
- two changed account revisions remained two immutable Nex records;
- those revisions produced eight typed atomic facts;
- the first projection created four observation heads;
- the changed revision produced four immutable child observations;
- all four children carried the exact prior Nex element id as `parent_id`;
- both changed balances retained one contradicting prior fact;
- `memory.elements.resolve_head` returned each successor;
- replay reused all eight facts;
- replay used four `memory.elements.get` operations;
- observation-row count remained exactly eight after replay;
- a forged stored payload SHA-256 failed closed before any memory write.

Cleanroom balance readback:

| Observation | First revision | Successor |
| --- | ---: | ---: |
| Available balance | 10,025 minor units | 11,050 minor units |
| Current balance | 9,025 minor units | 9,500 minor units |

## Provenance and resolution boundary

- every fact binds one exact source record, source content hash and JSON pointer;
- decimal money is converted to integer minor units;
- provider transaction classification is renamed
  `transaction_classification`;
- equal-time contradictory values resolve to an explicit unresolved state;
- missing required values resolve to an explicit unresolved state;
- supersession metadata does not alter otherwise identical logical observation
  identity;
- supporting and contradicting fact ids both reach Nex observation provenance.

## Authority

Provider-write, journal, payment, tax, distribution and cutover authority remain
false. MAP-004 does not connect to Mercury, create recipients, request payments,
post journals or mutate MoonSleep production.

## Next gate

MAP-005 may consume these exact Nex records, facts and observations to build a
read-only MoonSleep finance source bridge. It must preserve unresolved states
and exact evidence references and must not create accounting or payment
authority.
