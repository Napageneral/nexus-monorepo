import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import {
  getServerPlanMonthlyCostCents,
  type CloudProvider,
  type CreateRecoveryPointResult,
  type CreateServerOpts,
  type CreateServerResult,
  type ProviderServerStatus,
  type ServerPlan,
} from "./cloud-provider.js";

const DEFAULT_RUNTIME_CONTAINER_PORT = 18789;
const DEFAULT_CONTAINER_ROOT = "/opt/nex";
const DEFAULT_FRONTDOOR_HOST_ALIAS = "host.docker.internal";

export type SandboxCommandRunner = (args: string[]) => Promise<{ stdout: string; stderr: string }>;
export type SandboxPortAllocator = () => Promise<number>;

export interface DockerSandboxProviderConfig {
  imageName: string;
  hostStateRoot?: string;
  dockerBin?: string;
  frontdoorHostAlias?: string;
  runtimeContainerPort?: number;
  containerRoot?: string;
  runner?: SandboxCommandRunner;
  allocatePort?: SandboxPortAllocator;
}

type DockerInspectRecord = {
  State?: {
    Running?: boolean;
    Status?: string;
  };
};

function shSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function sanitizeIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 48) || "sandbox";
}

function rewriteFrontdoorUrlForContainer(rawUrl: string, hostAlias: string): string {
  const value = rawUrl.trim();
  if (!value) {
    return value;
  }
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.trim().toLowerCase();
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      parsed.hostname = hostAlias;
    }
    return parsed.toString().replace(/\/+$/g, "");
  } catch {
    return value;
  }
}

