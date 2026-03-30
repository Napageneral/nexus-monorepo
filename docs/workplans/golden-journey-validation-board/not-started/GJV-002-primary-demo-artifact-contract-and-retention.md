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
