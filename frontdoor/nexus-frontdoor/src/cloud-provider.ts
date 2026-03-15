// ---------------------------------------------------------------------------
// CloudProvider interface + HetznerProvider implementation
// ---------------------------------------------------------------------------

/** Options passed to createServer. */
export type CreateServerOpts = {
  tenantId: string;
  planId: string;
  cloudInitScript: string;
  imageId?: string;
  serverName?: string;
};

/** Result returned from a successful createServer call. */
export type CreateServerResult = {
  providerServerId: string;
  publicIp: string;
  privateIp: string;
  backupEnabled: boolean;
  deleteProtectionEnabled: boolean;
  rebuildProtectionEnabled: boolean;
};

/** Normalised server status used within nexus-frontdoor. */
export type ProviderServerStatus = {
  state: "creating" | "running" | "stopped" | "deleting" | "error";
  publicIp?: string;
  privateIp?: string;
};

export type CreateRecoveryPointResult = {
  providerArtifactId: string;
  captureType: "snapshot";
};

/** A server plan (size / pricing) exposed by the provider. */
export type ServerPlan = {
  id: string;
  name: string;
  priceMonthlyEur: number;
  vcpus: number;
  memoryMb: number;
  diskGb: number;
};

// ---------------------------------------------------------------------------
// CloudProvider interface
// ---------------------------------------------------------------------------

export interface CloudProvider {
  createServer(opts: CreateServerOpts): Promise<CreateServerResult>;
  getServerStatus(providerServerId: string): Promise<ProviderServerStatus>;
  archiveServer(providerServerId: string): Promise<void>;
  restoreServer(providerServerId: string): Promise<void>;
  createRecoveryPoint(providerServerId: string, label: string): Promise<CreateRecoveryPointResult>;
  setProtection(
    providerServerId: string,
    protection: { delete: boolean; rebuild: boolean },
  ): Promise<void>;
  destroyServer(providerServerId: string): Promise<void>;
  listPlans(): ServerPlan[];
}

// ---------------------------------------------------------------------------
// Hetzner provider config
// ---------------------------------------------------------------------------

export interface HetznerProviderConfig {
  apiToken: string;
  networkId: string;
  firewallId: string;
  sshKeyIds: string[];
  snapshotId: string;
  datacenter?: string; // default "nbg1-dc3"
}

// ---------------------------------------------------------------------------
// Hetzner Cloud API response types (internal)
// ---------------------------------------------------------------------------

type HetznerCreateServerResponse = {
  server?: {
    id?: number;
    public_net?: {
      ipv4?: { ip?: string };
    };
    private_net?: Array<{ ip?: string }>;
  };
  error?: { message?: string; code?: string };
};

type HetznerGetServerResponse = {
  server?: {
    id?: number;
    status?: string;
    public_net?: {
      ipv4?: { ip?: string };
    };
    private_net?: Array<{ ip?: string }>;
  };
  error?: { message?: string; code?: string };
};

type HetznerActionResponse = {
  action?: {
    id?: number;
    command?: string;
    status?: string;
  };
  image?: {
    id?: number;
    type?: string;
  };
  error?: { message?: string; code?: string };
};

// ---------------------------------------------------------------------------
// Hetzner status mapping
// ---------------------------------------------------------------------------

const HETZNER_STATUS_MAP: Record<string, ProviderServerStatus["state"]> = {
  initializing: "creating",
  starting: "creating",
  running: "running",
  stopping: "stopped",
  off: "stopped",
  deleting: "deleting",
};

// ---------------------------------------------------------------------------
// Hardcoded ARM64 plans
// ---------------------------------------------------------------------------

const HETZNER_ARM64_PLANS: ServerPlan[] = [
  {
    id: "cax11",
    name: "Starter",
    priceMonthlyEur: 3.29,
    vcpus: 2,
    memoryMb: 4096,
    diskGb: 40,
  },
  {
    id: "cax21",
    name: "Standard",
    priceMonthlyEur: 5.49,
    vcpus: 4,
    memoryMb: 8192,
    diskGb: 80,
  },
  {
    id: "cax31",
    name: "Performance",
    priceMonthlyEur: 9.49,
    vcpus: 8,
    memoryMb: 16384,
    diskGb: 160,
  },
];

// ---------------------------------------------------------------------------
// HetznerProvider
// ---------------------------------------------------------------------------

const HETZNER_API_BASE = "https://api.hetzner.cloud/v1";

