# Adapter Spec: Meta Ads

## Customer Experience

The Meta Ads adapter gives Nex a shared provider integration for Meta ad
account performance.

The operator experience should be:

1. create one Meta Ads connection through Nex
2. complete the shared Meta auth flow or provide the required credential
   binding through the canonical connection surface
3. backfill historical campaign/account facts
4. run monitor to keep the connection fresh
5. let products such as GlowBot consume canonical Meta Ads records through the
   same runtime connection model used by other adapters

The operator should not need to understand:

- a hardcoded `"default"` runtime account
- provider token plumbing hidden inside product-specific URLs
- legacy flat event shapes

## Adapter Identity

| Field | Value |
|---|---|
| Adapter ID | `meta-ads` |
| Package | `adapters/nexus-adapter-meta-ads/` |
| Binary | `cmd/meta-ads-adapter` |

## Companion Package Spec

- [META_ADS_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md](/Users/tyler/nexus/home/projects/nexus/adapters/nexus-adapter-meta-ads/docs/specs/META_ADS_ADAPTER_PACKAGE_DISTRIBUTION_AND_INSTALL.md)

## Target-State Rules

1. Inbound data is emitted as canonical `record.ingest`.
2. `connection_id` is the canonical runtime identity.
3. Meta account ids are provider metadata, not runtime account identity.
4. Managed-profile behavior resolves through the frontdoor-managed connection
   gateway, not a GlowBot-specific URL.
5. Backfill and monitor emit the same canonical record model.

## Operations

The target-state command surface is:

- `adapter.info`
- `adapter.health`
- `adapter.accounts.list`
- `adapter.monitor.start`
- `records.backfill`

## Connection Model

One Nex Meta Ads connection represents one durable Meta credential binding for
one or more ad accounts.

The runtime supplies a canonical `connection_id`, and the adapter must treat
that value as the sole operational identity surface.

## Inbound Record Model

The adapter emits canonical records representing Meta Ads performance facts.

Each emitted record must preserve:

- `connection_id`
- `platform = "meta-ads"`
- stable external ad account or campaign identifiers in metadata

The target-state contract does not expose the old flat `account_id` event
shape.

## Done Definition

The adapter is at parity only when:

1. it emits canonical `record.ingest`
2. it uses runtime `connection_id`
3. it no longer hardcodes a GlowBot-managed credential URL
4. live backfill and monitor validate against the same connection model
5. the adapter is installable and restart-safe as a shared Nex adapter package
