# Reliability Incidents Shadow Rollout

## Phase 1 — package proof

1. Validate normalization, source binding, routing, replay suppression, corrections, and identity drift.
2. Build and package the adapter.
3. Install it into a disposable Nex runtime and prove search/readback.

## Phase 2 — MoonSleep source bridge

1. Add one append-only source event writer beside the existing health state files.
2. Write transitions before email delivery.
3. Translate checkout, quota, timer, analytics, API, Nex, and host-pressure state changes into the shared contract.
4. Push through the adapter with durable retry and retain source receipts.
5. Reconstruct the previous seven days from Gmail and systemd into a reviewed import bundle.

## Phase 3 — shadow operation

1. Run for one to two weeks without changing alert behavior.
2. Compare source events, Nex records, emails, and recoveries daily.
3. Measure duplicate-signal consolidation, missing transitions, and false-positive rate.

## Phase 4 — incident-owned notifications

Generate email and iMessage notifications from durable incident lifecycle transitions. Reminders attach to the existing incident and never increment incident count.

## Phase 5 — bounded triage

Allow a reliability agent to collect evidence and propose typed remediation. Mutations remain approval-gated until specific runbooks prove safe and effective.
