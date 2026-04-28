# AFEA-002 Zenoti Durable Live Monitor

## Goal

Sanity-check `zenoti-emr` backfill and live monitor behavior for obvious
inefficiency before deeper client rollout work.

## Result

Completed on April 27, 2026 as a sanity pass.

Zenoti is not doing the dangerous pattern that overloaded MoonSleep: it does
not scan all historical data every monitor tick, and it does not run on a
minute-scale loop. The current live monitor is still not a perfect durable
family-cursor design, but it is bounded enough to continue to the next adapter
review.

## Findings

- backfill is date-bounded and streams through the projection path
- staged backfill writes chunked JSONL output and persists manifest progress
- long-history staged backfill walks newest-first so recent data can land
  before old history is exhausted
- monitor runs hourly, not every minute
- monitor starts from a 72-hour replay floor and continues forcing the request
  floor to the latest 72-hour window
- the 72-hour replay means each monitor tick can reread the recent appointment
  window and re-enrich invoice details, but existing proof data is small
- projected record ids are stable provider-native ids, so repeated rows should
  dedupe at the durable record layer instead of creating unbounded record
  identities

## Evidence

Code reviewed:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/cmd/zenoti-emr-adapter/main.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/cmd/zenoti-emr-adapter/outcome_projection.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/cmd/zenoti-emr-adapter/staged_backfill.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/docs/workplans/zenoti-adapter-compliance-board/in-progress/ZAC-009-live-freshness-webhook-first-and-polling-fallback.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr/docs/validation/ZENOTI_EMR_ADAPTER_VALIDATION.md`

Test run:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/zenoti-emr
go test ./...
```

Result:

- `ok github.com/nexus-project/adapter-zenoti-emr/cmd/zenoti-emr-adapter 0.192s`

Retained proof references:

- `/Users/tyler/nexus/state/sandboxes/c5d91c04-10e1-479a-8f51-9932c1048cde/artifacts/validation/zenoti-agent-proof-restart-soak-final/20260406T143524Z`
- `/Users/tyler/nexus/state/sandboxes/ad6f7fcb-0946-4196-8f9a-d0be3349986b/artifacts/validation/zenoti-zac007-stage/20260406T154309Z`

## Follow-Up

Do not do a durable family-cursor refactor in this first fleet pass unless
hosted Devenir volume proves the hourly 72-hour reread is materially expensive.

If Zenoti becomes noisy in production, the next narrow improvement is to keep
the 72-hour reconcile behavior but separate it from the hot monitor cycle:

- hot lane reads a shorter recent window
- reconcile lane runs the 72-hour replay less frequently
- invoice detail enrichment is suppressed for invoices already seen unchanged

