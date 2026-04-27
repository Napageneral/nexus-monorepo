# DWO-001 Repo-Managed Wix Snippet Template And Devenir Profile Binding

## Goal

Move the Devenir Wix custom-code snippet out of one-off local files and into a
repo-managed source/template lane that is explicitly bound to the Devenir
outcome profile.

## Spec Inputs

- `/Users/tyler/nexus/home/projects/nexus/docs/specs/devenir-wix-website-outcome-profile.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/docs/specs/web-journey-source-adapter.md`
- `/Users/tyler/nexus/home/projects/nexus/packages/apps/web-signals/app/docs/specs/WEB_SIGNALS_CONTROL_PLANE_APP.md`

## Current Gap

- the current reviewed Devenir snippet lives in local operator storage instead
  of source control
- Devenir-specific route and control knowledge is not versioned with the code
  that emits `web-journey` events
- future edits would be too easy to make by hand in Wix or local files without
  a durable diffable source of truth

## Acceptance

1. the Devenir Wix snippet has a repo-managed source or generator path
2. Devenir-specific route families and control match tables are defined in
   source control
3. generated local install artifacts can be reproduced without hand-editing the
   snippet body
4. tokens and other secrets remain outside the repo

## Closure Note

This ticket is closed.

The repo-managed Devenir snippet/profile surface now lives in:

- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/index.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/snippet.mjs`
- `/Users/tyler/nexus/home/projects/nexus/packages/adapters/web-journey/sdk/wix/profiles/devenir-aesthetics.mjs`

The operator corpus now documents local regeneration without hand-editing:

- `/Users/tyler/nexus/home/projects/nexus/docs/validation/wix-devenir-aesthetics-readonly-exploration.md`

Validation completed with:

- `node --test --experimental-strip-types src/contract.test.ts sdk/core/index.test.mjs sdk/gtm/index.test.mjs sdk/shopify-bridge/index.test.mjs sdk/wix/index.test.mjs sdk/wix/snippet.test.mjs sdk/wix/profiles/devenir-aesthetics.test.mjs`
- `npx -y --package typescript@5.9.2 tsc -p tsconfig.json --noEmit`
- `npm run build`
- `nexus package validate .`
