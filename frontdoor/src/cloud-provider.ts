import { createHash } from "node:crypto";
import {
  CreateImageCommand,
  DescribeInstancesCommand,
  EC2Client,
  ModifyInstanceAttributeCommand,
  RunInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  waitUntilImageAvailable,
  waitUntilInstanceRunning,
  waitUntilInstanceStopped,
  type Instance,
  type _InstanceType,
} from "@aws-sdk/client-ec2";

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
  captureType: "snapshot" | "image";
};

/** A server plan (size / pricing) exposed by the provider. */
export type ServerPlan = {
  id: string;
  name: string;
  monthlyCostCents: number;
  vcpus: number;
  memoryMb: number;
  diskGb: number;
  architecture: "arm64" | "amd64";
};

export const STANDARD_SERVER_MONTHLY_COST_CENTS: Record<string, number> = {
  cax11: 4000,
  cax21: 6000,
  cax31: 10000,
};

export const COMPLIANT_SERVER_MONTHLY_COST_CENTS: Record<string, number> = {
  cax11: 40000,
  cax21: 60000,
  cax31: 100000,
};

export function getServerPlanMonthlyCostCents(params: {
  serverClass: "standard" | "compliant";
  planId: string;
}): number {
  const table =
    params.serverClass === "compliant"
      ? COMPLIANT_SERVER_MONTHLY_COST_CENTS
      : STANDARD_SERVER_MONTHLY_COST_CENTS;
  return table[params.planId] ?? table.cax11;
}

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

export interface AwsEc2ProviderConfig {
  region: string;
  subnetId: string;
  securityGroupIds: string[];
  amiId: string;
  instanceProfileArn?: string;
  instanceProfileName?: string;
  sshKeyName?: string;
  assignPublicIp?: boolean;
  client?: Pick<EC2Client, "send">;
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
    monthlyCostCents: STANDARD_SERVER_MONTHLY_COST_CENTS.cax11,
    vcpus: 2,
    memoryMb: 4096,
    diskGb: 40,
    architecture: "arm64",
  },
  {
    id: "cax21",
    name: "Standard",
    monthlyCostCents: STANDARD_SERVER_MONTHLY_COST_CENTS.cax21,
    vcpus: 4,
    memoryMb: 8192,
    diskGb: 80,
    architecture: "arm64",
  },
  {
    id: "cax31",
    name: "Performance",
    monthlyCostCents: STANDARD_SERVER_MONTHLY_COST_CENTS.cax31,
    vcpus: 8,
    memoryMb: 16384,
    diskGb: 160,
    architecture: "arm64",
  },
];

const AWS_ARM64_PLANS: ServerPlan[] = [
  {
    id: "cax11",
    name: "Starter",
    monthlyCostCents: COMPLIANT_SERVER_MONTHLY_COST_CENTS.cax11,
    vcpus: 2,
    memoryMb: 4096,
    diskGb: 40,
    architecture: "arm64",
  },
  {
    id: "cax21",
    name: "Standard",
    monthlyCostCents: COMPLIANT_SERVER_MONTHLY_COST_CENTS.cax21,
    vcpus: 2,
    memoryMb: 8192,
    diskGb: 80,
    architecture: "arm64",
  },
  {
    id: "cax31",
    name: "Performance",
    monthlyCostCents: COMPLIANT_SERVER_MONTHLY_COST_CENTS.cax31,
    vcpus: 4,
    memoryMb: 16384,
    diskGb: 160,
    architecture: "arm64",
  },
];

const AWS_INSTANCE_TYPE_BY_PLAN: Record<string, _InstanceType> = {
  cax11: "t4g.medium",
  cax21: "t4g.large",
  cax31: "t4g.xlarge",
};

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
    const cloudInitMode = opts.cloudInitScript.includes("bootstrap-frontdoor.sh")
      ? "trusted_token"
      : opts.cloudInitScript.includes("exec /opt/nex/bootstrap.sh")
        ? "legacy"
        : "unknown";
    const cloudInitSha = createHash("sha256")
      .update(opts.cloudInitScript, "utf8")
      .digest("hex")
      .slice(0, 16);
    console.log(
      `[hetzner-create] tenant=${opts.tenantId} plan=${opts.planId} cloud_init_mode=${cloudInitMode} cloud_init_sha=${cloudInitSha}`,
    );

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

