# Frontdoor Prod Signup And Runtime Platform Failures

## Customer Experience

The intended customer experience is:

1. A new user signs up once and gets a usable account.
2. If Frontdoor provisions or maps a server for that account, signup does not fail with an internal error.
3. When the server reaches `running`, Frontdoor can determine the runtime platform and install purchased apps.
4. A published app package like `console@1.0.0` can be purchased and installed without hidden control-plane/runtime contract mismatches.

The production failures observed during the operator-console end-to-end drill violate that contract in two distinct places:

1. Signup can return `500` with `UNIQUE constraint failed: frontdoor_servers.tenant_id`.
2. App install can fail with `server_runtime_platform_unavailable` even though the server is already `running`.

These are Frontdoor/control-plane issues. They are not caused by the `nex-operator-console` package contents once the package validates, releases, and publishes successfully.

## Observed Production Symptoms

### Signup failure

Observed API failure:

- `POST /api/auth/signup`
- response `500`
- error text included `UNIQUE constraint failed: frontdoor_servers.tenant_id`

Important nuance:

- the account still gets created
- subsequent login works
- so signup is partially succeeding and then failing during server mapping/provision side effects

### Install failure

Observed hosted install failure after successful publish:

- server status eventually becomes `running`
- app entitlement becomes `active`
- app install status becomes `failed`
- `last_error = server_runtime_platform_unavailable`
- purchase/install API returns `502`

This means publish and entitlement were fine. The failure occurs during server-side install planning before the tarball is actually selected and pushed into the runtime.

### Post-fix rerun result

After removing the signup upsert bug and adding authenticated runtime `/health`
probing, the production rerun changed the failure mode:

1. `POST /api/auth/signup` now returns `201`
2. real Hetzner server provisioning succeeds
3. Frontdoor callback marks the server `running`
4. install still fails with `server_runtime_platform_unavailable`

Direct production validation from `frontdoor-1` shows why:

1. Frontdoor now probes runtime `/health` with the correct bearer token
2. the hosted runtime responds `503`
3. response body is:
   - `{"status":"unhealthy","error":"nex_runtime_unavailable"}`

That means the original auth bug is fixed, but the install path is still too
coupled to live runtime readiness.

The platform metadata needed for package variant selection should not depend on
whether the runtime sidecar has finished booting.

## Exact Code Paths

### 1. Signup failure path

Signup handler:

- `frontdoor/src/server.ts`
- `POST /api/auth/signup`
- around `6204+`

Relevant behavior:

1. create user
2. create account
3. if a statically configured tenant exists, call `store.upsertServer(...)` using:
   - `serverId = tenant.id`
   - `tenantId = tenant.id`
   - `provider = local`
   - `status = running`
4. optionally auto-install `intent_app`

Server upsert implementation:

- `frontdoor/src/frontdoor-store.ts`
- `upsertServer()` around `1846+`

Important detail:

- SQL conflict target is only `ON CONFLICT(server_id)`
- `frontdoor_servers.tenant_id` is also unique
- so a row with the same `tenant_id` but a different `server_id` will still throw a uniqueness error

That is why signup can create the user/account and then die during server mapping.

### 2. Install failure path

Install path:

- `frontdoor/src/server.ts`
- `installAppOnServer()` around `4200+`

The failure sequence is:

1. confirm entitlement
2. fetch server
3. mint runtime bearer token
4. require `server.status === running`
5. call `resolveServerRuntimePlatform(server)`
6. if platform is null, mark install failed with `server_runtime_platform_unavailable`

Runtime platform resolution:

- `frontdoor/src/server.ts`
- `resolveServerRuntimePlatform()` around `3749+`

Current behavior:

1. if `server.runtimeOs` and `server.runtimeArch` are cached, use them
2. if loopback runtime, use local process platform
3. otherwise probe `${runtimeUrl}/health` with no auth
4. expect JSON body with `platform.os` and `platform.arch`
5. if response is non-200, missing fields, or fetch fails, return `null`

That means Frontdoor currently assumes runtime platform discovery is available through an unauthenticated direct `/health` probe.

## Why Production Broke

## A. Signup bug

This is a plain database/write-path bug.

The signup code is trying to attach the new account to the first configured tenant by blindly calling `upsertServer()`.

That is unsafe because:

1. `upsertServer()` only resolves conflicts on `server_id`
2. `tenant_id` is also unique
3. a pre-existing row with the same tenant but a different server id is enough to trigger a SQLite uniqueness failure

