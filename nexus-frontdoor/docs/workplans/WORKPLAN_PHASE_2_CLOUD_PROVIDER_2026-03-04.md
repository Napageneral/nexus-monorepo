# Phase 2: Cloud Provider Abstraction

**Status:** NOT STARTED
**Last Updated:** 2026-03-04
**Depends On:** Phase 1 (schema must exist for server records)
**Enables:** Phase 3 (provisioning flow uses the provider)
**Specs:** [CLOUD_PROVISIONING_ARCHITECTURE §3, §4](../specs/CLOUD_PROVISIONING_ARCHITECTURE_2026-03-04.md)

---

## Goal

Implement the `CloudProvider` interface and `HetznerProvider` class. This is the abstraction layer that creates and destroys real Hetzner Cloud VPSes.

---

## Current State

No cloud provider code exists. All provisioning is local (spawning processes on the same VPS via `provision-tenant-local.mjs`).

---

## Tasks

### 2.1 — Create `src/cloud-provider.ts`

New file containing the interface and Hetzner implementation.

**CloudProvider interface** (from spec §3.1):

```typescript
export interface CloudProvider {
  readonly name: string;
  createServer(opts: CreateServerOpts): Promise<CreateServerResult>;
  getServerStatus(providerServerId: string): Promise<ProviderServerStatus>;
  destroyServer(providerServerId: string): Promise<void>;
  listPlans(): ServerPlan[];
}

export interface CreateServerOpts {
  tenantId: string;
  plan: string;
  userData: string;
  networkId: string;
  firewallId: string;
  sshKeyIds: string[];
  labels?: Record<string, string>;
}

export interface CreateServerResult {
  providerServerId: string;
  publicIp?: string;
  privateIp?: string;
}

export interface ProviderServerStatus {
  state: "creating" | "running" | "stopped" | "deleting" | "error";
  publicIp?: string;
  privateIp?: string;
  error?: string;
}

export interface ServerPlan {
  id: string;
  displayName: string;
  monthlyCostCents: number;
  vcpus: number;
  memoryMb: number;
  diskGb: number;
}
```

### 2.2 — Implement `HetznerProvider`

```typescript
export class HetznerProvider implements CloudProvider {
  readonly name = "hetzner";

  private apiToken: string;
  private networkId: string;
  private firewallId: string;
  private sshKeyIds: string[];
  private snapshotId: string;
  private datacenter: string;

  constructor(config: HetznerProviderConfig) {
    this.apiToken = config.apiToken;
    this.networkId = config.networkId;
    this.firewallId = config.firewallId;
    this.sshKeyIds = config.sshKeyIds;
    this.snapshotId = config.snapshotId;
    this.datacenter = config.datacenter || "nbg1-dc3";
  }

  // ... methods below
}
```

### 2.3 — Implement `createServer()`

Calls Hetzner Cloud API `POST /v1/servers`:

```typescript
async createServer(opts: CreateServerOpts): Promise<CreateServerResult> {
  const body = {
    name: `nex-${opts.tenantId}`,
    server_type: opts.plan,
    image: this.snapshotId,
    datacenter: this.datacenter,
    ssh_keys: this.sshKeyIds.map(Number),
    networks: [Number(this.networkId)],
    firewalls: [{ firewall: Number(this.firewallId) }],
    user_data: opts.userData,
    labels: {
      "managed-by": "nexus-frontdoor",
      "tenant-id": opts.tenantId,
      ...(opts.labels || {}),
    },
    public_net: {
      enable_ipv4: true,   // needed for outbound (package installs, etc.)
      enable_ipv6: false,
    },
  };

  const res = await fetch("https://api.hetzner.cloud/v1/servers", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Hetzner createServer failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const server = data.server;

  return {
    providerServerId: String(server.id),
    publicIp: server.public_net?.ipv4?.ip || undefined,
    privateIp: server.private_net?.[0]?.ip || undefined,
  };
}
```

**Note on `public_net`:** We enable IPv4 so the VPS can reach the internet for outbound traffic (apt, npm, etc.). The Hetzner Cloud Firewall blocks all inbound public traffic. Only private network traffic from frontdoor gets through.

### 2.4 — Implement `getServerStatus()`

