"use strict";

const {
  envConfig,
  enforceBrowserOrigin,
  requireSession,
  readJsonBody,
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

  const jobID = String(body.job_id || "").trim();
  if (!jobID) {
    return sendJson(res, 400, { ok: false, error: "job_id_required" });
  }

  const spikeResp = await callSpike(cfg, session, "/jobs/get", "POST", { job_id: jobID });
  return sendJson(res, spikeResp.status, {
    ok: spikeResp.ok,
    spike_status: spikeResp.status,
    body: spikeResp.body,
  });
};
