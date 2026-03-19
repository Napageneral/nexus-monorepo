import {
  createServer as createHttpServer,
  type IncomingMessage,
  request as httpRequest,
  type Server as HttpServer,
} from "node:http";
import fs from "node:fs";
import { createHmac, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { AddressInfo } from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { AutoProvisionStore } from "./autoprovision-store.js";
import type { CloudProvider } from "./cloud-provider.js";
import { createPasswordHash } from "./crypto.js";
import { FrontdoorStore } from "./frontdoor-store.js";
import { publishAppRelease } from "./publish-app-release.js";
import { createFrontdoorServer } from "./server.js";
import * as sshHelper from "./ssh-helper.js";
import type { FrontdoorConfig } from "./types.js";

type Running = {
  server: HttpServer;
  origin: string;
};

const running: Running[] = [];
const SEEDED_ACCOUNT_ID = "config-account:tenant-dev";
const GLOWBOT_ADMIN_APP_ROOT = "/Users/tyler/nexus/home/projects/nexus/apps/glowbot/admin";
const GLOWBOT_HUB_APP_ROOT = "/Users/tyler/nexus/home/projects/nexus/apps/glowbot/hub";

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

async function readRequestText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function baseConfig(runtimeUrl: string): FrontdoorConfig {
  const frontdoorStorePath = path.join(tmpdir(), `nexus-frontdoor-${randomUUID()}.db`);
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
    passwordAuthEnabled: true,
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
    vpsAccess: {
      sshKeyPath: "/tmp/test-ssh-key",
      sshUser: "root",
    },
    appStoragePath: path.join(tmpdir(), `test-app-storage-${randomUUID()}`),
  };
}

function seedProducts(
  config: FrontdoorConfig,
  items: Array<{ productId: string; displayName: string; visibility?: "customer" | "operator" }>,
): void {
  const storePath = config.frontdoorStorePath;
  if (!storePath) {
    throw new Error("frontdoor test config is missing a store path");
  }
  const store = new FrontdoorStore(storePath);
  try {
    for (const item of items) {
      store.upsertProduct({
        productId: item.productId,
        displayName: item.displayName,
        visibility: item.visibility ?? "customer",
      });
    }
  } finally {
    store.close();
  }
}

function addUserToConfig(
  config: FrontdoorConfig,
  user: {
    id: string;
    username: string;
    passwordHash: string;
    tenantId: string;
    entityId: string;
    displayName: string;
    email: string;
    roles: string[];
    scopes: string[];
  },
): void {
  config.usersByUsername.set(user.username, {
    ...user,
    disabled: false,
  });
  config.usersById.set(user.id, {
    ...user,
    disabled: false,
  });
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

function stageFakePackage(
  config: FrontdoorConfig,
  packageId: string,
  version = "latest",
  kind: "app" | "adapter" | "service" | "runtime" = "app",
  manifestOverride?: Record<string, unknown>,
): string {
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
      manifestJson: JSON.stringify(manifestOverride ?? { id: packageId, version }),
    });
    store.upsertPackageReleaseVariant({
      variantId: `variant-${packageId}-${version}-darwin-arm64`,
      releaseId,
      targetOs: "darwin",
      targetArch: "arm64",
      packageFormat: "tar.gz",
      tarballPath,
      sizeBytes: fs.statSync(tarballPath).size,
    });
  });
  return tarballPath;
}

function seedPlatformManagedOauthProfile(config: FrontdoorConfig, params?: {
  managedProfileId?: string;
  appId?: string;
  adapterId?: string;
  authMethodId?: string;
  service?: string;
  clientSecretRef?: string;
}): void {
  withStore(config, (store) => {
    store.upsertPlatformManagedConnectionProfile({
      managedProfileId: params?.managedProfileId ?? "glowbot-google-oauth",
      appId: params?.appId ?? "glowbot",
      adapterId: params?.adapterId ?? "google",
      authMethodId: params?.authMethodId ?? "google_oauth_managed",
      flowKind: "oauth2",
      service: params?.service ?? "google",
      displayName: "GlowBot Google OAuth",
      authorizeUrl: "https://accounts.example.com/o/oauth2/auth",
      tokenUrl: "https://accounts.example.com/o/oauth2/token",
      clientId: "glowbot-google-client-id",
      clientSecretRef: params?.clientSecretRef ?? "env:GLOWBOT_GOOGLE_CLIENT_SECRET",
      scopes: ["openid", "email", "profile"],
      authorizeParams: {
        access_type: "offline",
        prompt: "consent",
      },
    });
  });
}

function seedProductControlPlaneRoute(config: FrontdoorConfig, params: {
  appId: string;
  displayName?: string;
  baseUrl: string;
  authTokenRef: string;
}): void {
  withStore(config, (store) => {
    store.upsertProductControlPlaneRoute({
      appId: params.appId,
      displayName: params.displayName ?? `${params.appId} control plane`,
      baseUrl: params.baseUrl,
      authTokenRef: params.authTokenRef,
    });
  });
}

