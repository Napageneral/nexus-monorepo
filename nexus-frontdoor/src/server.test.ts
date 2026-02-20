import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server as HttpServer,
} from "node:http";
import { AddressInfo } from "node:net";
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
        },
      ],
    ]),
    usersByUsername: new Map([[user.username, user]]),
    usersById: new Map([[user.id, user]]),
    oidcEnabled: false,
    oidcProviders: new Map(),
    oidcMappings: [],
  };
}

async function login(frontdoorOrigin: string): Promise<string> {
  const response = await fetch(`${frontdoorOrigin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username: "owner",
      password: "changeme",
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
    };
    expect(mintBody.ok).toBe(true);
    expect(mintBody.access_token.split(".")).toHaveLength(3);
    expect(mintBody.tenant_id).toBe("tenant-dev");

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

    const resp = await fetch(`${frontdoorRunning.origin}/app/dashboard?pane=chat`, {
      headers: {
        cookie,
      },
    });
    expect(resp.status).toBe(200);
    expect(lastTenantHeader).toBe("tenant-dev");
    expect(lastRuntimeUrl).toBe("/app/dashboard?pane=chat");
    expect(lastAuthorization.startsWith("Bearer ")).toBe(true);
  });

  it("proxies websocket upgrades with trusted-token header injection", async () => {
    let wsAuthHeader = "";
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
        },
      });
      ws.once("message", (data: RawData) => resolve(String(data)));
      ws.once("error", (error: Error) => reject(error));
    });
    expect(message).toBe("ok");
    expect(wsAuthHeader.startsWith("Bearer ")).toBe(true);
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
});
