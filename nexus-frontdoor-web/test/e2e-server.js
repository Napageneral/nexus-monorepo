"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { createServer } = require("node:http");

const SHELL_PORT = 4310;
const FRONTDOOR_PORT = 4311;
const SHELL_ORIGIN = `http://127.0.0.1:${SHELL_PORT}`;
const FRONTDOOR_ORIGIN = `http://127.0.0.1:${FRONTDOOR_PORT}`;
const SESSION_COOKIE = "nexus_fd_session";

process.env.FRONTDOOR_ORIGIN = FRONTDOOR_ORIGIN;
process.env.FRONTDOOR_WEB_ORIGIN = SHELL_ORIGIN;
process.env.FRONTDOOR_SESSION_COOKIE_NAME = SESSION_COOKIE;
process.env.APP_SESSION_COOKIE_NAME = SESSION_COOKIE;
process.env.APP_SESSION_TTL_SECONDS = "3600";

const sessions = new Map([
  [
    "sid-owner",
    {
      user_id: "u-owner",
      entity_id: "ent-owner",
      username: "owner",
      display_name: "Owner User",
      email: "owner@example.com",
      tenant_id: "tenant-dev",
      roles: ["workspace_owner"],
      scopes: ["runtime.connect", "workspace.read", "workspace.select"],
      active_workspace_id: "tenant-dev",
    },
  ],
  [
    "sid-operator",
    {
      user_id: "u-operator",
      entity_id: "ent-operator",
      username: "operator",
      display_name: "Operator User",
      email: "operator@example.com",
      tenant_id: "tenant-dev",
      roles: ["operator"],
      scopes: ["*", "operator.admin"],
      active_workspace_id: "tenant-dev",
    },
  ],
  [
    "sid-member",
    {
      user_id: "u-member",
      entity_id: "ent-member",
      username: "member",
      display_name: "Member User",
      email: "member@example.com",
      tenant_id: "tenant-dev",
      roles: ["workspace_member"],
      scopes: ["runtime.connect", "workspace.read"],
      active_workspace_id: "tenant-dev",
    },
  ],
  [
    "sid-provisioning",
    {
      user_id: "u-provisioning",
      entity_id: "ent-provisioning",
      username: "provisioning",
      display_name: "Provisioning User",
      email: "provisioning@example.com",
      tenant_id: "",
      roles: ["workspace_owner"],
      scopes: ["runtime.connect", "workspace.read", "workspace.select"],
      active_workspace_id: "",
    },
  ],
  [
    "sid-noapp",
    {
      user_id: "u-noapp",
      entity_id: "ent-noapp",
      username: "noapp",
      display_name: "No App User",
      email: "noapp@example.com",
      tenant_id: "tenant-noapp",
      roles: ["workspace_owner"],
      scopes: ["runtime.connect", "workspace.read", "workspace.select"],
      active_workspace_id: "tenant-noapp",
    },
  ],
  [
    "sid-runtime-down",
    {
      user_id: "u-runtime-down",
      entity_id: "ent-runtime-down",
      username: "runtime-down",
      display_name: "Runtime Down User",
      email: "runtime-down@example.com",
      tenant_id: "tenant-runtime-down",
      roles: ["workspace_owner"],
      scopes: ["runtime.connect", "workspace.read", "workspace.select"],
      active_workspace_id: "tenant-runtime-down",
    },
  ],
]);

const workspaceItems = [
  {
    workspace_id: "tenant-dev",
    display_name: "Tenant Dev",
    role: "workspace_owner",
    is_default: true,
  },
  {
    workspace_id: "tenant-ops",
    display_name: "Tenant Ops",
    role: "workspace_owner",
    is_default: false,
  },
];

function sessionIdFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return String(cookies[SESSION_COOKIE] || "").trim();
}

function workspacesForSessionId(sessionId) {
  if (sessionId === "sid-provisioning") {
    return [];
  }
  if (sessionId === "sid-noapp") {
    return [
      {
        workspace_id: "tenant-noapp",
        display_name: "Tenant No App",
        role: "workspace_owner",
        is_default: true,
      },
    ];
  }
  if (sessionId === "sid-runtime-down") {
    return [
      {
        workspace_id: "tenant-runtime-down",
        display_name: "Tenant Runtime Down",
        role: "workspace_owner",
        is_default: true,
      },
    ];
  }
  return workspaceItems;
}