export class HetznerProvider implements CloudProvider {
  private readonly apiToken: string;
  private readonly networkId: string;
  private readonly firewallId: string;
  private readonly sshKeyIds: string[];
  private readonly snapshotId: string;
  private readonly datacenter: string;

  constructor(config: HetznerProviderConfig) {
    this.apiToken = config.apiToken;
    this.networkId = config.networkId;
    this.firewallId = config.firewallId;
    this.sshKeyIds = [...config.sshKeyIds];
    this.snapshotId = config.snapshotId;
    this.datacenter = config.datacenter ?? "nbg1-dc3";
  }

  // -----------------------------------------------------------------------
  // listPlans
  // -----------------------------------------------------------------------

  listPlans(): ServerPlan[] {
    return [...HETZNER_ARM64_PLANS];
  }

  private async postServerAction(
    providerServerId: string,
    actionPath: string,
    body?: Record<string, unknown>,
  ): Promise<HetznerActionResponse> {
    const response = await fetch(
      `${HETZNER_API_BASE}/servers/${encodeURIComponent(providerServerId)}/actions/${actionPath}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiToken}`,
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const raw = await response.text();
    let parsed: HetznerActionResponse = {};
    try {
      parsed = raw ? (JSON.parse(raw) as HetznerActionResponse) : {};
    } catch {
      throw new Error(`hetzner_${actionPath}_invalid_response: ${raw.slice(0, 200)}`);
    }
    if (!response.ok) {
      const msg = parsed.error?.message ?? `hetzner_${actionPath}_failed_${response.status}`;
      throw new Error(msg);
    }
    return parsed;
  }

  private async waitForState(
    providerServerId: string,
    expected: ProviderServerStatus["state"],
    timeoutMs = 120000,
  ): Promise<ProviderServerStatus> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const status = await this.getServerStatus(providerServerId);
      if (status.state === expected) {
        return status;
      }
      if (status.state === "error") {
        throw new Error(`hetzner_wait_for_${expected}_failed`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`hetzner_wait_for_${expected}_timeout`);
  }

  // -----------------------------------------------------------------------
  // createServer
  // -----------------------------------------------------------------------

  async createServer(opts: CreateServerOpts): Promise<CreateServerResult> {
    const body = {
      name: opts.serverName?.trim() || `nex-${opts.tenantId}`,
      server_type: opts.planId,
      image: opts.imageId?.trim() || this.snapshotId,
      datacenter: this.datacenter,
      ssh_keys: this.sshKeyIds.map(Number),
      networks: [Number(this.networkId)],
      firewalls: [{ firewall: Number(this.firewallId) }],
      user_data: opts.cloudInitScript,
      labels: {
        "managed-by": "nexus-frontdoor",
        "tenant-id": opts.tenantId,
      },
      public_net: {
        enable_ipv4: true,
        enable_ipv6: false,
      },
    };

    const response = await fetch(`${HETZNER_API_BASE}/servers`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    let parsed: HetznerCreateServerResponse;
    try {
      parsed = raw ? (JSON.parse(raw) as HetznerCreateServerResponse) : {};
    } catch {
      throw new Error(`hetzner_create_server_invalid_response: ${raw.slice(0, 200)}`);
    }

    if (!response.ok) {
      const msg = parsed.error?.message ?? `hetzner_create_server_failed_${response.status}`;
      throw new Error(msg);
    }

    const server = parsed.server;
    if (!server?.id) {
      throw new Error("hetzner_create_server_missing_id");
    }

    const providerServerId = String(server.id);
    const publicIp = server.public_net?.ipv4?.ip ?? "";
    const privateIp = server.private_net?.[0]?.ip ?? "";

    try {
      await this.postServerAction(providerServerId, "enable_backup");
      await this.postServerAction(providerServerId, "change_protection", {
        delete: true,
        rebuild: true,
      });
    } catch (error) {
      await this.destroyServer(providerServerId).catch(() => {
        // Best-effort cleanup after a failed durability setup step.
      });
      throw error;
    }

    return {
      providerServerId,
      publicIp,
      privateIp,
      backupEnabled: true,
      deleteProtectionEnabled: true,
      rebuildProtectionEnabled: true,
    };
  }

  // -----------------------------------------------------------------------
  // getServerStatus
  // -----------------------------------------------------------------------

  async getServerStatus(providerServerId: string): Promise<ProviderServerStatus> {
    const response = await fetch(`${HETZNER_API_BASE}/servers/${encodeURIComponent(providerServerId)}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.apiToken}`,
      },
    });

    if (response.status === 404) {
      return { state: "error" };
    }

    const raw = await response.text();
    let parsed: HetznerGetServerResponse;
    try {
      parsed = raw ? (JSON.parse(raw) as HetznerGetServerResponse) : {};
    } catch {
      throw new Error(`hetzner_get_server_invalid_response: ${raw.slice(0, 200)}`);
    }

    if (!response.ok) {
      const msg = parsed.error?.message ?? `hetzner_get_server_failed_${response.status}`;
      throw new Error(msg);
    }

    const server = parsed.server;
    const hetznerStatus = server?.status ?? "";
    const state: ProviderServerStatus["state"] = HETZNER_STATUS_MAP[hetznerStatus] ?? "error";
    const publicIp = server?.public_net?.ipv4?.ip ?? undefined;
    const privateIp = server?.private_net?.[0]?.ip ?? undefined;

    return { state, publicIp, privateIp };
  }

