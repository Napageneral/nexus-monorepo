# GlowBot Synthetic Deployed Rehearsal Workplan

> Focused execution plan for proving GlowBot behavior on the real hosted
> topology before live clinic credentials arrive.
>
> **Status:** ACTIVE
> **Last Updated:** 2026-03-12

## Goal

Prove that deployed GlowBot behaves correctly with synthetic canonical records
on separate clinic and control-plane servers.

## Preconditions

- hosted package publish/install rehearsal is complete
- `glowbot-admin -> glowbot-hub` dependency install works
- deployed `productControlPlane.call` works
- clinic write path is `record.ingest` -> `record.ingested` -> `metric_extract`

## Workstreams

### R1. Rehearsal Inputs

- define the minimal clinic profile payload needed for benchmark publication
- define the minimal synthetic canonical record set needed to drive:
  - overview
  - funnel
  - modeling
  - recommendations

Exit criteria:

- the rehearsal uses canonical payloads only
- no direct DB writes are needed

### R2. Deployed E2E Harness

- extend the existing hosted GlowBot E2E harness
- keep the same real package publish/install flow
- keep separate control-plane and clinic runtimes
- add clinic runtime RPC helpers for:
  - clinic profile update
  - synthetic `record.ingest`
  - clinic method reads

Exit criteria:

- one test can stand up the full deployed shape and drive the full rehearsal

### R3. Metric Ingest Proof

- inject synthetic records through canonical `record.ingest`
- wait for downstream durable processing
- verify `metric` elements exist with canonical provenance

Exit criteria:

- synthetic records produce real `metric` elements without direct seeding

### R4. Clinic Read Proof

- call:
  - `glowbot.overview`
  - `glowbot.funnel`
  - `glowbot.modeling`
  - `glowbot.agents.recommendations`
- verify outputs are coherent

Exit criteria:

- deployed clinic app returns sane outputs from the synthetic metric set

### R5. Control-Plane Proof

- update a product flag through `glowbot-admin`
- read product flags through the clinic app
- validate benchmark snapshot publication/query on the deployed path

Exit criteria:

- deployed clinic and control-plane packages communicate through the canonical
  hosted path

## Non-Goals

- live provider credentials
- managed profile live-provider exchange
- persisted derived-output materialization
- HIPAA / EMR validation

## Completion Rule

This workplan is complete when the deployed rehearsal proves:

- package install truth
- canonical synthetic ingest
- metric element creation
- clinic method sanity
- benchmark/control-plane round-trips

After completion, this workplan should be archived and the remaining waiting
period work should move to targeted hub/admin hardening and W12 design.
