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
  try {
    const rawBody = await readRawBody(req);
    const proxied = await proxyToFrontdoor({
      frontdoorOrigin: cfg.frontdoorOrigin,
      path: "/api/runtime/token/refresh",
      method: "POST",
      rawBody: rawBody || "{}",
      contentType: req.headers["content-type"] || "application/json",
      sessionCookieName: cfg.frontdoorCookieName,
      sessionCookieValue: sessionValue,
    });
    const bodyText = await proxied.text();
    passthroughJson(res, proxied, bodyText);
  } catch (error) {
    sendJson(res, 502, { ok: false, error: "frontdoor_unreachable", detail: String(error) });
  }
};
