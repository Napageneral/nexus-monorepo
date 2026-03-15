# Frontdoor Shell And Embedded App Model

**Status:** CANONICAL
**Last Updated:** 2026-03-10
**Related:**
- `FRONTDOOR_ARCHITECTURE.md`
- `FRONTDOOR_HOSTED_ACCESS_AND_ROUTING.md`
- `../../nex/docs/specs/platform/platform-model.md`
- `../../nex/docs/specs/platform/runtime-access-and-routing.md`

---

## Purpose

This document defines the canonical frontdoor shell model for hosted browser
app launches.

It covers:

- the customer-facing shell experience
- ownership of top-level browser chrome
- how app content is embedded
- URL and history responsibilities
- why the hosted shell uses an iframe-backed embedded boundary instead of HTML injection

---

## Customer Experience

In the frontdoor shell profile:

1. the browser lands on `https://frontdoor.nexushub.sh/app/<appId>/...`
2. frontdoor owns the top-level document, navigation, and account/server chrome
3. the target app renders inside a dedicated embedded boundary below the shell
4. the app keeps all of its internal pages beneath its single public entry path
5. platform chrome remains visible and durable even if the app crashes, rerenders aggressively, or navigates internally

The customer should experience one coherent product surface, not a fragile DOM
hack layered on top of an app document.

---

## Canonical Decisions

1. The shell profile uses a frontdoor-owned top-level document.
2. App content renders inside a dedicated embedded boundary.
3. The embedded boundary is iframe-backed in the canonical target state.
4. Platform chrome is never injected into an app DOM as the canonical model.
5. The public browser URL remains the canonical app URL under `/app/<appId>/...`.
6. Each app exposes exactly one public browser entry path rooted at `/app/<appId>/`.
7. Internal app pages live beneath that root; sidecar top-level app UIs are not canonical.
8. Route synchronization and platform actions use a shared shell bridge, not ad hoc per-app code.

---

## Shell Ownership Boundary

Frontdoor owns:

- the top-level HTML document
- account navigation
- server switching
- app switching
- loading and degraded-state chrome
- shell-level error presentation
- outer URL and history coordination

Apps own:

- app UI inside the embedded boundary
- app-internal routes beneath their single entry path
- app-specific data fetches and runtime method calls
- app-specific callbacks and webhooks under the hosted path contract

This boundary keeps platform behavior durable and keeps app behavior product-owned.

---

## URL And History Model

The canonical user-facing browser URL stays under the shell profile:

- `/app/<appId>/`
- `/app/<appId>/<appRoute>`

Rules:

1. The outer browser URL is the shareable canonical URL for the shell profile.
2. Frontdoor shell parses that URL and resolves the target app, server, and app route.
3. The iframe source may use a frontdoor-internal embed route, but that route is not public app contract.
4. App-internal route changes are synchronized to the outer browser URL through a shared shell bridge.
5. Back/forward navigation is owned by the shell and reflected into the embedded app.

This preserves durable platform chrome without sacrificing shareable app URLs.

---

## Embedded Boundary Model

The embedded boundary is same-origin and iframe-backed.

Design rules:

1. The iframe is a platform-owned container, not app-owned shell.
2. The shell remains visible if the app document fails to load.
3. Frontdoor can render loading, missing-install, and runtime-down states outside the iframe.
4. The app cannot remove, restyle, or destroy platform chrome.
5. The app still uses the canonical hosted runtime transport contract.

The iframe is a containment boundary, not a second product shell.

---

## Why Iframe Is Canonical

### Durability

- platform chrome becomes untouchable by app DOM mutations
- app CSS cannot collide with shell CSS
- shell survives app crashes and broken client routing

### Operational clarity

- shell-level loading and error states are straightforward
- shell can always offer app switch, server switch, and dashboard escape routes
- frontdoor can add shell behaviors without editing app bundles

### Product discipline

- apps stop depending on injected DOM side effects
- shell responsibilities and app responsibilities become explicit

---

## What Is Not Canonical

The following are not canonical target state:

- HTML injection of platform chrome into app documents
- assuming SPA navigations will "persist naturally" because the app will not touch top-level DOM
- multiple top-level browser entry surfaces for one app
- page-specific runtime transport clients copied into app HTML
- ad hoc shell/app coordination implemented separately by each app

---

## Shared Shell Bridge

The iframe model requires a shared shell bridge.

The canonical responsibilities of that bridge are:

- route synchronization between app and shell
- shell-directed navigation
- shell context exposure such as active server and app identity where required
- future shell capabilities that must cross the boundary intentionally

The bridge is platform-owned. First-party apps do not define their own shell
messaging contracts.

---

## Supersession

This document supersedes the old injection-based shell model in:

- `_archive/FRONTDOOR_APP_FRAME_AND_DOCK_2026-03-02.md`

That document remains historical reference only.
