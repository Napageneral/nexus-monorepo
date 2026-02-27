import {
  createServer as createHttpServer,
  type IncomingMessage,
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
import { createPasswordHash } from "./crypto.js";
import { createFrontdoorServer } from "./server.js";
import type { FrontdoorConfig } from "./types.js";

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
  const workspaceStorePath = path.join(tmpdir(), `nexus-frontdoor-workspaces-${randomUUID()}.db`);
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
    sessionCookieName: "nexus_fd_session",
    sessionTtlSeconds: 3600,
    sessionStorePath: undefined,
    workspaceStorePath,
    workspaceOwnerUserIds: new Set(["u-owner"]),
    workspaceDevCreatorEmails: new Set<string>(),
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
  };
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

describe("frontdoor scaffold", () => {
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
      access_token: string;
      refresh_token: string;
      tenant_id: string;
      connection_mode?: string;
      runtime?: {
        tenant_id?: string;
        http_base_url?: string;
        ws_url?: string;
        sse_url?: string;
      };
    };
    expect(mintBody.ok).toBe(true);
    expect(mintBody.access_token.split(".")).toHaveLength(3);
    expect(mintBody.tenant_id).toBe("tenant-dev");
    expect(mintBody.connection_mode).toBe("direct");
    expect(mintBody.runtime?.tenant_id).toBe("tenant-dev");
    expect(mintBody.runtime?.http_base_url).toBe(runtime.origin);
    expect(typeof mintBody.runtime?.ws_url).toBe("string");
    expect(typeof mintBody.runtime?.sse_url).toBe("string");

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
    expect(claims.aud).toBe("control-plane");
  });

  it("proxies /app paths to runtime control UI routes", async () => {
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
        res.setHeader("location", "/app/integrations?connected=github");
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
    expect(resp.headers.get("location")).toBe("/app/integrations?connected=github");
    expect(lastTenantHeader).toBe("tenant-dev");
    expect(lastRuntimeUrl).toBe("/auth/github/callback?code=abc&state=good");
    expect(lastAuthorization.startsWith("Bearer ")).toBe(true);
  });

  it("bootstraps /app HTML routes without leaking token or runtimeUrl in URL", async () => {
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

    const bootstrapResp = await fetch(`${frontdoorRunning.origin}/app/chat?session=main`, {
      headers: {
        cookie,
        accept: "text/html",
      },
    });
    expect(bootstrapResp.status).toBe(200);
    const html = await bootstrapResp.text();
    expect(html.includes("nexus.control.settings.v1")).toBe(true);
    expect(html).toMatch(/runtimeUrl:"ws:\/\/127\.0\.0\.1:\d+\/app\?workspace_id=tenant-dev"/);
    expect(lastRuntimeUrl).toBe("/app/chat?session=main");
    expect(lastRuntimeUrl.includes("token=")).toBe(false);
    expect(lastRuntimeUrl.includes("runtimeUrl=")).toBe(false);
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

  it("supports workspace create, select, and workspace-scoped token mint", async () => {
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

    const createResp = await fetch(`${frontdoorRunning.origin}/api/workspaces`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: "tenant-test-2",
        display_name: "Tenant Test 2",
        runtime_url: runtimeSecondary.origin,
        runtime_public_base_url: runtimeSecondary.origin,
      }),
    });
    expect(createResp.status).toBe(200);

    const listResp = await fetch(`${frontdoorRunning.origin}/api/workspaces`, {
      headers: { cookie },
    });
    expect(listResp.status).toBe(200);
    const listBody = (await listResp.json()) as {
      ok: boolean;
      items: Array<{ workspace_id: string }>;
    };
    expect(listBody.ok).toBe(true);
    expect(listBody.items.some((item) => item.workspace_id === "tenant-test-2")).toBe(true);

    const selectResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/select`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: "tenant-test-2",
      }),
    });
    expect(selectResp.status).toBe(200);

    const tokenResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
      headers: {
        cookie,
      },
    });
    expect(tokenResp.status).toBe(200);
    const tokenBody = (await tokenResp.json()) as {
      tenant_id: string;
      runtime?: { http_base_url?: string };
    };
    expect(tokenBody.tenant_id).toBe("tenant-test-2");
    expect(tokenBody.runtime?.http_base_url).toBe(runtimeSecondary.origin);

    const badWorkspaceResp = await fetch(`${frontdoorRunning.origin}/api/runtime/token`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: "tenant-missing",
      }),
    });
    expect(badWorkspaceResp.status).toBe(403);
  });

  it("supports operator workspace inventory and rejects non-operator access", async () => {
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
      tenantId: "tenant-dev",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["workspace_member"],
      scopes: ["chat.send"],
      disabled: false,
    };
    config.usersByUsername.set("member", memberUser);
    config.usersById.set("u-member", memberUser);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const ownerCookie = await login(frontdoorRunning.origin);
    const operatorResp = await fetch(`${frontdoorRunning.origin}/api/operator/workspaces`, {
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(operatorResp.status).toBe(200);
    const operatorBody = (await operatorResp.json()) as {
      ok: boolean;
      total_workspaces: number;
      items: Array<{
        workspace_id: string;
        member_count: number;
        billing?: { plan_id?: string; status?: string };
        usage_30d?: { requests_total?: number };
      }>;
    };
    expect(operatorBody.ok).toBe(true);
    expect(operatorBody.total_workspaces).toBeGreaterThanOrEqual(1);
    expect(operatorBody.items.some((item) => item.workspace_id === "tenant-dev")).toBe(true);
    const tenantDev = operatorBody.items.find((item) => item.workspace_id === "tenant-dev");
    expect(tenantDev?.member_count).toBeGreaterThanOrEqual(2);
    expect(tenantDev?.billing?.plan_id).toBe("starter");
    expect(typeof tenantDev?.usage_30d?.requests_total).toBe("number");

    const memberCookie = await login(frontdoorRunning.origin, {
      username: "member",
      password: "memberpass",
    });
    const forbiddenResp = await fetch(`${frontdoorRunning.origin}/api/operator/workspaces`, {
      headers: {
        cookie: memberCookie,
      },
    });
    expect(forbiddenResp.status).toBe(403);
    const forbiddenBody = (await forbiddenResp.json()) as { ok?: boolean; error?: string };
    expect(forbiddenBody.ok).toBe(false);
    expect(forbiddenBody.error).toBe("operator_forbidden");
  });

  it("supports workspace usage summary and protects billing summary for admins", async () => {
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
      tenantId: "tenant-dev",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["workspace_member"],
      scopes: ["chat.send"],
      disabled: false,
    };
    config.usersByUsername.set("member", memberUser);
    config.usersById.set("u-member", memberUser);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);

    const ownerCookie = await login(frontdoorRunning.origin);
    const ownerUsageResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/usage`, {
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(ownerUsageResp.status).toBe(200);
    const ownerUsageBody = (await ownerUsageResp.json()) as {
      ok: boolean;
      workspace_id: string;
      window_days: number;
      requests_total: number;
      tokens_in: number;
      tokens_out: number;
      active_members: number;
    };
    expect(ownerUsageBody.ok).toBe(true);
    expect(ownerUsageBody.workspace_id).toBe("tenant-dev");
    expect(ownerUsageBody.window_days).toBe(30);
    expect(typeof ownerUsageBody.requests_total).toBe("number");
    expect(typeof ownerUsageBody.tokens_in).toBe("number");
    expect(typeof ownerUsageBody.tokens_out).toBe("number");
    expect(ownerUsageBody.active_members).toBeGreaterThanOrEqual(1);

    const ownerBillingResp = await fetch(
      `${frontdoorRunning.origin}/api/workspaces/tenant-dev/billing/summary`,
      {
        headers: {
          cookie: ownerCookie,
        },
      },
    );
    expect(ownerBillingResp.status).toBe(200);
    const ownerBillingBody = (await ownerBillingResp.json()) as {
      ok: boolean;
      billing?: { plan_id?: string; status?: string; provider?: string };
      limits?: { max_members?: number; max_monthly_tokens?: number };
    };
    expect(ownerBillingBody.ok).toBe(true);
    expect(ownerBillingBody.billing?.plan_id).toBe("starter");
    expect(ownerBillingBody.billing?.status).toBe("trialing");
    expect(ownerBillingBody.billing?.provider).toBe("none");
    expect(typeof ownerBillingBody.limits?.max_members).toBe("number");
    expect(typeof ownerBillingBody.limits?.max_monthly_tokens).toBe("number");

    const memberCookie = await login(frontdoorRunning.origin, {
      username: "member",
      password: "memberpass",
    });
    const memberUsageResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/usage`, {
      headers: {
        cookie: memberCookie,
      },
    });
    expect(memberUsageResp.status).toBe(200);

    const memberBillingResp = await fetch(
      `${frontdoorRunning.origin}/api/workspaces/tenant-dev/billing/summary`,
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
                { app_id: "control", display_name: "Control", entry_path: "/app/control/chat" },
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
    const frontdoor = createFrontdoorServer({ config: baseConfig(runtime.origin) });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/launch-diagnostics`, {
      headers: {
        cookie,
      },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      launch_ready?: boolean;
      workspace?: { workspace_id?: string };
      runtime_health?: { ok?: boolean; http_status?: number };
      app_catalog?: {
        ok?: boolean;
        app_count?: number;
        items?: Array<{ app_id?: string; entry_path?: string }>;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.launch_ready).toBe(true);
    expect(body.workspace?.workspace_id).toBe("tenant-dev");
    expect(body.runtime_health?.ok).toBe(true);
    expect(body.runtime_health?.http_status).toBe(200);
    expect(body.app_catalog?.ok).toBe(true);
    expect(body.app_catalog?.app_count).toBe(1);
    expect(body.app_catalog?.items?.[0]?.app_id).toBe("control");
    expect(body.app_catalog?.items?.[0]?.entry_path).toBe("/app/control/chat");
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
    const frontdoor = createFrontdoorServer({ config: baseConfig(runtime.origin) });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/launch-diagnostics`, {
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
              items: [{ app_id: "spike-runtime", display_name: "Spike Runtime", entry_path: "/app/spike" }],
            }),
          );
          return;
        }
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":false,"error":"not_found"}');
      }),
    );
    const frontdoor = createFrontdoorServer({ config: baseConfig(runtime.origin) });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/launch-diagnostics`, {
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
              items: [{ app_id: "control", display_name: "Control", entry_path: "/app/control/chat" }],
            }),
          );
          return;
        }
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":false,"error":"not_found"}');
      }),
    );
    const frontdoor = createFrontdoorServer({ config: baseConfig(runtime.origin) });
    const frontdoorRunning = await listen(frontdoor.server);
    const cookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/launch-diagnostics`, {
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
      plan_id?: string;
      status?: string;
    };
    expect(beforeSubscriptionBody.ok).toBe(true);
    expect(beforeSubscriptionBody.plan_id).toBe("starter");
    expect(beforeSubscriptionBody.status).toBe("trialing");

    const webhookPayload = {
      id: "evt_mock_1",
      type: "subscription.updated",
      workspace_id: "tenant-dev",
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
      plan_id?: string;
      status?: string;
      customer_id?: string;
      subscription_id?: string;
    };
    expect(subscriptionBody.ok).toBe(true);
    expect(subscriptionBody.provider).toBe("mock");
    expect(subscriptionBody.plan_id).toBe("pro");
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
      workspace_id: "tenant-dev",
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
      tenantId: "tenant-dev",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["workspace_member"],
      scopes: ["chat.send"],
      disabled: false,
    };
    config.usersByUsername.set("member", memberUser);
    config.usersById.set("u-member", memberUser);
    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
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

  it("rejects creating a workspace bound to an already-used runtime URL", async () => {
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

    const createResp = await fetch(`${frontdoorRunning.origin}/api/workspaces`, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: "tenant-another",
        display_name: "Tenant Another",
        runtime_url: runtime.origin,
      }),
    });
    expect(createResp.status).toBe(400);
    const createBody = (await createResp.json()) as {
      ok: boolean;
      error?: string;
      existing_workspace_id?: string;
    };
    expect(createBody.ok).toBe(false);
    expect(createBody.error).toBe("runtime_url_already_bound");
    expect(createBody.existing_workspace_id).toBe("tenant-dev");
  });

  it("supports invite create and redeem across workspaces", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(runtime.origin);
    config.tenants.set("tenant-alt", {
      id: "tenant-alt",
      runtimeUrl: runtime.origin,
      runtimePublicBaseUrl: runtime.origin,
    });
    const memberUser = {
      id: "u-member",
      username: "member",
      passwordHash: createPasswordHash("memberpass"),
      tenantId: "tenant-alt",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["workspace_member"],
      scopes: ["chat.send"],
      disabled: false,
    };
    config.usersByUsername.set("member", memberUser);
    config.usersById.set("u-member", memberUser);

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const ownerCookie = await login(frontdoorRunning.origin);

    const inviteResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/invites`, {
      method: "POST",
      headers: {
        cookie: ownerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        role: "workspace_member",
        scopes: ["chat.send"],
      }),
    });
    expect(inviteResp.status).toBe(200);
    const inviteBody = (await inviteResp.json()) as {
      ok: boolean;
      invite_token: string;
    };
    expect(inviteBody.ok).toBe(true);
    expect(inviteBody.invite_token.startsWith("inv_")).toBe(true);

    const memberCookie = await login(frontdoorRunning.origin, {
      username: "member",
      password: "memberpass",
    });
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

    const workspacesResp = await fetch(`${frontdoorRunning.origin}/api/workspaces`, {
      headers: {
        cookie: memberCookie,
      },
    });
    expect(workspacesResp.status).toBe(200);
    const workspacesBody = (await workspacesResp.json()) as {
      ok: boolean;
      items: Array<{ workspace_id: string }>;
    };
    expect(workspacesBody.ok).toBe(true);
    const ids = new Set(workspacesBody.items.map((item) => item.workspace_id));
    expect(ids.has("tenant-alt")).toBe(true);
    expect(ids.has("tenant-dev")).toBe(true);
  });

  it("enforces members.max_count entitlement when creating invites", async () => {
    const runtime = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
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
      config: baseConfig(runtime.origin),
    });
    const frontdoorRunning = await listen(frontdoor.server);
    const ownerCookie = await login(frontdoorRunning.origin);

    const createWorkspaceResp = await fetch(`${frontdoorRunning.origin}/api/workspaces`, {
      method: "POST",
      headers: {
        cookie: ownerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspace_id: "tenant-spike-limit",
        display_name: "Spike Limit Workspace",
        runtime_url: runtimeSecondary.origin,
        runtime_public_base_url: runtimeSecondary.origin,
        product_id: "spike",
      }),
    });
    expect(createWorkspaceResp.status).toBe(200);

    const inviteResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-spike-limit/invites`, {
      method: "POST",
      headers: {
        cookie: ownerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        role: "workspace_member",
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

  it("supports workspace admin settings, members, runtime key actions, and invite revoke", async () => {
    const runtimePrimary = await listen(
      createHttpServer((_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end('{"ok":true}');
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
    const ownerCookie = await login(frontdoorRunning.origin);

    const membersResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/members`, {
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(membersResp.status).toBe(200);
    const membersBody = (await membersResp.json()) as {
      ok: boolean;
      workspace_id: string;
      total_members: number;
      items: Array<{ user_id: string }>;
    };
    expect(membersBody.ok).toBe(true);
    expect(membersBody.workspace_id).toBe("tenant-dev");
    expect(membersBody.total_members).toBeGreaterThanOrEqual(1);
    expect(membersBody.items.some((item) => item.user_id === "u-owner")).toBe(true);

    const patchSettingsResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/settings`, {
      method: "PATCH",
      headers: {
        cookie: ownerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        display_name: "Tenant Dev Updated",
        runtime_url: runtimeSecondary.origin,
        runtime_public_base_url: runtimeSecondary.origin,
      }),
    });
    expect(patchSettingsResp.status).toBe(200);
    const patchSettingsBody = (await patchSettingsResp.json()) as {
      ok: boolean;
      workspace?: {
        display_name?: string;
        runtime_url?: string;
        runtime_public_base_url?: string;
      };
    };
    expect(patchSettingsBody.ok).toBe(true);
    expect(patchSettingsBody.workspace?.display_name).toBe("Tenant Dev Updated");
    expect(patchSettingsBody.workspace?.runtime_url).toBe(runtimeSecondary.origin);

    const getSettingsResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/settings`, {
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(getSettingsResp.status).toBe(200);
    const getSettingsBody = (await getSettingsResp.json()) as {
      ok: boolean;
      workspace?: {
        display_name?: string;
        runtime_url?: string;
        has_runtime_auth_token?: boolean;
      };
    };
    expect(getSettingsBody.ok).toBe(true);
    expect(getSettingsBody.workspace?.display_name).toBe("Tenant Dev Updated");
    expect(getSettingsBody.workspace?.runtime_url).toBe(runtimeSecondary.origin);
    expect(getSettingsBody.workspace?.has_runtime_auth_token).toBe(false);

    const setTokenResp = await fetch(
      `${frontdoorRunning.origin}/api/workspaces/tenant-dev/runtime-auth-token/set`,
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
      has_runtime_auth_token?: boolean;
    };
    expect(setTokenBody.ok).toBe(true);
    expect(setTokenBody.has_runtime_auth_token).toBe(true);

    const rotateTokenResp = await fetch(
      `${frontdoorRunning.origin}/api/workspaces/tenant-dev/runtime-auth-token/rotate`,
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
      runtime_auth_token?: string;
    };
    expect(rotateTokenBody.ok).toBe(true);
    expect(typeof rotateTokenBody.runtime_auth_token).toBe("string");
    expect((rotateTokenBody.runtime_auth_token ?? "").length).toBeGreaterThan(10);

    const clearTokenResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/runtime-auth-token`, {
      method: "DELETE",
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(clearTokenResp.status).toBe(200);
    const clearTokenBody = (await clearTokenResp.json()) as {
      ok: boolean;
      has_runtime_auth_token?: boolean;
    };
    expect(clearTokenBody.ok).toBe(true);
    expect(clearTokenBody.has_runtime_auth_token).toBe(false);

    const inviteCreateResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/invites`, {
      method: "POST",
      headers: {
        cookie: ownerCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        role: "workspace_member",
        scopes: ["chat.send"],
      }),
    });
    expect(inviteCreateResp.status).toBe(200);
    const inviteCreateBody = (await inviteCreateResp.json()) as {
      ok: boolean;
      invite_id?: string;
    };
    expect(inviteCreateBody.ok).toBe(true);
    expect(typeof inviteCreateBody.invite_id).toBe("string");

    const inviteId = String(inviteCreateBody.invite_id || "");
    const inviteRevokeResp = await fetch(
      `${frontdoorRunning.origin}/api/workspaces/tenant-dev/invites/${encodeURIComponent(inviteId)}`,
      {
        method: "DELETE",
        headers: {
          cookie: ownerCookie,
        },
      },
    );
    expect(inviteRevokeResp.status).toBe(200);
    const inviteRevokeBody = (await inviteRevokeResp.json()) as { ok: boolean };
    expect(inviteRevokeBody.ok).toBe(true);

    const inviteListResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/invites`, {
      headers: {
        cookie: ownerCookie,
      },
    });
    expect(inviteListResp.status).toBe(200);
    const inviteListBody = (await inviteListResp.json()) as {
      ok: boolean;
      items: Array<{ invite_id: string; revoked_at_ms?: number | null }>;
    };
    expect(inviteListBody.ok).toBe(true);
    const revokedInvite = inviteListBody.items.find((item) => item.invite_id === inviteId);
    expect(Boolean(revokedInvite && revokedInvite.revoked_at_ms)).toBe(true);
  });

  it("returns provisioning status via OIDC identity fallback when session user_id differs", async () => {
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
    const owner = config.usersById.get("u-owner");
    expect(owner).toBeTruthy();
    if (!owner) {
      throw new Error("missing_owner_user");
    }
    owner.entityId = "entity:google:google-sub-123";
    config.usersByUsername.set(owner.username, owner);
    config.usersById.set(owner.id, owner);

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
    const ownerCookie = await login(frontdoorRunning.origin);

    const response = await fetch(`${frontdoorRunning.origin}/api/workspaces/provisioning/status`, {
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

  it("provisions and selects product-scoped workspace on OIDC callback for existing users", async () => {
    const legacyRuntime = await listen(
      createHttpServer((req, res) => {
        const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        if (pathname === "/api/apps") {
          res.end(
            JSON.stringify({
              ok: true,
              items: [{ app_id: "glowbot", display_name: "GlowBot", entry_path: "/app/glowbot/" }],
            }),
          );
          return;
        }
        res.end('{"ok":true}');
      }),
    );
    const spikeRuntime = await listen(
      createHttpServer((req, res) => {
        const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        if (pathname === "/api/apps") {
          res.end(
            JSON.stringify({
              ok: true,
              items: [{ app_id: "spike-runtime", display_name: "Spike", entry_path: "/app/spike" }],
            }),
          );
          return;
        }
        res.end('{"ok":true}');
      }),
    );
    const config = baseConfig(legacyRuntime.origin);
    const storePath = path.join(tmpdir(), `nexus-frontdoor-autoprovision-${randomUUID()}.db`);
    const scriptPath = path.join(tmpdir(), `nexus-frontdoor-provision-script-${randomUUID()}.mjs`);
    fs.writeFileSync(
      scriptPath,
      `
