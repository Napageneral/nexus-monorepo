# Object registry v1

`registry.json` is the sole canonical source for the shared Nex and MoonSleep
object catalog. `registry.schema.json` describes its contract, and
`registry-tools.mjs` validates identities, relationships, aliases, repository
pointers, and the permanent prohibition on a schema field named `kind`.

The target model has three layers:

1. Nex core objects own universal identity and semantics;
2. domain Facet Definitions, Facet Attachments, and independent Resources add
   business meaning; and
3. read models and workspaces compose those objects for human use without
   becoming new authorities.

The human-readable catalog at `docs/object-registry.md` is generated:

```bash
node contracts/object-registry/v1/registry-tools.mjs --write
node contracts/object-registry/v1/registry-tools.mjs
```

Before proposing a new Resource, projection, or relationship:

1. search `registry.json` by object ID, display name, aliases, storage surface,
   and relationship target;
2. choose `reuse`, `generalize`, or `create`;
3. record the canonical owner, stable identity, revision behavior, evidence
   path, Observation target, relationship cardinality, and action boundary;
4. update this registry in the same reviewed change when a real new object or
   adapter is required.

The registry points to owning contracts. It does not copy their schemas or
become a second operational database model.

A `compatibility_alias` can keep deployed historical identities and read
surfaces resolvable without declaring them the long-term semantic Resource.
Its owner records whether it may project into an established canonical owner or
is readback-only, plus the unresolved generalization or migration decision.

A `read_model` may have a stable route or projection handle, but its fields and
relationships must resolve to their owning core objects, Facet Attachments, or
domain Resources. Product nouns such as Customer Issue, Partner, and Customer
Thread do not become Resources merely because operators need durable views of
them.

Entries marked `planned` are canonical target objects, not claims that storage
or APIs are already deployed. The open-gap register owns the work required to
make those entries real.

Coverage is intentionally additive. Version 1 inventories the Nex foundation
and the MoonSleep Customer Operations, Commerce, Dispatch, Claims, Supply, and
Finance objects exercised by the reviewed-interpretation tracks. A table or
provider object that has not yet been reviewed is not silently declared
canonical or absent; it must be added with its owner and source contract before
new projection work depends on it.
