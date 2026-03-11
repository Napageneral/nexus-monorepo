# Adapter Spec: Google

## Customer Experience

The Google adapter gives Nex one shared provider integration for Google Ads and
Google Business Profile.

For a clinic operator, the experience should be:

1. create one Google connection through Nex
2. select the app-facing connection profile the product offers
3. let the runtime complete the shared Google auth flow
4. backfill historical Google Ads and Business Profile facts
5. start monitor to keep the connection fresh
6. let products such as GlowBot consume canonical inbound Google records
   without teaching Google-specific credential hacks or product-specific hub
   URLs

The customer should not need to know:

- provider email as runtime identity
- adapter subprocess account aliases
- GlowBot-specific managed credential endpoints
- whether a given record came from Ads or Business Profile before it was
  normalized

## Adapter Identity

| Field | Value |
|---|---|
| Adapter ID | `google` |
| Package | `adapters/nexus-adapter-google/` |
| Binary | `cmd/google-adapter` |
| Provider Scope | Google Ads + Google Business Profile |

## Companion Package Spec

- [GOOGLE_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-google/docs/specs/GOOGLE_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md)

## Target-State Rules

1. Inbound data is emitted as canonical `record.ingest`.
2. `connection_id` is the canonical runtime identity.
3. Provider account ids, location ids, customer ids, and emails are metadata,
   not canonical connection identity.
4. Managed-profile behavior resolves through the frontdoor-managed connection
   gateway, not a product-specific hardcoded URL.
5. `adapter.accounts.list` reflects runtime-owned connection identity rather
   than provider email or `"default"`.
6. Backfill and monitor must both emit the same canonical record model.

## Operations

The target-state command surface is:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `adapter.monitor.start`
- `records.backfill`

The Google adapter does not need `channels.*` for the current GlowBot
marketing-intelligence use case.

## Connection Model

One Nex Google connection represents one durable Google credential binding
owned by the runtime.

That connection may expose:

- one or more Google Ads customer ids
- one or more Google Business Profile locations
- one or more app-facing connection profiles

The adapter runtime context receives the canonical `connection_id` from Nex and
must use that as the durable identity surface for all operations.

## Inbound Record Model

The adapter emits canonical records for two Google domains:

- Google Ads performance facts
- Google Business Profile location and review/performance facts

Each emitted record must preserve:

- `connection_id`
- `platform = "google"`
- stable external provider identifiers in metadata
- enough routing metadata for downstream product computation

The target-state adapter contract does not expose the old flat `account_id`
event shape.

## Managed Profiles

The Google adapter may support:

- bring-your-own Google credentials
- product-managed Google profiles offered by apps such as GlowBot

The shared adapter remains product-agnostic in both cases.

If a product offers a managed Google connection profile, the adapter must rely
on the canonical runtime/frontdoor-managed connection gateway rather than
hardcoding any product control-plane URL.

## Done Definition

The Google adapter is at parity only when:

1. it emits canonical `record.ingest`
2. it uses runtime `connection_id` end to end
3. it no longer hardcodes GlowBot-managed credential endpoints
4. Ads and Business Profile both validate through the same shared adapter
   contract
5. the adapter is installable and restart-safe as a shared Nex adapter package
