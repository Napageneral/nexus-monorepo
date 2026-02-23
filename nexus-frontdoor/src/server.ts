import fs from "node:fs";
import path from "node:path";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { URL } from "node:url";
import httpProxy from "http-proxy";
import { loadConfig, resolveProjectRoot } from "./config.js";
import { randomToken } from "./crypto.js";
import { OidcFlowManager } from "./oidc-auth.js";
import { authenticatePassword } from "./password-auth.js";
import { SlidingWindowRateLimiter } from "./rate-limit.js";
import { mintRuntimeAccessToken } from "./runtime-token.js";
import { SessionStore } from "./session-store.js";
import { resolveTenant } from "./tenant-resolver.js";
import { TenantAutoProvisioner } from "./tenant-autoprovision.js";
import type {
  FrontdoorConfig,
  RuntimeDescriptor,
  RuntimeTokenResponse,
  SessionRecord,
  TenantConfig,
} from "./types.js";

type CreateServerOptions = {
  config?: FrontdoorConfig;
};

type JsonResponse = Record<string, unknown>;

function getClientIp(req: IncomingMessage): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (typeof forwarded === "string" && forwarded.trim()) {
    const [first] = forwarded.split(",");
    if (first && first.trim()) {
      return first.trim();
    }
  }
  const remote = req.socket.remoteAddress ?? "";
  return remote.trim() || "unknown";
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie ?? "";
  const out: Record<string, string> = {};
  for (const entry of raw.split(";")) {
    const [keyPart, ...valueParts] = entry.split("=");
    const key = keyPart?.trim();
    if (!key) {
      continue;
    }
    out[key] = decodeURIComponent(valueParts.join("=").trim());
  }
  return out;
}

function setCookie(params: {
  res: ServerResponse;
  name: string;
  value: string;
  maxAgeSeconds?: number;
}): void {
  const attrs = [
    `${params.name}=${encodeURIComponent(params.value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (typeof params.maxAgeSeconds === "number") {
    attrs.push(`Max-Age=${Math.max(0, Math.floor(params.maxAgeSeconds))}`);
  }
  params.res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearCookie(params: { res: ServerResponse; name: string }): void {
  params.res.setHeader(
    "Set-Cookie",
    `${params.name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, payload: JsonResponse): void {
  const body = `${JSON.stringify(payload)}\n`;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", String(Buffer.byteLength(body, "utf8")));
  res.end(body);
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
}

function readSession(params: {
  req: IncomingMessage;
  config: FrontdoorConfig;
  sessions: SessionStore;
}): SessionRecord | null {
  const cookies = parseCookies(params.req);
  const sessionId = cookies[params.config.sessionCookieName];
  if (!sessionId) {
    return null;
  }
  return params.sessions.getSession(sessionId);
}

function resolveRuntimeDescriptor(tenant: TenantConfig): RuntimeDescriptor {
  const baseRaw = tenant.runtimePublicBaseUrl?.trim() || tenant.runtimeUrl.trim();
  let base = baseRaw;
  let wsUrl = tenant.runtimeWsUrl?.trim();
  let sseUrl = tenant.runtimeSseUrl?.trim();
  try {
    const parsedBase = new URL(baseRaw);
    const baseNoHash = new URL(parsedBase.toString());
    baseNoHash.hash = "";
    baseNoHash.search = "";
    base = baseNoHash.toString().replace(/\/$/, "");

    if (!wsUrl) {
      const wsParsed = new URL(baseNoHash.toString());
      wsParsed.protocol = wsParsed.protocol === "https:" ? "wss:" : "ws:";
      wsParsed.pathname = "/";
      wsParsed.search = "";
      wsParsed.hash = "";
      wsUrl = wsParsed.toString();
    }
    if (!sseUrl) {
      const sseParsed = new URL("/api/events/stream", baseNoHash);
      sseParsed.search = "";
      sseParsed.hash = "";
      sseUrl = sseParsed.toString();
    }
  } catch {
    const normalized = baseRaw.replace(/\/+$/, "");
    base = normalized;
    if (!wsUrl) {
      wsUrl = normalized.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:") + "/";
    }
    if (!sseUrl) {
      sseUrl = `${normalized}/api/events/stream`;
    }
  }
  return {
    tenant_id: tenant.id,
    base_url: base,
    http_base_url: base,
    ws_url: wsUrl!,
    sse_url: sseUrl!,
  };
}

function resolveTargetOrigin(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).origin.toLowerCase();
  } catch {
    return null;
  }
}

