import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { FrontdoorConfig, Principal, TenantConfig } from "./types.js";
import type { OidcClaims } from "./oidc-auth.js";
import {
  AutoProvisionStore,
  type OidcAccountRecord,
  type ProvisionRequestRecord,
  type TenantRecord,
} from "./autoprovision-store.js";

type ProvisionCommandResult = {
  tenant_id?: string;
  runtime_url?: string;
  runtime_public_base_url?: string;
  runtime_ws_url?: string;
  runtime_sse_url?: string;
  runtime_auth_token?: string;
  state_dir?: string;
};

type ValidatedProvisionCommandResult = {
  tenantId?: string;
  runtimeUrl: string;
  runtimePublicBaseUrl: string;
  runtimeWsUrl?: string;
  runtimeSseUrl?: string;
  runtimeAuthToken?: string;
  stateDir?: string;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProductId(value: unknown): string {
  return normalizeText(value).toLowerCase();
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

function parseRequiredURL(
  fieldName: string,
  value: unknown,
  protocols: ReadonlySet<string>,
): string {
  const raw = normalizeText(value);
  if (!raw) {
    throw new Error(`autoprovision_${fieldName}_missing`);
  }
  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    if (!protocols.has(protocol)) {
      throw new Error(`autoprovision_${fieldName}_invalid_scheme`);
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("autoprovision_")) {
      throw error;
    }
    throw new Error(`autoprovision_${fieldName}_invalid`);
  }
}

function parseOptionalURL(
  fieldName: string,
  value: unknown,
  protocols: ReadonlySet<string>,
): string | undefined {
  const raw = normalizeText(value);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    if (!protocols.has(protocol)) {
      throw new Error(`autoprovision_${fieldName}_invalid_scheme`);
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("autoprovision_")) {
      throw error;
    }
    throw new Error(`autoprovision_${fieldName}_invalid`);
  }
}

function validateProvisionCommandResult(
  result: ProvisionCommandResult,
): ValidatedProvisionCommandResult {
  const runtimeUrl = parseRequiredURL(
    "runtime_url",
    result.runtime_url,
    new Set(["http:", "https:"]),
  );
  const runtimePublicBaseUrl = parseRequiredURL(
    "runtime_public_base_url",
    result.runtime_public_base_url,
    new Set(["http:", "https:"]),
  );
  const runtimeWsUrl = parseOptionalURL(
    "runtime_ws_url",
    result.runtime_ws_url,
    new Set(["ws:", "wss:"]),
  );
  const runtimeSseUrl = parseOptionalURL(
    "runtime_sse_url",
    result.runtime_sse_url,
    new Set(["http:", "https:"]),
  );
  return {
    tenantId: normalizeText(result.tenant_id) || undefined,
    runtimeUrl,
    runtimePublicBaseUrl,
    runtimeWsUrl,
    runtimeSseUrl,
    runtimeAuthToken: normalizeText(result.runtime_auth_token) || undefined,
    stateDir: normalizeText(result.state_dir) || undefined,
  };
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
  const validated = validateProvisionCommandResult(result);
  return {
    id: tenantId,
    runtimeUrl: validated.runtimeUrl,
    runtimePublicBaseUrl: validated.runtimePublicBaseUrl,
    runtimeWsUrl: validated.runtimeWsUrl,
    runtimeSseUrl: validated.runtimeSseUrl,
    runtimeAuthToken: validated.runtimeAuthToken,
    stateDir: validated.stateDir,
  };
}

