# WIS-006 Repo-Local Startup Preflight And Receipts

## Goal

Catch repo-local startup failures before the worker is attached.

## Scope

- define canonical startup preflight commands for warm implementation
  substrates
- record preflight receipts and diagnostics
- include command-shim and repo-local smoke checks such as `pnpm exec` health
- make failed preflight trigger rebuild or block before worker attach

## Acceptance

- a broken startup surface is detected before worker prompt delivery
- the prepared substrate records the receipts and diagnostics that justified
  launch
- cold-start failures like missing shims are not first discovered by the worker
