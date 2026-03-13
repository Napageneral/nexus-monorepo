# Nex OpenAPI Identity Hardening

## Customer Experience

A developer using `contracts/nex/openapi.yaml` should be able to understand and use the
identity-facing Nex API without reading handler source. This hardening pass covers the
first stable identity slice:

- `credentials.*`
- `entities.*`
- `groups.*`

## Scope

This pass hard-cuts the published Nex API contract for:

- `credentials.list`
- `credentials.get`
- `credentials.create`
- `credentials.update`
- `credentials.revoke`
- `credentials.resolve`
- `credentials.vault.store`
- `credentials.vault.retrieve`
- `entities.list`
- `entities.get`
- `entities.create`
- `entities.update`
- `entities.resolve`
- `entities.tags.list`
- `entities.tags.add`
- `entities.tags.remove`
- `entities.merge`
- `entities.merge.propose`
- `entities.merge.candidates`
- `entities.merge.resolve`
- `groups.list`
- `groups.get`
- `groups.create`
- `groups.update`
- `groups.delete`
- `groups.members.list`
- `groups.members.add`
- `groups.members.remove`

## Research

The runtime handlers already return stable shapes.

### Credentials

Source: `nex/src/nex/runtime-api/server-methods/credentials.ts`

Observations:
- request schemas are not currently exported from the protocol layer
- responses are normalized through `rowToView(...)`
- `credentials.create` and `credentials.update` return `{ credential, ok: true }`
- `credentials.revoke` returns `{ ok: true, revoked: true }`
- `credentials.resolve` returns `{ value, credentialId, type }`
- `credentials.vault.store` returns `{ ok: true, vaultEntryId }`
- `credentials.vault.retrieve` returns `{ value }`

### Entities

Source: `nex/src/nex/runtime-api/server-methods/identity-entities.ts`

Observations:
- handlers require `context.getNexRuntime()` and use the runtime identity ledger
- entity rows are returned directly from `identity.db`
- tags and merge flows expose stable wrapper shapes
- merge candidate rows are returned directly from `merge_candidates`

### Groups

Source: `nex/src/nex/runtime-api/server-methods/identity-groups.ts`

Observations:
- handlers require `context.getNexRuntime()` and use the runtime identity ledger
- `groups.list` / `groups.get` return projected group rows with `member_count`
- member methods return projected rows joined with entity name/type

## Hard-Cut Decisions

1. No generic request or payload schemas remain for this slice.
2. Local OpenAPI component schemas are acceptable where protocol exports do not yet exist.
3. Schemas should follow live handler payloads exactly.
4. Conformance tests must validate representative live handler outputs against the
   published OpenAPI response envelopes.

## Validation

Required validation:

```bash
cd /Users/tyler/nexus/home/projects/nexus/nex && pnpm contracts:generate:nex
cd /Users/tyler/nexus/home/projects/nexus/nex && pnpm exec vitest run src/nex/runtime-api/openapi/nex-contract.test.ts
```

Success criteria:
- all targeted identity methods publish nongeneric request/payload schemas
- representative live handler outputs validate against the published envelopes
- `contracts/nex/openapi.yaml` regenerates cleanly
