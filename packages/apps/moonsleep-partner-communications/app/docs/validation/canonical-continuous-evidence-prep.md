# Partner Desk Canonical Continuous-Evidence Preparation

**Status:** SOURCE-BUILT DORMANT INTEGRATION

**Owner:** MoonSleep Partner Desk

**Authority:** source and cleanroom only

**Production mutation:** none

## Purpose

This checkpoint migrates Partner Desk 0.2.1 into a dormant 0.3.0 consumer of
the canonical Nex continuous-evidence contract without implementing or
duplicating shared core primitives.

The source preparation provides:

- one exact package-owned profile manifest;
- five fact profile schemas;
- three observation profile schemas and canonical head-key fields;
- three Partner-owned sealed-set scopes over the core `evidence_set_v1`
  primitive;
- stable Partner subject families;
- deterministic canonical serialization and candidate identities;
- a pure 0.2.1 legacy-to-candidate migration adapter;
- one sanitized Surewal Alibaba and Gmail golden fixture;
- focused, replay, hostile, and expected-head concurrency tests;
- exact profile registration and health readback through public Nex
  operations;
- a provider-free synthetic record builder;
- a core-backed dormant runtime plan and replay-safe applicator;
- a bounded PostgreSQL 17 cleanroom runner with exactly 22 required checks;
- a dependency-free temporary source cleanroom.

It does not read providers, activate Partner projection, call providers, or
touch production. The runtime applicator may create synthetic source
revisions, facts, sealed sets, and staged observation candidates only inside a
disposable cleanroom. The cleanroom additionally commits one synthetic
joined-store observation on a cleanroom-only head and delivers one
cleanroom-only outbox row to prove CAS refusal, lease fencing, restart, and
delivery. It does not promote a staged Partner candidate, grant live
canonical-promotion authority, or deliver to a production domain.

## Governing Identities

- merged Wave 1 Nex publication:
  `7e83ed75da31bab776c41b806fb87488085548e7`
- corrected shared-core checkpoint:
  `5b09aa16746b08e455a10eb0f789b990efd2cf2e`
- corrected shared-core tree:
  `51fa415054c1857ea8c63594923ded8ce020d29b`
- corrected shared-core proof:
  PostgreSQL 17.10 43 of 43 passed with zero skipped checks, failures, or
  residue; independent audit reported P0/P1/P2 equal to 0/0/0
- publication state:
  the corrected checkpoint is not yet merged because its owner's local GitHub
  authentication is invalid; `7e83ed75da31bab776c41b806fb87488085548e7`
  remains the last merged publication recorded by the manifest
- PostgreSQL continuous-evidence backend:
  `903d7be2fca4a12d22a7868cc403dd0cef8f312f`
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

The package is rebound to the corrected shared-core checkpoint. The remaining
source gate is execution of the exact 22-check PostgreSQL 17 cleanroom on a
runtime that can access Docker. Publication, merge, and activation remain
held until the corrected core is merged.

## Canonical Package Manifest

`contracts/partner-canonical-profiles.v1.json` declares:

- domain `moonsleep.partner`;
- owner package `moonsleep-partner-desk`;
- baseline package version `0.2.1`;
- activation state `dormant_source_registration`;
- exact stable subject identity fields;
- exact fact and observation schemas;
- exact observation head-key fields;
- exact sealed-set scope, resolver, target profile, and allowed-fact
  identities;
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

The adapter and runtime-plan builder create only:

- deterministic immutable fact candidates;
- core-compatible sealed-set scopes and member plans;
- shadow observation candidates with `expected_head_id` null;
- one shadow projection candidate;
- an exact plan digest.

The migration adapter performs no runtime operation. The separate runtime
applicator invokes only fact create, evidence-set create/add/seal, and
observation-candidate stage operations. It never invokes promotion.

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

- Node contract tests: 33 passed, 0 failed, 0 skipped;
- source records: 6;
- fact candidates: 26;
- observation candidates: 9;
- replay plans: byte-identical;
- replay receipts: byte-identical;
- plan SHA-256:
  `f861d83ada5b319ff6deada2458db7d91be643e14268473a0d91a0e98199babe`;
- plan file SHA-256:
  `1195d3f7baac2e0879fa4ddddaabf6a0045bcb89819c19586cc1fecf78fa6322`;
- provider write authority: false;
- identity merge authority: false;
- external-domain write authority: false;
- draft-or-send authority: false;
- temporary cleanroom residue: zero.

The full dependency-backed package suite passes:

- Node tests: 33 passed;
- Vitest tests: 26 passed;
- total: 59 passed;
- UI production build: passed.
- Nex package validation: passed with zero errors and zero warnings.
- package version: `0.3.0`.

## Terminal Core Binding

The previously identified source-revision, profile-registration, sealed-set,
expected-head, identity, and outbox gaps are closed by the terminal Wave 1
core. This package consumes those core operations and does not create a
parallel observation store.

The package registers exactly five fact and three observation profiles. Its
three set profiles remain Partner-owned semantic scopes, implemented through
the core generic evidence-set definition. The synthetic cohort supplies six
exact PostgreSQL-backed source revisions, then stages nine candidates across
all three scopes.

The runtime plan fails closed on missing, extra, duplicate, malformed, or
digest-mismatched source revision bindings. It also fails before a request is
emitted if a set resolver or target profile does not match the sealed
manifest.

## PostgreSQL 17 Proof Gate

Run:

```bash
NEX_RELEASE_IMAGE=<exact-5b09aa16-linux-amd64-image> \
POSTGRES_RELEASE_IMAGE=<exact-postgresql-17-linux-amd64-image> \
CLEANROOM_RECEIPT_PATH=/private/tmp/moonsleep-partner-canonical-surewal-pg17-receipt.json \
./scripts/test-canonical-surewal-postgres-cleanroom.sh
```

The runner requires 22 of 22 checks: exact synthetic source output, corrected
core image identity, PostgreSQL 17 migration, runtime health, package install,
five fact profiles, three observation profiles, three set profiles, dormant
job and subscriptions, zero provider state, identity create and replay,
six-record ingest and replay, exact PostgreSQL revision binding, 26 facts,
nine sealed sets and staged candidates, full replay with unchanged counts,
exact PostgreSQL-revision-to-memory-fact joining, one synthetic cleanroom-only
CAS head commit and idempotent replay, stale-head refusal with no residue,
outbox lease-conflict refusal and delivery, restart durability, and zero
container, volume, or network residue. Partner candidate promotions remain
zero and every live authority remains false.

This task's managed shell cannot access the local Docker socket and cannot
reach the Ops host over SSH. Therefore no PostgreSQL receipt is claimed in
this source document until the exact runner completes in an authorized
cleanroom.

## Promotion Gate

This checkpoint may advance from dormant source registration only after the
corrected core is merged, the exact PostgreSQL 17 runner produces its 22 of 22
receipt, an independent source review reports no P0/P1/P2 defects, and a
separate production activation packet is reviewed. Provider reads, historical
backfill, production pointer changes, live observation promotion, and
production projection delivery remain out of scope.