async function defaultRunDockerCommand(
  dockerBin: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(dockerBin, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr.trim() || stdout.trim() || error.message;
        reject(new Error(`docker_command_failed:${args[0] ?? "unknown"}:${detail}`));
        return;
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function allocateEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("sandbox_port_allocation_failed")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function buildSandboxBootstrapScript(params: {
  containerRoot: string;
  runtimeContainerPort: number;
  runtimeHostPort: number;
  frontdoorUrl: string;
  runtimeAuthToken: string;
  provisionToken: string;
  runtimeTokenIssuer: string;
  runtimeTokenSecret: string;
  runtimeTokenActiveKid?: string;
  tenantId: string;
  serverId: string;
  bootstrapSeedFilename?: string;
}): string {
  const seedCopyLines = params.bootstrapSeedFilename
    ? [
        `cp ${params.containerRoot}/${params.bootstrapSeedFilename} ${params.containerRoot}/config/bootstrap-seed.yml`,
        `chmod 600 ${params.containerRoot}/config/bootstrap-seed.yml`,
      ]
    : [];
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `ROOT=${shSingleQuote(params.containerRoot)}`,
    `RUNTIME_PORT=${String(params.runtimeContainerPort)}`,
    `RUNTIME_HOST_PORT=${String(params.runtimeHostPort)}`,
    `FRONTDOOR_URL=${shSingleQuote(params.frontdoorUrl)}`,
    `RUNTIME_AUTH_TOKEN=${shSingleQuote(params.runtimeAuthToken)}`,
    `PROVISION_TOKEN=${shSingleQuote(params.provisionToken)}`,
    `RUNTIME_TOKEN_ISSUER=${shSingleQuote(params.runtimeTokenIssuer)}`,
    `RUNTIME_TOKEN_SECRET=${shSingleQuote(params.runtimeTokenSecret)}`,
    `RUNTIME_TOKEN_ACTIVE_KID=${shSingleQuote(params.runtimeTokenActiveKid ?? "")}`,
    `TENANT_ID=${shSingleQuote(params.tenantId)}`,
    `SERVER_ID=${shSingleQuote(params.serverId)}`,
    "export ROOT RUNTIME_PORT RUNTIME_HOST_PORT FRONTDOOR_URL RUNTIME_AUTH_TOKEN PROVISION_TOKEN RUNTIME_TOKEN_ISSUER RUNTIME_TOKEN_SECRET RUNTIME_TOKEN_ACTIVE_KID TENANT_ID SERVER_ID",
    "",
    "mkdir -p \"$ROOT/state\" \"$ROOT/config\"",
    ...seedCopyLines,
    "cd /app",
    "HOME=\"$ROOT\" NEXUS_ROOT=\"$ROOT\" NEXUS_STATE_DIR=\"$ROOT/state\" node nexus.mjs init --workspace \"$ROOT\"",
    "node <<'NODE'",
    "const fs = require('node:fs');",
    "const configPath = `${process.env.ROOT}/state/config.json`;",
    "const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));",
    "config.runtime = config.runtime ?? {};",
    "config.runtime.hostedMode = true;",
    "config.runtime.tenantId = process.env.TENANT_ID;",
    "config.runtime.bind = 'lan';",
    "config.runtime.auth = config.runtime.auth ?? {};",
    "config.runtime.auth.mode = 'trusted_token';",
    "config.runtime.auth.trustedToken = config.runtime.auth.trustedToken ?? {};",
    "config.runtime.auth.trustedToken.issuer = process.env.RUNTIME_TOKEN_ISSUER;",
    "config.runtime.auth.trustedToken.hmacSecret = process.env.RUNTIME_TOKEN_SECRET;",
    "if ((process.env.RUNTIME_TOKEN_ACTIVE_KID || '').trim()) {",
    "  config.runtime.auth.trustedToken.activeKid = process.env.RUNTIME_TOKEN_ACTIVE_KID.trim();",
    "} else if (config.runtime.auth.trustedToken.activeKid) {",
    "  delete config.runtime.auth.trustedToken.activeKid;",
    "}",
    "fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\\n`, 'utf8');",
    "NODE",
    "HOME=\"$ROOT\" NEXUS_ROOT=\"$ROOT\" NEXUS_STATE_DIR=\"$ROOT/state\" node nexus.mjs runtime run --workspace \"$ROOT\" --port \"$RUNTIME_PORT\" --bind lan >\"$ROOT/runtime.log\" 2>&1 &",
    "RUNTIME_PID=$!",
    "node <<'NODE'",
    "const crypto = require('node:crypto');",
    "const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
    "const base64url = (value) => Buffer.from(value).toString('base64url');",
    "const signRuntimeToken = () => {",
    "  const header = { alg: 'HS256', typ: 'JWT' };",
    "  const now = Math.floor(Date.now() / 1000);",
    "  const payload = {",
    "    iss: process.env.RUNTIME_TOKEN_ISSUER,",
    "    aud: 'runtime-api',",
    "    iat: now,",
    "    exp: now + 300,",
    "    jti: `sandbox-${now}`,",
    "    tenant_id: process.env.TENANT_ID,",
    "    sub: 'system:frontdoor:sandbox',",
    "    entity_id: 'system:frontdoor:sandbox',",
    "    scopes: ['operator.admin'],",
    "    role: 'operator',",
    "    roles: ['owner'],",
    "    session_id: `sandbox-${process.env.TENANT_ID}`,",
    "    amr: ['frontdoor_sandbox'],",
    "    client_id: 'nexus-frontdoor-sandbox-provider',",
    "    display_name: 'Frontdoor Sandbox',",
    "  };",
    "  const encodedHeader = base64url(JSON.stringify(header));",
    "  const encodedPayload = base64url(JSON.stringify(payload));",
    "  const unsigned = `${encodedHeader}.${encodedPayload}`;",
    "  const signature = crypto.createHmac('sha256', process.env.RUNTIME_TOKEN_SECRET).update(unsigned).digest('base64url');",
    "  return `${unsigned}.${signature}`;",
    "};",
    "const main = async () => {",
    "  const healthUrl = `http://127.0.0.1:${process.env.RUNTIME_PORT}/health`;",
    "  let healthy = false;",
    "  for (let attempt = 0; attempt < 60; attempt += 1) {",
    "    const token = signRuntimeToken();",
    "    try {",
    "      const response = await fetch(healthUrl, { headers: { authorization: `Bearer ${token}` } });",
    "      if (response.ok) {",
    "        healthy = true;",
    "        break;",
    "      }",
    "    } catch {}",
    "    await wait(1000);",
    "  }",
    "  if (!healthy) {",
    "    throw new Error('sandbox_runtime_health_timeout');",
    "  }",
    "  const callbackBody = {",
    "    tenant_id: process.env.TENANT_ID,",
    "    server_id: process.env.SERVER_ID,",
    "    private_ip: '127.0.0.1',",
    "    transport_host: '127.0.0.1',",
    "    runtime_port: Number(process.env.RUNTIME_HOST_PORT),",
    "    status: 'running',",
    "  };",
    "  const callbackResponse = await fetch(`${process.env.FRONTDOOR_URL}/api/internal/provision-callback`, {",
    "    method: 'POST',",
    "    headers: {",
    "      authorization: `Bearer ${process.env.PROVISION_TOKEN}`,",
    "      'content-type': 'application/json',",
    "    },",
    "    body: JSON.stringify(callbackBody),",
    "  });",
    "  if (!callbackResponse.ok) {",
    "    throw new Error(`sandbox_provision_callback_failed:${callbackResponse.status}`);",
    "  }",
    "};",
    "main().catch((error) => {",
    "  console.error(String(error));",
    "  process.exit(1);",
    "});",
    "NODE",
    "wait \"$RUNTIME_PID\"",
    "",
  ].join("\n");
}

function mapDockerStateToProviderStatus(state: string | undefined): ProviderServerStatus["state"] {
  const normalized = (state || "").trim().toLowerCase();
  if (normalized === "running") {
    return "running";
  }
  if (normalized === "created" || normalized === "restarting") {
    return "creating";
  }
  if (normalized === "exited" || normalized === "stopped") {
    return "stopped";
  }
  if (normalized === "removing") {
    return "deleting";
  }
  return "error";
}

export class DockerSandboxProvider implements CloudProvider {
  private readonly imageName: string;
  private readonly hostStateRoot: string;
  private readonly dockerBin: string;
  private readonly frontdoorHostAlias: string;
  private readonly runtimeContainerPort: number;
  private readonly containerRoot: string;
  private readonly runner: SandboxCommandRunner;
  private readonly allocatePort: SandboxPortAllocator;

  constructor(config: DockerSandboxProviderConfig) {
    this.imageName = config.imageName.trim();
    if (!this.imageName) {
      throw new Error("sandbox_runtime_image_missing");
    }
    this.hostStateRoot = config.hostStateRoot?.trim() || path.join(os.tmpdir(), "frontdoor-sandbox-hosted-cleanroom");
    this.dockerBin = config.dockerBin?.trim() || "docker";
    this.frontdoorHostAlias = config.frontdoorHostAlias?.trim() || DEFAULT_FRONTDOOR_HOST_ALIAS;
    this.runtimeContainerPort = config.runtimeContainerPort ?? DEFAULT_RUNTIME_CONTAINER_PORT;
    this.containerRoot = config.containerRoot?.trim() || DEFAULT_CONTAINER_ROOT;
    this.runner = config.runner ?? ((args) => defaultRunDockerCommand(this.dockerBin, args));
    this.allocatePort = config.allocatePort ?? allocateEphemeralPort;
  }

  listPlans(): ServerPlan[] {
    return [
      {
        id: "cax11",
        name: "Starter",
        monthlyCostCents: getServerPlanMonthlyCostCents({ serverClass: "standard", planId: "cax11" }),
        vcpus: 2,
        memoryMb: 4096,
        diskGb: 40,
        architecture: "arm64",
      },
      {
        id: "cax21",
        name: "Standard",
        monthlyCostCents: getServerPlanMonthlyCostCents({ serverClass: "standard", planId: "cax21" }),
        vcpus: 4,
        memoryMb: 8192,
        diskGb: 80,
        architecture: "arm64",
      },
      {
        id: "cax31",
        name: "Performance",
        monthlyCostCents: getServerPlanMonthlyCostCents({ serverClass: "standard", planId: "cax31" }),
        vcpus: 8,
        memoryMb: 16384,
        diskGb: 160,
        architecture: "arm64",
      },
    ];
  }

  resolveHostServerRoot(providerServerId: string): string {
    return path.join(this.hostStateRoot, providerServerId);
  }

  resolveHostPackageStagingRoot(providerServerId: string): string {
    return path.join(this.resolveHostServerRoot(providerServerId), "state/packages/staging");
  }

  resolveRuntimePackageStagingRoot(): string {
    return `${this.containerRoot.replace(/\/+$/g, "")}/state/packages/staging`;
  }

  async createServer(opts: CreateServerOpts): Promise<CreateServerResult> {
    const suffix = sanitizeIdentifier(opts.hostedBootstrap.serverId || opts.tenantId);
    const providerServerId = `sandbox-${suffix}`;
    const runtimeHostPort = await this.allocatePort();
    const hostServerRoot = this.resolveHostServerRoot(providerServerId);
    const scriptHostPath = path.join(hostServerRoot, "frontdoor-sandbox-bootstrap.sh");
    const seedFilename = opts.hostedBootstrap.bootstrapSeedYaml ? "bootstrap-seed.source.yml" : undefined;
    const reachableFrontdoorUrl = rewriteFrontdoorUrlForContainer(
      opts.hostedBootstrap.frontdoorUrl,
      this.frontdoorHostAlias,
    );
    fs.mkdirSync(hostServerRoot, { recursive: true });
    if (opts.hostedBootstrap.bootstrapSeedYaml) {
      fs.writeFileSync(
        path.join(hostServerRoot, seedFilename!),
        `${opts.hostedBootstrap.bootstrapSeedYaml.trimEnd()}\n`,
        "utf8",
      );
    }
    fs.writeFileSync(
      scriptHostPath,
      `${buildSandboxBootstrapScript({
        containerRoot: this.containerRoot,
        runtimeContainerPort: this.runtimeContainerPort,
        runtimeHostPort,
        frontdoorUrl: reachableFrontdoorUrl,
        runtimeAuthToken: opts.hostedBootstrap.runtimeAuthToken,
        provisionToken: opts.hostedBootstrap.provisionToken,
        runtimeTokenIssuer: opts.hostedBootstrap.runtimeTokenIssuer,
        runtimeTokenSecret: opts.hostedBootstrap.runtimeTokenSecret,
        runtimeTokenActiveKid: opts.hostedBootstrap.runtimeTokenActiveKid,
        tenantId: opts.hostedBootstrap.tenantId,
        serverId: opts.hostedBootstrap.serverId,
        bootstrapSeedFilename: seedFilename,
      })}\n`,
      { encoding: "utf8", mode: 0o700 },
    );
    await this.runner([
      "rm",
      "-f",
      providerServerId,
    ]).catch(() => undefined);
    await this.runner([
      "run",
      "-d",
      "--name",
      providerServerId,
      "--hostname",
      `nex-${suffix}`,
      "--add-host",
      `${this.frontdoorHostAlias}:host-gateway`,
      "-p",
      `127.0.0.1:${runtimeHostPort}:${this.runtimeContainerPort}`,
      "-v",
      `${hostServerRoot}:${this.containerRoot}`,
      "-w",
      "/app",
      this.imageName,
      "bash",
      `${this.containerRoot}/frontdoor-sandbox-bootstrap.sh`,
    ]);
    return {
      providerServerId,
      publicIp: "",
      privateIp: "127.0.0.1",
      backupEnabled: false,
      deleteProtectionEnabled: false,
      rebuildProtectionEnabled: false,
    };
  }

  async getServerStatus(providerServerId: string): Promise<ProviderServerStatus> {
    try {
      const result = await this.runner([
        "inspect",
        providerServerId,
        "--format",
        "{{json .}}",
      ]);
      const parsed = JSON.parse(result.stdout) as DockerInspectRecord;
      const state = mapDockerStateToProviderStatus(parsed.State?.Status);
      return {
        state,
        privateIp: state === "running" ? "127.0.0.1" : undefined,
      };
    } catch {
      return { state: "error" };
    }
  }

  async archiveServer(providerServerId: string): Promise<void> {
    await this.runner(["stop", providerServerId]);
  }

  async restoreServer(providerServerId: string): Promise<void> {
    await this.runner(["start", providerServerId]);
  }

  async createRecoveryPoint(_providerServerId: string, _label: string): Promise<CreateRecoveryPointResult> {
    throw new Error("sandbox_recovery_not_supported");
  }

  async setProtection(
    _providerServerId: string,
    _protection: { delete: boolean; rebuild: boolean },
  ): Promise<void> {
    return;
  }

  async destroyServer(providerServerId: string): Promise<void> {
    await this.runner(["rm", "-f", providerServerId]);
    fs.rmSync(path.join(this.hostStateRoot, providerServerId), { recursive: true, force: true });
  }
}