const workspaceBilling = new Map([
  [
    "tenant-dev",
    {
      provider: "stripe",
      plan_id: "pro",
      status: "active",
      customer_id: "cus_demo_dev",
      subscription_id: "sub_demo_dev",
      period_start_ms: Date.UTC(2026, 1, 1),
      period_end_ms: Date.UTC(2026, 2, 1) - 1,
      limits: {
        max_members: 25,
        max_monthly_tokens: 10_000_000,
        max_adapters: 20,
        max_concurrent_sessions: 16,
      },
      invoices: [
        {
          invoice_id: "in_dev_1",
          provider: "stripe",
          status: "paid",
          amount_due: 4200,
          currency: "usd",
          hosted_invoice_url: "https://billing.example.com/in_dev_1",
          created_at_ms: Date.UTC(2026, 1, 2),
          paid_at_ms: Date.UTC(2026, 1, 2, 0, 5),
        },
      ],
    },
  ],
  [
    "tenant-ops",
    {
      provider: "stripe",
      plan_id: "starter",
      status: "active",
      customer_id: "cus_demo_ops",
      subscription_id: "sub_demo_ops",
      period_start_ms: Date.UTC(2026, 1, 1),
      period_end_ms: Date.UTC(2026, 2, 1) - 1,
      limits: {
        max_members: 10,
        max_monthly_tokens: 1_000_000,
        max_adapters: 20,
        max_concurrent_sessions: 16,
      },
      invoices: [],
    },
  ],
]);

function parseCookies(raw) {
  const out = {};
  for (const entry of String(raw || "").split(";")) {
    const [keyRaw, ...valueParts] = entry.split("=");
    const key = String(keyRaw || "").trim();
    if (!key) {
      continue;
    }
    out[key] = decodeURIComponent(valueParts.join("=").trim());
  }
  return out;
}

function sendJson(res, status, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("content-length", String(Buffer.byteLength(body, "utf8")));
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) {
    return null;
  }
  return sessions.get(sid) || null;
}

