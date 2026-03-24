---
summary: "Hard-cut extraction of the Nex operator console from kernel-owned UI assets into an app package."
title: "Nex Operator Console App Extraction Hard Cut"
---

# Nex Operator Console App Extraction Hard Cut

## Customer Experience

The operator console should feel like a real Nex app, not like a special kernel-owned dashboard.

From the operator's perspective:

1. the operator console is installed and activated as an app
2. it opens under `/app/<appId>/...`
3. it remains the operator-facing control surface for the core Nex runtime
4. it is isolated from kernel source ownership and build coupling
5. it can still be default-installed, but it is not a built-in browser primitive

From the kernel's perspective:

1. core Nex owns runtime API, auth, routing, hosting, app install lifecycle, and storage semantics
2. core Nex does not own a dedicated `ui/` source tree or a dedicated `dist/operator-console` artifact contract
3. core Nex should not special-case the operator console beyond ordinary app hosting and any explicitly retained operator-console auth policy

## Canonical Research Summary

### 1. Canon already says the operator console is app-owned

The active canon is explicit:

- `docs/specs/platform/nex-operator-console.md`
  - the operator console is an app-owned browser product surface
  - it is not a built-in core runtime transport surface
  - it may be default-installed, but it still lives in app land under `/app/<appId>/...`
- `docs/specs/foundations/external-ingress-and-internal-events.md`
  - browser surfaces are app-owned under `/app/<appId>/...`
  - core Nex owns runtime API, transport bindings, and app hosting/routing
- `docs/specs/foundations/runtime-api-and-transport-surfaces.md`
  - browser UX is app-owned, not a built-in core transport surface
- `docs/specs/apps/app-manifest-and-package-model.md`
  - apps may own static browser UI assets
  - apps are self-describing installable packages

So this extraction is not a speculative redesign.
It is a canonical hard cut that brings implementation into line with the existing model.

### 2. Current implementation is still kernel-special-cased

Current UI source ownership is inside `nex`:

- `nex/ui/`
- `nex/scripts/ui.js`

Current build contract still assumes kernel-owned assets:

- `nex/ui/vite.config.ts` writes to `nex/dist/operator-console`
- `nex/package.json` exposes `ui:build`, `ui:dev`, `ui:install`
- `nex/package.json` still runs `pnpm ui:build` in `prepack`

Current runtime still serves those assets through dedicated special-case code:

- `nex/src/nex/runtime-api/operator-console.ts`
- `nex/src/infra/operator-console-assets.ts`
- `nex/src/nex/runtime-api/operator-console-shared.ts`

Current operator guidance and maintenance flows still assume those kernel-owned assets:

- `nex/src/commands/dashboard.ts`
- `nex/src/commands/onboard-helpers.ts`
- `nex/src/commands/configure.wizard.ts`
- `nex/src/commands/doctor-ui.ts`
- `nex/src/infra/update-runner.ts`

### 3. Special-cased route assumptions still survive

Active code still assumes the console route and app identity in special ways:

- `DEFAULT_OPERATOR_CONSOLE_ENTRY_PATH = "/app/console/chat"`
- onboarding/status tests still assert `/app/console/chat`
- `server.apps.e2e.test.ts` still expects the namespaced console mount directly
- browser e2e tests still build and launch the in-kernel UI with `pnpm ui:build`

This is exactly the residue the extraction must remove.

### 4. Generic app serving already exists in kernel

The extraction does not need a new browser hosting model.

`nex` already has generic manifest-driven app UI serving through:

- `nex/src/apps/ui-registrar.ts`
- `nex/src/apps/registry.ts`
- `nex/src/apps/discovery.ts`
- `nex/src/nex/runtime-api/runtime-apps.ts`
- `nex/src/nex/runtime-api/server-http.ts`
- `nex/src/nex/runtime-api/server.apps.e2e.test.ts`

This is an important constraint:

1. generic app static hosting is already present
2. generic manifest-driven browser app catalog listing is already present
3. generic `/app/<appId>/...` mounting is already present
4. operator-console-specific serving exists alongside that generic path as residue

So the implementation target is not to invent a new host.
It is to move the operator console onto the generic app host lane and delete the dedicated operator-console asset path.

### 5. App package examples already exist in the umbrella

The current real app-repo family is:

- `packages/apps/dispatch`
- `packages/apps/aix`
- `packages/apps/glowbot`
- `packages/apps/spike`

Those repos already model the right package shape:

- repo root with docs and scripts
- package root at `app/`
- `app.nexus.json`
- `dist/` for UI assets where applicable
- package-local services/hooks/methods as needed

This matters because it means the operator console should become a real app package repo, not a random extracted frontend folder.

## Canonical Decision

### 1. Extraction form

Use true app extraction.

The operator console becomes a standalone app package repo.

It is installed back onto Nex as an app package, not copied back into kernel-owned `dist/operator-console`.

### 2. Target home

The current umbrella reality says app repos live under `packages/apps/*`.

So the recommended target is:

- `packages/apps/nex-operator-console/`

with package root:

- `packages/apps/nex-operator-console/app/`

Important note:

If the umbrella later promotes a new top-level `apps/` family, this repo can move there later. That umbrella move is separate from this kernel extraction. The hard-cut extraction itself should align to the current app-repo family rather than inventing a one-off location.

### 3. Package identity

Recommended app id:

- `console`

Reason:

1. it preserves the existing operator-console route expectation cleanly
2. it keeps `/app/console/...` stable if you choose to preserve that app id
3. it avoids unnecessary route churn during extraction

