import { createHash } from "node:crypto";

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
  architecture: "arm64" | "amd64";
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
    architecture: "arm64",
  },
  {
    id: "cax21",
    name: "Standard",
    priceMonthlyEur: 5.49,
    vcpus: 4,
    memoryMb: 8192,
    diskGb: 80,
    architecture: "arm64",
  },
  {
    id: "cax31",
    name: "Performance",
    priceMonthlyEur: 9.49,
    vcpus: 8,
    memoryMb: 16384,
    diskGb: 160,
    architecture: "arm64",
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
    "  aud: \"runtime-api\",",
    "  iat: now,",
    "  exp: now + 300,",
    "  jti: `bootstrap-${crypto.randomUUID()}`,",
    "  tenant_id: tenantId,",
    "  entity_id: `bootstrap-${tenantId}`,",
    "  role: \"operator\",",
    "  roles: [\"owner\"],",
    "  scopes: [\"operator.admin\"],",
    "  session_id: sessionId,",
    "  amr: [\"system\"],",
    "  client_id: \"nexus-frontdoor-bootstrap\",",
    "  sub: `bootstrap-${tenantId}`",
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
    "su -s /bin/bash nex -c \"cd /opt/nex/runtime && NEXUS_ROOT=/opt/nex NEXUS_STATE_DIR=/opt/nex/state HOME=/opt/nex node dist/index.js init --workspace /opt/nex\" 2>&1 || true",
    "",
    "if [ -f /opt/nex/state/config.json ]; then",
    `  PATCHED=$(jq --arg tenant \"$TENANT_ID\" --arg issuer \"${opts.runtimeTokenIssuer}\" --arg secret \"${opts.runtimeTokenSecret}\" --arg activeKid \"${opts.runtimeTokenActiveKid?.trim() ?? ""}\" '.runtime.hostedMode = true | .runtime.tenantId = $tenant | .runtime.bind = \"lan\" | .runtime.auth.mode = \"trusted_token\" | .runtime.auth.trustedToken.issuer = $issuer | .runtime.auth.trustedToken.hmacSecret = $secret | (if $activeKid != \"\" then .runtime.auth.trustedToken.activeKid = $activeKid else . end)' /opt/nex/state/config.json)`,
    "  echo \"$PATCHED\" > /opt/nex/state/config.json",
    "  chown nex:nex /opt/nex/state/config.json",
    "  chmod 600 /opt/nex/state/config.json",
    "  log \"Patched config.json with hosted trusted-token runtime config\"",
    "fi",
    "",
    "log \"Starting nex-runtime service...\"",
    "systemctl stop nex-runtime 2>/dev/null || true",
    "systemctl reset-failed nex-runtime 2>/dev/null || true",
    "systemctl daemon-reload",
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
    "  log \"WARNING: Runtime health check timed out after ${HEALTH_TIMEOUT}s, continuing anyway...\"",
    "fi",
    "",
    "PRIVATE_IP=\"\"",
    "for iface in ens10 eth1 eth0; do",
    "  PRIVATE_IP=$(ip -4 addr show \"$iface\" 2>/dev/null | grep -oE 'inet 10\\.[0-9.]+' | awk '{print $2}' | head -1) || true",
    "  [ -n \"$PRIVATE_IP\" ] && break",
    "done",
    "if [ -z \"$PRIVATE_IP\" ]; then",
    "  PRIVATE_IP=$(ip -4 addr | grep -oE 'inet 10\\.[0-9.]+' | awk '{print $2}' | head -1) || true",
    "fi",
    "log \"Private IP: ${PRIVATE_IP:-unknown}\"",
    "",
    "CALLBACK_BODY=$(jq -n --arg tenant_id \"$TENANT_ID\" --arg server_id \"$SERVER_ID\" --arg private_ip \"$PRIVATE_IP\" --argjson runtime_port 18789 --arg status \"running\" '{tenant_id: $tenant_id, server_id: $server_id, private_ip: $private_ip, runtime_port: $runtime_port, status: $status}')",
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