async function frontdoorHandler(req, res) {
  const parsed = new URL(req.url || "/", FRONTDOOR_ORIGIN);
  const pathname = parsed.pathname;
  const method = (req.method || "GET").toUpperCase();

  if (method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "mock-frontdoor" });
    return;
  }
  if (method === "GET" && pathname === "/runtime/health") {
    sendJson(res, 200, { ok: true, runtime: "tenant-dev", status: "healthy" });
    return;
  }
  if (method === "GET" && pathname === "/runtime/api/apps") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const workspaceId = String(parsed.searchParams.get("workspace_id") || session.active_workspace_id || "").trim();
    if (workspaceId === "tenant-runtime-down") {
      sendJson(res, 503, { ok: false, error: "nex_runtime_unavailable" });
      return;
    }
    if (workspaceId === "tenant-noapp") {
      sendJson(res, 200, { ok: true, items: [] });
      return;
    }
    const items = [
      {
        app_id: "control",
        display_name: "Control",
        entry_path: "/app/control/chat",
        api_base: "/api/control",
        icon: "control-panel",
        order: 10,
      },
    ];
    if (workspaceId === "tenant-ops") {
      items.push({
        app_id: "oracle",
        display_name: "Oracle",
        entry_path: "/app/oracle/",
        api_base: "/api/oracle",
        icon: "tree",
        order: 20,
      });
      items.push({
        app_id: "glowbot",
        display_name: "GlowBot",
        entry_path: "/app/glowbot/",
        api_base: "/api/glowbot",
        icon: "spark",
        order: 30,
      });
      items.push({
        app_id: "spike",
        display_name: "Spike",
        entry_path: "/app/spike/",
        api_base: "/api/spike",
        icon: "bolt",
        order: 40,
      });
    }
    sendJson(res, 200, { ok: true, items });
    return;
  }
  if (method === "GET" && pathname === "/api/auth/session") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 200, { authenticated: false });
      return;
    }
    sendJson(res, 200, {
      authenticated: true,
      ...session,
    });
    return;
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("set-cookie", `${SESSION_COOKIE}=sid-operator; Path=/; HttpOnly; SameSite=Lax`);
    res.end('{"ok":true,"authenticated":true}\n');
    return;
  }
  if (method === "POST" && pathname === "/api/auth/logout") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("set-cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.end('{"ok":true}\n');
    return;
  }
  if (method === "GET" && pathname === "/api/workspaces") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const sessionId = sessionIdFromRequest(req);
    const items = workspacesForSessionId(sessionId);
    const activeWorkspaceId = items.some((item) => item.workspace_id === session.active_workspace_id)
      ? session.active_workspace_id
      : "";
    sendJson(res, 200, {
      ok: true,
      active_workspace_id: activeWorkspaceId,
      items,
    });
    return;
  }
  if (method === "GET" && pathname === "/api/workspaces/provisioning/status") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const sessionId = sessionIdFromRequest(req);
    if (sessionId === "sid-provisioning") {
      sendJson(res, 200, {
        ok: true,
        status: "running",
        request: {
          request_id: "req-provisioning-1",
          status: "running",
          stage: "tenant_bootstrap",
          error: null,
          tenant_id: null,
          updated_at_ms: Date.now(),
        },
      });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      status: "none",
      request: null,
    });
    return;
  }
  if (method === "POST" && pathname === "/api/workspaces/select") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const raw = await readBody(req);
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
    const nextId = String(body.workspace_id || "").trim();
    if (!nextId) {
      sendJson(res, 400, { ok: false, error: "workspace_id_required" });
      return;
    }
    session.active_workspace_id = nextId;
    sendJson(res, 200, {
      ok: true,
      active_workspace_id: nextId,
    });
    return;
  }
  if (method === "POST" && pathname === "/api/invites/redeem") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }
  if (method === "GET" && pathname === "/api/operator/workspaces") {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    if (!Array.isArray(session.roles) || !session.roles.includes("operator")) {
      sendJson(res, 403, { ok: false, error: "operator_forbidden" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      total_workspaces: workspaceItems.length,
      items: workspaceItems.map((item) => ({
        workspace_id: item.workspace_id,
        display_name: item.display_name,
        workspace_slug: item.workspace_id,
        status: "active",
        runtime_public_base_url: FRONTDOOR_ORIGIN,
        member_count: item.workspace_id === "tenant-dev" ? 3 : 2,
        usage_30d: {
          requests_total: item.workspace_id === "tenant-dev" ? 124 : 58,
          tokens_in: item.workspace_id === "tenant-dev" ? 11000 : 4000,
          tokens_out: item.workspace_id === "tenant-dev" ? 9800 : 3200,
          active_members: item.workspace_id === "tenant-dev" ? 3 : 2,
        },
        billing: {
          plan_id: item.workspace_id === "tenant-dev" ? "pro" : "starter",
          status: "active",
          provider: "stripe",
        },
      })),
    });
    return;
  }
  const launchDiagnosticsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/launch-diagnostics$/);
  if (method === "GET" && launchDiagnosticsMatch) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const workspaceId = decodeURIComponent(launchDiagnosticsMatch[1] || "").trim();
    if (!workspaceId) {
      sendJson(res, 400, { ok: false, error: "missing_workspace_id" });
      return;
    }
    if (workspaceId === "tenant-noapp") {
      sendJson(res, 200, {
        ok: true,
        workspace_id: workspaceId,
        launch_ready: false,
        provisioning: null,
        runtime_health: {
          ok: true,
          http_status: 200,
          error: null,
          body: { ok: true, status: "healthy" },
        },
        app_catalog: {
          ok: true,
          http_status: 200,
          error: null,
          app_count: 0,
          items: [],
        },
      });
      return;
    }
    if (workspaceId === "tenant-runtime-down") {
      sendJson(res, 200, {
        ok: true,
        workspace_id: workspaceId,
        launch_ready: false,
        provisioning: null,
        runtime_health: {
          ok: false,
          http_status: 503,
          error: "nex_runtime_unavailable",
          body: null,
        },
        app_catalog: {
          ok: false,
          http_status: 503,
          error: "nex_runtime_unavailable",
          app_count: 0,
          items: [],
        },
      });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      workspace_id: workspaceId,
      launch_ready: true,
      provisioning: null,
      runtime_health: {
        ok: true,
        http_status: 200,
        error: null,
        body: { ok: true, status: "healthy" },
      },
      app_catalog: {
        ok: true,
        http_status: 200,
        error: null,
        app_count: workspaceId === "tenant-ops" ? 4 : 1,
        items:
          workspaceId === "tenant-ops"
            ? [
                { app_id: "control", entry_path: "/app/control/chat" },
                { app_id: "oracle", entry_path: "/app/oracle/" },
                { app_id: "glowbot", entry_path: "/app/glowbot/" },
                { app_id: "spike", entry_path: "/app/spike/" },
              ]
            : [{ app_id: "control", entry_path: "/app/control/chat" }],
      },
    });
    return;
  }
  const usageMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/usage$/);
  if (method === "GET" && usageMatch) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const workspaceId = decodeURIComponent(usageMatch[1] || "");
    if (!workspaceItems.some((item) => item.workspace_id === workspaceId)) {
      sendJson(res, 403, { ok: false, error: "workspace_not_authorized" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      workspace_id: workspaceId,
      window_days: 30,
      requests_total: workspaceId === "tenant-dev" ? 124 : 58,
      tokens_in: workspaceId === "tenant-dev" ? 11000 : 4000,
      tokens_out: workspaceId === "tenant-dev" ? 9800 : 3200,
      active_members: workspaceId === "tenant-dev" ? 3 : 2,
      days_with_data: 7,
    });
    return;
  }
  const billingMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/billing\/summary$/);
  if (method === "GET" && billingMatch) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const workspaceId = decodeURIComponent(billingMatch[1] || "");
    const isAdmin =
      Array.isArray(session.roles) &&
      (session.roles.includes("operator") ||
        session.roles.includes("workspace_owner") ||
        session.roles.includes("workspace_admin"));
    if (!isAdmin) {
      sendJson(res, 403, { ok: false, error: "billing_forbidden" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      workspace_id: workspaceId,
      billing: {
        plan_id: workspaceId === "tenant-dev" ? "pro" : "starter",
        status: "active",
        provider: "stripe",
        customer_id: "cus_demo",
        subscription_id: "sub_demo",
        period_start_ms: Date.UTC(2026, 1, 1),
        period_end_ms: Date.UTC(2026, 2, 1) - 1,
      },
      limits: {
        max_members: workspaceId === "tenant-dev" ? 25 : 10,
        max_monthly_tokens: workspaceId === "tenant-dev" ? 10_000_000 : 1_000_000,
        max_adapters: 20,
        max_concurrent_sessions: 16,
      },
      usage_30d: {
        requests_total: workspaceId === "tenant-dev" ? 124 : 58,
        tokens_in: workspaceId === "tenant-dev" ? 11000 : 4000,
        tokens_out: workspaceId === "tenant-dev" ? 9800 : 3200,
        active_members: workspaceId === "tenant-dev" ? 3 : 2,
      },
    });
    return;
  }
  const billingSubscriptionMatch = pathname.match(/^\/api\/billing\/([^/]+)\/subscription$/);
  if (method === "GET" && billingSubscriptionMatch) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const workspaceId = decodeURIComponent(billingSubscriptionMatch[1] || "");
    const billing = workspaceBilling.get(workspaceId);
    if (!billing) {
      sendJson(res, 404, { ok: false, error: "workspace_not_found" });
      return;
    }
    const isAdmin =
      Array.isArray(session.roles) &&
      (session.roles.includes("operator") ||
        session.roles.includes("workspace_owner") ||
        session.roles.includes("workspace_admin"));
    if (!isAdmin) {
      sendJson(res, 403, { ok: false, error: "billing_forbidden" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      workspace_id: workspaceId,
      provider: billing.provider,
      plan_id: billing.plan_id,
      status: billing.status,
      customer_id: billing.customer_id,
      subscription_id: billing.subscription_id,
      period_start_ms: billing.period_start_ms,
      period_end_ms: billing.period_end_ms,
      limits: billing.limits,
    });
    return;
  }
  const billingInvoicesMatch = pathname.match(/^\/api\/billing\/([^/]+)\/invoices$/);
  if (method === "GET" && billingInvoicesMatch) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const workspaceId = decodeURIComponent(billingInvoicesMatch[1] || "");
    const billing = workspaceBilling.get(workspaceId);
    if (!billing) {
      sendJson(res, 404, { ok: false, error: "workspace_not_found" });
      return;
    }
    const isAdmin =
      Array.isArray(session.roles) &&
      (session.roles.includes("operator") ||
        session.roles.includes("workspace_owner") ||
        session.roles.includes("workspace_admin"));
    if (!isAdmin) {
      sendJson(res, 403, { ok: false, error: "billing_forbidden" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      workspace_id: workspaceId,
      items: billing.invoices,
    });
    return;
  }
  const billingCheckoutMatch = pathname.match(/^\/api\/billing\/([^/]+)\/checkout-session$/);
  if (method === "POST" && billingCheckoutMatch) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const workspaceId = decodeURIComponent(billingCheckoutMatch[1] || "");
    const isAdmin =
      Array.isArray(session.roles) &&
      (session.roles.includes("operator") ||
        session.roles.includes("workspace_owner") ||
        session.roles.includes("workspace_admin"));
    if (!isAdmin) {
      sendJson(res, 403, { ok: false, error: "billing_forbidden" });
      return;
    }
    const raw = await readBody(req);
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
    const planId = String(body.plan_id || "starter").trim() || "starter";
    const billing = workspaceBilling.get(workspaceId);
    if (billing) {
      billing.plan_id = planId;
    }
    sendJson(res, 200, {
      ok: true,
      workspace_id: workspaceId,
      provider: "mock",
      session_id: `cs_mock_${workspaceId}`,
      checkout_url: `${FRONTDOOR_ORIGIN}/mock-checkout?workspace_id=${encodeURIComponent(
        workspaceId,
      )}&plan_id=${encodeURIComponent(planId)}`,
      expires_at_ms: Date.now() + 10 * 60 * 1000,
    });
    return;
  }
  if (method === "GET" && pathname.startsWith("/app/")) {
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html><body><h1>Mock Runtime App</h1><p>${pathname}</p></body></html>`);
    return;
  }
  sendJson(res, 404, { ok: false, error: "not_found", path: pathname });
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  return "application/octet-stream";
}

async function shellHandler(req, res) {
  const parsed = new URL(req.url || "/", SHELL_ORIGIN);
  const pathname = parsed.pathname;

  if (pathname.startsWith("/runtime/")) {
    await frontdoorHandler(req, res);
    return;
  }

  if (pathname.startsWith("/api/")) {
    const name = pathname.slice("/api/".length);
    if (!name) {
      sendJson(res, 404, { ok: false, error: "api_not_found" });
      return;
    }
    const handlerPath = path.join(__dirname, "..", "api", `${name}.js`);
    if (!fs.existsSync(handlerPath)) {
      sendJson(res, 404, { ok: false, error: "api_not_found", path: pathname });
      return;
    }
    delete require.cache[require.resolve(handlerPath)];
    const handler = require(handlerPath);
    await handler(req, res);
    return;
  }

  const relative = pathname === "/" ? "/index.html" : pathname;
  const safe = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(__dirname, "..", safe);
  if (!filePath.startsWith(path.join(__dirname, ".."))) {
    sendJson(res, 403, { ok: false, error: "forbidden_path" });
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendJson(res, 404, { ok: false, error: "not_found", path: pathname });
    return;
  }
  const bytes = fs.readFileSync(filePath);
  res.statusCode = 200;
  res.setHeader("content-type", contentTypeFor(filePath));
  res.setHeader("content-length", String(bytes.byteLength));
  res.end(bytes);
}

const frontdoorServer = createServer((req, res) => {
  Promise.resolve(frontdoorHandler(req, res)).catch((error) => {
    sendJson(res, 500, { ok: false, error: "frontdoor_handler_error", detail: String(error) });
  });
});
const shellServer = createServer((req, res) => {
  Promise.resolve(shellHandler(req, res)).catch((error) => {
    sendJson(res, 500, { ok: false, error: "shell_handler_error", detail: String(error) });
  });
});

async function listen(server, port, name) {
  await new Promise((resolve, reject) => {
    server.listen(port, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  process.stdout.write(`[e2e-server] ${name} listening on ${port}\n`);
}

async function close(server, name) {
  await new Promise((resolve) => {
    server.close(() => resolve());
  });
  process.stdout.write(`[e2e-server] ${name} closed\n`);
}

async function main() {
  await listen(frontdoorServer, FRONTDOOR_PORT, "frontdoor");
  await listen(shellServer, SHELL_PORT, "shell");
}

main().catch((error) => {
  process.stderr.write(`[e2e-server] startup failure: ${String(error?.stack || error)}\n`);
  process.exit(1);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await close(shellServer, "shell");
  await close(frontdoorServer, "frontdoor");
  process.exit(0);
}

process.on("SIGTERM", () => {
  shutdown().catch(() => process.exit(1));
});
process.on("SIGINT", () => {
  shutdown().catch(() => process.exit(1));
});
