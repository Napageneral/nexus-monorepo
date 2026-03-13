# Nex OpenAPI Domain Hardening 2026-03-12

## Customer Experience

A developer using the published Nex contract should be able to:

1. inspect `contracts/nex/openapi.yaml`
2. understand the real request and response shape for the highest-value runtime methods
3. trust that the published schema matches live handler behavior
4. use the contract for SDK/docs/UI work without reverse-engineering handler code

The current contract is inventory-complete but still too generic in many domains. This pass hardens the first high-value runtime methods that are already stable in code.

## Scope

This pass covers:

1. `apps.*`
2. `auth.tokens.*`
3. `agents.sessions.imports.list`

This pass does not attempt full-runtime schema perfection. It hard-cuts the first domains where the live handlers already expose clear stable payloads.

## Research Summary

### Current published contract gaps

`contracts/nex/openapi.yaml` still publishes generic object schemas for these operations:

1. `apps.list`
2. `apps.get`
3. `apps.install`
4. `apps.uninstall`
5. `apps.start`
6. `apps.stop`
7. `apps.status`
8. `apps.logs`
9. `apps.methods`
10. `auth.tokens.list`
11. `auth.tokens.create`
12. `auth.tokens.revoke`
13. `auth.tokens.rotate`
14. `agents.sessions.imports.list`

### Existing live handler shapes

#### `apps.*`

Source: `nex/src/nex/runtime-api/server-methods/apps.ts`

Observed live payloads:

1. `apps.list`
- `{ apps: AppSummary[] }`

2. `apps.get`
- `{ app: AppSummary, manifest: AppManifest }`

3. `apps.status`
- `{ app: AppSummary & { has_ui, has_methods, has_services, has_adapters } }`

4. `apps.methods`
- `{ package: { kind: "app", id, version, status: "active" }, methods: PackageMethod[] }`

5. `apps.install`
6. `apps.uninstall`
7. `apps.start`
8. `apps.stop`
9. `apps.logs`
- currently return runtime error envelopes for `UNAVAILABLE`
- request shape is still concrete: `{ id: string }`
- success payload shape can remain generic until implementation exists

#### `auth.tokens.*`

Source: `nex/src/nex/runtime-api/server-methods/ingress-credentials.ts`

These methods already reuse stable ingress credential request/response schemas.

Canonical mapping:

1. `auth.tokens.list` -> `IngressCredentialsListParamsSchema`, `IngressCredentialsListResultSchema`
2. `auth.tokens.create` -> `IngressCredentialsCreateParamsSchema`, `IngressCredentialsCreateResultSchema`
3. `auth.tokens.revoke` -> `IngressCredentialsRevokeParamsSchema`, `IngressCredentialsRevokeResultSchema`
4. `auth.tokens.rotate` -> `IngressCredentialsRotateParamsSchema`, `IngressCredentialsRotateResultSchema`

#### `agents.sessions.imports.list`

Source:
- `nex/src/nex/runtime-api/server-methods/sessions.ts`
- existing request schema already published via `SessionsImportsListParamsSchema`

Observed live payload:
- `{ items: SessionImportSummary[], nextCursor?: string | null }`

Each item includes:
- `sessionKey`
- `sourceEntityId`
- `aixSourceId`
- `sourceProvider`
- `sourceSessionId`
- `updatedAt`
- `title`
- `workspaceId`

## Hard-Cut Decisions

1. Publish nongeneric schemas for the covered methods now.
2. Reuse existing protocol schemas where they already exist.
3. Add local Nex OpenAPI component schemas only where runtime handlers have stable shapes but the protocol layer does not yet export a reusable result schema.
4. Validate representative live handler outputs against the published schemas.
5. Do not add backward-compat shims or dual contract paths.

## Implementation Plan

### 1. Contract builder

File: `nex/src/nex/runtime-api/openapi/nex-contract.ts`

Changes:

1. map `auth.tokens.*` to existing ingress credential request/response schemas
2. add local request schemas for `apps.*` methods
3. add local response schemas/components for:
- app summary
- app detail result
- app status result
- app methods result
- session imports list result
4. teach request/payload resolution to use those local schema maps before falling back to generic object
5. include the new local component schemas in `components.schemas`

### 2. Conformance tests

Files:

1. `nex/src/nex/runtime-api/openapi/nex-contract.test.ts`
2. new focused runtime API conformance test if needed

Changes:

1. keep inventory publication tests
2. add explicit assertions that the covered methods no longer publish generic request/response schemas
3. validate representative live handler outputs for:
- `apps.list`
- `apps.get`
- `apps.status`
- `apps.methods`
4. validate published nongeneric schema coverage for:
- `auth.tokens.*`
- `agents.sessions.imports.list`

### 3. Publication

1. regenerate `contracts/nex/openapi.yaml`
2. verify deterministic output
3. keep `contracts/nex/openapi.lock.json` in sync

## Validation

Required validation for this pass:

1. `pnpm contracts:generate:nex`
2. `pnpm exec vitest run src/nex/runtime-api/openapi/nex-contract.test.ts`
3. any new focused conformance test added in this pass

Success criteria:

1. the covered methods no longer publish generic object request/response schemas where stable shapes are already known
2. representative live handler outputs conform to the published schemas
3. `contracts/nex/openapi.yaml` regenerates cleanly and deterministically
