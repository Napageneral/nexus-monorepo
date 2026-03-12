# GlowBot Package Publish And Deploy Rehearsal Workplan

> Focused workplan for proving GlowBot package artifacts and dependency-driven
> hosted install behavior before first-clinic validation.

**Status:** ACTIVE
**Last Updated:** 2026-03-12

## Current State

Completed locally:

- package-release tooling emits real tarballs for `glowbot`, `glowbot-admin`,
  and `glowbot-hub`
- manifests parse cleanly from packaged artifacts
- Frontdoor publish persists release dependency metadata for
  `glowbot-admin -> glowbot-hub`
- Frontdoor app install resolves that dependency and installs `glowbot-hub`
  before `glowbot-admin`

Still pending:

- real hosted control-plane server rehearsal
- real clinic-style server rehearsal
- deployed `productControlPlane.call` proof through installed packages

## Goal

Prove that GlowBot can be published and installed through the real hosted
package lifecycle using real package artifacts.

This workplan covers:

- `glowbot`
- `glowbot-admin`
- `glowbot-hub`

It does not cover live clinic credentials.

## Locked Decisions

1. GlowBot uses one hosted package lifecycle system.
2. `glowbot-admin` and `glowbot-hub` remain separate packages.
3. operator installation should feel like one action because `glowbot-admin`
   pulls in `glowbot-hub` through `requires.apps`.
4. the current runtime install path is grounded in app-package artifacts, so
   the rehearsal uses `app.nexus.json` packages for all three GlowBot packages.

## WPR1. Release Artifact Truth

Implement explicit package-release tooling for:

- `glowbot`
- `glowbot-admin`
- `glowbot-hub`

Exit criteria:

- each package can emit a versioned tarball
- each tarball contains the required runtime files only
- no tarball depends on repo-local paths after extraction

## WPR2. Local Artifact Validation

Validate the tarballs before hosted install.

Exit criteria:

- artifact contents are correct
- manifests parse cleanly
- package roots are self-contained after extraction

## WPR3. Hosted Clinic-App Rehearsal

Install `glowbot` on a clinic-style server through the hosted package path.

Exit criteria:

- the server can install the published `glowbot` release
- package state is healthy
- app visibility matches the clinic-facing product intent

**Status:** pending

## WPR4. Hosted Control-Plane Rehearsal

Install `glowbot-admin` on a dedicated control-plane server and validate that
dependency planning also installs `glowbot-hub`.

Exit criteria:

- installing `glowbot-admin` installs `glowbot-hub`
- `glowbot-admin` is operator-visible only
- `glowbot-hub` is healthy, operator-hidden, and not browser-launchable

**Status:** local dependency-planning proof complete; real hosted rehearsal pending

## WPR5. Control-Plane Call Validation

Prove the deployed clinic app can reach the deployed control plane through the
canonical hosted path.

Exit criteria:

- `productControlPlane.call` resolves against the installed control-plane route
- no direct hub base URL is required in the clinic app

**Status:** pending deployed validation

## Completion Condition

This workplan is complete when WPR1-WPR5 pass with recorded evidence.
