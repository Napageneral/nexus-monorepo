# Partner Desk Canonical Continuous-Evidence Preparation

**Status:** SOURCE-BUILT PREPARATION

**Owner:** MoonSleep Partner Desk

**Authority:** source and cleanroom only

**Production mutation:** none

## Purpose

This checkpoint prepares Partner Desk 0.2.1 for the canonical Nex
continuous-evidence contract without implementing or duplicating shared core
primitives.

The source preparation provides:

- one exact package-owned profile manifest;
- five fact profile schemas;
- three observation profile schemas and canonical head-key fields;
- three sealed-set identities;
- stable Partner subject families;
- deterministic canonical serialization and candidate identities;
- a pure 0.2.1 legacy-to-candidate migration adapter;
- one sanitized Surewal Alibaba and Gmail golden fixture;
- focused, replay, hostile, and expected-head concurrency tests;
- a dependency-free temporary cleanroom.

It does not register profiles, ingest provider data, write Nex elements,
advance observation heads, publish projections, call providers, or touch
production.

## Governing Identities

- current Wave 1 Nex source baseline:
  `869bf016fbd58d32c93fcde8c2b157dbacfaeb21`
- continuous-evidence program and model checkpoint:
  `411e8ce89d21834544f3b534902e9f676e8222ea`
- canonical model embedded by the sealed Partner design:
  `0d1abf1b99c35c17cbed4cc5f0d539fdb657b5e8`
- Partner domain design:
  `06f4c00ab2da4a6be1b84f57f9b20cc36c07b31c`
- Partner design tree:
  `8860b194ec1913e3fc8661dcff7533d8f156c7d6`
- Partner design specification SHA-256:
  `d93e1ce4f7fcd4222ccd6b98c89e49fe372a8515b711e0673141b1a2e0e62c2c`

The source preparation awaits the published Wave 1 operation and receipt
contract before any integration binding.

## Canonical Package Manifest

`contracts/partner-canonical-profiles.v1.json` declares:

- domain `moonsleep.partner`;
- owner package `moonsleep-partner-desk`;
- baseline package version `0.2.1`;
- activation state `awaiting_wave_1_core_contract`;
- exact stable subject identity fields;
- exact fact and observation schemas;
- exact observation head-key fields;
- exact sealed-set profile identities;
- all six shared core requirements;
- provider write, identity merge, external-domain write, and draft-or-send
  authority false.

### Fact Profiles

1. `moonsleep.partner.communication-classification.v1`
2. `moonsleep.partner.open-loop-signal.v1`
3. `moonsleep.partner.structured-claim.v1`
4. `moonsleep.partner.source-coverage.v1`
5. `moonsleep.partner.workspace-admission.v1`

### Observation Profiles

1. `moonsleep.partner.workspace-state.v1`
2. `moonsleep.partner.open-loop-state.v1`
3. `moonsleep.partner.source-coverage-state.v1`

### Sealed-Set Profiles

1. `moonsleep.partner.extraction-source-set.v1`
2. `moonsleep.partner.resolver-fact-set.v1`
3. `moonsleep.partner.comparison-set.v1`

## Golden Fixture

`fixtures/canonical/surewal-cross-channel-golden.v1.json` is synthetic and
sanitized. It contains:

- six exact immutable communication revisions;
- one Alibaba native conversation;
- one Gmail native conversation;
- a reviewed Surewal organization identity;
- a reviewed Rebecca contact relationship;
- one cross-channel production-timing loop with explicit closure;
- one separate payment-balance loop in the same Alibaba conversation;
- one attachment-backed date claim;
- one exact-string money claim;
- complete reviewed source coverage;
- no provider, identity-merge, external-domain, or send authority.

The fixture intentionally proves that one native thread may contain separate
loops and one reviewed loop may span native channels without fabricating a
cross-provider thread.

## Migration Adapter

`src/legacy-migration.ts` validates the complete 0.2.1 cohort before creating
any candidate output.

It fails closed when:

