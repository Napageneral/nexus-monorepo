# MHAR-004 Hosted Package Install And Runtime Convergence

## Goal

Install the blocking package set on the hosted MoonSleep runtime and prove the
runtime converges with the expected adapter and app surfaces active.

## Blocking Package Set

- `meta-ads`
- `google-ads`
- `tiktok-business`
- `shopify`
- `website-input`
- `attribution`

## Acceptance

1. each package installs through the canonical Frontdoor-managed path
2. the hosted runtime reflects the installed packages correctly
3. app and adapter runtime health are stable after install
4. the hosted runtime is ready for real MoonSleep connection setup

## Findings

Installed hosted package set on `srv-1c4b077a-1f2`:

- adapters:
  `meta-ads`, `google-ads`, `tiktok-business`, `shopify`
- apps:
  `website-input`, `attribution`

The hosted runtime now exposes the expected package surfaces and is usable for
real MoonSleep connection setup.
