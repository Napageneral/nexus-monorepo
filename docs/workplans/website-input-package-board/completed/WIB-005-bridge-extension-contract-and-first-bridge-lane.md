# WIB-005 Bridge Extension Contract And First Bridge Lane

## Status

Completed.

## Outcome

The shared bridge-extension surface and the first backend bridge lane now exist
at:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/bridge/index.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/bridge/index.test.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/shopify-bridge/index.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/shopify-bridge/index.test.mjs`

## Resolution

The package now has:

- one shared bridge normalizer
- one hidden-field payload builder for generic form and booking surfaces
- one concrete Shopify checkout bridge lane that serializes and parses explicit
  bridge fields

Bridge identifiers stay in explicit contract fields rather than opaque
metadata.
