"use strict";

const {
  envConfig,
  readRawBody,
  enforceBrowserOrigin,
  getSetCookieHeaders,
  extractCookieValueFromSetCookie,
  setSessionCookie,
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

  try {
    const rawBody = await readRawBody(req);
    const proxied = await proxyToFrontdoor({
      frontdoorOrigin: cfg.frontdoorOrigin,
      path: "/api/auth/login",
      method: "POST",
      rawBody,
      contentType: req.headers["content-type"] || "application/json",
      sessionCookieName: cfg.frontdoorCookieName,
    });
    const bodyText = await proxied.text();
    const setCookieHeaders = getSetCookieHeaders(proxied);
    const sessionValue = extractCookieValueFromSetCookie(setCookieHeaders, cfg.frontdoorCookieName);
    if (proxied.ok && sessionValue) {
      setSessionCookie(res, cfg.appCookieName, sessionValue, cfg.sessionTtlSeconds);
    }
    passthroughJson(res, proxied, bodyText);
  } catch (error) {
    sendJson(res, 502, { ok: false, error: "frontdoor_unreachable", detail: String(error) });
  }
};
