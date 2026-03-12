---
title: "Adapter SDK Workspace"
summary: "Canonical role and ownership boundary for the shared Nex adapter SDK workspace."
---

# Adapter SDK Workspace

## Purpose

This document defines what the shared adapter SDK workspace owns.

It exists to stop three failure modes:

1. fixing one adapter package when the real change belongs in the shared SDK
2. pushing runtime or IAM behavior into the SDK just because it is adjacent
3. letting adapter packages drift from the canonical contract because the SDK
   is not treated as the shared implementation layer

## Customer Experience

Adapter authors should experience the SDK workspace like this:

1. canonical adapter and platform specs define the target contract
2. the SDK workspace implements the shared adapter-side contract
3. adapter packages consume the SDK and package kit
4. adapter-specific repos only implement provider logic and package-local docs

The author should not have to rediscover:

- how adapter CLI dispatch works
- how runtime context is injected
- how canonical `record.ingest` is emitted
- how shared packaging is assembled

## What This Workspace Owns

The shared adapter SDK workspace owns:

- adapter CLI/runtime harness behavior
- canonical adapter protocol types and schemas
- runtime context parsing
- canonical `record.ingest` builders and control output helpers
- shared send/delete request parsing
- shared monitor/backfill helpers
- adapter package-kit release assembly behavior
- SDK-level conformance and contract tests
- SDK-level author documentation

## What This Workspace Does Not Own

The shared adapter SDK workspace does not own:

- provider-specific field mapping
- provider-specific API behavior
- one adapter package's business rules
- runtime-side method discovery and invocation
- runtime IAM enforcement
- package-local workplans and validation ladders

Those belong to:

- individual adapter packages
- Nex runtime package/method/IAM implementation

## Canonical Change Order

The correct order for adapter ecosystem changes is:

1. update canonical specs
2. update the shared SDK workspace
3. update Nex runtime/package-manifest behavior when the change requires it
4. propagate into concrete adapter packages
5. rerun shared hosted lifecycle proof
6. rerun package-specific ladders

Do not skip the shared SDK layer when a contract change affects more than one adapter.

## Current Canonical References

- [Package Author Experience](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-author-experience.md)
- [Hosted Package Ownership and Validation Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/hosted-package-ownership-and-validation-model.md)
- [Apps, Adapters, and Method Surfaces](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/apps-adapters-and-method-surfaces.md)
- [Package Method Catalog and IAM](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-method-catalog-and-iam.md)
- [Adapter Protocol](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-protocol.md)
- [Adapter Connections](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/adapters/adapter-connections.md)
- [Authorization Compiler](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/identity/authorization-compiler.md)
