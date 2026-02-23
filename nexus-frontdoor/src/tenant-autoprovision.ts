import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { FrontdoorConfig, Principal, TenantConfig } from "./types.js";
import type { OidcClaims } from "./oidc-auth.js";
import { AutoProvisionStore, type OidcAccountRecord, type TenantRecord } from "./autoprovision-store.js";

type ProvisionCommandResult = {
  tenant_id?: string;
  runtime_url?: string;
  runtime_public_base_url?: string;
  runtime_ws_url?: string;
  runtime_sse_url?: string;
  state_dir?: string;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  return normalized || "customer";
}

async function runProvisionCommand(params: {
  command: string;
  payload: unknown;
  timeoutMs: number;
}): Promise<ProvisionCommandResult> {
  const command = params.command.trim();
  if (!command) {
    throw new Error("autoprovision_command_missing");
  }
  const payloadText = `${JSON.stringify(params.payload)}\n`;
  const child = spawn("bash", ["-lc", command], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  child.stdin.write(payloadText);
  child.stdin.end();
  const timeoutMs = Math.max(1_000, Math.floor(params.timeoutMs));
  const timeout = setTimeout(() => {
    child.kill("SIGTERM");
  }, timeoutMs);
  const exited = await exitPromise;
  clearTimeout(timeout);
  if (exited.code !== 0) {
    const summary = normalizeText(stderr) || normalizeText(stdout) || `exit_code_${String(exited.code)}`;
    throw new Error(`autoprovision_command_failed:${summary}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("autoprovision_command_invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("autoprovision_command_invalid_payload");
  }
  return parsed as ProvisionCommandResult;
}

function buildTenantConfigFromCommand(result: ProvisionCommandResult, tenantId: string): TenantRecord {
  const runtimeUrl = normalizeText(result.runtime_url);
  const runtimePublicBaseUrl =
    normalizeText(result.runtime_public_base_url) || runtimeUrl;
  const runtimeWsUrl = normalizeText(result.runtime_ws_url) || undefined;
  const runtimeSseUrl = normalizeText(result.runtime_sse_url) || undefined;
  if (!runtimeUrl || !runtimePublicBaseUrl) {
    throw new Error("autoprovision_runtime_url_missing");
  }
  return {
    id: tenantId,
    runtimeUrl,
    runtimePublicBaseUrl,
    runtimeWsUrl,
    runtimeSseUrl,
    stateDir: normalizeText(result.state_dir) || undefined,
  };
}

function principalFromAccount(account: OidcAccountRecord, claims: OidcClaims): Principal {
  return {
    userId: account.userId,
    tenantId: account.tenantId,
    entityId: account.entityId,
    displayName: account.displayName ?? claims.name,
    email: account.email ?? claims.email,
    roles: [...account.roles],
    scopes: [...account.scopes],
    amr: ["oidc"],
  };
}

export class TenantAutoProvisioner {
  private readonly store: AutoProvisionStore;

  constructor(private readonly config: FrontdoorConfig) {
    if (!config.autoProvision.storePath) {
      throw new Error("autoprovision_store_path_missing");
    }
    this.store = new AutoProvisionStore(config.autoProvision.storePath);
  }

  seedTenantsIntoConfig(): void {
    const tenants = this.store.listTenants();
    for (const tenant of tenants) {
      this.config.tenants.set(tenant.id, {
        id: tenant.id,
        runtimeUrl: tenant.runtimeUrl,
        runtimePublicBaseUrl: tenant.runtimePublicBaseUrl,
        runtimeWsUrl: tenant.runtimeWsUrl,
        runtimeSseUrl: tenant.runtimeSseUrl,
      });
    }
  }

  async resolveOrProvision(params: {
    provider: string;
    claims: OidcClaims;
    fallbackPrincipal: Principal | null;
  }): Promise<Principal | null> {
    if (params.fallbackPrincipal) {
      return params.fallbackPrincipal;
    }
    if (!this.config.autoProvision.enabled) {
      return null;
    }
    const provider = params.provider.trim().toLowerCase();
    if (!provider) {
      return null;
    }
    const providers = this.config.autoProvision.providers;
    if (providers.length > 0 && !providers.includes(provider)) {
      return null;
    }
    const subject = normalizeText(params.claims.sub);
    if (!subject) {
      return null;
    }

    const existing = this.store.getOidcAccount({ provider, subject });
    if (existing) {
      const tenant = this.store.getTenant(existing.tenantId);
      if (tenant) {
        this.config.tenants.set(existing.tenantId, {
          id: tenant.id,
          runtimeUrl: tenant.runtimeUrl,
          runtimePublicBaseUrl: tenant.runtimePublicBaseUrl,
          runtimeWsUrl: tenant.runtimeWsUrl,
          runtimeSseUrl: tenant.runtimeSseUrl,
        });
      }
      return principalFromAccount(existing, params.claims);
    }

    const baseIdentity = normalizeText(params.claims.email) || subject;
    const tenantId = `${this.config.autoProvision.tenantIdPrefix}-${toSlug(baseIdentity)}-${randomUUID().slice(0, 8)}`;
    const entityId = `entity:${provider}:${subject}`;
    const userId = `oidc:${provider}:${subject}`;
    const roles =
      this.config.autoProvision.defaultRoles.length > 0
        ? [...this.config.autoProvision.defaultRoles]
        : ["operator"];
    const scopes =
      this.config.autoProvision.defaultScopes.length > 0
        ? [...this.config.autoProvision.defaultScopes]
        : ["operator.admin"];

    const command = this.config.autoProvision.command;
    if (!command) {
      throw new Error("autoprovision_command_not_configured");
    }

    const commandResult = await runProvisionCommand({
      command,
      payload: {
        tenant_id: tenantId,
        provider,
        sub: subject,
        email: normalizeText(params.claims.email) || null,
        display_name: normalizeText(params.claims.name) || null,
        user_id: userId,
        entity_id: entityId,
        roles,
        scopes,
        runtime_token: {
          issuer: this.config.runtimeTokenIssuer,
          audience: this.config.runtimeTokenAudience,
          secret: this.config.runtimeTokenSecret,
        },
      },
      timeoutMs: this.config.autoProvision.commandTimeoutMs,
    });
    const commandTenantId = normalizeText(commandResult.tenant_id) || tenantId;
    const tenant = buildTenantConfigFromCommand(commandResult, commandTenantId);
    this.store.upsertTenant(tenant);
    this.config.tenants.set(tenant.id, {
      id: tenant.id,
      runtimeUrl: tenant.runtimeUrl,
      runtimePublicBaseUrl: tenant.runtimePublicBaseUrl,
      runtimeWsUrl: tenant.runtimeWsUrl,
      runtimeSseUrl: tenant.runtimeSseUrl,
    });

    const account: OidcAccountRecord = {
      provider,
      subject,
      userId,
      tenantId: tenant.id,
      entityId,
      email: normalizeText(params.claims.email) || undefined,
      displayName: normalizeText(params.claims.name) || undefined,
      roles,
      scopes,
    };
    this.store.upsertOidcAccount(account);
    return principalFromAccount(account, params.claims);
  }

  close(): void {
    this.store.close();
  }
}