function buildRuntimeTokenResponse(params: {
  config: FrontdoorConfig;
  session: SessionRecord;
  refreshToken: string;
  tenant: TenantConfig;
  clientId?: string;
}): RuntimeTokenResponse {
  const access = mintRuntimeAccessToken({
    config: params.config,
    principal: params.session.principal,
    sessionId: params.session.id,
    clientId: params.clientId,
  });
  return {
    access_token: access.token,
    token_type: "Bearer",
    expires_in: access.expiresInSeconds,
    key_id: access.keyId,
    refresh_token: params.refreshToken,
    refresh_expires_in: params.config.runtimeRefreshTtlSeconds,
    tenant_id: params.session.principal.tenantId,
    entity_id: params.session.principal.entityId,
    scopes: [...params.session.principal.scopes],
    roles: [...params.session.principal.roles],
    runtime: resolveRuntimeDescriptor(params.tenant),
    connection_mode: "direct",
  };
}

function serveUiShell(res: ServerResponse): void {
  const indexPath = path.join(resolveProjectRoot(), "public", "index.html");
  try {
    const html = fs.readFileSync(indexPath, "utf8");
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  } catch (error) {
    sendText(res, 500, `Failed to read UI shell: ${String(error)}`);
  }
}

function socketRateLimited(params: {
  limiter: SlidingWindowRateLimiter;
  key: string;
}): { limited: boolean; retryAfterSeconds?: number } {
  const verdict = params.limiter.consume(params.key);
  if (verdict.ok) {
    return { limited: false };
  }
  return {
    limited: true,
    retryAfterSeconds: verdict.retryAfterSeconds,
  };
}