- a source record lacks identity, workspace, or coverage;
- a record has competing or duplicate source identity;
- source revision digests do not match;
- provider write authority is true;
- identity crosses the reviewed canonical partner;
- coverage and loop evidence are not reciprocal;
- a loop references a foreign record;
- a resolved loop lacks closure evidence;
- an unresolved loop carries closure evidence;
- a structured claim references a foreign source;
- two candidate observations produce the same canonical head key.

The adapter creates only:

- deterministic immutable fact candidates;
- sealed-set descriptors;
- shadow observation candidates with `expected_head_id` null;
- one shadow projection candidate;
- an exact plan digest.

It performs no runtime operation.

## Replay And Concurrency

The same fixture produces byte-identical:

- extraction source set;
- fact IDs and payload digests;
- resolver fact sets;
- observation candidate IDs and head keys;
- projection candidate;
- plan SHA-256;
- command receipt.

The expected-head simulator proves the required core behavior:

1. the first writer commits against the current expected head;
2. the head advances to the first candidate;
3. the second writer using the stale expected head fails with `stale_head`;
4. no second canonical successor is accepted.

This simulation is a contract fixture. It is not a replacement for the shared
core atomic commit and concurrency proof.

## Current Cleanroom Receipt

Command:

```bash
./scripts/test-canonical-prep-cleanroom.sh
```

Current result:

- Node contract tests: 27 passed, 0 failed, 0 skipped;
- source records: 6;
- fact candidates: 26;
- observation candidates: 9;
- replay plans: byte-identical;
- replay receipts: byte-identical;
- plan SHA-256:
  `6f109ea4c55887e7376121516401c033341ba52a6ddef2d6463fc39dbdbf2588`;
- plan file SHA-256:
  `fd5a4e882884cdd84cf76d31716f240a8ce000ee6b30a51d988b72491286b62b`;
- provider write authority: false;
- identity merge authority: false;
- external-domain write authority: false;
- draft-or-send authority: false;
- temporary cleanroom residue: zero.

The full dependency-backed package suite also passes:

- Node tests: 27 passed;
- Vitest tests: 21 passed;
- total: 48 passed;
- UI production build: passed.

## True Contract Mismatches Awaiting Core Handoff

### Source Revision Hydration

Partner Desk 0.2.1 records expose a logical record ID and revision digest, but
the canonical fact contract also requires the complete shared source-revision
reference: provider account, payload digest, source and capture times,
fragments, attachments, source-run receipt, and authority declarations.

The migration adapter requires that complete reference as input. It does not
invent missing evidence.

### Profile Registration

The Partner package now owns exact schemas and identities, but the Wave 1
registration operation, canonical profile receipt, and compatibility readback
have not been published. The manifest remains dormant until those exact core
operations are available.

### Sealed Sets

The preparation code computes deterministic set descriptors. Only the shared
core may persist, seal, revalidate, and enforce immutable membership inside
an atomic resolver commit.

### Observation Heads

The 0.2.1 review ledger detects divergent app-local heads but does not perform
the canonical atomic expected-head commit. The migration produces shadow
candidates only. Core must own compare-and-swap head advancement.

### Ingress Identity Receipt

The fixture binds reviewed identity, but production extraction requires the
shared atomic source, connection, provider-account, contact, entity, subject,
and dispatch receipt. Partner Desk will consume it rather than introduce an
app-local identity transaction.

### Projection Outbox And Health

The preparation computes a deterministic projection candidate identity. Core
must publish the promotion-bound outbox event and health receipt before a
Partner projection can become active.

These are expected Wave 1 dependencies. They are not a conflict with the
canonical model.

## Promotion Gate

This checkpoint may advance from source-built preparation only after the
published Wave 1 handoff supplies:

- exact operation names and request and response schemas;
- migrations and public transport availability;
- profile registration receipt;
- source-revision validation receipt;
- sealed-set creation and seal receipt;
- atomic observation commit and stale-head behavior;
- ingress identity receipt;
- projection outbox and health receipt;
- focused, cleanroom, hostile, replay, and concurrency proof.

Until then, all Partner canonical work remains source-only and shadow-only.
