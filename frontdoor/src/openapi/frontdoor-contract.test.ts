import {
  createServer as createHttpServer,
  type Server as HttpServer,
} from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import AjvPkg from "ajv";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPasswordHash } from "../crypto.js";
import { FrontdoorStore } from "../frontdoor-store.js";
import * as sshHelper from "../ssh-helper.js";
import { createFrontdoorServer } from "../server.js";
import type { FrontdoorConfig } from "../types.js";
import { frontdoorOpenApiRoutes, type OpenApiSchema } from "./frontdoor-contract.js";

type Running = {
  server: HttpServer;
  origin: string;
};

const running: Running[] = [];
async function listen(server: HttpServer): Promise<Running> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const instance = {
    server,
    origin: `http://127.0.0.1:${addr.port}`,
  };
  running.push(instance);
  return instance;
}

function baseConfig(runtimeUrl: string): FrontdoorConfig {
  const frontdoorStorePath = path.join(tmpdir(), `nexus-frontdoor-contract-${randomUUID()}.db`);
  const user = {
    id: "u-owner",
    username: "owner",
    passwordHash: createPasswordHash("changeme"),
    tenantId: "tenant-dev",
    entityId: "entity-owner",
    displayName: "Owner",
    email: "owner@example.com",
    roles: ["operator"],
    scopes: ["*"],
    disabled: false,
  };
  return {
    host: "127.0.0.1",
    port: 0,
    baseUrl: "http://127.0.0.1",
    internalBaseUrl: "http://127.0.0.1",
    sessionCookieName: "nexus_fd_session",
    sessionTtlSeconds: 3600,
    sessionStorePath: undefined,
    frontdoorStorePath,
    operatorUserIds: new Set(["u-owner"]),
    devCreatorEmails: new Set<string>(),
    inviteTtlSeconds: 7 * 24 * 60 * 60,
    runtimeTokenIssuer: "https://frontdoor.test",
    runtimeTokenAudience: "runtime-api",
    runtimeTokenSecret: "frontdoor-secret-test",
    runtimeTokenActiveKid: undefined,
    runtimeTokenSecretsByKid: new Map(),
    runtimeTokenTtlSeconds: 600,
    runtimeRefreshTtlSeconds: 86400,
    rateLimits: {
      loginAttempts: { windowSeconds: 60, maxAttempts: 30, blockSeconds: 60 },
      loginFailures: { windowSeconds: 15 * 60, maxAttempts: 8, blockSeconds: 15 * 60 },
      tokenEndpoints: { windowSeconds: 60, maxAttempts: 120, blockSeconds: 60 },
      proxyRequests: { windowSeconds: 60, maxAttempts: 1000, blockSeconds: 30 },
    },
    tenants: new Map([
      [
        "tenant-dev",
        {
          id: "tenant-dev",
          runtimeUrl,
          runtimePublicBaseUrl: runtimeUrl,
        },
      ],
    ]),
    usersByUsername: new Map([[user.username, user]]),
    usersById: new Map([[user.id, user]]),
    oidcEnabled: false,
    oidcProviders: new Map(),
    oidcMappings: [],
    autoProvision: {
      enabled: false,
      storePath: undefined,
      providers: [],
      tenantIdPrefix: "tenant",
      defaultRoles: ["operator"],
      defaultScopes: ["operator.admin"],
      command: undefined,
      commandTimeoutMs: 120000,
    },
    billing: {
      provider: "mock",
      webhookSecret: "billing-webhook-secret-test",
      checkoutSuccessUrl: "https://frontdoor.test/billing/success",
      checkoutCancelUrl: "https://frontdoor.test/billing/cancel",
      stripeSecretKey: undefined,
      stripeApiBaseUrl: "https://api.stripe.com",
      stripePriceIdsByPlan: new Map(),
    },
    shellAppPath: "/app/console/chat",
    shellLoginPath: "/login",
    shellSignupPath: "/signup",
    shellDisplayName: "Nexus Dashboard",
    runtimeAuthToken: undefined,
    runtimeAuthHeader: "authorization",
    runtimeAuthScheme: "Bearer",
    sessionCookieSecure: false,
    sessionCookieSameSite: "lax",
    sessionCookieDomain: undefined,
    csrfProtectionEnabled: false,
    inviteEmailFrom: "noreply@example.com",
    inviteEmailSubject: "Invite",
    inviteEmailText: "Invite",
    inviteEmailHtml: "<p>Invite</p>",
    hstsEnabled: false,
    hstsMaxAgeSeconds: 31536000,
    hstsIncludeSubDomains: true,
    hstsPreload: false,
    artifactRegistryRoot: path.join(tmpdir(), `nexus-frontdoor-artifacts-${randomUUID()}`),
    appStoragePath: path.join(tmpdir(), `nexus-frontdoor-app-storage-${randomUUID()}`),
    vpsAccess: {
      sshKeyPath: "/tmp/test-ssh-key",
      sshUser: "root",
    },
  } as FrontdoorConfig;
}

