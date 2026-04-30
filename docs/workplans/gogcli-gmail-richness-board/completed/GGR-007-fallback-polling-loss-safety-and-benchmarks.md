# GGR-007 Fallback Polling Loss Safety And Benchmarks

## Goal

Make fallback polling safe enough for degraded operation while keeping it
clearly secondary to Gmail history/watch.

## Current Gap

When Gmail watch/history state is unavailable, fallback polling searches a
recent inbox window with a fixed maximum result count. That can miss bursts
outside the top result window and still repeats broad work.

## Scope

- replace fixed top-window polling with page-until-stable behavior
- persist polling watermark state using internal date, message id, and last
  successful poll time
- keep an overlap window for provider ordering ambiguity
- bound maximum pages and emit degraded health when the cap is hit
- record request counts, emitted record counts, skipped duplicate counts, and
  poll runtime
- fold or cross-reference AFEA-006 into this ticket once implemented

## Acceptance

1. missed-burst regression test proves more than one page of new messages is
   not silently skipped
2. restart proof resumes from durable fallback state
3. no-change poll benchmark is bounded and measured
4. degraded polling state is visible to operator health/status surfaces
5. history/watch mode remains preferred whenever available

## Completion Notes

- Replaced fixed top-window fallback polling with page-until-stable behavior.
- Polling now continues through pages until it sees a duplicate-only stable
  page, exhausts results, or hits `NEXUS_GOG_POLL_MAX_PAGES` / default page
  cap.
- Durable poll state now stores seen ids plus internal-date/message watermark,
  last successful poll time, runtime, request/page counts, emitted count,
  duplicate skips, and page-cap status.
- Adapter health details expose fallback polling state and page-cap status.
- Validation:
  - `go test ./...`
  - `go build -o ./bin/gog-adapter ./cmd/gog-adapter`
  - missed-burst regression with 125 new messages across multiple pages
  - no-change poll benchmark bounded to one request
  - page-cap regression marks degraded state
- History/watch remains preferred by `monitor`; fallback polling is only used
  when history state is unavailable or stale.
