# AFEA-003 TikTok Display Live Monitor

## Goal

Make `tiktok-display` pass the basic backfill/live-monitor sanity bar.

## Result

Completed on April 27, 2026 with a small source fix.

Backfill was already bounded: it reads the profile once, then pages TikTok
videos until it reaches the requested floor. The problem was the monitor:
`adapter.monitor.start` advertised monitor support, but it computed a seven-day
floor, called backfill once, emitted records, and exited.

The monitor now uses the Go adapter SDK poll loop:

- first cycle runs immediately
- subsequent cycles run hourly
- each cycle keeps the existing seven-day bounded replay window
- the handler blocks until runtime cancellation
- consecutive fetch errors are capped before the monitor exits

## Files Changed

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display/cmd/tiktok-display-adapter/ingest.go`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display/cmd/tiktok-display-adapter/ingest_test.go`

## Evidence

Test run:

```bash
cd /Users/tyler/nexus/home/projects/nexus/packages/adapters/tiktok-display
go test ./...
```

Result:

- `ok github.com/nexus-project/adapter-tiktok-display/cmd/tiktok-display-adapter 0.187s`

## Follow-Up

The April 27 sanity bar is complete, but the target-state adapter standard is
now higher than this minimal fix.

The next ticket is:

- [AFEA-015 TikTok Display Smart Polling And Snapshot Ledger](/Users/tyler/nexus/home/projects/nexus/docs/workplans/adapter-fleet-efficiency-audit-board/completed/AFEA-015-tiktok-display-smart-polling-and-snapshot-ledger.md)
