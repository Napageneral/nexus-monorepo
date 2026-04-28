# AFEA-006 GOG Gmail Monitor Efficiency

## Goal

Make the Gmail monitor path in `gog` both efficient and loss-safe.

## Current Gap

When Gmail watch/history state is unavailable, fallback polling repeatedly
searches a recent inbox window with a fixed max result count. That can miss
bursts outside the top search window and still repeats broad mailbox work.

Primary file:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/gog/cmd/gog-adapter/main.go`

## Scope

- prefer and repair Gmail watch/history mode where available
- make fallback polling page until stable instead of relying on a fixed top
  window
- use internal date, history id, and message id tie-breakers for durable resume
- record monitor request counts and missed-burst regression coverage
- document when fallback polling is acceptable versus degraded

## Acceptance

1. high-volume bursts cannot fall out of the fallback window unprocessed
2. restart proof resumes from durable state
3. no-change fallback polls are bounded and measured
4. watch/history failures produce actionable health or degraded-state output
