# WIS-002 Prepared Substrate Registry And Sandbox Provenance

## Goal

Persist prepared substrates durably and record which prepared substrate a live
sandbox actually used.

## Scope

- add a durable registry for prepared substrates
- record prepared-substrate provenance on sandbox rows or equivalent runtime
  state
- expose preflight status and diagnostics through the persisted model
- make the runtime inspectable without unpacking opaque blobs

## Acceptance

- Nex can list or inspect prepared substrates as durable runtime objects
- a sandbox started from a warm substrate records that provenance explicitly
- operators can tell which runtime config, image artifact, and prepared
  substrate were involved in one worker attempt