Recommended repo name:

- `nex-operator-console`

That keeps the app package identity and repo identity distinct:

1. repo: `nex-operator-console`
2. app id: `console`

### 4. Lifecycle model

The operator console should be:

1. a browser UI app package with `app.nexus.json`
2. likely default-installed in dev/bootstrap/local runtime workflows
3. served through generic app hosting/routing
4. not served through dedicated kernel-only asset resolution helpers

## Target Repository Shape

```text
packages/apps/nex-operator-console/
  README.md
  docs/
  app/
    app.nexus.json
    dist/
    methods/
    hooks/
    assets/
    api/
```

Minimum first-wave package contract:

- `app/app.nexus.json`
- `app/dist/` built browser assets
- `app/ui` ownership collapsed into the package build system rather than `nex/ui`

## What Moves Out Of Kernel

Move out of `nex` ownership:

1. `nex/ui/`
2. `nex/scripts/ui.js`
3. UI-specific build/test scripts in `nex/package.json`
4. UI-specific docs/instructions that treat the UI as kernel source

## What Stays In Kernel

Keep in `nex`:

1. runtime API
2. app hosting and routing
3. app install/discovery/activation
4. generic browser-app listing logic
5. operator-console auth and route policy only where it is genuinely runtime policy and not asset ownership

Representative kernel surfaces that should remain, likely rewritten but not deleted wholesale:

- `nex/src/nex/runtime-api/runtime-apps.ts`
- `nex/src/commands/dashboard.ts`
- `nex/src/commands/onboard-helpers.ts`
- runtime auth/session policy around browser callers where still canonical

## What Must Die In Kernel

These are the main hard-cut targets.

### Asset ownership special cases

- `nex/src/infra/operator-console-assets.ts`
- `dist/operator-console` as a kernel-owned required artifact
- `pnpm ui:build` / `ui:dev` / `ui:install` in `nex/package.json`
- `scripts/ui.js`

### Dedicated operator-console static serving logic

- `nex/src/nex/runtime-api/operator-console.ts`

This should either:

1. disappear entirely in favor of generic app static hosting
2. or be reduced to generic browser-app helpers with no operator-console-specific filesystem contract

### Special-cased console route assumptions

- `DEFAULT_OPERATOR_CONSOLE_ENTRY_PATH` as a kernel-owned constant
- tests and onboarding/status helpers that hardcode `/app/console/chat` as a kernel truth rather than app metadata

## Validation Gap Discovered During End-To-End Drill

After the extraction landed, the first canonical package-lane validation exposed a real gap:

1. the extracted console app could build and be locally synced into runtime state
2. but it did not yet satisfy the canonical app package contract enforced by `nexus package validate`
3. so any claim of Frontdoor publish/install readiness would have been premature

The concrete missing package artifacts were:

1. `TESTING.md`
2. `docs/specs/`
3. `docs/workplans/`
4. `docs/validation/`
5. `api/openapi.yaml`
6. `api/openapi.lock.json`
7. `SKILL.md`
8. manifest `skill` field

This validation slice must close that package-contract gap before attempting a real Frontdoor publish/install drill.

## Execution Phases

### Phase 1: Package the UI as a real app repo

1. create `packages/apps/nex-operator-console/`
2. create `app/app.nexus.json`
3. move `nex/ui` source into the app package build surface
4. make the app package produce its own `app/dist/` browser assets

Exit condition:

- the operator console can be built as an app package without relying on `nex/ui` or `nex/scripts/ui.js`

### Phase 2: Rewire runtime hosting to generic app serving

1. register the operator console through installed app metadata
2. mount it through the existing generic app UI serving path already used by manifest-driven apps
3. remove dedicated static asset resolution from kernel-owned `dist/operator-console`
4. make runtime/browser app listing resolve the console from installed app state instead of kernel special casing

Exit condition:

- the runtime serves the console as an app package, not as kernel-owned assets

### Phase 3: Clean onboarding, dashboard, doctor, and update flows

1. remove `ui:build` assumptions from update/doctor flows
2. update onboarding and dashboard helpers to rely on app discovery / app metadata
3. update tests and docs to assert the app-owned model

Exit condition:

- no operator guidance or maintenance flow assumes kernel-owned UI assets

### Phase 4: Delete the old kernel path

1. delete `nex/ui/`
2. delete `nex/scripts/ui.js`
3. delete or radically reduce dedicated operator-console asset helpers in `nex`
4. remove `prepack` coupling to `ui:build`

Exit condition:

- `nex` no longer owns a dedicated operator-console source/build subtree

## Validation

Static conformance:

1. no active `nex/ui/` ownership in kernel docs or package scripts
2. no active `dist/operator-console` kernel asset contract
3. no active `scripts/ui.js`
4. no active `ensureOperatorConsoleAssetsBuilt()` usage in kernel flows

Runtime validation:

1. installed console app appears through generic browser app discovery
2. `nexus dashboard` resolves the installed console app through app metadata
3. onboarding and status surfaces point to the same app-owned route
4. the runtime serves the console without dedicated kernel asset resolution code

Packaging validation:

1. `packages/apps/nex-operator-console/app/app.nexus.json` validates cleanly
2. app UI assets are packaged inside the app package root
3. install/activation works without repo-layout assumptions back into `nex`

## Non-Goals

This hard cut does not attempt to:

1. redesign the operator console information architecture again
2. move the operator console into Frontdoor
3. reclassify the operator console as a product control plane admin app
4. preserve backward compatibility with kernel-owned `ui/` build flows
