"use strict";

const {
  envConfig,
  parseCookies,
  sendJson,
  proxyToFrontdoor,
  passthroughJson,
} = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  const cfg = envConfig();
  if (!cfg.frontdoorOrigin) {
    sendJson(res, 500, { ok: false, error: "missing FRONTDOOR_ORIGIN" });
    return;
  }
  const parsed = new URL(req.url || "/api/workspace-usage", "http://localhost");
  const workspaceId = (parsed.searchParams.get("workspace_id") || "").trim();
  if (!workspaceId) {
    sendJson(res, 400, { ok: false, error: "missing_workspace_id" });
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  const sessionValue = cookies[cfg.appCookieName] || null;
  if (!sessionValue) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  try {
    const proxied = await proxyToFrontdoor({
      frontdoorOrigin: cfg.frontdoorOrigin,
      path: `/api/workspaces/${encodeURIComponent(workspaceId)}/usage`,
      method: "GET",
      sessionCookieName: cfg.frontdoorCookieName,
      sessionCookieValue: sessionValue,
    });
    const bodyText = await proxied.text();
    passthroughJson(res, proxied, bodyText);
  } catch (error) {
    sendJson(res, 502, { ok: false, error: "frontdoor_unreachable", detail: String(error) });
  }
};
