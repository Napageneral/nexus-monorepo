# Spike Spec: Git Record Runtime E2E

> Canonical execution spec for proving the live Spike rebuild path from the
> Vrtly git runtime.

## Purpose

This spec closes the remaining proof gap between the validated git adapter
ingestion path and the Spike automatic rebuild path.

The customer-facing question is:

- when a git record exists in `nex` and `record.ingested` is emitted, does Spike
  automatically reconcile the repository into mirror, worktree, and code
  snapshot state?

## Customer Experience

The intended operator experience is:

1. the Vrtly runtime sees the local Spike app package
2. Spike is installed and active in that runtime
3. Spike seeds its own durable job and `record.ingested` subscription
4. a git `record.ingested` event reaches the runtime
5. Spike reacts automatically and creates local repository infrastructure
6. the operator can inspect the resulting job, mirror, worktree, and snapshot
   state with evidence

This should feel automatic. No manual mirror bootstrap and no direct platform
API calls from Spike.

## Scope

This execution spec covers:

- Vrtly runtime visibility of local apps through `NEXUS_APPS_DIR`
- live installation of the local Spike app package
- Spike hook-owned seeding of:
  - `spike.record_ingested_reconcile`
  - durable `record.ingested` subscription
- live execution of the reconcile job from a git `record.ingested` event
- verification of mirror, worktree, and code snapshot side effects

This spec does not expand the git adapter delivery surface.

## Canonical Paths

- Spike app package:
  `/Users/tyler/nexus/home/projects/nexus/apps/spike/app`
- Spike runtime hook:
  `/Users/tyler/nexus/home/projects/nexus/apps/spike/app/hooks/runtime-work.ts`
- Spike reconcile job:
  `/Users/tyler/nexus/home/projects/nexus/apps/spike/app/jobs/record-ingested-reconcile.ts`
- Vrtly runtime wrapper:
  `/Users/tyler/nexus/home/projects/vrtly/scripts/run-vrtly-git-runtime.sh`
- Vrtly runtime config:
  `/Users/tyler/nexus/home/projects/vrtly/meta/runtime/vrtly-git.nex.yaml`

## Preconditions

1. The git adapter has already been validated into `nex` records.
2. At least one non-comment git record already exists in the Vrtly runtime.
3. The Vrtly runtime exposes the local apps directory through `NEXUS_APPS_DIR`.

## Execution Plan

### Phase 1: Runtime app visibility

The Vrtly runtime must export:

`NEXUS_APPS_DIR=/Users/tyler/nexus/home/projects/nexus/apps/spike`

and:

`NEXUS_GIT_ADAPTER_STATE_DIR=/Users/tyler/nexus/home/projects/vrtly/meta/runtime/git-adapter-state`

This allows the control plane to discover the local Spike app package.
It also allows Spike to reuse the git adapter's private clone credentials during
automatic mirror reconciliation.

### Phase 2: Spike installation

Install the local Spike app package into the live Vrtly runtime using:

- `appId = "spike"`
- `packageRef = "/Users/tyler/nexus/home/projects/nexus/apps/spike/app"`

Expected result:

- Spike services start successfully
- Spike methods become callable

### Phase 3: Durable work seeding

After installation, Spike must ensure:

- job definition `spike.record_ingested_reconcile`
- durable subscription on `record.ingested`
- subscription match `{ "platform": "git" }`

### Phase 4: Live reconcile trigger

Use a real existing git record already present in the runtime and publish a
`record.ingested` event for that record ID.

The trigger record must be:

- `platform = "git"`
- not a PR comment
- carrying canonical `metadata.remote_url`

This intentionally isolates the final Spike gap:

- git adapter -> `nex` record persistence is already validated
- this pass proves `record.ingested` -> Spike automatic rebuild

### Phase 5: Side-effect verification

The pass is only complete if all of the following are true:

1. the reconcile job is queued and executed
2. `records.get` is called for the trigger record
3. `spike.mirrors.ensure` runs successfully
4. `spike.worktrees.create` returns a real worktree path
5. `spike.code.build` returns snapshot state
6. Spike persistence reflects the new mirror/worktree/index state

## Failure Conditions

The pass fails if any of the following are true:

- the Vrtly runtime cannot discover the local Spike app package
- Spike install fails because the app package is incomplete
- no durable `record.ingested` subscription exists after installation
- the reconcile job runs but fails on missing `metadata.remote_url`
- mirror, worktree, or code snapshot state is not created