async function login(
  frontdoorOrigin: string,
  credentials: { username?: string; password?: string } = {},
): Promise<string> {
  const username = credentials.username ?? "owner";
  const password = credentials.password ?? "changeme";
  const response = await fetch(`${frontdoorOrigin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return String(setCookie).split(";")[0];
}

function decodeJwtHeader(token: string): Record<string, unknown> {
  const headerPart = token.split(".")[0] ?? "";
  return JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as Record<string, unknown>;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payloadPart = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Record<string, unknown>;
}

type TestSigningKey = {
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
  publicJwk: Record<string, unknown>;
};

function buildSigningKey(kid: string): TestSigningKey {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = pair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  return {
    privateKey: pair.privateKey,
    publicJwk: {
      ...publicJwk,
      kid,
      use: "sig",
      alg: "RS256",
    },
  };
}

function signRs256Jwt(params: {
  privateKey: TestSigningKey["privateKey"];
  kid: string;
  claims: Record<string, unknown>;
}): string {
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: params.kid,
  };
  const headerPart = Buffer.from(JSON.stringify(header), "utf8").toString("base64url");
  const payloadPart = Buffer.from(JSON.stringify(params.claims), "utf8").toString("base64url");
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput, "utf8"), params.privateKey).toString(
    "base64url",
  );
  return `${signingInput}.${signature}`;
}

afterEach(async () => {
  while (running.length > 0) {
    const item = running.pop();
    if (!item) {
      continue;
    }
    await new Promise<void>((resolve) => item.server.close(() => resolve()));
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("managed connection profile endpoints", () => {
  it("returns managed oauth metadata for an installed app when the runtime is authenticated", async () => {
    const config = baseConfig("http://127.0.0.1:18789");
    config.tenants.set("tenant-dev", {
      id: "tenant-dev",
      runtimeUrl: "http://127.0.0.1:18789",
      runtimePublicBaseUrl: "http://127.0.0.1:18789",
      runtimeAuthToken: "rt-frontdoor-managed-test",
    });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    withStore(config, (store) => {
      store.upsertServerAppInstall({
        serverId: "tenant-dev",
        appId: "glowbot",
        status: "installed",
      });
    });
    seedPlatformManagedOauthProfile(config);

    const response = await fetch(
      `${frontdoorRunning.origin}/api/internal/managed-connections/profile?service=google&app_id=glowbot&adapter_id=google&auth_method_id=google_oauth_managed&managed_profile_id=glowbot-google-oauth`,
      {
        headers: {
          authorization: "Bearer rt-frontdoor-managed-test",
          "x-nexus-auth-via": "frontdoor",
          "x-nexus-entity-id": "entity-owner",
          "x-nexus-tenant-id": "tenant-dev",
          "x-nexus-app-id": "glowbot",
          "x-nexus-adapter-id": "google",
          "x-nexus-auth-method-id": "google_oauth_managed",
          "x-nexus-managed-profile-id": "glowbot-google-oauth",
        },
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      managedProfileId?: string;
      authUri?: string;
      clientId?: string;
      scopes?: string[];
      authorizeParams?: Record<string, string>;
    };
    expect(body.managedProfileId).toBe("glowbot-google-oauth");
    expect(body.authUri).toBe("https://accounts.example.com/o/oauth2/auth");
    expect(body.clientId).toBe("glowbot-google-client-id");
    expect(body.scopes).toEqual(["openid", "email", "profile"]);
    expect(body.authorizeParams).toEqual({
      access_type: "offline",
      prompt: "consent",
    });
  });

  it("exchanges an oauth code using the managed profile secret ref without exposing the secret", async () => {
    const config = baseConfig("http://127.0.0.1:18789");
    config.tenants.set("tenant-dev", {
      id: "tenant-dev",
      runtimeUrl: "http://127.0.0.1:18789",
      runtimePublicBaseUrl: "http://127.0.0.1:18789",
      runtimeAuthToken: "rt-frontdoor-managed-test",
    });
    const prevSecret = process.env.GLOWBOT_GOOGLE_CLIENT_SECRET;
    process.env.GLOWBOT_GOOGLE_CLIENT_SECRET = "google-secret-value";
    const realFetch = globalThis.fetch;
    const providerFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url === "https://accounts.example.com/o/oauth2/token") {
        const body = String(init?.body ?? "");
        expect(body).toContain("client_secret=google-secret-value");
        expect(body).toContain("code=provider-auth-code");
        return new Response(
          JSON.stringify({
            access_token: "provider-access-token",
            refresh_token: "provider-refresh-token",
            expires_in: 3600,
            token_type: "Bearer",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }
      return await realFetch(input as never, init);
    });
    vi.stubGlobal("fetch", providerFetch);

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    withStore(config, (store) => {
      store.upsertServerAppInstall({
        serverId: "tenant-dev",
        appId: "glowbot",
        status: "installed",
      });
    });
    seedPlatformManagedOauthProfile(config);

    try {
      const response = await fetch(
        `${frontdoorRunning.origin}/api/internal/managed-connections/profile/exchange`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer rt-frontdoor-managed-test",
            "content-type": "application/json",
            "x-nexus-auth-via": "frontdoor",
            "x-nexus-entity-id": "entity-owner",
            "x-nexus-tenant-id": "tenant-dev",
            "x-nexus-app-id": "glowbot",
            "x-nexus-adapter-id": "google",
            "x-nexus-auth-method-id": "google_oauth_managed",
            "x-nexus-managed-profile-id": "glowbot-google-oauth",
          },
          body: JSON.stringify({
            service: "google",
            appId: "glowbot",
            adapter: "google",
            authMethodId: "google_oauth_managed",
            managedProfileId: "glowbot-google-oauth",
            code: "provider-auth-code",
            state: "opaque-state",
            redirectUri: "https://t-tenant-dev.nexushub.sh/auth/google/callback",
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      expect(body.access_token).toBe("provider-access-token");
      expect(body.refresh_token).toBe("provider-refresh-token");
      expect(body.expires_in).toBe(3600);
      expect(providerFetch).toHaveBeenCalledTimes(2);
    } finally {
      if (prevSecret === undefined) {
        delete process.env.GLOWBOT_GOOGLE_CLIENT_SECRET;
      } else {
        process.env.GLOWBOT_GOOGLE_CLIENT_SECRET = prevSecret;
      }
    }
  });

  it("relays metadata requests to the configured product control plane for product-managed profiles", async () => {
    const config = baseConfig("http://127.0.0.1:18789");
    config.tenants.set("tenant-dev", {
      id: "tenant-dev",
      runtimeUrl: "http://127.0.0.1:18789",
      runtimePublicBaseUrl: "http://127.0.0.1:18789",
      runtimeAuthToken: "rt-frontdoor-managed-test",
    });
    const previousToken = process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN;
    process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN = "glowbot-product-control-plane-token";

    const controlPlane = await listen(
      createHttpServer((req, res) => {
        expect(req.method).toBe("GET");
        expect(req.headers.authorization).toBe("Bearer glowbot-product-control-plane-token");
        expect(req.headers["x-nexus-server-id"]).toBe("tenant-dev");
        expect(req.headers["x-nexus-tenant-id"]).toBe("tenant-dev");
        expect(req.headers["x-nexus-entity-id"]).toBe("entity-owner");
        expect(req.headers["x-nexus-app-id"]).toBe("glowbot");
        expect(req.headers["x-nexus-adapter-id"]).toBe("google");
        expect(req.headers["x-nexus-auth-method-id"]).toBe("google_oauth_managed");
        expect(req.headers["x-nexus-managed-profile-id"]).toBe("glowbot-google-oauth");
        const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        expect(requestUrl.pathname).toBe("/api/internal/frontdoor/managed-connections/profile");
        expect(requestUrl.searchParams.get("service")).toBe("google");
        expect(requestUrl.searchParams.get("app_id")).toBe("glowbot");
        expect(requestUrl.searchParams.get("adapter_id")).toBe("google");
        expect(requestUrl.searchParams.get("auth_method_id")).toBe("google_oauth_managed");
        expect(requestUrl.searchParams.get("managed_profile_id")).toBe("glowbot-google-oauth");
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            managedProfileId: "glowbot-google-oauth",
            service: "google",
            authUri: "https://accounts.example.com/o/oauth2/auth",
            clientId: "glowbot-google-client-id",
            scopes: ["openid", "email", "profile"],
            authorizeParams: {
              access_type: "offline",
              prompt: "consent",
            },
          }),
        );
      }),
    );

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(config, (store) => {
      store.upsertServerAppInstall({
        serverId: "tenant-dev",
        appId: "glowbot",
        status: "installed",
      });
    });
    seedProductControlPlaneRoute(config, {
      appId: "glowbot",
      baseUrl: controlPlane.origin,
      authTokenRef: "env:GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN",
    });

    try {
      const response = await fetch(
        `${frontdoorRunning.origin}/api/internal/managed-connections/profile?service=google&app_id=glowbot&adapter_id=google&auth_method_id=google_oauth_managed&managed_profile_id=glowbot-google-oauth`,
        {
          headers: {
            authorization: "Bearer rt-frontdoor-managed-test",
            "x-nexus-auth-via": "frontdoor",
            "x-nexus-entity-id": "entity-owner",
            "x-nexus-tenant-id": "tenant-dev",
            "x-nexus-app-id": "glowbot",
            "x-nexus-adapter-id": "google",
            "x-nexus-auth-method-id": "google_oauth_managed",
            "x-nexus-managed-profile-id": "glowbot-google-oauth",
          },
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        managedProfileId?: string;
        clientId?: string;
      };
      expect(body.managedProfileId).toBe("glowbot-google-oauth");
      expect(body.clientId).toBe("glowbot-google-client-id");
    } finally {
      if (previousToken === undefined) {
        delete process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN;
      } else {
        process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN = previousToken;
      }
    }
  });

  it("relays exchange requests to the configured product control plane for product-managed profiles", async () => {
    const config = baseConfig("http://127.0.0.1:18789");
    config.tenants.set("tenant-dev", {
      id: "tenant-dev",
      runtimeUrl: "http://127.0.0.1:18789",
      runtimePublicBaseUrl: "http://127.0.0.1:18789",
      runtimeAuthToken: "rt-frontdoor-managed-test",
    });
    const previousToken = process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN;
    process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN = "glowbot-product-control-plane-token";

    const controlPlane = await listen(
      createHttpServer(async (req, res) => {
        expect(req.method).toBe("POST");
        expect(req.url).toBe("/api/internal/frontdoor/managed-connections/profile/exchange");
        expect(req.headers.authorization).toBe("Bearer glowbot-product-control-plane-token");
        expect(req.headers["x-nexus-server-id"]).toBe("tenant-dev");
        expect(req.headers["x-nexus-tenant-id"]).toBe("tenant-dev");
        expect(req.headers["x-nexus-entity-id"]).toBe("entity-owner");
        expect(req.headers["x-nexus-app-id"]).toBe("glowbot");
        expect(req.headers["x-nexus-adapter-id"]).toBe("google");
        expect(req.headers["x-nexus-auth-method-id"]).toBe("google_oauth_managed");
        expect(req.headers["x-nexus-managed-profile-id"]).toBe("glowbot-google-oauth");
        const payload = JSON.parse(await readRequestText(req)) as Record<string, unknown>;
        expect(payload).toEqual({
          service: "google",
          appId: "glowbot",
          adapter: "google",
          authMethodId: "google_oauth_managed",
          managedProfileId: "glowbot-google-oauth",
          code: "provider-auth-code",
          state: "opaque-state",
          redirectUri: "https://t-tenant-dev.nexushub.sh/auth/google/callback",
        });
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            access_token: "provider-access-token",
            refresh_token: "provider-refresh-token",
            expires_in: 3600,
            token_type: "Bearer",
          }),
        );
      }),
    );

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(config, (store) => {
      store.upsertServerAppInstall({
        serverId: "tenant-dev",
        appId: "glowbot",
        status: "installed",
      });
    });
    seedProductControlPlaneRoute(config, {
      appId: "glowbot",
      baseUrl: controlPlane.origin,
      authTokenRef: "env:GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN",
    });

    try {
      const response = await fetch(
        `${frontdoorRunning.origin}/api/internal/managed-connections/profile/exchange`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer rt-frontdoor-managed-test",
            "content-type": "application/json",
            "x-nexus-auth-via": "frontdoor",
            "x-nexus-entity-id": "entity-owner",
            "x-nexus-tenant-id": "tenant-dev",
            "x-nexus-app-id": "glowbot",
            "x-nexus-adapter-id": "google",
            "x-nexus-auth-method-id": "google_oauth_managed",
            "x-nexus-managed-profile-id": "glowbot-google-oauth",
          },
          body: JSON.stringify({
            service: "google",
            appId: "glowbot",
            adapter: "google",
            authMethodId: "google_oauth_managed",
            managedProfileId: "glowbot-google-oauth",
            code: "provider-auth-code",
            state: "opaque-state",
            redirectUri: "https://t-tenant-dev.nexushub.sh/auth/google/callback",
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      expect(body.access_token).toBe("provider-access-token");
      expect(body.refresh_token).toBe("provider-refresh-token");
      expect(body.expires_in).toBe(3600);
    } finally {
      if (previousToken === undefined) {
        delete process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN;
      } else {
        process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN = previousToken;
      }
    }
  });

  it("fails loudly when a product-managed profile has no configured product control plane route", async () => {
    const config = baseConfig("http://127.0.0.1:18789");
    config.tenants.set("tenant-dev", {
      id: "tenant-dev",
      runtimeUrl: "http://127.0.0.1:18789",
      runtimePublicBaseUrl: "http://127.0.0.1:18789",
      runtimeAuthToken: "rt-frontdoor-managed-test",
    });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    withStore(config, (store) => {
      store.upsertServerAppInstall({
        serverId: "tenant-dev",
        appId: "glowbot",
        status: "installed",
      });
    });

    const response = await fetch(
      `${frontdoorRunning.origin}/api/internal/managed-connections/profile?service=google&app_id=glowbot&adapter_id=google&auth_method_id=google_oauth_managed&managed_profile_id=glowbot-google-oauth`,
      {
        headers: {
          authorization: "Bearer rt-frontdoor-managed-test",
          "x-nexus-auth-via": "frontdoor",
          "x-nexus-entity-id": "entity-owner",
          "x-nexus-tenant-id": "tenant-dev",
          "x-nexus-app-id": "glowbot",
          "x-nexus-adapter-id": "google",
          "x-nexus-auth-method-id": "google_oauth_managed",
          "x-nexus-managed-profile-id": "glowbot-google-oauth",
        },
      },
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as {
      ok?: boolean;
      error?: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("product_control_plane_not_configured");
  });
});

describe("product control plane gateway", () => {
  it("relays clinic app product operations to the configured product control plane", async () => {
    const config = baseConfig("http://127.0.0.1:18789");
    config.tenants.set("tenant-dev", {
      id: "tenant-dev",
      runtimeUrl: "http://127.0.0.1:18789",
      runtimePublicBaseUrl: "http://127.0.0.1:18789",
      runtimeAuthToken: "rt-frontdoor-product-test",
    });
    const previousToken = process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN;
    process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN = "glowbot-product-control-plane-token";

    const controlPlane = await listen(
      createHttpServer(async (req, res) => {
        expect(req.method).toBe("POST");
        expect(req.url).toBe("/api/internal/frontdoor/product-control-plane/call");
        expect(req.headers.authorization).toBe("Bearer glowbot-product-control-plane-token");
        expect(req.headers["x-nexus-server-id"]).toBe("tenant-dev");
        expect(req.headers["x-nexus-tenant-id"]).toBe("tenant-dev");
        expect(req.headers["x-nexus-entity-id"]).toBe("entity-owner");
        expect(req.headers["x-nexus-app-id"]).toBe("glowbot");
        expect(req.headers["x-nexus-product-operation"]).toBe("glowbotHub.productFlags.list");
        const payload = JSON.parse(await readRequestText(req)) as Record<string, unknown>;
        expect(payload).toEqual({
          appId: "glowbot",
          operation: "glowbotHub.productFlags.list",
          payload: {},
        });
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            result: {
              productFlags: [{ key: "benchmarks_enabled", value: true, updatedAtMs: 1 }],
            },
          }),
        );
      }),
    );

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(config, (store) => {
      store.upsertServerAppInstall({
        serverId: "tenant-dev",
        appId: "glowbot",
        status: "installed",
      });
    });
    seedProductControlPlaneRoute(config, {
      appId: "glowbot",
      baseUrl: controlPlane.origin,
      authTokenRef: "env:GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN",
    });

    try {
      const response = await fetch(
        `${frontdoorRunning.origin}/api/internal/product-control-plane/call`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer rt-frontdoor-product-test",
            "content-type": "application/json",
            "x-nexus-auth-via": "frontdoor",
            "x-nexus-entity-id": "entity-owner",
            "x-nexus-tenant-id": "tenant-dev",
            "x-nexus-app-id": "glowbot",
          },
          body: JSON.stringify({
            appId: "glowbot",
            operation: "glowbotHub.productFlags.list",
            payload: {},
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        result?: {
          productFlags?: Array<{ key?: string; value?: boolean; updatedAtMs?: number }>;
        };
      };
      expect(body.result?.productFlags?.[0]).toMatchObject({
        key: "benchmarks_enabled",
        value: true,
      });
      expect(body.result?.productFlags?.[0]?.updatedAtMs).toBeTypeOf("number");
    } finally {
      if (previousToken === undefined) {
        delete process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN;
      } else {
        process.env.GLOWBOT_PRODUCT_CONTROL_PLANE_TOKEN = previousToken;
      }
    }
  });

  it("fulfills AIX hosted context directly from frontdoor-managed server metadata", async () => {
    const config = baseConfig("http://127.0.0.1:18789");
    config.tenants.set("tenant-dev", {
      id: "tenant-dev",
      runtimeUrl: "http://127.0.0.1:18789",
      runtimePublicBaseUrl: "https://tenant-aix.example",
      runtimeAuthToken: "rt-frontdoor-aix-context-test",
    });

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(config, (store) => {
      store.upsertServerAppInstall({
        serverId: "tenant-dev",
        appId: "aix",
        status: "installed",
      });
    });

    const response = await fetch(
      `${frontdoorRunning.origin}/api/internal/product-control-plane/call`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer rt-frontdoor-aix-context-test",
          "content-type": "application/json",
          "x-nexus-auth-via": "frontdoor",
          "x-nexus-entity-id": "entity-owner",
          "x-nexus-tenant-id": "tenant-dev",
          "x-nexus-app-id": "aix",
        },
        body: JSON.stringify({
          appId: "aix",
          operation: "aix.hostedContext.get",
          payload: {},
        }),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok?: boolean;
      result?: {
        app_id?: string;
        server_id?: string;
        tenant_id?: string;
        runtime_public_base_url?: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.result).toEqual({
      app_id: "aix",
      server_id: "tenant-dev",
      tenant_id: "tenant-dev",
      runtime_public_base_url: "https://tenant-aix.example",
    });
  });
});

describe("frontdoor scaffold", () => {
  it("serves shell actions for install-on-selected-server and explicit new-server install", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);

    const shellResp = await fetch(`${frontdoorRunning.origin}/`);
    expect(shellResp.status).toBe(200);
    const shellHtml = await shellResp.text();
    expect(shellHtml).toContain("Nexus Dashboard");
    expect(shellHtml).toContain("install_on_selected_server");
    expect(shellHtml).toContain("create_server_and_install");
    expect(shellHtml).toContain("/api/entry/resolve");
    expect(shellHtml).toContain("/api/entry/execute");
  });

  it("supports login and runtime token mint/refresh/revoke", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const mintResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
      headers: {
        cookie,
      },
    });
    expect(mintResp.status).toBe(200);
    const mintBody = (await mintResp.json()) as {
      ok: boolean;
      server_id: string;
      access_token: string;
      refresh_token: string;
      tenant_id: string;
      runtime?: {
        server_id?: string;
        tenant_id?: string;
        http_base_url?: string;
        ws_url?: string;
        sse_url?: string;
      };
    };
    expect(mintBody.ok).toBe(true);
    expect(mintBody.access_token.split(".")).toHaveLength(3);
    expect(mintBody.server_id).toBe("tenant-dev");
    expect(mintBody.tenant_id).toBe("tenant-dev");
    expect(mintBody.runtime?.server_id).toBe("tenant-dev");
    expect(mintBody.runtime?.tenant_id).toBe("tenant-dev");
    expect(mintBody.runtime?.http_base_url).toBe(`${runtime.origin}/runtime`);
    expect(mintBody.runtime?.ws_url).toBe(
      `${runtime.origin.replace(/^http/i, "ws")}/runtime/ws`,
    );
    expect(mintBody.runtime?.sse_url).toBe(`${runtime.origin}/runtime/api/events/stream`);

    const refreshResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: mintBody.refresh_token,
      }),
    });
    expect(refreshResp.status).toBe(200);
    const refreshBody = (await refreshResp.json()) as {
      ok: boolean;
      refresh_token: string;
    };
    expect(refreshBody.ok).toBe(true);
    expect(refreshBody.refresh_token).not.toBe(mintBody.refresh_token);

    const revokeResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token/revoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshBody.refresh_token,
      }),
    });
    expect(revokeResp.status).toBe(200);

    const refreshAfterRevoke = await fetch(`${frontdoorRunning.origin}/api/runtime/token/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshBody.refresh_token,
      }),
    });
    expect(refreshAfterRevoke.status).toBe(401);
  });

  it("does not reassign a seeded tenant server during password signup", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const before = withStore(config, (store) => store.getServer("tenant-dev"));
    expect(before?.accountId).toBe(SEEDED_ACCOUNT_ID);

    const signupResp = await fetch(`${frontdoorRunning.origin}/api/auth/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "new-signup@example.com",
        username: "new-signup",
        password: "password123",
        display_name: "New Signup",
      }),
    });
    expect(signupResp.status).toBe(201);
    const signupBody = (await signupResp.json()) as {
      ok?: boolean;
      user_id?: string;
      account_id?: string;
      server_id?: string | null;
      redirect_to?: string;
    };
    expect(signupBody.ok).toBe(true);
    expect(signupBody.server_id).toBeNull();
    expect(signupBody.redirect_to).toBe("/");

    const after = withStore(config, (store) => ({
      seeded: store.getServer("tenant-dev"),
      user: store.getUserByEmail("new-signup@example.com"),
    }));
    expect(after.seeded?.accountId).toBe(SEEDED_ACCOUNT_ID);
    expect(after.user?.userId).toBe(signupBody.user_id);

    const newUserServerCount = withStore(config, (store) =>
      after.user ? store.getServersForUser(after.user.userId).length : -1,
    );
    expect(newUserServerCount).toBe(0);
  });

  it("rejects password login when password auth is disabled", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    config.passwordAuthEnabled = false;
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const response = await fetch(`${frontdoorRunning.origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "owner",
        password: "changeme",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "password_auth_disabled",
    });
  });

  it("rejects password signup when password auth is disabled", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    config.passwordAuthEnabled = false;
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const response = await fetch(`${frontdoorRunning.origin}/api/auth/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "blocked@example.com",
        username: "blocked",
        password: "password123",
        display_name: "Blocked User",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "password_auth_disabled",
    });
  });

  it("uses authenticated runtime health when resolving hosted install platform", async () => {
    let seenAuthorization = "";
    const config = baseConfig("http://127.0.0.1:18789");
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    stageFakePackage(config, "spike", "1.2.3");
    const sshInstallSpy = vi.spyOn(sshHelper, "installPackageViaSSH").mockResolvedValue({ ok: true });
    const directInstallSpy = vi.spyOn(sshHelper, "installPackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url === "http://10.0.0.5:18789/health") {
        const authHeader = init?.headers && typeof Headers !== "undefined"
          ? new Headers(init.headers).get("authorization")
          : null;
        seenAuthorization = authHeader ?? "";
        if (!seenAuthorization.startsWith("Bearer eyJ")) {
          return new Response('{"ok":false,"error":"unauthorized"}', {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response('{"status":"healthy","platform":{"os":"darwin","arch":"arm64"}}', {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return realFetch(input, init);
    }));
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(config, (store) => {
      store.updateServer("tenant-dev", {
        provider: "hetzner",
        providerServerId: "hcloud-tenant-dev",
        plan: "unknown-plan",
        privateIp: "10.0.0.5",
        runtimePort: 18789,
        runtimeAuthToken: "rt-probe-test",
        runtimeOs: null,
        runtimeArch: null,
      });
    });
    const cookie = await login(frontdoorRunning.origin);

    const purchaseResp = await fetch(`${frontdoorRunning.origin}/api/apps/spike/purchase`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "tenant-dev",
        install: true,
      }),
    });

    expect(purchaseResp.status).toBe(200);
    const purchaseBody = (await purchaseResp.json()) as {
      ok?: boolean;
      installed_server_id?: string | null;
    };
    expect(purchaseBody.ok).toBe(true);
    expect(purchaseBody.installed_server_id).toBe("tenant-dev");
    expect(seenAuthorization.startsWith("Bearer eyJ")).toBe(true);
    expect(sshInstallSpy.mock.calls.length + directInstallSpy.mock.calls.length).toBe(1);

    const cachedPlatform = withStore(config, (store) => store.getServer("tenant-dev"));
    expect(cachedPlatform?.runtimeOs).toBe("darwin");
    expect(cachedPlatform?.runtimeArch).toBe("arm64");
  });

  it("uses provider plan metadata before runtime health for managed hosted installs", async () => {
    let healthProbeCount = 0;
    const config = baseConfig("http://127.0.0.1:18789");
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    const tarballPath = stageFakePackage(config, "spike", "1.2.3");
    withStore(config, (store) => {
      store.upsertPackageReleaseVariant({
        variantId: "variant-spike-1.2.3-linux-arm64",
        releaseId: "rel-spike-1.2.3",
        targetOs: "linux",
        targetArch: "arm64",
        packageFormat: "tar.gz",
        tarballPath,
        sizeBytes: fs.statSync(tarballPath).size,
      });
    });
    const installSpy = vi.spyOn(sshHelper, "installPackageViaSSH").mockResolvedValue({ ok: true });
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url === "http://10.0.0.5:18789/health") {
          healthProbeCount += 1;
          return new Response('{"status":"unhealthy","error":"nex_runtime_unavailable"}', {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
        return realFetch(input, init);
      }),
    );
    const provider: CloudProvider = {
      createServer: vi.fn(),
      getServerStatus: vi.fn(),
      archiveServer: vi.fn(),
      restoreServer: vi.fn(),
      createRecoveryPoint: vi.fn(),
      setProtection: vi.fn(),
      destroyServer: vi.fn(),
      listPlans: vi.fn(() => [
        {
          id: "cax11",
          name: "Starter",
          monthlyCostCents: 400,
          vcpus: 2,
          memoryMb: 4096,
          diskGb: 40,
          architecture: "arm64" as const,
        },
      ]),
    };
    const frontdoor = createFrontdoorServer({ config, cloudProvider: provider });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(config, (store) => {
      const seeded = store.getServer("tenant-dev");
      if (!seeded) {
        throw new Error("missing_seeded_server");
      }
      store.upsertServer({
        ...seeded,
        plan: "cax11",
        provider: "hetzner",
        providerServerId: "hcloud-tenant-dev",
        privateIp: "10.0.0.5",
        runtimePort: 18789,
        runtimeAuthToken: "rt-probe-test",
        runtimeOs: null,
        runtimeArch: null,
      });
    });
    const cookie = await login(frontdoorRunning.origin);

    const purchaseResp = await fetch(`${frontdoorRunning.origin}/api/apps/spike/purchase`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "tenant-dev",
        install: true,
      }),
    });

    expect(purchaseResp.status).toBe(200);
    const purchaseBody = (await purchaseResp.json()) as {
      ok?: boolean;
      installed_server_id?: string | null;
    };
    expect(purchaseBody.ok).toBe(true);
    expect(purchaseBody.installed_server_id).toBe("tenant-dev");
    expect(healthProbeCount).toBe(0);
    expect(installSpy).toHaveBeenCalledTimes(1);

    const cachedPlatform = withStore(config, (store) => store.getServer("tenant-dev"));
    expect(cachedPlatform?.runtimeOs).toBe("linux");
    expect(cachedPlatform?.runtimeArch).toBe("arm64");
  });

  it("proxies tenant-origin /runtime paths with the runtime access token and strips the /runtime prefix", async () => {
    let upstreamAuthorization = "";
    let upstreamPath = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
        upstreamAuthorization = String(req.headers.authorization ?? "");
        upstreamPath = String(req.url ?? "");
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, url: req.url }));
      }),
    );
    const config = baseConfig(runtime.origin);
    const directTenantId = "t-tenant-direct";
    const ownerByUsername = config.usersByUsername.get("owner");
    const ownerById = config.usersById.get("u-owner");
    if (!ownerByUsername || !ownerById) {
      throw new Error("missing_test_owner");
    }
    config.tenants.clear();
    config.tenants.set(directTenantId, {
      id: directTenantId,
      runtimeUrl: runtime.origin,
      runtimePublicBaseUrl: `https://${directTenantId}.nexushub.sh`,
    });
    config.usersByUsername.set("owner", {
      ...ownerByUsername,
      tenantId: directTenantId,
    });
    config.usersById.set("u-owner", {
      ...ownerById,
      tenantId: directTenantId,
    });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const mintResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
      headers: { cookie },
    });
    expect(mintResp.status).toBe(200);
    const mintBody = (await mintResp.json()) as {
      access_token?: string;
      runtime?: { http_base_url?: string };
    };
    expect(mintBody.runtime?.http_base_url).toBe(`https://${directTenantId}.nexushub.sh/runtime`);
    const accessToken = String(mintBody.access_token ?? "");
    expect(accessToken).not.toBe("");

    const tenantUrl = new URL(frontdoorRunning.origin);
    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: tenantUrl.hostname,
          port: Number(tenantUrl.port),
          path: "/runtime/health",
          method: "GET",
          headers: {
            host: `${directTenantId}.nexushub.sh`,
            authorization: `Bearer ${accessToken}`,
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", reject);
      req.end();
    });

    expect(statusCode).toBe(200);
    expect(upstreamAuthorization).toBe(`Bearer ${accessToken}`);
    expect(upstreamPath).toBe("/health");
  });

  it("sets secure session cookie and HSTS when request is HTTPS", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    config.sessionCookieSecure = true;
    config.sessionCookieDomain = "glowbot.test";
    config.hstsEnabled = true;
    config.hstsMaxAgeSeconds = 31536000;
    config.hstsIncludeSubDomains = true;
    config.hstsPreload = true;
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const response = await fetch(`${frontdoorRunning.origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({
        username: "owner",
        password: "changeme",
      }),
    });

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("Domain=glowbot.test");

    const hsts = response.headers.get("strict-transport-security") ?? "";
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
  });

  it("includes JWT kid when runtime token keys are configured", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    config.runtimeTokenActiveKid = "v2";
    config.runtimeTokenSecretsByKid = new Map([
      ["v1", "frontdoor-secret-v1"],
      ["v2", "frontdoor-secret-v2"],
    ]);
    config.runtimeTokenSecret = "frontdoor-secret-v2";
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const mintResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
      headers: {
        cookie,
      },
    });
    expect(mintResp.status).toBe(200);
    const mintBody = (await mintResp.json()) as {
      ok: boolean;
      access_token: string;
      key_id?: string;
    };
    expect(mintBody.ok).toBe(true);
    expect(mintBody.key_id).toBe("v2");
    const header = decodeJwtHeader(mintBody.access_token);
    expect(header.kid).toBe("v2");
  });

  it("proxies HTTP to the tenant runtime and injects trusted-token claims", async () => {
    let lastAuthorization = "";
    let lastTenantHeader = "";
    let lastRuntimeUrl = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
        lastAuthorization = String(req.headers.authorization ?? "");
        lastTenantHeader = String(req.headers["x-nexus-frontdoor-tenant"] ?? "");
        lastRuntimeUrl = String(req.url ?? "");
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, url: req.url }));
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const resp = await fetch(`${frontdoorRunning.origin}/runtime/health?deep=1`, {
      headers: {
        cookie,
      },
    });
    expect(resp.status).toBe(200);
    expect(lastTenantHeader).toBe("tenant-dev");
    expect(lastRuntimeUrl).toBe("/health?deep=1");
    expect(lastAuthorization.startsWith("Bearer ")).toBe(true);
    const token = lastAuthorization.slice("Bearer ".length);
    const payloadPart = token.split(".")[1];
    const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    expect(claims.tenant_id).toBe("tenant-dev");
    expect(claims.entity_id).toBe("entity-owner");
    expect(claims.aud).toBe("runtime-api");
  });

  it("proxies /app paths to runtime operator console routes", async () => {
    let lastAuthorization = "";
    let lastTenantHeader = "";
    let lastRuntimeUrl = "";
    let lastOriginHeader = "";
    let forwardedOriginHeader = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
        lastAuthorization = String(req.headers.authorization ?? "");
        lastTenantHeader = String(req.headers["x-nexus-frontdoor-tenant"] ?? "");
        lastRuntimeUrl = String(req.url ?? "");
        lastOriginHeader = String(req.headers.origin ?? "");
        forwardedOriginHeader = String(req.headers["x-nexus-frontdoor-origin"] ?? "");
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, url: req.url }));
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const resp = await fetch(`${frontdoorRunning.origin}/app/dashboard?pane=chat`, {
      headers: {
        cookie,
        origin: "https://frontend.example.com",
      },
    });
    expect(resp.status).toBe(200);
    expect(lastTenantHeader).toBe("tenant-dev");
    expect(lastRuntimeUrl).toBe("/app/dashboard?pane=chat");
    expect(lastAuthorization.startsWith("Bearer ")).toBe(true);
    expect(lastOriginHeader).toBe(runtime.origin);
    expect(forwardedOriginHeader).toBe("https://frontend.example.com");

    const glowbotResp = await fetch(`${frontdoorRunning.origin}/app/glowbot/?tab=overview`, {
      headers: {
        cookie,
        origin: "https://frontend.example.com",
      },
    });
    expect(glowbotResp.status).toBe(200);
    expect(lastRuntimeUrl).toBe("/app/glowbot/?tab=overview");
  });

  it("proxies /_next assets through app context inferred from referer", async () => {
    let lastRuntimeUrl = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
        lastRuntimeUrl = String(req.url ?? "");
        res.statusCode = 200;
        res.setHeader("content-type", "application/javascript; charset=utf-8");
        res.end("console.log('ok');");
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const resp = await fetch(
      `${frontdoorRunning.origin}/_next/static/chunks/app/app/glowbot/adapters/page-chunk.js?v=1`,
      {
        headers: {
          cookie,
          referer: `${frontdoorRunning.origin}/app/glowbot/adapters`,
        },
      },
    );

    expect(resp.status).toBe(200);
    expect(lastRuntimeUrl).toBe(
      "/app/glowbot/_next/static/chunks/app/app/glowbot/adapters/page-chunk.js?v=1",
    );
  });

  it("rejects /_next asset request without app referer context", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/javascript; charset=utf-8");
        res.end("console.log('ok');");
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const resp = await fetch(`${frontdoorRunning.origin}/_next/static/chunks/app/layout.js`, {
      headers: {
        cookie,
      },
    });
    expect(resp.status).toBe(404);
    const body = (await resp.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("app_asset_context_missing");
  });

  it("proxies /auth callback paths to runtime with tenant headers", async () => {
    let lastAuthorization = "";
    let lastTenantHeader = "";
    let lastRuntimeUrl = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
        lastAuthorization = String(req.headers.authorization ?? "");
        lastTenantHeader = String(req.headers["x-nexus-frontdoor-tenant"] ?? "");
        lastRuntimeUrl = String(req.url ?? "");
        res.statusCode = 302;
        res.setHeader("location", "/app/adapters?connected=github");
        res.end();
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const resp = await fetch(`${frontdoorRunning.origin}/auth/github/callback?code=abc&state=good`, {
      headers: {
        cookie,
      },
      redirect: "manual",
    });
    expect(resp.status).toBe(302);
    expect(resp.headers.get("location")).toBe("/app/adapters?connected=github");
    expect(lastTenantHeader).toBe("tenant-dev");
    expect(lastRuntimeUrl).toBe("/auth/github/callback?code=abc&state=good");
    expect(lastAuthorization.startsWith("Bearer ")).toBe(true);
  });

  it("renders a frontdoor shell for console app HTML routes and proxies embedded app HTML without leaking shell params upstream", async () => {
    let lastRuntimeUrl = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
        lastRuntimeUrl = String(req.url ?? "");
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end("<!doctype html><html><head><title>runtime</title></head><body>ok</body></html>");
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const bootstrapResp = await fetch(`${frontdoorRunning.origin}/app/console/chat?session=main`, {
      headers: {
        cookie,
        accept: "text/html",
      },
    });
    expect(bootstrapResp.status).toBe(200);
    const shellHtml = await bootstrapResp.text();
    expect(shellHtml).toContain('id="nxf-shell-embed"');
    expect(shellHtml).toContain('/app/console/chat?session=main&amp;__nxf_embed=1');
    expect(lastRuntimeUrl).toBe("");

    const embeddedResp = await fetch(
      `${frontdoorRunning.origin}/app/console/chat?session=main&__nxf_embed=1`,
      {
        headers: {
          cookie,
          accept: "text/html",
        },
      },
    );
    expect(embeddedResp.status).toBe(200);
    const embeddedHtml = await embeddedResp.text();
    expect(embeddedHtml).toContain('id="nxf-embedded-app-bridge"');
    expect(embeddedHtml).not.toContain('id="nexus-app-frame"');
    expect(lastRuntimeUrl).toBe("/app/console/chat?session=main");
    expect(lastRuntimeUrl.includes("token=")).toBe(false);
    expect(lastRuntimeUrl.includes("runtimeUrl=")).toBe(false);
    expect(lastRuntimeUrl.includes("__nxf_embed")).toBe(false);
  });

  it("uses a session-bound runtime access token for embedded app proxying even when a server runtime auth token exists", async () => {
    let lastAuthorization = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
        lastAuthorization = String(req.headers.authorization ?? "");
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end("<!doctype html><html><head><title>runtime</title></head><body>ok</body></html>");
      }),
    );
    const config = baseConfig(runtime.origin);
    config.tenants.set("tenant-dev", {
      id: "tenant-dev",
      runtimeUrl: runtime.origin,
      runtimePublicBaseUrl: runtime.origin,
      runtimeAuthToken: "rt-frontdoor-managed-test",
    });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const embeddedResp = await fetch(
      `${frontdoorRunning.origin}/app/console/chat?session=main&__nxf_embed=1`,
      {
        headers: {
          cookie,
          accept: "text/html",
        },
      },
    );
    expect(embeddedResp.status).toBe(200);
    await embeddedResp.text();
    expect(lastAuthorization.startsWith("Bearer ")).toBe(true);
    expect(lastAuthorization).not.toBe("Bearer rt-frontdoor-managed-test");
  });

  it("renders a shell-level not-installed state for unavailable apps while keeping the embedded app document shell-free", async () => {
    let lastRuntimeUrl = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
        lastRuntimeUrl = String(req.url ?? "");
        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end("<!doctype html><html><head><title>glowbot</title></head><body>app</body></html>");
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const resp = await fetch(`${frontdoorRunning.origin}/app/glowbot/?tab=overview`, {
      headers: {
        cookie,
        accept: "text/html",
      },
    });
    expect(resp.status).toBe(200);
    const shellHtml = await resp.text();
    expect(shellHtml).not.toContain('id="nxf-shell-embed"');
    expect(shellHtml).toContain("glowbot is not installed on this server");
    expect(shellHtml).toContain('id="nexus-app-frame"');
    expect(shellHtml).not.toContain("<body>app</body>");
    expect(lastRuntimeUrl).toBe("");

    const embeddedResp = await fetch(
      `${frontdoorRunning.origin}/app/glowbot/?tab=overview&__nxf_embed=1`,
      {
        headers: {
          cookie,
          accept: "text/html",
        },
      },
    );
    expect(embeddedResp.status).toBe(200);
    const embeddedHtml = await embeddedResp.text();
    expect(embeddedHtml).toContain("<body>app");
    expect(embeddedHtml).toContain('id="nxf-embedded-app-bridge"');
    expect(embeddedHtml).not.toContain('id="nexus-app-frame"');
    expect(lastRuntimeUrl).toBe("/app/glowbot/?tab=overview");
  });

  it("proxies websocket upgrades with trusted-token header injection", async () => {
    let wsAuthHeader = "";
    let wsOriginHeader = "";
    let wsForwardedOriginHeader = "";
    const runtimeServer = createHttpServer((_req, res) => {
      res.statusCode = 404;
      res.end("missing");
    });
    const wss = new WebSocketServer({ noServer: true });
    runtimeServer.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (client: WebSocket) => {
        wss.emit("connection", client, req);
      });
    });
    wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      wsAuthHeader = String(req.headers.authorization ?? "");
      wsOriginHeader = String(req.headers.origin ?? "");
      wsForwardedOriginHeader = String(req.headers["x-nexus-frontdoor-origin"] ?? "");
      ws.send("ok");
      ws.close();
    });
    const runtime = await listen(runtimeServer);
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);
    const wsUrl = frontdoorRunning.origin.replace("http://", "ws://");
    const incomingOrigin = frontdoorRunning.origin;
    const message = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}/runtime/ws`, {
        headers: {
          cookie,
          origin: incomingOrigin,
        },
      });
      ws.once("message", (data: RawData) => resolve(String(data)));
      ws.once("error", (error: Error) => reject(error));
    });
    expect(message).toBe("ok");
    expect(wsAuthHeader.startsWith("Bearer ")).toBe(true);
    expect(wsOriginHeader).toBe(runtime.origin);
    expect(wsForwardedOriginHeader).toBe(incomingOrigin);
  });

  it("overwrites spoofed runtime identity headers from clients", async () => {
    let seenAuth = "";
    let seenTenant = "";
    let seenSession = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
        seenAuth = String(req.headers.authorization ?? "");
        seenTenant = String(req.headers["x-nexus-frontdoor-tenant"] ?? "");
        seenSession = String(req.headers["x-nexus-frontdoor-session"] ?? "");
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);
    const cookieSession = cookie.split("=")[1];

    const response = await fetch(`${frontdoorRunning.origin}/runtime/health`, {
      headers: {
        cookie,
        authorization: "Bearer client-spoof-token",
        "x-nexus-frontdoor-tenant": "tenant-spoof",
        "x-nexus-frontdoor-session": "session-spoof",
      },
    });
    expect(response.status).toBe(200);
    await response.text();

    expect(seenTenant).toBe("tenant-dev");
    expect(seenSession).toBe(cookieSession);
    expect(seenAuth).not.toBe("Bearer client-spoof-token");
    expect(seenAuth.startsWith("Bearer ")).toBe(true);
    const runtimeToken = seenAuth.slice("Bearer ".length);
    const payloadPart = runtimeToken.split(".")[1];
    const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    expect(claims.tenant_id).toBe("tenant-dev");
  });

  it("mints a trusted runtime token for shell runtime proxying when stored server token is missing", async () => {
    let seenAuth = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
        seenAuth = String(req.headers.authorization ?? "");
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    config.tenants.set("tenant-dev", {
      id: "tenant-dev",
      runtimeUrl: runtime.origin,
      runtimePublicBaseUrl: runtime.origin,
      runtimeAuthToken: "runtime-auth-token-local",
    });
    const frontdoor = createFrontdoorServer({ config });
    withStore(config, (store) => {
      const server = store.getServer("tenant-dev");
      expect(server).toBeTruthy();
      if (!server) {
        throw new Error("missing_server");
      }
      store.updateServer(server.serverId, {
        privateIp: null,
        runtimePort: 8080,
        runtimeAuthToken: null,
      });
      const cleared = store.getServer(server.serverId);
      expect(cleared?.runtimeAuthToken).toBeNull();
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/runtime/health`, {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    await response.text();

    expect(seenAuth.startsWith("Bearer ")).toBe(true);
    const proxiedToken = seenAuth.slice("Bearer ".length);
    expect(proxiedToken).toContain(".");
    expect(decodeJwtPayload(proxiedToken)).toMatchObject({
      tenant_id: "tenant-dev",
      role: "operator",
      client_id: "nexus-frontdoor",
    });
  });

  it("rejects cross-origin mutation requests", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
      headers: {
        cookie,
        origin: "https://evil.example",
      },
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("origin_not_allowed");
  });

  it("rejects websocket upgrades from mismatched browser origins", async () => {
    const runtimeServer = createHttpServer((_req, res) => {
      res.statusCode = 404;
      res.end("missing");
    });
    const runtime = await listen(runtimeServer);
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);
    const wsUrl = frontdoorRunning.origin.replace("http://", "ws://");

    const result = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`${wsUrl}/runtime/ws`, {
        headers: {
          cookie,
          origin: "https://evil.example",
        },
      });
      ws.once("open", () => {
        resolve("opened");
        ws.close();
      });
      ws.once("error", (error: Error) => {
        resolve(String(error.message || error));
      });
    });
    expect(result.toLowerCase()).toContain("403");
  });

  it("rate limits repeated failed logins", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    config.rateLimits.loginAttempts = {
      windowSeconds: 60,
      maxAttempts: 100,
      blockSeconds: 60,
    };
    config.rateLimits.loginFailures = {
      windowSeconds: 60,
      maxAttempts: 1,
      blockSeconds: 60,
    };
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const first = await fetch(`${frontdoorRunning.origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "owner",
        password: "wrong",
      }),
    });
    expect(first.status).toBe(401);

    const second = await fetch(`${frontdoorRunning.origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        username: "owner",
        password: "wrong",
      }),
    });
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
    const body = (await second.json()) as { error?: string };
    expect(body.error).toBe("login_rate_limited");
  });

  it("supports account listing, server create/select, and server-scoped token mint", async () => {
    const runtimePrimary = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true,"runtime":"primary"}');
      }),
    );
    const runtimeSecondary = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true,"runtime":"secondary"}');
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtimePrimary.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const accountsResp = await fetch(`${frontdoorRunning.origin}/api/accounts`, {
      headers: { cookie },
    });
    expect(accountsResp.status).toBe(200);
    const accountsBody = (await accountsResp.json()) as {
      ok: boolean;
      active_account_id?: string | null;
      items: Array<{ account_id: string; role: string }>;
    };
    expect(accountsBody.ok).toBe(true);
    expect(accountsBody.items).toHaveLength(1);
    expect(accountsBody.items[0]?.role).toBe("owner");
    expect(accountsBody.active_account_id).toBe(SEEDED_ACCOUNT_ID);

    const createResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "srv-test-2",
        display_name: "Tenant Test 2",
      }),
    });
    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      ok: boolean;
      server?: {
        server_id?: string;
        display_name?: string;
        account_id?: string;
        server_class?: string;
      };
    };
    expect(createBody.ok).toBe(true);
    expect(createBody.server?.server_id).toBe("srv-test-2");
    expect(createBody.server?.display_name).toBe("Tenant Test 2");
    expect(createBody.server?.account_id).toBe(SEEDED_ACCOUNT_ID);
    expect(createBody.server?.server_class).toBe("standard");

    withStore(frontdoor.config, (store) => {
      const server = store.getServer("srv-test-2");
      expect(server).toBeTruthy();
      if (!server) {
        throw new Error("missing_created_server");
      }
      store.updateServer("srv-test-2", {
        privateIp: "127.0.0.1",
        runtimePort: Number(new URL(runtimeSecondary.origin).port || "80"),
      });
      frontdoor.config.tenants.set(server.tenantId, {
        id: server.tenantId,
        runtimeUrl: runtimeSecondary.origin,
        runtimePublicBaseUrl: runtimeSecondary.origin,
      });
    });

    const listResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      headers: { cookie },
    });
    expect(listResp.status).toBe(200);
    const listBody = (await listResp.json()) as {
      ok: boolean;
      active_account_id?: string | null;
      items: Array<{ server_id: string; server_class?: string }>;
    };
    expect(listBody.ok).toBe(true);
    expect(listBody.active_account_id).toBe(SEEDED_ACCOUNT_ID);
    expect(listBody.items.some((item) => item.server_id === "srv-test-2")).toBe(true);
    expect(listBody.items.find((item) => item.server_id === "srv-test-2")?.server_class).toBe("standard");

    const selectResp = await fetch(`${frontdoorRunning.origin}/api/servers/select`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "srv-test-2",
      }),
    });
    expect(selectResp.status).toBe(200);
    const selectBody = (await selectResp.json()) as {
      ok: boolean;
      server_id?: string;
      display_name?: string;
    };
    expect(selectBody.ok).toBe(true);
    expect(selectBody.server_id).toBe("srv-test-2");
    expect(selectBody.display_name).toBe("Tenant Test 2");

    const tokenResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
      headers: {
        cookie,
      },
    });
    expect(tokenResp.status).toBe(200);
    const tokenBody = (await tokenResp.json()) as {
      tenant_id: string;
      runtime?: { http_base_url?: string; server_id?: string };
    };
    expect(tokenBody.tenant_id.startsWith("t-")).toBe(true);
    expect(tokenBody.runtime?.server_id).toBe("srv-test-2");
    expect(tokenBody.runtime?.http_base_url).toBe(`${runtimeSecondary.origin}/runtime`);

    const badServerResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "srv-missing",
      }),
    });
    expect(badServerResp.status).toBe(403);
  });

  it("persists explicit server_class and deployment_class on manual server records and rejects invalid values", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const createResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "srv-compliant-1",
        display_name: "Compliant Server",
        server_class: "compliant",
        deployment_class: "product_control_plane",
      }),
    });
    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      ok: boolean;
      server?: { server_id?: string; server_class?: string; deployment_class?: string };
    };
    expect(createBody.ok).toBe(true);
    expect(createBody.server?.server_id).toBe("srv-compliant-1");
    expect(createBody.server?.server_class).toBe("compliant");
    expect(createBody.server?.deployment_class).toBe("product_control_plane");

    withStore(frontdoor.config, (store) => {
      expect(store.getServer("srv-compliant-1")?.serverClass).toBe("compliant");
      expect(store.getServer("srv-compliant-1")?.deploymentClass).toBe("product_control_plane");
    });

    const invalidResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "srv-invalid-class",
        display_name: "Invalid Server",
        server_class: "hipaa",
      }),
    });
    expect(invalidResp.status).toBe(400);
    const invalidBody = (await invalidResp.json()) as { ok?: boolean; error?: string };
    expect(invalidBody.ok).toBe(false);
    expect(invalidBody.error).toBe("invalid_server_class");

    const invalidDeploymentResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "srv-invalid-deployment-class",
        display_name: "Invalid Deployment Server",
        deployment_class: "clinic",
      }),
    });
    expect(invalidDeploymentResp.status).toBe(400);
    const invalidDeploymentBody = (await invalidDeploymentResp.json()) as {
      ok?: boolean;
      error?: string;
    };
    expect(invalidDeploymentBody.ok).toBe(false);
    expect(invalidDeploymentBody.error).toBe("invalid_deployment_class");
  });

  it("provisions compliant servers on the compliant provider path", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const compliantProvider: CloudProvider = {
      createServer: vi.fn().mockResolvedValue({
        providerServerId: "i-aws-compliant-1",
        publicIp: "",
        privateIp: "10.42.0.10",
        backupEnabled: false,
        deleteProtectionEnabled: true,
        rebuildProtectionEnabled: true,
      }),
      getServerStatus: vi.fn(),
      archiveServer: vi.fn(),
      restoreServer: vi.fn(),
      createRecoveryPoint: vi.fn(),
      setProtection: vi.fn(),
      destroyServer: vi.fn(),
      listPlans: vi.fn(() => []),
    };
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
      compliantCloudProvider: compliantProvider,
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);
    withStore(frontdoor.config, (store) => {
      const account = store.getAccountsForUser("u-owner")[0];
      if (!account) {
        throw new Error("missing_owner_account");
      }
      store.addCredits({
        accountId: account.accountId,
        amountCents: 500,
        type: "deposit",
        description: "test credits",
      });
    });

    const createResp = await fetch(`${frontdoorRunning.origin}/api/servers/create`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        display_name: "Compliant Clinic Server",
        server_class: "compliant",
        deployment_class: "customer_server",
        plan: "cax11",
      }),
    });

    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      ok?: boolean;
      server_id?: string;
      server_class?: string;
      deployment_class?: string;
    };
    expect(createBody.ok).toBe(true);
    expect(createBody.server_class).toBe("compliant");
    expect(createBody.deployment_class).toBe("customer_server");
    expect(compliantProvider.createServer).toHaveBeenCalledTimes(1);

    withStore(frontdoor.config, (store) => {
      const created = store.getServer(String(createBody.server_id));
      expect(created?.provider).toBe("aws");
      expect(created?.serverClass).toBe("compliant");
      expect(created?.deploymentClass).toBe("customer_server");
      expect(created?.privateIp).toBe("10.42.0.10");
    });
  });

  it("lets dev creator emails bypass free tier and payment gates for hosted server creation", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    config.devCreatorEmails = new Set(["owner@example.com"]);
    const provider: CloudProvider = {
      createServer: vi.fn().mockResolvedValue({
        providerServerId: "i-devcreator-1",
        publicIp: "",
        privateIp: "10.42.0.50",
        backupEnabled: false,
        deleteProtectionEnabled: false,
        rebuildProtectionEnabled: false,
      }),
      getServerStatus: vi.fn(),
      archiveServer: vi.fn(),
      restoreServer: vi.fn(),
      createRecoveryPoint: vi.fn(),
      setProtection: vi.fn(),
      destroyServer: vi.fn(),
      listPlans: vi.fn(() => []),
    };
    const frontdoor = createFrontdoorServer({ config, compliantCloudProvider: provider });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const createResp = await fetch(`${frontdoorRunning.origin}/api/servers/create`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        display_name: "Internal Dogfood Server",
        server_class: "compliant",
        deployment_class: "customer_server",
        plan: "cax21",
      }),
    });

    expect(createResp.status).toBe(200);
    const createBody = (await createResp.json()) as {
      ok?: boolean;
      error?: string;
      server_id?: string;
      server_class?: string;
    };
    expect(createBody.ok).toBe(true);
    expect(createBody.error).toBeUndefined();
    expect(createBody.server_class).toBe("compliant");
    expect(provider.createServer).toHaveBeenCalledTimes(1);
  });

  it("uses the aws-backed provider for lifecycle actions on compliant servers", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const compliantProvider: CloudProvider = {
      createServer: vi.fn(),
      getServerStatus: vi.fn(),
      archiveServer: vi.fn().mockResolvedValue(undefined),
      restoreServer: vi.fn().mockResolvedValue(undefined),
      createRecoveryPoint: vi.fn().mockResolvedValue({
        providerArtifactId: "ami-rp-1",
        captureType: "image",
      }),
      setProtection: vi.fn().mockResolvedValue(undefined),
      destroyServer: vi.fn().mockResolvedValue(undefined),
      listPlans: vi.fn(() => []),
    };
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
      compliantCloudProvider: compliantProvider,
    });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      const seeded = store.getServer("tenant-dev");
      if (!seeded) {
        throw new Error("missing_seeded_server");
      }
      store.upsertServer({
        ...seeded,
        serverClass: "compliant",
        provider: "aws",
        providerServerId: "i-aws-tenant-dev",
        backupEnabled: false,
        deleteProtectionEnabled: true,
        rebuildProtectionEnabled: true,
      });
    });
    const cookie = await login(frontdoorRunning.origin);

    const recoveryResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/recovery-points`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: "AWS recovery point" }),
      },
    );
    expect(recoveryResp.status).toBe(200);

    const archiveResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/archive`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(archiveResp.status).toBe(200);

    const restoreResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/restore`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(restoreResp.status).toBe(200);

    const destroyResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/destroy`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    });
    expect(destroyResp.status).toBe(200);

    expect(compliantProvider.createRecoveryPoint).toHaveBeenCalledWith(
      "i-aws-tenant-dev",
      "AWS recovery point",
    );
    expect(compliantProvider.archiveServer).toHaveBeenCalledWith("i-aws-tenant-dev");
    expect(compliantProvider.restoreServer).toHaveBeenCalledWith("i-aws-tenant-dev");
    expect(compliantProvider.setProtection).toHaveBeenCalledWith("i-aws-tenant-dev", {
      delete: false,
      rebuild: false,
    });
    expect(compliantProvider.destroyServer).toHaveBeenCalledWith("i-aws-tenant-dev");
  });

  it("supports operator server inventory and rejects non-operator access", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    const memberUser = {
      id: "u-member",
      username: "member",
      passwordHash: createPasswordHash("memberpass"),
      tenantId: "tenant-none",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["member"],
      scopes: ["chat.send"],
      disabled: false,
    };
    config.usersByUsername.set("member", memberUser);
    config.usersById.set("u-member", memberUser);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      store.addAccountMember(SEEDED_ACCOUNT_ID, "u-member", "member", "u-owner");
    });

    const ownerCookie = await login(frontdoorRunning.origin);
    const operatorResp = await fetch(`${frontdoorRunning.origin}/api/operator/servers`, {
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(operatorResp.status).toBe(200);
    const operatorBody = (await operatorResp.json()) as {
      ok: boolean;
      total_servers: number;
      items: Array<{
        server_id: string;
        server_class?: string;
        member_count: number;
        subscription?: { tier?: string; status?: string };
        usage_30d?: { requests_total?: number };
      }>;
    };
    expect(operatorBody.ok).toBe(true);
    expect(operatorBody.total_servers).toBeGreaterThanOrEqual(1);
    expect(operatorBody.items.some((item) => item.server_id === "tenant-dev")).toBe(true);
    const tenantDev = operatorBody.items.find((item) => item.server_id === "tenant-dev");
    expect(tenantDev?.server_class).toBe("standard");
    expect(tenantDev?.member_count).toBeGreaterThanOrEqual(2);
    expect(tenantDev?.subscription ?? null).toBeNull();
    expect(typeof tenantDev?.usage_30d?.requests_total).toBe("number");

    const memberCookie = await login(frontdoorRunning.origin, {
      username: "member",
      password: "memberpass",
    });
    const forbiddenResp = await fetch(`${frontdoorRunning.origin}/api/operator/servers`, {
      headers: {
        cookie: memberCookie,
      },
    });
    expect(forbiddenResp.status).toBe(403);
    const forbiddenBody = (await forbiddenResp.json()) as { ok?: boolean; error?: string };
    expect(forbiddenBody.ok).toBe(false);
    expect(forbiddenBody.error).toBe("operator_forbidden");
  });

  it("mints a runtime token with a Frontdoor API token when server_id is provided", async () => {
    const runtimePrimary = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true,"runtime":"primary"}');
      }),
    );
    const runtimeSecondary = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true,"runtime":"secondary"}');
      }),
    );
    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtimePrimary.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const createResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "srv-api-token-runtime",
        display_name: "API Token Runtime Server",
      }),
    });
    expect(createResp.status).toBe(200);

    withStore(frontdoor.config, (store) => {
      const server = store.getServer("srv-api-token-runtime");
      expect(server).toBeTruthy();
      if (!server) {
        throw new Error("missing_created_server");
      }
      store.updateServer("srv-api-token-runtime", {
        privateIp: "127.0.0.1",
        runtimePort: Number(new URL(runtimeSecondary.origin).port || "80"),
      });
      frontdoor.config.tenants.set(server.tenantId, {
        id: server.tenantId,
        runtimeUrl: runtimeSecondary.origin,
        runtimePublicBaseUrl: runtimeSecondary.origin,
      });
    });

    const tokenCreateResp = await fetch(`${frontdoorRunning.origin}/api/tokens/create`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        display_name: "Runtime Mint Test",
      }),
    });
    expect(tokenCreateResp.status).toBe(200);
    const tokenCreateBody = (await tokenCreateResp.json()) as {
      token?: string;
    };
    expect(tokenCreateBody.token).toBeTruthy();

    const runtimeTokenResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenCreateBody.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "srv-api-token-runtime",
      }),
    });
    expect(runtimeTokenResp.status).toBe(200);
    const runtimeTokenBody = (await runtimeTokenResp.json()) as {
      ok?: boolean;
      refresh_token?: string;
      runtime?: { server_id?: string; http_base_url?: string };
    };
    expect(runtimeTokenBody.ok).toBe(true);
    expect(runtimeTokenBody.refresh_token).toBeTruthy();
    expect(runtimeTokenBody.runtime?.server_id).toBe("srv-api-token-runtime");
    expect(runtimeTokenBody.runtime?.http_base_url).toBe(`${runtimeSecondary.origin}/runtime`);
  });

  it("blocks compliant apps on standard servers before install begins", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "glowbot", displayName: "GlowBot" }]);
    stageFakePackage(config, "glowbot", "latest", "app", {
      id: "glowbot",
      version: "latest",
      hosting: {
        required_server_class: "compliant",
        deployment_class: "customer_server",
      },
    });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const purchaseResp = await fetch(`${frontdoorRunning.origin}/api/apps/glowbot/purchase`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "tenant-dev",
        install: true,
      }),
    });
    expect(purchaseResp.status).toBe(409);
    const purchaseBody = (await purchaseResp.json()) as {
      ok?: boolean;
      error?: string;
      detail?: string | null;
    };
    expect(purchaseBody.ok).toBe(false);
    expect(purchaseBody.error).toBe("package_requires_compliant_server");
    expect(String(purchaseBody.detail ?? "")).toContain("glowbot requires compliant");
  });

  it("blocks compliant adapters on standard servers before install begins", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    stageFakePackage(config, "zenoti-emr", "latest", "adapter", {
      id: "zenoti-emr",
      version: "latest",
      hosting: {
        required_server_class: "compliant",
        deployment_class: "customer_server",
      },
    });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const installResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters/zenoti-emr/install`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    expect(installResp.status).toBe(409);
    const installBody = (await installResp.json()) as {
      ok?: boolean;
      error?: string;
      detail?: string | null;
    };
    expect(installBody.ok).toBe(false);
    expect(installBody.error).toBe("package_requires_compliant_server");
    expect(String(installBody.detail ?? "")).toContain("zenoti-emr requires compliant");
  });

  it("blocks product control plane apps on customer servers even for operator users", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [
      { productId: "glowbot-admin", displayName: "GlowBot Admin", visibility: "operator" },
    ]);
    stageFakePackage(config, "glowbot-admin", "latest", "app", {
      id: "glowbot-admin",
      version: "latest",
      hosting: {
        required_server_class: "compliant",
        deployment_class: "product_control_plane",
      },
    });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const serverResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "srv-compliant-clinic",
        display_name: "Compliant Clinic",
        server_class: "compliant",
        deployment_class: "customer_server",
      }),
    });
    expect(serverResp.status).toBe(200);

    const purchaseResp = await fetch(`${frontdoorRunning.origin}/api/apps/glowbot-admin/purchase`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "srv-compliant-clinic",
        install: true,
      }),
    });
    expect(purchaseResp.status).toBe(409);
    const purchaseBody = (await purchaseResp.json()) as {
      ok?: boolean;
      error?: string;
      detail?: string | null;
    };
    expect(purchaseBody.ok).toBe(false);
    expect(purchaseBody.error).toBe("package_deployment_class_mismatch");
    expect(String(purchaseBody.detail ?? "")).toContain("glowbot-admin requires product_control_plane");
  });

  it("supports server usage summary and protects billing summary for admins", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    const memberUser = {
      id: "u-member",
      username: "member",
      passwordHash: createPasswordHash("memberpass"),
      tenantId: "tenant-none",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["member"],
      scopes: ["chat.send"],
      disabled: false,
    };
    config.usersByUsername.set("member", memberUser);
    config.usersById.set("u-member", memberUser);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      store.addAccountMember(SEEDED_ACCOUNT_ID, "u-member", "member", "u-owner");
    });

    const ownerCookie = await login(frontdoorRunning.origin);
    const ownerUsageResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/usage`, {
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(ownerUsageResp.status).toBe(200);
    const ownerUsageBody = (await ownerUsageResp.json()) as {
      ok: boolean;
      server_id: string;
      window_days: number;
      requests_total: number;
      tokens_in: number;
      tokens_out: number;
      active_members: number;
    };
    expect(ownerUsageBody.ok).toBe(true);
    expect(ownerUsageBody.server_id).toBe("tenant-dev");
    expect(ownerUsageBody.window_days).toBe(30);
    expect(typeof ownerUsageBody.requests_total).toBe("number");
    expect(typeof ownerUsageBody.tokens_in).toBe("number");
    expect(typeof ownerUsageBody.tokens_out).toBe("number");
    expect(ownerUsageBody.active_members).toBeGreaterThanOrEqual(0);

    const ownerBillingResp = await fetch(
      `${frontdoorRunning.origin}/api/billing/tenant-dev/subscription`,
      {
        headers: {
          cookie: ownerCookie,
        },
      },
    );
    expect(ownerBillingResp.status).toBe(200);
    const ownerBillingBody = (await ownerBillingResp.json()) as {
      ok: boolean;
      tier?: string;
      status?: string;
      provider?: string;
      limits?: { max_members?: number; max_monthly_tokens?: number };
    };
    expect(ownerBillingBody.ok).toBe(true);
    expect(ownerBillingBody.tier).toBe("free");
    expect(ownerBillingBody.status).toBe("none");
    expect(ownerBillingBody.provider).toBe("none");
    expect(typeof ownerBillingBody.limits?.max_members).toBe("number");
    expect(typeof ownerBillingBody.limits?.max_monthly_tokens).toBe("number");

    const memberCookie = await login(frontdoorRunning.origin, {
      username: "member",
      password: "memberpass",
    });
    const memberUsageResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/usage`, {
      headers: {
        cookie: memberCookie,
      },
    });
    expect(memberUsageResp.status).toBe(200);

    const memberBillingResp = await fetch(
      `${frontdoorRunning.origin}/api/billing/tenant-dev/subscription`,
      {
        headers: {
          cookie: memberCookie,
        },
      },
    );
    expect(memberBillingResp.status).toBe(403);
    const memberBillingBody = (await memberBillingResp.json()) as { ok?: boolean; error?: string };
    expect(memberBillingBody.ok).toBe(false);
    expect(memberBillingBody.error).toBe("billing_forbidden");
  });

  it("returns launch diagnostics with runtime health and launchable app inventory", async () => {
    const seenPaths: string[] = [];
    const runtime = await listen(
      createHttpServer((req, res) => {
        const url = String(req.url || "");
        seenPaths.push(url);
        if (url === "/health") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end('{"ok":true,"runtime":"healthy"}');
          return;
        }
        if (url === "/api/apps") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [
                { app_id: "console", display_name: "Console", entry_path: "/app/console/chat" },
                { app_id: "api-only", display_name: "API Only", entry_path: "/api/only" },
              ],
            }),
          );
          return;
        }
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":false,"error":"not_found"}');
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/launch-diagnostics`, {
      headers: {
        cookie,
      },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      launch_ready?: boolean;
      server?: { server_id?: string };
      runtime_health?: { ok?: boolean; http_status?: number };
      app_catalog?: {
        ok?: boolean;
        app_count?: number;
        items?: Array<{ app_id?: string; entry_path?: string }>;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.launch_ready).toBe(true);
    expect(body.server?.server_id).toBe("tenant-dev");
    expect(body.runtime_health?.ok).toBe(true);
    expect(body.runtime_health?.http_status).toBe(200);
    expect(body.app_catalog?.ok).toBe(true);
    expect(body.app_catalog?.app_count).toBe(1);
    expect(body.app_catalog?.items?.[0]?.app_id).toBe("console");
    expect(body.app_catalog?.items?.[0]?.entry_path).toBe("/app/console/chat");
    expect(seenPaths.includes("/health")).toBe(true);
    expect(seenPaths.includes("/api/apps")).toBe(true);
  });

  it("reports launch diagnostics app-catalog failure when runtime lacks /api/apps", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        const url = String(req.url || "");
        if (url === "/health") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end('{"ok":true}');
          return;
        }
        if (url === "/api/apps") {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end('{"ok":false,"error":"not_found"}');
          return;
        }
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":false,"error":"not_found"}');
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/launch-diagnostics`, {
      headers: {
        cookie,
      },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      launch_ready?: boolean;
      runtime_health?: { ok?: boolean };
      app_catalog?: { ok?: boolean; error?: string | null; app_count?: number };
    };
    expect(body.ok).toBe(true);
    expect(body.launch_ready).toBe(false);
    expect(body.runtime_health?.ok).toBe(true);
    expect(body.app_catalog?.ok).toBe(false);
    expect(body.app_catalog?.error).toBe("not_found");
    expect(body.app_catalog?.app_count).toBe(0);
  });

  it("falls back to /status probe when /health is not available", async () => {
    const seenPaths: string[] = [];
    const runtime = await listen(
      createHttpServer((req, res) => {
        const url = String(req.url || "");
        seenPaths.push(url);
        if (url === "/health") {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end('{"ok":false,"error":"not_found"}');
          return;
        }
        if (url === "/status") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end('{"status":"healthy"}');
          return;
        }
        if (url === "/api/apps") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [{ app_id: "spike-runtime", display_name: "Spike Runtime", entry_path: "/app/spike/" }],
            }),
          );
          return;
        }
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":false,"error":"not_found"}');
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/launch-diagnostics`, {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      launch_ready?: boolean;
      runtime_health?: { ok?: boolean; http_status?: number };
      app_catalog?: { ok?: boolean; app_count?: number };
    };
    expect(body.ok).toBe(true);
    expect(body.launch_ready).toBe(true);
    expect(body.runtime_health?.ok).toBe(true);
    expect(body.runtime_health?.http_status).toBe(200);
    expect(body.app_catalog?.ok).toBe(true);
    expect(body.app_catalog?.app_count).toBe(1);
    expect(seenPaths.includes("/health")).toBe(true);
    expect(seenPaths.includes("/status")).toBe(true);
    expect(seenPaths.includes("/api/apps")).toBe(true);
  });

  it("treats nex_runtime_unavailable health as launch-capable when apps are launchable", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        const url = String(req.url || "");
        if (url === "/health") {
          res.statusCode = 503;
          res.setHeader("content-type", "application/json");
          res.end('{"status":"unhealthy","error":"nex_runtime_unavailable"}');
          return;
        }
        if (url === "/api/apps") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [{ app_id: "console", display_name: "Console", entry_path: "/app/console/chat" }],
            }),
          );
          return;
        }
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":false,"error":"not_found"}');
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/launch-diagnostics`, {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      launch_ready?: boolean;
      runtime_health?: { ok?: boolean; http_status?: number; error?: string | null };
      app_catalog?: { ok?: boolean; app_count?: number };
    };
    expect(body.ok).toBe(true);
    expect(body.launch_ready).toBe(true);
    expect(body.runtime_health?.ok).toBe(false);
    expect(body.runtime_health?.http_status).toBe(503);
    expect(body.runtime_health?.error).toBe("nex_runtime_unavailable");
    expect(body.app_catalog?.ok).toBe(true);
    expect(body.app_catalog?.app_count).toBe(1);
  });

  it("supports billing checkout, signed webhook ingestion, and invoice/subscription reads", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const checkoutResp = await fetch(`${frontdoorRunning.origin}/api/billing/tenant-dev/checkout-session`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        plan_id: "pro",
      }),
    });
    expect(checkoutResp.status).toBe(200);
    const checkoutBody = (await checkoutResp.json()) as {
      ok: boolean;
      provider?: string;
      checkout_url?: string;
      session_id?: string;
    };
    expect(checkoutBody.ok).toBe(true);
    expect(checkoutBody.provider).toBe("mock");
    expect(checkoutBody.checkout_url).toContain("plan_id=pro");
    expect(String(checkoutBody.session_id || "")).toContain("cs_mock_");

    const beforeSubscriptionResp = await fetch(`${frontdoorRunning.origin}/api/billing/tenant-dev/subscription`, {
      headers: {
        cookie,
      },
    });
    expect(beforeSubscriptionResp.status).toBe(200);
    const beforeSubscriptionBody = (await beforeSubscriptionResp.json()) as {
      ok: boolean;
      tier?: string;
      status?: string;
    };
    expect(beforeSubscriptionBody.ok).toBe(true);
    expect(beforeSubscriptionBody.tier).toBe("free");
    expect(beforeSubscriptionBody.status).toBe("none");

    const webhookPayload = {
      id: "evt_mock_1",
      type: "subscription.updated",
      server_id: "tenant-dev",
      plan_id: "pro",
      status: "active",
      customer_id: "cus_mock_1",
      subscription_id: "sub_mock_1",
      period_start_ms: 1_700_000_000_000,
      period_end_ms: 1_702_600_000_000,
      invoice: {
        invoice_id: "in_mock_1",
        status: "paid",
        amount_due: 4200,
        currency: "usd",
        hosted_invoice_url: "https://billing.example.com/in_mock_1",
        created_at_ms: 1_701_000_000_000,
        paid_at_ms: 1_701_000_600_000,
      },
    };
    const webhookRaw = JSON.stringify(webhookPayload);
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", "billing-webhook-secret-test")
      .update(`${timestamp}.${webhookRaw}`, "utf8")
      .digest("base64");
    const webhookResp = await fetch(`${frontdoorRunning.origin}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-frontdoor-webhook-timestamp": timestamp,
        "x-frontdoor-webhook-signature": signature,
      },
      body: webhookRaw,
    });
    expect(webhookResp.status).toBe(200);
    const webhookBody = (await webhookResp.json()) as {
      ok: boolean;
      status?: string;
    };
    expect(webhookBody.ok).toBe(true);
    expect(webhookBody.status).toBe("processed");

    const duplicateResp = await fetch(`${frontdoorRunning.origin}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-frontdoor-webhook-timestamp": timestamp,
        "x-frontdoor-webhook-signature": signature,
      },
      body: webhookRaw,
    });
    expect(duplicateResp.status).toBe(200);
    const duplicateBody = (await duplicateResp.json()) as { ok?: boolean; duplicate?: boolean };
    expect(duplicateBody.ok).toBe(true);
    expect(duplicateBody.duplicate).toBe(true);

    const subscriptionResp = await fetch(`${frontdoorRunning.origin}/api/billing/tenant-dev/subscription`, {
      headers: {
        cookie,
      },
    });
    expect(subscriptionResp.status).toBe(200);
    const subscriptionBody = (await subscriptionResp.json()) as {
      ok: boolean;
      provider?: string;
      tier?: string;
      status?: string;
      customer_id?: string;
      subscription_id?: string;
    };
    expect(subscriptionBody.ok).toBe(true);
    expect(subscriptionBody.provider).toBe("mock");
    expect(subscriptionBody.tier).toBe("pro");
    expect(subscriptionBody.status).toBe("active");
    expect(subscriptionBody.customer_id).toBe("cus_mock_1");
    expect(subscriptionBody.subscription_id).toBe("sub_mock_1");

    const invoicesResp = await fetch(`${frontdoorRunning.origin}/api/billing/tenant-dev/invoices`, {
      headers: {
        cookie,
      },
    });
    expect(invoicesResp.status).toBe(200);
    const invoicesBody = (await invoicesResp.json()) as {
      ok: boolean;
      items: Array<{ invoice_id: string; status: string; amount_due: number; currency: string }>;
    };
    expect(invoicesBody.ok).toBe(true);
    expect(invoicesBody.items.some((item) => item.invoice_id === "in_mock_1")).toBe(true);
    const invoice = invoicesBody.items.find((item) => item.invoice_id === "in_mock_1");
    expect(invoice?.status).toBe("paid");
    expect(invoice?.amount_due).toBe(4200);
    expect(invoice?.currency).toBe("usd");
  });

  it("rejects billing webhook events with invalid signatures", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const payload = JSON.stringify({
      id: "evt_mock_invalid",
      type: "subscription.updated",
      server_id: "tenant-dev",
      plan_id: "pro",
      status: "active",
    });
    const response = await fetch(`${frontdoorRunning.origin}/api/billing/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-frontdoor-webhook-timestamp": String(Date.now()),
        "x-frontdoor-webhook-signature": "invalid-signature",
      },
      body: payload,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Error: invalid_webhook_signature");
  });

  it("enforces billing admin permissions for checkout/subscription/invoices", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    const memberUser = {
      id: "u-member",
      username: "member",
      passwordHash: createPasswordHash("memberpass"),
      tenantId: "tenant-none",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["member"],
      scopes: ["chat.send"],
      disabled: false,
    };
    config.usersByUsername.set("member", memberUser);
    config.usersById.set("u-member", memberUser);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      store.addAccountMember(SEEDED_ACCOUNT_ID, "u-member", "member", "u-owner");
    });
    const memberCookie = await login(frontdoorRunning.origin, {
      username: "member",
      password: "memberpass",
    });

    const checkoutResp = await fetch(`${frontdoorRunning.origin}/api/billing/tenant-dev/checkout-session`, {
      method: "POST",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ plan_id: "pro" }),
    });
    expect(checkoutResp.status).toBe(403);

    const subscriptionResp = await fetch(`${frontdoorRunning.origin}/api/billing/tenant-dev/subscription`, {
      headers: {
        cookie: memberCookie,
      },
    });
    expect(subscriptionResp.status).toBe(403);

    const invoicesResp = await fetch(`${frontdoorRunning.origin}/api/billing/tenant-dev/invoices`, {
      headers: {
        cookie: memberCookie,
      },
    });
    expect(invoicesResp.status).toBe(403);
  });

  it("supports server invite create, redeem, and account-scoped server visibility", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    const memberUser = {
      id: "u-member",
      username: "member",
      passwordHash: createPasswordHash("memberpass"),
      tenantId: "tenant-none",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["member"],
      scopes: ["chat.send"],
      disabled: false,
    };
    config.usersByUsername.set("member", memberUser);
    config.usersById.set("u-member", memberUser);

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const ownerCookie = await login(frontdoorRunning.origin);

    const inviteResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/invites`, {
      method: "POST",
      headers: {
        cookie: ownerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        role: "member",
        scopes: ["chat.send"],
      }),
    });
    expect(inviteResp.status).toBe(200);
    const inviteBody = (await inviteResp.json()) as {
      ok: boolean;
      invite_token: string;
      account_id?: string;
      server_id?: string;
    };
    expect(inviteBody.ok).toBe(true);
    expect(inviteBody.invite_token.startsWith("inv_")).toBe(true);
    expect(inviteBody.account_id).toBe(SEEDED_ACCOUNT_ID);
    expect(inviteBody.server_id).toBe("tenant-dev");

    const memberCookie = await login(frontdoorRunning.origin, {
      username: "member",
      password: "memberpass",
    });
    const accountsBeforeResp = await fetch(`${frontdoorRunning.origin}/api/accounts`, {
      headers: { cookie: memberCookie },
    });
    expect(accountsBeforeResp.status).toBe(200);
    const accountsBeforeBody = (await accountsBeforeResp.json()) as {
      ok: boolean;
      items: Array<{ account_id: string }>;
    };
    expect(accountsBeforeBody.ok).toBe(true);
    expect(accountsBeforeBody.items).toHaveLength(0);

    const redeemResp = await fetch(`${frontdoorRunning.origin}/api/invites/redeem`, {
      method: "POST",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token: inviteBody.invite_token,
      }),
    });
    expect(redeemResp.status).toBe(200);
    const redeemBody = (await redeemResp.json()) as {
      ok: boolean;
      account_id?: string;
      role?: string;
    };
    expect(redeemBody.ok).toBe(true);
    expect(redeemBody.account_id).toBe(SEEDED_ACCOUNT_ID);
    expect(redeemBody.role).toBe("member");

    const accountsResp = await fetch(`${frontdoorRunning.origin}/api/accounts`, {
      headers: { cookie: memberCookie },
    });
    expect(accountsResp.status).toBe(200);
    const accountsBody = (await accountsResp.json()) as {
      ok: boolean;
      active_account_id?: string | null;
      items: Array<{ account_id: string; role: string }>;
    };
    expect(accountsBody.ok).toBe(true);
    expect(accountsBody.active_account_id).toBe(SEEDED_ACCOUNT_ID);
    expect(accountsBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account_id: SEEDED_ACCOUNT_ID,
          role: "member",
        }),
      ]),
    );

    const serversResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      headers: { cookie: memberCookie },
    });
    expect(serversResp.status).toBe(200);
    const serversBody = (await serversResp.json()) as {
      ok: boolean;
      active_account_id?: string | null;
      items: Array<{ server_id: string }>;
    };
    expect(serversBody.ok).toBe(true);
    expect(serversBody.active_account_id).toBe(SEEDED_ACCOUNT_ID);
    expect(serversBody.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ server_id: "tenant-dev" })]),
    );
  });

  it("enforces members.max_count entitlement when creating server invites", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      store.upsertProductPlan({
        planId: "spike-free",
        productId: "spike",
        displayName: "Spike Free",
        priceMonthly: 0,
        isDefault: true,
        sortOrder: 0,
        limitsJson: JSON.stringify({ "members.max_count": 1 }),
      });
      store.createAppSubscription({
        accountId: SEEDED_ACCOUNT_ID,
        appId: "spike",
        planId: "spike-free",
        status: "active",
        provider: "manual",
      });
    });
    const ownerCookie = await login(frontdoorRunning.origin);

    const inviteResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/invites`, {
      method: "POST",
      headers: {
        cookie: ownerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        role: "member",
      }),
    });
    expect(inviteResp.status).toBe(403);
    const inviteBody = (await inviteResp.json()) as {
      ok: boolean;
      error?: string;
      current_members?: number;
      max_members?: number;
    };
    expect(inviteBody.ok).toBe(false);
    expect(inviteBody.error).toBe("members_limit_reached");
    expect(inviteBody.current_members).toBe(1);
    expect(inviteBody.max_members).toBe(1);
  });

  it("supports server detail, runtime key actions, and invite revoke", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );

    const frontdoor = createFrontdoorServer({
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const ownerCookie = await login(frontdoorRunning.origin);

    const serverResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev`, {
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(serverResp.status).toBe(200);
    const serverBody = (await serverResp.json()) as {
      ok: boolean;
      server?: {
        server_id?: string;
        account_id?: string;
        server_class?: string;
        runtime_public_base_url?: string;
        installed_app_ids?: string[];
      };
    };
    expect(serverBody.ok).toBe(true);
    expect(serverBody.server?.server_id).toBe("tenant-dev");
    expect(serverBody.server?.account_id).toBe(SEEDED_ACCOUNT_ID);
    expect(serverBody.server?.server_class).toBe("standard");
    expect(serverBody.server?.runtime_public_base_url).toBe("https://tenant-dev.nexushub.sh");
    expect(serverBody.server?.installed_app_ids).toContain("console");

    const setTokenResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/runtime-auth-token/set`,
      {
        method: "POST",
        headers: {
          cookie: ownerCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: "runtime-auth-token-manual",
        }),
      },
    );
    expect(setTokenResp.status).toBe(200);
    const setTokenBody = (await setTokenResp.json()) as {
      ok: boolean;
      server_id?: string;
      has_runtime_auth_token?: boolean;
    };
    expect(setTokenBody.ok).toBe(true);
    expect(setTokenBody.server_id).toBe("tenant-dev");
    expect(setTokenBody.has_runtime_auth_token).toBe(true);

    const rotateTokenResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/runtime-auth-token/rotate`,
      {
        method: "POST",
        headers: {
          cookie: ownerCookie,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    expect(rotateTokenResp.status).toBe(200);
    const rotateTokenBody = (await rotateTokenResp.json()) as {
      ok: boolean;
      server_id?: string;
      runtime_auth_token?: string;
    };
    expect(rotateTokenBody.ok).toBe(true);
    expect(rotateTokenBody.server_id).toBe("tenant-dev");
    expect(typeof rotateTokenBody.runtime_auth_token).toBe("string");
    expect((rotateTokenBody.runtime_auth_token ?? "").length).toBeGreaterThan(10);

    const clearTokenResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/runtime-auth-token`, {
      method: "DELETE",
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(clearTokenResp.status).toBe(200);
    const clearTokenBody = (await clearTokenResp.json()) as {
      ok: boolean;
      server_id?: string;
      has_runtime_auth_token?: boolean;
    };
    expect(clearTokenBody.ok).toBe(true);
    expect(clearTokenBody.server_id).toBe("tenant-dev");
    expect(clearTokenBody.has_runtime_auth_token).toBe(false);

    const inviteCreateResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/invites`, {
      method: "POST",
      headers: {
        cookie: ownerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        role: "member",
        scopes: ["chat.send"],
      }),
    });
    expect(inviteCreateResp.status).toBe(200);
    const inviteCreateBody = (await inviteCreateResp.json()) as {
      ok: boolean;
      invite_id?: string;
      server_id?: string;
    };
    expect(inviteCreateBody.ok).toBe(true);
    expect(inviteCreateBody.server_id).toBe("tenant-dev");
    expect(typeof inviteCreateBody.invite_id).toBe("string");

    const inviteId = String(inviteCreateBody.invite_id || "");
    const inviteRevokeResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/invites/${encodeURIComponent(inviteId)}`,
      {
        method: "DELETE",
        headers: {
          cookie: ownerCookie,
        },
      },
    );
    expect(inviteRevokeResp.status).toBe(200);
    const inviteRevokeBody = (await inviteRevokeResp.json()) as {
      ok: boolean;
      server_id?: string;
      invite_id?: string;
    };
    expect(inviteRevokeBody.ok).toBe(true);
    expect(inviteRevokeBody.server_id).toBe("tenant-dev");
    expect(inviteRevokeBody.invite_id).toBe(inviteId);

    const inviteListResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/invites`, {
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(inviteListResp.status).toBe(200);
    const inviteListBody = (await inviteListResp.json()) as {
      ok: boolean;
      items: Array<{ invite_id: string; server_id?: string; revoked_at_ms?: number | null }>;
    };
    expect(inviteListBody.ok).toBe(true);
    const revokedInvite = inviteListBody.items.find((item) => item.invite_id === inviteId);
    expect(revokedInvite?.server_id).toBe("tenant-dev");
    expect(Boolean(revokedInvite && revokedInvite.revoked_at_ms)).toBe(true);
  });

  it("returns provisioning status via OIDC identity link fallback when session user_id differs", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    const storePath = path.join(tmpdir(), `nexus-frontdoor-autoprovision-${randomUUID()}.db`);
    config.autoProvision = {
      ...config.autoProvision,
      enabled: true,
      storePath,
      providers: ["google"],
    };

    const store = new AutoProvisionStore(storePath);
    store.startProvisionRequest({
      requestId: "req-google-1",
      userId: "oidc:google:google-sub-123",
      provider: "google",
      subject: "google-sub-123",
      tenantId: "tenant-dev",
      status: "provisioning",
      stage: "run_command",
    });
    store.updateProvisionRequest({
      requestId: "req-google-1",
      status: "ready",
      stage: "complete",
      tenantId: "tenant-dev",
    });
    store.close();

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      store.upsertIdentityLink({
        provider: "google",
        subject: "google-sub-123",
        userId: "u-owner",
      });
    });
    const ownerCookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/servers/provisioning/status`, {
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      status?: string;
      request?: {
        request_id?: string;
        user_id?: string;
        provider?: string;
        subject?: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("ready");
    expect(body.request?.request_id).toBe("req-google-1");
    expect(body.request?.user_id).toBe("oidc:google:google-sub-123");
    expect(body.request?.provider).toBe("google");
    expect(body.request?.subject).toBe("google-sub-123");
  });

  it("installs the intent app on the existing server during product OIDC callback", async () => {
    const legacyRuntime = await listen(
      createHttpServer((req, res) => {
        const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        if (pathname === "/api/apps") {
          res.end(
            JSON.stringify({
              ok: true,
              items: [
                { app_id: "glowbot", display_name: "GlowBot", entry_path: "/app/glowbot/" },
                { app_id: "spike-runtime", display_name: "Spike", entry_path: "/app/spike/" },
              ],
            }),
          );
          return;
        }
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(legacyRuntime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    stageFakePackage(config, "spike");
    config.oidcEnabled = true;
    const key = buildSigningKey("kid-spike");
    config.oidcProviders.set("google", {
      clientId: "frontdoor-client",
      clientSecret: "frontdoor-secret",
      issuer: "https://issuer.example.com",
      jwksUrl: "https://issuer.example.com/.well-known/jwks.json",
      authorizeUrl: "https://issuer.example.com/oauth2/auth",
      tokenUrl: "https://issuer.example.com/oauth2/token",
      redirectUri: "http://127.0.0.1/api/auth/oidc/callback/google",
      scope: "openid profile email",
    });
    const installSpy = vi.spyOn(sshHelper, "installPackageViaRuntimeHttp").mockResolvedValue({ ok: true });

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const provider = config.oidcProviders.get("google");
    if (!provider) {
      throw new Error("missing_oidc_provider");
    }
    provider.redirectUri = `${frontdoorRunning.origin}/api/auth/oidc/callback/google`;

    const startResp = await fetch(
      `${frontdoorRunning.origin}/api/auth/oidc/start?provider=google&product=spike&return_to=%2F`,
      {
        redirect: "manual",
      },
    );
    expect(startResp.status).toBe(302);
    const location = startResp.headers.get("location") ?? "";
    expect(location).toContain("https://issuer.example.com/oauth2/auth");
    const redirect = new URL(location);
    const state = redirect.searchParams.get("state");
    const nonce = redirect.searchParams.get("nonce");
    expect(state).toBeTruthy();
    expect(nonce).toBeTruthy();

    const now = Math.floor(Date.now() / 1000);
    const idToken = signRs256Jwt({
      privateKey: key.privateKey,
      kid: "kid-spike",
      claims: {
        iss: "https://issuer.example.com",
        aud: "frontdoor-client",
        exp: now + 300,
        iat: now - 5,
        nonce,
        sub: "google-sub-owner",
        email: "owner@example.com",
        name: "Owner",
      },
    });
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith(frontdoorRunning.origin)) {
          return await realFetch(input, init);
        }
        if (url === "https://issuer.example.com/oauth2/token") {
          expect(init?.method).toBe("POST");
          return new Response(JSON.stringify({ id_token: idToken, access_token: "token-123" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url === "https://issuer.example.com/.well-known/jwks.json") {
          return new Response(JSON.stringify({ keys: [key.publicJwk] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch url: ${url}`);
      }) as typeof fetch,
    );

    const callbackResp = await fetch(
      `${frontdoorRunning.origin}/api/auth/oidc/callback/google?state=${encodeURIComponent(String(state))}&code=auth-code`,
      {
        redirect: "manual",
      },
    );
    expect(callbackResp.status).toBe(302);
    expect(callbackResp.headers.get("location")).toBe("/app/spike/");
    const setCookie = callbackResp.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    const cookie = String(setCookie).split(";")[0];

    const sessionResp = await fetch(`${frontdoorRunning.origin}/api/auth/session`, {
      headers: {
        cookie,
      },
    });
    expect(sessionResp.status).toBe(200);
    const sessionBody = (await sessionResp.json()) as {
      authenticated?: boolean;
      server_id?: string | null;
      tenant_id?: string;
      active_server_id?: string | null;
    };
    expect(sessionBody.authenticated).toBe(true);
    expect(sessionBody.server_id).toBe("tenant-dev");
    expect(sessionBody.tenant_id).toBe("tenant-dev");
    expect(sessionBody.active_server_id).toBe("tenant-dev");

    const ownedResp = await fetch(`${frontdoorRunning.origin}/api/apps/owned`, {
      headers: { cookie },
    });
    expect(ownedResp.status).toBe(200);
    const ownedBody = (await ownedResp.json()) as {
      ok?: boolean;
      items?: Array<{ app_id?: string; status?: string }>;
    };
    expect(ownedBody.ok).toBe(true);
    expect((ownedBody.items ?? []).some((item) => item.app_id === "spike" && item.status === "active")).toBe(
      true,
    );

    const installStatusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/spike/install-status`,
      {
        headers: { cookie },
      },
    );
    expect(installStatusResp.status).toBe(200);
    const installStatusBody = (await installStatusResp.json()) as {
      ok?: boolean;
      entitlement_status?: string;
      install_status?: string;
    };
    expect(installStatusBody.ok).toBe(true);
    expect(installStatusBody.entitlement_status).toBe("active");
    expect(installStatusBody.install_status).toBe("installed");
    expect(installSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks non-admin users from server admin endpoints", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    const memberUser = {
      id: "u-member",
      username: "member",
      passwordHash: createPasswordHash("memberpass"),
      tenantId: "tenant-none",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["member"],
      scopes: ["chat.send"],
      disabled: false,
    };
    config.usersByUsername.set("member", memberUser);
    config.usersById.set("u-member", memberUser);

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      store.addAccountMember(SEEDED_ACCOUNT_ID, "u-member", "member", "u-owner");
    });
    const memberCookie = await login(frontdoorRunning.origin, {
      username: "member",
      password: "memberpass",
    });

    const serverDetailResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev`, {
      headers: {
        cookie: memberCookie,
      },
    });
    expect(serverDetailResp.status).toBe(200);

    const inviteResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/invites`, {
      method: "POST",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ role: "member" }),
    });
    expect(inviteResp.status).toBe(403);

    const rotateTokenResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/runtime-auth-token/rotate`,
      {
        method: "POST",
        headers: {
          cookie: memberCookie,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    expect(rotateTokenResp.status).toBe(403);
  });

  it("resolves provisioning status by OIDC identity when principal user_id differs", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    const provider = "google";
    const subject = "sub-123";
    const owner = config.usersByUsername.get("owner");
    if (!owner) {
      throw new Error("owner_user_missing");
    }

    const storePath = path.join(tmpdir(), `nexus-frontdoor-autoprovision-${randomUUID()}.db`);
    config.autoProvision.enabled = true;
    config.autoProvision.storePath = storePath;
    config.autoProvision.providers = [provider];
    const autoProvisionStore = new AutoProvisionStore(storePath);
    const ownedRequestID = randomUUID();
    autoProvisionStore.startProvisionRequest({
      requestId: ownedRequestID,
      userId: `oidc:${provider}:${subject}`,
      provider,
      subject,
      tenantId: "tenant-dev",
      status: "provisioning",
      stage: "run_command",
    });
    autoProvisionStore.updateProvisionRequest({
      requestId: ownedRequestID,
      status: "ready",
      stage: "complete",
      tenantId: "tenant-dev",
    });
    const foreignRequestID = randomUUID();
    autoProvisionStore.startProvisionRequest({
      requestId: foreignRequestID,
      userId: "oidc:google:foreign-sub",
      provider,
      subject: "foreign-sub",
      tenantId: "tenant-dev",
      status: "provisioning",
      stage: "run_command",
    });
    autoProvisionStore.updateProvisionRequest({
      requestId: foreignRequestID,
      status: "ready",
      stage: "complete",
      tenantId: "tenant-dev",
    });
    autoProvisionStore.close();

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      store.upsertIdentityLink({
        provider,
        subject,
        userId: owner.id,
      });
    });
    const cookie = await login(frontdoorRunning.origin);

    const sessionResp = await fetch(`${frontdoorRunning.origin}/api/auth/session`, {
      headers: { cookie },
    });
    expect(sessionResp.status).toBe(200);
    const sessionBody = (await sessionResp.json()) as {
      latest_provisioning?: { requestId?: string; request_id?: string; status?: string } | null;
    };
    expect(sessionBody.latest_provisioning).toBeTruthy();
    expect(
      String(
        sessionBody.latest_provisioning?.request_id ?? sessionBody.latest_provisioning?.requestId ?? "",
      ),
    ).toBe(ownedRequestID);
    expect(sessionBody.latest_provisioning?.status).toBe("ready");

    const statusResp = await fetch(`${frontdoorRunning.origin}/api/servers/provisioning/status`, {
      headers: { cookie },
    });
    expect(statusResp.status).toBe(200);
    const statusBody = (await statusResp.json()) as {
      ok: boolean;
      status: string;
      request?: { request_id?: string; status?: string };
    };
    expect(statusBody.ok).toBe(true);
    expect(statusBody.status).toBe("ready");
    expect(statusBody.request?.request_id).toBe(ownedRequestID);
    expect(statusBody.request?.status).toBe("ready");

    const byIDResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/provisioning/status?request_id=${encodeURIComponent(ownedRequestID)}`,
      {
        headers: { cookie },
      },
    );
    expect(byIDResp.status).toBe(200);
    const byIDBody = (await byIDResp.json()) as {
      ok: boolean;
      status: string;
      request?: { request_id?: string };
    };
    expect(byIDBody.ok).toBe(true);
    expect(byIDBody.status).toBe("ready");
    expect(byIDBody.request?.request_id).toBe(ownedRequestID);

    const foreignResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/provisioning/status?request_id=${encodeURIComponent(foreignRequestID)}`,
      {
        headers: { cookie },
      },
    );
    expect(foreignResp.status).toBe(404);
    const foreignBody = (await foreignResp.json()) as { ok?: boolean; error?: string };
    expect(foreignBody.ok).toBe(false);
    expect(foreignBody.error).toBe("request_not_found");
  });

  it("supports server-first app catalog, ownership, install, and entry resolution APIs", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [
                { app_id: "console", display_name: "Console", entry_path: "/app/console/chat" },
                {
                  app_id: "glowbot",
                  display_name: "GlowBot",
                  entry_path: "/app/glowbot/",
                  kind: "proxy",
                },
              ],
            }),
          );
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
    const installSpy = vi.spyOn(sshHelper, "installPackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const serversResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      headers: { cookie },
    });
    expect(serversResp.status).toBe(200);
    const serversBody = (await serversResp.json()) as {
      ok: boolean;
      items: Array<{ server_id: string; generated_name: string }>;
    };
    expect(serversBody.ok).toBe(true);
    expect(serversBody.items.some((item) => item.server_id === "tenant-dev")).toBe(true);
    expect(serversBody.items[0]?.generated_name.length).toBeGreaterThan(0);

    const initialResolveResp = await fetch(
      `${frontdoorRunning.origin}/api/entry/resolve?app_id=glowbot&entry_source=test-suite`,
      { headers: { cookie } },
    );
    expect(initialResolveResp.status).toBe(200);
    const initialResolveBody = (await initialResolveResp.json()) as {
      ok: boolean;
      action: string;
      has_active_entitlement: boolean;
    };
    expect(initialResolveBody.ok).toBe(true);
    expect(initialResolveBody.has_active_entitlement).toBe(false);
    expect(initialResolveBody.action).toBe("purchase_app_then_install");

    const purchaseResp = await fetch(`${frontdoorRunning.origin}/api/apps/glowbot/purchase`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ install: false }),
    });
    expect(purchaseResp.status).toBe(200);

    const ownedResp = await fetch(`${frontdoorRunning.origin}/api/apps/owned`, {
      headers: { cookie },
    });
    expect(ownedResp.status).toBe(200);
    const ownedBody = (await ownedResp.json()) as {
      ok: boolean;
      items: Array<{ app_id: string; status: string }>;
    };
    expect(ownedBody.ok).toBe(true);
    expect(ownedBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          app_id: "glowbot",
          status: "active",
        }),
      ]),
    );

    const installWithoutEntitlementResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/spike/install`,
      {
        method: "POST",
        headers: { cookie },
      },
    );
    expect(installWithoutEntitlementResp.status).toBe(403);
    const installWithoutEntitlementBody = (await installWithoutEntitlementResp.json()) as {
      ok?: boolean;
      error?: string;
    };
    expect(installWithoutEntitlementBody.ok).toBe(false);
    expect(installWithoutEntitlementBody.error).toBe("app_entitlement_required");

    const installResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/glowbot/install`,
      {
        method: "POST",
        headers: { cookie },
      },
    );
    expect(installResp.status).toBe(200);
    const installBody = (await installResp.json()) as { ok: boolean; install_status: string };
    expect(installBody.ok).toBe(true);
    expect(installBody.install_status).toBe("installed");

    const serverAppsResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/apps`, {
      headers: { cookie },
    });
    expect(serverAppsResp.status).toBe(200);
    const serverAppsBody = (await serverAppsResp.json()) as {
      ok: boolean;
      items: Array<{ app_id: string; install_status: string; launchable: boolean }>;
    };
    expect(serverAppsBody.ok).toBe(true);
    expect(serverAppsBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          app_id: "glowbot",
          install_status: "installed",
          launchable: true,
        }),
      ]),
    );

    const installStatusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/glowbot/install-status`,
      {
        headers: { cookie },
      },
    );
    expect(installStatusResp.status).toBe(200);
    const installStatusBody = (await installStatusResp.json()) as {
      ok: boolean;
      entitlement_status: string;
      install_status: string;
    };
    expect(installStatusBody.ok).toBe(true);
    expect(installStatusBody.entitlement_status).toBe("active");
    expect(installStatusBody.install_status).toBe("installed");
    expect(installSpy).toHaveBeenCalledTimes(1);

    const postInstallResolveResp = await fetch(
      `${frontdoorRunning.origin}/api/entry/resolve?app_id=glowbot&entry_source=test-suite`,
      { headers: { cookie } },
    );
    expect(postInstallResolveResp.status).toBe(200);
    const postInstallResolveBody = (await postInstallResolveResp.json()) as {
      ok: boolean;
      action: string;
      has_active_entitlement: boolean;
      installed_server_ids: string[];
    };
    expect(postInstallResolveBody.ok).toBe(true);
    expect(postInstallResolveBody.has_active_entitlement).toBe(true);
    expect(postInstallResolveBody.action).toBe("dashboard_only");
    expect(postInstallResolveBody.installed_server_ids).toContain("tenant-dev");
  });

  it("installs dependency app packages before the requested app package", async () => {
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
      { productId: "glowbot-admin", displayName: "GlowBot Admin" },
      { productId: "glowbot-hub", displayName: "GlowBot Hub" },
    ]);
    const tempDir = path.join(tmpdir(), `nexus-frontdoor-glowbot-runtime API-${randomUUID()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    const adminTarballPath = path.join(tempDir, "glowbot-admin-1.0.0.tar.gz");
    const hubTarballPath = path.join(tempDir, "glowbot-hub-1.0.0.tar.gz");
    fs.writeFileSync(adminTarballPath, "glowbot-admin-package\n", "utf8");
    fs.writeFileSync(hubTarballPath, "glowbot-hub-package\n", "utf8");

    const installSpy = vi.spyOn(sshHelper, "installPackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const store = new FrontdoorStore(frontdoor.config.frontdoorStorePath as string);
    try {
      await publishAppRelease({
        store,
        packageRoot: GLOWBOT_ADMIN_APP_ROOT,
        tarballPath: adminTarballPath,
        targetOs: process.platform,
        targetArch: process.arch,
      });
      await publishAppRelease({
        store,
        packageRoot: GLOWBOT_HUB_APP_ROOT,
        tarballPath: hubTarballPath,
        targetOs: process.platform,
        targetArch: process.arch,
      });
      store.createAppSubscription({
        accountId: SEEDED_ACCOUNT_ID,
        appId: "glowbot-admin",
        planId: "default",
        status: "active",
        provider: "manual",
      });
    } finally {
      store.close();
    }
    const cookie = await login(frontdoorRunning.origin);

    const installResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/glowbot-admin/install`,
      {
        method: "POST",
        headers: { cookie },
      },
    );
    expect(installResp.status).toBe(200);
    const installBody = (await installResp.json()) as { ok: boolean; install_status: string };
    expect(installBody.ok).toBe(true);
    expect(installBody.install_status).toBe("installed");
    expect(installSpy).toHaveBeenCalledTimes(2);
    expect(installSpy.mock.calls[0]?.[0]).toMatchObject({
      kind: "app",
      packageId: "glowbot-hub",
    });
    expect(installSpy.mock.calls[1]?.[0]).toMatchObject({
      kind: "app",
      packageId: "glowbot-admin",
    });

    withStore(config, (verifiedStore) => {
      const adminInstall = verifiedStore.getServerPackageInstall("tenant-dev", "app", "glowbot-admin");
      const hubInstall = verifiedStore.getServerPackageInstall("tenant-dev", "app", "glowbot-hub");
      expect(adminInstall?.status).toBe("installed");
      expect(hubInstall?.status).toBe("installed");
      expect(verifiedStore.listServerPackageRequirements("tenant-dev", "app", "glowbot-admin")).toEqual([
        expect.objectContaining({
          serverId: "tenant-dev",
          requiringKind: "app",
          requiringPackageId: "glowbot-admin",
          requiredKind: "app",
          requiredPackageId: "glowbot-hub",
          versionConstraint: "^1.0.0",
        }),
      ]);
    });
  });

  it("hides operator-only products from public and customer-facing inventory", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, items: [] }));
      }),
    );
    const config = baseConfig(runtime.origin);
    addUserToConfig(config, {
      id: "u-member",
      username: "member",
      passwordHash: createPasswordHash("memberpass"),
      tenantId: "tenant-dev",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["member"],
      scopes: [],
    });
    seedProducts(config, [
      { productId: "glowbot", displayName: "GlowBot", visibility: "customer" },
      { productId: "glowbot-admin", displayName: "GlowBot Admin", visibility: "operator" },
    ]);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const publicProductsResp = await fetch(`${frontdoorRunning.origin}/api/products`);
    expect(publicProductsResp.status).toBe(200);
    const publicProductsBody = (await publicProductsResp.json()) as { items: Array<{ product_id: string }> };
    expect(publicProductsBody.items.map((item) => item.product_id)).toContain("glowbot");
    expect(publicProductsBody.items.map((item) => item.product_id)).not.toContain("glowbot-admin");

    const memberCookie = await login(frontdoorRunning.origin, {
      username: "member",
      password: "memberpass",
    });
    const catalogResp = await fetch(`${frontdoorRunning.origin}/api/apps/catalog`, {
      headers: { cookie: memberCookie },
    });
    expect(catalogResp.status).toBe(200);
    const catalogBody = (await catalogResp.json()) as { items: Array<{ app_id: string }> };
    expect(catalogBody.items.map((item) => item.app_id)).toContain("glowbot");
    expect(catalogBody.items.map((item) => item.app_id)).not.toContain("glowbot-admin");

    const hiddenDetailResp = await fetch(`${frontdoorRunning.origin}/api/products/glowbot-admin`, {
      headers: { cookie: memberCookie },
    });
    expect(hiddenDetailResp.status).toBe(404);

    const hiddenPurchaseResp = await fetch(`${frontdoorRunning.origin}/api/apps/glowbot-admin/purchase`, {
      method: "POST",
      headers: {
        cookie: memberCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(hiddenPurchaseResp.status).toBe(404);

    const hiddenResolveResp = await fetch(
      `${frontdoorRunning.origin}/api/entry/resolve?app_id=glowbot-admin&entry_source=test-suite`,
      {
        headers: { cookie: memberCookie },
      },
    );
    expect(hiddenResolveResp.status).toBe(404);

    const ownerCookie = await login(frontdoorRunning.origin);
    const ownerCatalogResp = await fetch(`${frontdoorRunning.origin}/api/apps/catalog`, {
      headers: { cookie: ownerCookie },
    });
    expect(ownerCatalogResp.status).toBe(200);
    const ownerCatalogBody = (await ownerCatalogResp.json()) as { items: Array<{ app_id: string }> };
    expect(ownerCatalogBody.items.map((item) => item.app_id)).toContain("glowbot-admin");
  });

  it("installs adapters through server adapter routes and uses direct runtime delivery for local runtimes", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    stageFakePackage(config, "confluence", "0.1.0", "adapter");
    const directInstallSpy = vi
      .spyOn(sshHelper, "installPackageViaRuntimeHttp")
      .mockResolvedValue({ ok: true });
    const sshInstallSpy = vi.spyOn(sshHelper, "installPackageViaSSH").mockResolvedValue({ ok: true });
    const frontdoor = createFrontdoorServer({ config });
    withStore(config, (store) => {
      const server = store.getServer("tenant-dev");
      expect(server).toBeTruthy();
      if (!server) {
        throw new Error("missing_server");
      }
      store.updateServer(server.serverId, {
        runtimeAuthToken: "runtime-auth-token-local",
      });
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const initialStatusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters/confluence/install-status`,
      { headers: { cookie } },
    );
    expect(initialStatusResp.status).toBe(200);
    const initialStatusBody = (await initialStatusResp.json()) as {
      ok: boolean;
      install_status: string;
    };
    expect(initialStatusBody.ok).toBe(true);
    expect(initialStatusBody.install_status).toBe("not_installed");

    const installResp = await fetch(
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
    expect(installResp.status).toBe(200);
    const installBody = (await installResp.json()) as {
      ok: boolean;
      adapter_id: string;
      install_status: string;
      version: string;
    };
    expect(installBody.ok).toBe(true);
    expect(installBody.adapter_id).toBe("confluence");
    expect(installBody.install_status).toBe("installed");
    expect(installBody.version).toBe("0.1.0");

    const listResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters`,
      { headers: { cookie } },
    );
    expect(listResp.status).toBe(200);
    const listBody = (await listResp.json()) as {
      ok: boolean;
      items: Array<{ adapter_id: string; install_status: string; active_version: string | null }>;
    };
    expect(listBody.ok).toBe(true);
    expect(listBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          adapter_id: "confluence",
          install_status: "installed",
          active_version: "0.1.0",
        }),
      ]),
    );

    const finalStatusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters/confluence/install-status`,
      { headers: { cookie } },
    );
    expect(finalStatusResp.status).toBe(200);
    const finalStatusBody = (await finalStatusResp.json()) as {
      ok: boolean;
      install_status: string;
      active_version: string | null;
    };
    expect(finalStatusBody.ok).toBe(true);
    expect(finalStatusBody.install_status).toBe("installed");
    expect(finalStatusBody.active_version).toBe("0.1.0");

    expect(directInstallSpy).toHaveBeenCalledTimes(1);
    expect(directInstallSpy.mock.calls[0]?.[0]).toMatchObject({
      kind: "adapter",
      packageId: "confluence",
      version: "0.1.0",
      runtimeUrl: runtime.origin,
    });
    const installToken = String(directInstallSpy.mock.calls[0]?.[0].runtimeBearerToken ?? "");
    expect(installToken).toBe("runtime-auth-token-local");
    expect(sshInstallSpy).not.toHaveBeenCalled();
  });

  it("uses a Frontdoor trusted runtime token for hosted adapter installs", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    stageFakePackage(config, "confluence", "0.1.0", "adapter");
    const directInstallSpy = vi
      .spyOn(sshHelper, "installPackageViaRuntimeHttp")
      .mockResolvedValue({ ok: true });
    const frontdoor = createFrontdoorServer({ config });
    withStore(config, (store) => {
      const server = store.getServer("tenant-dev");
      expect(server).toBeTruthy();
      if (!server) {
        throw new Error("missing_server");
      }
      store.updateServer(server.serverId, {
        provider: "hetzner",
        providerServerId: "123456",
        runtimeAuthToken: "runtime-auth-token-hosted",
      });
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const installResp = await fetch(
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

    expect(installResp.status).toBe(200);
    expect(directInstallSpy).toHaveBeenCalledTimes(1);
    const installToken = String(directInstallSpy.mock.calls[0]?.[0].runtimeBearerToken ?? "");
    expect(installToken.startsWith("eyJ")).toBe(true);
    expect(installToken).not.toBe("runtime-auth-token-hosted");
  });

  it("upgrades an installed adapter through the public Frontdoor route", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    stageFakePackage(config, "confluence", "0.1.0", "adapter");
    stageFakePackage(config, "confluence", "0.1.1", "adapter");
    const frontdoor = createFrontdoorServer({ config });
    withStore(config, (store) => {
      const server = store.getServer("tenant-dev");
      expect(server).toBeTruthy();
      if (!server) {
        throw new Error("missing_server");
      }
      store.updateServer(server.serverId, {
        runtimeAuthToken: "runtime-auth-token-local",
      });
      store.upsertServerPackageInstall({
        serverId: "tenant-dev",
        kind: "adapter",
        packageId: "confluence",
        status: "installed",
        desiredReleaseId: "rel-confluence-0.1.0",
        desiredVersion: "0.1.0",
        activeReleaseId: "rel-confluence-0.1.0",
        activeVersion: "0.1.0",
        installReason: "manual",
      });
    });
    const upgradeSpy = vi.spyOn(sshHelper, "upgradePackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(
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

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(body.version).toBe("0.1.1");
    expect(upgradeSpy).toHaveBeenCalledTimes(1);
    expect(upgradeSpy.mock.calls[0]?.[0]).toMatchObject({
      kind: "adapter",
      packageId: "confluence",
      targetVersion: "0.1.1",
    });
    const upgradeToken = String(upgradeSpy.mock.calls[0]?.[0].runtimeBearerToken ?? "");
    expect(upgradeToken).toBe("runtime-auth-token-local");

    const statusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters/confluence/install-status`,
      { headers: { cookie } },
    );
    expect(statusResp.status).toBe(200);
    const statusBody = (await statusResp.json()) as {
      ok: boolean;
      install_status: string;
      active_version: string | null;
    };
    expect(statusBody.ok).toBe(true);
    expect(statusBody.install_status).toBe("installed");
    expect(statusBody.active_version).toBe("0.1.1");
  });

  it("uninstalls an installed adapter through the public Frontdoor route", async () => {
    const config = baseConfig("http://127.0.0.1:18789");
    const frontdoor = createFrontdoorServer({ config });
    withStore(config, (store) => {
      const server = store.getServer("tenant-dev");
      expect(server).toBeTruthy();
      if (!server) {
        throw new Error("missing_server");
      }
      store.updateServer(server.serverId, {
        runtimeAuthToken: "runtime-auth-token-local",
      });
      store.upsertServerPackageInstall({
        serverId: "tenant-dev",
        kind: "adapter",
        packageId: "confluence",
        status: "installed",
        desiredReleaseId: "rel-confluence-0.1.0",
        desiredVersion: "0.1.0",
        activeReleaseId: "rel-confluence-0.1.0",
        activeVersion: "0.1.0",
        installReason: "manual",
      });
    });
    const uninstallSpy = vi.spyOn(sshHelper, "uninstallPackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters/confluence/install`,
      {
        method: "DELETE",
        headers: { cookie },
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; install_status: string };
    expect(body.ok).toBe(true);
    expect(body.install_status).toBe("not_installed");
    expect(uninstallSpy).toHaveBeenCalledTimes(1);
    expect(uninstallSpy.mock.calls[0]?.[0]).toMatchObject({
      kind: "adapter",
      packageId: "confluence",
    });
    const uninstallToken = String(uninstallSpy.mock.calls[0]?.[0].runtimeBearerToken ?? "");
    expect(uninstallToken).toBe("runtime-auth-token-local");

    const statusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/adapters/confluence/install-status`,
      { headers: { cookie } },
    );
    expect(statusResp.status).toBe(200);
    const statusBody = (await statusResp.json()) as {
      ok: boolean;
      install_status: string;
    };
    expect(statusBody.ok).toBe(true);
    expect(statusBody.install_status).toBe("not_installed");
  });

  it("upgrades an installed app through the package operator path", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "glowbot", displayName: "GlowBot" }]);
    stageFakePackage(config, "glowbot", "1.0.0");
    stageFakePackage(config, "glowbot", "2.0.0");
    const frontdoor = createFrontdoorServer({ config });
    withStore(config, (store) => {
      store.upsertServerAppInstall({
        serverId: "tenant-dev",
        appId: "glowbot",
        status: "installed",
        version: "1.0.0",
        entryPath: "/app/glowbot/",
        source: "manual",
      });
    });
    const upgradeSpy = vi.spyOn(sshHelper, "upgradePackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/glowbot/upgrade`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ target_version: "2.0.0" }),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(body.version).toBe("2.0.0");
    expect(upgradeSpy).toHaveBeenCalledTimes(1);
    expect(upgradeSpy.mock.calls[0]?.[0]).toMatchObject({
      kind: "app",
      packageId: "glowbot",
      targetVersion: "2.0.0",
    });
    const appUpgradeToken = String(upgradeSpy.mock.calls[0]?.[0].runtimeBearerToken ?? "");
    expect(appUpgradeToken).toContain(".");
    expect(decodeJwtPayload(appUpgradeToken)).toMatchObject({
      tenant_id: "tenant-dev",
      role: "operator",
      client_id: "nexus-frontdoor-package-operator",
    });
  });

  it("installs the latest published app release when no explicit version is provided", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [{ app_id: "console", display_name: "Console", entry_path: "/app/console/chat" }],
            }),
          );
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    stageFakePackage(config, "spike", "1.2.3");
    const installSpy = vi.spyOn(sshHelper, "installPackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const purchaseResp = await fetch(`${frontdoorRunning.origin}/api/apps/spike/purchase`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "tenant-dev",
        install: true,
      }),
    });

    expect(purchaseResp.status).toBe(200);
    const purchaseBody = (await purchaseResp.json()) as {
      ok: boolean;
      installed_server_id?: string | null;
    };
    expect(purchaseBody.ok).toBe(true);
    expect(purchaseBody.installed_server_id).toBe("tenant-dev");
    expect(installSpy).toHaveBeenCalledTimes(1);
    expect(installSpy.mock.calls[0]?.[0]).toMatchObject({
      kind: "app",
      packageId: "spike",
      version: "1.2.3",
    });
    const appInstallToken = String(installSpy.mock.calls[0]?.[0].runtimeBearerToken ?? "");
    expect(appInstallToken).toContain(".");
    expect(decodeJwtPayload(appInstallToken)).toMatchObject({
      tenant_id: "tenant-dev",
      role: "operator",
      client_id: "nexus-frontdoor-package-operator",
    });
  });

  it("treats already-installed active runtime conflicts as idempotent success during app purchase", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [{ app_id: "console", display_name: "Console", entry_path: "/app/console/chat" }],
            }),
          );
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    stageFakePackage(config, "spike", "1.2.3");
    vi.spyOn(sshHelper, "installPackageViaRuntimeHttp").mockResolvedValue({
      ok: false,
      error: "runtime_install_failed",
      detail: '{"ok":false,"error":"App \\"spike\\" is already installed (state: active)"}',
    });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const purchaseResp = await fetch(`${frontdoorRunning.origin}/api/apps/spike/purchase`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "tenant-dev",
        install: true,
      }),
    });

    expect(purchaseResp.status).toBe(200);
    const purchaseBody = (await purchaseResp.json()) as {
      ok: boolean;
      installed_server_id?: string | null;
    };
    expect(purchaseBody.ok).toBe(true);
    expect(purchaseBody.installed_server_id).toBe("tenant-dev");

    const installStatusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/spike/install-status`,
      {
        headers: { cookie },
      },
    );
    expect(installStatusResp.status).toBe(200);
    const installStatusBody = (await installStatusResp.json()) as {
      ok: boolean;
      install_status: string;
      last_error?: string | null;
    };
    expect(installStatusBody.ok).toBe(true);
    expect(installStatusBody.install_status).toBe("installed");
    expect(installStatusBody.last_error ?? null).toBeNull();
  });

  it("fails app purchase install when the package artifact is missing", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [{ app_id: "console", display_name: "Console", entry_path: "/app/console/chat" }],
            }),
          );
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const purchaseResp = await fetch(`${frontdoorRunning.origin}/api/apps/spike/purchase`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        server_id: "tenant-dev",
        install: true,
      }),
    });
    expect(purchaseResp.status).toBe(404);
    const purchaseBody = (await purchaseResp.json()) as {
      ok?: boolean;
      error?: string;
      app_id?: string;
      server_id?: string;
    };
    expect(purchaseBody.ok).toBe(false);
    expect(purchaseBody.error).toBe("package_not_found");
    expect(purchaseBody.app_id).toBe("spike");
    expect(purchaseBody.server_id).toBe("tenant-dev");

    const installStatusResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/apps/spike/install-status`,
      {
        headers: { cookie },
      },
    );
    expect(installStatusResp.status).toBe(200);
    const installStatusBody = (await installStatusResp.json()) as {
      ok: boolean;
      install_status: string;
      last_error?: string | null;
    };
    expect(installStatusBody.ok).toBe(true);
    expect(installStatusBody.install_status).toBe("failed");
    expect(String(installStatusBody.last_error || "")).toContain("package_not_found");
  });

  it("executes create_server_and_install for signed-in users with no remaining servers", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [
                { app_id: "console", display_name: "Console", entry_path: "/app/console/chat" },
                { app_id: "glowbot", display_name: "GlowBot", entry_path: "/app/glowbot/" },
              ],
            }),
          );
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
    const storePath = path.join(tmpdir(), `nexus-frontdoor-autoprovision-${randomUUID()}.db`);
    const scriptPath = path.join(tmpdir(), `nexus-frontdoor-entry-provision-script-${randomUUID()}.mjs`);
    const callCountPath = path.join(tmpdir(), `nexus-frontdoor-entry-provision-calls-${randomUUID()}.txt`);
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
    runtime_url: ${JSON.stringify(runtime.origin)},
    runtime_public_base_url: ${JSON.stringify(runtime.origin)}
  }));
});
`,
      "utf8",
    );
    config.autoProvision = {
      ...config.autoProvision,
      enabled: true,
      storePath,
      providers: ["google"],
      command: `${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)}`,
    };
    const installSpy = vi.spyOn(sshHelper, "installPackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      const accountId = store.getAccountsForUser("u-owner")[0]?.accountId;
      if (!accountId) {
        throw new Error("owner account missing");
      }
      store.initializeCredits(accountId, 2500);
      store.upsertIdentityLink({
        provider: "google",
        subject: "owner-sub-123",
        userId: "u-owner",
      });
      store.addCredits({
        accountId,
        amountCents: 100,
        type: "adjustment",
        description: "test credits",
      });
    });
    const cookie = await login(frontdoorRunning.origin);

    const disableServerResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/archive`, {
      method: "POST",
      headers: { cookie },
      body: "{}",
    });
    expect(disableServerResp.status).toBe(200);

    const serversBeforeResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      headers: { cookie },
    });
    expect(serversBeforeResp.status).toBe(200);
    const serversBeforeBody = (await serversBeforeResp.json()) as {
      ok: boolean;
      items: Array<{ server_id: string; status: string }>;
    };
    expect(serversBeforeBody.ok).toBe(true);
    expect(serversBeforeBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          server_id: "tenant-dev",
          status: "archived",
        }),
      ]),
    );

    const executeResp = await fetch(`${frontdoorRunning.origin}/api/entry/execute`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        app_id: "glowbot",
        entry_source: "test-suite",
        create_new_server: true,
      }),
    });
    expect(executeResp.status).toBe(200);
    const executeBody = (await executeResp.json()) as {
      ok: boolean;
      action_requested: string;
      action_taken: string;
      has_active_entitlement: boolean;
      install_status: string;
      launch_ready: boolean;
      server_id?: string;
    };
    expect(executeBody.ok).toBe(true);
    expect(executeBody.action_requested).toBe("create_server_and_install");
    expect(executeBody.action_taken).toBe("create_server_and_install");
    expect(executeBody.has_active_entitlement).toBe(true);
    expect(executeBody.install_status).toBe("installed");
    expect(executeBody.launch_ready).toBe(true);
    expect(String(executeBody.server_id || "")).toMatch(/^tenant-owner-example-com-/);
    expect(executeBody.server_id).not.toBe("tenant-dev");
    expect(installSpy).toHaveBeenCalledTimes(1);

    const callCount = Number(fs.readFileSync(callCountPath, "utf8").trim() || "0");
    expect(callCount).toBe(1);

    const sessionResp = await fetch(`${frontdoorRunning.origin}/api/auth/session`, {
      headers: { cookie },
    });
    expect(sessionResp.status).toBe(200);
    const sessionBody = (await sessionResp.json()) as {
      authenticated?: boolean;
      server_id?: string | null;
      tenant_id?: string;
      active_server_id?: string | null;
    };
    expect(sessionBody.authenticated).toBe(true);
    expect(sessionBody.tenant_id).toBe(executeBody.server_id);
    expect(sessionBody.server_id).toBe(executeBody.server_id);
    expect(sessionBody.active_server_id).toBe(executeBody.server_id);
  });

  it("returns autoprovision_identity_unavailable when create_server_and_install has no allowed identity", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "glowbot", displayName: "GlowBot" }]);
    const storePath = path.join(tmpdir(), `nexus-frontdoor-autoprovision-${randomUUID()}.db`);
    config.autoProvision = {
      ...config.autoProvision,
      enabled: true,
      storePath,
      providers: ["google"],
      command: `${JSON.stringify(process.execPath)} -e ${JSON.stringify("process.stdout.write('{}')")}`,
    };
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      const accountId = store.getAccountsForUser("u-owner")[0]?.accountId;
      if (!accountId) {
        throw new Error("owner account missing");
      }
      store.addCredits({
        accountId,
        amountCents: 2500,
        type: "adjustment",
        description: "test credits",
      });
    });
    const cookie = await login(frontdoorRunning.origin);

    const disableServerResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/archive`, {
      method: "POST",
      headers: { cookie },
      body: "{}",
    });
    expect(disableServerResp.status).toBe(200);

    const executeResp = await fetch(`${frontdoorRunning.origin}/api/entry/execute`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        app_id: "glowbot",
        entry_source: "test-suite",
        create_new_server: true,
      }),
    });
    expect(executeResp.status).toBe(409);
    const executeBody = (await executeResp.json()) as {
      ok?: boolean;
      error?: string;
    };
    expect(executeBody.ok).toBe(false);
    expect(executeBody.error).toBe("autoprovision_identity_unavailable");
  });

  it("supports explicit create_new_server entry execution for signed-in users with existing servers", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [
                { app_id: "console", display_name: "Console", entry_path: "/app/console/chat" },
                { app_id: "glowbot", display_name: "GlowBot", entry_path: "/app/glowbot/" },
              ],
            }),
          );
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
    const storePath = path.join(tmpdir(), `nexus-frontdoor-autoprovision-${randomUUID()}.db`);
    const scriptPath = path.join(tmpdir(), `nexus-frontdoor-entry-new-server-script-${randomUUID()}.mjs`);
    const callCountPath = path.join(tmpdir(), `nexus-frontdoor-entry-new-server-calls-${randomUUID()}.txt`);
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
    runtime_url: ${JSON.stringify(runtime.origin)},
    runtime_public_base_url: ${JSON.stringify(runtime.origin)}
  }));
});
`,
      "utf8",
    );
    config.autoProvision = {
      ...config.autoProvision,
      enabled: true,
      storePath,
      providers: ["google"],
      command: `${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)}`,
    };
    const installSpy = vi.spyOn(sshHelper, "installPackageViaRuntimeHttp").mockResolvedValue({ ok: true });
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      const accountId = store.getAccountsForUser("u-owner")[0]?.accountId;
      if (!accountId) {
        throw new Error("owner account missing");
      }
      store.initializeCredits(accountId, 2500);
      store.upsertIdentityLink({
        provider: "google",
        subject: "owner-sub-123",
        userId: "u-owner",
      });
      store.addCredits({
        accountId,
        amountCents: 100,
        type: "adjustment",
        description: "test credits",
      });
    });
    const cookie = await login(frontdoorRunning.origin);

    const beforeServersResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      headers: { cookie },
    });
    expect(beforeServersResp.status).toBe(200);
    const beforeServersBody = (await beforeServersResp.json()) as {
      ok: boolean;
      items: Array<{ server_id: string }>;
    };
    expect(beforeServersBody.ok).toBe(true);
    expect(beforeServersBody.items).toHaveLength(1);
    expect(beforeServersBody.items[0]?.server_id).toBe("tenant-dev");

    const executeResp = await fetch(`${frontdoorRunning.origin}/api/entry/execute`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        app_id: "glowbot",
        entry_source: "test-suite",
        create_new_server: true,
      }),
    });
    expect(executeResp.status).toBe(200);
    const executeBody = (await executeResp.json()) as {
      ok: boolean;
      create_new_server: boolean;
      action_requested: string;
      action_taken: string;
      server_id?: string;
      launch_ready: boolean;
    };
    expect(executeBody.ok).toBe(true);
    expect(executeBody.create_new_server).toBe(true);
    expect(executeBody.action_requested).toBe("create_server_and_install");
    expect(executeBody.action_taken).toBe("create_server_and_install");
    expect(String(executeBody.server_id || "")).toMatch(/^tenant-owner-example-com-/);
    expect(executeBody.server_id).not.toBe("tenant-dev");
    expect(executeBody.launch_ready).toBe(true);
    expect(installSpy).toHaveBeenCalledTimes(1);

    const afterServersResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      headers: { cookie },
    });
    expect(afterServersResp.status).toBe(200);
    const afterServersBody = (await afterServersResp.json()) as {
      ok: boolean;
      items: Array<{ server_id: string }>;
    };
    expect(afterServersBody.ok).toBe(true);
    expect(afterServersBody.items).toHaveLength(2);
    expect(afterServersBody.items.some((item) => item.server_id === "tenant-dev")).toBe(true);
    expect(afterServersBody.items.some((item) => item.server_id === executeBody.server_id)).toBe(true);

    const callCount = Number(fs.readFileSync(callCountPath, "utf8").trim() || "0");
    expect(callCount).toBe(1);
  });

  it("fails install when the requested package artifact is missing", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [
                { app_id: "console", display_name: "Console", entry_path: "/app/console/chat" },
                { app_id: "glowbot", display_name: "GlowBot", entry_path: "/app/glowbot/" },
              ],
            }),
          );
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const executeResp = await fetch(`${frontdoorRunning.origin}/api/entry/execute`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        app_id: "spike",
        entry_source: "test-suite",
        server_id: "tenant-dev",
      }),
    });
    expect(executeResp.status).toBe(404);
    const executeBody = (await executeResp.json()) as {
      ok: boolean;
      error?: string;
      app_id?: string;
      server_id?: string;
    };
    expect(executeBody.ok).toBe(false);
    expect(executeBody.error).toBe("package_not_found");
    expect(executeBody.app_id).toBe("spike");
    expect(executeBody.server_id).toBe("tenant-dev");

    const serverAppsResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/apps`, {
      headers: { cookie },
    });
    expect(serverAppsResp.status).toBe(200);
    const serverAppsBody = (await serverAppsResp.json()) as {
      ok: boolean;
      items: Array<{
        app_id: string;
        install_status: string;
        launchable: boolean;
        blocked_reason?: string | null;
      }>;
    };
    expect(serverAppsBody.ok).toBe(true);
    expect(serverAppsBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          app_id: "spike",
          install_status: "failed",
          launchable: false,
        }),
      ]),
    );
  });

  it("does not alias runtime spike-runtime app slot to spike product launch readiness", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [
                { app_id: "console", display_name: "Console", entry_path: "/app/console/chat" },
                {
                  app_id: "spike-runtime",
                  display_name: "Spike Runtime",
                  entry_path: "/app/spike/",
                  kind: "proxy",
                },
              ],
            }),
          );
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    seedProducts(config, [{ productId: "spike", displayName: "Spike" }]);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const executeResp = await fetch(`${frontdoorRunning.origin}/api/entry/execute`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        app_id: "spike",
        entry_source: "test-suite",
        server_id: "tenant-dev",
      }),
    });
    expect(executeResp.status).toBe(404);
    const executeBody = (await executeResp.json()) as {
      ok: boolean;
      error?: string;
      app_id?: string;
      server_id?: string;
    };
    expect(executeBody.ok).toBe(false);
    expect(executeBody.error).toBe("package_not_found");
    expect(executeBody.app_id).toBe("spike");
    expect(executeBody.server_id).toBe("tenant-dev");

    const serverAppsResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/apps`, {
      headers: { cookie },
    });
    expect(serverAppsResp.status).toBe(200);
    const serverAppsBody = (await serverAppsResp.json()) as {
      ok: boolean;
      items: Array<{
        app_id: string;
        launchable: boolean;
        blocked_reason?: string | null;
        kind?: string | null;
      }>;
    };
    expect(serverAppsBody.ok).toBe(true);
    expect(serverAppsBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          app_id: "spike",
          install_status: "failed",
          launchable: false,
        }),
        expect.objectContaining({
          app_id: "spike-runtime",
          launchable: false,
          kind: "proxy",
        }),
      ]),
    );
  });

  it("supports durable server archive, recovery points, restore, and final destroy", async () => {
    const runtime = await listen(
      createHttpServer((req, res) => {
        if (req.url?.startsWith("/api/apps")) {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: true,
              items: [{ app_id: "console", display_name: "Console", entry_path: "/app/console/chat" }],
            }),
          );
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    const provider: CloudProvider = {
      createServer: vi.fn(),
      getServerStatus: vi.fn(),
      archiveServer: vi.fn().mockResolvedValue(undefined),
      restoreServer: vi.fn().mockResolvedValue(undefined),
      createRecoveryPoint: vi.fn().mockResolvedValue({
        providerArtifactId: "img-rp-1",
        captureType: "snapshot",
      }),
      setProtection: vi.fn().mockResolvedValue(undefined),
      destroyServer: vi.fn().mockResolvedValue(undefined),
      listPlans: vi.fn(() => []),
    };
    const frontdoor = createFrontdoorServer({ config, cloudProvider: provider });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      const runtimeUrl = new URL(runtime.origin);
      store.updateServer("tenant-dev", {
        provider: "hetzner",
        providerServerId: "hcloud-tenant-dev",
        privateIp: runtimeUrl.hostname,
        transportHost: runtimeUrl.hostname,
        runtimePort: Number(runtimeUrl.port),
        backupEnabled: true,
        deleteProtectionEnabled: true,
        rebuildProtectionEnabled: true,
      });
    });
    const cookie = await login(frontdoorRunning.origin);

    const detailResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev`, {
      headers: { cookie },
    });
    expect(detailResp.status).toBe(200);
    const detailBody = (await detailResp.json()) as {
      ok: boolean;
      server?: {
        status?: string;
        backup_enabled?: boolean;
        delete_protection_enabled?: boolean;
        rebuild_protection_enabled?: boolean;
      };
    };
    expect(detailBody.ok).toBe(true);
    expect(detailBody.server?.status).toBe("running");
    expect(detailBody.server?.backup_enabled).toBe(true);
    expect(detailBody.server?.delete_protection_enabled).toBe(true);
    expect(detailBody.server?.rebuild_protection_enabled).toBe(true);

    const recoveryCreateResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/recovery-points`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          label: "Before risky change",
          notes: "test checkpoint",
        }),
      },
    );
    expect(recoveryCreateResp.status).toBe(200);
    const recoveryCreateBody = (await recoveryCreateResp.json()) as {
      ok: boolean;
      recovery_point?: {
        recovery_point_id?: string;
        provider_artifact_id?: string;
        capture_type?: string;
      };
    };
    expect(recoveryCreateBody.ok).toBe(true);
    expect(recoveryCreateBody.recovery_point?.provider_artifact_id).toBe("img-rp-1");
    expect(recoveryCreateBody.recovery_point?.capture_type).toBe("snapshot");

    const recoveryListResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/recovery-points`,
      {
        headers: { cookie },
      },
    );
    expect(recoveryListResp.status).toBe(200);
    const recoveryListBody = (await recoveryListResp.json()) as {
      ok: boolean;
      items: Array<{ label: string }>;
    };
    expect(recoveryListBody.ok).toBe(true);
    expect(recoveryListBody.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Before risky change" })]),
    );

    const archiveResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/archive`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(archiveResp.status).toBe(200);
    const archiveBody = (await archiveResp.json()) as { ok: boolean; status?: string };
    expect(archiveBody.ok).toBe(true);
    expect(archiveBody.status).toBe("archived");

    const archivedAppsResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/apps`, {
      headers: { cookie },
    });
    expect(archivedAppsResp.status).toBe(200);

    const archivedDetailResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev`, {
      headers: { cookie },
    });
    expect(archivedDetailResp.status).toBe(200);
    const archivedDetailBody = (await archivedDetailResp.json()) as {
      ok: boolean;
      server?: { status?: string; archived_at?: string | null };
    };
    expect(archivedDetailBody.ok).toBe(true);
    expect(archivedDetailBody.server?.status).toBe("archived");
    expect(archivedDetailBody.server?.archived_at).toBeTruthy();

    const restoreResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/restore`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(restoreResp.status).toBe(200);
    const restoreBody = (await restoreResp.json()) as {
      ok: boolean;
      status?: string;
      last_recovered_at?: string | null;
    };
    expect(restoreBody.ok).toBe(true);
    expect(restoreBody.status).toBe("running");
    expect(restoreBody.last_recovered_at).toBeTruthy();

    const destroyWithoutConfirmResp = await fetch(
      `${frontdoorRunning.origin}/api/servers/tenant-dev/destroy`,
      {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    expect(destroyWithoutConfirmResp.status).toBe(409);

    const destroyResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/destroy`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    });
    expect(destroyResp.status).toBe(200);
    const destroyBody = (await destroyResp.json()) as {
      ok: boolean;
      status?: string;
      destroyed_at?: string | null;
    };
    expect(destroyBody.ok).toBe(true);
    expect(destroyBody.status).toBe("destroyed");
    expect(destroyBody.destroyed_at).toBeTruthy();

    const serversResp = await fetch(`${frontdoorRunning.origin}/api/servers`, {
      headers: { cookie },
    });
    expect(serversResp.status).toBe(200);
    const serversBody = (await serversResp.json()) as {
      ok: boolean;
      items: Array<{ server_id: string }>;
    };
    expect(serversBody.ok).toBe(true);
    expect(serversBody.items.some((item) => item.server_id === "tenant-dev")).toBe(false);

    expect(provider.createRecoveryPoint).toHaveBeenCalledWith(
      "hcloud-tenant-dev",
      "Before risky change",
    );
    expect(provider.archiveServer).toHaveBeenCalledWith("hcloud-tenant-dev");
    expect(provider.restoreServer).toHaveBeenCalledWith("hcloud-tenant-dev");
    expect(provider.setProtection).toHaveBeenCalledWith("hcloud-tenant-dev", {
      delete: false,
      rebuild: false,
    });
    expect(provider.destroyServer).toHaveBeenCalledWith("hcloud-tenant-dev");
  });

  it("supports replacement recovery for a failed server from its active recovery point", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      }),
    );
    const config = baseConfig(runtime.origin);
    const provider: CloudProvider = {
      createServer: vi.fn().mockResolvedValue({
        providerServerId: "hcloud-replacement-1",
        publicIp: "198.51.100.55",
        privateIp: "10.0.0.55",
        backupEnabled: true,
        deleteProtectionEnabled: true,
        rebuildProtectionEnabled: true,
      }),
      getServerStatus: vi.fn(),
      archiveServer: vi.fn(),
      restoreServer: vi.fn(),
      createRecoveryPoint: vi.fn(),
      setProtection: vi.fn().mockResolvedValue(undefined),
      destroyServer: vi.fn().mockResolvedValue(undefined),
      listPlans: vi.fn(() => []),
    };
    const frontdoor = createFrontdoorServer({ config, cloudProvider: provider });
    const frontdoorRunning = await listen(frontdoor.server);
    withStore(frontdoor.config, (store) => {
      store.updateServer("tenant-dev", {
        status: "failed",
        provider: "hetzner",
        providerServerId: "hcloud-broken-1",
        privateIp: "10.0.0.9",
        transportHost: "10.0.0.9",
        publicIp: "198.51.100.9",
        backupEnabled: true,
        deleteProtectionEnabled: true,
        rebuildProtectionEnabled: true,
      });
      const recoveryPoint = store.createServerRecoveryPoint({
        recoveryPointId: "rp-replace-1",
        serverId: "tenant-dev",
        tenantId: "tenant-dev",
        provider: "hetzner",
        providerArtifactId: "img-rp-replace-1",
        captureType: "snapshot",
        label: "Known good state",
      });
      store.updateServer("tenant-dev", {
        activeRecoveryPointId: recoveryPoint.recoveryPointId,
      });
    });
    const cookie = await login(frontdoorRunning.origin);

    const restoreResp = await fetch(`${frontdoorRunning.origin}/api/servers/tenant-dev/restore`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(restoreResp.status).toBe(200);
    const restoreBody = (await restoreResp.json()) as {
      ok: boolean;
      status?: string;
      last_recovered_at?: string | null;
    };
    expect(restoreBody.ok).toBe(true);
    expect(restoreBody.status).toBe("recovering");
    expect(restoreBody.last_recovered_at).toBeNull();

    const recoveringServer = withStore(frontdoor.config, (store) => store.getServer("tenant-dev"));
    expect(recoveringServer?.status).toBe("recovering");
    expect(recoveringServer?.providerServerId).toBe("hcloud-replacement-1");
    expect(recoveringServer?.previousProviderServerId).toBe("hcloud-broken-1");
    expect(recoveringServer?.activeRecoveryPointId).toBe("rp-replace-1");
    expect(provider.createServer).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-dev",
        imageId: "img-rp-replace-1",
      }),
    );

    const callbackResp = await fetch(`${frontdoorRunning.origin}/api/internal/provision-callback`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${recoveringServer?.provisionToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        private_ip: "10.0.0.55",
        runtime_port: 8080,
      }),
    });
    expect(callbackResp.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const restoredServer = withStore(frontdoor.config, (store) => store.getServer("tenant-dev"));
    expect(restoredServer?.status).toBe("running");
    expect(restoredServer?.tenantId).toBe("tenant-dev");
    expect(restoredServer?.serverId).toBe("tenant-dev");
    expect(restoredServer?.providerServerId).toBe("hcloud-replacement-1");
    expect(restoredServer?.previousProviderServerId).toBeNull();
    expect(restoredServer?.lastRecoveredAtMs).toBeTruthy();
    expect(provider.setProtection).toHaveBeenCalledWith("hcloud-broken-1", {
      delete: false,
      rebuild: false,
    });
    expect(provider.destroyServer).toHaveBeenCalledWith("hcloud-broken-1");
  });
});