```typescript
async getServerStatus(providerServerId: string): Promise<ProviderServerStatus> {
  const res = await fetch(`https://api.hetzner.cloud/v1/servers/${providerServerId}`, {
    headers: { "Authorization": `Bearer ${this.apiToken}` },
  });

  if (!res.ok) {
    if (res.status === 404) {
      return { state: "error", error: "Server not found" };
    }
    throw new Error(`Hetzner getServerStatus failed (${res.status})`);
  }

  const data = await res.json();
  const server = data.server;

  const stateMap: Record<string, ProviderServerStatus["state"]> = {
    initializing: "creating",
    starting: "creating",
    running: "running",
    stopping: "stopped",
    off: "stopped",
    deleting: "deleting",
    rebuilding: "creating",
    migrating: "creating",
    unknown: "error",
  };

  return {
    state: stateMap[server.status] || "error",
    publicIp: server.public_net?.ipv4?.ip || undefined,
    privateIp: server.private_net?.[0]?.ip || undefined,
  };
}
```

### 2.5 — Implement `destroyServer()`

```typescript
async destroyServer(providerServerId: string): Promise<void> {
  const res = await fetch(`https://api.hetzner.cloud/v1/servers/${providerServerId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${this.apiToken}` },
  });

  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Hetzner destroyServer failed (${res.status}): ${err}`);
  }
  // 404 is fine — server already deleted
}
```

### 2.6 — Implement `listPlans()`

Hardcoded ARM64 plans (no API call needed):

```typescript
listPlans(): ServerPlan[] {
  return [
    { id: "cax11", displayName: "Starter", monthlyCostCents: 329, vcpus: 2, memoryMb: 4096, diskGb: 40 },
    { id: "cax21", displayName: "Standard", monthlyCostCents: 549, vcpus: 4, memoryMb: 8192, diskGb: 80 },
    { id: "cax31", displayName: "Performance", monthlyCostCents: 949, vcpus: 8, memoryMb: 16384, diskGb: 160 },
  ];
}
```

### 2.7 — Create cloud-init template renderer

```typescript
export function renderCloudInitScript(opts: {
  tenantId: string;
  serverId: string;
  authToken: string;
  provisionToken: string;
  frontdoorUrl: string;
  appsToInstall: string[];
}): string {
  const tenantConfig = JSON.stringify({
    tenantId: opts.tenantId,
    serverId: opts.serverId,
    authToken: opts.authToken,
    provisionToken: opts.provisionToken,
    frontdoorUrl: opts.frontdoorUrl,
    appsToInstall: opts.appsToInstall,
  });

  return `#!/bin/bash
set -euo pipefail

# Write tenant configuration
cat > /opt/nex/config/tenant.json << 'TENANT_CONFIG'
${tenantConfig}
TENANT_CONFIG

# Set hostname
hostnamectl set-hostname "nex-${opts.tenantId}"

# Run bootstrap (starts nex runtime, waits for health, phones home)
/opt/nex/bootstrap.sh
`;
}
```

### 2.8 — Provider initialization in server startup

In `server.ts` startup, initialize the provider:

```typescript
import { HetznerProvider, CloudProvider } from "./cloud-provider.js";

const cloudProvider: CloudProvider = new HetznerProvider({
  apiToken: process.env.HETZNER_API_TOKEN!,
  networkId: process.env.HETZNER_NETWORK_ID!,
  firewallId: process.env.HETZNER_FIREWALL_ID!,
  sshKeyIds: (process.env.HETZNER_SSH_KEY_ID || "").split(","),
  snapshotId: process.env.HETZNER_SNAPSHOT_ID!,
  datacenter: "nbg1-dc3",
});
```

---

## Verification

- [ ] `HetznerProvider.createServer()` calls Hetzner API and returns server ID + IPs
- [ ] `HetznerProvider.destroyServer()` deletes a server
- [ ] `HetznerProvider.getServerStatus()` returns correct state
- [ ] `listPlans()` returns 3 plans (cax11, cax21, cax31)
- [ ] `renderCloudInitScript()` produces a valid bash script
- [ ] Can manually test: create a VPS from snapshot, verify it boots, destroy it
