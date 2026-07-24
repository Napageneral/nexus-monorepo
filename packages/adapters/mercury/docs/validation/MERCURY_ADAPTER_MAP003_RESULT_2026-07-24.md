# Mercury Adapter MAP-003 Result - 2026-07-24

## Exact source

- commit: `fcdee738796923c69c5437f7c74c87c967ce42c1`
- tree: `34822a7b58c6889c046b71715b6ccfa9c0a2a179`
- package version: `0.2.0`
- binary SHA-256:
  `620f3fccc7982a0263108a550242ec7c7980e209e40fa6a6de3bd85d2fad2e03`
- packaged-content manifest SHA-256:
  `336be53330631ddd2c0a7385cc31a219c1b2ecf9032f2fea9f4cfeb8358d74e1`

The Nexus package command's compressed wrapper carries generation metadata, so
each generated archive has its own immutable release SHA. Two independent
exact-tree builds nevertheless reproduced the same binary and the same complete
uncompressed file-content manifest.

## Validation

- Go tests: 44 started, 44 passed across 2 packages
- `go vet ./...`: passed
- `nexus package validate .`: passed with no errors or warnings
- two independent Git-archive builds: same binary and content manifest
- executable `records.backfill` runtime-context cleanroom: passed
- reflected public provider methods: 72
- reflected reads/writes: 42 / 30
- declared immutable record families: 9
- provider writes attempted: 0

## Hostile coverage

- all 30 provider-write methods reject before network
- card-number reveal rejects before network
- AP connection cannot call primary-only reads
- incomplete captures reject
- mismatched connection role rejects
- inconsistent page inventory rejects
- non-200 and non-JSON captures reject
- invalid attempt counts reject
- exact response-body digest tamper rejects
- missing provider object identity rejects
- changed provider content creates a new immutable revision
- object key ordering does not change immutable revision identity
- all provider-write, journal, payment, tax, distribution and cutover authority
  flags remain false

## Production boundary

This result proves the source package and cleanroom only. It does not prove a
production install or live Mercury capture. A production shadow remains gated
on an exact release artifact, Nex credential-pointer binding, serialized
deployment custody, GET-only readback and immutable-record count/fingerprint
proof.
