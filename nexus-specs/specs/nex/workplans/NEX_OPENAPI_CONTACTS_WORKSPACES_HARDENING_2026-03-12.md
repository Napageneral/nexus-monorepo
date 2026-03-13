# Nex OpenAPI Contacts And Workspaces Hardening

## Customer Experience

A Nex API consumer should be able to use contact and workspace methods directly from
`contracts/nex/openapi.yaml` without reading handler source.

This pass hard-cuts published request/response schemas for:

- `contacts.*`
- `workspaces.*`

## Scope

Contacts:
- `contacts.list`
- `contacts.get`
- `contacts.create`
- `contacts.update`
- `contacts.search`
- `contacts.history`
- `contacts.import`

Workspaces:
- `workspaces.list`
- `workspaces.get`
- `workspaces.create`
- `workspaces.delete`
- `workspaces.manifest.get`
- `workspaces.manifest.update`
- `workspaces.files.list`
- `workspaces.files.get`
- `workspaces.files.set`
- `workspaces.files.delete`

## Research

### Contacts
Source: `nex/src/nex/runtime-api/server-methods/identity-contacts.ts`

Observations:
- handlers require the runtime identity ledger
- rows are returned directly from `identity.db`
- `contacts.update` uses immutable-row replacement and returns the new row
- `contacts.import` returns `{ imported, errors? }`

### Workspaces
Source: `nex/src/nex/runtime-api/server-methods/workspaces.ts`

Observations:
- handlers use the `nexus` ledger and filesystem-backed workspace paths
- result shapes are compact and stable
- manifest shape is intentionally open
- file methods return explicit path/file metadata

## Hard-Cut Decisions

1. No generic request or payload schemas remain for this slice.
2. Local OpenAPI component schemas are acceptable where no protocol exports exist.
3. Conformance tests must validate representative live handler outputs against the
   published response envelopes.

## Validation

```bash
cd /Users/tyler/nexus/home/projects/nexus/nex && pnpm contracts:generate:nex
cd /Users/tyler/nexus/home/projects/nexus/nex && pnpm exec vitest run src/nex/runtime-api/openapi/nex-contract.test.ts
```
