# Adapter Package Readiness Audit

Date: 2026-03-12

## Customer Experience First

For a Nex operator, "adapter ready" now means more than "the package compiles".

A production-ready adapter package must support the full hosted path:

1. The repo has a canonical local spec, workplan, and validation ladder.
2. The repo can build and package a release artifact.
3. Frontdoor/Nex can install that artifact as an adapter package.
4. The adapter can be configured through connection setup.
5. The adapter passes its package-specific validation ladder on a real runtime.

This audit separates code-surface readiness from hosted package readiness so we
do not confuse "SDK compile green" with "production package ready".

## Research Summary

### Canonical package install/deploy contract

The canonical package model now requires:

- package-local docs
  - `docs/specs/`
  - `docs/workplans/`
  - `docs/validation/`
- package manifest
  - `adapter.nexus.json`
- release packaging
  - `scripts/package-release.sh`
- package-local build/test surface
- shared hosted lifecycle proof plus package-specific proof

### What is now green in code

The shared SDK migration tranche is green across the previously failing Go
adapters:

- `device-headless`
- `device-android`
- `device-macos`
- `device-ios`
- `jira`
- `patient-now-emr`
- `gog`
- `zenoti-emr`

Previously green packages remain green:

- `confluence`
- `git`
- `qase`
- `slack`
- `callrail`
- `apple-maps`
- `google`
- `meta-ads`
- `twilio`
- `discord`
- `telegram`
- `whatsapp`

### Where the real gap is now

The fleet gap is now mostly package hygiene:

- many repos compile and test but are not installable adapter packages
- several repos have manifest + release script but not the full local doc set
- some older spec-only dirs still coexist beside real package repos

## Current State Matrix

### A. Package-ready foundation exists

These repos currently have both:

- `adapter.nexus.json`
- `scripts/package-release.sh`

Repos:

- `apple-maps`
- `callrail`
- `confluence`
- `git`
- `google`
- `meta-ads`
- `qase`
- `twilio`

Notes:

- `confluence`, `git`, and `qase`
  have deeper package-local doc coverage and runtime/package validation work.
- `apple-maps`, `callrail`, `google`, `meta-ads`, and `twilio` still need
  full local workplan/validation parity.

### B. Code-green but not package-installable yet

These repos now build/test on the canonical SDK surface, but they do not yet
have the minimum package install/release contract:

- `device-headless`
- `device-android`
- `device-macos`
- `device-ios`
- `jira`
- `gog`
- `patient-now-emr`
- `zenoti-emr`
- `slack`
- `discord`
- `telegram`
- `whatsapp`

Common missing pieces:

- no `adapter.nexus.json`
- no `scripts/package-release.sh`
- no package-local `docs/` set in the repo root
- no shared hosted package lifecycle validation recorded for that repo

### C. Spec-only sibling dirs still present

These are not package repos. They are document roots that predate or sit
beside real package repos:

- `adapters/confluence`
- `adapters/git`
- `adapters/jira`
- `adapters/qase`

These are useful reference material today, but long term they are a discovery
hazard if package-local docs are missing from the actual package repo.

## Recommended Priority Order

### Priority 1: package-enable the newly green high-value adapters

- `jira`
- `slack`
- `gog`
- `patient-now-emr`
- `zenoti-emr`

Reason:

- these now compile against the canonical SDK surface
- they still lack the hosted package contract
- they are higher-value shared integrations than device companions

### Priority 2: package-enable the device adapters

- `device-headless`
- `device-android`
- `device-macos`
- `device-ios`

Reason:

- code is green
- package scaffolding is missing
- they are useful but lower leverage than Jira/Slack/Gog class packages

### Priority 3: package-enable the TS adapters

- `discord`
- `telegram`
- `whatsapp`

Reason:

- test surface is green
- package install/deploy contract still needs to be added explicitly

### Priority 4: complete doc parity for already package-scaffolded repos

- `apple-maps`
- `callrail`
- `google`
- `meta-ads`
- `twilio`

Reason:

- manifests and release scripts exist
- local workplan/validation parity is still thinner than the canonical author
  experience requires

## Hard-Cutover Recommendation

Do not preserve the current mixed state as a long-term pattern.

Target state:

- real package repos hold their own spec/workplan/validation docs
- every package repo has `adapter.nexus.json`
- every package repo has `scripts/package-release.sh`
- package install/deploy testing is run from the package repo itself
- legacy sibling spec-only dirs are either retired or explicitly marked as
  archive/reference only once package-local docs fully exist