export class AwsEc2Provider implements CloudProvider {
  private readonly client: Pick<EC2Client, "send">;
  private readonly subnetId: string;
  private readonly securityGroupIds: string[];
  private readonly amiId: string;
  private readonly instanceProfileArn?: string;
  private readonly instanceProfileName?: string;
  private readonly sshKeyName?: string;
  private readonly assignPublicIp: boolean;

  constructor(config: AwsEc2ProviderConfig) {
    this.client = config.client ?? new EC2Client({ region: config.region });
    this.subnetId = config.subnetId;
    this.securityGroupIds = [...config.securityGroupIds];
    this.amiId = config.amiId;
    this.instanceProfileArn = config.instanceProfileArn?.trim() || undefined;
    this.instanceProfileName = config.instanceProfileName?.trim() || undefined;
    this.sshKeyName = config.sshKeyName?.trim() || undefined;
    this.assignPublicIp = config.assignPublicIp === true;
  }

  listPlans(): ServerPlan[] {
    return [...AWS_ARM64_PLANS];
  }

  private resolveInstanceType(planId: string): _InstanceType {
    return AWS_INSTANCE_TYPE_BY_PLAN[planId] ?? AWS_INSTANCE_TYPE_BY_PLAN.cax11;
  }

  private async getInstance(providerServerId: string): Promise<Instance | null> {
    try {
      const response = await this.client.send(
        new DescribeInstancesCommand({
          InstanceIds: [providerServerId],
        }),
      );
      return response.Reservations?.flatMap((reservation) => reservation.Instances ?? [])[0] ?? null;
    } catch (error) {
      const message = String(error);
      if (message.includes("InvalidInstanceID.NotFound")) {
        return null;
      }
      throw error;
    }
  }

  private mapInstanceState(instance: Instance | null): ProviderServerStatus {
    const stateName = instance?.State?.Name ?? "";
    const state: ProviderServerStatus["state"] =
      stateName === "pending"
        ? "creating"
        : stateName === "running"
          ? "running"
          : stateName === "stopping" || stateName === "stopped"
            ? "stopped"
            : stateName === "shutting-down" || stateName === "terminated"
              ? "deleting"
              : "error";
    return {
      state,
      publicIp: instance?.PublicIpAddress ?? undefined,
      privateIp: instance?.PrivateIpAddress ?? undefined,
    };
  }

  async createServer(opts: CreateServerOpts): Promise<CreateServerResult> {
    const instanceType = this.resolveInstanceType(opts.planId);
    const networkInterface = {
      DeviceIndex: 0,
      SubnetId: this.subnetId,
      Groups: this.securityGroupIds,
      AssociatePublicIpAddress: this.assignPublicIp,
      DeleteOnTermination: true,
    };

    const runResult = await this.client.send(
      new RunInstancesCommand({
        ImageId: opts.imageId?.trim() || this.amiId,
        InstanceType: instanceType,
        MinCount: 1,
        MaxCount: 1,
        UserData: Buffer.from(opts.cloudInitScript, "utf8").toString("base64"),
        KeyName: this.sshKeyName,
        MetadataOptions: {
          HttpTokens: "required",
          HttpEndpoint: "enabled",
        },
        IamInstanceProfile: this.instanceProfileArn
          ? { Arn: this.instanceProfileArn }
          : this.instanceProfileName
            ? { Name: this.instanceProfileName }
            : undefined,
        NetworkInterfaces: [networkInterface],
        TagSpecifications: [
          {
            ResourceType: "instance",
            Tags: [
              { Key: "Name", Value: opts.serverName?.trim() || `nex-${opts.tenantId}` },
              { Key: "managed-by", Value: "nexus-frontdoor" },
              { Key: "tenant-id", Value: opts.tenantId },
            ],
          },
        ],
      }),
    );

    const providerServerId = runResult.Instances?.[0]?.InstanceId?.trim();
    if (!providerServerId) {
      throw new Error("aws_create_server_missing_instance_id");
    }

    try {
      await this.setProtection(providerServerId, {
        delete: true,
        rebuild: true,
      });
      await waitUntilInstanceRunning(
        { client: this.client as EC2Client, maxWaitTime: 180 },
        { InstanceIds: [providerServerId] },
      );
    } catch (error) {
      await this.destroyServer(providerServerId).catch(() => {
        // Best-effort cleanup after a failed durability setup step.
      });
      throw error;
    }

    const instance = await this.getInstance(providerServerId);
    if (!instance?.PrivateIpAddress) {
      throw new Error("aws_create_server_missing_private_ip");
    }

    return {
      providerServerId,
      publicIp: instance.PublicIpAddress ?? "",
      privateIp: instance.PrivateIpAddress,
      backupEnabled: false,
      deleteProtectionEnabled: true,
      rebuildProtectionEnabled: true,
    };
  }

