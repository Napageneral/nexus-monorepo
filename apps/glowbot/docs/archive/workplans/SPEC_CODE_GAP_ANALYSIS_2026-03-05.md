# GlowBot Spec-Code Gap Analysis

Date: 2026-03-05

## Purpose

This document maps the active target-state GlowBot specs to the current code in
`/Users/tyler/nexus/home/projects/nexus/apps/glowbot`.

It exists for two reasons:

1. keep the canonical specs clean and target-state only
2. make the current codebase understandable through the spec lens without
   pretending the implementation is already at the target state

This is a gap-analysis and code-index artifact, not a canonical product spec.

---

## Customer Experience Summary

The intended GlowBot customer experience described by the active specs is:

1. a clinic launches GlowBot through the hosted shell
2. the clinic connects shared integrations through runtime-owned connection
   flows
3. adapter data lands as elements
4. jobs and DAGs compute funnel intelligence, trends, drop-off analysis, and
   recommendations
5. GlowBot augments clinic-local intelligence with benchmark data from a shared
   hub service

The current codebase only partially reflects that experience:

1. clinic-facing methods and UI contracts exist
2. integration methods exist, but most mutation operations still depend on
   stubbed runtime adapter SDK methods
3. funnel, modeling, and recommendation outputs are still produced by an
   app-local SQLite pipeline store
4. the admin surface exists, but the benchmark/hub implementation is mostly
   placeholder

So the codebase still expresses the product shape, but it does so through a
legacy implementation path that the specs intentionally reject.

---

## Current Codebase Map

Important code surfaces in the real GlowBot app package:

- `consumer/`
  - app manifest and method handlers
  - install/activate/deactivate lifecycle hooks
  - legacy pipeline store and deterministic data derivation logic
- `admin/`
  - operator app manifest and placeholder admin method handlers
- `consumer-ui/`
  - Next.js browser UI and runtime RPC transport
- `shared/`
  - shared method constants and response contracts

Important repo drift not captured by the active specs:

- top-level `package.json` references `admin-ui` and `website` workspaces, but
  `admin-ui` does not exist and `website` is effectively empty
- `consumer-ui` is real and important for understanding the current code, but it
  is not represented in the active specs

This means the current specs are not yet a sufficient repo/package index for the
actual code layout, even though they are directionally correct on product shape.

---

## Spec Coverage Matrix

| Spec | Current code surfaces | Spec as useful code proxy? | Main gap |
|---|---|---|---|
| `ADAPTERS.md` | `consumer/app.nexus.json`, `consumer/methods/integrations*.ts`, `shared/constants.ts` | Partial | Product adapter set and auth story are modeled, but manifest/package details and runtime integration behavior still diverge materially |
| `DATA_PIPELINE.md` | `consumer/pipeline/*`, `consumer/hooks/install.ts`, `consumer/hooks/activate.ts`, `consumer/methods/{overview,funnel,modeling,agents*}.ts` | Partial | Business computation concepts map well, but implementation still runs through app-local SQLite rather than nex elements/jobs/DAGs |
| `CENTRAL_HUB.md` | `admin/*` | Low | Admin package exists, but shared hub/service package does not exist in the codebase yet |
| `LLM_SKILL.md` | `consumer/methods/agents.ts`, `consumer/methods/agents-recommendations.ts`, `consumer/pipeline/store.ts` | Partial | Recommendation and agent concepts exist, but current behavior is deterministic store-backed logic, not the SDK-backed skill/tool shape in the spec |
| `HIPAA_COMPLIANCE.md` and security specs | lifecycle hooks, local DB usage, adapter config handling | Partial | Operating constraints are useful, but implementation is still in a transitional local-storage model that the target state explicitly removes |

---

## Detailed Findings

### 1. Adapter Surface: Product Shape Mostly Present, Package Model Still Wrong

Relevant code:

- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/app.nexus.json`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/integrations.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/integrations-connect-oauth-start.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/integrations-connect-apikey.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/integrations-connect-upload.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/integrations-test.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/shared/constants.ts`
- `/Users/tyler/nexus/home/projects/nexus/nex/src/apps/context.ts`

What the specs model correctly:

- the important adapter set is represented in code
- Google is now modeled as a unified adapter in the app manifest
- integration methods exist at the clinic app boundary
- the app is clearly trying to rely on `ctx.nex.adapters.*` instead of directly
  shelling out from method handlers

Where the code diverges:

- the app manifest still uses `command` entries pointing at
  `../../../adapters/...` binaries instead of using `requires.adapters` plus
  app-visible adapter metadata
- Zenoti still requires `centerId` in the manifest, even though the target
  adapter model is auto-discovery
- `shared/constants.ts` still models split Google adapter identities
  (`google-ads`, `google-business-profile`) and does not include CallRail or
  Twilio
- `ctx.nex.adapters.list()` and `ctx.nex.adapters.onEvent()` are wired, but
  `connect`, `disconnect`, `test`, `backfill`, and `getHealth` are still stubs
  in the wired platform SDK path

Assessment:

- `ADAPTERS.md` is useful for understanding intended adapter domains and auth
  models
