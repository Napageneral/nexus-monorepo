# AGJV-002 Cleanroom Package Projection For Adapters And Apps

## Goal

Make the cleanroom install truth explicit for the full attribution stack.

## Scope

- `meta-ads`
- `google-ads`
- `tiktok-business`
- `tiktok-display`
- `shopify`
- `website-input`
- `attribution`

## Acceptance

1. the proof lane does not guess host repo paths at runtime
2. every required adapter and app is projected into the cleanroom as an
   explicit installable artifact
3. package install and registration happen inside the fresh sandboxed Nex
   server-under-test
4. the package projection contract is reusable for later attribution proof runs
