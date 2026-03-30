# AGENTS.md - Nexus Umbrella Repo

You are operating inside the Nexus umbrella repo.

## Validation Standard

Default to cleanroom-first validation.

For runtime, package, adapter, app, or hosted-platform work:

1. run focused repo-local tests
2. prove the changed behavior in a disposable cleanroom or containerized
   environment
3. update the relevant validation ladder, runbook, or script
4. use a lived-in local runtime only for secondary dogfood, repair, or final
   operator confirmation

Prefer real product seams over bespoke bypass harnesses:

- Nex runtime APIs and CLI for local runtime flows
- Frontdoor provisioning and bootstrap seams for hosted flows
- real package install, registration, and lifecycle seams for apps and
  adapters

If a lane lacks a reusable cleanroom proof path, create or extend one as part
of the implementation.

## Canon

Governance lives in:

- `docs/spec-driven-development-workflow.md`
- `docs/spec-standards.md`

Treat those documents as the authoritative workflow and writing standard for
all active umbrella-repo documentation.
