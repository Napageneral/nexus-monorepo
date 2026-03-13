# Spike Downstream API And SDK Contract

**Status:** CANONICAL  
**Last Updated:** 2026-03-12

---

## Purpose

This document defines the canonical downstream contract for building on Spike
as a Nex app dependency.

Its main downstream customer right now is Dispatch, but the contract is not
Dispatch-specific. It defines:

1. what part of the Spike app surface is stable for downstream product use
2. how Spike should publish machine-readable contracts
3. how a Spike SDK should relate to the published app API
4. what convenience belongs in real Spike methods versus client-side helper
   code

---

## Customer Experience

The downstream package author experience should be obvious:

1. install Spike as a normal app dependency
2. look up the canonical Spike app API contract in one place
3. call stable `spike.*` methods through the generated Nex SDK or a generated
   Spike SDK
4. avoid guessing which Spike methods are product-facing versus internal or
   transitional

Dispatch should not need to scrape Spike internals or vendor Spike-specific
client glue to use repo mirrors, worktrees, and code context.

---

## Core Rules

1. Spike is an app dependency, not a private library linked into Dispatch
2. the canonical downstream contract is the Spike app API, not Go internals
3. published OpenAPI is a generated artifact, not handwritten source of truth
4. a Spike SDK is optional convenience over published Spike methods
5. the SDK must not add hidden capabilities beyond published methods
6. if downstream apps need a one-call behavior, Spike should publish a real
   method for it rather than hiding orchestration in SDK helper code

---

## Contract Publication Model

Spike should publish an App API OpenAPI artifact under the canonical contracts
tree:

- `contracts/apps/spike/openapi.yaml`
- `contracts/apps/spike/openapi.lock.json`

This follows the platform contract rules in:

- [OpenAPI Contract Artifact Model](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/openapi-contract-artifact-model.md)
- [Runtime API and Transport Surfaces](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/foundations/runtime-api-and-transport-surfaces.md)
- [Generated SDKs And Shared Package Kit](/Users/tyler/nexus/home/projects/nexus/nex/docs/specs/platform/generated-sdks-and-shared-package-kit.md)

The OpenAPI artifact is a projection of the Spike app method contract.

It is not a second source of truth.

---

## SDK Model

Spike may publish an optional generated Spike SDK for its app methods.

The intended shape is:

- generated from `contracts/apps/spike/openapi.yaml`
- thin typed wrappers over published `spike.*` methods
- usable by downstream app UIs and services such as Dispatch

The SDK must remain a thin contract wrapper.

It may provide:

- typed request and response models
- per-method clients
- transport setup and auth wiring
- stable naming and autocomplete

It must not provide hidden orchestration behavior that is unavailable as a real
Spike app method.

If downstream consumers need a single operation like "hydrate repo context",
Spike should expose a real `spike.*` method for that behavior.

The SDK should then wrap that method directly.

---

## Stable Downstream Method Families

The following Spike method families are stable downstream contract candidates.

### Repository discovery

- `spike.repositories.list`
- `spike.repositories.get`
- `spike.repo-refs.list`
- `spike.repo-refs.get`

Purpose:

- let downstream apps surface connected repositories, refs, and immutable
  commit identity in a GUI
- support repo-binding and branch/ref selection

### Mirror lifecycle

- `spike.mirrors.ensure`
- `spike.mirrors.refresh`
- `spike.mirrors.status`
- `spike.mirrors.list`

Purpose:

- ensure local clone substrate exists
- refresh repo state deterministically
- inspect mirror readiness and filesystem identity

### Worktree lifecycle

- `spike.worktrees.create`
- `spike.worktrees.list`
- `spike.worktrees.destroy`

Purpose:

- create or reuse isolated pinned worktrees for worker execution
- inspect and clean up worktree state

### Code context and intelligence

- `spike.code.build`
- `spike.code.status`
- `spike.code.search`
- `spike.code.symbols`
- `spike.code.references`
- `spike.code.callers`
- `spike.code.callees`
- `spike.code.imports`
- `spike.code.importers`
- `spike.code.context`
- `spike.code.tests.impact`
- `spike.code.source.file`
- `spike.code.source.chunk`

