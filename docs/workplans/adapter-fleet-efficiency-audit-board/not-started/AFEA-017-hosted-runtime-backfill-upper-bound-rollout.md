# AFEA-017 Hosted Runtime Backfill Upper Bound Rollout

## Goal

Deploy and prove the core-runtime path that preserves manual bounded backfill
upper bounds through `adapters.connections.backfill` on hosted runtimes.

## Why

The `zenoti-emr@0.1.4` package and cleanroom proof both honor bounded
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
3. A hosted Devenir bounded force replay records both `since` and `to` in job
   input, output, and metrics.
4. The proof does not mutate Zenoti and does not require an all-time replay.
5. Runtime restart still rehydrates the installed `zenoti-emr@0.1.4` package
   and the Devenir connection.

## Current Evidence

- hosted server: `srv-57f32449-320`
- tenant: `t-673f3131-f16`
- connection: `1fc18e47-2958-4eb9-ae67-4c5b98017010`
- installed package: `zenoti-emr@0.1.4`
- May 4 hosted bounded force replay from `2026-05-02T00:00:00Z` processed
  `21` records in about `8s`, but the job input omitted the requested `to`
  value
- hosted package reflection reports `records.backfill.stage.until` as a
  string

## Notes

This is a core-runtime deployment/proof ticket, not a Zenoti adapter package
ticket.
