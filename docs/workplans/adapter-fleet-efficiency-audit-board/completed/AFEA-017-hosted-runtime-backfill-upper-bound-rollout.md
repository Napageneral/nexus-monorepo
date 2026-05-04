# AFEA-017 Hosted Runtime Backfill Upper Bound Rollout

Status: Completed on 2026-05-04.

## Goal

Deploy and prove the core-runtime path that preserves manual bounded backfill
upper bounds through `adapters.connections.backfill` on hosted runtimes.

## Why

The `zenoti-emr@0.1.5` package and retained cleanroom proof both honor bounded
backfill:

- `records.backfill` receives `BackfillWindow.To`
- `records.backfill.stage` accepts optional `until`
- cleanroom proof queued a bounded backfill with an explicit `to`

The May 4 hosted Devenir rollout proved the package install, restart, monitor,
and provider-read path, but the deployed hosted runtime did not persist the
manual `to` parameter in `adapters.connections.backfill` job input. That means
operators cannot yet prove a hosted manual replay upper bound through the
public RPC path, even though the adapter package supports it.

## Acceptance

1. The deployed hosted runtime preserves `to` in
   `adapters.connections.backfill` job input.
2. The internal adapter backfill worker passes that upper bound through to
   package `records.backfill` or staged `records.backfill.stage`.
3. A hosted Devenir bounded replay records both `since` and `to` in job input,
   output, and metrics.
4. The proof does not mutate Zenoti and does not require an all-time replay.
5. Runtime restart still rehydrates the installed `zenoti-emr@0.1.5` package
   and the Devenir connection.

## Completion Evidence

- hosted server: `srv-57f32449-320`
- tenant: `t-673f3131-f16`
- connection: `1fc18e47-2958-4eb9-ae67-4c5b98017010`
- installed package: `zenoti-emr@0.1.5`
- runtime package commit: `f76d83741e0c58726e95c63f71d268e519a412e2`
- runtime artifact:
  `/Users/tyler/nexus/state/artifacts/validation/afea-017-hosted-upper-bound-runtime-20260504T1730/nexus-2026.4.2-3.tgz`
- hosted bounded non-maintenance replay:
  `/Users/tyler/nexus/state/artifacts/validation/afea-017-hosted-upper-bound-runtime-20260504T1730/hosted-upper-bound-proof.json`
  - job run: `jobrun_3ffb0cc0-8835-487f-ad51-0286dcd70608`
  - window: `2026-05-04T22:27:40.700Z` to `2026-05-04T22:30:40.700Z`
  - result: completed in about `6s`, processed `0` records, preserved `to` in
    job input, output, and metrics
  - metrics: `maintenance_replay = false`, `monitor_was_paused = false`
- hosted bounded force replay:
  `/Users/tyler/nexus/state/artifacts/validation/afea-017-hosted-upper-bound-runtime-20260504T1730/hosted-upper-bound-force-replay-proof.json`
  - job run: `jobrun_8a93f9fe-a10c-4abe-978d-d99e1be043f6`
  - window: `2026-05-04T22:19:59.182Z` to `2026-05-04T22:21:59.182Z`
  - result: completed in about `6s`, processed `0` records, preserved `to` in
    job input, output, and metrics
  - metrics: `force_replay = true`, `maintenance_replay = true`
- hosted post-restart proof:
  `/Users/tyler/nexus/state/artifacts/validation/afea-017-hosted-upper-bound-runtime-20260504T1730/hosted-post-restart-proof.json`
  - runtime healthy on PID `649758`
  - `adapter.info` reports `zenoti-emr@0.1.5`
  - `adapter.health` reports `connected = true`
  - `adapters.connections.status` reports `connected` with `56,080` records
  - `adapters.connections.livesync.status` reports `enabled = true`

## Runtime Changes

- `adapters.connections.backfill` now accepts and persists optional `to`.
- Adapter backfill idempotency now includes `to`, so distinct bounded windows do
  not collapse into the same active/replay key.
- Internal adapter backfill workers pass `to` through to both
  `records.backfill` and `records.backfill.stage`.
- Metrics now persist `requested_to`, `effective_to`, and
  `maintenance_replay`.
- Bounded non-force replays run without pausing the live monitor; unbounded or
  explicit `forceReplay` runs keep the maintenance replay behavior.

## Notes

This is a core-runtime deployment/proof ticket, not a Zenoti adapter package
ticket.
