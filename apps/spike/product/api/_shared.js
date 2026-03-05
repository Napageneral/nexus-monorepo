"use strict";

const crypto = require("crypto");

const SESSION_COOKIE_NAME = "spike_web_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function toBase64Url(input) {
  return Buffer.from(String(input || ""), "utf8").toString("base64url");
}

function fromBase64Url(input) {
  return Buffer.from(String(input || ""), "base64url").toString("utf8");
}

function randomID(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function envConfig() {
  const appSessionSecret = String(process.env.APP_SESSION_SECRET || "").trim();

  const defaultSpikeOrigin = trimTrailingSlash(process.env.SPIKE_API_ORIGIN || "");
  const defaultSpikeToken = String(process.env.SPIKE_API_TOKEN || "").trim();
  const defaultTreeID = String(process.env.SPIKE_DEFAULT_TREE_ID || "oracle-deep").trim() || "oracle-deep";

  const defaultTenantID = String(process.env.SPIKE_DEFAULT_TENANT_ID || "tenant-default").trim() || "tenant-default";
  const defaultTenantName = String(process.env.SPIKE_DEFAULT_TENANT_NAME || "Default Workspace").trim() || "Default Workspace";

  const googleClientID = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const googleClientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();

  const magicLinkSecret = String(process.env.MAGIC_LINK_SIGNING_SECRET || appSessionSecret || "").trim();
  const magicLinkTTLSeconds = Number(process.env.MAGIC_LINK_TTL_SECONDS || 15 * 60);
  const magicFromEmail = String(process.env.MAGIC_LINK_FROM_EMAIL || "").trim();
  const magicResendAPIKey = String(process.env.MAGIC_LINK_RESEND_API_KEY || "").trim();
  const magicAllowInsecurePreview = String(process.env.MAGIC_LINK_ALLOW_INSECURE_PREVIEW || "").trim() === "1";

  const githubAppSlug = String(process.env.GITHUB_APP_SLUG || "").trim();
  const githubAppID = String(process.env.GITHUB_APP_ID || "").trim();
  const githubAppPrivateKeyRaw = String(process.env.GITHUB_APP_PRIVATE_KEY || "");
  const githubAppPrivateKey = normalizePrivateKey(githubAppPrivateKeyRaw);

  const tenantProvisionerURL = String(process.env.SPIKE_TENANT_PROVISIONER_URL || "").trim();
  const tenantProvisionerToken = String(process.env.SPIKE_TENANT_PROVISIONER_TOKEN || "").trim();

  return {
    appSessionSecret,
    cookieName: SESSION_COOKIE_NAME,
    sessionTtlSeconds: SESSION_TTL_SECONDS,

    defaultSpikeOrigin,
    defaultSpikeToken,
    defaultTreeID,

    defaultTenantID,
    defaultTenantName,

    googleClientID,
    googleClientSecret,

    magicLinkSecret,
    magicLinkTTLSeconds: Number.isFinite(magicLinkTTLSeconds) ? Math.max(300, Math.min(3600, Math.floor(magicLinkTTLSeconds))) : 900,
    magicFromEmail,
    magicResendAPIKey,
    magicAllowInsecurePreview,

    githubAppSlug,
    githubAppID,
    githubAppPrivateKey,

    tenantProvisionerURL,
    tenantProvisionerToken,
  };
}

function normalizePrivateKey(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }
  if (value.includes("-----BEGIN")) {
    return value.replace(/\\n/g, "\n");
  }
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (decoded.includes("-----BEGIN")) {
      return decoded;
    }
    return value;
  } catch {
    return value;
  }
}

