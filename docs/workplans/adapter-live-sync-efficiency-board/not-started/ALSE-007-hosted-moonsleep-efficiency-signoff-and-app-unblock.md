# ALSE-007 Hosted MoonSleep Efficiency Signoff And App Unblock

## Goal

Close the loop on the hosted MoonSleep performance problem and unblock
attribution app parity work.

## Scope

- rerun the hosted MoonSleep benchmark contract after the adapter and runtime
  hardening work
- perform a meaningful soak with active live sync
- confirm that the hosted runtime is fast enough to trust for real product
  iteration and side-by-side comparison work

## Acceptance

1. the hosted MoonSleep server meets the latency budget defined by `ALSE-001`
2. hosted CPU and disk behavior are stable enough for continuous live sync
3. adapter freshness remains acceptable after efficiency hardening
4. `/Users/tyler/nexus/home/projects/nexus/docs/workplans/moonsleep-hosted-attribution-runtime-board/README.md`
   can treat soak readiness as green again
5. `/Users/tyler/nexus/home/projects/nexus/docs/workplans/attribution-app-parity-board/README.md`
   is explicitly unblocked
