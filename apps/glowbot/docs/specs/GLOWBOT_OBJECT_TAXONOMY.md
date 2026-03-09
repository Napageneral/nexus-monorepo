# GlowBot Object Taxonomy

**Status:** CANONICAL
**Last Updated:** 2026-03-06

---

## Purpose

This document locks the baseline vocabulary for active GlowBot specs.

GlowBot inherits the shared hosted vocabulary from:

- `../../../../nexus-specs/specs/nex/hosted/HOSTED_OBJECT_TAXONOMY.md`
- `../../../../nexus-specs/specs/nex/adapters/ADAPTER_CONNECTION_PROFILES_AND_CALLBACKS.md`

This local taxonomy exists so hosted/product terms do not drift while the rest
of the GlowBot spec tree is being aligned.

---

## Non-Negotiable Rules

1. `server` is the default hosted machine term in GlowBot docs.
2. `workspace` is not a normal GlowBot hosted term.
3. Shared adapter connections are different from GlowBot-specific data and pipeline state.
4. `clinic_id` is the canonical location/customer segmentation tag in GlowBot data flows when per-clinic scoping matters.
5. The clinic-facing GlowBot package is an inline-handler hosted app; the shared
   GlowBot backend is a separate hub service package.

---

## GlowBot Terms

| Term | Meaning |
|---|---|
| `GlowBot app` | The installable clinic-facing hosted GlowBot app package |
| `website` | Public GlowBot marketing and signup surface in front of frontdoor |
| `admin app` | Operator-facing hosted GlowBot admin package |
| `hub service` | Shared GlowBot benchmark and product-control service package |
| `product control plane` | The GlowBot hub in its role as shared backend and secret owner for GlowBot-managed provider flows |
| `shared package` | GlowBot-owned shared contracts, schemas, and reusable local libraries |
| `server` | Customer-facing machine that hosts the GlowBot app |
| `runtime` | Shared Nex process on that server |
| `adapter` | Shared installable integration package used by GlowBot |
| `adapter connection` | Shared runtime-owned connected account/credential set |
| `connection profile` | GlowBot-owned app-facing connection option layered on top of a shared adapter |
| `clinic_id` | GlowBot's canonical data segmentation tag for clinic/location scoping |
| `pipeline` | GlowBot-owned data processing flow built on top of shared runtime/app primitives |

---

## GlowBot-Specific Language Rules

Use:

- `website`
- `GlowBot app`
- `admin app`
- `hub service`
- `product control plane`
- `shared package`
- `server`
- `runtime`
- `adapter`
- `adapter connection`
- `connection profile`
- `clinic_id`

Avoid:

- `workspace` for hosted routing, installs, billing, or launch flows
- ad hoc package names for the clinic-facing product surface
- treating the hub as the clinic app backend by default

This document intentionally stays thin. As the GlowBot active specs are aligned,
additional domain nouns should be added here instead of being introduced ad hoc
across the spec tree.
