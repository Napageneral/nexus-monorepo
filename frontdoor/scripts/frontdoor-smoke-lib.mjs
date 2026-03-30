#!/usr/bin/env node
import process from "node:process";

export function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function boolEnv(name, defaultValue = false) {
  const raw = text(process.env[name]).toLowerCase();
  if (!raw) {
    return defaultValue;
  }
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function numberEnv(name, defaultValue) {
  const raw = text(process.env[name]);
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return parsed;
}

export function fail(message, details = {}) {
  const payload = {
    ok: false,
    error: message,
    ...details,
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
}

export function smokeError(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  return error;
}

function rewriteLoopbackUrlHost(rawUrl, replacementHost) {
  const value = text(rawUrl);
  if (!value || !replacementHost) {
    return value;
  }
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.trim().toLowerCase();
    if (host === "127.0.0.1" || host === "localhost") {
      parsed.hostname = replacementHost;
    }
    return parsed.toString().replace(/\/+$/g, "");
  } catch {
    return value;
  }
}

export function responseSummary(response, body, raw) {
  return {
    status: response.status,
    ok: response.ok,
    body: body ?? raw,
  };
}

function sessionCookieFromSetCookie(setCookie) {
  if (!setCookie) {
    return "";
  }
  const first = setCookie.split(",")[0] ?? "";
  return first.split(";")[0] ?? "";
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "manual",
    ...options,
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return { response, raw, body };
}

export async function getJson(url, headers) {
  return await requestJson(url, {
    method: "GET",
    headers,
  });
}

export async function postJson(url, payload, headers) {
  return await requestJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteJson(url, headers) {
  return await requestJson(url, {
    method: "DELETE",
    headers,
  });
}

export async function runtimeGetJson(url, accessToken, extraHeaders = {}) {
  return await requestJson(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...extraHeaders,
    },
  });
}

