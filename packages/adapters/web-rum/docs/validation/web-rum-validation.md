# Web RUM Validation

## Status

Package-local validation contract.

## Purpose

This document defines the truth bar for the `web-rum` package scaffold.

It is intentionally narrower than the provider-backed adapter proof ladder.

## Current Local Proof Contract

The package-local validation bar is:

1. the package manifest validates
2. the package builds
3. the package-local contract tests pass
4. the adapter surface exposes `capture` and `capture.batch`
5. the adapter surface is bound to `web_installation_id`
6. the emitted records preserve canonical RUM row metadata
7. the package does not leak `website-*` legacy naming in its own contract

## Expected Source-Adapter Proof Shape

When the family is validated more broadly, the proof should also show:

1. install and connect in a cleanroom runtime
2. live capture reaches the adapter through the intended trust path
3. canonical RUM records materialize
4. freshness updates correctly
5. consuming apps can read the emitted rows without depending on raw SDK
   payload residue

## Out Of Scope

This package does not currently claim:

- hosted lifecycle proof
- long-running soak proof
- a historical replay lane
- service telemetry outside the browser runtime family

Those must be added explicitly if and when the package grows those contracts.

