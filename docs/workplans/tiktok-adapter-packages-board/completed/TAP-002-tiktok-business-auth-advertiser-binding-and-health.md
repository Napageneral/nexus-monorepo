# TAP-002 TikTok Business Auth Advertiser Binding And Health

## Goal

Implement TikTok Business OAuth, advertiser binding, and health reporting for
the shared `tiktok-business` package.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-business-adapter.md`
- `/Users/tyler/nexus/home/projects/moonsleep-v1/workers/meta-capi/src/index.ts`

## Current Gap

- the Nex package has no TikTok Business credential handling yet
- advertiser discovery and one-advertiser binding are not implemented
- `adapter.health` cannot yet prove advertiser readability

## Acceptance

1. setup can exchange TikTok Business OAuth credentials through Nex
2. visible advertiser ids can be discovered and one advertiser can be bound to
   the connection
3. `adapter.connections.list` and `adapter.health` reflect the bound advertiser
4. provider-native advertiser identifiers are preserved without making them the
   Nex operational identity
