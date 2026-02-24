import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
} from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer, type RawData } from "ws";
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

afterEach(async () => {
  while (running.length > 0) {
    const item = running.pop();
    if (!item) {
      continue;
    }
    await new Promise<void>((resolve) => item.server.close(() => resolve()));
  }
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
});
