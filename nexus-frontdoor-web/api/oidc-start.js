"use strict";

const { envConfig, sendJson } = require("./_shared");

function normalizeQueryToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(normalized)) {
    return "";
  }
  return normalized;
}

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
  const provider = normalizeQueryToken(parsed.searchParams.get("provider")) || "google";
  const flavor = normalizeQueryToken(parsed.searchParams.get("flavor"));
  const product = normalizeQueryToken(parsed.searchParams.get("product")) || flavor;
  const returnToRaw = parsed.searchParams.get("return_to");
  const returnTo = (returnToRaw || "/app/").trim() || "/app/";

  const redirect = new URL("/api/auth/oidc/start", cfg.frontdoorOrigin);
  redirect.searchParams.set("provider", provider);
  redirect.searchParams.set("return_to", returnTo);
  if (product) {
    redirect.searchParams.set("product", product);
  }
  if (flavor) {
    redirect.searchParams.set("flavor", flavor);
  }
  res.statusCode = 302;
  res.setHeader("Location", redirect.toString());
  res.end();
};
