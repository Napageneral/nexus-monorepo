# OCH-008 Global Chat Tab Mount And Host Integration

## Goal

Mount the forked operator chat microfrontend into the global operator console
`Chat` tab.

## Why

The product target is one global chat surface inside the existing operator
console, not an agent-detail-only view or a sidecar app.

## Scope

- add the global `Chat` tab route and nav contract
- mount the forked microfrontend into the console host
- provide host lifecycle and sizing management
- ensure the microfrontend is style-isolated within the console shell
- align console state handoff and runtime connection bootstrap

## Implementation Notes

- the top-level console nav already canonicalizes through `/app/console/chat`
  and should keep the existing `console` top-level route id rather than adding
  a second app tab
- the real console seam is inside:
  - `packages/apps/nex-operator-console/app/src/console/navigation.ts`
  - `packages/apps/nex-operator-console/app/src/console/render-app.ts`
- `render-app.ts` currently rewrites `chat` to `connectors`; that alias should
  be replaced with a real inner `chat` console page
- the recommended host seam is:
  - a new page wrapper under `src/console/pages`
  - a dedicated custom element host under `src/console/components`
  - a shadow-root mount for style isolation because the operator console host
    runs in light DOM
- legacy conversation query-parameter handling in:
  - `src/ui/app-settings.ts`
  - `src/ui/app-lifecycle.ts`
  - `src/ui/views/sessions.ts`
  must be cut over from `?conversation=` semantics to lane selection

## Acceptance

- the operator console exposes the global `Chat` tab as the canonical chat
  surface
- the forked chat UI mounts cleanly inside the host console
- the mount does not depend on agent-detail scoping or stock `t3code` server
  behavior

## Completion Notes

- `/chat` is now the canonical mounted route for the operator console Chat tab
- the inner console navigation now treats `chat` as a first-class page instead
  of rewriting it to `connectors`
- the console host now mounts the React microfrontend through a dedicated chat
  host component and page wrapper
- the host reuses the existing operator-console runtime connection through
  `RuntimeBrowserClient.request(...)` plus app-level runtime event fanout
- the mounted chat surface is isolated inside a shadow-root host so the forked
  CSS does not leak into the Lit console shell

## Validation

- `pnpm build`
- `pnpm exec vitest run src/ui/navigation.test.ts src/ui/navigation.browser.test.ts src/ui/app-settings.test.ts`
