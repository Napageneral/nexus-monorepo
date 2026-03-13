# OpenAPI First Generators Workplan (2026-03-12)

**Status:** ACTIVE
**Scope:** Scaffold the central `contracts/` tree and generate the first Frontdoor API and AIX App API OpenAPI artifacts

---

## Purpose

This workplan executes the first concrete step from
[OPENAPI_CONTRACT_ARTIFACT_MODEL.md](../OPENAPI_CONTRACT_ARTIFACT_MODEL.md):

1. create the central contract artifact tree
2. generate the first Frontdoor API OpenAPI artifact
3. generate the first App API OpenAPI artifact using AIX as the proving case

This is a focused publishing and generator workplan, not the full platform-wide
OpenAPI rollout.

---

## Customer Experience

The immediate outcome must be:

1. one obvious central contract tree exists
2. a developer can open one Frontdoor API artifact and one AIX App API artifact
3. both artifacts are generated from explicit source-of-truth definitions
4. future contract work has a clear place to land

This work should not try to solve the full Nex API OpenAPI problem before the
runtime transport hard cut is complete.

---

## Scope

### In scope

1. scaffold `contracts/`
2. add a `contracts/README.md`
3. add generator scripts
4. generate:
   - `contracts/frontdoor/openapi.yaml`
   - `contracts/apps/aix/openapi.yaml`
5. define a first explicit frontdoor route contract subset
6. define explicit AIX response schemas where the manifest is currently
   incomplete

### Out of scope

1. full Nex API OpenAPI generation
2. full Adapter API OpenAPI generation
3. automatic discovery/generation for every frontdoor route in `server.ts`
4. broad SDK generation

---

## Source-Of-Truth Decisions

### Frontdoor API

The first Frontdoor artifact will come from an explicit typed route-contract
descriptor near frontdoor code.

Reason:

1. the current frontdoor HTTP surface is still defined inline in a large
   `server.ts`
2. there is no canonical typed route registry yet
3. scraping ad hoc handler branches would create a brittle fake source of truth

So the first generator should consume:

1. a curated frontdoor contract descriptor file
2. with explicit paths, methods, schemas, and auth metadata

### AIX App API

The first AIX artifact will use:

1. `app.nexus.json` as the method inventory and request-schema source
2. an explicit response-schema supplement beside the app

Reason:

1. AIX manifest already provides method ids and request schemas
2. handler code already returns stable structured objects
3. response schemas are not yet complete enough in the manifest itself

This keeps the artifact real without forcing a larger manifest-contract rewrite
inside this workstream.

---

## Initial Published Frontdoor Contract Subset

The first Frontdoor artifact should cover the hosted flows we actively use and
validate today:

1. `POST /api/auth/login`
2. `GET /api/auth/me`
3. `GET /api/apps/catalog`
4. `POST /api/runtime/token`
5. `POST /api/runtime/token/refresh`
6. `POST /api/runtime/token/revoke`
7. `GET /api/servers/{serverId}`
8. `GET /api/servers/{serverId}/apps/{appId}/install-status`
9. `POST /api/servers/{serverId}/apps/{appId}/install`

Why this subset:

1. it covers real hosted auth and runtime-launch flows
2. it covers app catalog and install
3. it covers the flows AIX and hosted app launch already depend on

This is the correct first published contract, not a random inventory dump.

---

## Initial Published AIX Contract Scope

The first AIX artifact should publish all currently declared AIX app methods:

1. `aix.credentials.*`
2. `aix.entities.list`
3. `aix.sources.*`
4. `aix.runs.*`
5. `aix.uploads.*`
6. `aix.imported-sessions.list`

Published as HTTP operations at:

`POST /runtime/operations/<method>`

with the correct bearer-auth model and request/response schemas.

---

## Implementation Plan

### Phase 1: Artifact tree scaffold

Create:

1. `contracts/README.md`
2. `contracts/frontdoor/`
3. `contracts/apps/aix/`

### Phase 2: Frontdoor contract source

Create an explicit frontdoor contract descriptor near frontdoor code.

Requirements:

1. typed route list
2. path params
3. request body schema where applicable
4. response schema
5. auth requirement metadata

### Phase 3: AIX contract source

Use:

1. AIX manifest for method inventory + request schemas
2. explicit response schema supplement for method outputs

### Phase 4: Generators

Add generator code that:

1. reads the source-of-truth contract inputs
2. emits canonical OpenAPI YAML into `contracts/`
3. can generate:
   - frontdoor only
   - aix only
   - all first-wave artifacts

### Phase 5: Publish generated artifacts

Commit the generated files to the repo so they become the canonical first-wave
artifacts.

---

## Validation

The generator work is complete when:

1. `contracts/frontdoor/openapi.yaml` exists and matches the chosen first
   contract subset
2. `contracts/apps/aix/openapi.yaml` exists and covers all AIX app methods
3. regenerating the artifacts is deterministic
4. the contract sources are explicit and reviewable
5. the generated YAML does not contain legacy surface residue like
   `http.control`, `ws.control`, `apps.open.*`, `adapter.cli`, or
   `internal.clock`

---

## Recommendation

Implement this exactly as a first-wave publishing system:

1. central artifact tree
2. explicit frontdoor subset descriptor
3. manifest-plus-response-supplement AIX generator

Do not wait for the entire Nex API cutover before publishing these two first
artifacts.
