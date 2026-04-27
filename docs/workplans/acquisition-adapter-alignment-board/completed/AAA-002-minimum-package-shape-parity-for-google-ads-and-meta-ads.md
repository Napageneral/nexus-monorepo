# AAA-002 Minimum Package Shape Parity For Google Ads And Meta Ads

## Goal

Bring `google-ads` and `meta-ads` up to the newer minimum package shape used
by the canonical adapter family.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/acquisition-adapter-package-alignment.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-package-capability-model.md`
- `/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/unified-adapter-sdk-and-authoring-model.md`

## Current Gap

- `google-ads` and `meta-ads` manifests do not declare explicit
  `methodCatalog`
- the packages do not publish explicit `MethodCatalog` metadata through
  `DefineAdapterConfig`
- the packages do not publish explicit `Projection` metadata through
  `DefineAdapterConfig`
- local tests do not currently guard these package-shape invariants the way
  Jira and Confluence do

## Acceptance

1. both manifests declare explicit `methodCatalog` with `source = "openapi"`
2. both adapters publish explicit `MethodCatalog` metadata through
   `adapter.info`
3. both adapters publish explicit `Projection` metadata through `adapter.info`
4. both packages have adapter.info contract tests that fail on package-shape
   drift
5. local package-contract checks mirror the newer canonical adapter family

## Completion Notes

- `google-ads` and `meta-ads` now declare explicit `methodCatalog` in
  `adapter.nexus.json`
- both packages publish explicit `MethodCatalog` and `Projection` metadata from
  `DefineAdapterConfig`
- both packages now carry `adapter.info` contract tests covering operations,
  method catalog, and projection metadata
- package-local manifests validate successfully through `nexus package validate .`
- focused package tests pass for both packages