function withStore<T>(config: FrontdoorConfig, run: (store: FrontdoorStore) => T): T {
  const storePath = config.frontdoorStorePath;
  if (!storePath) {
    throw new Error("frontdoor test config is missing a store path");
  }
  const store = new FrontdoorStore(storePath);
  try {
    return run(store);
  } finally {
    store.close();
  }
}

function seedProducts(
  config: FrontdoorConfig,
  items: Array<{ productId: string; displayName: string; visibility?: "customer" | "operator" }>,
): void {
  withStore(config, (store) => {
    for (const item of items) {
      store.upsertProduct({
        productId: item.productId,
        displayName: item.displayName,
        visibility: item.visibility ?? "customer",
      });
    }
  });
}

function stageFakePackage(
  config: FrontdoorConfig,
  packageId: string,
  version = "latest",
  kind: "app" | "adapter" | "service" | "runtime" = "app",
): void {
  const dir = path.join(config.appStoragePath, packageId, version);
  fs.mkdirSync(dir, { recursive: true });
  const tarballPath = path.join(dir, "pkg.tar.gz");
  fs.writeFileSync(tarballPath, `${packageId}@${version}\n`, "utf8");
  withStore(config, (store) => {
    store.upsertPackage({
      packageId,
      kind,
      displayName: packageId,
      productId: kind === "app" ? packageId : undefined,
    });
    const releaseId = `rel-${packageId}-${version}`;
    store.upsertPackageRelease({
      releaseId,
      packageId,
      version,
      manifestJson: JSON.stringify({ id: packageId, version }),
    });
    store.upsertPackageReleaseVariant({
      variantId: `variant-${packageId}-${version}-${process.platform}-${process.arch}`,
      releaseId,
      targetOs: process.platform,
      targetArch: process.arch,
      packageFormat: "tar.gz",
      tarballPath,
      sha256: createHash("sha256").update(fs.readFileSync(tarballPath)).digest("hex"),
      sizeBytes: fs.statSync(tarballPath).size,
    });
  });
}

async function login(origin: string): Promise<string> {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "owner", password: "changeme" }),
  });
  if (response.status !== 200) {
    throw new Error(`login failed: ${response.status}`);
  }
  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("missing session cookie");
  }
  return cookie.split(";")[0]!;
}

function routeResponseSchema(pathname: string, method: "get" | "post" | "delete", status: number): OpenApiSchema {
  const route = frontdoorOpenApiRoutes.find((entry) => entry.path === pathname && entry.method === method);
  if (!route) {
    throw new Error(`unknown openapi route: ${method.toUpperCase()} ${pathname}`);
  }
  const response = route.responses[String(status)];
  if (!response?.content?.["application/json"]?.schema) {
    throw new Error(`missing JSON schema for ${method.toUpperCase()} ${pathname} ${status}`);
  }
  return response.content["application/json"].schema;
}

const ajv = new (AjvPkg as unknown as new (opts?: object) => import("ajv").default)({
  allErrors: true,
  strict: false,
  validateFormats: false,
});