let raw = "";
process.stdin.on("data", (chunk) => { raw += chunk.toString(); });
process.stdin.on("end", () => {
  const payload = JSON.parse(raw || "{}");
  process.stdout.write(JSON.stringify({
    tenant_id: payload.tenant_id,
    runtime_url: ${JSON.stringify(spikeRuntime.origin)},
    runtime_public_base_url: ${JSON.stringify(spikeRuntime.origin)}
  }));
});
`,
      "utf8",
    );
    config.oidcEnabled = true;
    config.autoProvision = {
      ...config.autoProvision,
      enabled: true,
      storePath,
      providers: ["google"],
      command: `${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)}`,
    };
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
    expect(callbackResp.headers.get("location")).toBe("/");
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
      tenant_id?: string;
      active_workspace_id?: string | null;
    };
    expect(sessionBody.authenticated).toBe(true);
    expect(sessionBody.tenant_id).toMatch(/^tenant-spike-/);
    expect(sessionBody.active_workspace_id).toBe(sessionBody.tenant_id);

    const workspacesResp = await fetch(`${frontdoorRunning.origin}/api/workspaces`, {
      headers: {
        cookie,
      },
    });
    expect(workspacesResp.status).toBe(200);
    const workspacesBody = (await workspacesResp.json()) as {
      ok?: boolean;
      items: Array<{ workspace_id: string; product_id: string | null }>;
    };
    expect(workspacesBody.ok).toBe(true);
    const spikeWorkspace = workspacesBody.items.find((item) => item.workspace_id === sessionBody.tenant_id);
    expect(spikeWorkspace?.product_id).toBe("spike");

    const appsResp = await fetch(`${frontdoorRunning.origin}/runtime/api/apps`, {
      headers: {
        cookie,
      },
    });
    expect(appsResp.status).toBe(200);
    const appsBody = (await appsResp.json()) as {
      ok?: boolean;
      items?: Array<{ app_id?: string }>;
    };
    expect(appsBody.ok).toBe(true);
    expect((appsBody.items ?? []).some((item) => item.app_id === "spike-runtime")).toBe(true);

  });

  it("blocks non-admin users from workspace admin endpoints", async () => {
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
      tenantId: "tenant-dev",
      entityId: "entity-member",
      displayName: "Member",
      email: "member@example.com",
      roles: ["workspace_member"],
      scopes: ["chat.send"],
      disabled: false,
    };
    config.usersByUsername.set("member", memberUser);
    config.usersById.set("u-member", memberUser);

    const frontdoor = createFrontdoorServer({ config });
    const frontdoorRunning = await listen(frontdoor.server);
    const memberCookie = await login(frontdoorRunning.origin, {
      username: "member",
      password: "memberpass",
    });

    const membersResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/members`, {
      headers: {
        cookie: memberCookie,
      },
    });
    expect(membersResp.status).toBe(403);

    const settingsResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/tenant-dev/settings`, {
      headers: {
        cookie: memberCookie,
      },
    });
    expect(settingsResp.status).toBe(403);

    const rotateTokenResp = await fetch(
      `${frontdoorRunning.origin}/api/workspaces/tenant-dev/runtime-auth-token/rotate`,
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
    const mappedOwner = {
      ...owner,
      entityId: `entity:${provider}:${subject}`,
    };
    config.usersByUsername.set(mappedOwner.username, mappedOwner);
    config.usersById.set(mappedOwner.id, mappedOwner);

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

    const statusResp = await fetch(`${frontdoorRunning.origin}/api/workspaces/provisioning/status`, {
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
      `${frontdoorRunning.origin}/api/workspaces/provisioning/status?request_id=${encodeURIComponent(ownedRequestID)}`,
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
      `${frontdoorRunning.origin}/api/workspaces/provisioning/status?request_id=${encodeURIComponent(foreignRequestID)}`,
      {
        headers: { cookie },
      },
    );
    expect(foreignResp.status).toBe(404);
    const foreignBody = (await foreignResp.json()) as { ok?: boolean; error?: string };
    expect(foreignBody.ok).toBe(false);
    expect(foreignBody.error).toBe("request_not_found");
  });
});
