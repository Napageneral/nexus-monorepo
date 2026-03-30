# GJV-001 Whole-Sandbox Session Recording Substrate

## Goal

Record the sandbox session itself from startup through proof completion so the
primary review artifact is a truthful whole-session recording rather than a
browser-only artifact.

## Scope

- capture the visible sandbox session before bootstrap begins
- keep recording through shell, browser, and runtime activity
- attach the resulting recording to the owning run
- preserve compatibility with the existing structured proof bundle

## Acceptance

- a fresh sandbox proof run emits one primary whole-session recording
- the recording shows meaningful pre-browser phases instead of going blank until
  Playwright becomes active
- the run still produces structured proof metadata and logs

## Validation

- one representative sandbox proof lane emits the new primary recording
- the proof bundle identifies it as the primary review artifact

## Closure Notes

Landed:

- `capture-cleanroom-proof.sh` now owns the whole-session recording wrapper
- the wrapper writes run-level recording metadata and result receipts
- cleanup is now bounded so helper processes cannot block forever before
  `result.json` is written
- browser-surface fallback no longer loses helper PIDs during cleanup

Validated:

- recording-smoke bundle:
  `/tmp/gjv-recording-smoke.8B6AS6/validation/cleanroom/recording-smoke/20260330T162954Z`
- first flagship run also emitted the same review contract:
  `/Users/tyler/nexus/home/projects/nexus/state/artifacts/validation/cleanroom/gjv-004-owner-console/20260330T163141Z`

Residual caveat:

- the fallback path still uses a browser/log surface when a richer desktop
  shell surface is unavailable, but it now records the entire sandbox session
  from startup through proof completion and writes truthful receipts
