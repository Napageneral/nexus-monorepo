# GlowBot Package Publish And Deploy Rehearsal

> Canonical publish/install rehearsal model for `glowbot`, `glowbot-admin`,
> and `glowbot-hub`.

## Purpose

This document defines how GlowBot should rehearse hosted package publishing and
installation before first-clinic validation.

It exists to make six things explicit:

1. the single hosted package lifecycle GlowBot relies on
2. the difference between package kind and execution mode
3. which real package artifacts GlowBot must publish
4. how the clinic-server and control-plane-server installs differ
5. how `glowbot-admin` should pull in `glowbot-hub`
6. what must be proven before live clinic credentials arrive

This is a deployment-rehearsal spec, not a local-dev shortcut.

## Customer And Operator Experience

The intended hosted experience is:

1. a clinic server installs `glowbot`
2. the dedicated GlowBot control-plane server installs `glowbot-admin`
3. dependency planning installs `glowbot-hub` on that same control-plane
   server through `requires.apps`
4. operators think of that as one control-plane install action
5. both installs use real hosted package artifacts and the same hosted package
   lifecycle system

GlowBot should not rely on repo-local directories, manual copying, or
special-case package installers.

## One Hosted Package Lifecycle

GlowBot follows the single hosted package lifecycle defined by:

- [Platform Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/platform-model.md)
- [Package Registry and Release Lifecycle](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/package-registry-and-release-lifecycle.md)
- [Frontdoor Package Registry and Lifecycle](/Users/tyler/nexus/home/projects/nexus/nexus-frontdoor/docs/specs/FRONTDOOR_PACKAGE_REGISTRY_AND_LIFECYCLE.md)

Non-negotiable rule:

- apps and adapters may have different public install routes
- they still compile down to one registry, one release model, one dependency
  planner, and one runtime operator install model

GlowBot must use that one system.

## Package Kind Versus Execution Mode

GlowBot needs these distinctions kept clear.

### App package

An app package is an installable package declared by `app.nexus.json`.

It may be:

- inline-handler
- service-routed
- or an app package with package-local worker/service processes

It may or may not have browser UI.

### GlowBot current hosted install reality

For the current hosted rehearsal, GlowBot uses three real app-package
artifacts:

- `glowbot`
- `glowbot-admin`
- `glowbot-hub`

`glowbot-hub` is the control-plane package and it runs a package-local `hub`
service process.

That is the real install path supported by the runtime in this repo snapshot.

## Canonical GlowBot Package Set

### Clinic server

The clinic server package set is:

- `glowbot`
- shared adapters

The clinic server does not install:

- `glowbot-admin`
- `glowbot-hub`

### Control-plane server

The control-plane server package set is:

- `glowbot-admin`
- `glowbot-hub`

Operator experience rule:

- the operator installs `glowbot-admin`
- dependency planning installs `glowbot-hub`
- operationally this behaves like one control-plane install

## Required Package Artifacts

GlowBot must publish real release tarballs for:

- `app/`
- `admin/`
- `hub/`

Each tarball must be rooted at the package root and include only the files
required by runtime activation.

### `glowbot`

Required artifact contents:

- `app.nexus.json`
- `assets/` when present
- `dist/`
- `hooks/`
- `methods/`
- `clinic-profile/`
- `pipeline/`
- `product-control-plane/`

### `glowbot-admin`

Required artifact contents:

- `app.nexus.json`
- `dist/`
- `hooks/`
- `methods/`

### `glowbot-hub`

Required artifact contents:

- `app.nexus.json`
- `bin/`
- `src/`

## Canonical Rehearsal Sequence

The rehearsal sequence is:

1. produce real package tarballs for `glowbot`, `glowbot-admin`, and
   `glowbot-hub`
2. publish those releases to the hosted package registry
3. create/select a clinic-style server
4. install `glowbot` there
5. create/select a dedicated GlowBot control-plane server
6. install `glowbot-admin` there
7. validate that dependency planning also installs `glowbot-hub`
8. verify package state, service health, and visibility
9. verify `productControlPlane.call` from clinic app to control-plane server

This is the minimum hosted rehearsal before synthetic records or live clinic
credentials.

## Pass Criteria

The rehearsal is successful only if:

1. all three GlowBot packages publish as real tarball artifacts
2. the clinic server installs only `glowbot`
3. the control-plane server installs `glowbot-admin` and `glowbot-hub`
4. `glowbot-admin` is operator-visible only
5. `glowbot-hub` is operator-hidden and not browser-launchable
6. `productControlPlane.call` succeeds against the installed control-plane
   deployment
7. no repo-local path assumptions are required to make the install work
