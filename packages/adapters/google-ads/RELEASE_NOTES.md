# Release Notes

## 0.1.1

- replace the generic one-minute replay monitor with adapter-local per-family monitor lanes
- move daily report reconciliation to a 30-minute cadence with a bounded three-day tail
- move account/access snapshots to a daily cadence instead of polling accessible customers every minute
- suppress unchanged monitor revisions before emitting durable records
- cache the working no-login-customer-header posture after Google returns `USER_PERMISSION_DENIED`
- add a gated live MoonSleep benchmark for backfill and steady-state monitor validation

## 0.1.0

- initial dedicated Google Ads package scaffold