function principalFromAccount(
  account: OidcAccountRecord,
  claims: OidcClaims,
  tenantIdOverride?: string,
): Principal {
  return {
    userId: account.userId,
    tenantId: tenantIdOverride ?? account.tenantId,
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
        runtimeAuthToken: tenant.runtimeAuthToken,
      });
    }
  }

  getLatestProvisionRequestByUser(userId: string): ProvisionRequestRecord | null {
    return this.store.getLatestProvisionRequestByUser(userId);
  }

  getLatestProvisionRequestByOidcIdentity(params: {
    provider: string;
    subject: string;
  }): ProvisionRequestRecord | null {
    return this.store.getLatestProvisionRequestByOidcIdentity(params);
  }

  getProvisionRequest(requestId: string): ProvisionRequestRecord | null {
    return this.store.getProvisionRequest(requestId);
  }

  async resolveOrProvision(params: {
    provider: string;
    claims: OidcClaims;
    fallbackPrincipal: Principal | null;
    productId?: string;
  }): Promise<Principal | null> {
    if (!this.config.autoProvision.enabled) {
      return params.fallbackPrincipal;
    }
    const productId = normalizeProductId(params.productId);
    if (params.fallbackPrincipal && !productId) {
      return params.fallbackPrincipal;
    }
    const provider = params.provider.trim().toLowerCase();
    if (!provider) {
      return params.fallbackPrincipal;
    }
    const providers = this.config.autoProvision.providers;
    if (providers.length > 0 && !providers.includes(provider)) {
      return params.fallbackPrincipal;
    }
    const subject = normalizeText(params.claims.sub);
    if (!subject) {
      return params.fallbackPrincipal;
    }

    const existing = this.store.getOidcAccount({ provider, subject });
    if (existing) {
      if (productId) {
        const productTenant = this.store.getUserProductTenant({
          userId: existing.userId,
          productId,
        });
        if (productTenant) {
          const mappedTenant = this.store.getTenant(productTenant.tenantId);
          if (mappedTenant) {
            this.config.tenants.set(mappedTenant.id, {
              id: mappedTenant.id,
              runtimeUrl: mappedTenant.runtimeUrl,
              runtimePublicBaseUrl: mappedTenant.runtimePublicBaseUrl,
              runtimeWsUrl: mappedTenant.runtimeWsUrl,
              runtimeSseUrl: mappedTenant.runtimeSseUrl,
              runtimeAuthToken: mappedTenant.runtimeAuthToken,
            });
            return principalFromAccount(existing, params.claims, mappedTenant.id);
          }
        }
      } else {
        const tenant = this.store.getTenant(existing.tenantId);
        if (tenant) {
          this.config.tenants.set(existing.tenantId, {
            id: tenant.id,
            runtimeUrl: tenant.runtimeUrl,
            runtimePublicBaseUrl: tenant.runtimePublicBaseUrl,
            runtimeWsUrl: tenant.runtimeWsUrl,
            runtimeSseUrl: tenant.runtimeSseUrl,
            runtimeAuthToken: tenant.runtimeAuthToken,
          });
          return principalFromAccount(existing, params.claims);
        }
      }
    }

    const baseIdentity = normalizeText(params.claims.email) || subject;
    const tenantPrefix = productId
      ? `${this.config.autoProvision.tenantIdPrefix}-${toSlug(productId)}`
      : this.config.autoProvision.tenantIdPrefix;
    const tenantId = `${tenantPrefix}-${toSlug(baseIdentity)}-${randomUUID().slice(0, 8)}`;
    const fallbackUserId = normalizeText(params.fallbackPrincipal?.userId);
    const fallbackEntityId = normalizeText(params.fallbackPrincipal?.entityId);
    const entityId = existing?.entityId || fallbackEntityId || `entity:${provider}:${subject}`;
    const userId = existing?.userId || fallbackUserId || `oidc:${provider}:${subject}`;
    const roles =
      existing?.roles && existing.roles.length > 0
        ? [...existing.roles]
        : params.fallbackPrincipal?.roles && params.fallbackPrincipal.roles.length > 0
          ? [...params.fallbackPrincipal.roles]
        : this.config.autoProvision.defaultRoles.length > 0
          ? [...this.config.autoProvision.defaultRoles]
          : ["operator"];
    const scopes =
      existing?.scopes && existing.scopes.length > 0
        ? [...existing.scopes]
        : params.fallbackPrincipal?.scopes && params.fallbackPrincipal.scopes.length > 0
          ? [...params.fallbackPrincipal.scopes]
        : this.config.autoProvision.defaultScopes.length > 0
          ? [...this.config.autoProvision.defaultScopes]
          : ["operator.admin"];

    const command = this.config.autoProvision.command;
    if (!command) {
      throw new Error("autoprovision_command_not_configured");
    }

    const requestId = randomUUID();
    this.store.startProvisionRequest({
      requestId,
      userId,
      provider,
      subject,
      tenantId,
      status: "provisioning",
      stage: "run_command",
    });

    try {
      const commandResult = await runProvisionCommand({
        command,
        payload: {
          request_id: requestId,
          tenant_id: tenantId,
          provider,
          sub: subject,
          email: normalizeText(params.claims.email) || null,
          display_name: normalizeText(params.claims.name) || null,
          user_id: userId,
          entity_id: entityId,
          product_id: productId || null,
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
      this.store.completeProvisionSuccess({
        requestId,
        tenant,
        account,
        productId: productId || undefined,
        stage: "complete",
      });
      this.config.tenants.set(tenant.id, {
        id: tenant.id,
        runtimeUrl: tenant.runtimeUrl,
        runtimePublicBaseUrl: tenant.runtimePublicBaseUrl,
        runtimeWsUrl: tenant.runtimeWsUrl,
        runtimeSseUrl: tenant.runtimeSseUrl,
        runtimeAuthToken: tenant.runtimeAuthToken,
      });
      return principalFromAccount(account, params.claims);
    } catch (error) {
      this.store.updateProvisionRequest({
        requestId,
        status: "failed",
        stage: "failed",
        tenantId,
        errorText: String(error),
      });
      throw error;
    }
  }

  close(): void {
    this.store.close();
  }
}