function providersView(cfg) {
  return {
    google: {
      enabled: Boolean(cfg.googleClientID && cfg.googleClientSecret),
      reason: cfg.googleClientID && cfg.googleClientSecret ? "ready" : "missing_google_oauth_env",
    },
    magic_link: {
      enabled: Boolean(cfg.magicLinkSecret),
      email_delivery_enabled: Boolean(cfg.magicResendAPIKey && cfg.magicFromEmail),
      reason: cfg.magicLinkSecret ? "ready" : "missing_magic_link_secret",
    },
    github_app: {
      enabled: Boolean(cfg.githubAppSlug && cfg.githubAppID && cfg.githubAppPrivateKey),
      reason: cfg.githubAppSlug && cfg.githubAppID && cfg.githubAppPrivateKey ? "ready" : "missing_github_app_env",
    },
    tenant_provisioner: {
      enabled: Boolean(cfg.tenantProvisionerURL),
      reason: cfg.tenantProvisionerURL ? "ready" : "missing_tenant_provisioner_url",
    },
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

function sendJson(res, status, payload) {
  const text = `${JSON.stringify(payload)}\n`;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", String(Buffer.byteLength(text, "utf8")));
  res.end(text);
}

function sendRedirect(res, location) {
  res.statusCode = 302;
  res.setHeader("location", String(location || "/"));
  res.end();
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeOrigin(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    return "";
  }
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
}

function isMutationMethod(method) {
  const m = String(method || "").toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

function resolveExpectedBrowserOrigin(req) {
  const fromEnv = normalizeOrigin(process.env.SPIKE_WEB_ORIGIN || "");
  if (fromEnv) {
    return fromEnv;
  }
  const protoForwarded = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const proto = protoForwarded === "https" ? "https" : protoForwarded === "http" ? "http" : "https";
  const hostForwarded = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = hostForwarded || String(req.headers.host || "").trim();
  if (!host) {
    return "";
  }
  return `${proto}://${host}`.toLowerCase();
}

function resolvePublicBaseURL(req) {
  const explicit = String(process.env.SPIKE_WEB_ORIGIN || "").trim();
  if (explicit) {
    return trimTrailingSlash(explicit);
  }
  return trimTrailingSlash(resolveExpectedBrowserOrigin(req));
}

function enforceBrowserOrigin(req, res) {
  if (!isMutationMethod(req.method)) {
    return true;
  }
  const expectedOrigin = resolveExpectedBrowserOrigin(req);
  if (!expectedOrigin) {
    return true;
  }
  const origin = normalizeOrigin(req.headers.origin);
  const refererOrigin = normalizeOrigin(req.headers.referer);
  if (origin && origin !== expectedOrigin) {
    sendJson(res, 403, { ok: false, error: "origin_not_allowed" });
    return false;
  }
  if (!origin && refererOrigin && refererOrigin !== expectedOrigin) {
    sendJson(res, 403, { ok: false, error: "origin_not_allowed" });
    return false;
  }
  return true;
}

function sessionKey(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest();
}

function encodeSession(session, secret) {
  const iv = crypto.randomBytes(12);
  const key = sessionKey(secret);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(session || {});
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decodeSession(token, secret) {
  const packed = Buffer.from(String(token || ""), "base64url");
  if (packed.length <= 28) {
    return null;
  }
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const key = sessionKey(secret);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (forwardedProto === "https") {
    return true;
  }
  const host = String(req.headers.host || "").toLowerCase();
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

function setSessionCookie(req, res, cookieName, value, ttlSeconds) {
  const attrs = [
    `${cookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(ttlSeconds || 0))}`,
  ];
  if (isSecureRequest(req)) {
    attrs.push("Secure");
  }
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(req, res, cookieName) {
  const attrs = [
    `${cookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isSecureRequest(req)) {
    attrs.push("Secure");
  }
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function loadSession(req, cfg) {
  const cookies = parseCookies(req.headers.cookie);
  const token = String(cookies[cfg.cookieName] || "").trim();
  if (!token || !cfg.appSessionSecret) {
    return null;
  }
  try {
    const parsed = decodeSession(token, cfg.appSessionSecret);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistSession(req, res, cfg, session) {
  if (!cfg.appSessionSecret) {
    throw new Error("APP_SESSION_SECRET is required");
  }
  const token = encodeSession(session, cfg.appSessionSecret);
  setSessionCookie(req, res, cfg.cookieName, token, cfg.sessionTtlSeconds);
}

function sanitizeTenant(raw, cfg) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = String(raw.id || "").trim();
  const name = String(raw.name || "").trim();
  const origin = trimTrailingSlash(raw?.spike?.origin || "");
  const authToken = String(raw?.spike?.auth_token || "").trim();
  const treeID = String(raw?.spike?.tree_id || cfg.defaultTreeID || "oracle-deep").trim() || "oracle-deep";
  if (!id || !name || !origin || !authToken) {
    return null;
  }
  return {
    id,
    name,
    status: String(raw.status || "ready").trim() || "ready",
    spike: {
      origin,
      auth_token: authToken,
      tree_id: treeID,
    },
  };
}

function defaultTenant(cfg) {
  if (!cfg.defaultSpikeOrigin || !cfg.defaultSpikeToken) {
    return null;
  }
  return {
    id: cfg.defaultTenantID,
    name: cfg.defaultTenantName,
    status: "ready",
    spike: {
      origin: cfg.defaultSpikeOrigin,
      auth_token: cfg.defaultSpikeToken,
      tree_id: cfg.defaultTreeID,
    },
  };
}

function sessionTenants(session, cfg) {
  const rows = Array.isArray(session?.tenants) ? session.tenants : [];
  const mapped = rows.map((row) => sanitizeTenant(row, cfg)).filter(Boolean);
  const fallback = defaultTenant(cfg);
  if (mapped.length === 0 && fallback) {
    mapped.push(fallback);
  }
  return mapped;
}

function selectTenant(session, cfg) {
  const tenants = sessionTenants(session, cfg);
  const selectedID = String(session?.selected_tenant_id || "").trim();
  const selected = tenants.find((row) => row.id === selectedID) || tenants[0] || null;
  return {
    selected,
    tenants,
  };
}

function resolveSpikeConfig(session, cfg) {
  const { selected } = selectTenant(session, cfg);
  if (selected && selected.spike) {
    return {
      origin: trimTrailingSlash(selected.spike.origin),
      authToken: String(selected.spike.auth_token || "").trim(),
      treeID: String(selected.spike.tree_id || cfg.defaultTreeID || "oracle-deep").trim() || "oracle-deep",
      tenantID: selected.id,
      tenantName: selected.name,
    };
  }

  const stored = session?.spike || {};
  return {
    origin: trimTrailingSlash(stored.origin || cfg.defaultSpikeOrigin),
    authToken: String(stored.auth_token || cfg.defaultSpikeToken || "").trim(),
    treeID: String(stored.tree_id || cfg.defaultTreeID || "oracle-deep").trim() || "oracle-deep",
    tenantID: "",
    tenantName: "",
  };
}

function withTenantSelection(session, cfg, tenantID) {
  const targetID = String(tenantID || "").trim();
  const tenants = sessionTenants(session, cfg);
  const selected = tenants.find((row) => row.id === targetID);
  if (!selected) {
    return null;
  }
  return {
    ...session,
    tenants,
    selected_tenant_id: selected.id,
    spike: {
      origin: selected.spike.origin,
      auth_token: selected.spike.auth_token,
      tree_id: selected.spike.tree_id,
    },
  };
}

function providersStatus(cfg) {
  const providers = providersView(cfg);
  return {
    google_enabled: providers.google.enabled,
    magic_link_enabled: providers.magic_link.enabled,
    github_app_enabled: providers.github_app.enabled,
    tenant_provisioner_enabled: providers.tenant_provisioner.enabled,
  };
}

function publicSessionView(session, cfg) {
  const profile = session?.profile || null;
  const github = session?.github || null;
  const spike = resolveSpikeConfig(session, cfg);
  const tenant = selectTenant(session, cfg);

  return {
    authenticated: Boolean(profile),
    profile: profile
      ? {
          id: profile.id || "",
          display_name: profile.display_name || "",
          email: profile.email || "",
          avatar_url: profile.avatar_url || "",
          provider: profile.provider || "",
          created_at_ms: profile.created_at_ms || 0,
        }
      : null,
    providers: providersView(cfg),
    tenants: tenant.tenants.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
    })),
    selected_tenant_id: tenant.selected?.id || "",
    tenant: tenant.selected
      ? {
          id: tenant.selected.id,
          name: tenant.selected.name,
          status: tenant.selected.status,
        }
      : null,
    github: github
      ? {
          connected: Boolean(github.installation_id),
          installation_id: github.installation_id || "",
          installation_account_login: github.installation_account_login || "",
          install_completed_at_ms: github.install_completed_at_ms || 0,
        }
      : {
          connected: false,
        },
    spike: {
      connected: Boolean(spike.origin && spike.authToken),
      origin: spike.origin || "",
      tree_id: spike.treeID || cfg.defaultTreeID,
      has_token: Boolean(spike.authToken),
      tenant_id: spike.tenantID,
      tenant_name: spike.tenantName,
    },
  };
}

function requireSession(req, res, cfg) {
  const session = loadSession(req, cfg);
  if (!session || !session.profile) {
    sendJson(res, 401, { ok: false, error: "unauthenticated" });
    return null;
  }
  return session;
}

function parseResponseBody(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function callSpike(cfg, session, path, method, payload) {
  const spike = resolveSpikeConfig(session, cfg);
  if (!spike.origin || !spike.authToken) {
    return {
      ok: false,
      status: 400,
      body: { ok: false, error: "spike_not_configured" },
    };
  }
  const target = `${spike.origin}${path}`;
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${spike.authToken}`,
  };
  const reqMethod = String(method || "POST").toUpperCase();
  const resp = await fetch(target, {
    method: reqMethod,
    headers,
    body: reqMethod === "GET" || reqMethod === "HEAD" ? undefined : JSON.stringify(payload || {}),
  });
  const text = await resp.text();
  return {
    ok: resp.ok,
    status: resp.status,
    body: parseResponseBody(text),
  };
}

async function fetchJSON(url, options) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  const body = parseResponseBody(text);
  return {
    ok: resp.ok,
    status: resp.status,
    body,
  };
}

async function googleExchangeCode(cfg, code, redirectURI) {
  const body = new URLSearchParams();
  body.set("code", String(code || "").trim());
  body.set("client_id", cfg.googleClientID);
  body.set("client_secret", cfg.googleClientSecret);
  body.set("redirect_uri", redirectURI);
  body.set("grant_type", "authorization_code");
  return await fetchJSON("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

async function googleVerifyIDToken(idToken) {
  const endpoint = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(idToken || "").trim())}`;
  return await fetchJSON(endpoint, {
    method: "GET",
  });
}

function signMagicToken(secret, payload) {
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", String(secret || "")).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

function verifyMagicToken(secret, token) {
  const raw = String(token || "").trim();
  const [payloadB64, sig] = raw.split(".");
  if (!payloadB64 || !sig) {
    return null;
  }
  const expected = crypto.createHmac("sha256", String(secret || "")).update(payloadB64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }
  try {
    const payload = JSON.parse(fromBase64Url(payloadB64));
    const exp = Number(payload?.exp_ms || 0);
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function safeReturnPath(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "/?workspace=1#workspace";
  }
  if (!raw.startsWith("/")) {
    return "/?workspace=1#workspace";
  }
  if (raw.startsWith("//")) {
    return "/?workspace=1#workspace";
  }
  return raw;
}

async function sendMagicLinkEmail(cfg, to, link) {
  if (!cfg.magicResendAPIKey || !cfg.magicFromEmail) {
    return {
      ok: false,
      reason: "email_delivery_not_configured",
    };
  }
  const html = [
    `<p>Sign in to Spike.</p>`,
    `<p><a href="${link}">Open secure sign-in link</a></p>`,
    `<p>This link expires in ${Math.floor(cfg.magicLinkTTLSeconds / 60)} minutes.</p>`,
  ].join("");
  const resp = await fetchJSON("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.magicResendAPIKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.magicFromEmail,
      to: [to],
      subject: "Your Spike sign-in link",
      html,
    }),
  });
  return {
    ok: resp.ok,
    status: resp.status,
    body: resp.body,
  };
}

function createGitHubAppJWT(cfg) {
  if (!cfg.githubAppID || !cfg.githubAppPrivateKey) {
    throw new Error("github_app_not_configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: cfg.githubAppID,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign(cfg.githubAppPrivateKey).toString("base64url");
  return `${signingInput}.${sig}`;
}

async function githubInstallationToken(cfg, installationID) {
  const appJWT = createGitHubAppJWT(cfg);
  return await fetchJSON(`https://api.github.com/app/installations/${encodeURIComponent(String(installationID))}/access_tokens`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${appJWT}`,
      "user-agent": "spike-web",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({}),
  });
}

async function githubInstallationRepos(cfg, installationID, perPage = 100) {
  const tokenResp = await githubInstallationToken(cfg, installationID);
  if (!tokenResp.ok) {
    return tokenResp;
  }
  const token = String(tokenResp.body?.token || "").trim();
  const limit = Number.isFinite(perPage) ? Math.max(1, Math.min(100, perPage)) : 100;
  return await fetchJSON(`https://api.github.com/installation/repositories?per_page=${limit}`, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "spike-web",
      "x-github-api-version": "2022-11-28",
    },
  });
}

async function githubBranches(cfg, installationID, fullName) {
  const tokenResp = await githubInstallationToken(cfg, installationID);
  if (!tokenResp.ok) {
    return tokenResp;
  }
  const token = String(tokenResp.body?.token || "").trim();
  const repo = String(fullName || "").trim();
  return await fetchJSON(`https://api.github.com/repos/${repo}/branches?per_page=100`, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "spike-web",
      "x-github-api-version": "2022-11-28",
    },
  });
}