Purpose:

- build and inspect repo intelligence over a specific root
- give managers and workers code-aware context without direct internal access

---

## Non-Contract Or Lower-Priority Families

The following Spike families should not be the first downstream SDK focus.

### Spike jobs

- `spike.jobs.*`

These are product introspection surfaces, not the primary downstream
composition contract for Dispatch.

### Connector and setup residue

- `spike.connectors.github.*`
- `spike.github.installations.*`
- `spike.config.*`

These may remain valid product methods, but they are not the core repo-context
contract Dispatch should be built around.

If they survive long term, they should be reviewed separately rather than
bundled into the first downstream SDK cut.

---

## Recommended Downstream Profiles

Spike should document stable downstream method profiles rather than forcing
every consumer to discover the full app surface ad hoc.

### Profile 1: Repo Binding

Used by product UIs such as Dispatch configuration screens.

Minimum methods:

- `spike.repositories.list`
- `spike.repositories.get`
- `spike.repo-refs.list`
- `spike.repo-refs.get`

### Profile 2: Repo Hydration

Used by orchestration systems that need an isolated local repo substrate.

Minimum methods:

- `spike.mirrors.ensure`
- `spike.worktrees.create`

Optional:

- `spike.mirrors.refresh`
- `spike.worktrees.destroy`

### Profile 3: Code Context

Used by manager and worker agents to understand a hydrated repository.

Minimum methods:

- `spike.code.build`
- `spike.code.context`
- `spike.code.search`
- `spike.code.symbols`

Optional:

- references and call graph methods
- imports/importers
- test impact
- source file and chunk fetches

---

## Repo Hydration Decision

Downstream consumers like Dispatch will likely want a single-step "hydrate repo
context" behavior.

That should not be implemented as hidden client-side SDK orchestration.

There are two acceptable models:

1. explicit composition by the downstream app using:
   - `spike.mirrors.ensure`
   - `spike.worktrees.create`
   - optionally `spike.code.build`
2. a future Spike-published method such as `spike.hydrate`

The second option is cleaner if many downstream apps need the same behavior.

But the key rule remains:

If the one-call behavior is canonical, it must be a real Spike method.

---

## Response Shape Direction

Spike downstream methods should return domain-shaped payloads with stable keys
instead of mixed ad hoc wrappers.

Examples of preferred shape:

- `repository`
- `repositories`
- `repo_ref`
- `repo_refs`
- `mirror`
- `mirrors`
- `worktree`
- `worktrees`
- `snapshot`

Mixed generic keys like `items` are tolerable in current implementation but are
not the ideal long-term public contract for app SDK generation.

This should be cleaned as part of the Spike contract hardening pass.

---

## Dispatch-Specific Expectations

Dispatch should depend on Spike through the published app contract only.

Dispatch should use Spike for:

1. repo selection and ref discovery in the GUI
2. deterministic mirror creation
3. isolated worktree creation
4. code intelligence build and lookup

Dispatch should not:

1. call Spike storage directly
2. assume Spike filesystem layouts
3. depend on Spike service-internal Go packages
4. treat ad hoc handler payloads as a private side contract

---

## Sandbox Boundary

Spike's current downstream contract is about repo substrate and code context.

Sandboxed execution, containers, and VMs are a separate concern.

If those become first-class long-term capabilities, they should be expressed as
either:

1. new canonical Spike app methods
2. a Nex-native sandbox primitive

They should not be implied by the existence of private or historical `eval`
code elsewhere in the workspace.

---

## Validation Requirements

This contract direction is complete when:

1. `contracts/apps/spike/openapi.yaml` exists and matches the published app
   method surface
2. a generated Spike SDK compiles against that artifact
3. downstream consumers can perform repo binding, repo hydration, and code
   context flows without private Spike knowledge
4. any canonical one-call hydration behavior is exposed as a real Spike method,
   not hidden in SDK-only orchestration