export async function runtimePostJson(url, payload, accessToken, extraHeaders = {}) {
  return await requestJson(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
}

export function parseJsonOrNull(raw) {
  const value = text(raw);
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function freshServerDisplayName(prefix = "Cleanroom") {
  return `${prefix} ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
}

async function loginAndGetCookie(origin) {
  const username = text(process.env.FRONTDOOR_SMOKE_USERNAME);
  const password = text(process.env.FRONTDOOR_SMOKE_PASSWORD);
  if (!username || !password) {
    fail("missing login credentials", {
      required_env: ["FRONTDOOR_SMOKE_USERNAME", "FRONTDOOR_SMOKE_PASSWORD"],
    });
  }
  const login = await requestJson(`${origin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  if (!login.response.ok || login.body?.ok !== true) {
    fail("frontdoor login failed", {
      login: responseSummary(login.response, login.body, login.raw),
    });
  }
  const setCookie = login.response.headers.get("set-cookie");
  const cookie = sessionCookieFromSetCookie(setCookie);
  if (!cookie) {
    fail("frontdoor login did not return session cookie", {
      login: responseSummary(login.response, login.body, login.raw),
    });
  }
  return cookie;
}

async function resolveSessionCookie(origin) {
  const raw =
    text(process.env.FRONTDOOR_SMOKE_SESSION_COOKIE) ||
    text(process.env.FRONTDOOR_SMOKE_SESSION_ID);
  if (raw) {
    if (raw.includes("=")) {
      return raw;
    }
    return `nexus_fd_session=${raw}`;
  }
  return await loginAndGetCookie(origin);
}

export async function resolveFrontdoorHeaders(origin) {
  const apiToken = text(process.env.FRONTDOOR_SMOKE_API_TOKEN);
  if (apiToken) {
    return {
      authorization: `Bearer ${apiToken}`,
    };
  }
  const cookie = await resolveSessionCookie(origin);
  return { cookie };
}

export async function mintRuntimeToken({ origin, headers, serverId, clientId }) {
  const minted = await postJson(
    `${origin}/api/runtime/token`,
    {
      server_id: serverId,
      ...(text(clientId) ? { client_id: text(clientId) } : {}),
    },
    headers,
  );
  if (!minted.response.ok || minted.body?.ok !== true || !text(minted.body?.access_token)) {
    throw smokeError("runtime token mint failed", {
      runtime_token: responseSummary(minted.response, minted.body, minted.raw),
      server_id: serverId,
    });
  }
  const runtime = minted.body?.runtime ?? {};
  const accessToken = text(minted.body?.access_token);
  let baseUrl = text(runtime.base_url);
  let httpBaseUrl = text(runtime.http_base_url);
  let wsUrl = text(runtime.ws_url);
  const sseUrl = text(runtime.sse_url);
  const originHost = (() => {
    try {
      return new URL(origin).hostname.trim().toLowerCase();
    } catch {
      return "";
    }
  })();
  if (wsUrl && (originHost === "127.0.0.1" || originHost === "localhost" || originHost === "host.docker.internal")) {
    const rewrittenWsUrl = rewriteLoopbackUrlHost(wsUrl, originHost === "host.docker.internal" ? originHost : "");
    try {
      const directHttp = new URL(rewrittenWsUrl);
      directHttp.protocol = directHttp.protocol === "wss:" ? "https:" : "http:";
      directHttp.pathname = "";
      directHttp.search = "";
      directHttp.hash = "";
      const directBaseUrl = directHttp.toString().replace(/\/+$/g, "");
      baseUrl = directBaseUrl;
      httpBaseUrl = directBaseUrl;
      wsUrl = rewrittenWsUrl;
    } catch {}
  }
  if (!baseUrl || !httpBaseUrl) {
    throw smokeError("runtime token response missing runtime descriptor", {
      server_id: serverId,
      runtime_token: minted.body,
    });
  }
  return {
    accessToken,
    refreshToken: text(minted.body?.refresh_token) || null,
    serverId: text(minted.body?.server_id) || serverId,
    tenantId: text(minted.body?.tenant_id) || null,
    entityId: text(minted.body?.entity_id) || null,
    runtime: {
      baseUrl,
      httpBaseUrl,
      wsUrl: wsUrl || null,
      sseUrl: sseUrl || null,
    },
    raw: minted.body,
  };
}

export async function createFreshServer({ origin, headers, plan, displayName, serverClass }) {
  const created = await postJson(
    `${origin}/api/servers/create`,
    {
      plan,
      display_name: displayName,
      server_class: serverClass,
      deployment_class: "customer_server",
    },
    headers,
  );
  if (!created.response.ok || created.body?.ok !== true || !text(created.body?.server_id)) {
    throw smokeError("fresh server create failed", {
      create: responseSummary(created.response, created.body, created.raw),
    });
  }
  return {
    serverId: text(created.body?.server_id),
    tenantId: text(created.body?.tenant_id),
    status: text(created.body?.status),
  };
}

export async function waitForServerRunning({ origin, headers, serverId, timeoutMs, pollMs }) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const readback = await getJson(
      `${origin}/api/servers/${encodeURIComponent(serverId)}`,
      headers,
    );
    if (!readback.response.ok || readback.body?.ok !== true || !readback.body?.server) {
      throw smokeError("failed to read fresh server while waiting for readiness", {
        server_id: serverId,
        server: responseSummary(readback.response, readback.body, readback.raw),
      });
    }
    const server = readback.body.server;
    const status = text(server.status);
    if (status === "running") {
      return {
        status,
        server,
        waitedMs: Date.now() - startedAt,
      };
    }
    if (status === "failed" || status === "destroyed") {
      throw smokeError("fresh server provisioning failed", {
        server_id: serverId,
        status,
        server,
      });
    }
    await sleep(pollMs);
  }
  throw smokeError("timed out waiting for fresh server to become running", {
    server_id: serverId,
    timeout_ms: timeoutMs,
  });
}

export async function cleanupServer({ origin, headers, serverId, cleanupMode }) {
  if (cleanupMode === "retain") {
    return {
      cleanupMode,
      ok: true,
      status: "retained",
    };
  }
  const endpoint =
    cleanupMode === "archive"
      ? `/api/servers/${encodeURIComponent(serverId)}/archive`
      : `/api/servers/${encodeURIComponent(serverId)}/destroy`;
  const payload = cleanupMode === "destroy" ? { confirm: true } : {};
  const cleaned = await postJson(`${origin}${endpoint}`, payload, headers);
  if (!cleaned.response.ok || cleaned.body?.ok !== true) {
    return {
      cleanupMode,
      ok: false,
      response: responseSummary(cleaned.response, cleaned.body, cleaned.raw),
    };
  }
  return {
    cleanupMode,
    ok: true,
    status: text(cleaned.body?.status),
    destroyedAt: cleaned.body?.destroyed_at ?? null,
    archivedAt: cleaned.body?.archived_at ?? null,
  };
}

export async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