  async getServerStatus(providerServerId: string): Promise<ProviderServerStatus> {
    return this.mapInstanceState(await this.getInstance(providerServerId));
  }

  async archiveServer(providerServerId: string): Promise<void> {
    await this.client.send(
      new StopInstancesCommand({
        InstanceIds: [providerServerId],
      }),
    );
    await waitUntilInstanceStopped(
      { client: this.client as EC2Client, maxWaitTime: 180 },
      { InstanceIds: [providerServerId] },
    );
  }

  async restoreServer(providerServerId: string): Promise<void> {
    await this.client.send(
      new StartInstancesCommand({
        InstanceIds: [providerServerId],
      }),
    );
    await waitUntilInstanceRunning(
      { client: this.client as EC2Client, maxWaitTime: 180 },
      { InstanceIds: [providerServerId] },
    );
  }

  async createRecoveryPoint(providerServerId: string, label: string): Promise<CreateRecoveryPointResult> {
    const safeLabel = label.trim() || `recovery-${providerServerId}`;
    const imageName = `${providerServerId}-${Date.now().toString(36)}-${safeLabel}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 128);
    const created = await this.client.send(
      new CreateImageCommand({
        InstanceId: providerServerId,
        Name: imageName,
        Description: safeLabel,
        NoReboot: true,
        TagSpecifications: [
          {
            ResourceType: "image",
            Tags: [
              { Key: "managed-by", Value: "nexus-frontdoor" },
              { Key: "recovery-point", Value: "true" },
              { Key: "label", Value: safeLabel.slice(0, 255) },
            ],
          },
        ],
      }),
    );
    const imageId = created.ImageId?.trim();
    if (!imageId) {
      throw new Error("aws_create_recovery_point_missing_image_id");
    }
    await waitUntilImageAvailable(
      { client: this.client as EC2Client, maxWaitTime: 600 },
      { ImageIds: [imageId] },
    );
    return {
      providerArtifactId: imageId,
      captureType: "image",
    };
  }

  async setProtection(
    providerServerId: string,
    protection: { delete: boolean; rebuild: boolean },
  ): Promise<void> {
    await this.client.send(
      new ModifyInstanceAttributeCommand({
        InstanceId: providerServerId,
        DisableApiTermination: { Value: protection.delete },
      }),
    );
    await this.client.send(
      new ModifyInstanceAttributeCommand({
        InstanceId: providerServerId,
        DisableApiStop: { Value: protection.rebuild },
      }),
    );
  }

  async destroyServer(providerServerId: string): Promise<void> {
    const instance = await this.getInstance(providerServerId);
    if (!instance) {
      return;
    }
    const state = instance.State?.Name;
    if (state === "terminated" || state === "shutting-down") {
      return;
    }
    try {
      await this.setProtection(providerServerId, { delete: false, rebuild: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("IncorrectInstanceState") || message.includes("InvalidInstanceID.NotFound")) {
        return;
      }
      throw error;
    }
    await this.client.send(
      new TerminateInstancesCommand({
        InstanceIds: [providerServerId],
      }),
    );
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
  runtimeTokenIssuer: string;
  runtimeTokenSecret: string;
  runtimeTokenActiveKid?: string;
  tailscaleAuthKey?: string;
  tailscaleHostname?: string;
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

  const bootstrapScript = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "CONFIG_FILE=\"/opt/nex/config/tenant.json\"",
    "LOG_PREFIX=\"[nex-bootstrap]\"",
    "",
    "log() { echo \"$LOG_PREFIX $(date -Iseconds) $*\"; }",
    "die() { log \"FATAL: $*\"; exit 1; }",
    "sign_runtime_token() {",
    "  local session_id=\"$1\"",
    "  node <<'NODE'",
    "const crypto = require(\"node:crypto\");",
    "const tenantId = process.env.BOOTSTRAP_TENANT_ID;",
    "const issuer = process.env.BOOTSTRAP_RUNTIME_TOKEN_ISSUER;",
    "const secret = process.env.BOOTSTRAP_RUNTIME_TOKEN_SECRET;",
    "const activeKid = process.env.BOOTSTRAP_RUNTIME_TOKEN_ACTIVE_KID || \"\";",
    "const sessionId = process.env.BOOTSTRAP_RUNTIME_SESSION_ID;",
    "const now = Math.floor(Date.now() / 1000);",
    "const header = activeKid ? { alg: \"HS256\", typ: \"JWT\", kid: activeKid } : { alg: \"HS256\", typ: \"JWT\" };",
    "const payload = {",
    "  iss: issuer,",
    "  aud: \"nexus-runtime\",",
    "  iat: now,",
    "  exp: now + 300,",
    "  jti: `bootstrap-${crypto.randomUUID()}`,",
    "  tenant_id: tenantId,",
    "  entity_id: \"system\",",
    "  role: \"operator\",",
    "  roles: [\"owner\"],",
    "  scopes: [\"operator.admin\"],",
    "  session_id: sessionId,",
    "  amr: [\"system\"],",
    "  client_id: \"nexus-frontdoor-bootstrap\",",
    "  sub: \"system\"",
    "};",
    "const base64url = (value) => Buffer.from(JSON.stringify(value)).toString(\"base64url\");",
    "const headerPart = base64url(header);",
    "const payloadPart = base64url(payload);",
    "const signature = crypto.createHmac(\"sha256\", secret).update(`${headerPart}.${payloadPart}`, \"utf8\").digest(\"base64url\");",
    "process.stdout.write(`${headerPart}.${payloadPart}.${signature}`);",
    "NODE",
    "}",
    "",
    "[ -f \"$CONFIG_FILE\" ] || die \"tenant.json not found at $CONFIG_FILE\"",
    "",
    "TENANT_ID=$(jq -r .tenantId \"$CONFIG_FILE\")",
    "SERVER_ID=$(jq -r .serverId \"$CONFIG_FILE\")",
    "PROVISION_TOKEN=$(jq -r .provisionToken \"$CONFIG_FILE\")",
    "FRONTDOOR_URL=$(jq -r .frontdoorUrl \"$CONFIG_FILE\")",
    "FRONTDOOR_HOST=$(node -e 'try { process.stdout.write(new URL(process.argv[1]).hostname); } catch { process.exit(0); }' \"$FRONTDOOR_URL\" 2>/dev/null || true)",
    "TAILSCALE_AUTH_KEY=\"" + (opts.tailscaleAuthKey?.trim() ?? "") + "\"",
    "TAILSCALE_HOSTNAME=\"" + (opts.tailscaleHostname?.trim() ?? "") + "\"",
    "",
    "[ -n \"$TENANT_ID\" ] && [ \"$TENANT_ID\" != \"null\" ] || die \"tenantId missing\"",
    "[ -n \"$PROVISION_TOKEN\" ] && [ \"$PROVISION_TOKEN\" != \"null\" ] || die \"provisionToken missing\"",
    "[ -n \"$FRONTDOOR_URL\" ] && [ \"$FRONTDOOR_URL\" != \"null\" ] || die \"frontdoorUrl missing\"",
    "",
    "log \"Bootstrapping tenant=$TENANT_ID server=$SERVER_ID\"",
    "",
    "mkdir -p /opt/nex/state /opt/nex/config",
    "chown -R nex:nex /opt/nex/state",
    "chown -R nex:nex /opt/nex/config",
    "",
    "if command -v ufw >/dev/null 2>&1 && [ -n \"$FRONTDOOR_HOST\" ]; then",
    "  log \"Allowing runtime port 18789 from frontdoor host $FRONTDOOR_HOST via UFW...\"",
    "  ufw allow from \"$FRONTDOOR_HOST\" to any port 18789 proto tcp >/dev/null 2>&1 || true",
    "fi",
    "if command -v ufw >/dev/null 2>&1 && [ -n \"$TAILSCALE_AUTH_KEY\" ]; then",
    "  log \"Allowing SSH and runtime traffic from Tailscale CGNAT range via UFW...\"",
    "  ufw allow from 100.64.0.0/10 to any port 22 proto tcp >/dev/null 2>&1 || true",
    "  ufw allow from 100.64.0.0/10 to any port 18789 proto tcp >/dev/null 2>&1 || true",
    "fi",
    "",
    "log \"Stopping any pre-started nex-runtime service before workspace initialization...\"",
    "systemctl stop nex-runtime 2>/dev/null || true",
    "systemctl disable nex-runtime 2>/dev/null || true",
    "systemctl reset-failed nex-runtime 2>/dev/null || true",
    "",
    "cat > /opt/nex/config/nex.env << ENVEOF",
    "NEXUS_ROOT=/opt/nex",
    "NEXUS_STATE_DIR=/opt/nex/state",
    "NEXUS_RUNTIME_PORT=18789",
    "HOME=/opt/nex",
    "NODE_ENV=production",
    "NEXUS_RUNTIME_TRUSTED_TOKEN_ISSUER=" + opts.runtimeTokenIssuer,
    "NEXUS_RUNTIME_TRUSTED_TOKEN_SECRET=" + opts.runtimeTokenSecret,
    ...(opts.runtimeTokenActiveKid?.trim()
      ? [`NEXUS_RUNTIME_TRUSTED_TOKEN_ACTIVE_KID=${opts.runtimeTokenActiveKid.trim()}`]
      : []),
    "ENVEOF",
    "",
    "chown nex:nex /opt/nex/config/nex.env",
    "chmod 600 /opt/nex/config/nex.env",
    "",
    "log \"Initializing nexus workspace...\"",
    "INIT_RETRIES=5",
    "INIT_DELAY=3",
    "INIT_ATTEMPT=1",
    "while [ \"$INIT_ATTEMPT\" -le \"$INIT_RETRIES\" ]; do",
    "  if su -s /bin/bash nex -c \"cd /opt/nex/runtime && NEXUS_ROOT=/opt/nex NEXUS_STATE_DIR=/opt/nex/state HOME=/opt/nex node dist/index.js init --workspace /opt/nex\" 2>&1; then",
    "    if [ -f /opt/nex/state/config.json ]; then",
    "      log \"Workspace initialized on attempt ${INIT_ATTEMPT}\"",
    "      break",
    "    fi",
    "    log \"Workspace init completed without /opt/nex/state/config.json on attempt ${INIT_ATTEMPT}\"",
    "  else",
    "    log \"Workspace init attempt ${INIT_ATTEMPT} failed\"",
    "  fi",
    "  if [ \"$INIT_ATTEMPT\" -eq \"$INIT_RETRIES\" ]; then",
    "    die \"Workspace initialization failed after ${INIT_RETRIES} attempts\"",
    "  fi",
    "  sleep \"$INIT_DELAY\"",
    "  INIT_ATTEMPT=$((INIT_ATTEMPT + 1))",
    "done",
    "",
    "[ -f /opt/nex/state/config.json ] || die \"Missing /opt/nex/state/config.json after workspace initialization\"",
    "",
    "if [ -f /opt/nex/state/config.json ]; then",
    `  PATCHED=$(jq --arg tenant \"$TENANT_ID\" --arg issuer \"${opts.runtimeTokenIssuer}\" --arg secret \"${opts.runtimeTokenSecret}\" --arg activeKid \"${opts.runtimeTokenActiveKid?.trim() ?? ""}\" '.runtime.hostedMode = true | .runtime.tenantId = $tenant | .runtime.bind = \"lan\" | .runtime.auth.mode = \"trusted_token\" | .runtime.auth.trustedToken.issuer = $issuer | .runtime.auth.trustedToken.hmacSecret = $secret | (if $activeKid != \"\" then .runtime.auth.trustedToken.activeKid = $activeKid else . end)' /opt/nex/state/config.json)`,
    "  echo \"$PATCHED\" > /opt/nex/state/config.json",
    "  chown nex:nex /opt/nex/state/config.json",
    "  chmod 600 /opt/nex/state/config.json",
    "  log \"Patched config.json with hosted trusted-token runtime config\"",
    "fi",
    "",
    "log \"Enabling and starting nex-runtime service...\"",
    "systemctl stop nex-runtime 2>/dev/null || true",
    "systemctl daemon-reload",
    "systemctl enable nex-runtime",
    "systemctl reset-failed nex-runtime 2>/dev/null || true",
    "systemctl start nex-runtime",
    "",
    "HEALTH_TIMEOUT=60",
    "HEALTH_INTERVAL=3",
    "ELAPSED=0",
    "BOOTSTRAP_TENANT_ID=\"$TENANT_ID\"",
    "BOOTSTRAP_RUNTIME_TOKEN_ISSUER=\"" + opts.runtimeTokenIssuer + "\"",
    "BOOTSTRAP_RUNTIME_TOKEN_SECRET=\"" + opts.runtimeTokenSecret + "\"",
    "BOOTSTRAP_RUNTIME_TOKEN_ACTIVE_KID=\"" + (opts.runtimeTokenActiveKid?.trim() ?? "") + "\"",
    "BOOTSTRAP_RUNTIME_SESSION_ID=\"bootstrap-${TENANT_ID}\"",
    "export BOOTSTRAP_TENANT_ID BOOTSTRAP_RUNTIME_TOKEN_ISSUER BOOTSTRAP_RUNTIME_TOKEN_SECRET BOOTSTRAP_RUNTIME_TOKEN_ACTIVE_KID BOOTSTRAP_RUNTIME_SESSION_ID",
    "log \"Waiting for runtime health (timeout=${HEALTH_TIMEOUT}s)...\"",
    "while [ \"$ELAPSED\" -lt \"$HEALTH_TIMEOUT\" ]; do",
    "  RUNTIME_JWT=$(sign_runtime_token \"$BOOTSTRAP_RUNTIME_SESSION_ID\")",
    "  if curl -fsS -H \"Authorization: Bearer ${RUNTIME_JWT}\" http://127.0.0.1:18789/health > /dev/null 2>&1; then",
    "    log \"Runtime is healthy after ${ELAPSED}s\"",
    "    break",
    "  fi",
    "  sleep \"$HEALTH_INTERVAL\"",
    "  ELAPSED=$((ELAPSED + HEALTH_INTERVAL))",
    "done",
    "",
    "if [ \"$ELAPSED\" -ge \"$HEALTH_TIMEOUT\" ]; then",
    "  journalctl -u nex-runtime -n 80 --no-pager 2>/dev/null || true",
    "  die \"Runtime health check timed out after ${HEALTH_TIMEOUT}s\"",
    "fi",
    "",
    "TRANSPORT_HOST=\"\"",
    "if [ -n \"$TAILSCALE_AUTH_KEY\" ]; then",
    "  log \"Installing Tailscale for overlay transport...\"",
    "  curl -fsSL https://tailscale.com/install.sh | sh",
    "  systemctl enable --now tailscaled",
    "  if [ -n \"$TAILSCALE_HOSTNAME\" ]; then",
    "    tailscale up --auth-key \"$TAILSCALE_AUTH_KEY\" --ssh --hostname \"$TAILSCALE_HOSTNAME\"",
    "  else",
    "    tailscale up --auth-key \"$TAILSCALE_AUTH_KEY\" --ssh",
    "  fi",
    "  TS_WAIT=30",
    "  TS_ELAPSED=0",
    "  while [ \"$TS_ELAPSED\" -lt \"$TS_WAIT\" ]; do",
    "    TRANSPORT_HOST=$(tailscale ip -4 2>/dev/null | head -1 || true)",
    "    if [ -n \"$TRANSPORT_HOST\" ]; then",
    "      break",
    "    fi",
    "    sleep 2",
    "    TS_ELAPSED=$((TS_ELAPSED + 2))",
    "  done",
    "  [ -n \"$TRANSPORT_HOST\" ] || die \"Tailscale transport host unavailable after bootstrap\"",
    "  log \"Tailscale transport host: $TRANSPORT_HOST\"",
    "fi",
    "",
    "PRIVATE_IP=\"\"",
    "PRIVATE_IP_PATTERN='^(10\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.|192\\.168\\.)'",
    "for iface in ens10 ens5 eth1 eth0; do",
    "  PRIVATE_IP=$(ip -4 addr show \"$iface\" 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 | grep -E \"$PRIVATE_IP_PATTERN\" | head -1) || true",
    "  [ -n \"$PRIVATE_IP\" ] && break",
    "done",
    "if [ -z \"$PRIVATE_IP\" ]; then",
    "  PRIVATE_IP=$(ip -4 addr | awk '/inet / {print $2}' | cut -d/ -f1 | grep -E \"$PRIVATE_IP_PATTERN\" | head -1) || true",
    "fi",
    "log \"Private IP: ${PRIVATE_IP:-unknown}\"",
    "",
    "if [ -z \"$TRANSPORT_HOST\" ]; then",
    "  TRANSPORT_HOST=\"$PRIVATE_IP\"",
    "fi",
    "log \"Transport host: ${TRANSPORT_HOST:-unknown}\"",
    "",
    "CALLBACK_BODY=$(jq -n --arg tenant_id \"$TENANT_ID\" --arg server_id \"$SERVER_ID\" --arg private_ip \"$PRIVATE_IP\" --arg transport_host \"$TRANSPORT_HOST\" --argjson runtime_port 18789 --arg status \"running\" '{tenant_id: $tenant_id, server_id: $server_id, private_ip: $private_ip, transport_host: $transport_host, runtime_port: $runtime_port, status: $status}')",
    "CALLBACK_RETRIES=5",
    "CALLBACK_DELAY=5",
    "HTTP_CODE=\"000\"",
    "for i in $(seq 1 $CALLBACK_RETRIES); do",
    "  HTTP_CODE=$(curl -s -o /tmp/callback-response.txt -w \"%{http_code}\" -X POST -H \"Authorization: Bearer ${PROVISION_TOKEN}\" -H \"Content-Type: application/json\" -d \"$CALLBACK_BODY\" \"${FRONTDOOR_URL}/api/internal/provision-callback\" 2>/dev/null || echo \"000\")",
    "  if [ \"$HTTP_CODE\" = \"200\" ]; then",
    "    log \"Provision callback successful (attempt $i)\"",
    "    break",
    "  else",
    "    log \"Provision callback attempt $i failed (HTTP $HTTP_CODE), retrying in ${CALLBACK_DELAY}s...\"",
    "    [ -f /tmp/callback-response.txt ] && cat /tmp/callback-response.txt 2>/dev/null && echo \"\"",
    "    sleep \"$CALLBACK_DELAY\"",
    "  fi",
    "done",
    "if [ \"$HTTP_CODE\" != \"200\" ]; then",
    "  die \"Provision callback failed after $CALLBACK_RETRIES attempts\"",
    "fi",
    "log \"Bootstrap complete for tenant=$TENANT_ID\"",
  ].join("\n");

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
    "cat > /opt/nex/bootstrap-frontdoor.sh << 'NEXBOOTSTRAP'",
    bootstrapScript,
    "NEXBOOTSTRAP",
    "chmod 700 /opt/nex/bootstrap-frontdoor.sh",
    "",
    "# Set hostname",
    `hostnamectl set-hostname "nex-${opts.tenantId}"`,
    "",
    "# Run bootstrap",
    "exec /opt/nex/bootstrap-frontdoor.sh",
  ];

  return lines.join("\n") + "\n";
}
