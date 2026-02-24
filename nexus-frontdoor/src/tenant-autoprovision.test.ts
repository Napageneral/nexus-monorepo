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
    sessionCookieName: "nexus_fd_session",
    sessionTtlSeconds: 3600,
    sessionStorePath: undefined,
    workspaceOwnerUserIds: new Set(),
    workspaceDevCreatorEmails: new Set(),
    workspaceInviteTtlSeconds: 7 * 24 * 60 * 60,
    runtimeTokenIssuer: "https://frontdoor.test",
    runtimeTokenAudience: "control-plane",
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
});
