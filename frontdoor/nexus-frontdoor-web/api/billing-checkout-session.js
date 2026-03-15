"use strict";

const {
  envConfig,
  parseCookies,
  readRawBody,
  enforceBrowserOrigin,
  sendJson,
  proxyToFrontdoor,
  passthroughJson,
} = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  if (!enforceBrowserOrigin(req, res)) {
    return;
  }
  const cfg = envConfig();
  if (!cfg.frontdoorOrigin) {
    sendJson(res, 500, { ok: false, error: "missing FRONTDOOR_ORIGIN" });
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  const sessionValue = cookies[cfg.appCookieName] || null;
  if (!sessionValue) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  let body = {};
  try {
    body = JSON.parse((await readRawBody(req)) || "{}");
  } catch {
    body = {};
  }
  const workspaceId = String(body.workspace_id || "").trim();
  if (!workspaceId) {
    sendJson(res, 400, { ok: false, error: "missing_workspace_id" });
    return;
  }
  try {
    const proxied = await proxyToFrontdoor({
      frontdoorOrigin: cfg.frontdoorOrigin,
      path: `/api/billing/${encodeURIComponent(workspaceId)}/checkout-session`,
      method: "POST",
      rawBody: JSON.stringify({
        plan_id: body.plan_id,
        price_id: body.price_id,
        success_url: body.success_url,
        cancel_url: body.cancel_url,
      }),
      contentType: "application/json",
      sessionCookieName: cfg.frontdoorCookieName,
      sessionCookieValue: sessionValue,
    });
    const bodyText = await proxied.text();
    passthroughJson(res, proxied, bodyText);
  } catch (error) {
    sendJson(res, 502, { ok: false, error: "frontdoor_unreachable", detail: String(error) });
  }
};
