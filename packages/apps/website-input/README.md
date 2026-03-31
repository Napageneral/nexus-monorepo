# Website Input

This package is the shared first-party website input surface for attribution
work.

It is split into three browser-facing helper surfaces:

- `sdk/core/` for browser identity and canonical event capture
- `sdk/bridge/` for generic bridge normalization and hidden-field payloads
- `sdk/shopify-bridge/` for the first concrete checkout bridge lane
- `sdk/gtm/` for GTM/data-layer mapping into the same canonical contract
- `sdk/wix/` for Wix compatibility checks and install planning

This package does not own collector persistence, backend outcome truth, or
final attribution decisions.

## Usage

The intended flow is:

1. create one `website_installation_id`
2. initialize `sdk/core`
3. capture canonical browser events with `browser_id` and `session_id`
4. optionally serialize bridge fields for hidden inputs or Shopify checkout
5. optionally map GTM data-layer events through `sdk/gtm`
6. optionally classify Wix capability through `sdk/wix`

## Tests

Run the local SDK tests with:

```bash
node --test sdk/**/*.test.mjs
node --experimental-strip-types --test app/methods/store.test.ts
```
