# DGR-006 Structured Golden Manifest And Subproof Reporting

## Goal

Emit one structured manifest that represents the truth of the golden run.

## Scope

- manifest fields for overall status, primary artifacts, and missing
  requirements
- per-phase reporting
- per-checkpoint reporting inside phases

## Acceptance

- the manifest is sufficient to explain why a run passed or failed
- required and optional checkpoints are distinguished
- no schema introduces a `kind` field
