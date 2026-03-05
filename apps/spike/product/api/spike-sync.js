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

function normalizeRef(input) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }
  if (value.startsWith("refs/")) {
    return value;
  }
  return `refs/heads/${value.replace(/^heads\//, "")}`;
}

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

  const spike = resolveSpikeConfig(session, cfg);
  const treeID = String(body.tree_id || spike.treeID || cfg.defaultTreeID).trim();
  const repoID = String(body.repo_id || body.repo_full_name || "").trim().toLowerCase();
  const remoteURL = String(body.remote_url || "").trim();
  const ref = normalizeRef(body.ref);

  if (!treeID) {
    return sendJson(res, 400, { ok: false, error: "tree_id_required" });
  }
  if (!repoID) {
    return sendJson(res, 400, { ok: false, error: "repo_id_required" });
  }
  if (!remoteURL) {
    return sendJson(res, 400, { ok: false, error: "remote_url_required" });
  }
  if (!ref) {
    return sendJson(res, 400, { ok: false, error: "ref_required" });
  }

  const spikeResp = await callSpike(cfg, session, "/sync", "POST", {
    tree_id: treeID,
    hydrate: true,
    repo_id: repoID,
    remote_url: remoteURL,
    ref,
  });

  return sendJson(res, spikeResp.status, {
    ok: spikeResp.ok,
    spike_status: spikeResp.status,
    body: spikeResp.body,
  });
};
