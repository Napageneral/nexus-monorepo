# Package Publish And Skill Cutover

## Purpose

This document defines the hard-cutover path for two package-system gaps under
`packages/`:

1. canonical package publication after `nex package release`
2. repo-wide enforcement of package-attached `SKILL.md`

The goal is to make the package system under `packages/` self-consistent.

## Customer Experience

The package author experience should be:

1. scaffold a package with `nex package init`
2. validate and archive it with `nex package release`
3. publish it through one canonical package-system path
4. know that every package under `packages/` carries one attached `SKILL.md`
5. use package audits to see exactly what is still missing

The author should not have to guess:

- whether release and publish are the same thing
- whether Frontdoor publication lives in a package-local custom script
- whether `SKILL.md` is required for this package family
- whether a package is considered complete without an attached skill

## Research Summary

### Already aligned

- `packages/README.md` and `packages/docs/PACKAGE_SYSTEM.md` already treat
  `nex package release` as the canonical archive step.
- the deeper platform specs already require package-attached skills for apps
  and adapters.
- package-local wrappers are already described as ergonomics, not source of
  truth.

### Current drift

- there is no single canonical package publication entrypoint under
  `packages/scripts/`
- package-local publish wrappers still point at inconsistent legacy surfaces
- package-attached skill is not yet universal across manifests under
  `packages/`

Representative drift:

- `packages/apps/glowbot/scripts/publish-release.sh` publishes through a
  package-local Frontdoor wrapper
- `packages/apps/aix/scripts/hosted-manual-install-drill.mjs` still references
  `nexus-frontdoor/scripts/package-app.sh`
- several adapter package-release wrappers still point at the old shared
  adapter package-kit shell path

### Current audit snapshot

Current `packages/` manifest counts:

- 7 app manifests
- 15 adapter manifests

Current missing attached-skill contract:

- 20 manifests are missing a valid `skill` declaration

## Core Decisions

1. `nex package release` remains the canonical package archive step.
2. Package publication is a separate step from release.
3. Until the CLI grows a first-class `nex package publish`, the canonical
   publish entrypoint should live under `packages/scripts/`.
4. Package-local publish wrappers may remain as ergonomics, but they must call
   the canonical shared publish path.
5. Every manifest root under `packages/` must declare one package-local
   `skill`.
6. Every manifest root under `packages/` must carry a resolvable `SKILL.md`.
7. `packages/scripts/audit-packages.py` must report attached-skill drift.

## Canonical Release Versus Publish Model

### Release

Release means:

- validate package contract
- build or gather package contents
- create immutable archive artifact

Canonical command:

- `nex package release <manifest-root-or-package-root>`

### Publish

Publish means:

- take a concrete release artifact
- register it with the hosted package registry
- record release metadata and platform targeting

Canonical package-system home:

- `packages/scripts/`

Target shape:

- one shared package publish helper or thin wrapper family under
  `packages/scripts/`
- package-local wrappers call that shared path instead of carrying bespoke
  Frontdoor logic

## Package-Attached Skill Rule Under `packages/`

For every app or adapter manifest root under `packages/`:

- the manifest declares `skill`
- the declared path resolves inside the package root
- the file exists as `SKILL.md`

This rule is not optional package polish.

It is part of package completeness.

## `packages/` Expectations

The package-system docs under `packages/` should state this directly.

### Apps

At each app manifest root:

- `app.nexus.json`
- `SKILL.md`
- package-local docs
- repeatable release path

### Adapters

At the package root:

- `adapter.nexus.json`
- `SKILL.md`
- package-local docs
- repeatable release path

## Audit Expectations

The package audit must report, at minimum:

- package family
- manifest roots
- package-release wrapper presence
- attached-skill presence and validity

This is the repo-wide cutover visibility surface for package completeness.

## Execution Order

1. update `packages/` docs to make attached skill and publish expectations
   explicit
2. add attached-skill reporting to `packages/scripts/audit-packages.py`
3. use the audit output as the concrete rollout backlog
4. cut packages over family by family
5. later centralize shared publish wrappers under `packages/scripts/`
6. later replace those wrappers with `nex package publish` if the CLI takes
   ownership

## Done Definition

This cut is done when:

1. `packages/` docs define both release and publish clearly
2. `packages/` docs treat attached `SKILL.md` as required package contract
3. package audit surfaces missing-skill drift directly
4. every manifest under `packages/` has a valid attached skill
5. package-local publish wrappers no longer point at inconsistent legacy paths
