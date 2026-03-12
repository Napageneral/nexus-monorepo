---
summary: "Hard-cutover workplan for Frontdoor release dependency metadata and dependency-driven hosted package install planning."
read_when:
  - You are implementing hosted dependency planning in Frontdoor
  - You need the concrete delta from single-package install to package-plan install
title: "Workplan Frontdoor Release Dependency Metadata and Install Planning"
---

# Workplan Frontdoor Release Dependency Metadata and Install Planning

## Purpose

This workplan turns the canonical dependency-planning spec into concrete
Frontdoor work.

Target-state spec:

- [Frontdoor Release Dependency Metadata And Install Planning](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/FRONTDOOR_RELEASE_DEPENDENCY_METADATA_AND_INSTALL_PLANNING.md)

## Status

- Phase 0 complete
- Phase 1 complete
- Phase 2 complete
- Phase 3 complete
- Phase 5 install-order validation complete
- Phase 4 still pending

## Customer Experience First

The target operator experience is:

1. publish a package release once
2. install one top-level package such as `glowbot-admin`
3. Frontdoor resolves and installs required packages automatically
4. the runtime activates them in dependency order
5. uninstall and upgrade remain coherent without manual dependency cleanup

The operator should not have to know:

- which dependency package is a hidden control-plane or backend app dependency
- whether that dependency currently installs through the app package path
- the correct manual install order

## Current Reality

What is already true:

- Frontdoor publishes packages, releases, and target variants
- Frontdoor records server package install state
- Frontdoor installs one app package at a time
- Frontdoor installs one adapter package at a time
- the runtime operator can install `app` and `adapter` packages

What is missing:

- active manifests and validators still need a hard cutover from
  `requires.services` to `requires.apps`
- no active `frontdoor_release_dependencies` table in the store schema
- publish does not extract dependency metadata from `requires`
- app install does not resolve dependency releases
- install does not write requirement edges
- uninstall does not use requirement-edge garbage collection
- GlowBot's `glowbot-admin -> glowbot-hub` control-plane install cannot yet be
  expressed through the hosted planner

## Design Constraints

1. hard cutover only; no parallel app-only dependency planner
2. preserve the distinction between:
   - logical dependency class
   - published package kind
3. do not block this slice on true runtime `service`-kind install support
4. use GlowBot control-plane install as the proving case

## Phase 0: Manifest And Runtime Dependency Vocabulary Cutover

### Goal

Make `requires.apps` and `requires.adapters` the only canonical dependency
groups consumed by manifests, publish, and install planning.

### Changes

- cut remaining package manifests from `requires.services` to `requires.apps`
- remove `requires.services` from Nex manifest validation and package docs
- update Frontdoor publish/install planning assumptions to app-to-app and
  app-to-adapter dependencies only

### Exit Criteria

- the GlowBot control-plane case is expressed as `glowbot-admin ->
  glowbot-hub` under `requires.apps`
- the active manifest validator no longer teaches or accepts
  `requires.services`
- the dependency planner only consumes `requires.apps` and
  `requires.adapters`

## Phase 1: Store And Publish Dependency Metadata

### Goal

Make release dependency metadata real in Frontdoor persistence and publish.

### Changes

- add `frontdoor_release_dependencies` to the active store schema
- add store upsert/list helpers for release dependency rows
- update app publish ingest to extract `requires.apps` and
  `requires.adapters`
- persist those rows as logical dependency classes against the release

### Exit Criteria

- a published app release can be queried with durable dependency rows
- publish rejects malformed or duplicate dependency metadata

## Phase 2: Dependency Resolution And Plan Construction

### Goal

Resolve one requested package into a concrete dependency plan.

### Changes

- add planner helpers to:
  - resolve the requested release
  - recursively resolve dependency releases
  - look up actual published package kind per dependency package id
  - select exact server-compatible variants
  - topologically order the plan
- fail before install when any dependency release or target variant is missing

### Exit Criteria

- Frontdoor can compute a deterministic plan for `glowbot-admin`
- that plan includes `glowbot-hub` before `glowbot-admin`

## Phase 3: Install Execution And Requirement Edges

### Goal

Execute dependency plans and persist requirement truth.

### Changes

- update app install orchestration to execute dependency-ordered package plans
- write `frontdoor_server_package_installs` for each package in the plan
- write `frontdoor_server_package_requirements` edges for each dependency
- keep public install APIs app-shaped while making execution package-plan based

### Exit Criteria

- installing `glowbot-admin` installs `glowbot-hub` automatically
- server package requirement edges explain why `glowbot-hub` is present

## Phase 4: Uninstall And Upgrade Planning

### Goal

Make dependency planning symmetric for uninstall and upgrade.

### Changes

- remove requirement edges when uninstalling the requiring package
- only uninstall dependency packages when no requirement edges and no direct
  install intent remain
- resolve upgrade dependency graphs from the target release metadata
- update requirement edges during upgrade

### Exit Criteria

- uninstalling `glowbot-admin` does not leave split-brain package state
- uninstall does not remove shared dependencies still in use
- upgrade planning remains dependency ordered

**Status:** pending

## Phase 5: Validation And GlowBot Rehearsal

### Goal

Prove the planner with a real dependency case.

### Changes

- add focused Frontdoor tests for:
  - publish-time dependency extraction
  - dependency plan construction
  - dependency-driven install ordering
  - uninstall garbage-collection behavior
- run the GlowBot control-plane rehearsal:
  - publish `glowbot-admin`
  - publish `glowbot-hub`
  - install `glowbot-admin`
  - verify `glowbot-hub` is installed first and remains healthy

### Exit Criteria

- dependency metadata and dependency-driven install are proven end to end
- GlowBot control-plane install matches the canonical operator experience

**Status:** partially complete

Completed:
- publish-time dependency extraction is covered by automated tests
- dependency-driven install ordering is covered by automated tests
- the real `glowbot-admin -> glowbot-hub` manifests install in dependency order

Still pending:
- real hosted control-plane server rehearsal
- uninstall garbage-collection validation

## File-Level Delta

### Frontdoor docs

- `docs/specs/FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md`
- new focused dependency-planning spec
- validation ladder for this slice

### Frontdoor code

- `src/frontdoor-store.ts`
- `src/publish-app-release.ts`
- `src/server.ts`
- `src/server.test.ts`
- any new planner helper module under `src/`

## Validation Target

1. publish stores dependency metadata for app releases
2. planner resolves app-to-app and app-to-adapter dependency graphs
   deterministically
3. planner distinguishes logical dependency class from published package kind
4. `glowbot-admin` install brings in `glowbot-hub`
5. uninstall removes only unneeded dependency packages
6. app-shaped public install routes remain functional while the underlying
   execution becomes package-plan based
