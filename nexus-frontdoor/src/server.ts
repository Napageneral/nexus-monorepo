import fs from "node:fs";
import path from "node:path";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { URL } from "node:url";
import httpProxy from "http-proxy";
import { loadConfig, resolveProjectRoot } from "./config.js";
import { randomToken } from "./crypto.js";
import { OidcFlowManager } from "./oidc-auth.js";
import { SlidingWindowRateLimiter } from "./rate-limit.js";
import { mintRuntimeAccessToken } from "./runtime-token.js";
import { SessionStore } from "./session-store.js";
import { TenantAutoProvisioner } from "./tenant-autoprovision.js";
import {
  WorkspaceStore,
  type WorkspaceMembershipView,
  workspaceToTenantConfig,
} from "./workspace-store.js";
import type {
  FrontdoorConfig,
  Principal,
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

function readHeaderValue(input: string | string[] | undefined): string {
  if (Array.isArray(input)) {
    return input.join(",").trim();
  }
  return typeof input === "string" ? input.trim() : "";
}

function prefersHtmlResponse(req: IncomingMessage): boolean {
  const accept = readHeaderValue(req.headers.accept).toLowerCase();
  return accept.includes("text/html");
}

function isLikelyControlUiDocumentPath(pathname: string): boolean {
  return path.extname(pathname) === "";
}

function normalizeEmail(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasWorkspaceAdminRole(membership: WorkspaceMembershipView | null): boolean {
  if (!membership) {
    return false;
  }
  const allowed = new Set(["workspace_owner", "workspace_admin", "operator"]);
  for (const role of membership.roles) {
    if (allowed.has(role)) {
      return true;
    }
  }
  return false;
}

function buildRuntimeTokenResponse(params: {
  config: FrontdoorConfig;
  session: SessionRecord;
  refreshToken: string;
  tenant: TenantConfig;
  principal?: Principal;
  clientId?: string;
}): RuntimeTokenResponse {
  const principal = params.principal ?? params.session.principal;
  const access = mintRuntimeAccessToken({
    config: params.config,
    principal,
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
    tenant_id: principal.tenantId,
    entity_id: principal.entityId,
    scopes: [...principal.scopes],
    roles: [...principal.roles],
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
  const workspaceStore = new WorkspaceStore(
    config.workspaceStorePath ?? path.resolve(resolveProjectRoot(), "state", "frontdoor-workspaces.db"),
  );
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
  workspaceStore.seedFromConfig(config);
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

  function isWorkspaceCreatorAuthorized(principal: Principal): boolean {
    if (config.workspaceOwnerUserIds.has(principal.userId)) {
      return true;
    }
    const email = normalizeEmail(principal.email);
    if (email && config.workspaceDevCreatorEmails.has(email)) {
      return true;
    }
    return false;
  }

  function resolveWorkspaceRuntime(workspaceId: string): TenantConfig | null {
    const configTenant = config.tenants.get(workspaceId);
    if (configTenant) {
      return configTenant;
    }
    const workspace = workspaceStore.getWorkspace(workspaceId);
    if (!workspace) {
      return null;
    }
    const tenant = workspaceToTenantConfig(workspace);
    config.tenants.set(workspaceId, tenant);
    return tenant;
  }

  function resolveActiveWorkspaceContext(params: {
    session: SessionRecord;
    requestedWorkspaceId?: string;
  }):
    | {
        ok: true;
        session: SessionRecord;
        principal: Principal;
        workspace: WorkspaceMembershipView;
        workspaceRuntime: TenantConfig;
        workspaceCount: number;
      }
    | {
        ok: false;
        status: number;
        error: string;
        workspaceCount: number;
      } {
    const user = workspaceStore.getUserById(params.session.principal.userId);
    if (!user || user.disabled) {
      return {
        ok: false,
        status: 401,
        error: "user_not_found",
        workspaceCount: 0,
      };
    }
    const workspaces = workspaceStore.listWorkspacesForUser(user.userId);
    const workspaceCount = workspaces.length;
    let selected = params.requestedWorkspaceId
      ? workspaces.find((item) => item.workspaceId === params.requestedWorkspaceId) ?? null
      : null;
    if (params.requestedWorkspaceId && !selected) {
      return {
        ok: false,
        status: 403,
        error: "workspace_not_authorized",
        workspaceCount,
      };
    }

    if (!selected) {
      if (params.session.principal.tenantId) {
        selected =
          workspaces.find((item) => item.workspaceId === params.session.principal.tenantId) ?? null;
      }
      if (!selected && workspaceCount === 1) {
        selected = workspaces[0] ?? null;
      }
    }

    if (!selected) {
      if (workspaceCount === 0) {
        return {
          ok: false,
          status: 403,
          error: "no_workspace_access",
          workspaceCount,
        };
      }
      return {
        ok: false,
        status: 409,
        error: "workspace_selection_required",
        workspaceCount,
      };
    }

    const runtime = resolveWorkspaceRuntime(selected.workspaceId);
    if (!runtime) {
      return {
        ok: false,
        status: 404,
        error: "workspace_runtime_not_found",
        workspaceCount,
      };
    }

    const nextPrincipal = workspaceStore.toPrincipal({
      user,
      membership: selected,
      amr: params.session.principal.amr,
    });
    const updated = sessions.updateSessionPrincipal(params.session.id, nextPrincipal) ?? {
      ...params.session,
      principal: nextPrincipal,
    };

    return {
      ok: true,
      session: updated,
      principal: nextPrincipal,
      workspace: selected,
      workspaceRuntime: runtime,
      workspaceCount,
    };
  }

  function proxyRuntimeRequest(params: {
    req: IncomingMessage;
    res: ServerResponse;
    url: URL;
    session: SessionRecord;
    principal: Principal;
    runtime: TenantConfig;
    route: "runtime" | "app";
  }): void {
    const targetOrigin = resolveTargetOrigin(params.runtime.runtimeUrl);
    const access = mintRuntimeAccessToken({
      config,
      principal: params.principal,
      sessionId: params.session.id,
    });
    params.req.headers.authorization = `Bearer ${access.token}`;
    params.req.headers["x-nexus-frontdoor-tenant"] = params.runtime.id;
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
      target: params.runtime.runtimeUrl,
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
        const workspaces = workspaceStore.listWorkspacesForUser(session.principal.userId);
        const activeWorkspace =
          (session.principal.tenantId
            ? workspaces.find((item) => item.workspaceId === session.principal.tenantId) ?? null
            : null) ?? null;
        sendJson(res, 200, {
          authenticated: true,
          session_id: session.id,
          user_id: session.principal.userId,
          tenant_id: session.principal.tenantId,
          workspace_id: session.principal.tenantId || null,
          entity_id: session.principal.entityId,
          username: session.principal.username,
          display_name: session.principal.displayName,
          email: session.principal.email,
          roles: session.principal.roles,
          scopes: session.principal.scopes,
          workspace_count: workspaces.length,
          active_workspace_id: activeWorkspace?.workspaceId ?? null,
          active_workspace_display_name: activeWorkspace?.displayName ?? null,
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
        const user = workspaceStore.authenticatePassword(username, password);
        if (!user) {
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
        const defaultMembership = workspaceStore.getDefaultMembership(user.userId);
        const principal = workspaceStore.toPrincipal({
          user,
          membership: defaultMembership,
          amr: ["pwd"],
        });
        const session = sessions.createSession(principal);
        const workspaceCount = workspaceStore.countWorkspacesForUser(user.userId);
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
          workspace_id: principal.tenantId || null,
          entity_id: principal.entityId,
          user_id: principal.userId,
          roles: principal.roles,
          scopes: principal.scopes,
          workspace_count: workspaceCount,
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

      if (method === "GET" && pathname === "/api/workspaces") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const workspaces = workspaceStore.listWorkspacesForUser(session.principal.userId);
        sendJson(res, 200, {
          ok: true,
          items: workspaces.map((item) => ({
            workspace_id: item.workspaceId,
            display_name: item.displayName,
            workspace_slug: item.workspaceSlug,
            status: item.status,
            is_default: item.isDefault,
            roles: item.roles,
            scopes: item.scopes,
          })),
        });
        return;
      }

      if (method === "POST" && pathname === "/api/workspaces/select") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const body = (await readJsonBody<{ workspace_id?: string }>(req)) ?? {};
        const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
        if (!workspaceId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_workspace_id",
          });
          return;
        }
        const context = resolveActiveWorkspaceContext({
          session,
          requestedWorkspaceId: workspaceId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        workspaceStore.setDefaultWorkspace(context.principal.userId, context.workspace.workspaceId);
        sendJson(res, 200, {
          ok: true,
          active_workspace_id: context.workspace.workspaceId,
          active_workspace_display_name: context.workspace.displayName,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/workspaces") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (!isWorkspaceCreatorAuthorized(session.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "workspace_creation_forbidden",
          });
          return;
        }
        const body =
          (await readJsonBody<{
            workspace_id?: string;
            display_name?: string;
            runtime_url?: string;
            runtime_public_base_url?: string;
            runtime_ws_url?: string;
            runtime_sse_url?: string;
            owner_user_id?: string;
          }>(req)) ?? {};
        const displayName =
          typeof body.display_name === "string" && body.display_name.trim()
            ? body.display_name.trim()
            : "Workspace";
        const runtimeUrl = typeof body.runtime_url === "string" ? body.runtime_url.trim() : "";
        if (!runtimeUrl) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_runtime_url",
          });
          return;
        }
        try {
          const workspace = workspaceStore.createWorkspace({
            workspaceId:
              typeof body.workspace_id === "string" && body.workspace_id.trim()
                ? body.workspace_id.trim()
                : undefined,
            displayName,
            runtimeUrl,
            runtimePublicBaseUrl:
              typeof body.runtime_public_base_url === "string"
                ? body.runtime_public_base_url.trim()
                : undefined,
            runtimeWsUrl:
              typeof body.runtime_ws_url === "string" ? body.runtime_ws_url.trim() : undefined,
            runtimeSseUrl:
              typeof body.runtime_sse_url === "string" ? body.runtime_sse_url.trim() : undefined,
          });
          config.tenants.set(workspace.workspaceId, workspaceToTenantConfig(workspace));
          workspaceStore.ensureMembership({
            userId: session.principal.userId,
            workspaceId: workspace.workspaceId,
            entityId: `entity:${workspace.workspaceId}:${session.principal.userId}`,
            roles: ["workspace_owner", "operator"],
            scopes: ["*"],
            isDefault: workspaceStore.countWorkspacesForUser(session.principal.userId) <= 1,
          });
          const ownerUserId =
            typeof body.owner_user_id === "string" ? body.owner_user_id.trim() : "";
          if (ownerUserId && ownerUserId !== session.principal.userId) {
            const ownerUser = workspaceStore.getUserById(ownerUserId);
            if (ownerUser) {
              workspaceStore.ensureMembership({
                userId: ownerUser.userId,
                workspaceId: workspace.workspaceId,
                entityId: `entity:${workspace.workspaceId}:${ownerUser.userId}`,
                roles: ["workspace_owner"],
                scopes: ["*"],
              });
            }
          }
          sendJson(res, 200, {
            ok: true,
            workspace: {
              workspace_id: workspace.workspaceId,
              display_name: workspace.displayName,
              runtime_url: workspace.runtimeUrl,
              runtime_public_base_url: workspace.runtimePublicBaseUrl,
              runtime_ws_url: workspace.runtimeWsUrl,
              runtime_sse_url: workspace.runtimeSseUrl,
            },
          });
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: String(error),
          });
        }
        return;
      }

      const inviteRouteMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/invites$/);
      if (inviteRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const workspaceId = decodeURIComponent(inviteRouteMatch[1] ?? "").trim();
        if (!workspaceId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_workspace_id",
          });
          return;
        }
        const actorMembership = workspaceStore.getMembership(session.principal.userId, workspaceId);
        if (!hasWorkspaceAdminRole(actorMembership) && !isWorkspaceCreatorAuthorized(session.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "invite_forbidden",
          });
          return;
        }
        if (method === "GET") {
          sendJson(res, 200, {
            ok: true,
            items: workspaceStore.listInvites(workspaceId).map((item) => ({
              invite_id: item.inviteId,
              workspace_id: item.workspaceId,
              created_by_user_id: item.createdByUserId,
              role: item.role,
              scopes: item.scopes,
              expires_at_ms: item.expiresAtMs,
              created_at_ms: item.createdAtMs,
              redeemed_by_user_id: item.redeemedByUserId ?? null,
              redeemed_at_ms: item.redeemedAtMs ?? null,
              revoked_at_ms: item.revokedAtMs ?? null,
            })),
          });
          return;
        }
        if (method === "POST") {
          const body =
            (await readJsonBody<{
              role?: string;
              scopes?: string[];
              expires_in_seconds?: number;
            }>(req)) ?? {};
          const role = typeof body.role === "string" && body.role.trim() ? body.role.trim() : "workspace_member";
          const scopes = Array.isArray(body.scopes)
            ? body.scopes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : [];
          const expiresInSeconds =
            typeof body.expires_in_seconds === "number" && Number.isFinite(body.expires_in_seconds)
              ? Math.max(60, Math.floor(body.expires_in_seconds))
              : config.workspaceInviteTtlSeconds;
          try {
            const invite = workspaceStore.createInvite({
              workspaceId,
              createdByUserId: session.principal.userId,
              role,
              scopes,
              expiresInSeconds,
            });
            sendJson(res, 200, {
              ok: true,
              invite_id: invite.inviteId,
              invite_token: invite.inviteToken,
              workspace_id: invite.workspaceId,
              role: invite.role,
              scopes: invite.scopes,
              expires_at_ms: invite.expiresAtMs,
            });
          } catch (error) {
            sendJson(res, 400, {
              ok: false,
              error: String(error),
            });
          }
          return;
        }
        sendJson(res, 405, {
          ok: false,
          error: "method_not_allowed",
        });
        return;
      }

      if (method === "POST" && pathname === "/api/invites/redeem") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const body = (await readJsonBody<{ token?: string }>(req)) ?? {};
        const token = typeof body.token === "string" ? body.token.trim() : "";
        if (!token) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_invite_token",
          });
          return;
        }
        try {
          const redeemed = workspaceStore.redeemInvite({
            token,
            userId: session.principal.userId,
          });
          const user = workspaceStore.getUserById(session.principal.userId);
          if (user) {
            const principal = workspaceStore.toPrincipal({
              user,
              membership: redeemed.workspace,
              amr: session.principal.amr,
            });
            sessions.updateSessionPrincipal(session.id, principal);
          }
          sendJson(res, 200, {
            ok: true,
            workspace_id: redeemed.workspace.workspaceId,
            display_name: redeemed.workspace.displayName,
            role: redeemed.invite.role,
          });
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: String(error),
          });
        }
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
          const oidcUser = workspaceStore.resolveOrCreateOidcUser({
            provider,
            subject: completed.claims.sub ?? "",
            email: completed.claims.email,
            displayName: completed.claims.name,
            fallbackPrincipal: completed.principal,
          });
          const oidcMembership = workspaceStore.getDefaultMembership(oidcUser.userId);
          const principal = workspaceStore.toPrincipal({
            user: oidcUser,
            membership: oidcMembership,
            amr: ["oidc"],
          });
          const session = sessions.createSession(principal);
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
        const body = (await readJsonBody<{ client_id?: string; workspace_id?: string }>(req)) ?? {};
        const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
        const requestedWorkspaceId =
          typeof body.workspace_id === "string" ? body.workspace_id.trim() : undefined;
        const context = resolveActiveWorkspaceContext({
          session,
          requestedWorkspaceId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            workspace_count: context.workspaceCount,
          });
          return;
        }
        const refreshToken = sessions.issueRefreshToken(context.session.id);
        const tenant = context.workspaceRuntime;
        sendJson(res, 200, {
          ok: true,
          ...buildRuntimeTokenResponse({
            config,
            session: context.session,
            refreshToken,
            tenant,
            principal: context.principal,
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
        const body = (await readJsonBody<{
          refresh_token?: string;
          client_id?: string;
          workspace_id?: string;
        }>(req)) ?? {};
        const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
        const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
        const requestedWorkspaceId =
          typeof body.workspace_id === "string" ? body.workspace_id.trim() : undefined;
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
        const context = resolveActiveWorkspaceContext({
          session: rotated.session,
          requestedWorkspaceId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            workspace_count: context.workspaceCount,
          });
          return;
        }
        const tenant = context.workspaceRuntime;
        sendJson(res, 200, {
          ok: true,
          ...buildRuntimeTokenResponse({
            config,
            session: context.session,
            refreshToken: rotated.nextRefreshToken,
            tenant,
            principal: context.principal,
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
        const isRuntimeRoute = pathname === "/runtime" || pathname.startsWith("/runtime/");
        const isAppRoute = !isRuntimeRoute;
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
        const requestedWorkspaceId = (url.searchParams.get("workspace_id") ?? "").trim() || undefined;
        const context = resolveActiveWorkspaceContext({
          session,
          requestedWorkspaceId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            workspace_count: context.workspaceCount,
          });
          return;
        }
        if (
          isAppRoute &&
          method === "GET" &&
          prefersHtmlResponse(req) &&
          isLikelyControlUiDocumentPath(pathname)
        ) {
          const tokenFromUrl = (url.searchParams.get("token") ?? "").trim();
          const runtimeUrlFromUrl = (url.searchParams.get("runtimeUrl") ?? "").trim();
          if (!tokenFromUrl || !runtimeUrlFromUrl) {
            const descriptor = resolveRuntimeDescriptor(context.workspaceRuntime);
            const access = mintRuntimeAccessToken({
              config,
              principal: context.principal,
              sessionId: context.session.id,
              clientId: "nexus-control-ui",
            });
            const redirectUrl = new URL(url.toString());
            if (!tokenFromUrl) {
              redirectUrl.searchParams.set("token", access.token);
            }
            if (!runtimeUrlFromUrl) {
              redirectUrl.searchParams.set("runtimeUrl", descriptor.ws_url);
            }
            res.statusCode = 302;
            res.setHeader("location", `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`);
            res.end();
            return;
          }
        }
        proxyRuntimeRequest({
          req,
          res,
          url,
          session: context.session,
          principal: context.principal,
          runtime: context.workspaceRuntime,
          route: isRuntimeRoute ? "runtime" : "app",
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
      const requestedWorkspaceId = (url.searchParams.get("workspace_id") ?? "").trim() || undefined;
      const context = resolveActiveWorkspaceContext({
        session,
        requestedWorkspaceId,
      });
      if (!context.ok) {
        const statusCode = context.status;
        const reason =
          statusCode === 401
            ? "Unauthorized"
            : statusCode === 403
              ? "Forbidden"
              : statusCode === 404
                ? "Not Found"
                : statusCode === 409
                  ? "Conflict"
                  : "Bad Request";
        socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
        return;
      }
      const targetOrigin = resolveTargetOrigin(context.workspaceRuntime.runtimeUrl);
      const access = mintRuntimeAccessToken({
        config,
        principal: context.principal,
        sessionId: context.session.id,
      });
      req.headers.authorization = `Bearer ${access.token}`;
      req.headers["x-nexus-frontdoor-tenant"] = context.workspaceRuntime.id;
      req.headers["x-nexus-frontdoor-session"] = context.session.id;
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
        target: context.workspaceRuntime.runtimeUrl,
      });
    } catch {
      socket.write("HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });

  server.on("close", () => {
    sessions.close();
    workspaceStore.close();
    autoProvisioner?.close();
  });

  return { server, config };
}
