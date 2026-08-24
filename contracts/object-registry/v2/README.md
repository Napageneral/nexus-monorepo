# Canonical object registry v2

This is the generative declaration contract for canonical object types. A
complete declaration gives a new projected type the shared Canonical Object
Kernel behavior; an existing owner-backed declaration routes through its owner
at the same resolution seam.

An owner-backed declaration is an import of addressability, not a copy of owner
state. Its attributes, revisions, relationships, and storage remain owned by
the existing domain; the registry carries the stable identity contract,
accepted input language, and shared resolver binding. This applies to native
Nex objects and to already-deployed MoonSleep projections whose canonical IDs
and revision custody must remain stable during incremental convergence.

The registry contains identity-bearing object types only. It does not contain
candidate nouns, read views, storage tables, receipts, projectors, historical
decoders, compatibility objects, or activation states.

`accepted_input_terms` records exact historical or storage-shaped vocabulary
that projecting agents may interpret as the canonical type. `search_terms`
supports human discovery. Neither creates another object identity or resolver.

Version 1 remains a research and migration input while concepts are classified
and converged one at a time. New canonical registrations use v2.

Validate the source and compiled artifact:

```bash
node contracts/object-registry/v2/registry-tools.mjs
```

Regenerate the deterministic compiled artifact:

```bash
node contracts/object-registry/v2/registry-tools.mjs --write
```

Run the two-type compiler conformance proof:

```bash
node contracts/object-registry/v2/registry-tools.mjs --self-test
```
