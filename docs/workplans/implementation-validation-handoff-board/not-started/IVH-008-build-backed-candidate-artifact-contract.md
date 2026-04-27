# IVH-008 Build-Backed Candidate Artifact Contract

## Goal

Add an installable build-backed candidate-artifact form for Dispatch
signoff-proof lanes.

## Scope

- define the contract for installable runtime bundles or container images
- capture the build metadata and launch contract needed by validation
- preserve provenance back to the implementation run and source commit
- keep build-backed artifacts explicit in review state

## Acceptance

- Dispatch can persist a build-backed candidate artifact with explicit install
  instructions
- the build-backed artifact is traceable to the implementation run that
  produced it
- review state can distinguish source-snapshot proof from build-backed proof
