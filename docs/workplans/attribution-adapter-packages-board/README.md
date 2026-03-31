# Attribution Adapter Packages Board

This board tracks execution work for the shared attribution-focused adapter
packages after the provider specs are locked.

Canonical inputs:

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-intelligence-layer.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/meta-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-business-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/tiktok-display-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/google-ads-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/specs/attribution-adapters/shopify-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/workplans/tiktok-adapter-packages-board/README.md`
- `/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md`

Scope:

- shared Meta Ads adapter parity
- shared TikTok adapter split across business and display packages
- Google Ads acquisition-surface cleanup and parity
- shared Shopify backend outcome adapter package
- cross-provider cleanroom validation for the attribution adapter set

Status lanes:

- `not-started/`
- `in-progress/`
- `completed/`

## Current Status Snapshot

Completed:

- `AAP-001`

In Progress:

- `AAP-002`

Not Started:

1. `AAP-003`
2. `AAP-004`
3. `AAP-005`

## Execution Order

The default sequence for this board is:

1. close Meta Ads package parity against the canonical spec
2. split TikTok into shared business and display packages and validate both
3. isolate the Google Ads acquisition contract from unrelated Google surfaces
4. land the shared Shopify backend outcome package
5. prove the adapter set in cleanroom validation
