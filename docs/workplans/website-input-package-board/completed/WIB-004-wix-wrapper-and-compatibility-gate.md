# WIB-004 Wix Wrapper And Compatibility Gate

## Status

Completed.

## Outcome

The Wix wrapper and compatibility gate now exist at:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/wix/index.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/website-input/sdk/wix/index.test.mjs`

## Resolution

The Wix lane now distinguishes clearly between:

- unsupported installs
- baseline-capture installs
- bridge-capable installs

It also emits a concrete install plan and proof checklist that operators can
use without inventing a per-client Wix decision tree.
