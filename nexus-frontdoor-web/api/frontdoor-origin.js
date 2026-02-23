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
  sendJson(res, 200, {
    ok: true,
    frontdoor_origin: cfg.frontdoorOrigin,
    app_url: `${cfg.frontdoorOrigin}/app/`,
  });
};
