# Twilio Adapter Package Install Workplan

## Customer Goal

The Twilio adapter should be packageable and restart-safe as a shared Nex
adapter package.

Status: complete for the package/install slice.

## Gap Analysis

What already exists:

- canonical `record.ingest`
- runtime `connection_id`
- package-local target-state behavior spec

What this workplan adds:

- package manifest
- package release script
- package root docs
- package/install companion spec
- package/install validation ladder
- operator install and restart rehydration proof

## Phases

### Phase 1: Package Metadata

- add `adapter.nexus.json`
- add root `README.md`
- add `RELEASE_NOTES.md`
- add `TESTING.md`

### Phase 2: Package Artifact Build

- add `scripts/package-release.sh`
- emit `dist/nexus-adapter-twilio-0.1.0.tar.gz`

### Phase 3: Package Docs

- add `docs/specs/TWILIO_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md`
- add `docs/workplans/TWILIO_ADAPTER_PACKAGE_INSTALL_WORKPLAN.md`
- add `docs/validation/TWILIO_ADAPTER_PACKAGE_INSTALL_VALIDATION.md`

### Phase 4: Operator Install Validation

- install the staged tarball through `/api/operator/packages/install`
- verify package status and package health

### Phase 5: Restart Rehydration Validation

- restart the same isolated runtime
- confirm the adapter rehydrates from durable package state

## Out Of Scope

- real Twilio credential validation
- package upgrade testing
- Frontdoor-managed server adapter install orchestration

## Completed Evidence

Validated on March 11, 2026:

- `go test ./...` passed
- `./scripts/package-release.sh` emitted `dist/nexus-adapter-twilio-0.1.0.tar.gz`
- isolated runtime install via `/api/operator/packages/install` returned `status = active`
- package health reported `healthy = true`
- restart rehydration logged `rehydrated active adapter "nexus-adapter-twilio" from durable package state`
