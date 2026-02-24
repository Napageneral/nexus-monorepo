import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
} from "node:http";
import { randomUUID } from "node:crypto";
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

  it("bootstraps /app HTML routes with runtime token + runtimeUrl query params", async () => {
    let lastRuntimeUrl = "";
    const runtime = await listen(
      createHttpServer((req, res) => {
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

    const bootstrapResp = await fetch(`${frontdoorRunning.origin}/app/chat?session=main`, {
      redirect: "manual",
      headers: {
        cookie,
        accept: "text/html",
      },
    });
    expect(bootstrapResp.status).toBe(302);
    const location = bootstrapResp.headers.get("location");
    expect(location).toBeTruthy();
    const next = new URL(String(location), frontdoorRunning.origin);
    expect(next.pathname).toBe("/app/chat");
    expect(next.searchParams.get("session")).toBe("main");
    const token = next.searchParams.get("token") ?? "";
    expect(token.split(".")).toHaveLength(3);
    expect(next.searchParams.get("runtimeUrl")).toBe(`ws://${new URL(runtime.origin).host}/`);

    const proxiedResp = await fetch(`${frontdoorRunning.origin}${next.pathname}${next.search}`, {
      headers: {
        cookie,
        accept: "text/html",
      },
    });
    expect(proxiedResp.status).toBe(200);
    expect(lastRuntimeUrl.startsWith("/app/chat?session=main")).toBe(true);
    expect(lastRuntimeUrl.includes("token=")).toBe(true);
    expect(lastRuntimeUrl.includes("runtimeUrl=")).toBe(true);
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
    const message = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`${wsUrl}/runtime/ws`, {
        headers: {
          cookie,
          origin: "https://frontend.example.com",
        },
      });
      ws.once("message", (data: RawData) => resolve(String(data)));
      ws.once("error", (error: Error) => reject(error));
    });
    expect(message).toBe("ok");
    expect(wsAuthHeader.startsWith("Bearer ")).toBe(true);
    expect(wsOriginHeader).toBe(runtime.origin);
    expect(wsForwardedOriginHeader).toBe("https://frontend.example.com");
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
