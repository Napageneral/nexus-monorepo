# Adapter Package Hosted Readiness Workplan

Date: 2026-03-12

## Goal

Bring the adapter fleet from "canonical SDK surface green" to "package
install/deploy ready" under the hosted package model.

This workplan starts after the SDK propagation tranche. It assumes the package
already compiles and its local tests are green.

## Phase 1: High-Value Shared Adapter Package Enablement

Target repos:

- `jira`
- `slack`
- `gog`
- `patient-now-emr`
- `zenoti-emr`

Required changes per repo:

1. Add `adapter.nexus.json`
2. Add `scripts/package-release.sh`
3. Add package-local:
   - `docs/specs/`
   - `docs/workplans/`
   - `docs/validation/`
4. Add or update package root `README.md` / `TESTING.md` so install/build/test
   flow is discoverable from the repo itself
5. Validate:
   - local build/test
   - release packaging
   - shared hosted package lifecycle proof
   - package-specific validation ladder

Exit criteria:

- each repo can produce a release artifact through the package kit
- each repo has its local docs in place
- each repo has a recorded hosted install/deploy validation path

## Phase 2: Device Adapter Package Enablement

Target repos:

- `device-headless`
- `device-android`
- `device-macos`
- `device-ios`

Required changes:

- same package scaffolding as Phase 1
- control-session-specific validation ladder
- package-specific hosted validation focused on setup, health, and control start

Exit criteria:

- device adapters can be installed as packages, not just run locally

## Phase 3: TypeScript Adapter Package Enablement

Target repos:

- `discord`
- `telegram`
- `whatsapp`

Required changes:

1. package-local spec/workplan/validation docs
2. `adapter.nexus.json`
3. package release script for the Node package runtime shape
4. shared hosted lifecycle validation
5. package-specific communication validation

Exit criteria:

- TS adapters follow the same hosted package contract as Go adapters

## Phase 4: Doc Parity For Existing Package-Scaffolded Repos

Target repos:

- `apple-maps`
- `callrail`
- `google`
- `meta-ads`
- `twilio`

Required changes:

- fill missing local workplan/validation docs
- ensure package-local docs reflect the canonical author experience
- ensure hosted lifecycle + package-specific validation are both documented

Exit criteria:

- package-scaffolded repos also meet the doc/discoverability standard

## Phase 5: Legacy Sibling Directory Resolution

Target dirs:

- `adapters/confluence`
- `adapters/git`
- `adapters/jira`
- `adapters/qase`

Required decision:

- either move remaining live docs into the real package repos
- or mark sibling dirs explicitly as archival/reference-only

Exit criteria:

- agents do not have to guess whether package-local truth or sibling-dir truth is
  authoritative

## Validation Ladder For This Workplan

For each repo in scope:

1. package-local docs exist
2. manifest validates
3. release script builds artifact
4. local tests pass
5. shared hosted lifecycle smoke passes
6. package-specific validation ladder passes

Only after all six pass should the repo be marked package-ready.
