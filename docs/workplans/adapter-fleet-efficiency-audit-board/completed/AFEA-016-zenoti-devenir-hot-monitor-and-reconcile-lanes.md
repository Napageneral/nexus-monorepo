# AFEA-016 Zenoti Devenir Hot Monitor And Reconcile Lanes

## Goal

Tighten `zenoti-emr` for active Devenir use without weakening the read-only
provider-truth model.

## Result

Completed on May 4, 2026.

The monitor no longer uses the full 72-hour replay as every steady-state poll.
It now runs:

- an initial 72-hour reconcile pass when the monitor starts
- a 10-minute hot poll with a six-hour replay tail
- a 72-hour reconcile pass every six hours
- stale-cursor catchup when the SDK cursor is older than the hot replay tail

The existing 72-hour safety window remains in place for late invoice and
revenue changes, but normal steady-state polling is cheaper and more
responsive for active Devenir usage.

## Companion Backfill Fix

This pass also preserves the bounded-backfill cutover semantics for Zenoti:

- `records.backfill` now receives the full SDK `BackfillWindow`
- `BackfillWindow.To` is honored as the upper bound for the projection run
- `records.backfill.stage` accepts an optional `until` payload and applies it
  as the staged export upper bound

## Evidence

Code changed:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/cmd/zenoti-emr-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/cmd/zenoti-emr-adapter/outcome_projection.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/cmd/zenoti-emr-adapter/staged_backfill.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/cmd/zenoti-emr-adapter/provider_methods.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/cmd/zenoti-emr-adapter/main_test.go`

Test run:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr
go test ./...
```

Result:

- `ok github.com/nexus-project/adapter-zenoti-emr/cmd/zenoti-emr-adapter 0.197s`

Package validation:

```bash
nexus package validate /Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr
```

Result:

- `ok = true`
- `package_id = "zenoti-emr"`
- `version = "0.1.4"`

Package artifact:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/dist/zenoti-emr-0.1.4.tar.gz`
- sha256 `1bedaa910dca692977b0a5480c4244c1c2fa719b38207aae1e36d3cc99f1f465`

Cleanroom live proof:

- capture bundle:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/zenoti-live-cleanroom/20260504T173946Z`
- proof bundle:
  `/Users/tyler/nexus/state/sandboxes/67d30fc9-87b3-461f-860d-f25014921453/artifacts/validation/zenoti-agent-proof/20260504T174027Z`
- package install active at `zenoti-emr@0.1.4`
- package health `healthy = true`
- `records.backfill.stage` reflected the new optional `until` string parameter
- automatic activation queued bounded backfill with `to = 2026-05-04T17:40:53.882Z`
- backfill completed with `21` projected outcome records and `phi_leak_count = 0`
- staged backfill wrote `21` records in `1` chunk
- monitor start returned `{ "started": true }`
- agent-use proof invoked `zenoti.services.list` successfully
- restart proof rehydrated the package and connection, with resumed runtime
  state `healthy`

## Follow-Up

Hosted Devenir rollout proof was completed on May 4, 2026:

- Frontdoor catalog now publishes `zenoti-emr@0.1.4`:
  - `release_id = rel-zenoti-emr-0.1.4`
  - `variant_id = variant-zenoti-emr-0.1.4-linux-arm64`
  - sha256 `1bedaa910dca692977b0a5480c4244c1c2fa719b38207aae1e36d3cc99f1f465`
- Devenir hosted server `srv-57f32449-320` was upgraded through the public
  Frontdoor adapter lifecycle path:
  - tenant `t-673f3131-f16`
  - installed version moved from `0.1.3` to `0.1.4`
  - runtime health returned `healthy`
- Hosted connection `1fc18e47-2958-4eb9-ae67-4c5b98017010` rehydrated after
  runtime restart:
  - connection status `connected`
  - record count `56079`
  - landed span starts at `2010-01-01T00:00:00.000Z`
  - method reflection reports `records.backfill.stage.until` as a string
- A hosted bounded force replay from `2026-05-02T00:00:00Z` completed in about
  `8s` with `21` records processed.
- Hosted provider read proof after restart:
  - `zenoti.services.list`
  - center `433ee0e5-16e3-425d-bfaf-f192b7b5f9c4`
  - returned `5` services
- Restart proof:
  - `nex-runtime.service` was restarted on the Devenir runtime host
  - stale `0.1.3` monitor processes were cleared
  - a single `0.1.4` monitor process was started after restart
  - runtime health reported one running, healthy `zenoti-emr` adapter

One runtime-side follow-up remains outside this adapter package: the deployed
hosted `adapters.connections.backfill` RPC accepted `forceReplay` but did not
persist the requested `to` upper bound in job input. The adapter package and
cleanroom proof both honor bounded `to` / staged `until`; the hosted runtime
API path needs a core-runtime rollout before hosted manual backfills can prove
that upper bound through `adapters.connections.backfill`.