function expectSchemaMatch(schema: OpenApiSchema, value: unknown): void {
  const validate = ajv.compile(schema);
  const ok = validate(value);
  expect(ok, JSON.stringify(validate.errors, null, 2)).toBe(true);
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (running.length > 0) {
    const item = running.pop();
    await new Promise<void>((resolve) => item?.server.close(() => resolve()));
  }
});

describe("frontdoor OpenAPI contract conformance", () => {
  it("matches representative success responses for the published first-wave routes", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true, items: [] }));
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "glowbot", displayName: "GlowBot" }]);
    stageFakePackage(config, "glowbot");
    stageFakePackage(config, "glowbot", "1.0.1");
    stageFakePackage(config, "confluence", "0.1.0", "adapter");
    stageFakePackage(config, "confluence", "0.1.1", "adapter");
    vi.spyOn(sshHelper, "installPackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    vi.spyOn(sshHelper, "upgradePackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    vi.spyOn(sshHelper, "uninstallPackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const loginResp = await fetch(`${frontdoorRunning.origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "changeme" }),
    });
    expect(loginResp.status).toBe(200);
    const loginBody = await loginResp.json();
    expectSchemaMatch(routeResponseSchema("/api/auth/login", "post", 200), loginBody);
    const cookie = (loginResp.headers.get("set-cookie") ?? "").split(";")[0]!;

    const authMeResp = await fetch(`${frontdoorRunning.origin}/api/auth/me`, {
      headers: { cookie },
    });
    expect(authMeResp.status).toBe(200);
    expectSchemaMatch(routeResponseSchema("/api/auth/me", "get", 200), await authMeResp.json());

    const catalogResp = await fetch(`${frontdoorRunning.origin}/api/apps/catalog`);
    expect(catalogResp.status).toBe(200);
    expectSchemaMatch(routeResponseSchema("/api/apps/catalog", "get", 200), await catalogResp.json());

    const tokenResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
      headers: { cookie },
    });
    expect(tokenResp.status).toBe(200);
    const tokenBody = await tokenResp.json();
    expectSchemaMatch(routeResponseSchema("/api/runtime/token", "post", 200), tokenBody);

    const refreshResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: tokenBody.refresh_token }),
    });
    expect(refreshResp.status).toBe(200);
    const refreshBody = await refreshResp.json();
    expectSchemaMatch(routeResponseSchema("/api/runtime/token/refresh", "post", 200), refreshBody);

    const revokeResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshBody.refresh_token }),
    });
    expect(revokeResp.status).toBe(200);
    expectSchemaMatch(routeResponseSchema("/api/runtime/token/revoke", "post", 200), await revokeResp.json());

    const serverResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev`, {
      headers: { cookie },
    });
    expect(serverResp.status).toBe(200);
    expectSchemaMatch(routeResponseSchema("/api/servers/{serverId}", "get", 200), await serverResp.json());

    const purchaseResp = await fetch(`${frontdoorRunning.origin}/api/apps/glowbot/purchase`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ install: false }),
    });
    expect(purchaseResp.status).toBe(200);

    const installResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/glowbot/install`,
      { method: "POST", headers: { cookie } },
    );
    expect(installResp.status).toBe(200);
    expectSchemaMatch(
      routeResponseSchema("/api/servers/{serverId}/apps/{appId}/install", "post", 200),
      await installResp.json(),
    );

    const installStatusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/glowbot/install-status`,
      { headers: { cookie } },
    );
    expect(installStatusResp.status).toBe(200);
    expectSchemaMatch(
      routeResponseSchema("/api/servers/{serverId}/apps/{appId}/install-status", "get", 200),
      await installStatusResp.json(),
    );

    const appUpgradeResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/glowbot/upgrade`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ target_version: "1.0.1" }),
      },
    );
    expect(appUpgradeResp.status).toBe(200);
    expectSchemaMatch(
      routeResponseSchema("/api/servers/{serverId}/apps/{appId}/upgrade", "post", 200),
      await appUpgradeResp.json(),
    );

    const adapterInstallResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters/confluence/install`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ version: "0.1.0" }),
      },
    );
    expect(adapterInstallResp.status).toBe(200);
    expectSchemaMatch(
      routeResponseSchema("/api/servers/{serverId}/adapters/{adapterId}/install", "post", 200),
      await adapterInstallResp.json(),
    );

    const adapterStatusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters/confluence/install-status`,
      { headers: { cookie } },
    );
    expect(adapterStatusResp.status).toBe(200);
    expectSchemaMatch(
      routeResponseSchema("/api/servers/{serverId}/adapters/{adapterId}/install-status", "get", 200),
      await adapterStatusResp.json(),
    );

    const adapterUpgradeResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters/confluence/upgrade`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ target_version: "0.1.1" }),
      },
    );
    expect(adapterUpgradeResp.status).toBe(200);
    expectSchemaMatch(
      routeResponseSchema("/api/servers/{serverId}/adapters/{adapterId}/upgrade", "post", 200),
      await adapterUpgradeResp.json(),
    );

    const adapterUninstallResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters/confluence/install`,
      {
        method: "DELETE",
        headers: { cookie },
      },
    );
    expect(adapterUninstallResp.status).toBe(200);
    expectSchemaMatch(
      routeResponseSchema("/api/servers/{serverId}/adapters/{adapterId}/install", "delete", 200),
      await adapterUninstallResp.json(),
    );
  });

  it("matches representative error responses for the published first-wave routes", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true, items: [] }));
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [
      { productId: "glowbot", displayName: "GlowBot" },
      { productId: "spike", displayName: "Spike" },
    ]);
    stageFakePackage(config, "glowbot");
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const badLoginResp = await fetch(`${frontdoorRunning.origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "wrong-password" }),
    });
    expect(badLoginResp.status).toBe(401);
    expectSchemaMatch(routeResponseSchema("/api/auth/login", "post", 401), await badLoginResp.json());

    const authMeResp = await fetch(`${frontdoorRunning.origin}/api/auth/me`);
    expect(authMeResp.status).toBe(401);
    expectSchemaMatch(routeResponseSchema("/api/auth/me", "get", 401), await authMeResp.json());

    const runtimeTokenResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
    });
    expect(runtimeTokenResp.status).toBe(401);
    expectSchemaMatch(routeResponseSchema("/api/runtime/token", "post", 401), await runtimeTokenResp.json());

    const refreshResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: "rt-invalid" }),
    });
    expect(refreshResp.status).toBe(401);
    expectSchemaMatch(routeResponseSchema("/api/runtime/token/refresh", "post", 401), await refreshResp.json());

    const revokeResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: "rt-invalid" }),
    });
    expect(revokeResp.status).toBe(404);
    expectSchemaMatch(routeResponseSchema("/api/runtime/token/revoke", "post", 404), await revokeResp.json());

    const serverResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev`);
    expect(serverResp.status).toBe(401);
    expectSchemaMatch(routeResponseSchema("/api/servers/{serverId}", "get", 401), await serverResp.json());

    const installStatusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/glowbot/install-status`,
    );
    expect(installStatusResp.status).toBe(401);
    expectSchemaMatch(
      routeResponseSchema("/api/servers/{serverId}/apps/{appId}/install-status", "get", 401),
      await installStatusResp.json(),
    );

    const installAuthResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/glowbot/install`,
      { method: "POST" },
    );
    expect(installAuthResp.status).toBe(401);
    expectSchemaMatch(
      routeResponseSchema("/api/servers/{serverId}/apps/{appId}/install", "post", 401),
      await installAuthResp.json(),
    );

    const cookie = await login(frontdoorRunning.origin);
    const installForbiddenResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/spike/install`,
      { method: "POST", headers: { cookie } },
    );
    expect(installForbiddenResp.status).toBe(403);
    expectSchemaMatch(
      routeResponseSchema("/api/servers/{serverId}/apps/{appId}/install", "post", 403),
      await installForbiddenResp.json(),
    );
  });
});
