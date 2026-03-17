# Hosted Runtime Trusted Token Bootstrap Hard Cut

## Customer Experience

The hosted customer path must be coherent end to end:

1. Frontdoor provisions a fresh hosted server.
2. The server boots a Nex runtime in true hosted mode.
3. Frontdoor runtime/app proxy requests are authorized with Frontdoor-issued trusted tokens.
4. Package install, app catalog, and `/runtime/*` browser proxying all operate against the same runtime auth model.
5. A fresh hosted `console` install both converges to `installed` and is launchable through Frontdoor without `runtime_unavailable` false negatives.

This is a hard cut.
Hosted Nex must stop booting in legacy shared-token mode.

## Research Findings

### The remaining failure is not the image binary anymore

After refreshing the Hetzner golden image to `367439854`, fresh hosted servers now contain a Nex runtime build with:

- `/api/operator/packages/install`
- `/api/operator/packages/upgrade`
- `/api/operator/packages/uninstall`

That fixed the previous `404` install failure.

### The real remaining mismatch is the bootstrap auth contract

The live hosted tenant bootstrap script on a fresh provisioned server still does this:

- writes `/opt/nex/config/nex.env`
- sets `NEXUS_RUNTIME_TOKEN=<shared token>`
- initializes `/opt/nex/state/config.json`
- patches:
  - `.runtime.auth.token = <shared token>`
  - `.runtime.bind = "lan"`
- starts runtime without hosted mode or trusted-token verifier config

Observed live script:

- `/opt/nex/bootstrap.sh` on provisioned tenants

Observed runtime env:

- `/opt/nex/config/nex.env`
- contains only `NEXUS_RUNTIME_TOKEN`, no hosted trusted-token verifier config

### Frontdoor is already using the newer hosted auth model

Frontdoor runtime/app proxying mints a Frontdoor JWT and forwards it upstream:

- `resolveRuntimeUpstreamBearerToken()` in `src/server.ts`
- `proxyRuntimeRequest()` in `src/server.ts`
- `probeRuntimeJsonEndpoint()` in `src/server.ts`

Canon and code both assume hosted runtime compatibility means:

- `runtime.hostedMode=true`
- `runtime.auth.mode=trusted_token`
- matching Frontdoor trusted-token issuer/secret

This is explicitly documented in:

- `README.md`
- Nex hosted runtime tests under `nex/src/api/server.hosted-mode.e2e.test.ts`

### Package install and browser proxy are currently split across two auth models

Package install currently still succeeds because the package operator path prefers the persisted per-server shared token:

- `mintPackageOperatorRuntimeBearerToken()` in `src/server.ts`

Current behavior:

1. if `server.runtimeAuthToken` exists, use that
2. otherwise mint a Frontdoor JWT

So today:

- package operator path uses legacy shared token
- runtime/app proxy path uses Frontdoor JWT

That split is the bug.

## Decision

Do not weaken Frontdoor JWT proxying.
Do not keep dual auth models for hosted runtimes.
Do not patch browser probing to use the shared token.

The correct hard cut is:

1. fresh hosted servers boot in real hosted trusted-token mode
2. Frontdoor package operator uses Frontdoor-issued trusted tokens for hosted servers
3. legacy shared runtime token stops being the normal hosted runtime auth contract

## Implementation Plan

### Phase 1: Frontdoor cloud-init/bootstrap cutover

1. Replace the old bootstrap contract emitted by `renderCloudInitScript()`.
2. Cloud-init must write a bootstrap script that configures Nex with:
   - `runtime.hostedMode = true`
   - `runtime.tenantId = <tenantId>`
   - `runtime.bind = "lan"`
   - `runtime.auth.mode = "trusted_token"`
   - trusted token issuer/secret matching Frontdoor runtime token config
3. Cloud-init bootstrap must stop configuring runtime shared-token auth as the primary hosted runtime mode.
4. Health waiting in bootstrap must stop depending on legacy unauthenticated/shared-token CLI assumptions.

### Phase 2: Frontdoor hosted operator token cutover

1. Hosted package install/upgrade/uninstall must stop preferring `server.runtimeAuthToken`.
2. For hosted/managed servers, Frontdoor must mint and use a trusted runtime JWT.
3. Local/configured tenant dev stacks may keep their current local token behavior.

### Phase 3: Deploy and reprovision

1. Rebuild Frontdoor.
2. Deploy Frontdoor to production.
3. Provision a fresh hosted server from the current image.
4. Verify fresh bootstrap produces hosted trusted-token runtime config.

### Phase 4: Validation

A successful cut requires all of the following on a freshly provisioned hosted server:

1. `/runtime/api/apps?server_id=<id>` returns `200` through Frontdoor with a valid session
2. `GET /api/servers/<id>/apps` reports:
   - `console.install_status = installed`
   - `console.launchable = true`
   - `console.blocked_reason = null`
3. `GET /app/console/chat` serves the console shell successfully
4. direct tenant `/api/apps` returns the installed console app
5. no fallback shared-token assumptions are needed for normal hosted browser/runtime behavior

## Final Validation

This cut is now green in production.

Fresh hosted provisioning after the Frontdoor/cloud-init redeploy proves the
new bootstrap contract is the one actually running on newly created tenants.

### Production proof

Observed fresh server:

- Frontdoor server id: `srv-18be8c3b-995`
- tenant id: `t-db10c8a2-f61`

Observed cloud-init/runtime state on that server:

1. `/var/lib/cloud/instance/user-data.txt` contains
   `/opt/nex/bootstrap-frontdoor.sh`
2. `/opt/nex/state/config.json` contains:
   - `runtime.hostedMode = true`
   - `runtime.auth.mode = "trusted_token"`
3. cloud-init logs show:
   - `Patched config.json with hosted trusted-token runtime config`
   - `Runtime is healthy after 3s`
   - `Provision callback successful (attempt 1)`
   - `Bootstrap complete`

Observed Frontdoor/runtime behavior:

1. Frontdoor logs:
   - `Server srv-18be8c3b-995 is running`
   - `Installing 1 app(s) on srv-18be8c3b-995: console`
   - `console@1.0.0 installed on srv-18be8c3b-995`
2. `GET /runtime/api/apps?server_id=srv-18be8c3b-995` returns `200`
3. `HEAD /app/console/chat` returns `200`
4. `GET /api/servers/srv-18be8c3b-995/apps` reports:
   - `console.install_status = "installed"`
   - `console.launchable = true`
   - `console.blocked_reason = null`

### What actually broke before

The confusing part was that production Frontdoor had already been redeployed
with the new trusted-token bootstrap code, but earlier tenants were still
coming up on the old path.

The real explanation was:

1. older tenants were provisioned from an old golden image
2. the first fresh trusted-token tenant still failed because the bootstrap
   health loop signed its JWT before exporting the env vars the signer needed
3. that made cloud-init die before the provision callback, which looked like a
   provisioning/runtime mismatch until directly inspected on-host

The final fix was exporting the bootstrap JWT env first, then signing and
probing `/health`.
