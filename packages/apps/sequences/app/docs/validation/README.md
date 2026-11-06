# Validation ladder (build manual §4)

## T1: on the Mac, no site involved

1. `test/verify-nex.mts` against nex origin/main on a throwaway PG 17 with production role shapes
   (TESTING.md). Settles §8 R-1 (the migrator also needs `sequences_app` with SET).
2. Store tests (`SEQUENCES_TEST_DATABASE_URL`): `sequences_app` is refused UPDATE/DELETE on
   step_events, relays, winners, definitions and import_bundles; the partial unique index keeps one
   open alert per (rule, subject).
3. Unit tests beside each module: hooks (six jobs once, `listAll` across a short filtered page,
   drift-only update, schedule created disabled, `enabled` kept across deactivate → upgrade →
   activate, foreign binding refused, agent inactive, exact non-empty allowlists, no schedule but
   `sequences.tick` ever); configure (stable sha, refusals, rollback, readback); RFC 8785 vectors;
   the design's g5 time table and the 11/1 refusal; the October files compile with a stable sha and
   every check fires on a crafted file; rank against the Python oracle's synthetic vectors;
   acceptance (rejected → lookup → adopt, accepting → lookup first, old-revision → a<n+1>, draws
   through jobs.invoke with a serialization key, explicit max_attempts, trigger 'sequences'); the
   step claim and its refusals; import V1-V10, idempotency, a promotion re-push; the shadow compare
   and its diff classes; A1/A11/A13 timings and the 6 h re-send; the output contract's text and
   JSON carrying the same facts.
4. moonsleep-v1 tests (B1/B2).
5. Replay: `scripts/sequences_replay.py` (Python oracle) and `SEQUENCES_REPLAY_BUNDLE=<bundle>`
   (this app) must agree on G1 d1 and G2 d1, then on every drawing as it lands.

## T2: cleanroom runtime proof (lab), T3: production proof

As build manual §4: install through the operator API against a migrated schema (409 on a behind
schema), configure arms the tick and a natural tick completes, an inline adapter_projection
handler sees `ctx.app.store`, invokeMany partial and `jobs.runs.list {idempotency_key}` as
assumed, a worker attempt calling `credentials.resolve` (§8 R-2), and an upgrade during a delayed
step Run.

## Gate for P3

3 of 3 shadows pass on R (the read nearest the Mac's commit) and all ten replays pass in both
implementations. Any mismatch, explained or not, blocks P3 until a merged fix and a re-run of the
compare from the stored snapshots.
