# GJV-002 Primary Demo Artifact Contract And Retention

## Goal

Make one primary demo artifact the review default for successful runs and
downgrade heavier debug media to secondary status.

## Scope

- define how a run marks its primary demo artifact
- keep the main recording on success
- make per-test video optional or failure-oriented on success
- preserve richer debug media on failure

## Acceptance

- successful runs keep one obvious main review artifact
- failure runs retain the deeper debug set
- reviewers no longer need to browse dozens of tiny videos first

## Closure Notes

Landed:

- fresh-boot run evidence already projects `primary_recording_path`
- Dispatch run review can render that primary artifact first
- successful Playwright cleanroom runs now prune raw per-test `video.webm` and
  `trace.zip` from `playwright/output/` by default
- failing runs still retain the richer debug set

Validated:

- success-path wrapper proof kept only screenshots inside raw Playwright output
  while pruning per-test `video.webm` and `trace.zip`
- failure-path wrapper proof retained copied traces and videos alongside the raw
  output for diagnosis
- the first flagship bundle now exposes one obvious primary recording at:
  `/Users/tyler/nexus/home/projects/nexus/state/artifacts/validation/cleanroom/gjv-004-owner-console/20260330T163141Z/videos/full-session.webm`
