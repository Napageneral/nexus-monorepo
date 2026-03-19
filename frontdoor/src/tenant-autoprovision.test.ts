import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TenantAutoProvisioner } from "./tenant-autoprovision.js";
import type { FrontdoorConfig } from "./types.js";

const tempDirs: string[] = [];

function mkTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-frontdoor-autoprovision-"));
  tempDirs.push(dir);
  return dir;
}

function quoteShell(value: string): string {
  return JSON.stringify(value);
}

function baseConfig(storePath: string): FrontdoorConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    baseUrl: "http://127.0.0.1",
    internalBaseUrl: "http://127.0.0.1",
    sessionCookieName: "nexus_fd_session",
    sessionTtlSeconds: 3600,
    sessionStorePath: undefined,
    operatorUserIds: new Set(),
    devCreatorEmails: new Set(),
    inviteTtlSeconds: 7 * 24 * 60 * 60,
    runtimeTokenIssuer: "https://frontdoor.test",
    runtimeTokenAudience: "runtime-api",
    runtimeTokenSecret: "frontdoor-secret-test",
    runtimeTokenActiveKid: undefined,
    runtimeTokenSecretsByKid: new Map(),
    runtimeTokenTtlSeconds: 600,
    runtimeRefreshTtlSeconds: 86400,
    rateLimits: {
      loginAttempts: {
        windowSeconds: 60,
        maxAttempts: 30,
        blockSeconds: 60,
      },
      loginFailures: {
        windowSeconds: 15 * 60,
        maxAttempts: 8,
        blockSeconds: 15 * 60,
      },
      tokenEndpoints: {
        windowSeconds: 60,
        maxAttempts: 120,
        blockSeconds: 60,
      },
      proxyRequests: {
        windowSeconds: 60,
        maxAttempts: 1000,
        blockSeconds: 30,
      },
    },
    tenants: new Map(),
    usersByUsername: new Map(),
    usersById: new Map(),
    oidcEnabled: true,
    oidcProviders: new Map(),
    oidcMappings: [],
    autoProvision: {
      enabled: true,
      storePath,
      providers: ["google"],
      tenantIdPrefix: "tenant",
      defaultRoles: ["operator"],
      defaultScopes: ["operator.admin"],
      command: undefined,
      commandTimeoutMs: 120000,
    },
    billing: {
      provider: "none",
      webhookSecret: undefined,
      checkoutSuccessUrl: undefined,
      checkoutCancelUrl: undefined,
      stripeSecretKey: undefined,
      stripeApiBaseUrl: "https://api.stripe.com",
      stripePriceIdsByPlan: new Map(),
    },
    vpsAccess: {
      sshKeyPath: "/tmp/test-ssh-key",
      sshUser: "root",
    },
    appStoragePath: "/tmp/test-app-storage",
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("TenantAutoProvisioner", () => {
  it("provisions on first OIDC login and reuses mapping on subsequent logins", async () => {
    const tempDir = mkTempDir();
    const storePath = path.join(tempDir, "autoprovision.db");
    const scriptPath = path.join(tempDir, "provision.mjs");
    const callCountPath = path.join(tempDir, "calls.txt");
    fs.writeFileSync(callCountPath, "0\n", "utf8");
    fs.writeFileSync(
      scriptPath,
      `
import fs from "node:fs";
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk.toString(); });
process.stdin.on("end", () => {
  const payload = JSON.parse(raw || "{}");
  const count = Number(fs.readFileSync(${JSON.stringify(callCountPath)}, "utf8").trim() || "0");
  fs.writeFileSync(${JSON.stringify(callCountPath)}, String(count + 1) + "\\n", "utf8");
  process.stdout.write(JSON.stringify({
    tenant_id: payload.tenant_id,
    runtime_url: "http://127.0.0.1:41000",
    runtime_public_base_url: "https://tenant.example.com"
  }));
});
`,
      "utf8",
    );

    const config = baseConfig(storePath);
    config.autoProvision.command = `${quoteShell(process.execPath)} ${quoteShell(scriptPath)}`;

    const provisioner = new TenantAutoProvisioner(config);
    const first = await provisioner.resolveOrProvision({
      provider: "google",
      claims: {
        sub: "google-sub-123",
        email: "alice@example.com",
        name: "Alice",
      },
      fallbackPrincipal: null,
    });
    expect(first).toBeTruthy();
    expect(first?.tenantId).toMatch(/^tenant-/);
    expect(first?.entityId).toBe("entity:google:google-sub-123");
    expect(config.tenants.has(first?.tenantId ?? "")).toBe(true);

    const second = await provisioner.resolveOrProvision({
      provider: "google",
      claims: {
        sub: "google-sub-123",
        email: "alice@example.com",
        name: "Alice",
      },
      fallbackPrincipal: null,
    });
    expect(second).toBeTruthy();
    expect(second?.tenantId).toBe(first?.tenantId);
    expect(second?.entityId).toBe(first?.entityId);

    const callCount = Number(fs.readFileSync(callCountPath, "utf8").trim() || "0");
    expect(callCount).toBe(1);

    provisioner.close();
  });

  it("fails when provision command omits runtime_public_base_url", async () => {
    const tempDir = mkTempDir();
    const storePath = path.join(tempDir, "autoprovision.db");
    const scriptPath = path.join(tempDir, "provision-invalid.mjs");
    fs.writeFileSync(
      scriptPath,
      `
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk.toString(); });
process.stdin.on("end", () => {
  const payload = JSON.parse(raw || "{}");
  process.stdout.write(JSON.stringify({
    tenant_id: payload.tenant_id,
    runtime_url: "http://127.0.0.1:42000"
  }));
});
`,
      "utf8",
    );
    const config = baseConfig(storePath);
    config.autoProvision.command = `${quoteShell(process.execPath)} ${quoteShell(scriptPath)}`;

    const provisioner = new TenantAutoProvisioner(config);
    await expect(
      provisioner.resolveOrProvision({
        provider: "google",
        claims: {
          sub: "google-sub-bad",
          email: "bad@example.com",
          name: "Bad",
        },
        fallbackPrincipal: null,
      }),
    ).rejects.toThrow(/autoprovision_runtime_public_base_url_missing/);

    const request = provisioner.getLatestProvisionRequestByOidcIdentity({
      provider: "google",
      subject: "google-sub-bad",
    });
    expect(request).toBeTruthy();
    expect(request?.status).toBe("failed");
    expect(String(request?.errorText || "")).toContain("autoprovision_runtime_public_base_url_missing");
    provisioner.close();
  });

  it("reuses existing tenant and creates per-product mappings for the same OIDC identity", async () => {
    const tempDir = mkTempDir();
    const storePath = path.join(tempDir, "autoprovision.db");
    const scriptPath = path.join(tempDir, "provision-product-aware.mjs");
    const callCountPath = path.join(tempDir, "calls.txt");
    const payloadLogPath = path.join(tempDir, "payloads.jsonl");
    fs.writeFileSync(callCountPath, "0\n", "utf8");
    fs.writeFileSync(payloadLogPath, "", "utf8");
    fs.writeFileSync(
      scriptPath,
      `
import fs from "node:fs";
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk.toString(); });
process.stdin.on("end", () => {
  const payload = JSON.parse(raw || "{}");
  const product = String(payload.product_id || "none").trim().toLowerCase();
  const count = Number(fs.readFileSync(${JSON.stringify(callCountPath)}, "utf8").trim() || "0");
  fs.writeFileSync(${JSON.stringify(callCountPath)}, String(count + 1) + "\\n", "utf8");
  fs.appendFileSync(${JSON.stringify(payloadLogPath)}, JSON.stringify({ product_id: payload.product_id ?? null }) + "\\n", "utf8");
  const port = product === "glowbot" ? 7422 : 7423;
  process.stdout.write(JSON.stringify({
    tenant_id: payload.tenant_id,
    runtime_url: \`http://127.0.0.1:\${port}\`,
    runtime_public_base_url: \`https://\${product || "none"}.example.com\`
  }));
});
`,
      "utf8",
    );
    const config = baseConfig(storePath);
    config.autoProvision.command = `${quoteShell(process.execPath)} ${quoteShell(scriptPath)}`;

    const provisioner = new TenantAutoProvisioner(config);
    const glowbotFirst = await provisioner.resolveOrProvision({
      provider: "google",
      claims: {
        sub: "google-sub-abc",
        email: "alice@example.com",
        name: "Alice",
      },
      fallbackPrincipal: null,
      productId: "glowbot",
    });
    const glowbotSecond = await provisioner.resolveOrProvision({
      provider: "google",
      claims: {
        sub: "google-sub-abc",
        email: "alice@example.com",
        name: "Alice",
      },
      fallbackPrincipal: null,
      productId: "glowbot",
    });
    const spikeFirst = await provisioner.resolveOrProvision({
      provider: "google",
      claims: {
        sub: "google-sub-abc",
        email: "alice@example.com",
        name: "Alice",
      },
      fallbackPrincipal: null,
      productId: "spike",
    });
    const spikeSecond = await provisioner.resolveOrProvision({
      provider: "google",
      claims: {
        sub: "google-sub-abc",
        email: "alice@example.com",
        name: "Alice",
      },
      fallbackPrincipal: null,
      productId: "spike",
    });

    expect(glowbotFirst?.tenantId).toMatch(/^tenant-/);
    expect(glowbotSecond?.tenantId).toBe(glowbotFirst?.tenantId);
    expect(spikeFirst?.tenantId).toMatch(/^tenant-/);
    expect(spikeFirst?.tenantId).not.toBe(glowbotFirst?.tenantId);
    expect(spikeSecond?.tenantId).toBe(spikeFirst?.tenantId);

    const callCount = Number(fs.readFileSync(callCountPath, "utf8").trim() || "0");
    expect(callCount).toBe(2);
    const payloadProducts = fs
      .readFileSync(payloadLogPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { product_id: string | null })
      .map((item) => item.product_id);
    expect(payloadProducts).toEqual(["glowbot", "spike"]);
    provisioner.close();
  });

  it("provisions product-specific tenant when only fallback tenant is available", async () => {
    const tempDir = mkTempDir();
    const storePath = path.join(tempDir, "autoprovision.db");
    const scriptPath = path.join(tempDir, "provision-should-not-run.mjs");
    const callCountPath = path.join(tempDir, "calls.txt");
    fs.writeFileSync(callCountPath, "0\n", "utf8");
    fs.writeFileSync(
      scriptPath,
      `
import fs from "node:fs";
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk.toString(); });
process.stdin.on("end", () => {
  const payload = JSON.parse(raw || "{}");
  const count = Number(fs.readFileSync(${JSON.stringify(callCountPath)}, "utf8").trim() || "0");
  fs.writeFileSync(${JSON.stringify(callCountPath)}, String(count + 1) + "\\n", "utf8");
  process.stdout.write(JSON.stringify({
    tenant_id: payload.tenant_id,
    runtime_url: "http://127.0.0.1:7522",
    runtime_public_base_url: "https://tenant.example.com"
  }));
});
`,
      "utf8",
    );

    const config = baseConfig(storePath);
    config.tenants.set("tenant-existing", {
      id: "tenant-existing",
      runtimeUrl: "http://127.0.0.1:7000",
      runtimePublicBaseUrl: "https://tenant-existing.example.com",
    });
    config.autoProvision.command = `${quoteShell(process.execPath)} ${quoteShell(scriptPath)}`;

    const provisioner = new TenantAutoProvisioner(config);
    const first = await provisioner.resolveOrProvision({
      provider: "google",
      claims: {
        sub: "google-sub-fallback",
        email: "owner@example.com",
        name: "Owner",
      },
      fallbackPrincipal: {
        userId: "u-owner",
        tenantId: "tenant-existing",
        entityId: "entity-owner",
        displayName: "Owner",
        email: "owner@example.com",
        roles: ["operator"],
        scopes: ["operator.admin"],
        amr: ["password"],
      },
      productId: "spike",
    });
    expect(first?.tenantId).toMatch(/^tenant-/);
    expect(first?.tenantId).not.toBe("tenant-existing");
    expect(first?.userId).toBe("u-owner");
    expect(first?.entityId).toBe("entity-owner");

    const second = await provisioner.resolveOrProvision({
      provider: "google",
      claims: {
        sub: "google-sub-fallback",
        email: "owner@example.com",
        name: "Owner",
      },
      fallbackPrincipal: null,
      productId: "spike",
    });
    expect(second?.tenantId).toBe(first?.tenantId);
    expect(second?.userId).toBe("u-owner");

    const callCount = Number(fs.readFileSync(callCountPath, "utf8").trim() || "0");
    expect(callCount).toBe(1);
    provisioner.close();
  });
});
