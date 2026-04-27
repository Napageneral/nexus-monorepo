# WIS-011 Startup-Profile Registry Resolution And Hard-Cut Image Selection

## Goal

Replace ambient env-var image selection with one canonical runtime-backed
startup-profile resolution path.

## Scope

- introduce or finish a registry-backed mapping from startup profile to image
  identity/runtime config
- make `compact_worker` and other warm-start profiles resolve through that
  registry instead of direct env-var selection
- remove split-brain between runtime config truth and
  `NEXUS_SANDBOX_COMPACT_WORKER_CONTAINER_IMAGE`
- preserve operator inspectability without preserving dual execution paths
- perform a hard cutover instead of leaving legacy fallback selection in place

## Acceptance

- startup-profile to image resolution has one canonical runtime-backed source of
  truth
- warm worker sandbox provisioning no longer depends on ad hoc env-var image
  overrides in the normal execution path
- operator/runtime inspection surfaces can show which image a startup profile
  resolves to and why
- the old env-var selection path is deleted or reduced to an explicit
  development-only escape hatch that is not used by Dispatch or normal runtime
  startup

## Current Evidence

- `compact_worker` warm-start code now resolves to the canonical runtime-backed
  warm image by default
- the env-var override path has been removed from the normal sandbox and
  provisioning flow
- the compact-worker provisioning path now fails fast if the canonical warm
  image is missing `git`, `rg`, `pnpm`, or `codex`
- focused runtime verification passes:
  - `pnpm exec vitest run src/runtime/domains/sandboxes/service.test.ts src/runtime/domains/sandboxes/implementation-substrate-work.test.ts --reporter=dot`
