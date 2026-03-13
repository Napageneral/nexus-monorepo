# OpenAPI Contract Artifact Model

**Status:** CANONICAL
**Last Updated:** 2026-03-12

---

## Purpose

This document defines how machine-readable API contracts are stored, generated,
and owned across the Nex platform.

It exists to prevent three failure modes:

1. handwritten OpenAPI drifting away from the real runtime or product contract
2. API artifacts being scattered across unrelated directories
3. transport details or legacy routing residue leaking into published API
   contracts

This document builds on:

1. [API_CONTRACT_MODEL.md](./API_CONTRACT_MODEL.md)
2. [TRANSPORT_SURFACE_MODEL.md](./TRANSPORT_SURFACE_MODEL.md)
3. [NEX_ARCHITECTURE_AND_SDK_MODEL.md](./NEX_ARCHITECTURE_AND_SDK_MODEL.md)

---

## Customer Experience

The developer experience must be obvious:

1. there is one central place to look for machine-readable API contracts
2. each top-level API contract has one canonical OpenAPI artifact
3. app and adapter contracts are easy to find without guessing where they live
4. SDK generation, docs generation, and schema discovery all point at the same
   artifacts

The system should not require a developer to guess:

1. whether a contract lives in prose specs or code or app folders
2. whether a YAML file is handwritten or generated
3. whether an API artifact is canonical or stale

---

## Core Rule

OpenAPI is a projection of the canonical API contract.

It is not the only source of truth.

The source of truth remains:

1. canonical architecture/spec docs
2. runtime/frontdoor/app/adapter method and route schemas
3. the owning API contract’s method/route model

OpenAPI artifacts are generated outputs from that source of truth.

---

## The Four OpenAPI Artifact Families

The platform publishes four contract families:

1. **Frontdoor API OpenAPI**
2. **Nex API OpenAPI**
3. **App API OpenAPI**
4. **Adapter API OpenAPI**

These map directly to the canonical API split in
[API_CONTRACT_MODEL.md](./API_CONTRACT_MODEL.md).

---

## Central Storage Model

Canonical generated contract artifacts live in one central tree:

`/Users/tyler/nexus/home/projects/nexus/contracts/`

### Canonical layout

```text
contracts/
  README.md
  frontdoor/
    openapi.yaml
    openapi.lock.json
  nex/
    openapi.yaml
    openapi.lock.json
  apps/
    aix/
      openapi.yaml
      openapi.lock.json
    spike/
      openapi.yaml
      openapi.lock.json
  adapters/
    github/
      openapi.yaml
      openapi.lock.json
    slack/
      openapi.yaml
      openapi.lock.json
```

### Why central storage is canonical

This is the correct long-term layout because it:

1. makes the contract surface obvious immediately
2. keeps generated artifacts separate from prose specs
3. keeps app and adapter contracts centralized instead of scattered
4. gives SDK/docs generators one stable root
5. makes contract review and publication straightforward

---

## Ownership Rules

### Frontdoor API OpenAPI

Canonical artifact:

`contracts/frontdoor/openapi.yaml`

Owned by:

1. frontdoor route and schema definitions
2. frontdoor auth/session/token contracts
3. frontdoor hosted platform APIs

### Nex API OpenAPI

Canonical artifact:

`contracts/nex/openapi.yaml`

Owned by:

1. Nex runtime operation taxonomy
2. Nex runtime request/response schemas
3. runtime-owned metadata/status routes

### App API OpenAPI

Canonical artifact:

`contracts/apps/<appId>/openapi.yaml`

Owned by:

1. app methods
2. app-owned HTTP routes
3. app-owned callback and compatibility routes

### Adapter API OpenAPI

Canonical artifact:

`contracts/adapters/<adapterId>/openapi.yaml`

Owned by:

1. reusable adapter-owned external HTTP contracts
2. reusable provider/protocol bridge routes
3. reusable provider callback/setup contracts

Not every adapter requires an Adapter API OpenAPI artifact.

Only adapters with a real external reusable HTTP contract should publish one.

---

## What Is Generated Vs Handwritten

### Handwritten

These remain prose or source definitions:

1. architecture and ownership specs
2. API split and transport model docs
3. business semantics and naming rules
4. examples and implementation guidance

### Generated

These are produced artifacts:

1. paths
2. methods
3. operation ids
4. schemas
5. parameters
6. request bodies
7. responses
8. security schemes
9. tags

The YAML artifacts should not be maintained manually as the long-term source of
truth.

