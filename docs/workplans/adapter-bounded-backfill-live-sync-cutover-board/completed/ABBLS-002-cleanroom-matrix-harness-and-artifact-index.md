---
summary: "Define and run the reusable cleanroom matrix harness for the bounded backfill live-sync cutover."
title: "ABBLS-002 Cleanroom Matrix Harness And Artifact Index"
---

# ABBLS-002 Cleanroom Matrix Harness And Artifact Index

## Status

Completed 2026-05-02.

## Goal

Create the shared proof shape for the remaining adapter matrix so every lane
emits comparable evidence instead of one-off transcripts.

## Scope

- Define the matrix runner command shape.
- Define the artifact index fields.
- Reuse existing package cleanroom harnesses where they already exist.
- Record when a lane is true Docker cleanroom, runtime-managed sandbox, hosted
  surrogate, or documented host-native exception.

## Acceptance Criteria

1. Every lane has a proof command or runbook step.
2. Every lane writes a retained artifact bundle path.
3. Every bundle records:
   - repo commit or dirty-worktree fingerprint
   - adapter package id/version
   - cleanroom id
   - connection id
   - redacted credential source
   - `since` and `to`
   - live-sync status before and after bounded backfill
   - restart status when applicable
   - record counts and representative record ids
4. Matrix status is summarized in ABBLS-012.

## Current Evidence

- Jira bounded-window Docker smoke exists:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-jira-cleanroom/20260502T212725Z`
- Full package matrix passed 22 of 22 lanes:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-package-matrix/20260502T214249Z`
- Eve local watcher host-native proof passed:
  `/Users/tyler/nexus/state/artifacts/validation/cleanroom/adapter-bounded-backfill-eve-host-native-livewatch/20260502T214436Z`
- Matrix artifact index:
  [Artifact Index](../artifact-index.md)

## Exit

Completed after adding the shared matrix harness, passing the Docker package
matrix, recording the Eve host-native watcher exception, and indexing retained
proof bundles.
