# Adapter Go Publication First Wave 2026-03-13

## Customer Experience

Go-based standalone adapters should be publishable and consumable the same way as TypeScript adapters.

A developer should be able to:

1. inspect a central OpenAPI artifact for the adapter package
2. generate or use a repo-local consumer SDK from that contract
3. avoid caring whether the adapter implementation is Go or TypeScript

## Scope

First-wave Go adapter publication targets:

1. `nexus-adapter-qase`
2. `nexus-adapter-git`

Out of scope:

1. older non-packaged adapters (`slack`, `jira`)
2. missing targets (`eve`)
3. fake standalone publication for provider-internal surfaces (`bitbucket`)

## Source Of Truth

For Go adapters, package contract publication should use:

1. the real adapter package root with `adapter.nexus.json`
2. the adapter's runnable CLI contract via `adapter.info`
3. the shared adapter protocol schemas for common request/response shapes

## Hard-Cut Decisions

1. Go adapters publish through the same central Adapter API contract model.
2. Publication must use real adapter package behavior, not handwritten YAML.
3. The generator may build a temporary local binary for introspection.
4. Provider-internal surfaces stay inside the owning package contract.

## Implementation Steps

1. extend the adapter OpenAPI generator to support Go adapters through local build + `adapter.info`
2. add `qase` and `git` to the first-wave published adapter set
3. generate repo-local TypeScript consumer SDKs for both packages
4. validate build and generated inventory

## Validation

Required validation:

1. local binary build succeeds for the target adapter
2. `adapter.info` introspection succeeds from that built binary
3. generated OpenAPI parses cleanly
4. generated consumer SDK compiles successfully
