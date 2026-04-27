# Operator Chat t3code Upstream Fork

**Status:** CANONICAL
**Last Updated:** 2026-04-27
**Related:** [Operator Chat Taxonomy](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-taxonomy.md), [Operator Chat Runtime Contract](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-runtime-contract.md), [Operator Chat Surface And Agent Lanes](/Users/tyler/nexus/home/projects/nexus/docs/specs/operator-chat-surface-and-agent-lanes.md), [Spec-Driven Development Workflow](/Users/tyler/nexus/home/projects/nexus/docs/spec-driven-development-workflow.md)

---

## Purpose

This document defines the canonical UI strategy for the Nex operator chat
surface.

The target state is a true Nex-owned fork of upstream
`/Users/tyler/nexus/home/projects/t3code/apps/web`, not a loose visual
imitation and not a custom rewrite that merely borrows upstream patterns.

The goal is simple:

- keep as much upstream `t3code` UI, route structure, interaction behavior,
  and component composition intact as possible
- patch Nex integration into a small number of explicit seams
- preserve identical upstream behavior and appearance everywhere that remains
  truthful for the Nex chat product

Nex remains the runtime and product authority.
The forked `t3code` web app becomes the canonical operator chat microfrontend.

## Canonical Fork Definition

For operator chat, a true upstream fork means:

- `packages/apps/nex-operator-chat/app` is structurally rooted in upstream
  `apps/web`
- upstream file paths, route layout, package wiring, and component ownership
  stay recognizable
- unchanged files should remain byte-identical where Nex does not need to
  intervene
- local modifications should be concentrated in a narrow patch layer rather
  than spread across the entire shell

The default engineering posture is:

- copy upstream first
- patch second
- delete only when a surface is genuinely incompatible with the Nex product

## Upstream-First Principles

The fork follows these rules:

- upstream behavior parity is the default
- upstream route and shell ownership are preserved unless Nex requires a
  deliberate deviation
- Nex-specific behavior belongs in explicit adapter seams, not incidental
  shell rewrites
- UI parity is judged by real upstream comparison, not by intent
- unsupported product surfaces are removed with minimal collateral edits
- no Nex canonical schema gains any `kind` field

## Microfrontend Boundary

The operator chat client is a standalone Nex-owned microfrontend.

That microfrontend owns:

- its document-level CSS and theme stack
- its router and in-app navigation state
- its upstream-derived component tree
- its presentation-state assembly above Nex runtime data

The console host owns:

- the global console navigation and top shell
- microfrontend mount and lifecycle
- runtime connection handoff
- operator authentication and environment context

The preferred implementation remains a true embedded microfrontend surface, so
the upstream app can stay coherent rather than being decomposed into host-owned
fragments.

## Package Baseline

`packages/apps/nex-operator-chat/app` should stay as close as practical to the
upstream `apps/web` package:

- align `package.json` dependencies and scripts to upstream by default
- preserve upstream route files and app entry files by default
- preserve upstream shell primitives by default
- preserve upstream tests where they still apply

The fork must track provenance:

- upstream repository path
- pinned upstream commit
- local fork commit or workspace state when applicable
- explicit list of Nex-owned patch seams

The fork baseline also includes the upstream support shape expected by the web
app.

That means the operator-chat fork must either preserve or truthfully vendor the
upstream equivalents of:

- contracts consumed by the web app
- shared helpers consumed by the web app
- generated route tree and router wiring
- test harness and package-level toolchain assumptions

The goal is not merely to copy visible React components.
The goal is to preserve the app substrate that makes those components behave
like upstream.

## Route Model

The route model should preserve upstream structure as closely as practical.

That means:

- preserve a root route shell analogous to upstream `__root.tsx`
- preserve a chat layout route analogous to upstream `_chat.tsx`
- preserve a clean index route for `/chat`
- preserve a selected-conversation route analogous to the upstream thread route

For Nex, the selected route noun becomes lane identity rather than thread
identity.

The important behavioral rule is:

- `/chat` stays clean and represents the empty or default chat workspace state
- a lane identifier only appears in the route after explicit selection or a
  true deep link

The route must not auto-leak the implicit default lane into the URL merely
because the runtime selected a default lane.

## Presentation Model Remap

The fork preserves upstream visual grammar while rebinding the nouns.

### Project group becomes top-level agent group

The upstream project group is reinterpreted as the top-level directly-chatable
agent grouping object.

Usually that is a manager agent.

### Thread row becomes lane row

The upstream thread row is reinterpreted as a lane row.

Lane rows preserve the same visual role:

- selectable conversation row
- title and preview
- timestamp
- state badge
- active and unread treatment

### Nested worker visibility

The direct manager lane remains the primary visible lane for most operators.

Worker and subagent lanes remain tucked under the top-level agent group and
require explicit expansion.

## Nex Patch Seams

The patch seams should stay small and explicit.

### 1. Runtime bridge seam

Replace upstream `nativeApi` and websocket runtime ownership with a Nex-native
bridge.

This seam owns:

- `chat.snapshot`
- `chat.replay`
- `chat.send`
- `chat.abort`
- `chat.approvals.respond`
- `chat.delivery.select`
- lane-action methods

The runtime bridge is the place where the fork stops being stock upstream.

It replaces:

- upstream websocket client ownership
- upstream lifecycle welcome/bootstrap expectations
- upstream orchestration snapshot/replay ownership

It preserves:

- the shell-facing shape expected by the preserved forked app wherever
  practical
- reconnect, replay, and state-recovery behavior expected by the upstream UI

### 2. Read-model adapter seam

Map Nex `chat.*` state into the fork-local view model needed by preserved
upstream shell components.

This seam owns:

- agent-group and lane-row summaries
- selected lane detail hydration
- approval state
- linked public conversation context
- lane-action data

The read-model adapter should prefer translation over reauthoring.

That means:

- translate Nex lane identity into the identifiers the upstream shell consumes
- translate Nex chat snapshot and replay data into fork-local store updates
- avoid replacing the entire upstream store or route model unless that is the
  only honest path

### 3. Feature-policy seam

Centralize unsupported-surface policy rather than scattering one-off UI edits.

This seam decides whether the shell exposes:

- IDE open controls
- git and PR controls
- worktree controls
- terminal controls
- diff and checkpoint controls

The Nex operator chat product does not surface those today, so the fork should
remove or disable them through a narrow policy layer instead of broad shell
rewrites.

### 4. Identifier and route translation seam

Keep lane identity and route translation isolated.

This seam owns:

- lane id to selected-route translation
- default lane behavior
- deep-link semantics
- worker-lane selection and expansion behavior

The preferred compatibility pattern is:

- reuse the upstream selected-thread route slot for lane identity
- keep `/chat` clean
- treat direct manager lanes as the default visible conversation for a group
- only expose worker lanes after explicit expansion or explicit deep link

## Compatibility Mapping

The fork should use a truthful compatibility mapping instead of ad hoc local
UI state.

### Upstream thread identity

The upstream selected thread identity is reinterpreted as the selected lane
identity.

The route, store, and selection model may still use a `threadId`-shaped slot
internally when that preserves upstream behavior, but that slot now carries a
Nex lane identifier.

### Upstream project identity

The upstream project identity is reinterpreted as the top-level directly
chatable agent group identity.

That group usually corresponds to:

- one manager agent
- one directly chatable assistant
- or another top-level operator-facing agent

### Upstream thread timeline

The upstream thread transcript is reinterpreted as the selected Nex lane
workspace timeline.

Its primary backing source is:

- session-ledger-backed lane detail from Nex

Its auxiliary context source is:

- linked public conversation context from Nex

### Upstream project scripts

The upstream project-script surface is reinterpreted as the lane-action
surface.

The visual shell should remain as close to upstream as practical.
The backing semantics become Nex `chat.actions.*`.

## Required Upstream Preservation Areas

The following files or file families should remain close to upstream unless a
patch seam explicitly requires change:

- route files under `src/routes/`
- `src/router.ts`
- `src/main.tsx`
- `src/components/Sidebar.tsx`
- `src/components/ChatView.tsx`
- `src/components/chat/*`
- `src/components/ui/*`
- `src/index.css`

When a file in one of those areas changes for Nex, the change should be
documented as one of:

- bridge integration
- read-model translation
- feature gating
- identifier translation

Not “custom shell cleanup.”

## Fork Boundary

The Nex-owned fork is rooted in upstream t3code `apps/web` commit
`28e481eb24dc7e790b6d1ea963f20024b6a2bbc4`.

The preserved upstream package copy lives at:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/upstream-apps-web`

The active fork lives at:

- `/Users/tyler/nexus/home/projects/nexus/packages/apps/nex-operator-chat/app`

The fork boundary is intentionally narrow:

- no upstream `src` files are removed
- Nex-owned files are additive where possible
- modified upstream files are limited to route ownership, runtime bridge
  handoff, sidebar/lane remap, chat workspace remap, action controls,
  feature-policy gating, and embedded mount behavior
- unsupported t3code product surfaces are gated or hidden through the
  feature-policy seam rather than broad shell rewrites

## Surfaces To Preserve Intact Whenever Possible

Preserve upstream behavior and appearance with minimal or no changes for:

- app shell and router structure
- sidebar shell and row behavior
- chat workspace shell
- transcript rendering
- composer shell
- provider and model picker shell
- send and stop action treatment
- action menu shell
- menus, dialogs, toasts, tooltips, sheets, and popovers
- scroll-area and viewport-fit behavior

## Surfaces To Remove Or Gate

The following upstream product surfaces are not canonical operator-chat nouns
and should not survive as first-class product features:

- git branch and worktree controls
- diff and checkpoint panels
- terminal drawer
- pull request controls
- IDE-open affordances

They may remain in vendored source temporarily while the fork reset is in
progress, but the target-state shell does not expose them to operators.

## Layout And Viewport Rules

The fork must inherit upstream fit and scroll behavior as much as possible.

Nex-specific additions must not degrade the shell by default.

That means:

- the base chat workspace should feel like upstream before Nex-only context is
  added
- no always-open Nex-specific side rail should be treated as part of the
  canonical baseline
- linked public context and similar Nex-only detail belong in explicit
  auxiliary surfaces, not mandatory layout chrome

## Validation Standard

Validation for this fork is not merely “the page renders.”

The canonical proof must establish:

- provenance against a pinned upstream commit
- a truthful list of vendored files and modified patch seams
- side-by-side operator review against current upstream behavior
- cleanroom proof of the embedded Nex-backed surface
- confirmation that preserved upstream surfaces still behave visually and
  interaction-wise like upstream

The proof corpus should explicitly answer:

- which upstream commit is the fork based on
- which files remain identical
- which files differ and why
- whether route behavior matches upstream where product nouns still overlap
- whether the embedded Nex-backed shell remains visually and interaction-wise
  consistent with upstream expectations

## Success Criteria

The operator chat fork is only at the intended state when all of the following
are true:

- `nex-operator-chat` is recognizably rooted in upstream `apps/web`
- the main shell files are preserved rather than locally reauthored
- Nex integration is concentrated in thin seams
- the embedded UI feels and behaves like `t3code` everywhere the product nouns
  still overlap
- unsupported product surfaces are removed cleanly without broad shell drift
