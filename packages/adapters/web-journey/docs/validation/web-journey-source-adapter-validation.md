# Web Journey Source Adapter Validation

**Status:** CANONICAL
**Last Updated:** 2026-04-06
**Related:** [Web Journey Source Adapter](/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/specs/web-journey-source-adapter.md), [Adapter Validation Proof Ladder](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/adapter-validation-proof-ladder.md)

## Purpose

This document defines the package-local proof contract for `web-journey`.

The package is a source adapter, so validation is about truthful source ingest
and freshness, not provider-backed full-surface discovery.

## Canonical Proof Ladder

### 1. Package build and local tests

Prove:

- package tests pass
- TypeScript checks pass
- package build passes
- release packaging is repeatable

### 2. Install and connect proof

Prove:

- the adapter installs into a fresh cleanroom runtime
- the connection identity is bound to `web_installation_id`
- the package advertises the truthful `collect` and `collect.batch` surface
- health reflects the bound source instance truthfully

### 3. Live collect and freshness proof

Prove:

- `web-signals` routes authenticated collection into `web-journey`
- a real browser event reaches the adapter
- canonical `record.ingest` records are emitted
- row metadata preserves journey evidence and bridge fields
- freshness updates when new events arrive

### 4. Consuming-app proof

Prove:

- `attribution` reads `web-journey` rows
- the consuming app does not depend on raw browser payload residue
- downstream binding can distinguish journey evidence from backend outcomes

### 5. Agent-use proof, if the mounted capability tree is part of the claim

Prove:

- a worker or validating harness can discover the adapter surface correctly
- the surface invocation succeeds through the installed package

## What This Validation Does Not Claim

- provider-backed full-surface API coverage
- browser performance or RUM telemetry
- historical backfill semantics unless a true replay source exists

## Evidence Expectations

The retained proof should include:

- package validation output
- cleanroom install/connect output
- one or more live collect traces
- canonical record evidence from the runtime or cleanroom records store
- downstream consuming-app read evidence

## Package Notes

The package is currently truthful when it describes itself as a source adapter
with a push-based live-sync model.

It should not be described as a provider-backed adapter or as a hybrid
installation app.