---

## Source-Of-Truth By Contract Family

### Frontdoor API

Source of truth:

1. frontdoor route registry
2. frontdoor request/response schemas
3. frontdoor auth and hosted platform semantics

OpenAPI is generated from that route/schema graph.

### Nex API

Source of truth:

1. runtime operation taxonomy
2. runtime request/response schemas
3. route projection rules for HTTP

OpenAPI is generated from the HTTP projection of the runtime operation
taxonomy.

### App API

Source of truth:

1. app manifest method declarations
2. app request/response schemas
3. app-owned HTTP route declarations

Apps may optionally reference richer method-catalog inputs, but the published
contract artifact still lands in the central `contracts/apps/<appId>/` tree.

### Adapter API

Source of truth:

1. adapter-owned external route declarations
2. reusable bridge/callback schemas

The adapter SDK subprocess contract is not automatically the same thing as an
Adapter API OpenAPI artifact.

OpenAPI is only for external HTTP contracts worth publishing.

---

## Relationship To Runtime And App Discovery

The platform may expose discovery metadata dynamically, but that is not the
canonical publication surface for machine-readable API contracts.

The canonical publication surface is the central `contracts/` tree.

Dynamic discovery may point to or embed those artifacts, but it should not
replace them.

---

## Transport Rules For OpenAPI

OpenAPI documents the HTTP projection of a contract.

That means:

1. Frontdoor API OpenAPI documents frontdoor HTTP endpoints
2. Nex API OpenAPI documents the HTTP projection of Nex API operations
3. App API OpenAPI documents the HTTP projection of app methods and app-owned
   routes
4. Adapter API OpenAPI documents external adapter-owned HTTP contracts

OpenAPI does not redefine the canonical transport model.

WebSocket documentation should be generated from the same underlying contract
graph, but it is not the same artifact.

---

## Hard-Cut Contract Rules

The published OpenAPI artifacts must reflect the target-state contract model.

They must not encode legacy residue such as:

1. `apps.open.*`
2. `http.control`
3. `ws.control`
4. `adapter.cli`
5. `internal.clock`
6. pseudo-route ownership categories like standalone "ingress families"

If the runtime or frontdoor implementation still contains those concepts, the
OpenAPI generation work must either:

1. wait until the hard cut lands
2. or deliberately filter them out so the published contract matches the
   canonical target state

The preferred path is to hard-cut code first where necessary.

---

## Rollout Order

### Wave 1: Spec and storage model

Do now:

1. define the central `contracts/` tree
2. define ownership rules
3. define generation rules

### Wave 2: First generated artifacts

Generate first:

1. **Frontdoor API OpenAPI**
2. **AIX App API OpenAPI**

Why:

1. frontdoor is already an explicit HTTP API
2. AIX is the proving case for a real app API contract

### Wave 3: Nex API OpenAPI

Generate after the transport surface hard cutover.

Reason:

The runtime must first remove:

1. `http.control`
2. `ws.control`
3. `apps.open.*`
4. pseudo-surfaces and pseudo-operations

Otherwise the published Nex API contract will bake in stale semantics.

### Wave 4: Adapter API OpenAPI

Generate selectively after adapter/app/frontdoor ownership cleanup is settled.

Not all adapters need a published OpenAPI artifact.

---

## Proving Cases

### First app proving case

The first App API OpenAPI artifact should be:

`contracts/apps/aix/openapi.yaml`

Reason:

1. AIX already has a real installed app surface
2. AIX already has real operator methods and real machine-client methods
3. AIX is the clearest proving case for App API ownership

### First platform proving case

The first platform artifact should be:

`contracts/frontdoor/openapi.yaml`

Reason:

1. frontdoor already has an explicit HTTP contract
2. it is separate enough from the transport cutover to move earlier

---

## Versioning Model

Start simple.

Initial publication uses one current artifact per contract family:

1. `openapi.yaml`
2. `openapi.lock.json`

Do not introduce multi-version publication trees until the generators and
contract ownership model are stable.

If versioned publication becomes necessary later, it can be added beneath the
same contract root.

---

## Summary

The canonical plan is:

1. centralize all machine-readable API contracts in `contracts/`
2. keep prose canon in `nexus-specs/specs/`
3. generate OpenAPI from the owning contract model
4. roll out Frontdoor first, AIX first for apps, Nex after the transport hard
   cut, and Adapter API selectively

This gives the platform one obvious, centralized contract publication model.