So the logical bug is:

- signup is doing server ownership/mapping work through the wrong write primitive

The fix is not “retry harder.”
The fix is to stop using a `server_id`-only upsert for a tuple that is also constrained by `tenant_id`.

## B. Install bug

This is a stale control-plane/runtime contract bug.

Frontdoor assumes:

1. it can determine runtime platform from direct `/health`
2. `/health` is readable without auth
3. `/health` contains `platform.os` and `platform.arch`

The hosted runtime model in `nex` explicitly contradicts that assumption.

Hosted runtime tests show:

- unauthenticated `GET /health` returns `401`
- authenticated `GET /health` returns `200`

See:

- `nex/src/nex/runtime-api/server.hosted-mode.e2e.test.ts`

So the likely production sequence is:

1. Frontdoor sees server `running`
2. Frontdoor probes runtime via direct private URL like `http://10.0.0.5:18789/health`
3. hosted runtime rejects the unauthenticated probe
4. Frontdoor gets non-200 and returns `null`
5. install aborts before variant resolution with `server_runtime_platform_unavailable`

This is why the package can validate, release, and publish correctly but still fail to install in hosted production.

## Supporting Evidence From The Codebase

### Hosted-mode auth expectation in Nex

- `nex/src/nex/runtime-api/server.hosted-mode.e2e.test.ts`
- unauthenticated `/health` => `401`
- authenticated `/health` => `200`

### Frontdoor live-stack assumptions

- `frontdoor/src/server.test.ts`
- many tests model `/health` as directly readable without auth
- platform probing code does not attach bearer auth to `/health`

This mismatch explains why the bug can survive tests but still fail in production.

## Root Cause Summary

There are two independent bugs.

### Bug 1: Signup server-mapping bug

Root cause:

- `POST /api/auth/signup` uses `upsertServer()` with a write pattern that is incompatible with the unique `tenant_id` constraint.

Effect:

- signup can 500 after the account is already created.

### Bug 2: Hosted install platform-probe bug

Root cause:

- Frontdoor tries to resolve runtime platform using unauthenticated direct `/health`, but hosted Nex requires auth on `/health`.

Effect:

- app/adpater install planning fails early with `server_runtime_platform_unavailable` on otherwise healthy hosted servers.

## Hard-Cut Fix Plan

### Phase 1: Fix signup ownership write path

Required outcome:

- signup never calls a write primitive that can violate `frontdoor_servers.tenant_id` uniqueness during first-tenant mapping.

Recommended cut:

1. stop using `upsertServer()` for signup tenant mapping
2. stop implicitly reassigning or fabricating server ownership during password signup
3. password signup should:
   - create the user
   - create the account
   - create entitlement for `intent_app` when requested
   - create the session
   - only bind a server if the new account already has one
4. if `intent_app` is requested and the new account has no server:
   - redirect to dashboard provisioning flow when a provisioner exists
   - otherwise redirect to the default shell instead of `/app/<appId>/`
5. do not preserve the current ambiguous auto-upsert behavior

### Phase 2: Fix hosted runtime platform resolution

Required outcome:

- Frontdoor can resolve runtime `os/arch` for hosted servers using an authenticated control-plane/runtime path.

Recommended cut:

1. stop treating live runtime `/health` as the primary source of hosted platform metadata
2. for cloud-managed servers, derive platform from provisioning/provider metadata first
3. use authenticated runtime `/health` only as a fallback lane
4. cache `runtimeOs/runtimeArch` once the platform is resolved

Important note:

- the fix should align tests to the hosted auth model, not relax hosted runtime auth just to satisfy Frontdoor’s stale assumption
- the rerun proves that authenticated probing alone is not sufficient, because a
  server can be `running` while runtime `/health` still returns
  `nex_runtime_unavailable`

### Phase 2A: Immediate hard cut for managed servers

Required outcome:

- a Hetzner-managed server can resolve package target platform without waiting
  for runtime `/health` to become healthy

Recommended cut:

1. extend provider plan metadata to include architecture
2. for provider-managed servers with a known plan, resolve:
   - `os = linux`
   - `arch = <plan architecture>`
3. write `runtimeOs` / `runtimeArch` into the server row immediately when this
   metadata is resolved
4. leave authenticated runtime `/health` as fallback for non-provider flows or
   unknown plans

### Phase 3: Test coverage

