# OTT-002 Standalone Microfrontend Shell And Tooling Transplant

## Goal

Transplant the upstream shell, router, theme, and document-owned styling stack
into a standalone Nex-owned microfrontend.

## Why

The real upstream shell expects to own document-level CSS, layout, and routing.
That should be preserved instead of diluted into console-local scaffolding.

## Scope

- transplant the upstream app shell, root route, and layout providers
- transplant the upstream CSS and component-theme stack
- preserve the upstream sidebar layout, shell primitives, menus, dialogs,
  toasts, and command surfaces
- define the host-to-microfrontend mount contract for the embedded console tab

## Implementation Notes

- the microfrontend should own its own router and document-level styling
- the console host remains responsible only for outer-shell navigation and
  mount orchestration
- keep the upstream component and utility primitives close to their original
  structure to minimize drift

## Acceptance

- the standalone chat app visibly renders the upstream-derived shell
- the shell mounts inside the console without requiring the old custom UI
- upstream shell primitives are now the real rendering substrate

## Validation

- standalone app build and test pass
- host embed smoke proof

## Current Result

- the standalone Nex-owned microfrontend now builds and tests as its own app
  package under `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app`
- the app owns its router, document CSS, theme stack, toast providers, and
  upstream-derived shell primitives
- the console host now mounts that microfrontend through
  `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-console/app/src/console/components/chat-microfrontend-host.ts`
  without relying on the retired custom placeholder UI
- the runtime bridge is now first-class through the Nex `chat.*` request and
  stream surface rather than a local demo-only shell path
