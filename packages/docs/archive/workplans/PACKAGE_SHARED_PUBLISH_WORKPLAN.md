# Package Shared Publish Workplan

**Status:** ARCHIVED
**Archived:** 2026-03-16
**Completion Basis:** Shared publish wrapper exists and has now been proven by both controlled and production Frontdoor publish drills.

## Purpose

This workplan defines the first hard-cutover step for package publication under
`packages/`.

The target is one shared publish path under `packages/scripts/` that delegates
to the existing Frontdoor publish contract instead of leaving package
publication fragmented across package-local wrappers and legacy shell scripts.

## Customer Experience

Package authors should be able to think:

1. `nex package release` creates the package archive
2. `packages/scripts/publish-package.sh` publishes that archive
3. package-local wrappers are optional shortcuts only

They should not have to know:

- which package has a bespoke Frontdoor wrapper
- which package still points at an old `package-app.sh`
- whether app and adapter publish use different local conventions

## Research Summary

- Frontdoor already exposes the canonical publish implementations at:
  - `frontdoor/scripts/publish-app-release.ts`
  - `frontdoor/scripts/publish-adapter-release.ts`
- Those scripts already share the same input model:
  - `--package-root`
  - `--tarball`
  - optional target and channel args
- `packages/` already treats `nex package release` as canonical for archive
  creation.
- `GlowBot` currently has the main package-local publish wrapper in active use.

## Core Decision

The first shared publish cut is:

- one shared shell wrapper under `packages/scripts/`
- package-local wrappers delegate to it
- no new publish semantics
- no `nex package publish` yet

The wrapper should:

1. detect app versus adapter from the manifest root
2. infer the canonical tarball path by default
3. allow `--tarball` override for packages still on custom release layouts
4. forward the real publish request to the current Frontdoor publish script

## Scope

This pass includes:

- `packages/scripts/publish-package.sh`
- package-system docs cutover to that path
- one real wrapper migration proof

This pass does not include:

- introducing `nex package publish`
- rewriting Frontdoor publish logic
- normalizing every package-local release script
- removing every legacy publish reference in the repo

## Validation

This pass is complete when:

1. the shared wrapper publishes one app package into a temp Frontdoor DB
2. the shared wrapper publishes one adapter package into a temp Frontdoor DB
3. `GlowBot` delegates to the shared wrapper instead of calling Frontdoor
   directly
4. package docs describe the shared publish path as canonical

## Next Step After This Pass

If this wrapper feels right in practice, the next lift is:

- `nex package publish`

That later CLI step should absorb the semantics already proven here rather than
invent a new publish model.