async function githubCommits(cfg, installationID, fullName, ref) {
  const tokenResp = await githubInstallationToken(cfg, installationID);
  if (!tokenResp.ok) {
    return tokenResp;
  }
  const token = String(tokenResp.body?.token || "").trim();
  const repo = String(fullName || "").trim();
  const sha = String(ref || "").trim();
  const url = new URL(`https://api.github.com/repos/${repo}/commits`);
  url.searchParams.set("per_page", "40");
  if (sha) {
    url.searchParams.set("sha", sha);
  }
  return await fetchJSON(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "spike-web",
      "x-github-api-version": "2022-11-28",
    },
  });
}

async function callProvisioner(cfg, payload) {
  if (!cfg.tenantProvisionerURL) {
    return {
      ok: false,
      status: 501,
      body: { ok: false, error: "tenant_provisioner_not_configured" },
    };
  }
  const headers = {
    "content-type": "application/json",
  };
  if (cfg.tenantProvisionerToken) {
    headers.authorization = `Bearer ${cfg.tenantProvisionerToken}`;
  }
  return await fetchJSON(cfg.tenantProvisionerURL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload || {}),
  });
}

module.exports = {
  envConfig,
  providersView,
  providersStatus,
  parseCookies,
  sendJson,
  sendRedirect,
  readJsonBody,
  enforceBrowserOrigin,
  resolvePublicBaseURL,
  loadSession,
  persistSession,
  clearSessionCookie,
  publicSessionView,
  sessionTenants,
  selectTenant,
  withTenantSelection,
  resolveSpikeConfig,
  requireSession,
  callSpike,
  fetchJSON,
  googleExchangeCode,
  googleVerifyIDToken,
  safeReturnPath,
  randomID,
  signMagicToken,
  verifyMagicToken,
  sendMagicLinkEmail,
  githubInstallationRepos,
  githubBranches,
  githubCommits,
  callProvisioner,
};
