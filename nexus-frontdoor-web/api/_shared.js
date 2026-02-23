"use strict";

const DEFAULT_COOKIE_NAME = "nexus_fd_session";

function trimTrailingSlash(input) {
  return String(input || "").replace(/\/+$/, "");
}

function envConfig() {
  const frontdoorOrigin = trimTrailingSlash(process.env.FRONTDOOR_ORIGIN || "");
  const frontdoorCookieName = process.env.FRONTDOOR_SESSION_COOKIE_NAME || DEFAULT_COOKIE_NAME;
  const appCookieName = process.env.APP_SESSION_COOKIE_NAME || frontdoorCookieName;
  const sessionTtlSeconds = Number(process.env.APP_SESSION_TTL_SECONDS || 60 * 60 * 24 * 7);
  return {
    frontdoorOrigin,
    frontdoorCookieName,
    appCookieName,
    sessionTtlSeconds: Number.isFinite(sessionTtlSeconds) ? Math.max(60, Math.floor(sessionTtlSeconds)) : 604800,
  };
}

function parseCookies(rawCookieHeader) {
  const out = {};
  const raw = String(rawCookieHeader || "");
  for (const part of raw.split(";")) {
    const [keyRaw, ...valueParts] = part.split("=");
    const key = String(keyRaw || "").trim();
    if (!key) {
      continue;
    }
    out[key] = decodeURIComponent(valueParts.join("=").trim());
  }
  return out;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

function extractCookieValueFromSetCookie(setCookieHeaders, cookieName) {
  for (const header of setCookieHeaders) {
    const parts = String(header).split(";");
    const kv = parts[0] || "";
    const [nameRaw, ...valueParts] = kv.split("=");
    const name = String(nameRaw || "").trim();
    if (name !== cookieName) {
      continue;
    }
    return decodeURIComponent(valueParts.join("=").trim());
  }
  return null;
}

function setSessionCookie(res, name, value, maxAgeSeconds) {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds || 0))}`,
    "Secure",
  ];
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(res, name) {
  res.setHeader(
    "Set-Cookie",
    `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`,
  );
}

function sendJson(res, status, payload) {
  const text = `${JSON.stringify(payload)}\n`;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", String(Buffer.byteLength(text, "utf8")));
  res.end(text);
}

async function proxyToFrontdoor(params) {
  const {
    frontdoorOrigin,
    path,
    method,
    rawBody,
    sessionCookieName,
    sessionCookieValue,
    contentType,
  } = params;
  const headers = {};
  if (contentType) {
    headers["content-type"] = contentType;
  }
  if (sessionCookieValue) {
    headers.cookie = `${sessionCookieName}=${encodeURIComponent(sessionCookieValue)}`;
  }
  return await fetch(`${frontdoorOrigin}${path}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : rawBody,
  });
}

function passthroughJson(res, response, bodyText) {
  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
  res.statusCode = response.status;
  res.setHeader("content-type", contentType);
  res.end(bodyText);
}

module.exports = {
  envConfig,
  parseCookies,
  readRawBody,
  getSetCookieHeaders,
  extractCookieValueFromSetCookie,
  setSessionCookie,
  clearSessionCookie,
  sendJson,
  proxyToFrontdoor,
  passthroughJson,
};
