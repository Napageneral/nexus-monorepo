# EVP-011 No-Sweep Startup-Window Watcher Proof

## Goal

Prove that Eve can confirm a cleanroom-routed `imessage.send` without the
interval hot sweep, and close the startup-window watcher gap that could miss a
real `chat.db` row landing during edge startup.

## Scope

- watcher startup ordering on the paired edge
- no-sweep cleanroom rerun of the installed-Eve routing proof
- focused regression coverage for events that arrive during startup
- preserving the fast watcher path without reintroducing the old broad sync
  loop

## Non-Goals

- re-enabling a periodic hot sweep as the primary fix
- private-API action parity work
- multi-connection proof with a second real identity
- changing Eve's canonical record model

## Why This Exists

The first no-sweep cleanroom rerun exposed a real gap: a routed self-loop send
was accepted, but Eve never ingested it into `eve.db` or emitted it into the
cleanroom records. Root-cause review showed that
`runWatcherMonitorWithCadence` ran the startup batch before it started
livewatch. That created a real blind spot: if a row landed after the startup
`HotSync` but before livewatch established its baseline, the watcher could
baseline past it and never emit a follow-up batch without another change.

A later controlled timing probe corrected an earlier overstatement about source
row latency. The outbound self-send row was visible in `chat.db` about `227ms`
after send start and about `54ms` after AppleScript returned, while the
reflected inbound row arrived about `2.4s` after send start. The real bug was
startup ordering, not a belief that self-send rows inherently take many
seconds to land.

## Acceptance

- livewatch starts before the startup batch so filesystem changes landing
  during startup cannot be baselined away
- a regression test proves an event queued during startup still triggers a
  later `filesystem` batch
- focused Go tests pass
- the cleanroom-installed Eve routing proof passes again with
  `defaultHotSweepInterval = 0`

## Validation

- `go test ./cmd/eve-adapter ./internal/etl ./internal/livewatch`
- `node --import tsx ./scripts/e2e/eve-cleanroom-method-routing-live.ts`
- `git diff --check`

## Outcome

Completed on 2026-03-31.

- Eve now starts livewatch before the startup sync in
  `/Users/tyler/nexus/home/projects/nexus/packages/adapters/eve/cmd/eve-adapter/monitor_state.go`
- `TestRunWatcherMonitorCapturesEventThatArrivesDuringStartup` proves a
  filesystem event arriving during startup is still processed afterward
- the no-sweep cleanroom rerun passed with:
  - sandbox id:
    `f92439c6-b3da-46c0-8e22-641af46e02a0`
  - paired edge session:
    `c54aeed6-a40a-4c95-b7a3-d2cf63ae24e9`
  - routed send token:
    `EVE INSTALLED METHOD ROUTE PROOF 2026-04-01T00:24:14.004Z 1775003054004`
  - canonical record ids:
    outbound `imessage:37B2AFB3-84AB-4DD1-BFB3-0A7AC937BED9`,
    reflected inbound `imessage:A3D31DD4-0016-460C-AE2D-CD9BF491C01E`

This ticket closes the no-sweep watcher reliability gap for the installed-Eve
cleanroom lane. The remaining live operator gap on this board is still the
second-identity multi-connection proof.