Add tests for:

1. signup against an already-mapped tenant without uniqueness failure
2. hosted platform resolution when unauthenticated `/health` is rejected
3. install succeeding after authenticated platform resolution

## Validation Targets

A fix is complete only when all of the following are true:

1. `POST /api/auth/signup` does not 500 for a new account on a configured tenant
2. a hosted server can reach `running`
3. Frontdoor resolves runtime platform for that hosted server
4. `console@1.0.0` can be purchased and installed end-to-end
5. install status becomes `installed`, not `failed`

## Decision

This investigation does not support changing the `nex-operator-console` package.

The package path is already good enough.
The remaining failures are Frontdoor bugs:

1. one in signup/server mapping
2. one in hosted runtime platform discovery

## Post-Implementation Rerun

After implementing the Frontdoor fixes and redeploying `frontdoor.nexushub.sh`:

1. password signup now returns `201`
2. the tenant/server uniqueness failure is gone
3. managed hosted installs no longer fail at
   `server_runtime_platform_unavailable`
4. Frontdoor can now proceed far enough to reach the hosted runtime install API

### New remaining blocker

The next failure is outside Frontdoor.

Observed behavior:

1. `POST /api/apps/console/purchase` with `install: true` now fails with:
   - `runtime_install_failed`
   - detail: `runtime_install_api_404: Not Found`
2. direct probes from `frontdoor-1` to both hosted runtimes show:
   - `POST http://10.0.0.6:18789/api/operator/packages/install` -> `404 Not Found`
   - `POST http://10.0.0.5:18789/api/operator/packages/install` -> `404 Not Found`
3. this happens even with the correct per-server runtime bearer token
4. `POST /api/servers/:serverId/apps/console/install` also returns:
   - `400 system_app_install_not_allowed`
   - because Frontdoor explicitly blocks manual install of `console`

### Interpretation

This means:

1. the original Frontdoor bugs are fixed
2. the current hosted Nex image/runtime lane does not expose the package
   operator install route Frontdoor expects
3. both managed servers tested behave the same way, which strongly suggests a
   hosted runtime image/snapshot mismatch rather than a console-package bug

### Next hard cut

The next fix belongs in the hosted Nex image/runtime lane:

1. ensure the golden image being provisioned includes runtime support for:
   - `/api/operator/packages/install`
   - `/api/operator/packages/upgrade`
   - `/api/operator/packages/uninstall`
2. reprovision a fresh hosted server after the image/runtime lane is corrected
3. rerun the published console purchase/install drill end to end

## Final Resolution

The final production result is green after the hosted image refresh and hosted
bootstrap/auth hard cut.

### What was actually wrong

There were three stacked stale assumptions:

1. password signup still mutated server rows as if `server_id == tenant_id`
2. Frontdoor still treated hosted runtime platform discovery like an
   unauthenticated `/health` probe problem
3. newly provisioned hosted servers were still booting an old runtime/bootstrap
   contract that did not match current Frontdoor trusted-token runtime proxying

So the break was not caused by the `console` app package itself.
It was old hosted deployment state meeting newer control-plane behavior.

### Production proof after the fixes

Fresh production run:

1. `POST /api/auth/signup` returns `201`
2. Frontdoor provisions a new Hetzner server successfully
3. cloud-init configures hosted runtime auth as:
   - `runtime.hostedMode = true`
   - `runtime.auth.mode = "trusted_token"`
4. provision callback succeeds automatically
5. Frontdoor auto-installs `console@1.0.0`
6. Frontdoor runtime probe succeeds
7. `/app/console/chat` returns `200`

Observed healthy server:

- Frontdoor server id: `srv-18be8c3b-995`
- tenant id: `t-db10c8a2-f61`

Observed healthy app state:

1. `GET /api/servers/srv-18be8c3b-995/apps`
   - `console.install_status = "installed"`
   - `console.launchable = true`
   - `console.blocked_reason = null`
2. `GET /runtime/api/apps?server_id=srv-18be8c3b-995`
   - `200`
3. `HEAD /app/console/chat`
   - `200`

### Long-term decision that remains correct

The right long-term model is still:

1. signup creates identity/account, not fake server mappings
2. managed hosted platform metadata comes from provider/provisioning truth first
3. hosted Nex runs on trusted-token auth, not legacy shared-token auth
4. Frontdoor and hosted Nex use one auth model for package operations and
   runtime proxying
