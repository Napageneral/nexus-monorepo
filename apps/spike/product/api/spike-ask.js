"use strict";

const {
  envConfig,
  enforceBrowserOrigin,
  requireSession,
  readJsonBody,
  resolveSpikeConfig,
  callSpike,
  sendJson,
} = require("./_shared");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, error: "method_not_allowed" });
  }
  if (!enforceBrowserOrigin(req, res)) {
    return;
  }

  const cfg = envConfig();
  const session = requireSession(req, res, cfg);
  if (!session) {
    return;
  }

  const body = await readJsonBody(req);
  if (body === null || typeof body !== "object") {
    return sendJson(res, 400, { ok: false, error: "invalid_json" });
  }

  const query = String(body.query || "").trim();
  if (!query) {
    return sendJson(res, 400, { ok: false, error: "query_required" });
  }
  const spike = resolveSpikeConfig(session, cfg);
  const treeID = String(body.tree_id || spike.treeID || cfg.defaultTreeID).trim();
  if (!treeID) {
    return sendJson(res, 400, { ok: false, error: "tree_id_required" });
  }

  const spikeResp = await callSpike(cfg, session, "/ask", "POST", {
    tree_id: treeID,
    query,
  });

  return sendJson(res, spikeResp.status, {
    ok: spikeResp.ok,
    spike_status: spikeResp.status,
    body: spikeResp.body,
  });
};
