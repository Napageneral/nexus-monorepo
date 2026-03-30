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
