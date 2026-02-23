"use strict";

const { envConfig, sendJson } = require("./_shared");

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

  const parsed = new URL(req.url || "/api/oidc-start", "http://localhost");
  const providerRaw = parsed.searchParams.get("provider");
  const provider = (providerRaw || "google").trim().toLowerCase();
  const returnToRaw = parsed.searchParams.get("return_to");
  const returnTo = (returnToRaw || "/app/").trim() || "/app/";

  const redirect = new URL("/api/auth/oidc/start", cfg.frontdoorOrigin);
  redirect.searchParams.set("provider", provider);
  redirect.searchParams.set("return_to", returnTo);
  res.statusCode = 302;
  res.setHeader("Location", redirect.toString());
  res.end();
};
