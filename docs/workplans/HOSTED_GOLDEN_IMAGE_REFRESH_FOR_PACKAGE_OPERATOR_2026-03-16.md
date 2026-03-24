# Hosted Golden Image Refresh For Package Operator

## Customer Experience

The hosted customer path must be:

1. Frontdoor provisions a server from the golden snapshot.
2. The server boots a hosted Nex runtime that exposes the canonical package operator API.
3. Frontdoor purchases and installs a published app package without special-case runtime handling.
4. The install converges to `installed` on a fresh hosted tenant.

This is a hard cut. The golden image must stop shipping the pre-package-operator Nex runtime.

## Research Findings

### Current snapshot in production

Frontdoor production is pinned to:

- Hetzner snapshot `363939957`
- description: `nex-golden-v4-apps-api`

Source:

- `/etc/nexus-frontdoor/frontdoor.env` on `frontdoor.nexushub.sh`
- `HETZNER_SNAPSHOT_ID=363939957`

### Current hosted runtime on provisioned tenants

Fresh hosted tenants created from that snapshot run:

- systemd unit: `nex-runtime.service`
- working dir: `/opt/nex/runtime`
- exec: `/usr/bin/node /opt/nex/runtime/dist/index.js start --port 18789`

The runtime tree on the tenant is stale:

1. `package.json` reports `nexus@2026.2.6-3`
2. it still contains legacy surfaces such as:
   - `extensions/`
   - `./extensions-api`
   - `ui:*` scripts
   - old mobile scripts
3. tenant logs still show old app boot behavior such as:
   - `control UI assets not found (auto-build disabled)`
   - old `glowbot` app discovery on `/opt/nex/apps/glowbot`

### Missing route proof

On the provisioned tenant runtime tree:

- `rg '/api/operator/packages/install|upgrade|uninstall' /opt/nex/runtime/dist`
- returns no matches

Direct runtime probes from `frontdoor-1` confirm:

- `POST http://10.0.0.6:18789/api/operator/packages/install` -> `404 Not Found`
- `POST http://10.0.0.5:18789/api/operator/packages/install` -> `404 Not Found`

So the image does not contain the package-operator runtime surface Frontdoor now expects.

### Current Nex build state

The current local Nex build does include the package operator routes:

- `src/nex/runtime-api/http-runtime-api-routes.ts`
- `dist/server-methods-*.js`

That means the runtime contract exists in current Nex and the failure is strictly image staleness.

## Decision

Do not patch around this in Frontdoor.
Do not weaken the install path.
Do not reintroduce legacy hosted app-only install semantics.

The correct fix is to replace the golden image with a current Nex runtime tree that includes:

- `POST /api/operator/packages/install`
- `POST /api/operator/packages/upgrade`
- `POST /api/operator/packages/uninstall`

## Implementation Plan

### Phase 1: Refresh a tenant runtime tree

1. Build the current Nex runtime from the local source checkout.
2. Package the runtime tree with a complete dependency surface.
3. Deploy that runtime tree onto a hosted tenant VM.
4. Preserve rollback by backing up the existing `/opt/nex/runtime` first.
5. Restart `nex-runtime.service`.
6. Verify the refreshed tenant exposes the package-operator routes.

### Phase 2: Snapshot the refreshed tenant

1. Create a new named Hetzner snapshot from the refreshed tenant VM.
2. Record the snapshot id and description.
3. Treat that snapshot as the new golden image.

### Phase 3: Repoint Frontdoor

1. Update production `HETZNER_SNAPSHOT_ID` to the new snapshot id.
2. Restart `nexus-frontdoor`.
3. Confirm new provisioning uses the refreshed snapshot.

### Phase 4: Reprovision and validate

1. Provision a fresh hosted tenant from the new snapshot.
2. Verify runtime package operator routes on that fresh tenant.
3. Rerun the published `console` purchase/install drill.
4. Confirm install converges to `installed`.

## Validation Targets

A successful cut requires all of the following:

1. refreshed tenant runtime responds on:
   - `/api/operator/packages/install`
   - `/api/operator/packages/upgrade`
   - `/api/operator/packages/uninstall`
2. new snapshot is created from the refreshed tenant
3. Frontdoor production points at the new snapshot id
4. a freshly provisioned tenant is created from that snapshot
5. published `console` purchase/install succeeds end to end on the fresh tenant

## Final Validation

This cut is complete.

### New production image

Production Frontdoor now provisions from:

- Hetzner snapshot `367439854`
- description: `nex-golden-v5-package-operator`

### What changed materially

Fresh servers from that image now expose the hosted runtime package operator
surface Frontdoor expects:

1. `POST /api/operator/packages/install`
2. `POST /api/operator/packages/upgrade`
3. `POST /api/operator/packages/uninstall`

This removed the earlier hosted failure:

- `runtime_install_api_404: Not Found`

### End-to-end proof

Fresh server provisioned from the new image:

- Frontdoor server id: `srv-18be8c3b-995`
- tenant id: `t-db10c8a2-f61`

Observed result:

1. server reached `running`
2. Frontdoor auto-installed published `console@1.0.0`
3. `GET /runtime/api/apps?server_id=srv-18be8c3b-995` returned `200`
4. `HEAD /app/console/chat` returned `200`
5. `GET /api/servers/srv-18be8c3b-995/apps` reported:
   - `console.install_status = "installed"`
   - `console.launchable = true`
   - `console.blocked_reason = null`

### Long-term decision that remains correct

The golden image is not allowed to lag the current hosted package/runtime
contract anymore.

Frontdoor and the hosted image must move together whenever:

1. package operator runtime routes change
2. hosted runtime auth/bootstrap changes
3. staging path or package install contract changes
