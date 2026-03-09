# Nex Shared Adapter Connection Model Handoff

Date: 2026-03-06
Status: alignment note for handoff
Purpose: capture the canonical long-term connection model already implied by active Nexus specs, so GlowBot/Spike work does not drift toward the legacy adapter-singleton runtime behavior.

## Canonical source docs

These are the primary specs to follow:

- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/adapters/ADAPTER_CONNECTION_ARCHITECTURE.md`
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/workplans/ADAPTER_CONNECTION_RUNTIME_CUTOVER_2026-03-06.md`

These remain important supporting references:

- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/adapters/ADAPTER_CONNECTION_PROFILES_AND_CALLBACKS.md`
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/NEX_APP_MANIFEST_AND_PACKAGE_MODEL.md`
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/workplans/HOSTED_PLATFORM_GAP_ANALYSIS_2026-03-06.md`
- `/Users/tyler/nexus/home/projects/nexus/nexus-specs/specs/nex/workplans/HOSTED_PLATFORM_IMPLEMENTATION_WORKPLAN_2026-03-06.md`
- `/Users/tyler/nexus/home/projects/nexus/apps/spike/docs/specs/SPIKE_DATA_MODEL.md`

## Locked canonical model

### 1. Shared adapter packages stay generic

An adapter package models the provider integration.

Examples:

- shared `github` adapter
- shared `google` adapter
- shared `meta-ads` adapter

The adapter package owns:

- provider-specific auth methods
- generic provider behavior
- stable adapter-level auth method ids

The app does not own adapter auth strategy.

### 2. Apps layer app-facing connection profiles on top

Apps expose app-facing options through `adapters[].connectionProfiles`.

Each connection profile is an app-owned policy/presentation object with:

- `id`
- `displayName`
- `authMethodId`
- `scope`
- optional `managedProfileId`

Rules:

- `authMethodId` points at a stable adapter auth method id
- `scope: "server"` means reusable across apps on the same server
- `scope: "app"` means visible only to the declaring app on that server
- `managedProfileId` is how an app selects a frontdoor-managed credential/config profile for that specific option

### 3. The same shared adapter can hold both server-scoped and app-scoped connections

This is the key customer-facing requirement.

Examples:

- Spike-managed GitHub App connection (`scope: "app"`)
- user-provided GitHub App connection (`scope: "server"`)
- user-provided GitHub PAT (`scope: "server"`)
- GlowBot-managed Google OAuth connection (`scope: "app"`)
- user-provided Google OAuth or API-key connection (`scope: "server"`)

Therefore the runtime cannot treat an adapter as having only one connection row.

### 4. Canonical runtime identity is connection-based, not adapter-singleton-based

The canonical thing the runtime stores and exposes is an adapter connection record keyed by stable `connection_id`.

Apps may derive adapter summaries for UI, but the canonical storage/API boundary is connection-based.

Connection creation must preserve:

- adapter package id
- service
- account identifier
- auth method id
- scope kind
- optional app id when scope is `app`

### 5. Runtime selection must be by stable ids, not array position

`methodIndex` is implementation residue and must not remain the canonical contract.

The runtime must resolve:

1. app connection profile
2. adapter auth method by stable `authMethodId`
3. managed profile, when present

Required context through start/pending/completion:

- `tenant_id`
- `entity_id`
- `app_id`
- `adapter_id`
- `connection_profile_id`
- `auth_method_id`
- requested scope

Managed credential resolution must be app/profile aware, not service-only.

## Spike reference example

Spike is the clearest example of the intended model.

The app can expose:

- `Connect with Spike GitHub App`
- `Use my own GitHub App`
- `Use a Personal Access Token`

All three are app-facing profiles layered on top of one shared `github` adapter.

Spike then binds product objects to `connection_id`.

From the Spike target flow:

- user chooses a connection profile
- runtime starts the shared GitHub adapter flow
- runtime creates the shared GitHub connection
- Spike records bindings keyed by `connection_id`
- later repo/index operations use `connection_id`

## Current runtime conflict

The active runtime code still diverges from the canonical model:

- connection records are effectively keyed by `adapter`
- auth method selection is still by `methodIndex`
- pending flow state does not yet carry full app/profile/auth-method context
- platform-managed credential resolution is still service-oriented

This means the current runtime cannot faithfully represent:

- more than one visible connection for the same shared adapter on one server
- app-scoped plus server-scoped connections existing simultaneously
- app-managed connection offers like Spike GitHub App or GlowBot Google OAuth in a canonical way

## Practical instruction for implementation

Do not bake the adapter-singleton model into new app work.

Implement toward the canonical target:

- shared adapter auth methods must grow stable `id`
- runtime connection APIs must become app-aware and profile-aware
- runtime records must become connection-based with stable `connection_id`
- app SDK methods should operate on real connection ids once the runtime cutover lands
- app UIs may still show adapter summaries, but those summaries should be derived from connection records

## What GlowBot should assume meanwhile

GlowBot should orient its next pipeline work around the canonical target, not the current singleton residue.

That means:

- provenance should ultimately bind to connection identity, not just adapter id
- app-specific managed connection offers are valid and expected
- the current tactical GlowBot SDK bridge is only a temporary compatibility layer

## Copyable handoff message

Use this text directly with the nex agent if needed:

> Canonical target for shared adapters is now locked in the active Nexus specs. Please align runtime implementation to that target rather than the current adapter-singleton residue. The primary architecture doc is `ADAPTER_CONNECTION_ARCHITECTURE.md`. The primary execution plan is `ADAPTER_CONNECTION_RUNTIME_CUTOVER_2026-03-06.md`. Supporting contract docs remain `ADAPTER_CONNECTION_PROFILES_AND_CALLBACKS.md` and `NEX_APP_MANIFEST_AND_PACKAGE_MODEL.md`. The required long-term behavior is: shared adapter packages stay generic; apps expose app-facing `connectionProfiles`; each profile references stable adapter `authMethodId`; connections may be `server`-scoped or `app`-scoped; the same shared adapter may hold both scopes on one server; runtime APIs and storage must be connection-based with stable `connection_id`, not one row per adapter; pending/completed connection state must carry `app_id`, `connection_profile_id`, and `auth_method_id`; managed credential resolution must be app/profile aware, not service-only; `methodIndex` is implementation residue and must not remain canonical. Spike’s GitHub flow is the clearest reference for the intended behavior: app-owned connection profiles on top of shared `github`, runtime creates shared connection, Spike binds product records by `connection_id`. GlowBot should implement toward this target too and should not bake the current adapter-singleton model into pipeline provenance or integration UX.`