export function createFrontdoorServer(options: CreateServerOptions = {}): {
  server: HttpServer;
  config: FrontdoorConfig;
} {
  const config = options.config ?? loadConfig();
  const rateLimits = config.rateLimits ?? {
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
  };
  const sessions = new SessionStore(config.sessionTtlSeconds, config.runtimeRefreshTtlSeconds, {
    sqlitePath: config.sessionStorePath,
  });
  const loginAttemptLimiter = new SlidingWindowRateLimiter(
    rateLimits.loginAttempts.windowSeconds * 1000,
    rateLimits.loginAttempts.maxAttempts,
    rateLimits.loginAttempts.blockSeconds * 1000,
  );
  const loginFailureLimiter = new SlidingWindowRateLimiter(
    rateLimits.loginFailures.windowSeconds * 1000,
    rateLimits.loginFailures.maxAttempts,
    rateLimits.loginFailures.blockSeconds * 1000,
  );
  const tokenEndpointLimiter = new SlidingWindowRateLimiter(
    rateLimits.tokenEndpoints.windowSeconds * 1000,
    rateLimits.tokenEndpoints.maxAttempts,
    rateLimits.tokenEndpoints.blockSeconds * 1000,
  );
  const proxyRequestLimiter = new SlidingWindowRateLimiter(
    rateLimits.proxyRequests.windowSeconds * 1000,
    rateLimits.proxyRequests.maxAttempts,
    rateLimits.proxyRequests.blockSeconds * 1000,
  );
  const oidc = new OidcFlowManager();
  const autoProvisioner = config.autoProvision.enabled
    ? new TenantAutoProvisioner(config)
    : null;
  if (autoProvisioner) {
    autoProvisioner.seedTenantsIntoConfig();
  }
  const proxy = httpProxy.createProxyServer({
    ws: true,
    changeOrigin: true,
    xfwd: true,
  });

  proxy.on("error", (error, req, res) => {
    const message = `frontdoor proxy error: ${String(error)}`;
    if (res && "writableEnded" in res && !res.writableEnded) {
      sendText(res as ServerResponse, 502, message);
      return;
    }
    if ("socket" in req && req.socket && !req.socket.destroyed) {
      req.socket.destroy();
    }
  });

  function applyRateLimit(params: {
    req: IncomingMessage;
    res: ServerResponse;
    limiter: SlidingWindowRateLimiter;
    key: string;
    error: string;
  }): boolean {
    const verdict = params.limiter.consume(params.key);
    if (verdict.ok) {
      return true;
    }
    if (typeof verdict.retryAfterSeconds === "number") {
      params.res.setHeader("Retry-After", String(verdict.retryAfterSeconds));
    }
    sendJson(params.res, 429, {
      ok: false,
      error: params.error,
      retry_after_seconds: verdict.retryAfterSeconds ?? null,
    });
    return false;
  }

function proxyRuntimeRequest(params: {
    req: IncomingMessage;
    res: ServerResponse;
    url: URL;
    session: SessionRecord;
    route: "runtime" | "app";
  }): void {
    const tenant = resolveTenant(config, params.session.principal);
    const targetOrigin = resolveTargetOrigin(tenant.runtimeUrl);
    const access = mintRuntimeAccessToken({
      config,
      principal: params.session.principal,
      sessionId: params.session.id,
    });
    params.req.headers.authorization = `Bearer ${access.token}`;
    params.req.headers["x-nexus-frontdoor-tenant"] = tenant.id;
    params.req.headers["x-nexus-frontdoor-session"] = params.session.id;
    params.req.headers["x-request-id"] = params.req.headers["x-request-id"] ?? randomToken(10);
    if (targetOrigin) {
      const originHeader = params.req.headers.origin;
      if (typeof originHeader === "string" && originHeader.trim()) {
        params.req.headers["x-nexus-frontdoor-origin"] = originHeader.trim();
      }
      params.req.headers.origin = targetOrigin;
    }
    const targetPath =
      params.route === "runtime"
        ? params.url.pathname.slice("/runtime".length) || "/"
        : params.url.pathname;
    const nextPath = `${targetPath}${params.url.search || ""}`;
    params.req.url = nextPath;
    proxy.web(params.req, params.res, {
      target: tenant.runtimeUrl,
    });
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", config.baseUrl);
    const pathname = url.pathname;
    const method = (req.method ?? "GET").toUpperCase();
    try {
      if (method === "GET" && pathname === "/health") {
        sendJson(res, 200, {
          ok: true,
          service: "nexus-frontdoor",
          host: config.host,
          port: config.port,
          tenants: config.tenants.size,
        });
        return;
      }

      if (method === "GET" && pathname === "/") {
        serveUiShell(res);
        return;
      }

      if (method === "GET" && pathname === "/api/auth/session") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 200, {
            authenticated: false,
          });
          return;
        }
        sendJson(res, 200, {
          authenticated: true,
          session_id: session.id,
          tenant_id: session.principal.tenantId,
          entity_id: session.principal.entityId,
          username: session.principal.username,
          display_name: session.principal.displayName,
          email: session.principal.email,
          roles: session.principal.roles,
          scopes: session.principal.scopes,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/auth/login") {
        const clientIp = getClientIp(req);
        if (
          !applyRateLimit({
            req,
            res,
            limiter: loginAttemptLimiter,
            key: `login:attempt:${clientIp}`,
            error: "login_rate_limited",
          })
        ) {
          return;
        }
        const body = (await readJsonBody<{ username?: string; password?: string }>(req)) ?? {};
        const username =
          typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const failureKey = `login:failure:${clientIp}:${username || "-"}`;
        const principal = authenticatePassword({
          config,
          username,
          password,
        });
        if (!principal) {
          const failed = loginFailureLimiter.consume(failureKey);
          if (!failed.ok) {
            if (typeof failed.retryAfterSeconds === "number") {
              res.setHeader("Retry-After", String(failed.retryAfterSeconds));
            }
            sendJson(res, 429, {
              ok: false,
              error: "login_rate_limited",
              retry_after_seconds: failed.retryAfterSeconds ?? null,
            });
            return;
          }
          sendJson(res, 401, {
            ok: false,
            error: "invalid_credentials",
          });
          return;
        }
        loginFailureLimiter.reset(failureKey);
        const session = sessions.createSession(principal);
        setCookie({
          res,
          name: config.sessionCookieName,
          value: session.id,
          maxAgeSeconds: config.sessionTtlSeconds,
        });
        sendJson(res, 200, {
          ok: true,
          authenticated: true,
          session_id: session.id,
          tenant_id: principal.tenantId,
          entity_id: principal.entityId,
          roles: principal.roles,
          scopes: principal.scopes,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/auth/logout") {
        const session = readSession({ req, config, sessions });
        if (session) {
          sessions.deleteSession(session.id);
        }
        clearCookie({ res, name: config.sessionCookieName });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === "GET" && pathname === "/api/auth/oidc/start") {
        if (!config.oidcEnabled) {
          sendJson(res, 400, {
            ok: false,
            error: "oidc_disabled",
          });
          return;
        }
        const provider = url.searchParams.get("provider") ?? "default";
        try {
          const started = oidc.begin({
            config,
            provider,
            returnTo: url.searchParams.get("return_to") ?? undefined,
          });
          res.statusCode = 302;
          res.setHeader("location", started.redirectUrl);
          res.end();
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: String(error),
          });
        }
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/auth/oidc/callback/")) {
        if (!config.oidcEnabled) {
          sendJson(res, 400, {
            ok: false,
            error: "oidc_disabled",
          });
          return;
        }
        const provider = pathname.slice("/api/auth/oidc/callback/".length).trim();
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        if (!provider || !state || !code) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_oidc_callback_params",
          });
          return;
        }
        try {
          const completed = await oidc.complete({
            config,
            provider,
            state,
            code,
            resolvePrincipal: async ({ provider: oidcProvider, claims, fallbackPrincipal }) => {
              if (!autoProvisioner) {
                return fallbackPrincipal;
              }
              return await autoProvisioner.resolveOrProvision({
                provider: oidcProvider,
                claims,
                fallbackPrincipal,
              });
            },
          });
          const session = sessions.createSession(completed.principal);
          setCookie({
            res,
            name: config.sessionCookieName,
            value: session.id,
            maxAgeSeconds: config.sessionTtlSeconds,
          });
          res.statusCode = 302;
          res.setHeader("location", completed.returnTo || "/");
          res.end();
        } catch (error) {
          sendJson(res, 401, {
            ok: false,
            error: String(error),
          });
        }
        return;
      }

      if (method === "POST" && pathname === "/api/runtime/token") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (
          !applyRateLimit({
            req,
            res,
            limiter: tokenEndpointLimiter,
            key: `token:endpoint:${session.id}`,
            error: "token_rate_limited",
          })
        ) {
          return;
        }
        const body = (await readJsonBody<{ client_id?: string }>(req)) ?? {};
        const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
        const refreshToken = sessions.issueRefreshToken(session.id);
        const tenant = resolveTenant(config, session.principal);
        sendJson(res, 200, {
          ok: true,
          ...buildRuntimeTokenResponse({
            config,
            session,
            refreshToken,
            tenant,
            clientId: clientId || undefined,
          }),
        });
        return;
      }

      if (method === "POST" && pathname === "/api/runtime/token/refresh") {
        if (
          !applyRateLimit({
            req,
            res,
            limiter: tokenEndpointLimiter,
            key: `token:endpoint:${getClientIp(req)}`,
            error: "token_rate_limited",
          })
        ) {
          return;
        }
        const body = (await readJsonBody<{ refresh_token?: string; client_id?: string }>(req)) ?? {};
        const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
        const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
        if (!refreshToken) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_refresh_token",
          });
          return;
        }
        const rotated = sessions.rotateRefreshToken(refreshToken);
        if (!rotated) {
          sendJson(res, 401, {
            ok: false,
            error: "invalid_refresh_token",
          });
          return;
        }
        const tenant = resolveTenant(config, rotated.session.principal);
        sendJson(res, 200, {
          ok: true,
          ...buildRuntimeTokenResponse({
            config,
            session: rotated.session,
            refreshToken: rotated.nextRefreshToken,
            tenant,
            clientId: clientId || undefined,
          }),
        });
        return;
      }

      if (method === "POST" && pathname === "/api/runtime/token/revoke") {
        if (
          !applyRateLimit({
            req,
            res,
            limiter: tokenEndpointLimiter,
            key: `token:endpoint:${getClientIp(req)}`,
            error: "token_rate_limited",
          })
        ) {
          return;
        }
        const body = (await readJsonBody<{ refresh_token?: string }>(req)) ?? {};
        const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
        if (!refreshToken) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_refresh_token",
          });
          return;
        }
        const revoked = sessions.revokeRefreshToken(refreshToken);
        sendJson(res, revoked ? 200 : 404, {
          ok: revoked,
        });
        return;
      }

      if (pathname === "/api/runtime/token/proxy") {
        sendJson(res, 405, {
          ok: false,
          error: "method_not_allowed",
        });
        return;
      }

      if (
        pathname === "/runtime" ||
        pathname.startsWith("/runtime/") ||
        pathname === "/app" ||
        pathname.startsWith("/app/")
      ) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (
          !applyRateLimit({
            req,
            res,
            limiter: proxyRequestLimiter,
            key: `proxy:${session.id}`,
            error: "proxy_rate_limited",
          })
        ) {
          return;
        }
        proxyRuntimeRequest({
          req,
          res,
          url,
          session,
          route: pathname.startsWith("/runtime") ? "runtime" : "app",
        });
        return;
      }

      sendText(res, 404, "Not Found");
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: String(error),
      });
    }
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", config.baseUrl);
    const isRuntimePath = url.pathname === "/runtime" || url.pathname.startsWith("/runtime/");
    const isAppPath = url.pathname === "/" || url.pathname === "/app" || url.pathname.startsWith("/app/");
    if (!isRuntimePath && !isAppPath) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const session = readSession({ req, config, sessions });
    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const rateLimit = socketRateLimited({
      limiter: proxyRequestLimiter,
      key: `proxy:${session.id}`,
    });
    if (rateLimit.limited) {
      const retryAfter = rateLimit.retryAfterSeconds ?? 1;
      socket.write(
        `HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${retryAfter}\r\nConnection: close\r\n\r\n`,
      );
      socket.destroy();
      return;
    }
    try {
      const tenant = resolveTenant(config, session.principal);
      const targetOrigin = resolveTargetOrigin(tenant.runtimeUrl);
      const access = mintRuntimeAccessToken({
        config,
        principal: session.principal,
        sessionId: session.id,
      });
      req.headers.authorization = `Bearer ${access.token}`;
      req.headers["x-nexus-frontdoor-tenant"] = tenant.id;
      req.headers["x-nexus-frontdoor-session"] = session.id;
      req.headers["x-request-id"] = req.headers["x-request-id"] ?? randomToken(10);
      if (targetOrigin) {
        const originHeader = req.headers.origin;
        if (typeof originHeader === "string" && originHeader.trim()) {
          req.headers["x-nexus-frontdoor-origin"] = originHeader.trim();
        }
        req.headers.origin = targetOrigin;
      }
      const nextPath = isRuntimePath
        ? `${url.pathname.slice("/runtime".length) || "/"}${url.search || ""}`
        : `${url.pathname || "/"}${url.search || ""}`;
      req.url = nextPath;
      proxy.ws(req, socket, head, {
        target: tenant.runtimeUrl,
      });
    } catch {
      socket.write("HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });

  server.on("close", () => {
    sessions.close();
    autoProvisioner?.close();
  });

  return { server, config };
}