  // -----------------------------------------------------------------------
  // archiveServer
  // -----------------------------------------------------------------------

  async archiveServer(providerServerId: string): Promise<void> {
    await this.postServerAction(providerServerId, "poweroff");
    await this.waitForState(providerServerId, "stopped");
  }

  // -----------------------------------------------------------------------
  // restoreServer
  // -----------------------------------------------------------------------

  async restoreServer(providerServerId: string): Promise<void> {
    await this.postServerAction(providerServerId, "poweron");
    await this.waitForState(providerServerId, "running");
  }

  // -----------------------------------------------------------------------
  // createRecoveryPoint
  // -----------------------------------------------------------------------

  async createRecoveryPoint(providerServerId: string, label: string): Promise<CreateRecoveryPointResult> {
    const parsed = await this.postServerAction(providerServerId, "create_image", {
      type: "snapshot",
      description: label,
      labels: {
        "managed-by": "nexus-frontdoor",
        "recovery-point": "true",
      },
    });
    const imageId = parsed.image?.id;
    if (!imageId) {
      throw new Error("hetzner_create_recovery_point_missing_image_id");
    }
    return {
      providerArtifactId: String(imageId),
      captureType: "snapshot",
    };
  }

  // -----------------------------------------------------------------------
  // setProtection
  // -----------------------------------------------------------------------

  async setProtection(
    providerServerId: string,
    protection: { delete: boolean; rebuild: boolean },
  ): Promise<void> {
    await this.postServerAction(providerServerId, "change_protection", {
      delete: protection.delete,
      rebuild: protection.rebuild,
    });
  }

  // -----------------------------------------------------------------------
  // destroyServer
  // -----------------------------------------------------------------------

  async destroyServer(providerServerId: string): Promise<void> {
    const response = await fetch(`${HETZNER_API_BASE}/servers/${encodeURIComponent(providerServerId)}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${this.apiToken}`,
      },
    });

    // 404 is OK — server already gone.
    if (response.status === 404) {
      return;
    }

    if (!response.ok) {
      const raw = await response.text();
      let parsed: { error?: { message?: string } } = {};
      try {
        parsed = raw ? (JSON.parse(raw) as { error?: { message?: string } }) : {};
      } catch {
        // ignore parse failure
      }
      const msg = parsed.error?.message ?? `hetzner_destroy_server_failed_${response.status}`;
      throw new Error(msg);
    }
  }
}

// ---------------------------------------------------------------------------
// renderCloudInitScript
// ---------------------------------------------------------------------------

export function renderCloudInitScript(opts: {
  tenantId: string;
  serverId: string;
  authToken: string;
  provisionToken: string;
  frontdoorUrl: string;
}): string {
  const configJson = JSON.stringify(
    {
      tenantId: opts.tenantId,
      serverId: opts.serverId,
      authToken: opts.authToken,
      provisionToken: opts.provisionToken,
      frontdoorUrl: opts.frontdoorUrl,
    },
    null,
    2,
  );

  // The script is used as Hetzner cloud-init user_data (runs as root on first boot).
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# Write tenant configuration",
    "mkdir -p /opt/nex/config",
    `cat > /opt/nex/config/tenant.json << 'NEXEOF'`,
    configJson,
    "NEXEOF",
    "",
    "# Set hostname",
    `hostnamectl set-hostname "nex-${opts.tenantId}"`,
    "",
    "# Run bootstrap",
    "exec /opt/nex/bootstrap.sh",
  ];

  return lines.join("\n") + "\n";
}
