# Observation target adapters v1

This contract binds reviewed canonical Nex Observations to existing Resource
owners without granting Resource-creation, Resource-mutation, or action
authority.

`registry.json` is the version-controlled target-adapter registry.
`registry.schema.json` defines its portable representation, and
`registry-tools.mjs` validates it against the canonical object registry.

Every adapter is fail-closed and declares one canonical object ID, its identity
shape, exact current read surface, closed attribute paths, closed relationship
targets and cardinalities, semantic status, privacy classification, custody
writer, readback support, and authority. The protocol has no create or update
operation. A projection writer may append evidence custody and receipts only.

`compatibility_only` preserves existing target identities, aliases, and
migration/readback custody without declaring the target canonical or granting
projection authority. A canonical adapter relationship pointing to a
compatibility-only target must mark that relationship the same way.

Run:

```bash
node contracts/observation-target-adapters/v1/registry-tools.mjs
```

## Domain-owner workflow

1. Search `contracts/object-registry/v1/registry.json` and record `reuse`,
   `generalize`, or `create`.
2. Add or update the canonical object entry before registering an adapter.
3. Add one adapter entry with exact identity, semantic status, paths,
   relationships, privacy, readback, and all-false mutation/action authority.
4. Implement the owner module and PII-free positive and negative fixtures.
5. Prove unknown target, unknown path, unknown relationship, cardinality drift,
   missing Resource, stale readback, implicit creation, Resource mutation, and
   action authority all fail closed.
6. Record implementation and cleanroom proof separately from a production
   deployment receipt. A merged adapter is not live merely because its source
   exists.

Supply's existing typed allowlists, Finance's legacy observation tables, and
the legacy Customer Issue target are compatibility inputs, not alternate
semantic histories. The owner adapter may read them, but canonical history
remains the Nex Observation head and shared projection custody. Customer Issue
compatibility does not settle the pending cross-domain
communication-loop/open-response model; general Commitments remain reusable.
