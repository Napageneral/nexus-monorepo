import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { URL } from "node:url";
import httpProxy from "http-proxy";
import { createCheckoutSession, verifyWebhookAndParseEvent, type BillingWebhookEvent } from "./billing.js";
import { loadConfig, resolveProjectRoot } from "./config.js";
import { randomToken, createPasswordHash } from "./crypto.js";
import { OidcFlowManager, type OidcClaims } from "./oidc-auth.js";
import { SlidingWindowRateLimiter } from "./rate-limit.js";
import { mintRuntimeAccessToken } from "./runtime-token.js";
import { SessionStore } from "./session-store.js";
import { TenantAutoProvisioner } from "./tenant-autoprovision.js";
import { syncProductFromManifest } from "./product-sync.js";
import {
  FrontdoorStore,
  type ServerRecord,
  type ServerAppInstallRecord,
  type AccountMembershipView,
  type AccountRecord,
  type AccountMemberView,
  type AccountInvoiceSummary,
  type FrontdoorUserRecord,
  serverToTenantConfig,
} from "./frontdoor-store.js";
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
  domain?: string;
  maxAgeSeconds?: number;
  secure?: boolean;
}): void {
  const attrs = [
    `${params.name}=${encodeURIComponent(params.value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (params.domain) {
    attrs.push(`Domain=${params.domain}`);
  }
  if (params.secure) {
    attrs.push("Secure");
  }
  if (typeof params.maxAgeSeconds === "number") {
    attrs.push(`Max-Age=${Math.max(0, Math.floor(params.maxAgeSeconds))}`);
  }
  params.res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearCookie(params: {
  res: ServerResponse;
  name: string;
  domain?: string;
  secure?: boolean;
}): void {
  const attrs = [`${params.name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (params.domain) {
    attrs.push(`Domain=${params.domain}`);
  }
  if (params.secure) {
    attrs.push("Secure");
  }
  params.res.setHeader(
    "Set-Cookie",
    attrs.join("; "),
  );
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  const text = await readRawBody(req);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
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

function logFrontdoorEvent(event: string, fields: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
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

function isMutationMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function parseOriginFromReferer(rawReferer: string): string | null {
  const referer = rawReferer.trim();
  if (!referer) {
    return null;
  }
  try {
    return new URL(referer).origin.toLowerCase();
  } catch {
    return null;
  }
}

function isSameOriginBrowserMutation(req: IncomingMessage, baseUrl: string): boolean {
  const originHeader = readHeaderValue(req.headers.origin);
  const refererHeader = readHeaderValue(req.headers.referer);
  if (!originHeader && !refererHeader) {
    // Non-browser clients typically omit both headers; allow these requests.
    return true;
  }
  const expected = new URL(baseUrl);
  const originMatchesExpected = (candidateOrigin: string): boolean => {
    try {
      const candidate = new URL(candidateOrigin);
      if (candidate.protocol.toLowerCase() !== expected.protocol.toLowerCase()) {
        return false;
      }
      if (candidate.hostname.toLowerCase() !== expected.hostname.toLowerCase()) {
        return false;
      }
      if (expected.port) {
        return candidate.port === expected.port;
      }
      return true;
    } catch {
      return false;
    }
  };
  if (originHeader) {
    return originMatchesExpected(originHeader);
  }
  const refererOrigin = parseOriginFromReferer(refererHeader);
  return refererOrigin ? originMatchesExpected(refererOrigin) : false;
}

function applySecurityHeaders(
  res: ServerResponse,
  params: {
    config: FrontdoorConfig;
    requestSecure: boolean;
  },
): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  // Preserve same-origin document context for app subresource routing (e.g. /_next/*),
  // while still suppressing cross-origin referrer leakage.
  res.setHeader("Referrer-Policy", "same-origin");
  const hstsEnabled = params.config.hstsEnabled ?? true;
  if (!hstsEnabled || !params.requestSecure) {
    return;
  }
  const directives = [`max-age=${Math.max(0, params.config.hstsMaxAgeSeconds ?? 31536000)}`];
  if (params.config.hstsIncludeSubDomains ?? true) {
    directives.push("includeSubDomains");
  }
  if (params.config.hstsPreload ?? true) {
    directives.push("preload");
  }
  res.setHeader("Strict-Transport-Security", directives.join("; "));
}

function resolveRequestSecureContext(req: IncomingMessage, baseUrl: string): boolean {
  const forwardedProto = readHeaderValue(req.headers["x-forwarded-proto"])
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .find(Boolean);
  if (forwardedProto === "https") {
    return true;
  }
  if (forwardedProto === "http") {
    return false;
  }
  const forwardedScheme = readHeaderValue(req.headers["x-forwarded-scheme"])
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .find(Boolean);
  if (forwardedScheme === "https") {
    return true;
  }
  if (forwardedScheme === "http") {
    return false;
  }
  const forwardedSsl = readHeaderValue(req.headers["x-forwarded-ssl"]).toLowerCase();
  if (forwardedSsl === "on") {
    return true;
  }
  try {
    return new URL(baseUrl).protocol.toLowerCase() === "https:";
  } catch {
    return false;
  }
}

function resolveRequestWsProtocol(req: IncomingMessage, baseUrl: string): "ws" | "wss" {
  return resolveRequestSecureContext(req, baseUrl) ? "wss" : "ws";
}

function buildFrontdoorRuntimeWsUrl(params: {
  req: IncomingMessage;
  baseUrl: string;
  serverId: string;
}): string {
  const wsProtocol = resolveRequestWsProtocol(params.req, params.baseUrl);
  const host = readHeaderValue(params.req.headers.host) || new URL(params.baseUrl).host;
  return `${wsProtocol}://${host}/app?server_id=${encodeURIComponent(params.serverId)}`;
}

type AppFrameParams = {
  appId: string;
  appDisplayName: string;
  appAccentColor: string;
  serverId: string;
  serverDisplayName: string;
  serverStatus: string;
  servers: Array<{ serverId: string; displayName: string; status: string }>;
  installedApps: Array<{
    appId: string;
    displayName: string;
    accentColor: string;
    entryPath: string;
    status: string;
  }>;
  userDisplayName: string;
  userEmail: string;
  accountName: string;
  dashboardUrl: string;
  logoutUrl: string;
};

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function injectAppFrame(html: string, params: AppFrameParams): string {
  const ac = params.appAccentColor || "#6366f1";

  // Build server status dot color helper
  function statusDotColor(status: string): string {
    if (status === "active") return "#22c55e";
    if (status === "degraded") return "#f59e0b";
    return "#ef4444";
  }

  // ── CSS ───────────────────────────────────────────────────────
  const frameCSS = `<style id="nexus-app-frame-styles">
body { padding-top: 44px !important; }
#nexus-app-frame {
  position: fixed; top: 0; left: 0; right: 0; height: 44px;
  background: #0c0e14; z-index: 999999;
  display: flex; align-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px; color: #e2e8f0; box-sizing: border-box; padding: 0 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  user-select: none; -webkit-user-select: none;
}
#nexus-app-frame *, #nexus-app-frame *::before, #nexus-app-frame *::after { box-sizing: border-box; }
#nexus-app-frame .nxf-logo {
  display: flex; align-items: center; gap: 6px; text-decoration: none; color: #e2e8f0;
  font-weight: 600; font-size: 14px; padding: 4px 8px 4px 0; margin-right: 4px; flex-shrink: 0;
}
#nexus-app-frame .nxf-logo:hover { color: #fff; }
#nexus-app-frame .nxf-logo svg { width: 20px; height: 20px; flex-shrink: 0; }
#nexus-app-frame .nxf-sep {
  width: 1px; height: 20px; background: rgba(255,255,255,0.12); margin: 0 8px; flex-shrink: 0;
}
#nexus-app-frame .nxf-app-badge {
  display: flex; align-items: center; gap: 6px; padding: 4px 8px; flex-shrink: 0;
}
#nexus-app-frame .nxf-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
#nexus-app-frame .nxf-dropdown-wrap {
  position: relative; flex-shrink: 0;
}
#nexus-app-frame .nxf-dropdown-btn {
  display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px;
  cursor: pointer; border: none; background: transparent; color: #e2e8f0; font-size: 13px;
  font-family: inherit; line-height: 1;
}
#nexus-app-frame .nxf-dropdown-btn:hover { background: rgba(255,255,255,0.08); }
#nexus-app-frame .nxf-dropdown-btn .nxf-caret {
  border: solid rgba(255,255,255,0.5); border-width: 0 1.5px 1.5px 0;
  display: inline-block; padding: 2.5px; transform: rotate(45deg); margin-top: -2px;
}
#nexus-app-frame .nxf-dropdown-panel {
  display: none; position: absolute; top: calc(100% + 6px); left: 0;
  background: #1a1d27; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
  min-width: 220px; padding: 6px 0; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  z-index: 1000000;
}
#nexus-app-frame .nxf-dropdown-panel.nxf-right { left: auto; right: 0; }
#nexus-app-frame .nxf-dropdown-panel.nxf-open { display: block; }
#nexus-app-frame .nxf-dropdown-item {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer;
  color: #cbd5e1; font-size: 13px; text-decoration: none; border: none; background: none;
  width: 100%; text-align: left; font-family: inherit;
}
#nexus-app-frame .nxf-dropdown-item:hover { background: rgba(255,255,255,0.06); color: #f1f5f9; }
#nexus-app-frame .nxf-dropdown-item.nxf-active { color: #fff; font-weight: 500; }
#nexus-app-frame .nxf-dropdown-item.nxf-disabled {
  opacity: 0.4; cursor: default; pointer-events: none;
}
#nexus-app-frame .nxf-dropdown-divider {
  height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0;
}
#nexus-app-frame .nxf-dropdown-header {
  padding: 6px 14px 4px; color: #94a3b8; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.05em; font-weight: 600;
}
#nexus-app-frame .nxf-status-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
#nexus-app-frame .nxf-spacer { flex: 1; }
#nexus-app-frame .nxf-avatar {
  width: 24px; height: 24px; border-radius: 50%; background: #374151;
  display: flex; align-items: center; justify-content: center; font-size: 11px;
  font-weight: 600; color: #e2e8f0; flex-shrink: 0; text-transform: uppercase;
}
#nexus-app-frame .nxf-dash-link {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px;
  text-decoration: none; color: #94a3b8; font-size: 12px; margin-left: 4px; flex-shrink: 0;
}
#nexus-app-frame .nxf-dash-link:hover { color: #e2e8f0; background: rgba(255,255,255,0.06); }
#nexus-app-frame .nxf-apps-grid {
  display: grid; grid-template-columns: 1fr; gap: 2px; padding: 4px 0;
}
</style>`;

  // ── Server list items ─────────────────────────────────────────
  const serverItems = params.servers.map((s) => {
    const isActive = s.serverId === params.serverId;
    const dotColor = statusDotColor(s.status);
    return `<button class="nxf-dropdown-item${isActive ? " nxf-active" : ""}" data-nxf-server-id="${escAttr(s.serverId)}" data-nxf-action="switch-server"><span class="nxf-status-dot" style="background:${dotColor}"></span>${escHtml(s.displayName)}</button>`;
  }).join("");

  // ── Installed app items ───────────────────────────────────────
  const appItems = params.installedApps.map((a) => {
    const isActive = a.appId === params.appId;
    const disabled = a.status === "installing" || a.status === "failed";
    const cls = `nxf-dropdown-item${isActive ? " nxf-active" : ""}${disabled ? " nxf-disabled" : ""}`;
    const dotColor = a.accentColor || "#6366f1";
    const statusLabel = disabled ? ` <span style="color:#94a3b8;font-size:11px">(${escHtml(a.status)})</span>` : "";
    return `<button class="${cls}" data-nxf-app-id="${escAttr(a.appId)}" data-nxf-entry-path="${escAttr(a.entryPath)}" data-nxf-action="switch-app"><span class="nxf-dot" style="background:${dotColor};width:6px;height:6px"></span>${escHtml(a.displayName)}${statusLabel}</button>`;
  }).join("");

  // ── User initial ──────────────────────────────────────────────
  const initial = (params.userDisplayName || params.userEmail || "?").charAt(0);

  // ── HTML + JS ─────────────────────────────────────────────────
  const frameHTML = `<div id="nexus-app-frame">
  <a class="nxf-logo" href="${escAttr(params.dashboardUrl)}" title="Nexus Dashboard">
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="16" height="16" rx="4" fill="#6366f1"/>
      <path d="M7 7l3 3-3 3M11 13h3" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>Nexus</span>
  </a>
  <div class="nxf-sep"></div>
  <div class="nxf-app-badge">
    <span class="nxf-dot" style="background:${escAttr(ac)}"></span>
    <span>${escHtml(params.appDisplayName)}</span>
  </div>
  <div class="nxf-sep"></div>
  <div class="nxf-dropdown-wrap" data-nxf-dropdown="server">
    <button class="nxf-dropdown-btn" data-nxf-toggle="server">
      <span class="nxf-status-dot" style="background:${statusDotColor(params.serverStatus)}"></span>
      <span>${escHtml(params.serverDisplayName)}</span>
      <span class="nxf-caret"></span>
    </button>
    <div class="nxf-dropdown-panel" data-nxf-panel="server">
      <div class="nxf-dropdown-header">Servers</div>
      ${serverItems}
    </div>
  </div>
  <div class="nxf-sep"></div>
  <div class="nxf-dropdown-wrap" data-nxf-dropdown="apps">
    <button class="nxf-dropdown-btn" data-nxf-toggle="apps">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0">
        <rect x="1" y="1" width="5" height="5" rx="1" fill="#94a3b8"/>
        <rect x="8" y="1" width="5" height="5" rx="1" fill="#94a3b8"/>
        <rect x="1" y="8" width="5" height="5" rx="1" fill="#94a3b8"/>
        <rect x="8" y="8" width="5" height="5" rx="1" fill="#94a3b8"/>
      </svg>
      <span>Apps</span>
      <span class="nxf-caret"></span>
    </button>
    <div class="nxf-dropdown-panel" data-nxf-panel="apps">
      <div class="nxf-dropdown-header">Installed Apps</div>
      <div class="nxf-apps-grid">${appItems}</div>
    </div>
  </div>
  <div class="nxf-spacer"></div>
  <div class="nxf-dropdown-wrap" data-nxf-dropdown="account">
    <button class="nxf-dropdown-btn" data-nxf-toggle="account">
      <span class="nxf-avatar">${escHtml(initial)}</span>
      <span>${escHtml(params.userDisplayName || params.userEmail)}</span>
      <span class="nxf-caret"></span>
    </button>
    <div class="nxf-dropdown-panel nxf-right" data-nxf-panel="account">
      <div class="nxf-dropdown-header">${escHtml(params.accountName)}</div>
      <a class="nxf-dropdown-item" href="${escAttr(params.dashboardUrl)}#billing">Billing &amp; Plans</a>
      <a class="nxf-dropdown-item" href="${escAttr(params.dashboardUrl)}#members">Team &amp; Access</a>
      <a class="nxf-dropdown-item" href="${escAttr(params.dashboardUrl)}#settings">Account Settings</a>
      <div class="nxf-dropdown-divider"></div>
      <button class="nxf-dropdown-item" data-nxf-action="logout">Sign Out</button>
    </div>
  </div>
  <div class="nxf-sep"></div>
  <a class="nxf-dash-link" href="${escAttr(params.dashboardUrl)}">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="flex-shrink:0">
      <path d="M8 2L4 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Dashboard
  </a>
</div>
<script>(function(){
  var frame = document.getElementById("nexus-app-frame");
  if (!frame) return;
  var currentServerId = ${JSON.stringify(params.serverId)};
  var currentAppId = ${JSON.stringify(params.appId)};

  // Dropdown toggle
  frame.addEventListener("click", function(e) {
    var toggle = e.target.closest("[data-nxf-toggle]");
    if (toggle) {
      e.preventDefault();
      e.stopPropagation();
      var name = toggle.getAttribute("data-nxf-toggle");
      var panel = frame.querySelector("[data-nxf-panel='" + name + "']");
      if (!panel) return;
      var wasOpen = panel.classList.contains("nxf-open");
      closeAllDropdowns();
      if (!wasOpen) panel.classList.add("nxf-open");
      return;
    }

    // Server switch
    var serverBtn = e.target.closest("[data-nxf-action='switch-server']");
    if (serverBtn) {
      var sid = serverBtn.getAttribute("data-nxf-server-id");
      if (sid && sid !== currentServerId) {
        fetch("/api/servers/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ server_id: sid }),
          credentials: "same-origin"
        }).then(function() {
          window.location.href = "/app/" + encodeURIComponent(currentAppId) + "/?server_id=" + encodeURIComponent(sid);
        }).catch(function() {
          window.location.href = "/app/" + encodeURIComponent(currentAppId) + "/?server_id=" + encodeURIComponent(sid);
        });
      }
      closeAllDropdowns();
      return;
    }

    // App switch
    var appBtn = e.target.closest("[data-nxf-action='switch-app']");
    if (appBtn) {
      var aid = appBtn.getAttribute("data-nxf-app-id");
      var entryPath = appBtn.getAttribute("data-nxf-entry-path");
      if (aid && aid !== currentAppId && entryPath) {
        var sep = entryPath.indexOf("?") >= 0 ? "&" : "?";
        window.location.href = entryPath + sep + "server_id=" + encodeURIComponent(currentServerId);
      }
      closeAllDropdowns();
      return;
    }

    // Logout
    var logoutBtn = e.target.closest("[data-nxf-action='logout']");
    if (logoutBtn) {
      fetch(${JSON.stringify(params.logoutUrl)}, {
        method: "POST",
        credentials: "same-origin"
      }).then(function() {
        window.location.href = "/";
      }).catch(function() {
        window.location.href = "/";
      });
      closeAllDropdowns();
      return;
    }
  });

  // Close dropdowns on outside click
  document.addEventListener("click", function(e) {
    if (!frame.contains(e.target)) closeAllDropdowns();
  });

  function closeAllDropdowns() {
    var panels = frame.querySelectorAll(".nxf-dropdown-panel.nxf-open");
    for (var i = 0; i < panels.length; i++) panels[i].classList.remove("nxf-open");
  }
})();</script>`;

  // ── Inject CSS before </head> ─────────────────────────────────
  const headClose = html.indexOf("</head>");
  let result = html;
  if (headClose >= 0) {
    result = result.slice(0, headClose) + frameCSS + result.slice(headClose);
  } else {
    result = frameCSS + result;
  }

  // ── Inject HTML+JS before </body> ─────────────────────────────
  const bodyClose = result.indexOf("</body>");
  if (bodyClose >= 0) {
    result = result.slice(0, bodyClose) + frameHTML + result.slice(bodyClose);
  } else {
    result = result + frameHTML;
  }

  return result;
}

function prefersHtmlResponse(req: IncomingMessage): boolean {
  const accept = readHeaderValue(req.headers.accept).toLowerCase();
  return accept.includes("text/html");
}

function isAppDocumentRequest(req: IncomingMessage, pathname: string): boolean {
  if (req.method !== "GET") return false;
  if (!prefersHtmlResponse(req)) return false;
  if (path.extname(pathname) !== "") return false;
  const appMatch = pathname.match(/^\/app\/([^/]+)/);
  return Boolean(appMatch);
}

function normalizeEmail(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}


function hasGlobalOperatorAccess(principal: Principal): boolean {
  const operatorRoles = new Set(["operator"]);
  for (const role of principal.roles) {
    if (operatorRoles.has(role)) {
      return true;
    }
  }
  for (const scope of principal.scopes) {
    if (scope === "*" || scope === "operator.admin" || scope.startsWith("operator.")) {
      return true;
    }
  }
  return false;
}

type OidcIdentityRef = {
  provider: string;
  subject: string;
};

function parseOidcIdentityFromEntityId(entityId: string | undefined): OidcIdentityRef | null {
  const raw = typeof entityId === "string" ? entityId.trim() : "";
  if (!raw) {
    return null;
  }
  const parts = raw.split(":");
  if (parts.length < 3) {
    return null;
  }
  if (parts[0]?.trim().toLowerCase() !== "entity") {
    return null;
  }
  const provider = (parts[1] ?? "").trim().toLowerCase();
  const subject = parts
    .slice(2)
    .join(":")
    .trim()
    .toLowerCase();
  if (!provider || !subject) {
    return null;
  }
  return {
    provider,
    subject,
  };
}

function parseAppIdFromRefererPath(params: {
  req: IncomingMessage;
  baseUrl: string;
}): string | null {
  const refererHeader =
    typeof params.req.headers.referer === "string" ? params.req.headers.referer.trim() : "";
  if (!refererHeader) {
    return null;
  }
  let refererUrl: URL;
  let originUrl: URL;
  try {
    refererUrl = new URL(refererHeader);
    originUrl = new URL(params.baseUrl);
  } catch {
    return null;
  }
  const sameProtocol = refererUrl.protocol === originUrl.protocol;
  const sameHostname = refererUrl.hostname === originUrl.hostname;
  const baseHasExplicitPort = Boolean(originUrl.port);
  const samePort = !baseHasExplicitPort || refererUrl.port === originUrl.port;
  if (!sameProtocol || !sameHostname || !samePort) {
    return null;
  }
  const match = refererUrl.pathname.match(/^\/app\/([^/]+)/);
  if (!match) {
    return null;
  }
  const appId = decodeURIComponent(match[1] ?? "")
    .trim()
    .toLowerCase();
  if (!appId || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(appId)) {
    return null;
  }
  return appId;
}

function normalizeAppId(input: string | undefined): string {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

function isValidAppId(appId: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(appId);
}

function defaultEntryPathForApp(appId: string): string {
  if (appId === "control") {
    return "/app/control/chat";
  }
  if (appId === "glowbot") {
    return "/app/glowbot/";
  }
  if (appId === "spike") {
    return "/app/spike";
  }
  return `/app/${encodeURIComponent(appId)}`;
}

function canonicalProductAppIdForRuntimeAppId(appId: string): string {
  return appId;
}

function deterministicServerNameFromId(serverId: string): string {
  const adjectives = [
    "Amber",
    "Atlas",
    "Cinder",
    "Cobalt",
    "Crimson",
    "Echo",
    "Emerald",
    "Ivory",
    "Nova",
    "Onyx",
    "Sable",
    "Solar",
  ];
  const nouns = [
    "Beacon",
    "Bridge",
    "Cloud",
    "Forge",
    "Harbor",
    "Helix",
    "Lattice",
    "Nexus",
    "Orbit",
    "Pulse",
    "Signal",
    "Vertex",
  ];
  let hash = 0;
  for (let i = 0; i < serverId.length; i += 1) {
    hash = (hash * 31 + serverId.charCodeAt(i)) >>> 0;
  }
  const adjective = adjectives[hash % adjectives.length] ?? "Nova";
  const noun = nouns[Math.floor(hash / adjectives.length) % nouns.length] ?? "Nexus";
  return `${adjective} ${noun}`;
}

function normalizeText(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function parseBool(input: unknown, fallback = false): boolean {
  const raw = normalizeText(input).toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function normalizeRuntimeAppKind(
  input: unknown,
  fallback: "static" | "proxy",
): "static" | "proxy" | null {
  const raw = normalizeText(input).toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === "static" || raw === "proxy") {
    return raw;
  }
  return null;
}

function normalizeUrlIfValid(value: string): string | null {
  const raw = normalizeText(value);
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

type EntryResolveAction =
  | "create_server_and_install"
  | "purchase_app_then_install"
  | "install_on_selected_server"
  | "dashboard_only";

type EntryResolvePlan = {
  appId: string;
  action: EntryResolveAction;
  hasActiveEntitlement: boolean;
  serverCount: number;
  requestedServerId: string | null;
  recommendedServerId: string | null;
  installedServerIds: string[];
};

function resolveEntryActionPlan(params: {
  store: FrontdoorStore;
  userId: string;
  appId: string;
  requestedServerId?: string | null;
}):
  | {
      ok: true;
      plan: EntryResolvePlan;
    }
  | {
      ok: false;
      status: number;
      error: string;
    } {
  const appId = normalizeAppId(params.appId);
  if (!appId || !isValidAppId(appId)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_app_id",
    };
  }
  const servers = params.store.getServersForUser(params.userId);
  const serverById = new Map(servers.map((item) => [item.serverId, item]));
  const requestedServerId =
    typeof params.requestedServerId === "string" && params.requestedServerId.trim()
      ? params.requestedServerId.trim()
      : null;
  if (requestedServerId && !serverById.has(requestedServerId)) {
    return {
      ok: false,
      status: 403,
      error: "server_not_authorized",
    };
  }
  // Check entitlement at account level - find first account with an active app subscription
  const accounts = params.store.getAccountsForUser(params.userId);
  let hasActiveEntitlement = false;
  for (const account of accounts) {
    const sub = params.store.getAppSubscription(account.accountId, appId);
    if (sub && sub.status === "active") {
      hasActiveEntitlement = true;
      break;
    }
  }
  const installedServerIds: string[] = [];
  for (const server of servers) {
    const installed = params.store
      .getServerEffectiveAppInstalls(server.serverId)
      .some((item) => item.appId === appId && item.status === "installed");
    if (installed) {
      installedServerIds.push(server.serverId);
    }
  }

  let action: EntryResolveAction = "dashboard_only";
  if (servers.length === 0) {
    action = "create_server_and_install";
  } else if (!hasActiveEntitlement) {
    action = "purchase_app_then_install";
  } else if (requestedServerId) {
    action = installedServerIds.includes(requestedServerId)
      ? "dashboard_only"
      : "install_on_selected_server";
  } else {
    action = installedServerIds.length > 0 ? "dashboard_only" : "install_on_selected_server";
  }

  const defaultServer = servers[0] ?? null;
  return {
    ok: true,
    plan: {
      appId,
      action,
      hasActiveEntitlement,
      serverCount: servers.length,
      requestedServerId,
      recommendedServerId: requestedServerId || installedServerIds[0] || defaultServer?.serverId || null,
      installedServerIds,
    },
  };
}

function getLatestProvisionRequestForPrincipal(params: {
  autoProvisioner: TenantAutoProvisioner | null;
  principal: Principal;
}) {
  const autoProvisioner = params.autoProvisioner;
  if (!autoProvisioner) {
    return null;
  }
  const byUser = autoProvisioner.getLatestProvisionRequestByUser(params.principal.userId);
  if (byUser) {
    return byUser;
  }
  const oidc = parseOidcIdentityFromEntityId(params.principal.entityId);
  if (!oidc) {
    return null;
  }
  return autoProvisioner.getLatestProvisionRequestByOidcIdentity(oidc);
}

function provisionRequestOwnedByPrincipal(params: {
  record: {
    userId: string;
    provider: string;
    subject: string;
  };
  principal: Principal;
}): boolean {
  if (params.record.userId === params.principal.userId) {
    return true;
  }
  const oidc = parseOidcIdentityFromEntityId(params.principal.entityId);
  if (!oidc) {
    return false;
  }
  return params.record.provider === oidc.provider && params.record.subject === oidc.subject;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

type RuntimeAppCatalogItem = {
  displayName: string;
  entryPath: string;
  kind?: string;
};

function parseRuntimeAppCatalog(body: unknown): Map<string, RuntimeAppCatalogItem> {
  const payload = asRecord(body);
  const runtimeItemsRaw = Array.isArray(payload?.items) ? payload.items : [];
  const runtimeAppsById = new Map<string, RuntimeAppCatalogItem>();
  for (const item of runtimeItemsRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const runtimeAppId = normalizeAppId(readOptionalString(record.app_id) || "");
    if (!runtimeAppId || !isValidAppId(runtimeAppId)) {
      continue;
    }
    const appId = canonicalProductAppIdForRuntimeAppId(runtimeAppId);
    const next: RuntimeAppCatalogItem = {
      displayName: readOptionalString(record.display_name) || appId,
      entryPath: readOptionalString(record.entry_path) || defaultEntryPathForApp(appId),
      kind: readOptionalString(record.kind),
    };
    if (!runtimeAppsById.has(appId) || runtimeAppId === appId) {
      runtimeAppsById.set(appId, next);
    }
  }
  return runtimeAppsById;
}

function parseEntitlementCountLimit(value: string | undefined): number | null {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "unlimited" || normalized === "infinite" || normalized === "infinity") {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
}

function resolveBillingPlanFromStripeObject(object: Record<string, unknown>): string {
  const metadata = asRecord(object.metadata);
  const fromMetadata = readOptionalString(metadata?.plan_id);
  if (fromMetadata) {
    return fromMetadata;
  }
  const items = asRecord(object.items);
  const data = Array.isArray(items?.data) ? items?.data : [];
  for (const entry of data) {
    const item = asRecord(entry);
    const price = asRecord(item?.price);
    const lookupKey = readOptionalString(price?.lookup_key);
    if (lookupKey) {
      return lookupKey;
    }
    const priceId = readOptionalString(price?.id);
    if (priceId) {
      return priceId;
    }
  }
  return "starter";
}

function msFromUnixSeconds(value: unknown): number | undefined {
  const maybe = readOptionalNumber(value);
  if (maybe === undefined) {
    return undefined;
  }
  return Math.floor(maybe * 1000);
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

function resolveRuntimeUpstreamBearerToken(params: {
  config: FrontdoorConfig;
  principal: Principal;
  session: SessionRecord;
  runtime: TenantConfig;
}): string {
  const configured = params.runtime.runtimeAuthToken?.trim();
  if (configured) {
    return configured;
  }
  const access = mintRuntimeAccessToken({
    config: params.config,
    principal: params.principal,
    sessionId: params.session.id,
  });
  return access.token;
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
  const store = new FrontdoorStore(
    config.frontdoorStorePath ?? config.workspaceStorePath ?? path.resolve(resolveProjectRoot(), "state", "frontdoor.db"),
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
  store.seedFromConfig(config);

  // ── Startup product sync: auto-sync app manifests into the product catalog ──
  const productManifestPathsRaw = (process.env.FRONTDOOR_PRODUCT_MANIFEST_PATHS ?? "").trim();
  if (productManifestPathsRaw) {
    const manifestPaths = productManifestPathsRaw.split(",").map((p) => p.trim()).filter(Boolean);
    for (const manifestPath of manifestPaths) {
      try {
        // syncProductFromManifest is async but uses sync I/O; await resolves immediately
        void syncProductFromManifest(store, manifestPath).then((result) => {
          console.log(`[startup] product sync: ${result.appId} — ${result.productsUpserted} products, ${result.plansUpserted} plans`);
        }).catch((err) => {
          console.error(`[startup] product sync failed for ${manifestPath}: ${String(err)}`);
        });
      } catch (err) {
        console.error(`[startup] product sync failed for ${manifestPath}: ${String(err)}`);
      }
    }
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

  function isServerCreatorAuthorized(principal: Principal): boolean {
    if (config.operatorUserIds?.has(principal.userId)) {
      return true;
    }
    const email = normalizeEmail(principal.email);
    if (email && config.devCreatorEmails?.has(email)) {
      return true;
    }
    return false;
  }

  function hasAccountAdminRole(accountId: string, userId: string): boolean {
    const membership = store.getAccountMembership(accountId, userId);
    if (!membership) {
      return false;
    }
    return membership.role === "owner" || membership.role === "admin";
  }

  function hasServerAdminAccess(params: {
    server: ServerRecord;
    userId: string;
    principal: Principal;
  }): boolean {
    if (hasGlobalOperatorAccess(params.principal)) {
      return true;
    }
    if (isServerCreatorAuthorized(params.principal)) {
      return true;
    }
    return hasAccountAdminRole(params.server.accountId, params.userId);
  }

  function resolveServerRuntime(serverId: string): TenantConfig | null {
    const configTenant = config.tenants.get(serverId);
    if (configTenant) {
      return configTenant;
    }
    const server = store.getServer(serverId);
    if (!server) {
      return null;
    }
    const tenant = serverToTenantConfig(server);
    config.tenants.set(serverId, tenant);
    return tenant;
  }

  function resolveManagedRuntimeAppConfig(appId: string):
    | {
        ok: true;
        appConfig: Record<string, unknown>;
      }
    | {
        ok: false;
        error: string;
        detail?: string;
      } {
    if (appId === "glowbot") {
      const kind = normalizeRuntimeAppKind(process.env.FRONTDOOR_TENANT_GLOWBOT_APP_KIND, "proxy");
      if (!kind) {
        return {
          ok: false,
          error: "invalid_glowbot_app_kind",
          detail: "set FRONTDOOR_TENANT_GLOWBOT_APP_KIND to static or proxy",
        };
      }
      const root = normalizeText(process.env.FRONTDOOR_TENANT_GLOWBOT_APP_ROOT);
      const proxyBaseUrl = normalizeUrlIfValid(
        normalizeText(process.env.FRONTDOOR_TENANT_GLOWBOT_PROXY_BASE_URL),
      );
      if (kind === "static" && !root) {
        return {
          ok: false,
          error: "glowbot_static_root_missing",
          detail: "set FRONTDOOR_TENANT_GLOWBOT_APP_ROOT for static GlowBot app attach",
        };
      }
      if (kind === "proxy" && !proxyBaseUrl) {
        return {
          ok: false,
          error: "glowbot_proxy_base_url_missing",
          detail: "set FRONTDOOR_TENANT_GLOWBOT_PROXY_BASE_URL for proxy GlowBot app attach",
        };
      }
      if (kind === "proxy" && root) {
        return {
          ok: false,
          error: "glowbot_proxy_static_conflict",
          detail: "unset FRONTDOOR_TENANT_GLOWBOT_APP_ROOT when GlowBot app attach kind is proxy",
        };
      }
      return {
        ok: true,
        appConfig: {
          enabled: true,
          displayName: "GlowBot",
          entryPath: "/app/glowbot/",
          apiBase: "/api/glowbot",
          kind,
          icon: "glowbot-diamond",
          order: 30,
          ...(kind === "static"
            ? {
                root,
              }
            : {
                proxy: {
                  baseUrl: proxyBaseUrl,
                },
              }),
        },
      };
    }

    if (appId === "spike") {
      const kind = normalizeRuntimeAppKind(process.env.FRONTDOOR_TENANT_SPIKE_APP_KIND, "proxy");
      if (!kind) {
        return {
          ok: false,
          error: "invalid_spike_app_kind",
          detail: "set FRONTDOOR_TENANT_SPIKE_APP_KIND to static or proxy",
        };
      }
      const root = normalizeText(process.env.FRONTDOOR_TENANT_SPIKE_APP_ROOT);
      const proxyBaseUrl = normalizeUrlIfValid(
        normalizeText(process.env.FRONTDOOR_TENANT_SPIKE_PROXY_BASE_URL) ||
          normalizeText(process.env.FRONTDOOR_SPIKE_RUNTIME_PUBLIC_BASE_URL),
      );
      if (kind === "static" && !root) {
        return {
          ok: false,
          error: "spike_static_root_missing",
          detail: "set FRONTDOOR_TENANT_SPIKE_APP_ROOT for static Spike app attach",
        };
      }
      if (kind === "proxy" && !proxyBaseUrl) {
        return {
          ok: false,
          error: "spike_proxy_base_url_missing",
          detail:
            "set FRONTDOOR_TENANT_SPIKE_PROXY_BASE_URL (or FRONTDOOR_SPIKE_RUNTIME_PUBLIC_BASE_URL) for proxy Spike app attach",
        };
      }
      if (kind === "proxy" && root) {
        return {
          ok: false,
          error: "spike_proxy_static_conflict",
          detail: "unset FRONTDOOR_TENANT_SPIKE_APP_ROOT when Spike app attach kind is proxy",
        };
      }
      return {
        ok: true,
        appConfig: {
          enabled: true,
          displayName: "Spike",
          entryPath: "/app/spike",
          apiBase: "/api/spike",
          kind,
          icon: "spike",
          order: 40,
          ...(kind === "static"
            ? {
                root,
              }
            : {
                proxy: {
                  baseUrl: proxyBaseUrl,
                },
              }),
        },
      };
    }

    return {
      ok: false,
      error: "runtime_app_attach_unsupported",
      detail: `unsupported app attach target: ${appId}`,
    };
  }

  async function waitForLoopbackPort(port: number, timeoutMs: number): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ port, host: "127.0.0.1" });
        const finish = (value: boolean) => {
          socket.removeAllListeners();
          try {
            socket.destroy();
          } catch {
            // best effort
          }
          resolve(value);
        };
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
        socket.setTimeout(750, () => finish(false));
      });
      if (ok) {
        return true;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
  }

  async function restartTenantRuntimeForServer(params: {
    serverId: string;
    stateDir: string;
  }): Promise<
    | {
        ok: true;
      }
    | {
        ok: false;
        error: string;
        detail?: string;
      }
  > {
    const stateDir = path.resolve(params.stateDir);
    const tenantRoot = path.resolve(stateDir, "..");
    const configPath = path.join(stateDir, "config.json");
    const logPath = path.join(tenantRoot, "runtime.log");
    const pidPath = path.join(tenantRoot, "runtime.pid");
    const portPath = path.join(tenantRoot, "runtime.port");
    const nexAdapterConfigPath = path.join(stateDir, "nex.adapters.yaml");
    const nexusBin = normalizeText(process.env.FRONTDOOR_TENANT_NEXUS_BIN) || "nexus";
    const rawPort = normalizeText(fs.existsSync(portPath) ? fs.readFileSync(portPath, "utf8") : "");
    const port = Number(rawPort);
    if (!Number.isFinite(port) || port <= 0) {
      return {
        ok: false,
        error: "runtime_port_missing",
        detail: `missing runtime port for server ${params.serverId}`,
      };
    }
    const existingPidRaw = normalizeText(fs.existsSync(pidPath) ? fs.readFileSync(pidPath, "utf8") : "");
    const existingPid = Number(existingPidRaw);
    if (Number.isFinite(existingPid) && existingPid > 0) {
      try {
        process.kill(existingPid, "SIGTERM");
      } catch {
        // ignore stale pid
      }
    }
    const runtimeEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NEXUS_STATE_DIR: stateDir,
      NEXUS_CONFIG_PATH: configPath,
    };
    if (fs.existsSync(nexAdapterConfigPath)) {
      runtimeEnv.NEXUS_NEX_CONFIG_PATH = nexAdapterConfigPath;
    } else {
      delete runtimeEnv.NEXUS_NEX_CONFIG_PATH;
    }
    const logFd = fs.openSync(logPath, "a");
    const child = spawn(
      nexusBin,
      ["runtime", "run", "--port", String(port), "--bind", "loopback", "--auth", "trusted_token", "--force"],
      {
        env: runtimeEnv,
        detached: true,
        stdio: ["ignore", logFd, logFd],
      },
    );
    fs.closeSync(logFd);
    child.unref();
    fs.writeFileSync(pidPath, `${child.pid}\n`, "utf8");
    const ready = await waitForLoopbackPort(port, 90_000);
    if (!ready) {
      return {
        ok: false,
        error: "tenant_runtime_restart_timeout",
        detail: `runtime did not become healthy on port ${String(port)} for server ${params.serverId}`,
      };
    }
    return {
      ok: true,
    };
  }

  function resolveServerStateDir(serverId: string): string | null {
    const normalizedServerId = normalizeText(serverId);
    if (!normalizedServerId) {
      return null;
    }
    const fromStore = autoProvisioner?.getTenantRecord(normalizedServerId)?.stateDir ?? null;
    if (fromStore && fs.existsSync(path.join(fromStore, "config.json"))) {
      return fromStore;
    }
    const tenantsRoot = path.resolve(
      normalizeText(process.env.FRONTDOOR_TENANT_ROOT) ||
        path.join(resolveProjectRoot(), ".tenants"),
    );
    const fallbackStateDir = path.join(tenantsRoot, normalizedServerId, "state");
    if (fs.existsSync(path.join(fallbackStateDir, "config.json"))) {
      return fallbackStateDir;
    }
    return null;
  }

  async function attachRuntimeAppOnServer(params: {
    serverId: string;
    appId: string;
  }): Promise<
    | {
        ok: true;
      }
    | {
        ok: false;
        error: string;
        detail?: string;
      }
  > {
    const stateDir = resolveServerStateDir(params.serverId);
    if (!stateDir) {
      return {
        ok: false,
        error: "runtime_attach_state_unavailable",
        detail: `server ${params.serverId} has no managed state directory for app attach`,
      };
    }
    const configPath = path.join(stateDir, "config.json");
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
    } catch (error) {
      return {
        ok: false,
        error: "runtime_config_parse_failed",
        detail: String(error),
      };
    }
    const appConfig = resolveManagedRuntimeAppConfig(params.appId);
    if (!appConfig.ok) {
      return appConfig;
    }
    const configRecord = asRecord(parsedConfig) ?? {};
    const runtimeRecord = asRecord(configRecord.runtime) ?? {};
    const appsRecord = asRecord(runtimeRecord.apps) ?? {};
    appsRecord[params.appId] = appConfig.appConfig;
    runtimeRecord.apps = appsRecord;
    configRecord.runtime = runtimeRecord;
    fs.writeFileSync(configPath, `${JSON.stringify(configRecord, null, 2)}\n`, "utf8");
    return await restartTenantRuntimeForServer({
      serverId: params.serverId,
      stateDir,
    });
  }

  function resolveServerAdminAccess(params: {
    session: SessionRecord;
    serverId: string;
  }):
    | {
        ok: true;
        server: ServerRecord;
      }
    | {
        ok: false;
        status: number;
        error: string;
      } {
    const server = store.getServer(params.serverId);
    if (!server) {
      return {
        ok: false,
        status: 404,
        error: "server_not_found",
      };
    }
    const canAdmin = hasServerAdminAccess({
      server,
      userId: params.session.principal.userId,
      principal: params.session.principal,
    });
    if (!canAdmin) {
      return {
        ok: false,
        status: 403,
        error: "server_admin_forbidden",
      };
    }
    return {
      ok: true,
      server,
    };
  }

  function resolvePreferredProvisionIdentity(userId: string): {
    provider: string;
    subject: string;
  } | null {
    const links = store.listIdentityLinksForUser(userId);
    if (links.length === 0) {
      return null;
    }
    const allowedProviders = new Set(
      config.autoProvision.providers
        .map((provider) => provider.trim().toLowerCase())
        .filter((provider) => provider.length > 0),
    );
    const candidates =
      allowedProviders.size > 0
        ? links.filter((link) => allowedProviders.has(link.provider))
        : links;
    if (candidates.length === 0) {
      return null;
    }
    const nonPassword = candidates.find((link) => link.provider !== "password") ?? candidates[0];
    if (!nonPassword) {
      return null;
    }
    return {
      provider: nonPassword.provider,
      subject: nonPassword.subject,
    };
  }

  async function provisionServerAndInstallAppForSession(params: {
    session: SessionRecord;
    appId: string;
    requestId: string;
  }): Promise<
    | {
        ok: true;
        session: SessionRecord;
        serverId: string;
      }
    | {
        ok: false;
        status: number;
        error: string;
        detail?: string;
      }
  > {
    if (!autoProvisioner) {
      return {
        ok: false,
        status: 400,
        error: "autoprovision_disabled",
      };
    }
    const user = store.getUserById(params.session.principal.userId);
    if (!user || user.disabled) {
      return {
        ok: false,
        status: 401,
        error: "user_not_found",
      };
    }
    const identity = resolvePreferredProvisionIdentity(user.userId);
    if (!identity) {
      return {
        ok: false,
        status: 409,
        error: "autoprovision_identity_unavailable",
      };
    }
    const claims: OidcClaims = {
      sub: identity.subject,
      email: user.email,
      name: user.displayName,
    };
    let resolvedPrincipal: Principal | null = null;
    try {
      resolvedPrincipal = await autoProvisioner.resolveOrProvision({
        provider: identity.provider,
        claims,
        fallbackPrincipal: params.session.principal,
        productId: params.appId,
      });
    } catch (error) {
      return {
        ok: false,
        status: 500,
        error: "autoprovision_failed",
        detail: String(error),
      };
    }
    const tenantId = readOptionalString(resolvedPrincipal?.tenantId);
    if (!tenantId) {
      return {
        ok: false,
        status: 500,
        error: "autoprovision_tenant_missing",
      };
    }
    const tenant = config.tenants.get(tenantId);
    if (!tenant) {
      return {
        ok: false,
        status: 500,
        error: "autoprovision_runtime_missing",
      };
    }

    // Ensure user has an account
    const accounts = store.getAccountsForUser(user.userId);
    const account = accounts[0] ?? store.createAccount(user.displayName || user.userId, user.userId);

    // Upsert the server
    const server = store.upsertServer({
      serverId: tenant.id,
      accountId: account.accountId,
      displayName: tenant.id,
      generatedName: deterministicServerNameFromId(tenant.id),
      runtimeUrl: tenant.runtimeUrl,
      runtimePublicBaseUrl: tenant.runtimePublicBaseUrl,
      runtimeWsUrl: tenant.runtimeWsUrl,
      runtimeSseUrl: tenant.runtimeSseUrl,
      runtimeAuthToken: tenant.runtimeAuthToken,
      status: "active",
      tier: "standard",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    });

    // Ensure account membership
    store.addAccountMember(account.accountId, user.userId, "owner");

    // Create app subscription at account level
    store.createAppSubscription({
      accountId: account.accountId,
      appId: params.appId,
      planId: "starter",
      status: "active",
      provider: "none",
    });

    const nextPrincipal = store.toPrincipal({
      user,
      server,
      accountId: account.accountId,
      amr: params.session.principal.amr.length > 0 ? params.session.principal.amr : ["oidc"],
    });
    const updatedSession = sessions.updateSessionPrincipal(params.session.id, nextPrincipal) ?? {
      ...params.session,
      principal: nextPrincipal,
    };
    const installed = await ensureRuntimeAppInstalled({
      session: updatedSession,
      appId: params.appId,
      serverId: server.serverId,
      source: "purchase",
      requestId: params.requestId,
    });
    if (!installed.ok) {
      return {
        ok: false,
        status: installed.status,
        error: installed.error,
        detail: installed.detail,
      };
    }
    return {
      ok: true,
      session: updatedSession,
      serverId: server.serverId,
    };
  }

  function resolveActiveServerContext(params: {
    session: SessionRecord;
    requestedServerId?: string;
  }):
    | {
        ok: true;
        session: SessionRecord;
        principal: Principal;
        server: ServerRecord;
        serverRuntime: TenantConfig;
        serverCount: number;
        accountId: string;
      }
    | {
        ok: false;
        status: number;
        error: string;
        serverCount: number;
      } {
    const user = store.getUserById(params.session.principal.userId);
    if (!user || user.disabled) {
      return {
        ok: false,
        status: 401,
        error: "user_not_found",
        serverCount: 0,
      };
    }
    const servers = store.getServersForUser(user.userId);
    const serverCount = servers.length;
    let selected: ServerRecord | null = params.requestedServerId
      ? servers.find((item) => item.serverId === params.requestedServerId) ?? null
      : null;
    if (params.requestedServerId && !selected) {
      return {
        ok: false,
        status: 403,
        error: "server_not_authorized",
        serverCount,
      };
    }

    if (!selected) {
      if (params.session.principal.tenantId) {
        selected =
          servers.find((item) => item.serverId === params.session.principal.tenantId) ?? null;
      }
      if (!selected && serverCount === 1) {
        selected = servers[0] ?? null;
      }
    }

    if (!selected) {
      if (serverCount === 0) {
        return {
          ok: false,
          status: 403,
          error: "no_server_access",
          serverCount,
        };
      }
      return {
        ok: false,
        status: 409,
        error: "server_selection_required",
        serverCount,
      };
    }

    const runtime = resolveServerRuntime(selected.serverId);
    if (!runtime) {
      return {
        ok: false,
        status: 404,
        error: "server_runtime_not_found",
        serverCount,
      };
    }

    const nextPrincipal = store.toPrincipal({
      user,
      server: selected,
      accountId: selected.accountId,
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
      server: selected,
      serverRuntime: runtime,
      serverCount,
      accountId: selected.accountId,
    };
  }

  function syncEntitlementsFromPlan(accountId: string, appId: string, planId: string): void {
    store.syncEntitlementsFromPlan(accountId, appId, planId);
  }

  function processBillingWebhookEvent(event: BillingWebhookEvent): {
    serverId?: string;
    status: string;
  } {
    const payload = event.payload;
    // billing.ts still uses workspaceId field name from external Stripe metadata - treat as serverId
    const serverIdFromEvent = event.workspaceId?.trim() || undefined;
    const data = asRecord(payload.data);
    const object = asRecord(data?.object);

    if (event.provider === "mock") {
      const serverId = serverIdFromEvent ?? readOptionalString(payload.server_id);
      if (!serverId) {
        return { status: "ignored_server_missing" };
      }
      const server = store.getServer(serverId);
      if (!server) {
        return { status: "ignored_server_missing" };
      }
      const planId = normalizeEmail(readOptionalString(payload.plan_id) || "").replace(/[^a-z0-9_-]/g, "") || "starter";
      const subscriptionStatus = readOptionalString(payload.status) || "active";
      store.createServerSubscription({
        serverId,
        accountId: server.accountId,
        tier: planId,
        status: subscriptionStatus,
        provider: "mock",
        customerId: readOptionalString(payload.customer_id),
        subscriptionId: readOptionalString(payload.subscription_id),
        periodStartMs: readOptionalNumber(payload.period_start_ms),
        periodEndMs: readOptionalNumber(payload.period_end_ms),
      });
      const appId = readOptionalString(payload.app_id) || "control";
      syncEntitlementsFromPlan(server.accountId, appId, planId);
      const invoice = asRecord(payload.invoice);
      const invoiceId = readOptionalString(invoice?.invoice_id) || readOptionalString(payload.invoice_id);
      if (invoiceId) {
        store.upsertAccountInvoice({
          accountId: server.accountId,
          invoiceId,
          provider: "mock",
          status: readOptionalString(invoice?.status) || readOptionalString(payload.invoice_status) || "open",
          amountDue: readOptionalNumber(invoice?.amount_due) ?? readOptionalNumber(payload.amount_due) ?? 0,
          currency: readOptionalString(invoice?.currency) || readOptionalString(payload.currency) || "usd",
          hostedInvoiceUrl:
            readOptionalString(invoice?.hosted_invoice_url) ||
            readOptionalString(payload.hosted_invoice_url),
          periodStartMs: readOptionalNumber(invoice?.period_start_ms),
          periodEndMs: readOptionalNumber(invoice?.period_end_ms),
          createdAtMs: readOptionalNumber(invoice?.created_at_ms),
          paidAtMs: readOptionalNumber(invoice?.paid_at_ms),
        });
      }
      return { serverId, status: "processed" };
    }

    const metadata = asRecord(object?.metadata);
    // Stripe metadata may contain workspace_id from external integration - read it as serverId for compatibility
    const serverId = serverIdFromEvent ?? readOptionalString(metadata?.workspace_id) ?? readOptionalString(metadata?.server_id);
    if (!serverId) {
      return { status: "ignored_server_missing" };
    }
    const server = store.getServer(serverId);
    if (!server) {
      return { status: "ignored_server_missing" };
    }

    if (event.eventType.startsWith("customer.subscription.")) {
      const resolvedPlanId = resolveBillingPlanFromStripeObject(object ?? {});
      store.createServerSubscription({
        serverId,
        accountId: server.accountId,
        tier: resolvedPlanId,
        status: readOptionalString(object?.status) || "active",
        provider: "stripe",
        customerId: readOptionalString(object?.customer),
        subscriptionId: readOptionalString(object?.id),
        periodStartMs: msFromUnixSeconds(object?.current_period_start),
        periodEndMs: msFromUnixSeconds(object?.current_period_end),
      });
      const appId = readOptionalString(metadata?.app_id) || "control";
      syncEntitlementsFromPlan(server.accountId, appId, resolvedPlanId);
      return { serverId, status: "processed" };
    }

    if (event.eventType === "checkout.session.completed") {
      const checkoutPlanId = readOptionalString(metadata?.plan_id) || "starter";
      store.createServerSubscription({
        serverId,
        accountId: server.accountId,
        tier: checkoutPlanId,
        status: "active",
        provider: "stripe",
        customerId: readOptionalString(object?.customer),
        subscriptionId: readOptionalString(object?.subscription),
      });
      const appId = readOptionalString(metadata?.app_id) || "control";
      syncEntitlementsFromPlan(server.accountId, appId, checkoutPlanId);
      return { serverId, status: "processed" };
    }

    if (event.eventType.startsWith("invoice.")) {
      const invoiceId = readOptionalString(object?.id);
      if (!invoiceId) {
        return { serverId, status: "ignored_invoice_missing_id" };
      }
      const status = readOptionalString(object?.status) || "open";
      const statusTransitions = asRecord(object?.status_transitions);
      store.upsertAccountInvoice({
        accountId: server.accountId,
        invoiceId,
        provider: "stripe",
        status,
        amountDue: readOptionalNumber(object?.amount_due) ?? 0,
        currency: readOptionalString(object?.currency) || "usd",
        hostedInvoiceUrl: readOptionalString(object?.hosted_invoice_url),
        periodStartMs: msFromUnixSeconds(object?.period_start),
        periodEndMs: msFromUnixSeconds(object?.period_end),
        createdAtMs: msFromUnixSeconds(object?.created),
        paidAtMs: msFromUnixSeconds(statusTransitions?.paid_at),
      });
      if (event.eventType === "invoice.payment_failed") {
        const current = store.getServerSubscription(serverId);
        if (current) {
          store.createServerSubscription({
            serverId,
            accountId: server.accountId,
            tier: current.tier,
            status: "past_due",
            provider: "stripe",
            customerId: current.customerId,
            subscriptionId: current.subscriptionId,
            periodStartMs: current.periodStartMs,
            periodEndMs: current.periodEndMs,
          });
        }
      }
      return { serverId, status: "processed" };
    }

    return { serverId, status: "ignored_event_type" };
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
    const upstreamBearer = resolveRuntimeUpstreamBearerToken({
      config,
      principal: params.principal,
      session: params.session,
      runtime: params.runtime,
    });
    params.req.headers.authorization = `Bearer ${upstreamBearer}`;
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

  async function probeRuntimeJsonEndpoint(params: {
    runtime: TenantConfig;
    session: SessionRecord;
    principal: Principal;
    path: string;
    requestId: string;
  }): Promise<{
    ok: boolean;
    httpStatus: number;
    error?: string;
    body: unknown;
  }> {
    const target = new URL(params.path, params.runtime.runtimeUrl);
    const upstreamBearer = resolveRuntimeUpstreamBearerToken({
      config,
      principal: params.principal,
      session: params.session,
      runtime: params.runtime,
    });
    const headers = new Headers();
    headers.set("authorization", `Bearer ${upstreamBearer}`);
    headers.set("x-nexus-frontdoor-tenant", params.runtime.id);
    headers.set("x-nexus-frontdoor-session", params.session.id);
    headers.set("x-request-id", params.requestId);
    try {
      const response = await fetch(target, {
        method: "GET",
        headers,
      });
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const text = await response.text();
      let body: unknown = null;
      if (text) {
        if (contentType.includes("application/json")) {
          try {
            body = JSON.parse(text) as unknown;
          } catch {
            body = {
              raw: text.slice(0, 1024),
            };
          }
        } else {
          body = {
            raw: text.slice(0, 1024),
          };
        }
      }
      if (!response.ok) {
        const bodyRecord = asRecord(body);
        const code = readOptionalString(bodyRecord?.error) || `runtime_http_${response.status}`;
        return {
          ok: false,
          httpStatus: response.status,
          error: code,
          body,
        };
      }
      return {
        ok: true,
        httpStatus: response.status,
        body,
      };
    } catch (error) {
      return {
        ok: false,
        httpStatus: 0,
        error: "runtime_unreachable",
        body: {
          detail: String(error),
        },
      };
    }
  }

  async function ensureRuntimeAppInstalled(params: {
    session: SessionRecord;
    appId: string;
    serverId: string;
    source: "purchase" | "manual";
    requestId: string;
  }): Promise<
    | {
        ok: true;
        runtimeAppKind: string | null;
      }
    | {
        ok: false;
        status: number;
        error: string;
        detail?: string;
      }
  > {
    const entryPath = defaultEntryPathForApp(params.appId);
    store.upsertServerAppInstall({
      serverId: params.serverId,
      appId: params.appId,
      status: "installing",
      entryPath,
      source: params.source,
    });
    const resolveContext = resolveActiveServerContext({
      session: params.session,
      requestedServerId: params.serverId,
    });
    if (!resolveContext.ok) {
      store.upsertServerAppInstall({
        serverId: params.serverId,
        appId: params.appId,
        status: "failed",
        entryPath,
        lastError: resolveContext.error,
        source: params.source,
      });
      return {
        ok: false,
        status: resolveContext.status,
        error: resolveContext.error,
      };
    }
    const runtimeApps = await probeRuntimeJsonEndpoint({
      runtime: resolveContext.serverRuntime,
      session: resolveContext.session,
      principal: resolveContext.principal,
      path: "/api/apps",
      requestId: params.requestId,
    });
    if (!runtimeApps.ok) {
      const code = runtimeApps.error || "runtime_unreachable";
      store.upsertServerAppInstall({
        serverId: params.serverId,
        appId: params.appId,
        status: "failed",
        entryPath,
        lastError: code,
        source: params.source,
      });
      return {
        ok: false,
        status: 503,
        error: code,
      };
    }
    const runtimeAppsById = parseRuntimeAppCatalog(runtimeApps.body);
    const present = runtimeAppsById.get(params.appId) ?? null;
    if (!present) {
      const attach = await attachRuntimeAppOnServer({
        serverId: params.serverId,
        appId: params.appId,
      });
      if (!attach.ok) {
        store.upsertServerAppInstall({
          serverId: params.serverId,
          appId: params.appId,
          status: "failed",
          entryPath,
          lastError: attach.error,
          source: params.source,
        });
        return {
          ok: false,
          status: 409,
          error: attach.error,
          detail: attach.detail,
        };
      }
      const afterContext = resolveActiveServerContext({
        session: resolveContext.session,
        requestedServerId: params.serverId,
      });
      if (!afterContext.ok) {
        store.upsertServerAppInstall({
          serverId: params.serverId,
          appId: params.appId,
          status: "failed",
          entryPath,
          lastError: afterContext.error,
          source: params.source,
        });
        return {
          ok: false,
          status: afterContext.status,
          error: afterContext.error,
        };
      }
      const runtimeAppsAfterAttach = await probeRuntimeJsonEndpoint({
        runtime: afterContext.serverRuntime,
        session: afterContext.session,
        principal: afterContext.principal,
        path: "/api/apps",
        requestId: params.requestId,
      });
      if (!runtimeAppsAfterAttach.ok) {
        const code = runtimeAppsAfterAttach.error || "runtime_unreachable";
        store.upsertServerAppInstall({
          serverId: params.serverId,
          appId: params.appId,
          status: "failed",
          entryPath,
          lastError: code,
          source: params.source,
        });
        return {
          ok: false,
          status: 503,
          error: code,
        };
      }
      const afterCatalog = parseRuntimeAppCatalog(runtimeAppsAfterAttach.body);
      const runtimeItem = afterCatalog.get(params.appId) ?? null;
      if (!runtimeItem) {
        store.upsertServerAppInstall({
          serverId: params.serverId,
          appId: params.appId,
          status: "failed",
          entryPath,
          lastError: "runtime_app_missing_after_attach",
          source: params.source,
        });
        return {
          ok: false,
          status: 409,
          error: "runtime_app_missing_after_attach",
        };
      }
      store.upsertServerAppInstall({
        serverId: params.serverId,
        appId: params.appId,
        status: "installed",
        entryPath,
        source: params.source,
      });
      return {
        ok: true,
        runtimeAppKind: runtimeItem.kind ?? null,
      };
    }
    store.upsertServerAppInstall({
      serverId: params.serverId,
      appId: params.appId,
      status: "installed",
      entryPath,
      source: params.source,
    });
    return {
      ok: true,
      runtimeAppKind: present.kind ?? null,
    };
  }

  function buildForwardedRuntimePath(params: {
    url: URL;
    route: "runtime" | "app";
    stripSensitiveQuery?: boolean;
  }): string {
    const targetPath =
      params.route === "runtime" ? params.url.pathname.slice("/runtime".length) || "/" : params.url.pathname;
    if (!params.stripSensitiveQuery) {
      return `${targetPath}${params.url.search || ""}`;
    }
    const nextParams = new URLSearchParams(params.url.search);
    nextParams.delete("token");
    nextParams.delete("runtimeUrl");
    nextParams.delete("launch_code");
    const nextSearch = nextParams.toString();
    return `${targetPath}${nextSearch ? `?${nextSearch}` : ""}`;
  }

  async function proxyRuntimeDocumentWithAppFrame(params: {
    req: IncomingMessage;
    res: ServerResponse;
    url: URL;
    session: SessionRecord;
    principal: Principal;
    runtime: TenantConfig;
    serverId: string;
    server: ServerRecord;
    accountId: string;
  }): Promise<void> {
    const upstreamBearer = resolveRuntimeUpstreamBearerToken({
      config,
      principal: params.principal,
      session: params.session,
      runtime: params.runtime,
    });
    const targetPath = buildForwardedRuntimePath({
      url: params.url,
      route: "app",
      stripSensitiveQuery: true,
    });
    const runtimeTarget = new URL(targetPath, params.runtime.runtimeUrl);
    const headers = new Headers();
    headers.set("authorization", `Bearer ${upstreamBearer}`);
    headers.set("x-nexus-frontdoor-tenant", params.runtime.id);
    headers.set("x-nexus-frontdoor-session", params.session.id);
    headers.set("x-request-id", readHeaderValue(params.req.headers["x-request-id"]) || randomToken(10));
    const accept = readHeaderValue(params.req.headers.accept);
    if (accept) {
      headers.set("accept", accept);
    }
    const userAgent = readHeaderValue(params.req.headers["user-agent"]);
    if (userAgent) {
      headers.set("user-agent", userAgent);
    }
    const targetOrigin = resolveTargetOrigin(params.runtime.runtimeUrl);
    const incomingOrigin = readHeaderValue(params.req.headers.origin);
    if (targetOrigin && incomingOrigin) {
      headers.set("x-nexus-frontdoor-origin", incomingOrigin);
      headers.set("origin", targetOrigin);
    }

    // Buffer the runtime response (wrap in try-catch for connection failures)
    let runtimeResponse: Response;
    let contentType: string;
    let bodyText: string;
    try {
      runtimeResponse = await fetch(runtimeTarget, {
        method: "GET",
        headers,
      });
      contentType = (runtimeResponse.headers.get("content-type") || "").toLowerCase();
      bodyText = await runtimeResponse.text();
    } catch (fetchError) {
      // Runtime is unreachable — synthesize a 502 so the error-page path below handles it
      runtimeResponse = new Response("Runtime unreachable", { status: 502 });
      contentType = "text/plain";
      bodyText = `Could not connect to runtime: ${String(fetchError)}`;
    }

    // Non-200: generate friendly error page WITH app frame so user can navigate
    if (runtimeResponse.status !== 200) {
      const errorAppIdMatch = params.url.pathname.match(/^\/app\/([^/]+)/);
      const errorAppId = errorAppIdMatch ? decodeURIComponent(errorAppIdMatch[1]) : "unknown";
      const errorProduct = store.getProduct(errorAppId);
      const errorAppName = errorProduct?.displayName ?? errorAppId;
      const errorAccent = errorProduct?.accentColor ?? "#6366f1";
      const errorStatus = runtimeResponse.status;
      const errorBodyPreview = bodyText.trim().slice(0, 500);

      const errorPageHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(errorAppName)} — Error ${errorStatus}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0e0e11;color:#c5c5d0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column}
  .error-container{flex:1;display:flex;align-items:center;justify-content:center;padding:40px 24px}
  .error-card{text-align:center;max-width:480px;width:100%}
  .error-code{font-size:72px;font-weight:800;color:#3b3b4f;line-height:1}
  .error-title{font-size:20px;font-weight:600;color:#e4e4ec;margin:16px 0 8px}
  .error-desc{font-size:14px;color:#8888a0;margin-bottom:24px;line-height:1.5}
  .error-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
  .error-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;text-decoration:none;cursor:pointer;border:none;transition:background 0.15s}
  .error-btn-primary{background:#6366f1;color:#fff}.error-btn-primary:hover{background:#5558e6}
  .error-btn-secondary{background:#1e1e2a;color:#c5c5d0;border:1px solid #2a2a3a}.error-btn-secondary:hover{background:#252536}
  details{margin-top:24px;text-align:left}
  summary{font-size:12px;color:#6668a0;cursor:pointer;padding:8px 0}
  pre{font-size:12px;color:#6668a0;background:#111118;border:1px solid #1e1e2a;border-radius:8px;padding:12px;margin-top:8px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto}
</style>
</head><body>
<div class="error-container">
  <div class="error-card">
    <div class="error-code">${errorStatus}</div>
    <div class="error-title">This app couldn't be loaded</div>
    <div class="error-desc">${escHtml(errorAppName)} returned an error. This may be temporary — try again in a moment.</div>
    <div class="error-actions">
      <a href="/" class="error-btn error-btn-primary">Back to Dashboard</a>
      <button onclick="location.reload()" class="error-btn error-btn-secondary">Try Again</button>
    </div>
    ${errorBodyPreview ? `<details><summary>Technical Details</summary><pre>Status: ${errorStatus}\nApp: ${escHtml(errorAppId)}\nPath: ${escHtml(params.url.pathname)}\n\n${escHtml(errorBodyPreview)}</pre></details>` : ""}
  </div>
</div>
</body></html>`;

      // Gather frame context for the error page
      const errorUser = store.getUserById(params.session.principal.userId);
      const errorUserDisplayName = errorUser?.displayName ?? errorUser?.email ?? "";
      const errorUserEmail = errorUser?.email ?? "";
      const errorAccount = store.getAccount(params.accountId);
      const errorAccountName = errorAccount?.displayName ?? "";
      const errorAllServers = store.getServersForUser(params.session.principal.userId);
      const errorServers = errorAllServers.map((s) => ({
        serverId: s.serverId,
        displayName: s.displayName || s.generatedName,
        status: s.status === "active" ? "active" : s.status === "provisioning" ? "degraded" : "down",
      }));
      const errorAppInstalls = store.getServerEffectiveAppInstalls(params.serverId);
      const errorInstalledApps = errorAppInstalls.map((install) => {
        const prod = store.getProduct(install.appId);
        return {
          appId: install.appId,
          displayName: prod?.displayName ?? install.appId,
          accentColor: prod?.accentColor ?? "#6366f1",
          entryPath: install.entryPath ?? defaultEntryPathForApp(install.appId),
          status: install.status,
        };
      });

      const framedError = injectAppFrame(errorPageHtml, {
        appId: errorAppId,
        appDisplayName: errorAppName,
        appAccentColor: errorAccent,
        serverId: params.serverId,
        serverDisplayName: params.server.displayName || params.server.generatedName,
        serverStatus: params.server.status === "active" ? "active" : params.server.status === "provisioning" ? "degraded" : "down",
        servers: errorServers,
        installedApps: errorInstalledApps,
        userDisplayName: errorUserDisplayName,
        userEmail: errorUserEmail,
        accountName: errorAccountName,
        dashboardUrl: "/",
        logoutUrl: "/api/auth/logout",
      });

      const framedErrorBuffer = Buffer.from(framedError, "utf8");
      params.res.statusCode = errorStatus;
      params.res.setHeader("content-type", "text/html; charset=utf-8");
      params.res.setHeader("content-length", String(framedErrorBuffer.byteLength));
      params.res.setHeader("cache-control", "no-store");
      params.res.end(framedErrorBuffer);
      return;
    }

    // Non-HTML 200: pass through without frame injection (API/JSON responses)
    if (!contentType.includes("text/html")) {
      params.res.statusCode = runtimeResponse.status;
      params.res.setHeader(
        "content-type",
        runtimeResponse.headers.get("content-type") || "text/html; charset=utf-8",
      );
      params.res.setHeader("cache-control", "no-store");
      params.res.end(bodyText);
      return;
    }

    // Extract app ID from pathname
    const appIdMatch = params.url.pathname.match(/^\/app\/([^/]+)/);
    const appId = appIdMatch ? decodeURIComponent(appIdMatch[1]) : "control";

    // Look up frame context data from store
    const product = store.getProduct(appId);
    const appDisplayName = product?.displayName ?? appId;
    const appAccentColor = product?.accentColor ?? "#6366f1";

    const user = store.getUserById(params.session.principal.userId);
    const userDisplayName = user?.displayName ?? user?.email ?? "";
    const userEmail = user?.email ?? "";

    const account = store.getAccount(params.accountId);
    const accountName = account?.displayName ?? "";

    const allServers = store.getServersForUser(params.session.principal.userId);
    const servers = allServers.map((s) => ({
      serverId: s.serverId,
      displayName: s.displayName || s.generatedName,
      status: s.status === "active" ? "active" : s.status === "provisioning" ? "degraded" : "down",
    }));

    const appInstalls = store.getServerEffectiveAppInstalls(params.serverId);
    const installedApps = appInstalls.map((install) => {
      const prod = store.getProduct(install.appId);
      return {
        appId: install.appId,
        displayName: prod?.displayName ?? install.appId,
        accentColor: prod?.accentColor ?? "#6366f1",
        entryPath: install.entryPath ?? defaultEntryPathForApp(install.appId),
        status: install.status,
      };
    });

    // Inject the app frame
    const framed = injectAppFrame(bodyText, {
      appId,
      appDisplayName,
      appAccentColor,
      serverId: params.serverId,
      serverDisplayName: params.server.displayName || params.server.generatedName,
      serverStatus: params.server.status === "active" ? "active" : params.server.status === "provisioning" ? "degraded" : "down",
      servers,
      installedApps,
      userDisplayName,
      userEmail,
      accountName,
      dashboardUrl: "/",
      logoutUrl: "/api/auth/logout",
    });

    // Return modified HTML with updated content-length
    const framedBuffer = Buffer.from(framed, "utf8");
    params.res.statusCode = 200;
    params.res.setHeader("content-type", "text/html; charset=utf-8");
    params.res.setHeader("content-length", String(framedBuffer.byteLength));
    params.res.setHeader("cache-control", "no-store");
    params.res.end(framedBuffer);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", config.baseUrl);
    const pathname = url.pathname;
    const method = (req.method ?? "GET").toUpperCase();
    const startedAt = Date.now();
    const requestId = readHeaderValue(req.headers["x-request-id"]) || randomToken(10);
    const clientIp = getClientIp(req);
    const cookies = parseCookies(req);
    const cookieSessionId = cookies[config.sessionCookieName] ?? null;
    const requestSecure = resolveRequestSecureContext(req, config.baseUrl);
    const cookieSecure = config.sessionCookieSecure === true || requestSecure;
    res.setHeader("x-request-id", requestId);
    applySecurityHeaders(res, {
      config,
      requestSecure,
    });
    res.on("finish", () => {
      logFrontdoorEvent("http_request", {
        request_id: requestId,
        method,
        path: pathname,
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
        client_ip: clientIp,
        session_cookie_id: cookieSessionId,
      });
    });
    try {
      if (isMutationMethod(method) && !isSameOriginBrowserMutation(req, config.baseUrl)) {
        sendJson(res, 403, {
          ok: false,
          error: "origin_not_allowed",
        });
        logFrontdoorEvent("origin_rejected", {
          request_id: requestId,
          method,
          path: pathname,
          origin: readHeaderValue(req.headers.origin) || null,
          referer: readHeaderValue(req.headers.referer) || null,
        });
        return;
      }

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
        const servers = store.getServersForUser(session.principal.userId);
        const activeServer =
          (session.principal.tenantId
            ? servers.find((item) => item.serverId === session.principal.tenantId) ?? null
            : null) ?? null;
        sendJson(res, 200, {
          authenticated: true,
          session_id: session.id,
          user_id: session.principal.userId,
          tenant_id: session.principal.tenantId,
          server_id: session.principal.tenantId || null,
          entity_id: session.principal.entityId,
          username: session.principal.username,
          display_name: session.principal.displayName,
          email: session.principal.email,
          roles: session.principal.roles,
          scopes: session.principal.scopes,
          account_id: session.principal.accountId || null,
          server_count: servers.length,
          active_server_id: activeServer?.serverId ?? null,
          active_server_display_name: activeServer?.displayName ?? null,
          latest_provisioning: getLatestProvisionRequestForPrincipal({
            autoProvisioner,
            principal: session.principal,
          }),
        });
        return;
      }

      if (method === "GET" && pathname === "/api/auth/me") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "not_authenticated" });
          return;
        }
        const user = store.getUserById(session.principal.userId);
        sendJson(res, 200, {
          ok: true,
          user_id: session.principal.userId,
          username: session.principal.username,
          display_name: session.principal.displayName,
          email: session.principal.email ?? user?.email ?? null,
          roles: session.principal.roles,
          scopes: session.principal.scopes,
          account_id: session.principal.accountId || null,
          tenant_id: session.principal.tenantId || null,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/auth/login") {
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
        const user = store.authenticatePassword(username, password);
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
          logFrontdoorEvent("auth_login_failed", {
            request_id: requestId,
            username: username || null,
            client_ip: clientIp,
          });
          return;
        }
        loginFailureLimiter.reset(failureKey);
        const userServers = store.getServersForUser(user.userId);
        const defaultServer = userServers.length > 0 ? userServers[0] : null;
        const accounts = store.getAccountsForUser(user.userId);
        const defaultAccountId = defaultServer?.accountId || accounts[0]?.accountId;
        const principal = store.toPrincipal({
          user,
          server: defaultServer,
          accountId: defaultAccountId,
          amr: ["pwd"],
        });
        const session = sessions.createSession(principal);
        const serverCount = userServers.length;
        setCookie({
          res,
          name: config.sessionCookieName,
          value: session.id,
          domain: config.sessionCookieDomain,
          maxAgeSeconds: config.sessionTtlSeconds,
          secure: cookieSecure,
        });
        sendJson(res, 200, {
          ok: true,
          authenticated: true,
          session_id: session.id,
          tenant_id: principal.tenantId,
          server_id: principal.tenantId || null,
          entity_id: principal.entityId,
          user_id: principal.userId,
          roles: principal.roles,
          scopes: principal.scopes,
          account_id: principal.accountId || null,
          server_count: serverCount,
        });
        logFrontdoorEvent("auth_login_succeeded", {
          request_id: requestId,
          user_id: principal.userId,
          tenant_id: principal.tenantId || null,
          client_ip: clientIp,
        });
        return;
      }

      // ── Signup (password-based registration) ──────────────────────
      if (method === "POST" && pathname === "/api/auth/signup") {
        if (
          !applyRateLimit({
            req,
            res,
            limiter: loginAttemptLimiter,
            key: `signup:attempt:${clientIp}`,
            error: "signup_rate_limited",
          })
        ) {
          return;
        }
        const body =
          (await readJsonBody<{
            email?: string;
            username?: string;
            password?: string;
            display_name?: string;
            intent_app?: string;
          }>(req)) ?? {};
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const username =
          typeof body.username === "string"
            ? body.username.trim().toLowerCase()
            : email.split("@")[0]?.replace(/[^a-z0-9_-]/g, "") || "";
        const password = typeof body.password === "string" ? body.password : "";
        const displayName =
          typeof body.display_name === "string" ? body.display_name.trim() : username;
        const intentApp =
          typeof body.intent_app === "string" ? body.intent_app.trim().toLowerCase() : "";

        // Validate required fields
        if (!email || !email.includes("@")) {
          sendJson(res, 400, { ok: false, error: "invalid_email" });
          return;
        }
        if (!password || password.length < 6) {
          sendJson(res, 400, {
            ok: false,
            error: "password_too_short",
            detail: "Password must be at least 6 characters",
          });
          return;
        }
        if (!username || username.length < 2) {
          sendJson(res, 400, { ok: false, error: "invalid_username" });
          return;
        }

        // Check for existing user with same email or username
        const existingByEmail = store.getUserByEmail(email);
        if (existingByEmail) {
          sendJson(res, 409, { ok: false, error: "email_already_registered" });
          return;
        }
        const existingByUsername = store.getUserByUsername(username);
        if (existingByUsername) {
          sendJson(res, 409, { ok: false, error: "username_already_taken" });
          return;
        }

        // Create user
        const userId = `user-${randomUUID().slice(0, 12)}`;
        const passwordHash = createPasswordHash(password);
        const user = store.upsertUser({
          userId,
          username,
          passwordHash,
          email,
          displayName: displayName || username,
          disabled: false,
        });

        // Create account
        const account = store.createAccount(displayName || username, userId);

        // Auto-provision server + auto-install app if intent_app specified
        let serverId: string | null = null;
        let redirectTo = "/";

        // Map user to a server — use auto-provisioner if available, else first tenant
        const firstTenantId = Array.from(config.tenants.keys())[0];
        const tenant = firstTenantId ? config.tenants.get(firstTenantId) : undefined;

        if (tenant) {
          const server = store.upsertServer({
            serverId: tenant.id,
            accountId: account.accountId,
            displayName: tenant.id,
            generatedName: deterministicServerNameFromId(tenant.id),
            runtimeUrl: tenant.runtimeUrl,
            runtimePublicBaseUrl: tenant.runtimePublicBaseUrl,
            runtimeWsUrl: tenant.runtimeWsUrl,
            runtimeSseUrl: tenant.runtimeSseUrl,
            runtimeAuthToken: tenant.runtimeAuthToken,
            status: "active",
            tier: "standard",
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
          });
          serverId = server.serverId;

          if (intentApp) {
            // Create free app subscription
            store.createAppSubscription({
              accountId: account.accountId,
              appId: intentApp,
              planId: `${intentApp}-free`,
              status: "active",
              provider: "none",
            });

            // Build session early so ensureRuntimeAppInstalled can use it
            const earlyPrincipal = store.toPrincipal({
              user,
              server,
              accountId: account.accountId,
              amr: ["pwd"],
            });
            const earlySession = sessions.createSession(earlyPrincipal);

            // Install the app on the server
            try {
              await ensureRuntimeAppInstalled({
                session: earlySession,
                appId: intentApp,
                serverId: server.serverId,
                source: "purchase",
                requestId,
              });
            } catch {
              // Non-fatal — user can install from dashboard
            }

            redirectTo = `/app/${intentApp}/`;

            // Set cookie and respond using the early session
            setCookie({
              res,
              name: config.sessionCookieName,
              value: earlySession.id,
              domain: config.sessionCookieDomain,
              maxAgeSeconds: config.sessionTtlSeconds,
              secure: cookieSecure,
            });
            sendJson(res, 201, {
              ok: true,
              session_id: earlySession.id,
              user_id: userId,
              account_id: account.accountId,
              server_id: serverId,
              redirect_to: redirectTo,
            });
            logFrontdoorEvent("auth_signup_succeeded", {
              request_id: requestId,
              user_id: userId,
              intent_app: intentApp || null,
              client_ip: clientIp,
            });
            return;
          }
        }

        // Create session (no auto-provision path)
        const userServers = store.getServersForUser(userId);
        const defaultServer = userServers.length > 0 ? userServers[0] : null;
        const principal = store.toPrincipal({
          user,
          server: defaultServer,
          accountId: account.accountId,
          amr: ["pwd"],
        });
        const session = sessions.createSession(principal);
        setCookie({
          res,
          name: config.sessionCookieName,
          value: session.id,
          domain: config.sessionCookieDomain,
          maxAgeSeconds: config.sessionTtlSeconds,
          secure: cookieSecure,
        });

        if (intentApp) {
          redirectTo = `/app/${intentApp}/`;
        }

        sendJson(res, 201, {
          ok: true,
          session_id: session.id,
          user_id: userId,
          account_id: account.accountId,
          server_id: serverId,
          redirect_to: redirectTo,
        });
        logFrontdoorEvent("auth_signup_succeeded", {
          request_id: requestId,
          user_id: userId,
          intent_app: intentApp || null,
          client_ip: clientIp,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/auth/logout") {
        const session = readSession({ req, config, sessions });
        if (session) {
          sessions.deleteSession(session.id);
        }
        clearCookie({
          res,
          name: config.sessionCookieName,
          domain: config.sessionCookieDomain,
          secure: cookieSecure,
        });
        sendJson(res, 200, { ok: true });
        return;
      }

      // ── Public Product Registry ────────────────────────────────────
      if (method === "GET" && pathname === "/api/products") {
        const products = store.listProducts();
        sendJson(res, 200, {
          ok: true,
          items: products.map((p) => ({
            product_id: p.productId,
            display_name: p.displayName,
            tagline: p.tagline ?? null,
            accent_color: p.accentColor ?? null,
            homepage_url: p.homepageUrl ?? null,
          })),
        });
        return;
      }

      const productDetailRouteMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
      if (method === "GET" && productDetailRouteMatch) {
        const productId = decodeURIComponent(productDetailRouteMatch[1] ?? "").trim();
        if (!productId) {
          sendJson(res, 400, { ok: false, error: "missing_product_id" });
          return;
        }
        const product = store.getProduct(productId);
        if (!product) {
          sendJson(res, 404, { ok: false, error: "product_not_found" });
          return;
        }
        const plans = store.listProductPlans(productId);
        sendJson(res, 200, {
          ok: true,
          product_id: product.productId,
          display_name: product.displayName,
          tagline: product.tagline ?? null,
          accent_color: product.accentColor ?? null,
          homepage_url: product.homepageUrl ?? null,
          plans: plans.map((p) => ({
            plan_id: p.planId,
            display_name: p.displayName,
            description: p.description ?? null,
            price_monthly: p.priceMonthly,
            price_yearly: p.priceYearly ?? null,
            features: p.featuresJson ? JSON.parse(p.featuresJson) : [],
            is_default: p.isDefault,
            sort_order: p.sortOrder,
          })),
        });
        return;
      }

      const productPlansRouteMatch = pathname.match(/^\/api\/products\/([^/]+)\/plans$/);
      if (method === "GET" && productPlansRouteMatch) {
        const productId = decodeURIComponent(productPlansRouteMatch[1] ?? "").trim();
        if (!productId) {
          sendJson(res, 400, { ok: false, error: "missing_product_id" });
          return;
        }
        const product = store.getProduct(productId);
        if (!product) {
          sendJson(res, 404, { ok: false, error: "product_not_found" });
          return;
        }
        const plans = store.listProductPlans(productId);
        sendJson(res, 200, {
          ok: true,
          product_id: productId,
          items: plans.map((p) => ({
            plan_id: p.planId,
            display_name: p.displayName,
            description: p.description ?? null,
            price_monthly: p.priceMonthly,
            price_yearly: p.priceYearly ?? null,
            features: p.featuresJson ? JSON.parse(p.featuresJson) : [],
            limits: p.limitsJson ? JSON.parse(p.limitsJson) : {},
            is_default: p.isDefault,
            sort_order: p.sortOrder,
          })),
        });
        return;
      }

      if (method === "GET" && pathname === "/api/apps/catalog") {
        const products = store.listProducts();
        sendJson(res, 200, {
          ok: true,
          items: products.map((product) => ({
            app_id: product.productId,
            display_name: product.displayName,
            tagline: product.tagline ?? null,
            accent_color: product.accentColor ?? null,
            homepage_url: product.homepageUrl ?? null,
          })),
        });
        return;
      }

      if (method === "GET" && pathname === "/api/apps/owned") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const accounts = store.getAccountsForUser(session.principal.userId);
        const productsById = new Map(
          store.listProducts().map((product) => [product.productId, product]),
        );
        // Collect app subscriptions across all user's accounts
        const subscriptionsByApp = new Map<string, { status: string; source: string }>();
        for (const account of accounts) {
          const subs = store.getAppSubscriptionsForAccount(account.accountId);
          for (const sub of subs) {
            if (!subscriptionsByApp.has(sub.appId)) {
              subscriptionsByApp.set(sub.appId, { status: sub.status, source: sub.provider });
            }
          }
        }
        const servers = store.getServersForUser(session.principal.userId);
        const installedByApp = new Map<string, Set<string>>();
        for (const server of servers) {
          const effectiveInstalls = store.getServerEffectiveAppInstalls(server.serverId);
          for (const install of effectiveInstalls) {
            if (install.status !== "installed") {
              continue;
            }
            const bucket = installedByApp.get(install.appId) ?? new Set<string>();
            bucket.add(server.serverId);
            installedByApp.set(install.appId, bucket);
          }
        }
        sendJson(res, 200, {
          ok: true,
          items: [...subscriptionsByApp.entries()].map(([appId, sub]) => {
            const product = productsById.get(appId) ?? null;
            const serverIds = [...(installedByApp.get(appId) ?? new Set<string>())];
            return {
              app_id: appId,
              status: sub.status,
              source: sub.source,
              display_name: product?.displayName ?? appId,
              tagline: product?.tagline ?? null,
              accent_color: product?.accentColor ?? null,
              server_ids: serverIds,
              install_count: serverIds.length,
            };
          }),
        });
        return;
      }

      const appPurchaseRouteMatch = pathname.match(/^\/api\/apps\/([^/]+)\/purchase$/);
      if (method === "POST" && appPurchaseRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const appId = normalizeAppId(decodeURIComponent(appPurchaseRouteMatch[1] ?? ""));
        if (!isValidAppId(appId)) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_app_id",
          });
          return;
        }
        const product = store.getProduct(appId);
        if (!product) {
          sendJson(res, 404, {
            ok: false,
            error: "app_not_found",
          });
          return;
        }
        const body =
          (await readJsonBody<{
            server_id?: string;
            install?: boolean;
          }>(req)) ?? {};
        const requestedServerId =
          typeof body.server_id === "string" ? body.server_id.trim() : "";
        const shouldInstall = body.install !== false;

        // Create app subscription at account level
        const accounts = store.getAccountsForUser(session.principal.userId);
        const targetAccountId = session.principal.accountId || accounts[0]?.accountId;
        if (!targetAccountId) {
          sendJson(res, 400, { ok: false, error: "no_account" });
          return;
        }
        store.createAppSubscription({
          accountId: targetAccountId,
          appId,
          planId: "default",
          status: "active",
          provider: "manual",
        });

        let installedServerId: string | null = null;
        if (shouldInstall && requestedServerId) {
          const access = resolveServerAdminAccess({
            session,
            serverId: requestedServerId,
          });
          if (!access.ok) {
            sendJson(res, access.status, {
              ok: false,
              error: access.error,
              app_id: appId,
              server_id: requestedServerId,
            });
            return;
          }
          const installed = await ensureRuntimeAppInstalled({
            session,
            appId,
            serverId: requestedServerId,
            source: "purchase",
            requestId,
          });
          if (!installed.ok) {
            sendJson(res, installed.status, {
              ok: false,
              error: installed.error,
              detail: installed.detail ?? null,
              app_id: appId,
              server_id: requestedServerId,
            });
            return;
          }
          installedServerId = requestedServerId;
        }

        sendJson(res, 200, {
          ok: true,
          app_id: appId,
          status: "active",
          installed_server_id: installedServerId,
        });
        return;
      }

      // Subscription cancel: POST /api/apps/:appId/cancel
      const appCancelRouteMatch = pathname.match(/^\/api\/apps\/([^/]+)\/cancel$/);
      if (method === "POST" && appCancelRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const appId = normalizeAppId(decodeURIComponent(appCancelRouteMatch[1] ?? ""));
        if (!isValidAppId(appId)) {
          sendJson(res, 400, { ok: false, error: "invalid_app_id" });
          return;
        }
        const accounts = store.getAccountsForUser(session.principal.userId);
        let cancelled = false;
        for (const account of accounts) {
          const sub = store.getAppSubscription(account.accountId, appId);
          if (sub && sub.status === "active") {
            store.updateAppSubscription(account.accountId, appId, {
              status: "cancelled",
              cancelledAtMs: Date.now(),
            });
            cancelled = true;
            break;
          }
        }
        if (!cancelled) {
          sendJson(res, 404, { ok: false, error: "subscription_not_found" });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          app_id: appId,
          status: "cancelled",
        });
        return;
      }

      if (method === "GET" && pathname === "/api/servers") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const allServers = store.getServersForUser(session.principal.userId);
        const servers = allServers.filter((s) => s.status !== "disabled");
        sendJson(res, 200, {
          ok: true,
          items: servers.map((server) => {
            const appInstalls = store.getServerEffectiveAppInstalls(server.serverId);
            return {
              server_id: server.serverId,
              display_name: server.displayName,
              generated_name: server.generatedName || deterministicServerNameFromId(server.serverId),
              account_id: server.accountId,
              status: server.status,
              tier: server.tier,
              app_count: appInstalls.length,
              installed_app_ids: appInstalls
                .filter((item) => item.status === "installed")
                .map((item) => item.appId),
            };
          }),
        });
        return;
      }

      if (method === "POST" && pathname === "/api/servers/select") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const selectBody =
          (await readJsonBody<{ server_id?: string }>(req)) ?? {};
        const selectServerId =
          typeof selectBody.server_id === "string"
            ? selectBody.server_id.trim()
            : "";
        if (!selectServerId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const userServers = store.getServersForUser(
          session.principal.userId,
        );
        const targetServer = userServers.find(
          (s) => s.serverId === selectServerId,
        );
        if (!targetServer) {
          sendJson(res, 404, {
            ok: false,
            error: "server_not_found",
          });
          return;
        }
        const selectPrincipal: Principal = {
          ...session.principal,
          tenantId: targetServer.serverId,
          accountId: targetServer.accountId,
        };
        sessions.updateSessionPrincipal(session.id, selectPrincipal);
        sendJson(res, 200, {
          ok: true,
          server_id: targetServer.serverId,
          display_name: targetServer.displayName,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/servers") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (!isServerCreatorAuthorized(session.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "server_creation_forbidden",
          });
          return;
        }
        const body =
          (await readJsonBody<{
            server_id?: string;
            display_name?: string;
            runtime_url?: string;
            runtime_public_base_url?: string;
            runtime_ws_url?: string;
            runtime_sse_url?: string;
            runtime_auth_token?: string;
            app_id?: string;
          }>(req)) ?? {};
        const displayName =
          typeof body.display_name === "string" && body.display_name.trim()
            ? body.display_name.trim()
            : "Server";
        const runtimeUrl = typeof body.runtime_url === "string" ? body.runtime_url.trim() : "";
        if (!runtimeUrl) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_runtime_url",
          });
          return;
        }
        const requestedServerId =
          typeof body.server_id === "string" && body.server_id.trim()
            ? body.server_id.trim()
            : undefined;
        try {
          // Get or create account for the user
          const accounts = store.getAccountsForUser(session.principal.userId);
          const accountId = session.principal.accountId || accounts[0]?.accountId;
          if (!accountId) {
            sendJson(res, 400, { ok: false, error: "no_account" });
            return;
          }
          const server = store.createServer({
            serverId: requestedServerId,
            accountId,
            displayName,
            generatedName: deterministicServerNameFromId(requestedServerId ?? displayName),
            runtimeUrl,
            runtimePublicBaseUrl:
              typeof body.runtime_public_base_url === "string"
                ? body.runtime_public_base_url.trim() || undefined
                : undefined,
            runtimeWsUrl:
              typeof body.runtime_ws_url === "string" ? body.runtime_ws_url.trim() : undefined,
            runtimeSseUrl:
              typeof body.runtime_sse_url === "string" ? body.runtime_sse_url.trim() : undefined,
            runtimeAuthToken:
              typeof body.runtime_auth_token === "string"
                ? body.runtime_auth_token.trim()
                : undefined,
          });
          config.tenants.set(server.serverId, serverToTenantConfig(server));
          const requestedAppId = normalizeAppId(body.app_id);
          if (requestedAppId && requestedAppId !== "control") {
            const appSub = store.getAppSubscription(accountId, requestedAppId);
            store.upsertServerAppInstall({
              serverId: server.serverId,
              appId: requestedAppId,
              status: appSub?.status === "active" ? "installed" : "blocked_no_entitlement",
              entryPath: defaultEntryPathForApp(requestedAppId),
              source: "manual",
            });
          }
          sendJson(res, 200, {
            ok: true,
            server: {
              server_id: server.serverId,
              display_name: server.displayName,
              generated_name: server.generatedName || deterministicServerNameFromId(server.serverId),
              account_id: server.accountId,
              status: server.status,
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

      const serverRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)$/);
      if (serverRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        if (method === "GET") {
          const context = resolveActiveServerContext({
            session,
            requestedServerId: serverId,
          });
          if (!context.ok) {
            sendJson(res, context.status, {
              ok: false,
              error: context.error,
            });
            return;
          }
          const installs = store.getServerEffectiveAppInstalls(serverId);
          sendJson(res, 200, {
            ok: true,
            server: {
              server_id: context.server.serverId,
              display_name: context.server.displayName,
              generated_name: context.server.generatedName || deterministicServerNameFromId(context.server.serverId),
              account_id: context.server.accountId,
              status: context.server.status,
              tier: context.server.tier,
              runtime_public_base_url: context.server.runtimePublicBaseUrl,
              installed_app_ids: installs
                .filter((item) => item.status === "installed")
                .map((item) => item.appId),
            },
          });
          return;
        }
        if (method === "DELETE") {
          const access = resolveServerAdminAccess({
            session,
            serverId,
          });
          if (!access.ok) {
            sendJson(res, access.status, {
              ok: false,
              error: access.error,
            });
            return;
          }
          store.updateServer(access.server.serverId, {
            status: "disabled",
          });
          config.tenants.delete(access.server.serverId);
          sendJson(res, 200, {
            ok: true,
            server_id: access.server.serverId,
            status: "disabled",
          });
          return;
        }
        if (method === "PATCH") {
          const access = resolveServerAdminAccess({
            session,
            serverId,
          });
          if (!access.ok) {
            sendJson(res, access.status, {
              ok: false,
              error: access.error,
            });
            return;
          }
          const patchBody =
            (await readJsonBody<{ display_name?: string }>(req)) ?? {};
          const newDisplayName =
            typeof patchBody.display_name === "string" && patchBody.display_name.trim()
              ? patchBody.display_name.trim()
              : null;
          if (!newDisplayName) {
            sendJson(res, 400, {
              ok: false,
              error: "missing_display_name",
            });
            return;
          }
          store.updateServer(access.server.serverId, {
            displayName: newDisplayName,
          });
          sendJson(res, 200, {
            ok: true,
            server_id: access.server.serverId,
            display_name: newDisplayName,
          });
          return;
        }
        sendJson(res, 405, {
          ok: false,
          error: "method_not_allowed",
        });
        return;
      }

      const serverAppInstallStatusRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/apps\/([^/]+)\/install-status$/,
      );
      if (method === "GET" && serverAppInstallStatusRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverAppInstallStatusRouteMatch[1] ?? "").trim();
        const appId = normalizeAppId(decodeURIComponent(serverAppInstallStatusRouteMatch[2] ?? ""));
        if (!serverId || !isValidAppId(appId)) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_install_status_request",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        const entitlement =
          appId === "control"
            ? { status: "active" as const }
            : (() => {
                const accountId = context.accountId;
                return accountId ? store.getAppSubscription(accountId, appId) : null;
              })();
        const install =
          store.getServerAppInstall(serverId, appId) ??
          store.getServerEffectiveAppInstalls(serverId).find((item) => item.appId === appId) ??
          null;
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          app_id: appId,
          entitlement_status: appId === "control" ? "active" : entitlement?.status ?? "inactive",
          install_status: install?.status ?? "not_installed",
          entry_path: install?.entryPath ?? defaultEntryPathForApp(appId),
          last_error: install?.lastError ?? null,
        });
        return;
      }

      const serverAppInstallRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/apps\/([^/]+)\/install$/);
      if (method === "POST" && serverAppInstallRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverAppInstallRouteMatch[1] ?? "").trim();
        const appId = normalizeAppId(decodeURIComponent(serverAppInstallRouteMatch[2] ?? ""));
        if (!serverId || !isValidAppId(appId)) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_install_request",
          });
          return;
        }
        if (appId === "control") {
          sendJson(res, 400, {
            ok: false,
            error: "system_app_install_not_allowed",
          });
          return;
        }
        const product = store.getProduct(appId);
        if (!product) {
          sendJson(res, 404, {
            ok: false,
            error: "app_not_found",
          });
          return;
        }
        const access = resolveServerAdminAccess({
          session,
          serverId,
        });
        if (!access.ok) {
          sendJson(res, access.status, {
            ok: false,
            error: access.error,
          });
          return;
        }
        const appSub = store.getAppSubscription(access.server.accountId, appId);
        if (!appSub || appSub.status !== "active") {
          store.upsertServerAppInstall({
            serverId,
            appId,
            status: "blocked_no_entitlement",
            entryPath: defaultEntryPathForApp(appId),
            source: "manual",
          });
          sendJson(res, 403, {
            ok: false,
            error: "app_entitlement_required",
            app_id: appId,
            server_id: serverId,
          });
          return;
        }
        const installed = await ensureRuntimeAppInstalled({
          session,
          appId,
          serverId,
          source: "manual",
          requestId,
        });
        if (!installed.ok) {
          sendJson(res, installed.status, {
            ok: false,
            error: installed.error,
            detail: installed.detail ?? null,
            app_id: appId,
            server_id: serverId,
          });
          return;
        }
        const install = store.getServerAppInstall(serverId, appId);
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          app_id: appId,
          install_status: install?.status ?? "installed",
          entry_path: install?.entryPath ?? defaultEntryPathForApp(appId),
        });
        return;
      }

      // App uninstall: DELETE /api/servers/:id/apps/:appId/install
      if (method === "DELETE" && serverAppInstallRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(serverAppInstallRouteMatch[1] ?? "").trim();
        const appId = normalizeAppId(decodeURIComponent(serverAppInstallRouteMatch[2] ?? ""));
        if (!serverId || !isValidAppId(appId)) {
          sendJson(res, 400, { ok: false, error: "invalid_uninstall_request" });
          return;
        }
        if (appId === "control") {
          sendJson(res, 400, { ok: false, error: "system_app_uninstall_not_allowed" });
          return;
        }
        const access = resolveServerAdminAccess({ session, serverId });
        if (!access.ok) {
          sendJson(res, access.status, { ok: false, error: access.error });
          return;
        }
        // Mark as uninstalling, then set to not_installed
        store.upsertServerAppInstall({
          serverId,
          appId,
          status: "not_installed",
          source: "manual",
        });
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          app_id: appId,
          install_status: "not_installed",
        });
        return;
      }

      const serverAppsRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/apps$/);
      if (method === "GET" && serverAppsRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverAppsRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        const runtimeApps = await probeRuntimeJsonEndpoint({
          runtime: context.serverRuntime,
          session: context.session,
          principal: context.principal,
          path: "/api/apps",
          requestId,
        });
        const runtimeAppsById = parseRuntimeAppCatalog(runtimeApps.body);

        // Build entitlements from account-level app subscriptions
        const entitlementsByApp = new Map<string, { status: string }>();
        if (context.accountId) {
          const subs = store.getAppSubscriptionsForAccount(context.accountId);
          for (const sub of subs) {
            entitlementsByApp.set(sub.appId, { status: sub.status });
          }
        }
        const installsByApp = new Map(
          store
            .getServerEffectiveAppInstalls(serverId)
            .map((item) => [item.appId, item] as const),
        );
        const products = store.listProducts();
        const productByAppId = new Map(products.map((item) => [item.productId, item]));

        const appIds = new Set<string>(["control"]);
        for (const product of products) {
          appIds.add(product.productId);
        }
        for (const appId of installsByApp.keys()) {
          appIds.add(appId);
        }
        for (const appId of runtimeAppsById.keys()) {
          appIds.add(appId);
        }

        const items = [...appIds]
          .sort((a, b) => a.localeCompare(b))
          .map((appId) => {
            const product = productByAppId.get(appId);
            const entitlement =
              appId === "control" ? { status: "active" as const } : entitlementsByApp.get(appId);
            const install = installsByApp.get(appId) ?? null;
            const runtimeItem = runtimeAppsById.get(appId) ?? null;
            const entitlementStatus = appId === "control" ? "active" : entitlement?.status ?? "inactive";
            const installStatus = install?.status ?? "not_installed";
            const blockedByEntitlement = appId !== "control" && entitlementStatus !== "active";
            const blockedByRuntimeUnavailable =
              appId !== "control" && installStatus === "installed" && runtimeApps.ok === false;
            const blockedByRuntimeMissing =
              appId !== "control" && installStatus === "installed" && runtimeApps.ok && !runtimeItem;
            const entryPath =
              runtimeItem?.entryPath || install?.entryPath || defaultEntryPathForApp(appId);
            const blockedReason = blockedByEntitlement
              ? "entitlement_required"
              : blockedByRuntimeUnavailable
                ? "runtime_unavailable"
                : blockedByRuntimeMissing
                  ? "runtime_app_missing"
                  : null;
            const launchable =
              !blockedReason && installStatus === "installed" && entryPath.startsWith("/app/");
            return {
              app_id: appId,
              display_name: product?.displayName ?? runtimeItem?.displayName ?? appId,
              product_id: product?.productId ?? null,
              entitlement_status: entitlementStatus,
              install_status: installStatus,
              entry_path: entryPath,
              launchable,
              blocked_reason: blockedReason,
              source: install?.source ?? null,
              kind: runtimeItem?.kind ?? null,
            };
          });
        sendJson(res, 200, {
          ok: true,
          server_id: serverId,
          items,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/entry/execute") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const body =
          (await readJsonBody<{
            app_id?: string;
            entry_source?: string;
            server_id?: string;
            create_new_server?: boolean;
          }>(req)) ?? {};
        const appId = normalizeAppId(body.app_id);
        const entrySource = readOptionalString(body.entry_source) ?? null;
        const requestedServerId = readOptionalString(body.server_id) ?? null;
        const createNewServer = body.create_new_server === true;
        if (!appId || !isValidAppId(appId)) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_app_id",
          });
          return;
        }
        const product = store.getProduct(appId);
        if (!product) {
          sendJson(res, 404, {
            ok: false,
            error: "app_not_found",
          });
          return;
        }
        const planResult = resolveEntryActionPlan({
          store: store,
          userId: session.principal.userId,
          appId,
          requestedServerId,
        });
        if (!planResult.ok) {
          sendJson(res, planResult.status, {
            ok: false,
            error: planResult.error,
          });
          return;
        }
        const requestedAction: EntryResolveAction = createNewServer
          ? "create_server_and_install"
          : planResult.plan.action;
        let actionTaken: EntryResolveAction = requestedAction;
        let activeSession = session;
        let targetServerId = planResult.plan.recommendedServerId;
        const installEntryPath = defaultEntryPathForApp(appId);

        if (requestedAction === "create_server_and_install") {
          const provisioned = await provisionServerAndInstallAppForSession({
            session: activeSession,
            appId,
            requestId,
          });
          if (!provisioned.ok) {
            sendJson(res, provisioned.status, {
              ok: false,
              error: provisioned.error,
              detail: provisioned.detail ?? null,
            });
            return;
          }
          activeSession = provisioned.session;
          targetServerId = provisioned.serverId;
        } else {
          if (requestedAction === "purchase_app_then_install") {
            // Create account-level app subscription
            const accounts = store.getAccountsForUser(activeSession.principal.userId);
            const purchaseAccountId = activeSession.principal.accountId || accounts[0]?.accountId;
            if (purchaseAccountId) {
              store.createAppSubscription({
                accountId: purchaseAccountId,
                appId,
                planId: "default",
                status: "active",
                provider: "manual",
              });
            }
          }
          if (requestedAction === "purchase_app_then_install" || requestedAction === "install_on_selected_server") {
            if (!targetServerId) {
              sendJson(res, 409, {
                ok: false,
                error: "server_selection_required",
              });
              return;
            }
            // Check entitlement via account-level app subscription
            const targetServer = store.getServer(targetServerId);
            const targetAccountId = targetServer?.accountId;
            const appSub = targetAccountId ? store.getAppSubscription(targetAccountId, appId) : null;
            if (!appSub || appSub.status !== "active") {
              store.upsertServerAppInstall({
                serverId: targetServerId,
                appId,
                status: "blocked_no_entitlement",
                entryPath: installEntryPath,
                source: "manual",
              });
              sendJson(res, 403, {
                ok: false,
                error: "app_entitlement_required",
                app_id: appId,
                server_id: targetServerId,
              });
              return;
            }
            const adminAccess = resolveServerAdminAccess({
              session: activeSession,
              serverId: targetServerId,
            });
            if (!adminAccess.ok) {
              sendJson(res, adminAccess.status, {
                ok: false,
                error: adminAccess.error,
                app_id: appId,
                server_id: targetServerId,
              });
              return;
            }
            const installed = await ensureRuntimeAppInstalled({
              session: activeSession,
              appId,
              serverId: targetServerId,
              source: requestedAction === "purchase_app_then_install" ? "purchase" : "manual",
              requestId,
            });
            if (!installed.ok) {
              sendJson(res, installed.status, {
                ok: false,
                error: installed.error,
                detail: installed.detail ?? null,
                app_id: appId,
                server_id: targetServerId,
              });
              return;
            }
          }
        }

        if (targetServerId && activeSession.principal.tenantId !== targetServerId) {
          const context = resolveActiveServerContext({
            session: activeSession,
            requestedServerId: targetServerId,
          });
          if (context.ok) {
            activeSession = context.session;
          }
        }

        const finalPlanResult = resolveEntryActionPlan({
          store: store,
          userId: activeSession.principal.userId,
          appId,
          requestedServerId: targetServerId ?? requestedServerId,
        });
        const finalPlan = finalPlanResult.ok
          ? finalPlanResult.plan
          : {
              ...planResult.plan,
              action: actionTaken,
            };
        const finalServerId = targetServerId || finalPlan.recommendedServerId || null;
        const finalInstall =
          finalServerId
            ? store.getServerAppInstall(finalServerId, appId) ??
              store
                .getServerEffectiveAppInstalls(finalServerId)
                .find((item: ServerAppInstallRecord) => item.appId === appId) ??
              null
            : null;
        const finalInstallStatus = finalInstall?.status ?? "not_installed";
        let runtimeProbeOk: boolean | null = null;
        let runtimeAppPresent: boolean | null = null;
        let runtimeAppKind: string | null = null;
        if (finalServerId && finalInstallStatus === "installed") {
          const finalContext = resolveActiveServerContext({
            session: activeSession,
            requestedServerId: finalServerId,
          });
          if (finalContext.ok) {
            const runtimeApps = await probeRuntimeJsonEndpoint({
              runtime: finalContext.serverRuntime,
              session: finalContext.session,
              principal: finalContext.principal,
              path: "/api/apps",
              requestId,
            });
            runtimeProbeOk = runtimeApps.ok;
            if (runtimeApps.ok) {
              const runtimeAppsById = parseRuntimeAppCatalog(runtimeApps.body);
              const runtimeItem = runtimeAppsById.get(appId) ?? null;
              runtimeAppPresent = Boolean(runtimeItem);
              runtimeAppKind = runtimeItem?.kind ?? null;
            } else {
              runtimeAppPresent = false;
            }
          }
        }
        const runtimeBlockedReason =
          appId === "control" || finalInstallStatus !== "installed"
            ? null
            : runtimeProbeOk === false
              ? "runtime_unavailable"
              : runtimeAppPresent === false
                ? "runtime_app_missing"
                : null;
        const launchReady =
          finalPlan.hasActiveEntitlement &&
          finalInstallStatus === "installed" &&
          installEntryPath.startsWith("/app/") &&
          !runtimeBlockedReason;
        const provisioningRecord = getLatestProvisionRequestForPrincipal({
          autoProvisioner,
          principal: activeSession.principal,
        });

        sendJson(res, 200, {
          ok: true,
          app_id: appId,
          entry_source: entrySource,
          create_new_server: createNewServer,
          action_requested: requestedAction,
          action_taken: actionTaken,
          has_active_entitlement: finalPlan.hasActiveEntitlement,
          server_count: finalPlan.serverCount,
          requested_server_id: requestedServerId,
          recommended_server_id: finalPlan.recommendedServerId,
          installed_server_ids: finalPlan.installedServerIds,
          server_id: finalServerId,
          install_status: finalInstallStatus,
          entry_path: installEntryPath,
          launch_ready: launchReady,
          blocked_reason: runtimeBlockedReason,
          runtime_probe_ok: runtimeProbeOk,
          runtime_app_present: runtimeAppPresent,
          runtime_app_kind: runtimeAppKind,
          provisioning: provisioningRecord
            ? {
                request_id: provisioningRecord.requestId,
                status: provisioningRecord.status,
                stage: provisioningRecord.stage ?? null,
                tenant_id: provisioningRecord.tenantId ?? null,
                updated_at_ms: provisioningRecord.updatedAtMs,
              }
            : null,
        });
        return;
      }

      if (method === "GET" && pathname === "/api/entry/resolve") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const appId = normalizeAppId(url.searchParams.get("app_id") ?? "");
        const entrySource = (url.searchParams.get("entry_source") ?? "").trim() || null;
        const requestedServerId = (url.searchParams.get("server_id") ?? "").trim() || null;
        if (!appId || !isValidAppId(appId)) {
          sendJson(res, 400, {
            ok: false,
            error: "invalid_app_id",
          });
          return;
        }
        const product = store.getProduct(appId);
        if (!product) {
          sendJson(res, 404, {
            ok: false,
            error: "app_not_found",
          });
          return;
        }
        const planResult = resolveEntryActionPlan({
          store: store,
          userId: session.principal.userId,
          appId,
          requestedServerId,
        });
        if (!planResult.ok) {
          sendJson(res, planResult.status, {
            ok: false,
            error: planResult.error,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          app_id: appId,
          entry_source: entrySource,
          action: planResult.plan.action,
          has_active_entitlement: planResult.plan.hasActiveEntitlement,
          server_count: planResult.plan.serverCount,
          requested_server_id: planResult.plan.requestedServerId,
          recommended_server_id: planResult.plan.recommendedServerId,
          installed_server_ids: planResult.plan.installedServerIds,
        });
        return;
      }

      const serverRuntimeTokenRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/runtime-auth-token$/,
      );
      if (serverRuntimeTokenRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverRuntimeTokenRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const access = resolveServerAdminAccess({
          session,
          serverId: serverId,
        });
        if (!access.ok) {
          sendJson(res, access.status, {
            ok: false,
            error: access.error,
          });
          return;
        }
        if (method === "DELETE") {
          store.updateServer(access.server.serverId, {
            runtimeAuthToken: "",
          });
          const updated = store.getServer(access.server.serverId) ?? access.server;
          config.tenants.set(updated.serverId, serverToTenantConfig(updated));
          sendJson(res, 200, {
            ok: true,
            server_id: updated.serverId,
            has_runtime_auth_token: false,
          });
          logFrontdoorEvent("server_runtime_auth_token_cleared", {
            request_id: requestId,
            user_id: session.principal.userId,
            server_id: updated.serverId,
          });
          return;
        }
        sendJson(res, 405, {
          ok: false,
          error: "method_not_allowed",
        });
        return;
      }

      const serverRuntimeTokenSetRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/runtime-auth-token\/set$/,
      );
      if (method === "POST" && serverRuntimeTokenSetRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverRuntimeTokenSetRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const access2 = resolveServerAdminAccess({
          session,
          serverId: serverId,
        });
        if (!access2.ok) {
          sendJson(res, access2.status, {
            ok: false,
            error: access2.error,
          });
          return;
        }
        const body = (await readJsonBody<{ token?: string }>(req)) ?? {};
        const token = typeof body.token === "string" ? body.token.trim() : "";
        if (!token) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_runtime_auth_token",
          });
          return;
        }
        store.updateServer(access2.server.serverId, {
          runtimeAuthToken: token,
        });
        const updated2 = store.getServer(access2.server.serverId) ?? access2.server;
        config.tenants.set(updated2.serverId, serverToTenantConfig(updated2));
        sendJson(res, 200, {
          ok: true,
          server_id: updated2.serverId,
          has_runtime_auth_token: true,
        });
        logFrontdoorEvent("server_runtime_auth_token_set", {
          request_id: requestId,
          user_id: session.principal.userId,
          server_id: updated2.serverId,
        });
        return;
      }

      const serverRuntimeTokenRotateRouteMatch = pathname.match(
        /^\/api\/servers\/([^/]+)\/runtime-auth-token\/rotate$/,
      );
      if (method === "POST" && serverRuntimeTokenRotateRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(serverRuntimeTokenRotateRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const access3 = resolveServerAdminAccess({
          session,
          serverId: serverId,
        });
        if (!access3.ok) {
          sendJson(res, access3.status, {
            ok: false,
            error: access3.error,
          });
          return;
        }
        const rotatedToken = randomToken(40);
        store.updateServer(access3.server.serverId, {
          runtimeAuthToken: rotatedToken,
        });
        const updated3 = store.getServer(access3.server.serverId) ?? access3.server;
        config.tenants.set(updated3.serverId, serverToTenantConfig(updated3));
        sendJson(res, 200, {
          ok: true,
          server_id: updated3.serverId,
          runtime_auth_token: rotatedToken,
        });
        logFrontdoorEvent("server_runtime_auth_token_rotated", {
          request_id: requestId,
          user_id: session.principal.userId,
          server_id: updated3.serverId,
        });
        return;
      }

      if (method === "GET" && pathname === "/api/operator/servers") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (!hasGlobalOperatorAccess(session.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "operator_forbidden",
          });
          return;
        }
        const items = store.listAllServers().map((server) => {
          const memberCount = store.countAccountMembers(server.accountId);
          const usage = store.getServerUsageSummary({
            serverId: server.serverId,
            windowDays: 30,
          });
          const subscription = store.getServerSubscription(server.serverId);
          return {
            server_id: server.serverId,
            display_name: server.displayName,
            account_id: server.accountId,
            status: server.status,
            tier: server.tier,
            runtime_public_base_url: server.runtimePublicBaseUrl,
            member_count: memberCount,
            usage_30d: {
              requests_total: usage.requestsTotal,
              tokens_in: usage.tokensIn,
              tokens_out: usage.tokensOut,
              active_members: usage.activeMembers,
            },
            subscription: subscription
              ? {
                  tier: subscription.tier,
                  status: subscription.status,
                  provider: subscription.provider,
                }
              : null,
          };
        });
        sendJson(res, 200, {
          ok: true,
          total_servers: items.length,
          items,
        });
        return;
      }

      const launchDiagnosticsRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/launch-diagnostics$/);
      if (method === "GET" && launchDiagnosticsRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(launchDiagnosticsRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        const [runtimeHealthInitial, runtimeApps] = await Promise.all([
          probeRuntimeJsonEndpoint({
            runtime: context.serverRuntime,
            session: context.session,
            principal: context.principal,
            path: "/health",
            requestId,
          }),
          probeRuntimeJsonEndpoint({
            runtime: context.serverRuntime,
            session: context.session,
            principal: context.principal,
            path: "/api/apps",
            requestId,
          }),
        ]);
        let runtimeHealth = runtimeHealthInitial;
        if (!runtimeHealth.ok && runtimeHealth.httpStatus === 404) {
          const runtimeStatus = await probeRuntimeJsonEndpoint({
            runtime: context.serverRuntime,
            session: context.session,
            principal: context.principal,
            path: "/status",
            requestId,
          });
          if (runtimeStatus.ok || runtimeStatus.httpStatus !== 404) {
            runtimeHealth = runtimeStatus;
          }
        }
        const appsBody = asRecord(runtimeApps.body);
        const appsListRaw = Array.isArray(appsBody?.items) ? appsBody.items : [];
        const launchableApps = appsListRaw
          .filter((item) => item && typeof item === "object" && !Array.isArray(item))
          .map((item) => {
            const record = item as Record<string, unknown>;
            return {
              app_id: readOptionalString(record.app_id) || "",
              display_name: readOptionalString(record.display_name) || readOptionalString(record.app_id) || "",
              entry_path: readOptionalString(record.entry_path) || "",
            };
          })
          .filter((item) => item.app_id && item.entry_path.startsWith("/app/"));
        const appCatalogPayloadError =
          runtimeApps.ok && !Array.isArray(appsBody?.items) ? "invalid_apps_payload" : undefined;
        const appCatalogOk = runtimeApps.ok && !appCatalogPayloadError;
        const runtimeHealthBody = asRecord(runtimeHealth.body);
        const runtimeHealthErrorCode =
          readOptionalString(runtimeHealthBody?.error) || runtimeHealth.error || "";
        const runtimeHealthLaunchCapable =
          runtimeHealth.ok || runtimeHealthErrorCode === "nex_runtime_unavailable";
        const launchReady = runtimeHealthLaunchCapable && appCatalogOk && launchableApps.length > 0;
        const provisioningRecord = getLatestProvisionRequestForPrincipal({
          autoProvisioner,
          principal: context.principal,
        });
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          launch_ready: launchReady,
          server: {
            server_id: context.server.serverId,
            display_name: context.server.displayName,
            status: context.server.status,
            runtime_url: context.serverRuntime.runtimeUrl,
            runtime_public_base_url: context.serverRuntime.runtimePublicBaseUrl,
            has_runtime_auth_token: Boolean(context.serverRuntime.runtimeAuthToken?.trim()),
          },
          provisioning: provisioningRecord
            ? {
                request_id: provisioningRecord.requestId,
                status: provisioningRecord.status,
                stage: provisioningRecord.stage ?? null,
                error: provisioningRecord.errorText ?? null,
                tenant_id: provisioningRecord.tenantId ?? null,
                updated_at_ms: provisioningRecord.updatedAtMs,
              }
            : null,
          runtime_health: {
            ok: runtimeHealth.ok,
            http_status: runtimeHealth.httpStatus || null,
            error: runtimeHealth.error ?? null,
            body: runtimeHealth.body,
          },
          app_catalog: {
            ok: appCatalogOk,
            http_status: runtimeApps.httpStatus || null,
            error: appCatalogPayloadError ?? runtimeApps.error ?? null,
            app_count: launchableApps.length,
            items: launchableApps,
          },
        });
        return;
      }

      const usageRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/usage$/);
      if (method === "GET" && usageRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(usageRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        const usage = store.getServerUsageSummary({
          serverId: context.server.serverId,
          windowDays: 30,
        });
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          window_days: usage.windowDays,
          requests_total: usage.requestsTotal,
          tokens_in: usage.tokensIn,
          tokens_out: usage.tokensOut,
          active_members: usage.activeMembers,
          days_with_data: usage.daysWithData,
        });
        return;
      }

      const billingCheckoutRouteMatch = pathname.match(/^\/api\/billing\/([^/]+)\/checkout-session$/);
      if (method === "POST" && billingCheckoutRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(billingCheckoutRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        if (!hasAccountAdminRole(context.server.accountId, context.principal.userId) && !hasGlobalOperatorAccess(context.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "billing_forbidden",
          });
          return;
        }
        const body =
          (await readJsonBody<{
            plan_id?: string;
            product_id?: string;
            price_id?: string;
            success_url?: string;
            cancel_url?: string;
          }>(req)) ?? {};
        try {
          const checkoutProductId =
            (typeof body.product_id === "string" ? body.product_id.trim() : "") ||
            undefined;
          const created = await createCheckoutSession({
            config,
            workspaceId: context.server.serverId,
            planId: typeof body.plan_id === "string" ? body.plan_id : undefined,
            productId: checkoutProductId,
            priceId: typeof body.price_id === "string" ? body.price_id : undefined,
            successUrl: typeof body.success_url === "string" ? body.success_url : undefined,
            cancelUrl: typeof body.cancel_url === "string" ? body.cancel_url : undefined,
            customerEmail: context.principal.email,
          });
          sendJson(res, 200, {
            ok: true,
            server_id: context.server.serverId,
            provider: created.provider,
            session_id: created.sessionId,
            checkout_url: created.checkoutUrl,
            expires_at_ms: created.expiresAtMs ?? null,
          });
          logFrontdoorEvent("billing_checkout_session_created", {
            request_id: requestId,
            user_id: context.principal.userId,
            server_id: context.server.serverId,
            provider: created.provider,
            session_id: created.sessionId,
          });
        } catch (error) {
          const message = String(error);
          const status = message.includes("billing_unconfigured") ? 503 : 400;
          sendJson(res, status, {
            ok: false,
            error: message,
          });
        }
        return;
      }

      const billingSubscriptionRouteMatch = pathname.match(/^\/api\/billing\/([^/]+)\/subscription$/);
      if (method === "GET" && billingSubscriptionRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(billingSubscriptionRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        if (!hasAccountAdminRole(context.server.accountId, context.principal.userId) && !hasGlobalOperatorAccess(context.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "billing_forbidden",
          });
          return;
        }
        const subscription = store.getServerSubscription(context.server.serverId);
        const limits = store.getServerLimitsSummary(context.server.serverId);
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          provider: subscription?.provider ?? "none",
          tier: subscription?.tier ?? "free",
          status: subscription?.status ?? "none",
          customer_id: subscription?.customerId ?? null,
          subscription_id: subscription?.subscriptionId ?? null,
          period_start_ms: subscription?.periodStartMs ?? null,
          period_end_ms: subscription?.periodEndMs ?? null,
          limits: {
            max_members: limits.maxMembers,
            max_monthly_tokens: limits.maxMonthlyTokens,
            max_adapters: limits.maxAdapters,
            max_concurrent_sessions: limits.maxConcurrentSessions,
          },
        });
        return;
      }

      const billingInvoicesRouteMatch = pathname.match(/^\/api\/billing\/([^/]+)\/invoices$/);
      if (method === "GET" && billingInvoicesRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(billingInvoicesRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
          });
          return;
        }
        if (!hasAccountAdminRole(context.server.accountId, context.principal.userId) && !hasGlobalOperatorAccess(context.principal)) {
          sendJson(res, 403, {
            ok: false,
            error: "billing_forbidden",
          });
          return;
        }
        const invoices = store.listAccountInvoices({
          accountId: context.accountId,
          limit: 50,
        });
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          account_id: context.accountId,
          items: invoices.map((item: AccountInvoiceSummary) => ({
            invoice_id: item.invoiceId,
            provider: item.provider,
            status: item.status,
            amount_due: item.amountDue,
            currency: item.currency,
            hosted_invoice_url: item.hostedInvoiceUrl ?? null,
            period_start_ms: item.periodStartMs ?? null,
            period_end_ms: item.periodEndMs ?? null,
            created_at_ms: item.createdAtMs,
            paid_at_ms: item.paidAtMs ?? null,
          })),
        });
        return;
      }

      // ── Billing Entitlements + Plan ─────────────────────────────────
      const billingEntitlementsRouteMatch = pathname.match(/^\/api\/billing\/([^/]+)\/entitlements$/);
      if (method === "GET" && billingEntitlementsRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(billingEntitlementsRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, { ok: false, error: "missing_server_id" });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, { ok: false, error: context.error });
          return;
        }
        // Resolve entitlements at account level using the first app subscription
        const accountId = context.accountId;
        const appSubs = store.getAppSubscriptionsForAccount(accountId);
        const firstAppSub = appSubs.length > 0 ? appSubs[0] : null;
        const resolved = firstAppSub
          ? store.resolveAccountEntitlements(accountId, firstAppSub.appId)
          : null;
        if (!resolved) {
          sendJson(res, 200, {
            ok: true,
            server_id: context.server.serverId,
            account_id: accountId,
            plan_id: null,
            entitlements: {},
            usage: {},
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          account_id: accountId,
          plan_id: resolved.planId,
          entitlements: resolved.entitlements,
          usage: resolved.usage,
        });
        return;
      }

      const billingPlanRouteMatch = pathname.match(/^\/api\/billing\/([^/]+)\/plan$/);
      if (method === "GET" && billingPlanRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, { ok: false, error: "unauthorized" });
          return;
        }
        const serverId = decodeURIComponent(billingPlanRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, { ok: false, error: "missing_server_id" });
          return;
        }
        const context = resolveActiveServerContext({
          session,
          requestedServerId: serverId,
        });
        if (!context.ok) {
          sendJson(res, context.status, { ok: false, error: context.error });
          return;
        }
        const subscription = store.getServerSubscription(context.server.serverId);
        const planId = subscription?.tier ?? "free";
        const plan = store.getProductPlan(planId);
        // Resolve product from first app subscription
        const planAccountId = context.accountId;
        const planAppSubs = store.getAppSubscriptionsForAccount(planAccountId);
        const firstPlanAppSub = planAppSubs.length > 0 ? planAppSubs[0] : null;
        const product = firstPlanAppSub ? store.getProduct(firstPlanAppSub.appId) : null;
        sendJson(res, 200, {
          ok: true,
          server_id: context.server.serverId,
          account_id: planAccountId,
          plan_id: planId,
          plan_display_name: plan?.displayName ?? planId,
          plan_description: plan?.description ?? null,
          price_monthly: plan?.priceMonthly ?? 0,
          price_yearly: plan?.priceYearly ?? null,
          features: plan?.featuresJson ? JSON.parse(plan.featuresJson) : [],
          billing_status: subscription?.status ?? "none",
          period_start_ms: subscription?.periodStartMs ?? null,
          period_end_ms: subscription?.periodEndMs ?? null,
          product: product
            ? {
                display_name: product.displayName,
                accent_color: product.accentColor ?? null,
                tagline: product.tagline ?? null,
              }
            : null,
        });
        return;
      }

      if (method === "POST" && pathname === "/api/billing/webhook") {
        if (config.billing.provider === "none") {
          sendJson(res, 404, {
            ok: false,
            error: "billing_unconfigured",
          });
          return;
        }
        const rawBody = await readRawBody(req);
        let event: BillingWebhookEvent;
        try {
          event = verifyWebhookAndParseEvent({
            config,
            headers: req.headers,
            rawBody,
          });
        } catch (error) {
          sendJson(res, 400, {
            ok: false,
            error: String(error),
          });
          return;
        }
        const inserted = store.recordBillingEvent({
          provider: event.provider,
          eventId: event.eventId,
          accountId: event.workspaceId,
          eventType: event.eventType,
          payloadJson: JSON.stringify(event.payload),
          status: "received",
        });
        if (!inserted) {
          sendJson(res, 200, {
            ok: true,
            duplicate: true,
            event_id: event.eventId,
          });
          return;
        }
        try {
          const processed = processBillingWebhookEvent(event);
          store.markBillingEventProcessed({
            provider: event.provider,
            eventId: event.eventId,
            status: processed.status,
          });
          sendJson(res, 200, {
            ok: true,
            event_id: event.eventId,
            event_type: event.eventType,
            status: processed.status,
            server_id: processed.serverId ?? null,
          });
          logFrontdoorEvent("billing_webhook_processed", {
            request_id: requestId,
            provider: event.provider,
            event_id: event.eventId,
            event_type: event.eventType,
            status: processed.status,
            server_id: processed.serverId ?? null,
          });
        } catch (error) {
          store.markBillingEventProcessed({
            provider: event.provider,
            eventId: event.eventId,
            status: "error",
            errorText: String(error),
          });
          sendJson(res, 500, {
            ok: false,
            error: String(error),
          });
        }
        return;
      }

      if (method === "GET" && pathname === "/api/servers/provisioning/status") {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        if (!autoProvisioner) {
          sendJson(res, 200, {
            ok: true,
            status: "disabled",
            request: null,
          });
          return;
        }
        const requestId = (url.searchParams.get("request_id") ?? "").trim();
        const record = requestId
          ? autoProvisioner.getProvisionRequest(requestId)
          : getLatestProvisionRequestForPrincipal({
              autoProvisioner,
              principal: session.principal,
            });
        if (!record) {
          sendJson(res, 200, {
            ok: true,
            status: "none",
            request: null,
          });
          return;
        }
        if (
          !provisionRequestOwnedByPrincipal({
            record,
            principal: session.principal,
          })
        ) {
          sendJson(res, 404, {
            ok: false,
            error: "request_not_found",
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          status: record.status,
          request: {
            request_id: record.requestId,
            user_id: record.userId,
            provider: record.provider,
            subject: record.subject,
            tenant_id: record.tenantId ?? null,
            status: record.status,
            stage: record.stage ?? null,
            error: record.errorText ?? null,
            created_at_ms: record.createdAtMs,
            updated_at_ms: record.updatedAtMs,
            completed_at_ms: record.completedAtMs ?? null,
          },
        });
        return;
      }

      const inviteRevokeRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/invites\/([^/]+)$/);
      if (method === "DELETE" && inviteRevokeRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(inviteRevokeRouteMatch[1] ?? "").trim();
        const inviteId = decodeURIComponent(inviteRevokeRouteMatch[2] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        if (!inviteId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_invite_id",
          });
          return;
        }
        const access = resolveServerAdminAccess({
          session,
          serverId: serverId,
        });
        if (!access.ok) {
          sendJson(res, access.status, {
            ok: false,
            error: access.error,
          });
          return;
        }
        const revoked = store.revokeInvite(inviteId);
        sendJson(res, revoked ? 200 : 404, {
          ok: revoked,
          server_id: access.server.serverId,
          invite_id: inviteId,
        });
        logFrontdoorEvent("server_invite_revoked", {
          request_id: requestId,
          user_id: session.principal.userId,
          server_id: access.server.serverId,
          invite_id: inviteId,
          revoked,
        });
        return;
      }

      const inviteRouteMatch = pathname.match(/^\/api\/servers\/([^/]+)\/invites$/);
      if (inviteRouteMatch) {
        const session = readSession({ req, config, sessions });
        if (!session) {
          sendJson(res, 401, {
            ok: false,
            error: "unauthorized",
          });
          return;
        }
        const serverId = decodeURIComponent(inviteRouteMatch[1] ?? "").trim();
        if (!serverId) {
          sendJson(res, 400, {
            ok: false,
            error: "missing_server_id",
          });
          return;
        }
        const access = resolveServerAdminAccess({
          session,
          serverId: serverId,
        });
        if (!access.ok) {
          sendJson(res, access.status, {
            ok: false,
            error: access.error,
          });
          return;
        }
        if (method === "GET") {
          // Invites are now at account level
          sendJson(res, 200, {
            ok: true,
            items: store.listInvites(access.server.accountId).map((item) => ({
              invite_id: item.inviteId,
              account_id: item.accountId,
              server_id: access.server.serverId,
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
          const role = typeof body.role === "string" && body.role.trim() ? body.role.trim() : "member";
          const scopes = Array.isArray(body.scopes)
            ? body.scopes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : [];
          const expiresInSeconds =
            typeof body.expires_in_seconds === "number" && Number.isFinite(body.expires_in_seconds)
              ? Math.max(60, Math.floor(body.expires_in_seconds))
              : config.inviteTtlSeconds ?? 604800;
          // Check member limits at account level
          const accountId = access.server.accountId;
          const appSubs = store.getAppSubscriptionsForAccount(accountId);
          const firstAppSub = appSubs.length > 0 ? appSubs[0] : null;
          const resolved = firstAppSub
            ? store.resolveAccountEntitlements(accountId, firstAppSub.appId)
            : null;
          const maxMembers = parseEntitlementCountLimit(resolved?.entitlements["members.max_count"]);
          if (maxMembers !== null) {
            const currentMembers = store.countAccountMembers(accountId);
            if (currentMembers >= maxMembers) {
              sendJson(res, 403, {
                ok: false,
                error: "members_limit_reached",
                server_id: serverId,
                account_id: accountId,
                current_members: currentMembers,
                max_members: maxMembers,
              });
              return;
            }
          }
          try {
            const invite = store.createInvite({
              accountId,
              createdByUserId: session.principal.userId,
              role,
              scopes,
              expiresInSeconds,
            });
            sendJson(res, 200, {
              ok: true,
              invite_id: invite.inviteId,
              invite_token: invite.inviteToken,
              account_id: invite.accountId,
              server_id: access.server.serverId,
              role: invite.role,
              scopes: invite.scopes,
              expires_at_ms: invite.expiresAtMs,
            });
            logFrontdoorEvent("server_invite_created", {
              request_id: requestId,
              user_id: session.principal.userId,
              server_id: serverId,
              invite_id: invite.inviteId,
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
          const redeemed = store.redeemInvite({
            token,
            userId: session.principal.userId,
          });
          // Get user's servers to find the first server in the redeemed account
          const accountServers = store.getServersForUser(session.principal.userId)
            .filter((s) => s.accountId === redeemed.accountId);
          const defaultServer = accountServers.length > 0 ? accountServers[0] : null;
          const user = store.getUserById(session.principal.userId);
          if (user) {
            const principal = store.toPrincipal({
              user,
              server: defaultServer,
              accountId: redeemed.accountId,
              amr: session.principal.amr,
            });
            sessions.updateSessionPrincipal(session.id, principal);
          }
          sendJson(res, 200, {
            ok: true,
            account_id: redeemed.accountId,
            role: redeemed.invite.role,
          });
          logFrontdoorEvent("server_invite_redeemed", {
            request_id: requestId,
            user_id: session.principal.userId,
            account_id: redeemed.accountId,
            invite_id: redeemed.invite.inviteId,
          });
        } catch (error) {
          const message = String(error);
          const status = message.includes("members_limit_reached") ? 403 : 400;
          sendJson(res, status, {
            ok: false,
            error: message,
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
        const oidcProductId = url.searchParams.get("product") ?? url.searchParams.get("flavor") ?? undefined;
        try {
          const started = oidc.begin({
            config,
            provider,
            returnTo: url.searchParams.get("return_to") ?? undefined,
            productId: oidcProductId,
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
          // Phase 1 — resolve identity WITHOUT blocking on provisioning.
          // For existing users with a tenant this is instant.  For brand-new
          // users we still call resolveOrProvision so account+tenant records
          // are created, BUT only if the user already has a known tenant.
          // If provisioning is required we defer it to a background task.
          const completed = await oidc.complete({
            config,
            provider,
            state,
            code,
            resolvePrincipal: async ({ provider: oidcProvider, claims, fallbackPrincipal, productId }) => {
              if (!autoProvisioner) {
                return fallbackPrincipal;
              }
              // Quick path: check if this user already has a provisioned tenant
              const existingAccount = autoProvisioner.getOidcAccount({
                provider: oidcProvider,
                subject: claims.sub ?? "",
              });
              if (existingAccount?.tenantId) {
                // Existing user — resolve instantly (no provisioning needed)
                return await autoProvisioner.resolveOrProvision({
                  provider: oidcProvider,
                  claims,
                  fallbackPrincipal,
                  productId,
                });
              }
              // New user — return a principal built from OIDC claims (no tenant yet).
              // Provisioning will run in the background after redirect.
              if (fallbackPrincipal) return fallbackPrincipal;
              const sub = (claims.sub ?? "").trim();
              return {
                userId: `oidc:${oidcProvider}:${sub}`,
                entityId: `entity:${oidcProvider}:${sub}`,
                displayName: claims.name,
                email: claims.email,
                roles: config.autoProvision?.defaultRoles?.length
                  ? [...config.autoProvision.defaultRoles]
                  : ["operator"],
                scopes: config.autoProvision?.defaultScopes?.length
                  ? [...config.autoProvision.defaultScopes]
                  : ["operator.admin"],
                amr: ["oidc"],
              } as Principal;
            },
          });

          // If the principal already has a tenant (existing user), wire up
          // server records synchronously — this is instant.
          if (completed.principal?.tenantId) {
            const tenant = config.tenants.get(completed.principal.tenantId);
            if (tenant) {
              const existingServer = store.getServer(completed.principal.tenantId);
              if (!existingServer) {
                const oidcUserPre = store.resolveOrCreateOidcUser({
                  provider,
                  subject: completed.claims.sub ?? "",
                  email: completed.claims.email,
                  displayName: completed.claims.name,
                  fallbackPrincipal: completed.principal,
                });
                const accounts = store.getAccountsForUser(oidcUserPre.userId);
                const accountId = completed.principal.accountId || accounts[0]?.accountId;
                if (accountId) {
                  store.createServer({
                    serverId: tenant.id,
                    accountId,
                    displayName: tenant.id,
                    generatedName: deterministicServerNameFromId(tenant.id),
                    runtimeUrl: tenant.runtimeUrl,
                    runtimePublicBaseUrl: tenant.runtimePublicBaseUrl,
                    runtimeWsUrl: tenant.runtimeWsUrl,
                    runtimeSseUrl: tenant.runtimeSseUrl,
                    runtimeAuthToken: tenant.runtimeAuthToken,
                  });
                  store.updateServer(tenant.id, { status: "ready" });
                  const intentAppId = completed.productId?.trim().toLowerCase();
                  if (intentAppId) {
                    try {
                      store.createAppSubscription({
                        accountId,
                        appId: intentAppId,
                        planId: "default",
                        status: "active",
                        provider: "oidc_auto",
                      });
                    } catch {
                      // Subscription may already exist
                    }
                  }
                }
              }
            }
          }

          // Create user + session immediately.
          const oidcUser = store.resolveOrCreateOidcUser({
            provider,
            subject: completed.claims.sub ?? "",
            email: completed.claims.email,
            displayName: completed.claims.name,
            fallbackPrincipal: completed.principal,
          });
          const oidcServers = store.getServersForUser(oidcUser.userId);
          let oidcServer: ServerRecord | null = null;
          let oidcAccountId: string | undefined;
          if (completed.principal?.tenantId) {
            oidcServer = oidcServers.find((s) => s.serverId === completed.principal!.tenantId) ?? null;
          }
          if (!oidcServer && oidcServers.length > 0) {
            oidcServer = oidcServers[0];
          }
          const oidcAccounts = store.getAccountsForUser(oidcUser.userId);
          oidcAccountId = oidcServer?.accountId || oidcAccounts[0]?.accountId;
          const principal = store.toPrincipal({
            user: oidcUser,
            server: oidcServer,
            accountId: oidcAccountId,
            amr: ["oidc"],
          });
          const session = sessions.createSession(principal);
          setCookie({
            res,
            name: config.sessionCookieName,
            value: session.id,
            domain: config.sessionCookieDomain,
            maxAgeSeconds: config.sessionTtlSeconds,
            secure: cookieSecure,
          });

          // Determine where to redirect.
          // If the user already has a server + the intent app, go straight to the app.
          // Otherwise redirect to the dashboard — provisioning will continue in background.
          const hasTenant = !!completed.principal?.tenantId;
          const needsProvision = !hasTenant && !!autoProvisioner && !!completed.productId;
          let oidcRedirect = completed.returnTo || "/";
          if (hasTenant && oidcRedirect === "/" && completed.productId) {
            oidcRedirect = `/app/${completed.productId}/`;
          }
          // For users that need provisioning, always land on the dashboard
          // so they can see the provisioning progress.
          if (needsProvision && completed.productId) {
            oidcRedirect = `/?product=${encodeURIComponent(completed.productId)}&provisioning=1`;
          } else if (needsProvision) {
            oidcRedirect = "/?provisioning=1";
          }
          res.statusCode = 302;
          res.setHeader("location", oidcRedirect);
          res.end();

          // Phase 2 — background provisioning for new users.
          // The user has already been redirected to the dashboard.
          if (needsProvision && autoProvisioner) {
            void (async () => {
              const bgRequestId = requestId ?? randomToken(10);
              try {
                const provisionedPrincipal = await autoProvisioner.resolveOrProvision({
                  provider,
                  claims: completed.claims,
                  fallbackPrincipal: completed.principal,
                  productId: completed.productId,
                });
                if (!provisionedPrincipal?.tenantId) {
                  return;
                }
                // Create server record
                const tenant = config.tenants.get(provisionedPrincipal.tenantId);
                if (tenant) {
                  const existingServer = store.getServer(provisionedPrincipal.tenantId);
                  if (!existingServer) {
                    const accounts = store.getAccountsForUser(oidcUser.userId);
                    const accountId = provisionedPrincipal.accountId || accounts[0]?.accountId;
                    if (accountId) {
                      store.createServer({
                        serverId: tenant.id,
                        accountId,
                        displayName: tenant.id,
                        generatedName: deterministicServerNameFromId(tenant.id),
                        runtimeUrl: tenant.runtimeUrl,
                        runtimePublicBaseUrl: tenant.runtimePublicBaseUrl,
                        runtimeWsUrl: tenant.runtimeWsUrl,
                        runtimeSseUrl: tenant.runtimeSseUrl,
                        runtimeAuthToken: tenant.runtimeAuthToken,
                      });
                      store.updateServer(tenant.id, { status: "ready" });
                      // Auto-grant subscriptions for ALL configured apps (not just intent)
                      const configuredApps = autoProvisioner!.lastConfiguredApps;
                      const intentAppId = completed.productId?.trim().toLowerCase();
                      // Build de-duplicated list: configured apps + intent app
                      const allApps = new Set(configuredApps);
                      if (intentAppId) allApps.add(intentAppId);
                      for (const appId of allApps) {
                        try {
                          store.createAppSubscription({
                            accountId,
                            appId,
                            planId: "default",
                            status: "active",
                            provider: "oidc_auto",
                          });
                        } catch {
                          // Subscription may already exist
                        }
                      }
                    }
                  }
                }
                // Update the session principal with the new tenant
                const updatedPrincipal: Principal = {
                  ...session.principal,
                  tenantId: provisionedPrincipal.tenantId,
                  accountId: provisionedPrincipal.accountId || session.principal.accountId,
                };
                sessions.updateSessionPrincipal(session.id, updatedPrincipal);
                // Auto-install ALL configured apps on the new server
                if (provisionedPrincipal.tenantId) {
                  const configuredApps = autoProvisioner!.lastConfiguredApps;
                  const intentAppId = completed.productId?.trim().toLowerCase();
                  const allApps = new Set(configuredApps);
                  if (intentAppId) allApps.add(intentAppId);
                  const autoServerId = provisionedPrincipal.tenantId;
                  // Re-read session after principal update
                  const updatedSession = sessions.getSession(session.id);
                  if (updatedSession) {
                    for (const appId of allApps) {
                      try {
                        await ensureRuntimeAppInstalled({
                          session: updatedSession,
                          appId,
                          serverId: autoServerId,
                          source: "purchase",
                          requestId: bgRequestId,
                        });
                      } catch {
                        // Best-effort auto-install
                      }
                    }
                  }
                }
              } catch (bgError) {
                console.error(
                  `[oidc] background provisioning failed: ${String(bgError)}`,
                );
              }
            })();
          }
          // For existing users with servers, auto-install intent app synchronously
          // (already have a server, this is fast)
          if (hasTenant && completed.productId && completed.principal?.tenantId) {
            const autoAppId = completed.productId.trim().toLowerCase();
            const autoServerId = completed.principal.tenantId;
            try {
              await ensureRuntimeAppInstalled({
                session,
                appId: autoAppId,
                serverId: autoServerId,
                source: "purchase",
                requestId: requestId ?? randomToken(10),
              });
            } catch {
              // Best-effort auto-install
            }
          }
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
        const body = (await readJsonBody<{ client_id?: string; server_id?: string }>(req)) ?? {};
        const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
        const requestedServerId =
          (typeof body.server_id === "string" ? body.server_id.trim() : "") ||
          undefined;
        const context = resolveActiveServerContext({
          session,
          requestedServerId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            server_count: context.serverCount,
          });
          return;
        }
        const refreshToken = sessions.issueRefreshToken(context.session.id);
        const tenant = context.serverRuntime;
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
        logFrontdoorEvent("runtime_token_issued", {
          request_id: requestId,
          user_id: context.principal.userId,
          server_id: context.server.serverId,
          audience: "control-plane",
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
          server_id?: string;
        }>(req)) ?? {};
        const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
        const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
        const requestedServerId =
          (typeof body.server_id === "string" ? body.server_id.trim() : "") ||
          undefined;
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
        const context = resolveActiveServerContext({
          session: rotated.session,
          requestedServerId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            server_count: context.serverCount,
          });
          return;
        }
        const tenant = context.serverRuntime;
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
        logFrontdoorEvent("runtime_token_refreshed", {
          request_id: requestId,
          user_id: context.principal.userId,
          server_id: context.server.serverId,
          audience: "control-plane",
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
        logFrontdoorEvent("runtime_token_revoked", {
          request_id: requestId,
          revoked,
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

      if (pathname.startsWith("/auth/")) {
        if (method !== "GET") {
          sendJson(res, 405, {
            ok: false,
            error: "method_not_allowed",
          });
          return;
        }
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
        const requestedServerId = (url.searchParams.get("server_id") ?? url.searchParams.get("workspace_id") ?? "").trim() || undefined;
        const context = resolveActiveServerContext({
          session,
          requestedServerId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            server_count: context.serverCount,
          });
          return;
        }
        proxyRuntimeRequest({
          req,
          res,
          url,
          session: context.session,
          principal: context.principal,
          runtime: context.serverRuntime,
          route: "app",
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
        const requestedServerId = (url.searchParams.get("server_id") ?? url.searchParams.get("workspace_id") ?? "").trim() || undefined;
        const context = resolveActiveServerContext({
          session,
          requestedServerId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            server_count: context.serverCount,
          });
          return;
        }
        if (isAppRoute && isAppDocumentRequest(req, pathname)) {
          await proxyRuntimeDocumentWithAppFrame({
            req,
            res,
            url,
            session: context.session,
            principal: context.principal,
            runtime: context.serverRuntime,
            serverId: context.server.serverId,
            server: context.server,
            accountId: context.accountId,
          });
          return;
        }
        proxyRuntimeRequest({
          req,
          res,
          url,
          session: context.session,
          principal: context.principal,
          runtime: context.serverRuntime,
          route: isRuntimeRoute ? "runtime" : "app",
        });
        return;
      }

      if (pathname.startsWith("/_next/")) {
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
        const requestedServerId = (url.searchParams.get("server_id") ?? url.searchParams.get("workspace_id") ?? "").trim() || undefined;
        const context = resolveActiveServerContext({
          session,
          requestedServerId,
        });
        if (!context.ok) {
          sendJson(res, context.status, {
            ok: false,
            error: context.error,
            server_count: context.serverCount,
          });
          return;
        }
        const appIdFromReferer = parseAppIdFromRefererPath({
          req,
          baseUrl: config.baseUrl,
        });
        if (!appIdFromReferer) {
          sendJson(res, 404, {
            ok: false,
            error: "app_asset_context_missing",
          });
          return;
        }
        const appAssetUrl = new URL(url.toString());
        appAssetUrl.pathname = `/app/${encodeURIComponent(appIdFromReferer)}${pathname}`;
        proxyRuntimeRequest({
          req,
          res,
          url: appAssetUrl,
          session: context.session,
          principal: context.principal,
          runtime: context.serverRuntime,
          route: "app",
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
    if (!isSameOriginBrowserMutation(req, config.baseUrl)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
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
      const requestedServerId =
        (url.searchParams.get("server_id") ?? url.searchParams.get("workspace_id") ?? "").trim() || undefined;
      const context = resolveActiveServerContext({
        session,
        requestedServerId,
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
      const targetOrigin = resolveTargetOrigin(context.serverRuntime.runtimeUrl);
      const upstreamBearer = resolveRuntimeUpstreamBearerToken({
        config,
        principal: context.principal,
        session: context.session,
        runtime: context.serverRuntime,
      });
      req.headers.authorization = `Bearer ${upstreamBearer}`;
      req.headers["x-nexus-frontdoor-tenant"] = context.serverRuntime.id;
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
        target: context.serverRuntime.runtimeUrl,
      });
    } catch {
      socket.write("HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\n\r\n");
      socket.destroy();
    }
  });

  server.on("close", () => {
    sessions.close();
    store.close();
    autoProvisioner?.close();
  });

  return { server, config };
}
