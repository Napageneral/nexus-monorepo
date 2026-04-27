# OCRP-014 Full Matrix Rerun And Artifact Index

## Goal

Run the full Console real-adapter matrix and publish one reviewable artifact
 index for the whole suite.

## Why

Per-adapter green tickets are useful, but the suite is not truly closed until
 the full matrix has been rerun through the shared cleanroom harness.

## Scope

- rerun every green adapter profile through the shared harness
- collect the primary recording and screenshot bundle for each adapter
- write one artifact index or summary document for the full suite
- confirm there are no lingering local-only assumptions in the cleanroom path

## Acceptance

- every targeted adapter profile has one fresh cleanroom proof run
- every indexed adapter bundle includes ingest completion truth and observed
  counts or equivalent inventory totals
- the full matrix has a reviewable artifact index
- the suite can be treated as the canonical real-adapter Console proof set