- it is not yet sufficient as a proxy for the actual current integration code
  unless this gap-analysis doc accompanies it

### 2. Data Pipeline: Business Modeling Is Strong, Runtime Modeling Is Far Ahead Of Code

Relevant code:

- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/pipeline/store.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/pipeline/funnel.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/pipeline/trends.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/pipeline/dropoffs.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/hooks/install.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/hooks/activate.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/overview.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/funnel.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/modeling.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/agents.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/agents-recommendations.ts`

What the specs model correctly:

- the major business concepts in the code are already represented in the target
  data model: raw metrics, funnel snapshots, trend deltas, drop-off analysis,
  recommendations
- the current code’s deterministic computations map cleanly onto the target DAG
  stages in conceptual terms
- the spec is a good proxy for what the pipeline is trying to compute

Where the code diverges:

- install still creates `glowbot.db` and legacy tables such as `metrics_daily`,
  `recommendations`, and `pipeline_runs`
- activation still does not start any scheduler or adapter subscriptions
- all clinic-facing read methods still read through `consumer/pipeline/store.ts`
- the current pipeline store uses an app-local SQLite ledger path
  (`glowbot-ledger.sqlite`) and app-local scheduler state
- none of the current consumer methods call `memory.elements.*`, `jobs.*`,
  `dags.*`, or `cron.*`

Assessment:

- `DATA_PIPELINE.md` is already the strongest active spec because it explains
  the business semantics of the current code well
- it is not a proxy for the current runtime architecture, because the runtime
  architecture in code is still the rejected local-store path

### 3. Central Hub: Spec Is Mostly Ahead Of Code

Relevant code:

- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/admin/app.nexus.json`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/admin/methods/benchmarks.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/admin/methods/clinics-list.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/admin/methods/credentials.ts`

What the specs model correctly:

- there should be a clean separation between clinic-facing app concerns,
  operator-facing admin concerns, and shared benchmark service concerns

Where the code diverges:

- there is no `glowbot-hub` shared service package in the real app tree
- the admin methods are placeholders and do not implement benchmark or support
  workflows
- the code does not yet embody the hosted package roles described in the spec

Assessment:

- `CENTRAL_HUB.md` is useful as target-state architecture
- it is not yet an index to real implementation because the code surface is
  mostly absent

### 4. Intelligence Layer: Concepts Exist, Tooling Does Not

Relevant code:

- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/agents.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/methods/agents-recommendations.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer/pipeline/store.ts`

What the specs model correctly:

- the product already thinks in terms of recommendation categories and agent-like
  outputs
- recommendation ranking, category grouping, and reasoning fields all exist in
  the current store-backed implementation

Where the code diverges:

- there is no dedicated skill/tool package in the app tree
- there is no `memory.elements.list`-backed query path for the recommendation
  surface today
- current recommendation generation is deterministic SQLite-backed logic, not
  the target skill/tool architecture

Assessment:

- `LLM_SKILL.md` is useful as a forward contract for the intelligence layer
- it is not a close proxy for the current code yet

### 5. Shared Contracts: Important Code Model Not Captured By Current Specs

Relevant code:

- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/shared/types.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer-ui/src/lib/glowbot.ts`
- `/Users/tyler/nexus/home/projects/nexus/apps/glowbot/consumer-ui/src/lib/nex-client.ts`

What is important:

- `shared/types.ts` is the current source of truth for RPC method names and
  payload contracts across the app packages
- `consumer-ui` contains the actual browser transport assumptions for talking to
  the runtime

Current documentation gap:

- the active specs do not currently explain the repo-local package map or point
  readers at `shared/types.ts` as the current implementation contract surface
- this makes the specs weaker as an index/proxy for the current codebase than
  they need to be

Assessment:

- this is the biggest documentation gap that is not just implementation drift
- the active docs need a separate codebase/package index artifact rather than
  more current-state residue inside the target-state specs

---

## Key Drift To Surface Explicitly

These are the implementation drifts that matter most:

1. package model drift
   - specs assume `requires.adapters` and `requires.services`
   - code still uses app-local manifest `command` fields for adapters

2. integration runtime drift
   - clinic integration methods exist
   - runtime mutation methods they depend on are still stubs

3. pipeline architecture drift
   - specs assume nex elements/jobs/DAGs/cron
   - code still runs through app-local SQLite pipeline code

4. hub/service drift
   - specs assume a shared `glowbot-hub` package
   - code only has an admin app shell with placeholder methods

5. contract/index drift
   - code relies heavily on `shared/types.ts` and `consumer-ui`
   - active specs do not yet orient readers around those package boundaries

---

## Recommended Follow-On

The next documentation step should be:

1. add a repo/package index artifact for `apps/glowbot`
2. refresh `WORKPLAN.md` from this gap inventory rather than from the old
   standalone assumptions
3. refresh `VALIDATION_LADDER.md` against the real package layout and current
   Nexus capability names

Do not solve the spec/code mismatch by pushing legacy implementation detail back
into the target-state specs. Keep the target-state specs clean and track drift in
gap/workplan artifacts.
