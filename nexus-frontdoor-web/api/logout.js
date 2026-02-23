"use strict";

const {
  envConfig,
  parseCookies,
  clearSessionCookie,
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

  const cfg = envConfig();
  const cookies = parseCookies(req.headers.cookie);
  const sessionValue = cookies[cfg.appCookieName] || null;

  clearSessionCookie(res, cfg.appCookieName);

  if (!cfg.frontdoorOrigin) {
    sendJson(res, 200, { ok: true, note: "frontdoor origin not configured; local cookie cleared" });
    return;
  }

  try {
    const proxied = await proxyToFrontdoor({
      frontdoorOrigin: cfg.frontdoorOrigin,
      path: "/api/auth/logout",
      method: "POST",
      rawBody: "{}",
      contentType: "application/json",
      sessionCookieName: cfg.frontdoorCookieName,
      sessionCookieValue: sessionValue,
    });
    const bodyText = await proxied.text();
    passthroughJson(res, proxied, bodyText || '{"ok":true}');
  } catch (error) {
    sendJson(res, 200, { ok: true, warning: "frontdoor logout failed", detail: String(error) });
  }
};
